import { analyzeSecurityStandard } from './ss-rules.js';
import { CODE_FONT, LEFTISH, MIN_IMG_EMU, NO_SARABUN_GLYPH, PLACEHOLDER, SARABUN, SYMBOL_FONT, TOC_KIND, charFmt, paraModel, readNumbering, readStyles, tableModel } from './model.js';
import { NS_PIC, NS_WP, att, inCell, inFallback, inTextbox, ownerP, toArr, upTo, wAll, wKid, wKids } from './xml.js';
import { FRONT_MATTER, classify, headFault, labelOf, numberLabels, ranges } from './levels.js';
import { checkFileNameRules, resultSet } from '../result.js';
import { DOCS } from '../../config/documents.js';
import { findSecrets, redactText } from '../secrets.js';
import { TH_CH, cm, egs, pt, snip, verCmp } from '../text.js';
import { parseThaiDate, toBE } from '../../utils/thai-date.js';

// "และ" "หรือ" ที่ติดคำข้างหน้า ไม่นับคำในรายการนี้ (แก้ได้) writing.3
export const CONJ_SKIP = ['หรือไม่', 'แล้วและ'];
// อักขระที่มองไม่เห็น lang.0
const INVISIBLE = /[​-‍﻿]/g;

/* xml: {document, styles, theme, headers:[], footers:[]} as parsed XML documents
   opts: {code, name, fileName, meeting} */
