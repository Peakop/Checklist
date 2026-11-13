import { NS_A, att, inFallback, onOff, ownerP, toArr, upTo, wAll, wKid, wKids } from './xml.js';
import { TH_CH } from '../text.js';

export const SARABUN = /^TH\s*Sarabun\s*PSK$/i;
export const SYMBOL_FONT = /^(Symbol|Wingdings.*|Webdings|Segoe UI (Symbol|Emoji)|Cambria Math|MS Gothic|MS Mincho)$/i;
// ฟอนต์ของโค้ดตัวอย่าง (ไม่นับในข้อ font.0)
export const CODE_FONT = /^(Consolas|Courier New|Cascadia (Code|Mono)|Menlo|Monaco|JetBrains Mono|Fira Code)$/i;
export const PLACEHOLDER = /ชื่อเอกสารภาษาไทย|ชื่อเอกสารภาษาอังกฤษ|lorem ipsum|คลิกหรือแตะที่นี่|click or tap here|ใส่ข้อความ|\bx{3,}\b/i;
export const LEFTISH = new Set(['left','start','both','distribute','thaiDistribute','lowKashida','mediumKashida','highKashida']);
export const MIN_IMG_EMU = 1440000;   // ภาพกว้างไม่ถึง 4 ซม. ถือเป็นโลโก้หรือไอคอน ไม่ต้องมีชื่อภาพ
/* อักขระที่ TH SarabunPSK ไม่มี Word จึงดึงฟอนต์อื่น (เช่น Arial, Segoe UI Symbol) มาแสดงแทน เปลี่ยนเป็น Sarabun ไม่ได้
   ช่วง: Greek, Arrows, Mathematical Operators, Misc Technical, Box Drawing, Geometric Shapes, Misc Symbols/Dingbats, emoji
   ยกเว้นตัวที่ฟอนต์มีจริง (ตรวจจาก cmap ของ assets/fonts/THSarabunPSK*.ttf): ∂ ∆ ∏ ∑ − √ ∞ ∫ ≈ ≠ ≤ ≥ ◊ ◌ */
const NO_GLYPH_RANGES = [[0x0370, 0x03FF], [0x2190, 0x21FF], [0x2200, 0x22FF], [0x2300, 0x23FF], [0x2500, 0x257F], [0x25A0, 0x25FF], [0x2600, 0x27BF], [0xFE0E, 0xFE0F], [0x1F300, 0x10FFFF]];
const SARABUN_HAS = new Set([0x2202, 0x2206, 0x220F, 0x2211, 0x2212, 0x221A, 0x221E, 0x222B, 0x2248, 0x2260, 0x2264, 0x2265, 0x25CA, 0x25CC]);
export const NO_SARABUN_GLYPH = ch => { const c = ch.codePointAt(0); return !SARABUN_HAS.has(c) && NO_GLYPH_RANGES.some(([a, b]) => c >= a && c <= b); };
function rPrOf(rPr){
  const o = {}; if (!rPr) return o;
  const f = wKid(rPr, 'rFonts');
  if (f) {
    const a = att(f, 'asciiTheme') ? '@' + att(f, 'asciiTheme') : att(f, 'ascii') || att(f, 'hAnsi'); if (a) o.fa = a;
    const c = att(f, 'cstheme') ? '@' + att(f, 'cstheme') : att(f, 'cs'); if (c) o.fc = c;
  }
  const sz = att(wKid(rPr, 'sz')), szc = att(wKid(rPr, 'szCs'));
  if (sz != null) o.sz = +sz; if (szc != null) o.szc = +szc;
  const b = onOff(wKid(rPr, 'b')), bc = onOff(wKid(rPr, 'bCs'));
  if (b !== undefined) o.b = b; if (bc !== undefined) o.bc = bc;
  const rs = att(wKid(rPr, 'rStyle')); if (rs) o.rs = rs;
  return o;
}
function pPrOf(pPr){
  const o = {}; if (!pPr) return o;
  const jc = att(wKid(pPr, 'jc')); if (jc) o.jc = jc;
  const sp = wKid(pPr, 'spacing');
  if (sp) {
    ['before','after','line'].forEach(k => { const v = att(sp, k); if (v != null) o[k] = +v; });
    const lr = att(sp, 'lineRule'); if (lr) o.lineRule = lr;
    if (/^(1|true|on)$/.test(att(sp, 'beforeAutospacing') || '')) o.autoB = true;
    if (/^(1|true|on)$/.test(att(sp, 'afterAutospacing') || '')) o.autoA = true;
  }
  const ol = att(wKid(pPr, 'outlineLvl')); if (ol != null) o.lvl = +ol;
  const ps = att(wKid(pPr, 'pStyle')); if (ps) o.ps = ps;
  if (onOff(wKid(pPr, 'pageBreakBefore'))) o.pbb = true;
  const np = wKid(pPr, 'numPr');
  if (np) {
    const id = att(wKid(np, 'numId')), il = att(wKid(np, 'ilvl'));
    o.list = id !== '0';
    if (id != null) o.numId = id;
    if (il != null) o.ilvl = +il;
  }
  return o;
}
/* numbering.xml: numId → list key (abstractNum ที่ใช้ร่วมกัน) และรูปแบบแต่ละระดับ
   {fmt, text (lvlText), start, font (ฟอนต์ของตัวเลขข้อ = ascii/hAnsi เพราะตัวเลขเป็นอักษรละติน)} */
