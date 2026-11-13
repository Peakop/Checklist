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
const run = t => `<w:r><w:rPr><w:rFonts w:ascii="TH SarabunPSK" w:hAnsi="TH SarabunPSK" w:cs="TH SarabunPSK"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
const para = (t, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${run(t)}</w:p>`;
const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.map(r => `<w:tr>${r.map(c => `<w:tc>${para(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;

/* blocks: [{h1:'ข้อความ'}, {h2:'…'}, {p:'…'}, {caption:'ตาราง 1-1 …'}, {table:[['หัว', …], ['ค่า', …]]}]
   ทุกไฟล์มีหน้าปก 1 หน้าแล้วขึ้นหน้าใหม่ เหมือนเอกสารจริง (การตรวจถือว่าทุกอย่างก่อนตัวแบ่งหน้าแรกเป็นหน้าปก) */
export async function makeDocx(blocks){
  const cover = `${para('ชื่อเอกสารทดสอบ')}<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const body = cover + blocks.map(b => b.h1 != null ? para(b.h1, 'Heading1') : b.h2 != null ? para(b.h2, 'Heading2')
    : b.caption != null ? para(b.caption, 'Caption') : b.table ? table(b.table) : para(b.p)).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="2160" w:left="2160" w:right="1440" w:bottom="1440"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml', STYLES);
  return zip.generateAsync({type:'nodebuffer'});
}

// ผลตรวจอัตโนมัติ {id: {s, note, err?, tip?}} ของไฟล์ (Buffer) ในฐานะเอกสารรหัส code
export async function analyze(buf, code, fileName = `2569-10-25_${code}_V1.0.0.docx`){
  return analyzeDocx(await readDocx(buf), {code, name:DOCS[code].name, fileName, long:LONG.has(code), meeting:MEETING.has(code)});
}
