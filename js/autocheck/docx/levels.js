/* ระดับหัวข้อตามข้อตกลง QA 2569-11-13 (ยังไม่อยู่ใน DS V2.2.0): แยกระดับจากเลขข้อ ไม่ใช่จากสไตล์ Heading
   หัวเรื่อง = ย่อหน้าที่ไม่มีเลขข้อ และเป็นชื่อบท ส่วน หรือหน้าพิเศษ (Heading 1, Title, TOC Heading, "สารบัญ", "บทนำ", "ส่วนที่ N", บรรทัดหนาใหญ่ที่จัดเอง)
   หัวข้อ = ข้อเลขระดับ 1 รูปแบบ "1."   หัวข้อย่อย = ข้อเลขระดับ 2 รูปแบบ "1.1"   เลขที่ลึกกว่านั้น (1.1.1, 1), (1), •) = เนื้อหา */
import { charFmt } from './model.js';

// ชื่อหน้าพิเศษและชื่อบทที่เป็นหัวเรื่องแม้ไม่ได้ใช้สไตล์ Heading 1
export const FRONT_TITLE = /^(สารบัญ(ตาราง|ภาพ|รูปภาพ)?|การควบคุมการเปลี่ยนแปลงเอกสาร|บทนำ|(บทที่|ส่วนที่)\s*\d+(\s.*)?)$/;
// หน้าพิเศษในส่วนนำ (ไม่ใช่เนื้อหา) ใช้ตรวจว่าเลขหน้า 1 เริ่มที่หน้าแรกของเนื้อหา
export const FRONT_MATTER = /^(สารบัญ(ตาราง|ภาพ|รูปภาพ)?|การควบคุมการเปลี่ยนแปลงเอกสาร)$/;
const DECIMAL = new Set([undefined, null, 'decimal', 'decimalZero', 'thaiNumbers']);

/* เลขข้อที่ Word แสดงสำหรับย่อหน้าลำดับเลขอัตโนมัติ (ไม่นับ bullet) นับจากลำดับย่อหน้าในเอกสาร
   คืน Map(el → {label, text, fmt, key, ilvl}); ระดับที่ lvlText ว่าง (ไม่แสดงเลข) ยังนับตัวเลข แต่ไม่ใส่ label */
export function numberLabels(ms, N){
  const out = new Map(), ctr = {};
  ms.forEach(m => {
    const id = m.pp.numId; if (!id || id === '0') return;
    const n = N(id), il = m.pp.ilvl || 0, L = n.lvl(il);
    if (L.fmt === 'bullet' || L.fmt === 'none') return;
    const c = ctr[n.key] || (ctr[n.key] = []);
    for (let k = 0; k < il; k++) if (c[k] == null) c[k] = n.lvl(k).start || 1;
    c[il] = c[il] == null ? (L.start || 1) : c[il] + 1; c.length = il + 1;
    const text = L.text != null ? L.text : c.map((_, k) => `%${k + 1}`).join('.');
    if (!text.trim()) return;
    const label = text.replace(/%(\d)/g, (_, k) => c[k - 1] != null ? c[k - 1] : 1).trim().replace(/[.)]$/, '');
    out.set(m.el, {label, text:text.trim(), fmt:L.fmt, key:n.key, ilvl:il});
  });
  return out;
}

// เลขที่พิมพ์เองหน้าข้อความ เช่น "1." "1.1" "1.1.1"
export const typedNo = t => (/^(\d+(?:\.\d+)*)\.?\s/.exec(t.trim()) || [])[1] || null;
/* ระดับเลขข้อ: 1 = "1."  2 = "1.1"  3 = ลึกกว่า หรือรูปแบบอื่น เช่น "1)" "(1)" "ก."  0 = ไม่มีเลขข้อ */
export function numLevel(m, labels){
  const a = labels.get(m.el);
  if (a) {
    if (!DECIMAL.has(a.fmt)) return 3;
    if (/^%\d\.$/.test(a.text)) return 1;
    if (/^%\d\.%\d\.?$/.test(a.text)) return 2;
    return 3;
  }
  const t = m.text.trim();
  if (/^\d+\.\d+\.\d+/.test(t)) return 3;
  if (/^\d+\.\d+\.?\s/.test(t)) return 2;
  if (/^\d+\.\s/.test(t)) return 1;
  if (/^\(?\d+\)/.test(t)) return 3;
  return 0;
}
// บรรทัดสั้นที่จัดรูปแบบเอง: ไม่เกิน 60 ตัวอักษร หนาทั้งบรรทัด และใหญ่กว่า 16 pt
export const manualHead = (m, S) => { const f = charFmt(m, S); return m.text.trim().length <= 60 && f.length > 0 && f.every(c => c.bold && c.size > 32); };

/* แยกระดับย่อหน้า → 'title' (หัวเรื่อง) | 'head' (หัวข้อ) | 'sub' (หัวข้อย่อย) | null (เนื้อหา)
   Heading 2/3 ที่ไม่มีเลขข้อ ยังนับเป็นหัวข้อ/หัวข้อย่อยตามสไตล์ */
export function classify(m, S, labels){
  const lv = numLevel(m, labels);
  if (lv === 1) return 'head';
  if (lv === 2) return 'sub';
  if (lv === 3) return null;
  const t = m.text.trim();
  if (m.lvl === 0 || /^(title|toc heading)$/.test(m.style) || (t.length <= 80 && FRONT_TITLE.test(t))) return 'title';
  if (m.lvl === 1) return 'head';
  if (m.lvl === 2) return 'sub';
  return manualHead(m, S) ? 'title' : null;
}
// เลขข้อที่ใช้ยกตัวอย่างในผลตรวจ
export const labelOf = (m, labels) => (labels.get(m.el) || {}).label || typedNo(m.text) || null;

/* ขนาดฝั่ง cs (szCs) เมื่อ run มีอักษรไทย ฝั่งละตินเมื่อไม่มี และตัวหนานับทั้ง b และ bCs → "ขนาด 14 pt ไม่หนา" หรือ '' */
export function headFault(m, size, TH_CH, pt){
  const p = new Set();
  m.runs.forEach(({e, text}) => {
    if (!text.trim()) return;
    const sz = TH_CH.test(text) ? (e.szc != null ? e.szc : e.sz != null ? e.sz : 20) : (e.sz != null ? e.sz : 20);
    if (sz !== size) p.add(`ขนาด ${pt(sz)}`);
    if (!e.b && !e.bc) p.add('ไม่หนา');
  });
  return [...p].sort().join(' ');
}
// "3.1, 3.2, 3.3" → "3.1–3.3" แสดงไม่เกิน 6 ช่วง
export function ranges(labels){
  const out = [];
  labels.forEach(l => {
    const last = out[out.length - 1], p = /^(.*\.)(\d+)$/.exec(l);
    if (last && p && last.pre === p[1] && last.to + 1 === +p[2]) { last.to++; last.n++; }
    else out.push(p ? {pre:p[1], from:+p[2], to:+p[2], n:1} : {txt:l, n:1});
  });
  const txt = r => r.txt || (r.to - r.from >= 2 ? `${r.pre}${r.from}–${r.pre}${r.to}` : Array.from({length:r.to - r.from + 1}, (_, k) => `${r.pre}${r.from + k}`).join(', '));
  const shown = out.slice(0, 6), rest = out.slice(6).reduce((a, r) => a + r.n, 0);
  return shown.map(txt).join(', ') + (rest ? ` และอีก ${rest} ข้อ` : '');
}