export function analyzeDocx(xml, opts){
  const rs = resultSet(), {R, set, hint, tip} = rs;
  const S = readStyles(xml.styles, xml.theme);
  const N = S.N = readNumbering(xml.numbering);
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
  // รายการในสารบัญ (TOC 1, TOC 2, Table of Figures) ไม่ใช่ TOC Heading ที่เป็นหัวเรื่อง "สารบัญ"
  const isToc = m => /^toc(?! heading)|table of figures/.test(m.style);
  // บรรทัดสารบัญที่ไม่ได้ใช้สไตล์ TOC ลงท้ายด้วยแท็บและเลขหน้า เช่น "2.1 ภาพรวม⇥3"
  const tocLine = m => /\t\s*[\dก-ฮ]{1,3}\s*$/.test(m.text);
  const inFlow = m => !cover.has(m.el) && !inCell(m.el) && !inTextbox(m.el) && !isToc(m) && !tocLine(m) && m.text.trim();

  /* --- ระดับหัวข้อจากเลขข้อ (ข้อตกลง QA 2569-11-13, levels.js) --- */
  const labels = numberLabels(allBodyP, N);
  // หน้าแรกที่เป็นปก (ตัวหนังสือใหญ่ ไม่มีลำดับเลข) ไม่นับเป็นหัวเรื่อง แม้เอกสารนั้นไม่ได้ตรวจส่วนนำ
  const coverLike = new Set(cover);
  if (!cover.size) {
    const first = [];
    for (const b of blocks) {
      if (b.localName === 'p' && M(b).pp.pbb && first.length) break;
      first.push(...(b.localName === 'p' ? [b] : wAll(b, 'p')).filter(p => !inFallback(p)).map(M));
      if (b.localName === 'p' && (wAll(b, 'br').some(x => att(x, 'type') === 'page') || wKid(wKid(b, 'pPr'), 'sectPr'))) break;
    }
    const big = first.some(m => charFmt(m, S).some(c => c.size >= 56));
    if (first.length < allBodyP.length && big && first.filter(m => m.text.trim()).length <= 15 && !first.some(m => labels.has(m.el))) first.forEach(m => coverLike.add(m.el));
  }
  const level = new Map();   // el → 'title' | 'head' | 'sub'
  {
    // รายการ "1." ที่เริ่มนับ 1 ใหม่ต่อจากหัวข้อย่อย (เช่น ขั้นตอน 1. 2. 3. ใต้ข้อ 2.3) เป็นรายการซ้อนระดับลึกกว่า = เนื้อหา
    // หัวข้อจริงจะนับต่อ (หัวข้อ 3. ต่อจากข้อ 2.1) หรือขึ้นหลังหัวเรื่องใหม่
    let afterSub = false, nested = null;
    const numOf = m => parseInt(labelOf(m, labels), 10);
    allBodyP.forEach(m => {
      if (!inFlow(m) || coverLike.has(m.el)) return;
      const c = classify(m, S, labels); if (!c) return;
      if (c === 'title') { afterSub = false; nested = null; }
      else if (c === 'sub') { afterSub = true; nested = null; }
      else if (c === 'head' && numOf(m) === (nested != null ? nested + 1 : afterSub ? 1 : NaN)) { nested = numOf(m); return; }
      else nested = null;
      level.set(m.el, c);
    });
  }
  const isBody = m => inFlow(m) && !coverLike.has(m.el) && !level.has(m.el) && !/^(title|subtitle)$/.test(m.style);

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
    const other = {}, skip = {}; let badP = 0, codeN = 0;
    // run ที่มีแต่สัญลักษณ์ที่ TH SarabunPSK ไม่มี (เช่น →) ไม่นับ เพราะเปลี่ยนเป็น Sarabun ไม่ได้ ถ้าปนตัวอักษรทั่วไปยังนับเหมือนเดิม
    // run ที่มีแต่ช่องว่างไม่ถูกนับอยู่แล้ว เพราะ charFmt ไม่นับช่องว่าง
    const symOnly = t => { const cs = [...t].filter(ch => !/\s/.test(ch)); return cs.length > 0 && cs.every(NO_SARABUN_GLYPH); };
    // โค้ดตัวอย่าง: ทุก run เป็นฟอนต์ monospace หรือใช้สไตล์ชื่อ Code / HTML Code
    const codeStyle = id => !!id && /code/i.test(S.get(id).name);
    const isCode = m => {
      if (codeStyle(m.pp.ps)) return true;
      const rs = m.runs.filter(r => r.text.trim());
      return rs.length > 0 && rs.every(({e}) => codeStyle(e.rs) || CODE_FONT.test(S.font(e.fa)));
    };
    allBodyP.concat(hdrP, ftrP).forEach(m => {
      if (m.text.trim() && isCode(m)) { codeN++; return; }
      let bad = false;
      charFmt(m, S).forEach(c => {
        if (SARABUN.test(c.font) || SYMBOL_FONT.test(c.font)) return;
        if (symOnly(c.text)) { [...c.text].forEach(ch => { if (!/\s/.test(ch) && !/[︎️]/.test(ch)) skip[ch] = (skip[ch] || 0) + 1; }); return; }
        bad = true; const o = other[c.font] || (other[c.font] = {n:0, eg:c.text}); o.n += c.n;
      });
      if (bad) badP++;
    });
    // ฟอนต์ของตัวเลขข้อ (rFonts ของ lvl ใน numbering.xml) ทุกระดับที่ใช้จริง 1 จุดต่อ 1 รูปแบบเลข ไม่นับ bullet (• o จาก Symbol, Courier New)
    const numBad = new Map();
    allBodyP.concat(hdrP, ftrP).forEach(m => {
      const id = m.pp.numId; if (!id || id === '0') return;
      const n = N(id), il = m.pp.ilvl || 0, L = n.lvl(il), k = `${n.key}:${il}`;
      if (L.fmt === 'bullet' || L.fmt === 'none' || !L.font || numBad.has(k)) return;
      const f = S.font(L.font);
      if (!SARABUN.test(f) && !SYMBOL_FONT.test(f)) numBad.set(k, `"${(L.text || '').replace(/%\d/g, '1')}" ใช้ ${f}`);
    });
    const sk = Object.keys(skip).sort((a, b) => skip[b] - skip[a]);
    const skipList = sk.slice(0, 5).map(ch => `${ch} ${skip[ch]} ตัว`).join(', ') + (sk.length > 5 ? ` และอีก ${sk.length - 5} แบบ` : '');
    const skipNote = (sk.length ? ` · ไม่นับ ${skipList} (TH SarabunPSK ไม่มีอักขระนี้)` : '') + (codeN ? ` · ไม่นับโค้ดตัวอย่าง ${codeN} ย่อหน้า` : '');
    const names = Object.keys(other).sort((a, b) => other[b].n - other[a].n);
    const parts = [];
    if (names.length) parts.push(`พบฟอนต์อื่น ${names.slice(0, 3).map(f => `${f} ${other[f].n} ตัวอักษร เช่น ${snip(other[f].eg)}`).join(' · ')}${names.length > 3 ? ` และอีก ${names.length - 3} ฟอนต์` : ''}`);
    if (numBad.size) parts.push(`ตัวเลขข้อ ${egs([...numBad.values()], 'รูปแบบ')}`);
    if (parts.length) set('font.0', 'no', parts.join(' · ') + skipNote, badP + numBad.size);
    else set('font.0', 'yes', `TH SarabunPSK ทั้งเอกสาร รวม Header Footer และตัวเลขข้อ${skipNote}`);
    if (sk.length) tip('font.0', `ไม่นับสัญลักษณ์ที่ TH SarabunPSK ไม่มี เพราะ Word ต้องใช้ฟอนต์อื่นแสดงแทน พบ ${skipList} · ถ้าสัญลักษณ์อยู่ติดกับข้อความทั่วไปในฟอนต์อื่น ยังนับเป็นจุดผิด`);
  }

  /* --- หัวเรื่อง หัวข้อ หัวข้อย่อย (font.1–3, spacing.1–2) แยกระดับจากเลขข้อ ดู levels.js --- */
  const LV = [{cls:'title', size:40, font:'font.1', sp:'spacing.1', before:320, after:40, unit:'หัวเรื่อง', what:'หัวเรื่อง (ชื่อบท ส่วน หรือหน้าพิเศษที่ไม่มีเลขข้อ)'},
              {cls:'head', size:36, font:'font.2', sp:'spacing.2', before:120, after:40, unit:'ข้อ', what:'หัวข้อ (ข้อเลข 1.)'},
              {cls:'sub', size:32, font:'font.3', unit:'ข้อ', what:'หัวข้อย่อย (ข้อเลข 1.1)'}];
  LV.forEach(L => {
    const hs = allBodyP.filter(m => level.get(m.el) === L.cls);
    if (!hs.length) { hint(L.font, `ไม่พบ${L.what} จึงตรวจอัตโนมัติไม่ได้ ตรวจด้วยตา`); if (L.sp) hint(L.sp, `ไม่พบ${L.what}`); return; }
    const lab = m => { if (L.cls === 'title') return snip(m.text); const n = labelOf(m, labels); return !n ? snip(m.text) : L.cls === 'head' && /^\d+$/.test(n) ? n + '.' : n; };
    const groups = new Map();
    hs.forEach(m => { const f = headFault(m, L.size, TH_CH, pt); if (!f) return; if (!groups.has(f)) groups.set(f, []); groups.get(f).push(lab(m)); });
    const badN = [...groups.values()].reduce((a, g) => a + g.length, 0);
    if (badN) set(L.font, 'no', `${badN} จาก ${hs.length} ${L.unit} ${[...groups].map(([f, ls]) => `${f}: ${L.cls === 'title' ? egs(ls, L.unit) : ranges(ls)}`).join(' · ')}`, badN);
    else set(L.font, 'yes', `${hs.length} ${L.unit} ขนาด ${pt(L.size)} ตัวหนา`);
    if (!L.sp) return;
    const badS = [];
    hs.forEach(m => { const b = m.pp.before || 0, a = m.pp.after || 0; if (b !== L.before || a !== L.after || m.pp.autoB || m.pp.autoA) badS.push(`${lab(m)} ก่อน ${b / 20} หลัง ${a / 20} pt`); });
    if (badS.length) set(L.sp, 'no', `${badS.length} จาก ${hs.length} ${L.unit}: ${egs(badS, L.unit)}`, badS.length);
    else set(L.sp, 'yes', `${hs.length} ${L.unit} ก่อน ${L.before / 20} pt หลัง ${L.after / 20} pt`);
  });
  {
    // หัวเรื่อง หัวข้อ และหัวข้อย่อยตรวจในข้อ font.1–3 แล้ว ไม่นำมาตรวจเป็นเนื้อหาอีก
    const bodyP = allBodyP.filter(isBody);
    const headN = allBodyP.filter(m => level.has(m.el)).length;
    const skipNote = headN ? ` · ไม่นับหัวเรื่อง หัวข้อ และหัวข้อย่อย ${headN} ย่อหน้า` : '';
    const sizes = {}; const bad = [];
    bodyP.forEach(m => { const f = charFmt(m, S).find(c => c.size !== 32); if (f) { bad.push(snip(m.text)); sizes[pt(f.size)] = (sizes[pt(f.size)] || 0) + 1; } });
    if (!bodyP.length) hint('font.4', 'ไม่พบย่อหน้าเนื้อหา');
    else if (bad.length) set('font.4', 'no', `${bad.length} ย่อหน้าไม่ใช่ 16 pt (${Object.keys(sizes).map(k => `${k} ${sizes[k]} ย่อหน้า`).join(', ')}) เช่น ${egs(bad, 'ย่อหน้า')} · ตรวจเฉพาะขนาด${skipNote}`, bad.length);
    else set('font.4', 'yes', `${bodyP.length} ย่อหน้าเนื้อหา 16 pt · ตรวจเฉพาะขนาด${skipNote}`);
  }

  /* --- page number (DS ข้อ 5) --- */
  {
    const pageF = ms => [].concat(...ms.map(m => m.fields.filter(f => /\bPAGE\b/.test(f.instr)).map(f => ({m, f}))));
    const inH = pageF(hdrP), inF = pageF(ftrP);
    if (!inH.length) set('pagenum.1', 'no', inF.length ? 'เลขหน้าอยู่ใน Footer ไม่ใช่ Header' : 'ไม่พบฟิลด์เลขหน้า (PAGE) ใน Header');
    else {
      // เลขหน้าในกล่องข้อความที่ยึดตำแหน่งชิดขวา (positionH align = right) อยู่มุมขวา แม้ย่อหน้าในกล่องจัดกึ่งกลาง
      const boxRight = m => {
        const anc = upTo(m.el, a => a.localName === 'anchor' && a.namespaceURI === NS_WP);
        const ph = anc && toArr(anc.childNodes).find(c => c.localName === 'positionH');
        const al = ph && toArr(ph.childNodes).find(c => c.localName === 'align');
        return !!al && al.textContent.trim() === 'right';
      };
      const pos = ({m, f}) => { if (boxRight(m)) return 'right'; const jc = m.pp.jc || 'left'; if (jc === 'right' || jc === 'end') return 'right'; if (jc === 'center') return 'center'; const tabs = (f.pre.match(/\t/g) || []).length; return tabs >= 2 ? 'right' : tabs === 1 ? 'tab' : 'left'; };
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
  {
    /* pagenum.0: เลข 1 เริ่มที่ "บทนำ" ถ้าไม่มีบทนำ เริ่มที่หัวเรื่องแรกของเนื้อหาต่อจากส่วนนำ
       ไม่ตรวจลำดับส่วนนำ และปกจะนับเป็น ก หรือไม่นับก็ได้ */
    const secOf = new Map(); let si = 0;
    blocks.forEach(b => { secOf.set(b, si); if (b.localName === 'p' && wKid(wKid(b, 'pPr'), 'sectPr')) si++; });
    const pg = sects.map(s => { const t = wKid(s, 'pgNumType'); return {fmt:att(t, 'fmt') || 'decimal', start:att(t, 'start')}; });
    const firstText = k => {
      for (const b of blocks) {
        if (secOf.get(b) !== k) continue;
        const m = (b.localName === 'p' ? [b] : wAll(b, 'p')).filter(p => !inFallback(p) && !inTextbox(p)).map(M).find(x => x.text.trim());
        if (m) return m;
      }
      return null;
    };
    const titles = allBodyP.filter(m => level.get(m.el) === 'title' && secOf.has(m.el));
    const intro = titles.find(m => /บทนำ$/.test(m.text.trim()));
    const target = intro || titles.find(m => !FRONT_MATTER.test(m.text.trim()));
    const hasFront = titles.some(m => FRONT_MATTER.test(m.text.trim()));
    const what = intro ? '"บทนำ"' : `หน้าแรกของเนื้อหา ${target ? snip(target.text) : ''}`;
    if (!target) hint('pagenum.0', 'ไม่พบบทนำหรือหัวเรื่องของเนื้อหา ตรวจด้วยตาว่าเลขหน้า 1 เริ่มที่หน้าแรกของเนื้อหา');
    else {
      const k = secOf.get(target.el), p = pg[k], first = firstText(k);
      const restart = pg.findIndex(x => x.fmt === 'decimal' && x.start === '1');
      if (p && p.fmt === 'decimal' && p.start === '1' && first && first.el === target.el) set('pagenum.0', 'yes', `เลขหน้า 1 เริ่มที่ ${what}`);
      else if (restart < 0 && !hasFront) set('pagenum.0', 'yes', 'ไม่มีส่วนนำ เลขหน้าเริ่ม 1 ตั้งแต่หน้าแรก');
      else if (restart < 0) set('pagenum.0', 'no', `ไม่ได้เริ่มเลขหน้า 1 ใหม่ที่ ${what} (ตั้ง Section Break แล้ว Format Page Numbers → Start at 1)`);
      else { const f = firstText(restart); set('pagenum.0', 'no', `เลขหน้า 1 เริ่มที่ ${f ? snip(f.text) : `ส่วนที่ ${restart + 1}`} ไม่ใช่ ${what}`); }
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
  /* หัวตาราง = แถวหัวคอลัมน์ ไม่ใช่แถวแรกเสมอไป: ข้ามแถวคีย์-ค่าด้านบน (2 ช่องมีข้อความ ช่องแรกเป็นป้ายชื่อ อาจมี gridSpan)
     แล้วใช้แถวแรกถัดไปที่ทุกช่องมีข้อความ คืน -1 เมื่อทั้งตารางเป็นคีย์-ค่า (ข้อตกลง QA 2569-11-13) */
  const KV_LABEL = /^(ชื่อเอกสาร|เวอร์ชัน(ปัจจุบัน)?|วันที่(แก้ไข|จัดทำ)|ผู้รับผิดชอบ|ผู้จัดทำ|ผู้ตรวจ|ผู้อนุมัติ|รหัสเอกสาร)/;
  const kvRow = (t, r) => {
    const f = r.filter(c => t.cellText(c));
    return f.length === 2 && (r.length < t.cols || KV_LABEL.test(t.cellText(f[0])) || (boldCell(f[0]) && !boldCell(f[1])));
  };
  const headRow = t => {
    let i = 0; while (i < t.rows.length && kvRow(t, t.rows[i])) i++;
    for (let k = i; k < Math.min(t.rows.length, i + 2); k++) if (t.rows[k].length >= 2 && t.rows[k].every(c => t.cellText(c))) return k;
    return -1;
  };
  const capOf = t => { const m = [near(t.i, -1), near(t.i, 1)].find(x => x && /^ตาราง\s*[\d.-]+/.test(x.text.trim())); return m ? /^ตาราง\s*[\d.-]+/.exec(m.text.trim())[0].replace(/\s+/, ' ') : `ตารางที่ขึ้นต้น ${snip(t.cellText(t.rows[0][0] || []) || 'ตาราง')}`; };
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
    const badHead = [], badNum = []; let headT = 0, kvT = 0, numT = 0;
    // ช่องลำดับที่ใช้เลขอัตโนมัติ (มี numPr แต่ข้อความว่าง) นับเป็นตัวเลข
    const autoNum = c => c.some(m => m.pp.numId && m.pp.numId !== '0');
    const numCell = (t, c) => { const x = t.cellText(c); return x ? /^\d+(\.\d+)?\.?$/.test(x) : autoNum(c); };
    gridT.forEach(t => {
      const hr = headRow(t);
      if (hr < 0) { kvT++; return; }
      headT++;
      t.rows[hr].forEach(c => {
        const probs = new Set();
        c.forEach(m => { if (!m.text.trim()) return; if (m.pp.jc !== 'center') probs.add('ไม่กึ่งกลาง'); if (charFmt(m, S).some(x => !x.bold)) probs.add('ไม่หนา'); });
        if (probs.size) badHead.push(`${capOf(t)}: ${snip(t.cellText(c))} ${[...probs].join(' ')}`);
      });
      // คอลัมน์ลำดับ = คอลัมน์ที่หัวเป็น "ลำดับ" ถ้าไม่มี ใช้คอลัมน์แรกที่เป็นตัวเลข
      const ci = t.rows[hr].findIndex(c => /^ลำดับ/.test(t.cellText(c)));
      const nums = t.rows.slice(hr + 1).map(r => r[ci < 0 ? 0 : ci]).filter(c => c && numCell(t, c));
      if (nums.length) { numT++; if (nums.some(c => c.some(m => (m.text.trim() || autoNum([m])) && m.pp.jc !== 'center'))) badNum.push(capOf(t)); }
    });
    const kvNote = kvT ? ` · ข้ามตารางคีย์-ค่า ${kvT} ตาราง` : '';
    if (!headT) set('table.0', 'na', `ไม่พบตารางที่มีแถวหัวคอลัมน์${kvNote}`);
    else if (badHead.length) set('table.0', 'no', `หัวตาราง ${egs(badHead)}${kvNote}`, badHead.length);
    else set('table.0', 'yes', `หัวตาราง ${headT} ตาราง กึ่งกลาง ตัวหนา${kvNote}`);
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
    // ตารางควบคุมการเปลี่ยนแปลง: แถวหัวคอลัมน์ (ข้ามแถวคีย์-ค่าด้านบน) มีเวอร์ชันและวันที่
    const ctl = gridT.map(t => Object.assign(t, {hr:headRow(t)})).find(t => { if (t.hr < 0) return false; const h = t.rows[t.hr].map(t.cellText).join(' '); return /เวอร์ชัน|version/i.test(h) && /วันที่|date/i.test(h); });
    if (ctl) set('front.1', 'yes', 'พบตารางควบคุมการเปลี่ยนแปลง'); else set('front.1', 'no', 'ไม่พบตารางที่มีคอลัมน์เวอร์ชันและวันที่');
    // front.0: ชื่อระบบบนปก (รวมกล่องข้อความ) ภาพปกตรวจอัตโนมัติไม่ได้
    {
      const src = cover.size ? [...cover] : blocks.slice(0, Math.max(1, blocks.findIndex(b => b.localName === 'p' && wKid(wKid(b, 'pPr'), 'sectPr')) + 1)).flatMap(b => b.localName === 'p' ? [b, ...wAll(b, 'p')] : wAll(b, 'p'));
      const txt = src.map(p => wAll(p, 't').filter(t => ownerP(t) === p).map(t => t.textContent).join('')).join(' ');
      hint('front.0', /stealth\s*trade/i.test(txt) ? 'พบชื่อระบบ "Stealth Trade" บนปก ตรวจชื่อเอกสารและทีมด้วยตา' : 'ไม่พบชื่อระบบบนปก ตรวจภาพปก');
    }
    // version.2: แถวที่ขึ้นแค่หลักที่สาม แต่รายการที่แก้เป็นการเพิ่มหรือแก้เนื้อหา (ข้อตกลง: ต้องขึ้นหลักที่สอง)
    if (ctl) {
      const hrow = ctl.rows[ctl.hr].map(ctl.cellText);
      const ci = hrow.findIndex(h => /รายการ|รายละเอียด/.test(h));
      const rows = ctl.rows.slice(ctl.hr + 1).map(r => {
        const v = (/\d+\.\d+\.\d+/.exec(r.map(ctl.cellText).join(' ')) || [])[0];
        const items = (ci >= 0 && r[ci] ? r[ci] : [].concat(...r)).flatMap(m => m.text.split(/\n|\s(?=[-•]\s?\S)/)).map(s => s.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
        return {v, items};
      }).filter(x => x.v).sort((a, b) => verCmp(a.v, b.v));
      const sus = [];
      rows.forEach((x, i) => {
        const p = rows[i - 1]; if (!p) return;
        const a = x.v.split('.').map(Number), b = p.v.split('.').map(Number);
        const it = x.items.find(s => /เพิ่ม|เขียนข้อมูล|เนื้อหา|หัวข้อ/.test(s));
        if (a[0] === b[0] && a[1] === b[1] && a[2] > b[2] && it) sus.push(`${x.v} ${it.length > 40 ? it.slice(0, 40) + '…' : it}`);
      });
      hint('version.2', sus.length ? `อาจต้องขึ้นหลักที่สอง: ${egs(sus, 'แถว')}` : `ตารางควบคุมการเปลี่ยนแปลง ${rows.length} แถว ไม่พบแถวที่ขึ้นแค่หลักที่สามแต่เพิ่มหรือแก้เนื้อหา ตรวจด้วยตา`);
    }
    if (!ctl) hint('front.2', 'ไม่พบตารางควบคุมการเปลี่ยนแปลง');
    else {
      let last = null;
      ctl.rows.slice(ctl.hr + 1).forEach(r => { const txt = r.map(ctl.cellText).join(' '); const v = (/\d+\.\d+\.\d+/.exec(txt) || [])[0]; if (v && (!last || verCmp(v, last.v) >= 0)) last = {v, txt}; });
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

    // writing.3: "และ" "หรือ" ที่เป็นคำเชื่อมต้องเว้นวรรคข้างหน้า ทั้งเนื้อหาและในตาราง ไม่นับคำใน CONJ_SKIP เช่น "หรือไม่"
    const conj = []; let conjN = 0;
    texts.forEach(t => {
      const skipAt = new Set();
      CONJ_SKIP.forEach(w => { const o = w.search(/และ|หรือ/); for (let p = t.indexOf(w); p >= 0; p = t.indexOf(w, p + 1)) skipAt.add(p + o); });
      const re = /(^|[\s\S])(และ|หรือ)/g; let m;
      while ((m = re.exec(t))) {
        const at = m.index + m[1].length; re.lastIndex = at + m[2].length; conjN++;
        if (m[1] && /[฀-๿A-Za-z0-9)]/.test(m[1]) && !skipAt.has(at)) conj.push(snip(t.slice(Math.max(0, at - 12), at + m[2].length + 12)));
      }
    });
    if (conj.length) { set('writing.3', 'no', `${conj.length} จุดไม่เว้นวรรคหน้า "และ" "หรือ": ${egs(conj)}`, conj.length); tip('writing.3', 'การใช้ "และ" "หรือ" หน้ารายการสุดท้ายเท่านั้น ยังต้องตรวจด้วยตา'); }
    else hint('writing.3', conjN ? `"และ" "หรือ" ${conjN} จุด เว้นวรรคข้างหน้าครบ ตรวจด้วยตาว่าใช้หน้ารายการสุดท้ายเท่านั้น` : 'ไม่พบ "และ" "หรือ" ในเอกสาร');
    // writing.8: รายการใช้สัญลักษณ์ • o - ตามระดับได้ (ข้อตกลง QA) ส่วนการแยกบรรทัดยังตรวจด้วยตา
    hint('writing.8', 'ตรวจด้วยตาว่ารายการไม่เรียงลำดับเกิน 3 รายการแยกบรรทัด ใช้สัญลักษณ์ • o - ตามระดับได้ ไม่นับ • และ o เป็นจุดผิด');

    // lang.0: สระอำที่พิมพ์เป็นนิคหิต + สระอา (ํา) และอักขระที่มองไม่เห็น (U+200B–200D, U+FEFF)
    const nik = [], inv = [];
    all.forEach(t => {
      const re = /ํา/g; let m;
      while ((m = re.exec(t))) {
        let a = m.index, b = m.index + 2;
        while (a > 0 && m.index - a < 4 && /[ก-๎]/.test(t[a - 1])) a--;
        while (b < t.length && b - m.index < 6 && /[ก-๎]/.test(t[b])) b++;
        nik.push(t.slice(a, b));
      }
      INVISIBLE.lastIndex = 0;
      while ((m = INVISIBLE.exec(t))) inv.push(`"${t.slice(Math.max(0, m.index - 6), m.index).trim()}[U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}]${t.slice(m.index + 1, m.index + 7).trim()}"`);
    });
    if (nik.length || inv.length) {
      const parts = [];
      if (nik.length) parts.push(`สระอำพิมพ์เป็น ํ + า ${nik.length} จุด เช่น ${[...new Set(nik)].slice(0, 3).join(', ')}`);
      if (inv.length) parts.push(`อักขระที่มองไม่เห็น ${inv.length} จุด เช่น ${egs(inv)}`);
      set('lang.0', 'no', parts.join(' · '), nik.length + inv.length);
      tip('lang.0', 'คำสะกดผิดอื่นยังต้องตรวจด้วยตา');
    } else hint('lang.0', 'ไม่พบสระอำที่พิมพ์แยก (ํ + า) หรืออักขระที่มองไม่เห็น ตรวจคำสะกดผิดอื่นด้วยตา');
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

  /* --- dsx.2 (เฉพาะ DS): ตารางรหัสเอกสารต้องมีทุกรหัสที่เว็บใช้ (documents.js) --- */
  if (opts.code === 'DS') {
    const ct = gridT.find(t => { const hr = headRow(t); return hr >= 0 && t.rows[hr].some(c => /รหัสเอกสาร/.test(t.cellText(c))); });
    if (!ct) hint('dsx.2', 'ไม่พบตารางรหัสเอกสาร (หัวคอลัมน์ "รหัสเอกสาร") ตรวจด้วยตา');
    else {
      const hr = headRow(ct), ci = ct.rows[hr].findIndex(c => /รหัสเอกสาร/.test(ct.cellText(c)));
      const codes = new Set(ct.rows.slice(hr + 1).map(r => r[ci] ? ct.cellText(r[ci]).trim().toUpperCase() : '').filter(Boolean));
      const all = Object.keys(DOCS), missing = all.filter(c => !codes.has(c));
      if (missing.length) set('dsx.2', 'no', `ตารางรหัสเอกสารไม่มี ${missing.join(', ')} (ในตาราง ${codes.size} รหัส เว็บใช้ ${all.length} รหัส)`, missing.length);
      else set('dsx.2', 'yes', `ครบ ${all.length} รหัสที่เว็บใช้`);
    }
  }

  /* --- Security Standard (SS): กฎหมวด ssx อยู่ใน ss-rules.js --- */
  if (opts.code === 'SS') analyzeSecurityStandard({set, hint, allBodyP, gridT, cover, isToc, tName, secretHits});

  // ซ่อนค่าความลับที่อาจติดมากับข้อความตัวอย่างในผลตรวจข้ออื่น
  if (secretVals.length) Object.values(R).forEach(r => { r.note = redactText(r.note, secretVals); if (r.tip) r.tip = redactText(r.tip, secretVals); });
  return R;
}
