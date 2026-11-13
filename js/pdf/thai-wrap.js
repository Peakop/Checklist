const segWord = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', {granularity:'word'}) : null;
const segChar = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', {granularity:'grapheme'}) : null;
const words = s => segWord ? Array.from(segWord.segment(s), x => x.segment) : s.split(/(\s+)/);
const chars = s => segChar ? Array.from(segChar.segment(s), x => x.segment) : Array.from(s);
/* Intl.Segmenter ให้เครื่องหมายเป็น token เดี่ยว จึงกำหนดเองว่าตัดบรรทัดตรงไหนไม่ได้:
   ไม่ตัดหลังเครื่องหมายเปิด ไม่ตัดก่อนเครื่องหมายปิดหรือวรรคตอน (แม้มีช่องว่างคั่น) และไม่ตัดกลางวงเล็บหรือคำพูดที่สั้น */
const OPEN_MARK = '([{“‘', CLOSE_MARK = ')]}”’,.:;!?…ฯๆ';
const GROUP_END = {')':'(', ']':'[', '}':'{', '”':'“', '’':'‘', '"':'"'};
// 'o' เปิด, 'c' ปิดหรือวรรคตอน, '' อื่น ๆ; " ตรง ๆ เป็นตัวเปิดเมื่ออยู่ต้นข้อความ หลังช่องว่าง หรือหลังเครื่องหมายเปิด
function markRoles(s){
  const r = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    r.push(ch === '"' ? (i === 0 || /\s/.test(s[i - 1]) || r[i - 1] === 'o' ? 'o' : 'c') : OPEN_MARK.includes(ch) ? 'o' : CLOSE_MARK.includes(ch) ? 'c' : '');
  }
  return r;
}
// แบ่งย่อหน้าเป็นก้อนที่ห้ามตัดกลาง
function wrapUnits(ctx, para, maxW){
  const role = markRoles(para), cuts = new Set();
  let at = 0; for (const w of words(para)) { if (at) cuts.add(at); at += w.length; }
  for (const b of [...cuts]) {
    let i = b - 1; while (i >= 0 && /\s/.test(para[i])) i--;
    let j = b; while (j < para.length && /\s/.test(para[j])) j++;
    if ((i >= 0 && role[i] === 'o') || (j < para.length && role[j] === 'c')) cuts.delete(b);
  }
  // วงเล็บหรือคำพูดที่กว้างไม่เกินครึ่งช่อง เช่น (Regular) หรือ "บทนำ" ย้ายลงบรรทัดใหม่ทั้งก้อน
  const stack = [];
  for (let k = 0; k < para.length; k++) {
    if (role[k] === 'o') { stack.push(k); continue; }
    const o = stack[stack.length - 1];
    if (role[k] !== 'c' || o == null || para[o] !== GROUP_END[para[k]]) continue;
    stack.pop();
    if (ctx.measureText(para.slice(o, k + 1)).width <= maxW / 2) for (let b = o + 1; b <= k; b++) cuts.delete(b);
  }
  const units = []; let from = 0;
  [...cuts].sort((a, b) => a - b).forEach(b => { units.push(para.slice(from, b)); from = b; });
  units.push(para.slice(from));
  return units;
}
export function wrapText(ctx, text, maxW){
  const W = s => ctx.measureText(s).width;
  const lines = [];
  String(text ?? '').split('\n').forEach(para => {
    let line = '';
    for (const u of wrapUnits(ctx, para, maxW)) {
      if (W((line + u).trimEnd()) <= maxW) { line += u; continue; }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      const t = u.replace(/^\s+/, '');
      if (W(t.trimEnd()) <= maxW) { line = t; continue; }
      // ก้อนที่กว้างกว่าช่อง ตัดทีละตัวอักษร แต่เครื่องหมายปิดไม่ขึ้นต้นบรรทัด และเครื่องหมายเปิดไม่ค้างท้ายบรรทัด
      const rs = markRoles(t); let off = 0, prevG = '';
      for (const g of chars(t)) {
        const r = rs[off], rep = g === prevG; off += g.length; prevG = g;
        if (!line && /^\s+$/.test(g)) continue;
        // เครื่องหมายปิดเกาะตัวก่อนหน้าแม้จะล้นเล็กน้อย ยกเว้นเครื่องหมายเดิมซ้ำยาว ๆ เช่น ...... ที่ตัดได้
        if (!line || (r === 'c' && !rep) || W((line + g).trimEnd()) <= maxW) { line += g; continue; }
        const lr = markRoles(line); let k = line.length; while (k > 1 && lr[k - 1] === 'o') k--;
        lines.push(line.slice(0, k).trimEnd()); line = (line.slice(k) + g).trimStart();
      }
    }
    lines.push(line.trimEnd());
  });
  return lines;
}
