import { analyzeSecurityStandard } from './ss-rules.js';
import { LEFTISH, MIN_IMG_EMU, NO_SARABUN_GLYPH, PLACEHOLDER, SARABUN, SYMBOL_FONT, TOC_KIND, charFmt, paraModel, readNumbering, readStyles, tableModel } from './model.js';
import { NS_PIC, NS_WP, att, inCell, inFallback, inTextbox, ownerP, upTo, wAll, wKid, wKids } from './xml.js';
import { checkFileNameRules, resultSet } from '../result.js';
import { findSecrets, redactText } from '../secrets.js';
import { TH_CH, cm, egs, pt, snip, verCmp } from '../text.js';
import { parseThaiDate, toBE } from '../../utils/thai-date.js';

/* xml: {document, styles, theme, headers:[], footers:[]} as parsed XML documents
   opts: {code, name, fileName, meeting} */
export function analyzeDocx(xml, opts){
  const rs = resultSet(), {R, set, hint, tip} = rs;
  const S = readStyles(xml.styles, xml.theme);
  const N = readNumbering(xml.numbering);
  const body = xml.document && wAll(xml.document.documentElement, 'body')[0];
  if (!body) throw new Error('ไม่พบเนื้อหาในไฟล์ (word/document.xml)');
  const {fileVer, fileDate} = checkFileNameRules(rs, opts);

  /* --- models --- */
  const blocks = [];
  (function walk(el){ wKids(el).forEach(c => { if (c.localName === 'p' || c.localName === 'tbl') blocks.push(c); else if (c.localName === 'sdt') walk(wKid(c, 'sdtContent')); else if (c.localName === 'customXml') walk(c); }); })(body);
  const models = new Map();
  const M = p => models.get(p) || (models.set(p, paraModel(p, S)), models.get(p));
  const tables = new Map();
  blocks.forEach(b => { if (b.localName === 'tbl') { const t = tableModel(b, S); tables.set(b, t); t.rows.forEach(r => r.forEach(c => c.forEach(m => models.set(m.el, m)))); } });
  const allBodyP = wAll(body, 'p').filter(p => !inFallback(p)).map(M);
  const hdr = (xml.headers || []).map(d => wAll(d.documentElement, 'p').filter(p => !inFallback(p)).map(p => paraModel(p, S)));
  const ftr = (xml.footers || []).map(d => wAll(d.documentElement, 'p').filter(p => !inFallback(p)).map(p => paraModel(p, S)));
  const hdrP = [].concat(...hdr), ftrP = [].concat(...ftr);

  // cover page = everything before the first page or section break (only for documents that have a cover)
  const cover = new Set();
  if (opts.long) {
    for (const b of blocks) {
      if (b.localName === 'p' && M(b).pp.pbb && cover.size) break;
      (b.localName === 'p' ? [b] : wAll(b, 'p')).forEach(p => cover.add(p));
      if (b.localName === 'p' && (wAll(b, 'br').some(x => att(x, 'type') === 'page') || wKid(wKid(b, 'pPr'), 'sectPr'))) break;
    }
    if (cover.size === blocks.length) cover.clear();
  }
  const isToc = m => /^toc|table of figures/.test(m.style);
  const isCaption = m => m.style === 'caption' || /^(ภาพ|ตาราง)\s*\d/.test(m.text.trim());
  const isBody = m => !cover.has(m.el) && m.lvl == null && !inCell(m.el) && !inTextbox(m.el) && !isToc(m) && !/^(title|subtitle)$/.test(m.style) && m.text.trim();
  const headings = lvl => allBodyP.filter(m => m.lvl === lvl && !cover.has(m.el) && !inCell(m.el) && !inTextbox(m.el) && m.text.trim());

  /* --- page size and margins (DS ข้อ 1) --- */
  const sects = wAll(body, 'sectPr').filter(s => !inFallback(s) && !upTo(s, a => a.localName === 'sectPrChange'));
  if (sects.length) {
    const lab = i => sects.length > 1 ? `ส่วนที่ ${i + 1}: ` : '';
    const near = (v, t, tol = 30) => v != null && Math.abs(v - t) <= tol;
    const bad0 = [];
    sects.forEach((s, i) => {
      const sz = wKid(s, 'pgSz'); const w = +att(sz, 'w'), h = +att(sz, 'h');
      if (!((near(w, 11906, 20) && near(h, 16838, 20)) || (near(w, 16838, 20) && near(h, 11906, 20)))) bad0.push(`${lab(i)}${cm(w)} x ${cm(h)} ซม.`);
    });
    if (bad0.length) set('page.0', 'no', `ไม่ใช่ A4 (${egs(bad0)})`, bad0.length); else set('page.0', 'yes', 'A4 ทุกส่วน');
    [['top', 1, 2160], ['left', 2, 2160], ['right', 3, 1440], ['bottom', 4, 1440]].forEach(([k, i, t]) => {
      const bad = [];
      sects.forEach((s, si) => { const v = att(wKid(s, 'pgMar'), k); if (!near(v == null ? null : +v, t)) bad.push(`${lab(si)}${v == null ? 'ไม่ได้ตั้ง' : cm(+v) + ' ซม.'}`); });
      if (bad.length) set(`page.${i}`, 'no', `ตั้งไว้ ${egs(bad)} (ต้อง ${cm(t)} ซม.)`, bad.length); else set(`page.${i}`, 'yes', `${cm(t)} ซม.`);
    });
  }

  /* --- fonts (DS ข้อ 2) --- */
  {
    const other = {}, skip = {}; let badP = 0;
    // run ที่มีแต่สัญลักษณ์ที่ TH SarabunPSK ไม่มี (เช่น →) ไม่นับ เพราะเปลี่ยนเป็น Sarabun ไม่ได้ ถ้าปนตัวอักษรทั่วไปยังนับเหมือนเดิม
    // run ที่มีแต่ช่องว่างไม่ถูกนับอยู่แล้ว เพราะ charFmt ไม่นับช่องว่าง
    const symOnly = t => { const cs = [...t].filter(ch => !/\s/.test(ch)); return cs.length > 0 && cs.every(NO_SARABUN_GLYPH); };
    allBodyP.concat(hdrP, ftrP).forEach(m => {
      let bad = false;
      charFmt(m, S).forEach(c => {
        if (SARABUN.test(c.font) || SYMBOL_FONT.test(c.font)) return;
        if (symOnly(c.text)) { [...c.text].forEach(ch => { if (!/\s/.test(ch) && !/[︎️]/.test(ch)) skip[ch] = (skip[ch] || 0) + 1; }); return; }
        bad = true; const o = other[c.font] || (other[c.font] = {n:0, eg:c.text}); o.n += c.n;
      });
      if (bad) badP++;
    });
    const sk = Object.keys(skip).sort((a, b) => skip[b] - skip[a]);
    const skipList = sk.slice(0, 5).map(ch => `${ch} ${skip[ch]} ตัว`).join(', ') + (sk.length > 5 ? ` และอีก ${sk.length - 5} แบบ` : '');
    const skipNote = sk.length ? ` · ไม่นับ ${skipList} (TH SarabunPSK ไม่มีอักขระนี้)` : '';
    const names = Object.keys(other).sort((a, b) => other[b].n - other[a].n);
    if (names.length) set('font.0', 'no', `พบฟอนต์อื่น ${names.slice(0, 3).map(f => `${f} ${other[f].n} ตัวอักษร เช่น ${snip(other[f].eg)}`).join(' · ')}${names.length > 3 ? ` และอีก ${names.length - 3} ฟอนต์` : ''}${skipNote}`, badP);
    else set('font.0', 'yes', `TH SarabunPSK ทั้งเอกสาร รวม Header และ Footer${skipNote}`);
    if (sk.length) tip('font.0', `ไม่นับสัญลักษณ์ที่ TH SarabunPSK ไม่มี (ลูกศร เครื่องหมายคณิตศาสตร์ รูปทรง อีโมจิ อักษรกรีก) เพราะ Word ต้องใช้ฟอนต์อื่นแสดงแทน พบ ${skipList} · ถ้าสัญลักษณ์อยู่ติดกับข้อความทั่วไปในฟอนต์อื่น ยังนับเป็นจุดผิด`);
  }
  const LV = [{lvl:0, size:40, font:'font.1', sp:'spacing.1', before:320, after:40, name:'Heading 1 (หัวเรื่อง)'},
              {lvl:1, size:36, font:'font.2', sp:'spacing.2', before:120, after:40, name:'Heading 2 (หัวข้อ)'}];
  LV.forEach(L => {
    const hs = headings(L.lvl);
    if (!hs.length) { hint(L.font, `ไม่พบย่อหน้าที่ใช้สไตล์ ${L.name} จึงตรวจขนาดอัตโนมัติไม่ได้ ตรวจด้วยตา`); if (L.sp) hint(L.sp, `ไม่พบย่อหน้าที่ใช้สไตล์ ${L.name}`); return; }
    const bad = [];
    hs.forEach(m => { const f = charFmt(m, S).find(c => c.size !== L.size || !c.bold); if (f) bad.push(`${snip(m.text)} ${pt(f.size)}${f.bold ? '' : ' ไม่หนา'}`); });
    if (bad.length) set(L.font, 'no', `${bad.length} จาก ${hs.length} หัวข้อ: ${egs(bad, 'หัวข้อ')}`, bad.length); else set(L.font, 'yes', `${hs.length} หัวข้อ ขนาด ${pt(L.size)} ตัวหนา`);
    if (!L.sp) return;
    const badS = [];
    hs.forEach(m => { const b = m.pp.before || 0, a = m.pp.after || 0; if (b !== L.before || a !== L.after || m.pp.autoB || m.pp.autoA) badS.push(`${snip(m.text)} ก่อน ${b / 20} หลัง ${a / 20} pt`); });
    if (badS.length) set(L.sp, 'no', `${badS.length} จาก ${hs.length} หัวข้อ: ${egs(badS, 'หัวข้อ')}`, badS.length); else set(L.sp, 'yes', `${hs.length} หัวข้อ ก่อน ${L.before / 20} pt หลัง ${L.after / 20} pt`);
  });

  /* --- หัวข้อย่อย (ข้อ font.3) = ข้อที่มีเลขระดับถัดจากหัวข้อลงไป 1 ระดับ ต้อง 16 pt ตัวหนาทุกข้อ ---
     ใช้ Heading style: หัวข้อ = Heading 2 หัวข้อย่อย = Heading 3
     ไม่มี Heading: หัวข้อ = ย่อหน้ามีลำดับเลขที่หนา 18 pt (เช่น ilvl 0 "1.") หัวข้อย่อย = ระดับถัดลงไปในลำดับเลขเดียวกัน (ilvl 1 "1.1")
     ทั้งสองแบบนับย่อหน้าที่พิมพ์เลขเองด้วย เช่น "1.1 " เมื่อหัวข้อเป็น "1." หรือ "1.1.1 " เมื่อหัวข้อเป็น "1.1" (SS) */
  const subSet = new Set();
  {
    // บรรทัดสารบัญที่ไม่ได้ใช้สไตล์ TOC ลงท้ายด้วยแท็บและเลขหน้า เช่น "2.1 ภาพรวม⇥3" ไม่ใช่หัวข้อย่อย
    const tocLine = m => /\t\s*\d+\s*$/.test(m.text);
    const inBody = m => !cover.has(m.el) && !inCell(m.el) && !inTextbox(m.el) && !isToc(m) && !tocLine(m) && m.text.trim();
    const typedNo = m => (/^(\d+(?:\.\d+)*)\.?\s/.exec(m.text.trim()) || [])[1] || null;
    // เลขอัตโนมัติที่ Word แสดง คำนวณจากลำดับย่อหน้า (ใช้รูปแบบ lvlText ใน numbering.xml ถ้ามี) ไม่นับ bullet
    const numKey = m => m.pp.numId && m.pp.numId !== '0' ? N(m.pp.numId) : null;
    const numLabel = new Map(), ctr = {};
    allBodyP.forEach(m => {
      const n = numKey(m); if (!n) return;
      const il = m.pp.ilvl || 0, L = n.lvl(il);
      if (L.fmt === 'bullet' || L.fmt === 'none') return;
      const c = ctr[n.key] || (ctr[n.key] = []);
      for (let k = 0; k < il; k++) if (c[k] == null) c[k] = n.lvl(k).start || 1;
      c[il] = c[il] == null ? (L.start || 1) : c[il] + 1; c.length = il + 1;
      const fmt = L.text != null ? L.text : c.map((_, k) => `%${k + 1}`).join('.');
      numLabel.set(m.el, fmt.replace(/%(\d)/g, (_, k) => c[k - 1] != null ? c[k - 1] : 1).trim().replace(/[.)]$/, ''));
    });
    const noOf = m => typedNo(m) || numLabel.get(m.el) || null;
    const depthOf = m => { const t = noOf(m); return t && /^\d+(\.\d+)*$/.test(t) ? t.split('.').length : null; };
    const most = a => { const c = {}; a.forEach(v => { if (v != null) c[v] = (c[v] || 0) + 1; }); const k = Object.keys(c).sort((x, y) => c[y] - c[x] || x - y)[0]; return k == null ? null : +k; };
    const big = m => { const f = charFmt(m, S); return f.length > 0 && f.every(c => c.bold && c.size === 36); };
    const bodyAll = allBodyP.filter(inBody);
    const useStyle = headings(1).length > 0 || headings(2).length > 0;
    const heads = useStyle ? headings(1) : bodyAll.filter(m => m.lvl == null && noOf(m) && big(m));
    // ระดับลำดับเลขของหัวข้อ (เลือกระดับที่พบมากที่สุด) ระดับถัดลงไปในรายการเดียวกันคือหัวข้อย่อย
    const listHeads = heads.filter(m => numLabel.has(m.el));
    const headIl = most(listHeads.map(m => m.pp.ilvl || 0));
    const subLists = new Set(listHeads.filter(m => (m.pp.ilvl || 0) === headIl).map(m => numKey(m).key));
    let d = most(heads.map(depthOf));
    if (d == null && useStyle) { const d1 = most(headings(0).map(depthOf)); if (d1 != null) d = d1 + 1; }
    const typedRe = d != null ? new RegExp(`^\\d+(?:\\.\\d+){${d}}\\.?\\s`) : null;
    const headSet = new Set(heads.map(m => m.el));
    bodyAll.forEach(m => {
      if (headSet.has(m.el) || (m.lvl != null && m.lvl !== 2)) return;
      const n = numLabel.has(m.el) ? numKey(m) : null;
      if ((useStyle && m.lvl === 2) || (n && subLists.has(n.key) && (m.pp.ilvl || 0) === headIl + 1) || (!n && typedRe && typedRe.test(m.text.trim()))) subSet.add(m.el);
    });
    const subs = bodyAll.filter(m => subSet.has(m.el));
    if (!subs.length) hint('font.3', 'ไม่พบหัวข้อย่อย (ข้อเลขระดับถัดจากหัวข้อ เช่น 1.1 หรือสไตล์ Heading 3) จึงตรวจอัตโนมัติไม่ได้ ตรวจด้วยตาว่าหัวข้อย่อยทุกข้อ 16 pt ตัวหนา');
    else {
      // ขนาดดูฝั่ง cs (szCs) เมื่อ run มีอักษรไทย ตัวหนานับทั้ง b และ bCs
      const fault = m => {
        const p = new Set();
        m.runs.forEach(({e, text}) => {
          if (!text.trim()) return;
          const size = TH_CH.test(text) ? (e.szc != null ? e.szc : e.sz != null ? e.sz : 20) : (e.sz != null ? e.sz : 20);
          if (size !== 32) p.add(`ขนาด ${pt(size)}`);
          if (!e.b && !e.bc) p.add('ไม่หนา');
        });
        return [...p].sort().join(' ');
      };
      const groups = new Map();
      subs.forEach(m => { const f = fault(m); if (!f) return; if (!groups.has(f)) groups.set(f, []); groups.get(f).push(noOf(m) || snip(m.text)); });
      // 3.1, 3.2, 3.3 → 3.1–3.3
      const ranges = labels => {
        const out = [];
        labels.forEach(l => {
          const last = out[out.length - 1], p = /^(.*\.)(\d+)$/.exec(l);
          if (last && p && last.pre === p[1] && last.to + 1 === +p[2]) { last.to++; last.n++; }
          else out.push(p ? {pre:p[1], from:+p[2], to:+p[2], n:1} : {txt:l, n:1});
        });
        const txt = r => r.txt || (r.to - r.from >= 2 ? `${r.pre}${r.from}–${r.pre}${r.to}` : Array.from({length:r.to - r.from + 1}, (_, k) => `${r.pre}${r.from + k}`).join(', '));
        const shown = out.slice(0, 6), rest = out.slice(6).reduce((a, r) => a + r.n, 0);
        return shown.map(txt).join(', ') + (rest ? ` และอีก ${rest} ข้อ` : '');
      };
      const badN = [...groups.values()].reduce((a, g) => a + g.length, 0);
      if (badN) set('font.3', 'no', `${badN} จาก ${subs.length} ข้อ ${[...groups].map(([f, ls]) => `${f}: ${ranges(ls)}`).join(' · ')}`, badN);
      else set('font.3', 'yes', `${subs.length} ข้อ ขนาด 16 pt ตัวหนา`);
    }
  }
  {
    // a short, all-bold line set larger than body text is a heading typed by hand, not body text
    const manualHead = m => { const f = charFmt(m, S); return m.text.trim().length <= 60 && f.length && f.every(c => c.bold && c.size > 32); };
    // หัวข้อย่อยตรวจในข้อ font.3 แล้ว ไม่นำมาตรวจเป็นเนื้อหาอีก
    const cand = allBodyP.filter(isBody), subN = cand.filter(m => subSet.has(m.el)).length;
    const bodyP = cand.filter(m => !subSet.has(m.el) && !manualHead(m)), skipped = cand.length - subN - bodyP.length;
    const skipNote = (skipped ? ` · ไม่นับหัวข้อที่จัดรูปแบบเอง ${skipped} บรรทัด` : '') + (subN ? ` · ไม่นับหัวข้อย่อย ${subN} ข้อ` : '');
    const sizes = {}; const bad = [];
    bodyP.forEach(m => { const f = charFmt(m, S).find(c => c.size !== 32); if (f) { bad.push(snip(m.text)); sizes[pt(f.size)] = (sizes[pt(f.size)] || 0) + 1; } });
    if (!bodyP.length) hint('font.4', 'ไม่พบย่อหน้าเนื้อหา');
    else if (bad.length) set('font.4', 'no', `${bad.length} ย่อหน้าไม่ใช่ 16 pt (${Object.keys(sizes).map(k => `${k} ${sizes[k]} ย่อหน้า`).join(', ')}) เช่น ${egs(bad, 'ย่อหน้า')} · ตรวจเฉพาะขนาด${skipNote}`, bad.length);
    else set('font.4', 'yes', `${bodyP.length} ย่อหน้าเนื้อหา 16 pt · ตรวจเฉพาะขนาด${skipNote}`);
    // list items (bullets, numbering) are usually set tight on purpose, so only plain paragraphs are held to 0/8 pt
    const spBase = cand.filter(m => !manualHead(m));   // ระยะบรรทัดตรวจชุดเดิม รวมหัวข้อย่อยที่พิมพ์เลขเอง
    const listN = spBase.filter(m => m.pp.list).length;
    const listNote = listN ? ` · ไม่นับรายการ bullet หรือลำดับเลข ${listN} ย่อหน้า` : '';
    const spP = spBase.filter(m => !isCaption(m) && !m.pp.list);
    const badS = []; const kinds = {};
    spP.forEach(m => {
      const b = m.pp.before || 0, a = m.pp.after || 0, line = m.pp.line != null ? m.pp.line : 240, rule = m.pp.lineRule || 'auto';
      if (b === 0 && a === 160 && line === 240 && rule === 'auto' && !m.pp.autoB && !m.pp.autoA) return;
      const k = `${rule === 'auto' ? 'บรรทัด ' + (line / 240).toFixed(2).replace(/\.?0+$/, '') : 'บรรทัด ' + line / 20 + ' pt'} ก่อน ${b / 20} หลัง ${a / 20} pt`;
      kinds[k] = (kinds[k] || 0) + 1; badS.push(snip(m.text));
    });
    if (!spP.length) hint('spacing.0', 'ไม่พบย่อหน้าเนื้อหา');
    else if (badS.length) set('spacing.0', 'no', `${badS.length} ย่อหน้า (${Object.keys(kinds).slice(0, 3).map(k => `${k}: ${kinds[k]}`).join(' · ')}) เช่น ${egs(badS, 'ย่อหน้า')}${listNote}`, badS.length);
    else set('spacing.0', 'yes', `${spP.length} ย่อหน้า Single ก่อน 0 หลัง 8 pt${listNote}`);
  }

  /* --- page number (DS ข้อ 5) --- */
  {
    const pageF = ms => [].concat(...ms.map(m => m.fields.filter(f => /\bPAGE\b/.test(f.instr)).map(f => ({m, f}))));
    const inH = pageF(hdrP), inF = pageF(ftrP);
    if (!inH.length) set('pagenum.1', 'no', inF.length ? 'เลขหน้าอยู่ใน Footer ไม่ใช่ Header' : 'ไม่พบฟิลด์เลขหน้า (PAGE) ใน Header');
    else {
      const pos = ({m, f}) => { const jc = m.pp.jc || 'left'; if (jc === 'right' || jc === 'end') return 'right'; if (jc === 'center') return 'center'; const tabs = (f.pre.match(/\t/g) || []).length; return tabs >= 2 ? 'right' : tabs === 1 ? 'tab' : 'left'; };
      const ps = inH.map(pos);
      if (ps.includes('right')) set('pagenum.1', 'yes', 'เลขหน้าใน Header จัดชิดขวา');
      else if (ps.includes('tab')) hint('pagenum.1', 'เลขหน้าอยู่ใน Header แต่จัดตำแหน่งด้วยแท็บ ตรวจด้วยตาว่าอยู่มุมขวา');
      else set('pagenum.1', 'no', `เลขหน้าใน Header จัด${ps.includes('center') ? 'กึ่งกลาง' : 'ชิดซ้าย'}`);
    }
    const found = inH.length ? inH : inF;
    if (!found.length) set('pagenum.2', 'no', 'ไม่พบฟิลด์เลขหน้า');
    else {
      const bad = [];
      found.forEach(({f}) => (f.res.length ? f.res : f.begin ? [f.begin] : []).forEach(r => { const font = S.font(r.e.fa), size = r.e.sz != null ? r.e.sz : 20; if (!SARABUN.test(font) || size !== 32) bad.push(`${font} ${pt(size)}`); }));
      if (bad.length) set('pagenum.2', 'no', `เลขหน้าใช้ ${[...new Set(bad)].join(', ')}`); else set('pagenum.2', 'yes', 'TH SarabunPSK 16 pt');
    }
  }

  /* --- TOC fields --- */
  const tocAt = {};
  blocks.forEach((b, i) => { if (b.localName !== 'p') return; M(b).fields.forEach(f => { const k = TOC_KIND(f.instr); if (k && tocAt[k] == null) tocAt[k] = i; }); });

  /* --- tables (DS ข้อ 13) --- */
  // a table whose labels run down the first column (bold) with plain values beside them is an info box, not a data table
  const boldCell = c => { const f = [].concat(...c.map(m => charFmt(m, S))); return f.length > 0 && f.every(x => x.bold); };
  const infoBox = t => t.cols === 2 && t.rows.every(r => r[0] && boldCell(r[0])) && t.rows.some(r => r[1] && !boldCell(r[1]));
  const gridT = blocks.map((b, i) => ({b, i})).filter(x => x.b.localName === 'tbl' && !cover.has(wAll(x.b, 'p')[0])).map(x => Object.assign(tables.get(x.b), {i:x.i})).filter(t => t.rows.length >= 2 && t.cols >= 2);
  const realT = gridT.filter(t => !infoBox(t)), boxN = gridT.length - realT.length;
  const boxNote = boxN ? ` · ข้ามตารางข้อมูลแนวตั้ง ${boxN} ตาราง` : '';
  // nearest paragraph with text; looking upward also steps over a table directly above (two tables under one caption)
  const near = (i, dir) => {
    for (let k = 1; k <= 4; k++) {
      const b = blocks[i + dir * k]; if (!b) return null;
      if (b.localName === 'tbl') { if (dir < 0) continue; return null; }
      const m = M(b); if (m.text.trim()) return m;
    }
    return null;
  };
  if (!realT.length) ['table.0','table.1','table.2','table.3'].forEach(id => set(id, 'na', 'ไม่พบตารางในเอกสาร' + boxNote));
  else {
    const noCap = [], below = [], notLeft = [], badFmt = [], caps = [];
    realT.forEach(t => {
      const lbl = snip(t.cellText(t.rows[0][0] || []) || 'ตาราง');
      const up = near(t.i, -1), down = near(t.i, 1);
      if (up && /^ตาราง/.test(up.text.trim())) { caps.push(up); if (!LEFTISH.has(up.pp.jc || 'left')) notLeft.push(snip(up.text)); }
      else if (down && /^ตาราง/.test(down.text.trim())) { caps.push(down); below.push(snip(down.text)); }
      else noCap.push(`ตารางที่ขึ้นต้น ${lbl}`);
    });
    caps.forEach(m => { if (!/^ตาราง\s+\d+(-\d+)?(\s|$)/.test(m.text.trim())) badFmt.push(snip(m.text)); });
    const e2 = [...noCap.map(x => `ไม่มีชื่อ: ${x}`), ...below.map(x => `อยู่ใต้ตาราง: ${x}`), ...notLeft.map(x => `ไม่ชิดซ้าย: ${x}`)];
    if (e2.length) set('table.2', 'no', egs(e2) + boxNote, e2.length); else set('table.2', 'yes', `${realT.length} ตาราง ชื่ออยู่เหนือตาราง ชิดซ้าย${boxNote}`);
    if (!caps.length) hint('table.3', 'ไม่พบชื่อตาราง');
    else if (badFmt.length) set('table.3', 'no', `ไม่ตรงรูปแบบ "ตาราง [ลำดับ]": ${egs(badFmt)}`, badFmt.length);
    else set('table.3', 'yes', `${caps.length} ชื่อตาราง`);
    const badHead = [], badNum = []; let numT = 0;
    realT.forEach(t => {
      const lbl = snip(t.cellText(t.rows[0][0] || []) || 'ตาราง');
      const probs = new Set();
      t.rows[0].forEach(c => c.forEach(m => { if (!m.text.trim()) return; if (m.pp.jc !== 'center') probs.add('ไม่กึ่งกลาง'); if (charFmt(m, S).some(x => !x.bold)) probs.add('ไม่หนา'); }));
      if (probs.size) badHead.push(`${lbl} ${[...probs].join(' ')}`);
      const nums = t.rows.slice(1).map(r => r[0] || []).filter(c => /^\d+(\.\d+)*\.?$/.test(t.cellText(c)));
      if (nums.length) { numT++; if (nums.some(c => c.some(m => m.text.trim() && m.pp.jc !== 'center'))) badNum.push(lbl); }
    });
    if (badHead.length) set('table.0', 'no', `หัวตาราง ${egs(badHead, 'ตาราง')}${boxNote}`, badHead.length); else set('table.0', 'yes', `หัวตาราง ${realT.length} ตาราง กึ่งกลาง ตัวหนา${boxNote}`);
    if (!numT) set('table.1', 'na', 'ไม่พบคอลัมน์ลำดับเลขในตาราง');
    else if (badNum.length) set('table.1', 'no', `ลำดับเลขไม่กึ่งกลาง: ${egs(badNum, 'ตาราง')}`, badNum.length);
    else set('table.1', 'yes', `${numT} ตาราง`);
  }

  /* --- images (DS ข้อ 14) --- */
  const imgs = [];
  blocks.forEach((b, i) => {
    if (b.localName !== 'p' || cover.has(b)) return;
    const ds = wAll(b, 'drawing').filter(d => !inFallback(d) && ownerP(d) === b && wAll(d, 'pic', NS_PIC).length);
    const pics = ds.filter(d => { const ex = wAll(d, 'extent', NS_WP)[0]; return !ex || +ex.getAttribute('cx') >= MIN_IMG_EMU; });
    const vml = wAll(b, 'pict').filter(x => !inFallback(x) && ownerP(x) === b && !wAll(x, 'txbxContent').length);
    if (pics.length || vml.length) imgs.push({i, m:M(b), anchor:pics.length > 0 && pics.every(d => d.getElementsByTagNameNS(NS_WP, 'anchor').length > 0)});
  });
  if (!imgs.length) ['image.0','image.1','image.2'].forEach(id => set(id, 'na', 'ไม่พบภาพในเอกสาร (ไม่นับโลโก้ขนาดเล็ก)'));
  else {
    const e0 = [], e1 = [], e2 = []; let n = 0;
    imgs.forEach(({i, m, anchor}) => {
      n++;
      const cap = /^ภาพ/.test(m.text.trim()) ? m : near(i, 1);
      const label = `ภาพที่ ${n}`;
      if (!cap || !/^ภาพ/.test(cap.text.trim())) { const up = near(i, -1); e0.push(up && /^ภาพ/.test(up.text.trim()) ? `${label} ชื่ออยู่เหนือภาพ` : `${label} ไม่มีชื่อภาพ`); e2.push(label); }
      else {
        if (!/^ภาพ\s+\d+(-\d+)?\s+\S/.test(cap.text.trim())) e0.push(`${snip(cap.text)} ไม่ตรงรูปแบบ`);
        if (cap.pp.jc !== 'center') e0.push(`${snip(cap.text)} ไม่กึ่งกลาง`);
        if (!cap.fields.some(f => /^\s*SEQ\b/i.test(f.instr))) e2.push(snip(cap.text));
      }
      if (!anchor && m.pp.jc !== 'center') e1.push(label);
    });
    if (e0.length) set('image.0', 'no', egs(e0), e0.length); else set('image.0', 'yes', `${n} ภาพ`);
    if (e1.length) set('image.1', 'no', `ไม่กึ่งกลาง: ${egs(e1, 'ภาพ')}`, e1.length); else set('image.1', 'yes', `${n} ภาพ`);
    if (e2.length) set('image.2', 'no', `ไม่ได้ใช้ Insert Caption: ${egs(e2, 'ภาพ')}`, e2.length); else set('image.2', 'yes', `${n} ภาพ ใช้ Insert Caption`);
  }
  if (!imgs.length) set('image.3', 'na', 'ไม่พบภาพในเอกสาร');
  else if (tocAt.img == null) set('image.3', 'no', 'ไม่พบสารบัญภาพ');
  else if (tocAt.tbl != null && tocAt.img < tocAt.tbl) set('image.3', 'no', 'สารบัญภาพอยู่ก่อนสารบัญตาราง');
  else set('image.3', 'yes', 'มีสารบัญภาพ');

  /* --- front matter (long documents) --- */
  {
    const ctl = realT.find(t => { const h = t.rows[0].map(t.cellText).join(' '); return /เวอร์ชัน|version/i.test(h) && /วันที่|date/i.test(h); });
    if (ctl) set('front.1', 'yes', 'พบตารางควบคุมการเปลี่ยนแปลง'); else set('front.1', 'no', 'ไม่พบตารางที่มีคอลัมน์เวอร์ชันและวันที่');
    if (!ctl) hint('front.2', 'ไม่พบตารางควบคุมการเปลี่ยนแปลง');
    else {
      let last = null;
      ctl.rows.slice(1).forEach(r => { const txt = r.map(ctl.cellText).join(' '); const v = (/\d+\.\d+\.\d+/.exec(txt) || [])[0]; if (v && (!last || verCmp(v, last.v) >= 0)) last = {v, txt}; });
      if (!last) hint('front.2', 'ไม่พบเลขเวอร์ชันในตารางควบคุมการเปลี่ยนแปลง');
      else if (!fileVer) hint('front.2', `เวอร์ชันล่าสุดในตาราง ${last.v} แต่ชื่อไฟล์ไม่มีเวอร์ชัน`);
      else if (last.v !== fileVer) set('front.2', 'no', `เวอร์ชันล่าสุดในตาราง ${last.v} แต่ชื่อไฟล์ V${fileVer}`);
      else {
        const d = parseThaiDate(last.txt);
        const fd = fileDate ? toBE(fileDate) : null;
        if (!d || !fd) hint('front.2', `เวอร์ชัน ${last.v} ตรงกับชื่อไฟล์ ตรวจวันที่เอง`);
        else if (toBE(d).join('-') !== fd.join('-')) set('front.2', 'no', `เวอร์ชันตรง แต่วันที่ในตาราง ${toBE(d).join('-')} ไม่ตรงกับชื่อไฟล์ ${fd.join('-')}`);
        else set('front.2', 'yes', `V${last.v} วันที่ ${fd.join('-')}`);
      }
    }
    if (tocAt.main == null) set('front.3', 'no', 'ไม่พบสารบัญอัตโนมัติ (TOC)');
    else hint('front.3', 'พบสารบัญอัตโนมัติ ตรวจเลขหน้าให้ตรงกับเนื้อหา (Update Field ก่อนส่ง)');
    if (!realT.length) set('front.4', 'na', 'ไม่พบตารางในเอกสาร');
    else if (tocAt.tbl == null) set('front.4', 'no', `มี ${realT.length} ตาราง แต่ไม่พบสารบัญตาราง`);
    else set('front.4', 'yes', 'มีสารบัญตาราง');
    const htxt = hdrP.map(m => m.text).join(' ').replace(/\s+/g, ' ').trim();
    const hName = htxt.replace(/หน้า\s*\|?\s*\d*/g, '').trim();
    if (PLACEHOLDER.test(htxt)) set('front.5', 'no', `Header มีข้อความแม่แบบ ${snip(htxt)}`);
    else if (!hName) set('front.5', 'no', 'Header ไม่มีชื่อเอกสาร');
    else if (opts.name && hName.toLowerCase().includes(opts.name.toLowerCase())) set('front.5', 'yes', `Header: ${snip(hName)}`);
    else hint('front.5', `Header: ${snip(hName)} ตรวจว่าเป็นชื่อเอกสารนี้`);
    const nums = allBodyP.filter(m => m.lvl != null && m.lvl <= 2 && !cover.has(m.el) && !inCell(m.el)).map(m => ({m, n:(/^(\d+(?:\.\d+)*)\.?\s/.exec(m.text.trim()) || [])[1]})).filter(x => x.n);
    if (nums.length < 2) hint('front.6', 'หัวข้อใช้เลขอัตโนมัติหรือไม่มีเลขนำหน้า ตรวจเอง');
    else {
      const bad = []; let prev = null;
      nums.forEach(({m, n}) => {
        const p = n.split('.').map(Number);
        let ok = true;
        if (prev) {
          if (p.length === prev.length + 1) ok = p.slice(0, -1).join('.') === prev.join('.') && p[p.length - 1] === 1;
          else if (p.length <= prev.length) ok = p.slice(0, -1).join('.') === prev.slice(0, p.length - 1).join('.') && p[p.length - 1] === prev[p.length - 1] + 1;
        }
        if (!ok) bad.push(snip(m.text));
        prev = p;
      });
      if (bad.length) set('front.6', 'no', `เลขหัวข้อไม่ต่อเนื่อง: ${egs(bad, 'หัวข้อ')}`, bad.length); else set('front.6', 'yes', `${nums.length} หัวข้อ`);
    }
  }

  /* --- body text rules (DS ข้อ 7) and template leftovers --- */
  {
    const texts = allBodyP.filter(m => !isToc(m)).map(m => m.text);
    const all = texts.concat(hdrP.map(m => m.text), ftrP.map(m => m.text));
    const ph = all.filter(t => PLACEHOLDER.test(t));
    if (ph.length) set('lang.5', 'no', `พบข้อความแม่แบบ ${egs(ph.map(snip))}`, ph.length); else hint('lang.5', 'ไม่พบข้อความแม่แบบที่รู้จัก ตรวจด้วยตาอีกครั้ง');
    const find = (re, test) => { const out = []; texts.forEach(t => { re.lastIndex = 0; let m; while ((m = re.exec(t))) { if (!test || test(t, m)) out.push(snip(t.slice(Math.max(0, m.index - 12), m.index + m[0].length + 12))); } }); return out; };
    const sp = c => c == null || c === '' || /[\s.,;:!?()"“”'‘’\-–—/]/.test(c);
    const yamok = find(/ๆ/g), badY = find(/ๆ/g, (t, m) => !sp(t[m.index - 1]) || !sp(t[m.index + 1]));
    if (!yamok.length) set('writing.7', 'na', 'ไม่พบไม้ยมกในเอกสาร');
    else if (badY.length) set('writing.7', 'no', `${badY.length} จาก ${yamok.length} จุดไม่เว้นวรรค: ${egs(badY)}`, badY.length);
    else set('writing.7', 'yes', `${yamok.length} จุด`);
    const pai = find(/ฯลฯ|ฯ/g);
    const badPai = find(/ฯลฯ|ฯ/g, (t, m) => m[0] === 'ฯลฯ' ? !sp(t[m.index - 1]) || !sp(t[m.index + 3]) : !sp(t[m.index + 1]));
    if (!pai.length) set('writing.6', 'na', 'ไม่พบไปยาลในเอกสาร');
    else if (badPai.length) set('writing.6', 'no', `${badPai.length} จาก ${pai.length} จุด: ${egs(badPai)}`, badPai.length);
    else set('writing.6', 'yes', `${pai.length} จุด`);
    const commas = find(/,/g), badC = find(/([\u0E01-\u0E4E]+)\s*,/g, (t, m) => !/^[\u0E01-\u0E2E]$/.test(m[1]));
    if (!commas.length) set('writing.9', 'na', 'ไม่พบจุลภาคในเอกสาร');
    else if (badC.length) set('writing.9', 'no', `ใช้จุลภาคคั่นคำไทย ${badC.length} จุด: ${egs(badC)}`, badC.length);
    else set('writing.9', 'yes', `${commas.length} จุด คั่นเฉพาะคำอังกฤษหรือตัวเลข`);
    const kue = find(/คือ|เช่น/g, (t, m) => { const after = t.slice(m.index + m[0].length); if (m[0] === 'เช่น' && /^(กัน|เดียว|นั้น|นี้|เคย|ไร)/.test(after)) return false; return (TH_CH.test(t[m.index - 1] || '') || TH_CH.test(after[0] || '')); });
    hint('writing.4', kue.length ? `น่าสงสัย ${kue.length} จุด ตรวจด้วยตา: ${egs(kue)}` : 'ไม่พบจุดที่น่าสงสัย ตรวจด้วยตาอีกครั้ง');
    const br = find(/[^\s(]\(|\)[^\s).,;:!?"”’\-]/g, (t, m) => TH_CH.test(m[0]));
    hint('writing.5', br.length ? `น่าสงสัย ${br.length} จุด ตรวจด้วยตา: ${egs(br)}` : 'ไม่พบวงเล็บที่ติดกับคำไทย ตรวจด้วยตาอีกครั้ง');
  }

  /* --- version in the body/header vs file name --- */
  {
    const src = allBodyP.filter(m => !inCell(m.el)).concat(hdrP, ftrP).map(m => m.text).join('\n');
    const vs = new Set(); const re = /(?:_[A-Z]+_)?(?:\bV|เวอร์ชัน\s*|Version\s*)(\d+\.\d+\.\d+)/gi; let m;
    while ((m = re.exec(src))) { const own = /^_([A-Z]+)_/.exec(m[0]); if (own && own[1] !== opts.code) continue; vs.add(m[1]); }
    if (!vs.size) set('version.4', 'na', 'ไม่พบเลขเวอร์ชันในเนื้อเอกสาร');
    else if (!fileVer) hint('version.4', `พบเวอร์ชัน ${[...vs].join(', ')} ในเอกสาร แต่ชื่อไฟล์ไม่มีเวอร์ชัน`);
    else if ([...vs].every(v => v === fileVer)) set('version.4', 'yes', `V${fileVer}`);
    else if (!vs.has(fileVer)) set('version.4', 'no', `ในเอกสารเป็น ${[...vs].join(', ')} แต่ชื่อไฟล์ V${fileVer}`);
    else hint('version.4', `พบหลายเวอร์ชันในเอกสาร (${[...vs].join(', ')}) ตรวจว่าเวอร์ชันปัจจุบันตรงกับ V${fileVer}`);
  }

  /* --- ค่าความลับในเอกสาร: ตำแหน่งเท่านั้น ไม่แสดงค่า --- */
  // ชื่อตารางจาก caption ที่อยู่ติดกัน (เช่น "ตาราง 3-2") ไม่มี caption ใช้ลำดับตารางในเอกสาร
  const tblEls = blocks.map((b, i) => ({b, i})).filter(x => x.b.localName === 'tbl');
  const tblLabel = new Map();
  tblEls.forEach(({b, i}, k) => {
    const cap = [near(i, -1), near(i, 1)].find(m => m && /^ตาราง\s*[\d.-]+/.test(m.text.trim()));
    tblLabel.set(b, cap ? /^ตาราง\s*[\d.-]+/.exec(cap.text.trim())[0].replace(/\s+/, ' ') : `ตารางลำดับที่ ${k + 1}`);
  });
  const tName = t => tblLabel.get(t.el) || 'ตาราง';
  const secretHits = [], secretVals = [];
  {
    const cellOf = new Map();
    tblEls.forEach(({b}) => tables.get(b).rows.forEach((r, ri) => r.forEach(c => c.forEach(m => cellOf.set(m.el, `${tblLabel.get(b)} แถว ${ri + 1}`)))));
    let lastHead = '', pn = 0;
    const scan = (m, where) => findSecrets(m.text).forEach(x => { secretVals.push(x.value); secretHits.push(`${where} (${x.kind})`); });
    allBodyP.forEach(m => {
      if (!m.text.trim()) return;
      pn++;
      if (m.lvl != null && !isToc(m) && !inCell(m.el) && !inTextbox(m.el)) lastHead = m.text.trim();
      const cell = cellOf.get(m.el);
      scan(m, cell || `ย่อหน้าที่ ${pn}${lastHead ? ` ใต้หัวข้อ ${snip(lastHead)}` : ''}`);
    });
    hdrP.forEach(m => scan(m, 'Header')); ftrP.forEach(m => scan(m, 'Footer'));
  }

  /* --- Security Standard (SS): กฎหมวด ssx อยู่ใน ss-rules.js --- */
  if (opts.code === 'SS') analyzeSecurityStandard({set, hint, allBodyP, gridT, cover, isToc, tName, secretHits});

  // ซ่อนค่าความลับที่อาจติดมากับข้อความตัวอย่างในผลตรวจข้ออื่น
  if (secretVals.length) Object.values(R).forEach(r => { r.note = redactText(r.note, secretVals); if (r.tip) r.tip = redactText(r.tip, secretVals); });
  return R;
}