export function readNumbering(doc){
  const abs = {}, nums = {}, root = doc && doc.documentElement;
  if (root) {
    wKids(root, 'abstractNum').forEach(a => {
      const lv = {};
      wKids(a, 'lvl').forEach(l => {
        const f = wKid(wKid(l, 'rPr'), 'rFonts');
        const font = f ? (att(f, 'asciiTheme') ? '@' + att(f, 'asciiTheme') : att(f, 'ascii') || att(f, 'hAnsi')) : null;
        lv[+att(l, 'ilvl')] = {fmt:att(wKid(l, 'numFmt')), text:att(wKid(l, 'lvlText')), start:+(att(wKid(l, 'start')) || 1), font};
      });
      abs[att(a, 'abstractNumId')] = lv;
    });
    wKids(root, 'num').forEach(n => { nums[att(n, 'numId')] = att(wKid(n, 'abstractNumId')); });
  }
  return id => {
    const a = nums[id];
    return {key:a != null ? 'a' + a : 'n' + id, lvl:i => (a != null && abs[a] && abs[a][i]) || {}};
  };
}
export function readStyles(doc, themeDoc){
  const st = {}, root = doc && doc.documentElement;
  const S = {defR:{}, defP:{}, defPara:null, defTable:null, theme:{}};
  if (root) {
    const dd = wKid(root, 'docDefaults');
    S.defR = rPrOf(wKid(wKid(dd, 'rPrDefault'), 'rPr')); S.defP = pPrOf(wKid(wKid(dd, 'pPrDefault'), 'pPr'));
    wKids(root, 'style').forEach(s => {
      const id = att(s, 'styleId'); if (!id) return;
      const o = {type:att(s, 'type'), name:(att(wKid(s, 'name')) || id).toLowerCase(), based:att(wKid(s, 'basedOn')), r:rPrOf(wKid(s, 'rPr')), p:pPrOf(wKid(s, 'pPr')), cond:{}};
      wKids(s, 'tblStylePr').forEach(c => o.cond[att(c, 'type')] = {r:rPrOf(wKid(c, 'rPr')), p:pPrOf(wKid(c, 'pPr'))});
      st[id] = o;
      if (/^(1|true|on)$/.test(att(s, 'default') || '')) { if (o.type === 'paragraph') S.defPara = id; if (o.type === 'table') S.defTable = id; }
    });
  }
  const memo = {};
  S.get = id => {
    if (!id || !st[id]) return {r:{}, p:{}, cond:{}, name:''};
    if (memo[id]) return memo[id];
    const chain = []; const seen = new Set();
    for (let k = id; k && st[k] && !seen.has(k); k = st[k].based) { seen.add(k); chain.unshift(st[k]); }
    const m = {r:{}, p:{}, cond:{}, name:st[id].name};
    chain.forEach(s => {
      Object.assign(m.r, s.r); Object.assign(m.p, s.p);
      Object.keys(s.cond).forEach(k => m.cond[k] = {r:Object.assign({}, m.cond[k] && m.cond[k].r, s.cond[k].r), p:Object.assign({}, m.cond[k] && m.cond[k].p, s.cond[k].p)});
    });
    return memo[id] = m;
  };
  if (themeDoc) ['major','minor'].forEach(k => {
    const f = themeDoc.getElementsByTagNameNS(NS_A, k + 'Font').item(0); if (!f) return;
    const face = n => { const e = f.getElementsByTagNameNS(NS_A, n).item(0); return e ? e.getAttribute('typeface') : ''; };
    let thai = ''; toArr(f.getElementsByTagNameNS(NS_A, 'font')).forEach(e => { if (e.getAttribute('script') === 'Thai') thai = e.getAttribute('typeface'); });
    S.theme[k + 'HAnsi'] = S.theme[k + 'Ascii'] = face('latin'); S.theme[k + 'Bidi'] = face('cs') || thai; S.theme[k + 'EastAsia'] = face('ea');
  });
  S.font = n => !n ? 'Times New Roman' : n[0] === '@' ? (S.theme[n.slice(1)] || n.slice(1)) : n;
  return S;
}
/* paragraph model: effective paragraph props, its own runs with effective formatting, text and fields */
export function paraModel(p, S, tbl){
  const direct = pPrOf(wKid(p, 'pPr'));
  const sm = S.get(direct.ps || S.defPara);
  const tm = tbl && tbl.style ? S.get(tbl.style) : null;
  const cond = tbl && tbl.firstRow && tm && tm.cond.firstRow ? tm.cond.firstRow : {r:{}, p:{}};
  const pp = Object.assign({}, S.defP, tm && tm.p, cond.p, sm.p, direct);
  // รูปแบบเลขข้อจาก numbering.xml (S.N ตั้งโดย analyzeDocx) เช่น lvlText "%1." หรือ "%1.%2"
  if (pp.numId && pp.numId !== '0' && S.N) { const L = S.N(pp.numId).lvl(pp.ilvl || 0); pp.lvlText = L.text; pp.numFmt = L.fmt; }
  const baseR = Object.assign({}, S.defR, tm && tm.r, cond.r, sm.r);
  const runs = wAll(p, 'r').filter(r => ownerP(r) === p).map(r => {
    const rp = rPrOf(wKid(r, 'rPr'));
    const e = Object.assign({}, baseR, rp.rs ? S.get(rp.rs).r : {}, rp);
    let text = '';
    wKids(r).forEach(c => { if (c.localName === 't') text += c.textContent; else if (c.localName === 'tab' || c.localName === 'ptab') text += '\t'; else if (c.localName === 'br' || c.localName === 'cr') text += '\n'; });
    return {el:r, e, text};
  });
  const fields = [], stack = [];
  runs.forEach(run => wKids(run.el).forEach(c => {
    const top = stack[stack.length - 1];
    if (c.localName === 'fldChar') {
      const t = att(c, 'fldCharType');
      if (t === 'begin') stack.push({instr:'', res:[], begin:run, sep:false, pre:runs.slice(0, runs.indexOf(run)).map(x => x.text).join('')});
      else if (t === 'separate' && top) top.sep = true;
      else if (t === 'end' && top) fields.push(stack.pop());
    } else if (c.localName === 'instrText' && top) top.instr += c.textContent;
    else if (c.localName === 't' && top && top.sep && !top.res.includes(run)) top.res.push(run);
  }));
  fields.push(...stack);
  wAll(p, 'fldSimple').filter(f => ownerP(f) === p).forEach(f => {
    const res = runs.filter(x => upTo(x.el, a => a === f));
    fields.push({instr:att(f, 'instr') || '', res, begin:res[0] || null, pre:res.length ? runs.slice(0, runs.indexOf(res[0])).map(x => x.text).join('') : ''});
  });
  const text = runs.map(x => x.text).join('');
  const style = sm.name;
  return {el:p, pp, runs, text, fields, style, lvl:pp.lvl != null && pp.lvl < 9 ? pp.lvl : null};
}
/* character-weighted formatting: Thai uses the complex-script props (cs/szCs/bCs), everything else the Latin ones */
export function charFmt(m, S){
  const out = [];
  m.runs.forEach(({e, text}) => {
    let th = 0, la = 0;
    for (const ch of text) { if (/\s/.test(ch)) continue; if (TH_CH.test(ch)) th++; else la++; }
    if (th) out.push({n:th, font:S.font(e.fc), size:e.szc != null ? e.szc : (e.sz != null ? e.sz : 20), bold:!!e.bc, text});
    if (la) out.push({n:la, font:S.font(e.fa), size:e.sz != null ? e.sz : 20, bold:!!e.b, text});
  });
  return out;
}
export function tableModel(tbl, S){
  const tblPr = wKid(tbl, 'tblPr');
  const style = att(wKid(tblPr, 'tblStyle')) || S.defTable;
  const look = wKid(tblPr, 'tblLook');
  const firstRowOn = !look || att(look, 'firstRow') === '1' || (!att(look, 'firstRow') && (parseInt(att(look) || '4A0', 16) & 0x20) !== 0);
  const rows = wKids(tbl, 'tr').map((tr, ri) => wKids(tr, 'tc').map(tc => wAll(tc, 'p').filter(p => !inFallback(p) && upTo(p, a => a.localName === 'tc') === tc).map(p => paraModel(p, S, {style, firstRow:ri === 0 && firstRowOn}))));
  const cellText = c => c.map(m => m.text).join(' ').trim();
  return {el:tbl, rows, cols:Math.max(0, ...rows.map(r => r.length)), cellText, text:rows.map(r => r.map(cellText).join(' | ')).join('\n')};
}
export const TOC_KIND = instr => {
  if (!/^\s*TOC\b/i.test(instr)) return null;
  const c = /\\c\s+"?([^"\\]+)"?/i.exec(instr);
  if (c) return /ภาพ|รูป|figure/i.test(c[1]) ? 'img' : /ตาราง|table/i.test(c[1]) ? 'tbl' : 'other';
  return /\\a\b/i.test(instr) ? 'other' : 'main';
};
