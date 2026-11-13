/* สร้างไฟล์ .docx จำลองสำหรับทดสอบ และรันการตรวจอัตโนมัติใน Node
   ใช้ข้อความสมมติทั้งหมด ไม่ใช้เอกสารจริงของทีม (repo เป็นสาธารณะ) */
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

// browser globals ที่โค้ดตรวจอัตโนมัติใช้
globalThis.window = globalThis;
globalThis.JSZip = JSZip;
globalThis.DOMParser = class extends DOMParser { constructor(){ super({errorHandler:{warning(){}, error(){}}}); } };

const { analyzeDocx } = await import('../../js/autocheck/docx/analyze.js');
const { readDocx } = await import('../../js/autocheck/docx/read.js');
const { DOCS, LONG, MEETING } = await import('../../js/config/documents.js');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// o: {font, sz (half-point), b} ค่าเริ่มต้น TH SarabunPSK 16 pt ตัวปกติ
const run = (t, o = {}) => {
  const f = o.font || 'TH SarabunPSK', sz = o.sz || 32;
  return `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/>${o.b ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
};
// pg: {fmt, start} เลขหน้าของ section
const sectPr = pg => `<w:sectPr>${pg ? `<w:pgNumType${pg.fmt ? ` w:fmt="${pg.fmt}"` : ''}${pg.start ? ` w:start="${pg.start}"` : ''}/>` : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2160" w:left="2160" w:right="1440" w:bottom="1440"/></w:sectPr>`;
/* o: {style, num:[numId, ilvl] ลำดับเลขอัตโนมัติจาก NUMBERING, jc, before, after (twip), sect:{fmt, start} จบ section ที่ย่อหน้านี้} */
const pPr = (o = {}) => {
  const sp = o.before != null || o.after != null ? `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ''}${o.after != null ? ` w:after="${o.after}"` : ''}/>` : '';
  const s = (o.style ? `<w:pStyle w:val="${o.style}"/>` : '') + (o.num ? `<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>` : '') + sp + (o.jc ? `<w:jc w:val="${o.jc}"/>` : '') + (o.sect ? sectPr(o.sect) : '');
  return s ? `<w:pPr>${s}</w:pPr>` : '';
};
// t เป็นข้อความ (run เดียว จัดรูปแบบด้วย o) หรือ [{t, font, sz, b}, …] หลาย run
const para = (t, style, o = {}, num) => `<w:p>${pPr(Object.assign({}, o, {style, num}))}${(Array.isArray(t) ? t : t === '' ? [] : [Object.assign({}, o, {t})]).map(r => run(r.t, r)).join('')}</w:p>`;
// ช่องตาราง: ข้อความ หรือ {t, b, jc, num, span}
const cell = c => { const o = typeof c === 'string' ? {t:c} : c; return `<w:tc>${o.span ? `<w:tcPr><w:gridSpan w:val="${o.span}"/></w:tcPr>` : ''}${para(o.t, null, o, o.num)}</w:tc>`; };
/* ภาพ: {cx, cy (EMU), anchor:true ยึดตำแหน่ง, behind:true วางหลังข้อความ, jc} */
const image = o => {
  const ext = `<wp:extent cx="${o.cx}" cy="${o.cy}"/>`, pic = '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"/></a:graphicData></a:graphic>';
  const d = o.anchor ? `<wp:anchor behindDoc="${o.behind ? 1 : 0}"><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH>${ext}${pic}</wp:anchor>` : `<wp:inline>${ext}${pic}</wp:inline>`;
  return `<w:p>${pPr({jc:o.jc})}<w:r><w:drawing>${d}</w:drawing></w:r></w:p>`;
};
const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.map(r => `<w:tr>${r.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;
/* numId 1: "1." / "1.1" / "1.1.1" (แบบ RD) · 2: bullet • o · 3: "1)" · 4: "1." ที่ตัวเลขเป็น TH Sarabun New · 5: "%1" (ลำดับในตาราง) */
const lvl = (i, fmt, text, font) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/></w:rPr>` : ''}</w:lvl>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="0">${lvl(0, 'decimal', '%1.')}${lvl(1, 'decimal', '%1.%2')}${lvl(2, 'decimal', '%1.%2.%3')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="1">${lvl(0, 'bullet', '•', 'Symbol')}${lvl(1, 'bullet', 'o', 'Courier New')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="2">${lvl(0, 'decimal', '%1)')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="3">${lvl(0, 'decimal', '%1.', 'TH Sarabun New')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="4">${lvl(0, 'decimal', '%1')}</w:abstractNum>
  ${[0, 1, 2, 3, 4].map(a => `<w:num w:numId="${a + 1}"><w:abstractNumId w:val="${a}"/></w:num>`).join('')}
</w:numbering>`;

/* blocks: [{h1:'ข้อความ'}, {h2:'…'}, {h3:'…'}, {p:'…'}, {caption:'ตาราง 1-1 …'}, {table:[['หัว', …], ['ค่า', …]]}]
   p รับ font, sz, b, num:[numId, ilvl], style, jc, before, after, sect ได้ หรือใช้ runs:[{t, font, sz, b}, …] แทน p เพื่อแยกเป็นหลาย run
   opts: {cover:'ข้อความปก', coverBlocks:[…] (blocks เพิ่มบนหน้าปก), header:'<w:p>…</w:p>' (XML ใน Header), pg:{fmt, start} เลขหน้าของ section สุดท้าย}
   ทุกไฟล์มีหน้าปก 1 หน้าแล้วขึ้นหน้าใหม่ เหมือนเอกสารจริง (การตรวจถือว่าทุกอย่างก่อนตัวแบ่งหน้าแรกเป็นหน้าปก) */
export async function makeDocx(blocks, opts = {}){
  const cover = `${para(opts.cover || 'ชื่อเอกสารทดสอบ', null, {after:160})}${(opts.coverBlocks || []).map(b => b.img ? image(b.img) : para(b.p, b.style, b)).join('')}<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const body = cover + blocks.map(b => b.h1 != null ? para(b.h1, 'Heading1', b, b.num) : b.h2 != null ? para(b.h2, 'Heading2', b, b.num) : b.h3 != null ? para(b.h3, 'Heading3', b, b.num)
    : b.caption != null ? para(b.caption, 'Caption', b) : b.img ? image(b.img) : b.table ? table(b.table) : para(b.runs || b.p, b.style, b, b.num)).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}${sectPr(opts.pg)}</w:body></w:document>`);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', NUMBERING);
  if (opts.header) zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">${opts.header}</w:hdr>`);
  return zip.generateAsync({type:'nodebuffer'});
}
// ย่อหน้าที่มีฟิลด์ PAGE (ใช้ใน opts.header) o: {jc, pre:'หน้า | '}
export const pageField = (o = {}) => `<w:p>${pPr({jc:o.jc})}${o.pre ? run(o.pre) : ''}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('1')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
// กล่องข้อความใน Header ที่ยึดตำแหน่งแนวนอนแบบ align (เช่น right) เทียบกับหน้า
export const anchoredBox = (inner, align) => `<w:p><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom="page"><wp:align>${align}</wp:align></wp:positionH><w:txbxContent>${inner}</w:txbxContent></wp:anchor></w:drawing></w:r></w:p>`;

// ผลตรวจอัตโนมัติ {id: {s, note, err?, tip?}} ของไฟล์ (Buffer) ในฐานะเอกสารรหัส code
export async function analyze(buf, code, fileName = `2569-10-25_${code}_V1.0.0.docx`){
  return analyzeDocx(await readDocx(buf), {code, name:DOCS[code].name, fileName, long:LONG.has(code), meeting:MEETING.has(code)});
}
