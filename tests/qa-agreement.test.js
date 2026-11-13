/* ข้อตกลงการตีความ DS V2.2.0 ของทีม QA (2569-11-13) ข้อ A–H ทดสอบกับเอกสารจำลอง (ข้อความสมมติทั้งหมด)
   แต่ละข้อมีอย่างน้อย 1 กรณีผ่าน และ 1 กรณีไม่ผ่าน */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocx, analyze, pageField, anchoredBox } from './helpers/docx.js';
import { DOCS } from '../js/config/documents.js';

const run = async (blocks, code = 'RD', opts) => analyze(await makeDocx(blocks, opts), code);
const ok = (R, id) => assert.equal(R[id].s, 'yes', `${id}: ${R[id].note}`);
const no = (R, id, err) => { assert.equal(R[id].s, 'no', `${id}: ${R[id].note}`); if (err != null) assert.equal(R[id].err, err, `${id}: ${R[id].note}`); };

// ย่อหน้าบรรยายที่ผ่านเกณฑ์ระยะ (Single ก่อน 0 หลัง 8 pt)
const P = t => ({p:t, after:160});
const TITLE = {p:'Stealth Trade', sz:40, b:true, before:320, after:40};
const head = (t, o = {}) => Object.assign({p:t, style:'ListParagraph', num:[1, 0], sz:36, b:true, before:120, after:40}, o);
const sub = (t, o = {}) => Object.assign({p:t, style:'ListParagraph', num:[1, 1]}, o);

/* ---------- A. ระดับหัวข้อจากเลขข้อ (font.1–4, spacing.1–2) ---------- */
test('A: ลำดับเลข ilvl 0 หนา 18 pt คือหัวข้อ ilvl 1 ตัวปกติ 3 ข้อ ได้ font.3 ไม่ผ่าน 3', async () => {
  const R = await run([TITLE, head('ชื่อระบบ'), P('ระบบตัวอย่างสำหรับทดสอบ'),
    head('ขอบเขต'), sub('ผู้ใช้'), sub('ผู้ใช้ทั่วไปเข้าใช้ระบบผ่านเว็บไซต์ได้ตลอดเวลา'),
    {p:'รายการย่อย', style:'ListParagraph', num:[2, 1]},   // bullet ไม่ใช่หัวข้อย่อย
    head('ความต้องการ'), sub('ความต้องการด้านระบบ')]);
  no(R, 'font.3', 3);
  assert.equal(R['font.3'].note, '3 จาก 3 ข้อ ไม่หนา: 2.1, 2.2, 3.1');
  ok(R, 'font.1'); ok(R, 'font.2'); ok(R, 'spacing.1'); ok(R, 'spacing.2');
  assert.match(R['font.4'].note, /ไม่นับหัวเรื่อง หัวข้อ และหัวข้อย่อย 7 ย่อหน้า/);
});

test('A: แบบ RD V1.6.0 ได้ "14 จาก 14 ข้อ ไม่หนา: 2.1, 3.1–3.6, 4.1–4.7"', async () => {
  const b = [TITLE, head('ชื่อระบบ'), P('ระบบตัวอย่าง'), head('ภาพรวม'), sub('ภาพรวมระบบ')];
  b.push(head('ความต้องการ')); for (let i = 1; i <= 6; i++) b.push(sub(`ความต้องการข้อที่ ${i}`));
  b.push(head('ข้อจำกัด')); for (let i = 1; i <= 7; i++) b.push(sub(`ระบบต้องรองรับข้อจำกัดที่ ${i} ตามที่ตกลงไว้`));
  const R = await run(b);
  no(R, 'font.3', 14);
  assert.equal(R['font.3'].note, '14 จาก 14 ข้อ ไม่หนา: 2.1, 3.1–3.6, 4.1–4.7');
});

test('A: หัวข้อย่อยหนา 16 pt ผ่าน และเลขที่ลึกกว่า 1.1 เป็นเนื้อหา', async () => {
  const R = await run([TITLE, head('ขอบเขต'), sub('ผู้ใช้', {b:true}), {p:'ข้อย่อยระดับสาม', style:'ListParagraph', num:[1, 2]}, sub('ผู้ดูแล', {b:true})]);
  ok(R, 'font.3');
  assert.equal(R['font.3'].note, '2 ข้อ ขนาด 16 pt ตัวหนา');
  ok(R, 'font.4');
});

test('A: แยกระดับจากเลขข้อ ไม่ใช่สไตล์ Heading (Heading 2 ที่เป็น "1.1" คือหัวข้อย่อย)', async () => {
  const R = await run([
    {h1:'บทนำ', sz:40, b:true, before:320, after:40},
    {h2:'1. วัตถุประสงค์', sz:36, b:true, before:120, after:40},
    {h2:'1.1 ขอบเขตของเอกสาร', sz:36, b:true},          // เลข 1.1 = หัวข้อย่อย ต้อง 16 pt
    {h3:'1.2 ผู้อ่าน', b:true},
    {h3:'1.2.1 ผู้อ่านหลัก', b:true}, P('เนื้อหาทั่วไป'),   // 1.2.1 = เนื้อหา
  ]);
  ok(R, 'font.1'); ok(R, 'font.2');
  no(R, 'font.3', 1);
  assert.equal(R['font.3'].note, '1 จาก 2 ข้อ ขนาด 18 pt: 1.1');
});

test('A: หัวเรื่อง = TOC Heading, "สารบัญตาราง", "ส่วนที่ N" และบรรทัดหนาใหญ่ที่จัดเอง ตรวจ 20 pt และระยะ 16/2 pt', async () => {
  const R = await run([
    {p:'สารบัญ', style:'TOCHeading', sz:40, b:true, before:320, after:40},
    {p:'สารบัญตาราง', sz:40, b:true},                      // ไม่ได้ตั้งระยะ 16/2 pt
    {p:'ส่วนที่ 1 บทนำ', sz:36, b:true, before:320, after:40},   // 18 pt ไม่ใช่ 20 pt
    TITLE, P('เนื้อหา'),
  ]);
  no(R, 'font.1', 1);
  assert.match(R['font.1'].note, /1 จาก 4 หัวเรื่อง ขนาด 18 pt: "ส่วนที่ 1 บทนำ"/);
  no(R, 'spacing.1', 1);
  assert.match(R['spacing.1'].note, /"สารบัญตาราง" ก่อน 0 หลัง 0 pt/);
});

test('A: spacing.2 หัวข้อ "1." ต้องก่อน 6 หลัง 2 pt', async () => {
  const R = await run([TITLE, head('ชื่อระบบ'), head('ขอบเขต', {before:0, after:160}), P('เนื้อหา')]);
  no(R, 'spacing.2', 1);
  assert.match(R['spacing.2'].note, /2\. ก่อน 0 หลัง 8 pt/);
});

test('A: เลขพิมพ์เอง "1." เป็นหัวข้อ "1.1 " เป็นหัวข้อย่อย ไม่นับบรรทัดสารบัญที่พิมพ์เอง', async () => {
  const R = await run([TITLE, {p:'1. ชื่อระบบ\t3'}, {p:'1.1 ผู้ใช้\t3'},
    {p:'1. ชื่อระบบ', sz:36, b:true}, {p:'1.1 ระบบนี้ใช้สำหรับทดสอบการตรวจ'}, {p:'1.2 ผู้ใช้', b:true}, P('ย่อหน้าเนื้อหาทั่วไป')]);
  ok(R, 'font.2');
  no(R, 'font.3', 1);
  assert.equal(R['font.3'].note, '1 จาก 2 ข้อ ไม่หนา: 1.1');
});

test('A: รายการ "1." ที่เริ่มนับใหม่ใต้หัวข้อย่อยเป็นรายการซ้อน (เนื้อหา) ไม่ใช่หัวข้อ', async () => {
  const R = await run([TITLE, {p:'1. ชื่อระบบ', sz:36, b:true, before:120, after:40}, {p:'1.1 การใช้งาน', b:true},
    P('1. เปิดเว็บไซต์'), P('2. กดปุ่มเข้าสู่ระบบ'),            // ขั้นตอนใต้ข้อ 1.1
    {p:'2. ขอบเขต', sz:36, b:true, before:120, after:40}]);    // หัวข้อจริงนับต่อจาก 1.
  ok(R, 'font.2');
  assert.equal(R['font.2'].note, '2 ข้อ ขนาด 18 pt ตัวหนา');
  ok(R, 'font.4');
});

/* ---------- C. ตัวพิมพ์ (font.0) ---------- */
test('C: "→" เป็น Arial และช่องว่างเป็น Arial ไม่นับ ได้ font.0 ผ่าน', async () => {
  const R = await run([P('บทนำของเอกสาร'),
    {runs:[{t:'ขั้นตอนแรก '}, {t:'→', font:'Arial'}, {t:' ขั้นตอนถัดไป '}, {t:'→', font:'Arial'}, {t:' ขั้นตอนสุดท้าย'}]},
    {runs:[{t:'ข้อความ'}, {t:'  ', font:'Arial'}, {t:'ต่อกัน'}]}]);
  ok(R, 'font.0');
  assert.match(R['font.0'].note, /ไม่นับ → 2 ตัว \(TH SarabunPSK ไม่มีอักขระนี้\)/);
});

test('C: สัญลักษณ์ปนข้อความทั่วไปใน run เดียวกัน หรืออักขระที่ Sarabun มี (≤) ยังนับ', async () => {
  const R = await run([P('บทนำของเอกสาร'), {runs:[{t:'เริ่ม '}, {t:'→ ถัดไป', font:'Arial'}]}, {runs:[{t:'ค่าต้อง '}, {t:'≤', font:'Arial'}, {t:' 10'}]}]);
  no(R, 'font.0', 2);
});

test('C: ตัวเลขข้อในลำดับเลขเป็น TH Sarabun New ได้ font.0 ไม่ผ่าน 1 จุดต่อ 1 รูปแบบ bullet • o ไม่นับ', async () => {
  const bullets = [{p:'รายการจุด', num:[2, 0]}, {p:'รายการย่อย', num:[2, 1]}];
  ok(await run([P('บทนำ'), ...bullets]), 'font.0');
  const R = await run([P('บทนำ'), ...bullets, {p:'ข้อแรก', num:[4, 0]}, {p:'ข้อสอง', num:[4, 0]}]);
  no(R, 'font.0', 1);
  assert.match(R['font.0'].note, /ตัวเลขข้อ "1\." ใช้ TH Sarabun New/);
});

test('C: ไม่นับโค้ดตัวอย่าง (ฟอนต์ monospace ทุก run หรือสไตล์ Code)', async () => {
  const R = await run([P('ตัวอย่างโค้ด'), {p:'return true;', font:'Consolas'}, {p:'echo $x;', font:'Arial', style:'Code'}]);
  ok(R, 'font.0');
  assert.match(R['font.0'].note, /ไม่นับโค้ดตัวอย่าง 2 ย่อหน้า/);
  // โค้ดปนข้อความไทยในย่อหน้าเดียวกันไม่ใช่โค้ดตัวอย่าง
  no(await run([{runs:[{t:'คำสั่ง '}, {t:'npm test', font:'Consolas'}]}]), 'font.0', 1);
});

test('C: ข้อความแม่แบบใน Header ไม่ได้รับยกเว้น', async () => {
  const R = await run([P('บทนำ')], 'RD', {header:'<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>Software Engineering</w:t></w:r></w:p>'});
  no(R, 'font.0', 1);
  assert.match(R['font.0'].note, /Arial/);
});

/* ---------- D. การเขียน (writing.3, writing.8) ---------- */
test('D: writing.3 "และ" "หรือ" ติดคำข้างหน้าเป็นจุดผิด ทั้งเนื้อหาและในตาราง ไม่นับ "หรือไม่"', async () => {
  const R = await run([P('ระบบมีแมวและสุนัข'), P('ตรวจว่าถูกต้องหรือไม่ ทุกครั้ง'), P('เลือก A หรือ B ได้'), {table:[['หัว', 'รายการ'], ['1', 'เอกสารและภาพ']]}]);
  no(R, 'writing.3', 2);
  assert.match(R['writing.3'].note, /แมวและสุนัข/);
  assert.match(R['writing.3'].tip, /หน้ารายการสุดท้ายเท่านั้น/);
  const good = await run([P('ระบบมีแมว และสุนัข'), P('ตรวจว่าถูกต้องหรือไม่')]);
  assert.equal(good['writing.3'].s, null);   // เว้นวรรคครบ ส่วน "หน้ารายการสุดท้าย" ตรวจด้วยตา
  assert.match(good['writing.3'].note, /เว้นวรรคข้างหน้าครบ/);
});

test('D: writing.8 เป็นคำแนะนำ ยอมรับ • o - ตามระดับ', async () => {
  const R = await run([{p:'รายการจุด', num:[2, 0]}, {p:'รายการย่อย', num:[2, 1]}]);
  assert.equal(R['writing.8'].s, null);
  assert.match(R['writing.8'].note, /• o -/);
});

/* ---------- E. การใช้คำ (lang.0) ---------- */
test('E: lang.0 สระอำพิมพ์เป็น ํ + า และอักขระที่มองไม่เห็น เป็นจุดผิด', async () => {
  const R = await run([P('ระบบช่วยการทํางานของทีม'), P('หมาย‍เหตุ: ทดสอบ')]);
  no(R, 'lang.0', 2);
  assert.match(R['lang.0'].note, /สระอำพิมพ์เป็น ํ \+ า 1 จุด เช่น .*ทํางาน/);
  assert.match(R['lang.0'].note, /อักขระที่มองไม่เห็น 1 จุด เช่น "หมาย\[U\+200D\]เหตุ/);
  const good = await run([P('ระบบช่วยการทำงานของทีม')]);
  assert.equal(good['lang.0'].s, null);
});

/* ---------- F. ตาราง (table.0, table.1) ---------- */
const KV = [[{t:'ชื่อเอกสาร'}, {t:'เอกสารทดสอบ', span:2}], [{t:'เวอร์ชันปัจจุบัน'}, {t:'1.0.0', span:2}]];
const H = (jc = 'center') => [{t:'เวอร์ชัน', b:true, jc:'center'}, {t:'วันที่', b:true, jc:'center'}, {t:'รายการที่แก้ไข', b:true, jc}];
test('F: table.0 ข้ามแถวคีย์-ค่าด้านบน แล้วตรวจแถวหัวคอลัมน์ กึ่งกลางผ่าน', async () => {
  const R = await run([{caption:'ตาราง 1 การควบคุมการเปลี่ยนแปลง'}, {table:[...KV, H(), ['1.0.0', '1 ตุลาคม 2569', 'จัดทำเอกสาร']]}]);
  ok(R, 'table.0');
});

test('F: table.0 หัวคอลัมน์จัด thaiDistribute ได้ไม่ผ่าน 1 จุด ตารางคีย์-ค่าทั้งตารางไม่ตรวจ', async () => {
  const R = await run([
    {table:[[{t:'ชื่อเอกสาร', b:true}, 'เอกสารทดสอบ'], [{t:'ผู้จัดทำเอกสารนี้', b:true}, 'ทีมทดสอบ']]},
    {caption:'ตาราง 1 การควบคุมการเปลี่ยนแปลง'}, {table:[H('thaiDistribute'), ['1.0.0', '1 ตุลาคม 2569', 'จัดทำเอกสาร']]},
  ]);
  no(R, 'table.0', 1);
  assert.match(R['table.0'].note, /ตาราง 1: "รายการที่แก้ไข" ไม่กึ่งกลาง/);
  assert.match(R['table.0'].note, /ข้ามตารางคีย์-ค่า 1 ตาราง/);
});

test('F: table.1 หาคอลัมน์ "ลำดับ" จากหัวคอลัมน์ และนับช่องที่ใช้เลขอัตโนมัติ', async () => {
  const head = [{t:'รหัส', b:true, jc:'center'}, {t:'ลำดับ', b:true, jc:'center'}, {t:'ชื่อ', b:true, jc:'center'}];
  const rows = jc => [['A1', {t:'', num:[5, 0], jc}, 'ชื่อหนึ่ง'], ['A2', {t:'', num:[5, 0], jc}, 'ชื่อสอง']];
  const good = await run([{caption:'ตาราง 1 รายชื่อ'}, {table:[head, ...rows('center')]}]);
  ok(good, 'table.1');
  const bad = await run([{caption:'ตาราง 1 รายชื่อ'}, {table:[head, ...rows('left')]}]);
  no(bad, 'table.1', 1);
});

/* ---------- G. เลขหน้าและเวอร์ชัน (pagenum.0–2, version.2) ---------- */
test('G: pagenum.1 เลขหน้าในกล่องข้อความยึดชิดขวาถือว่ามุมขวา แม้ย่อหน้าในกล่องจัดกึ่งกลาง "หน้า | 1" ใช้ได้', async () => {
  const R = await run([P('บทนำ')], 'RD', {header:anchoredBox(pageField({jc:'center', pre:'หน้า | '}), 'right')});
  ok(R, 'pagenum.1'); ok(R, 'pagenum.2');
  no(await run([P('บทนำ')], 'RD', {header:anchoredBox(pageField({jc:'center'}), 'center')}), 'pagenum.1');
});

const FRONT = [{p:'สารบัญ', sz:40, b:true}, P('รายการในสารบัญ')];
test('G: pagenum.0 เลข 1 เริ่มที่ "บทนำ" ผ่าน เริ่มที่สารบัญไม่ผ่าน', async () => {
  const good = await run([...FRONT, {p:'', sect:{fmt:'thaiLetters', start:'1'}}, {p:'บทนำ', sz:40, b:true}, P('เนื้อหา')], 'RD', {pg:{start:'1'}});
  ok(good, 'pagenum.0');
  const bad = await run([{p:'', sect:{fmt:'thaiLetters', start:'1'}}, ...FRONT, {p:'บทนำ', sz:40, b:true}, P('เนื้อหา')], 'RD', {pg:{start:'1'}});
  no(bad, 'pagenum.0');
  assert.match(bad['pagenum.0'].note, /เลขหน้า 1 เริ่มที่ "สารบัญ" ไม่ใช่ "บทนำ"/);
});

test('G: pagenum.0 ไม่มีบทนำ เลข 1 เริ่มที่หน้าแรกของเนื้อหาต่อจากส่วนนำ', async () => {
  const R = await run([...FRONT, {p:'', sect:{fmt:'thaiLetters', start:'1'}}, TITLE, P('เนื้อหา')], 'RD', {pg:{start:'1'}});
  ok(R, 'pagenum.0');
  assert.match(R['pagenum.0'].note, /หน้าแรกของเนื้อหา "Stealth Trade"/);
});

const CTL = last => [{caption:'ตาราง 1 การควบคุมการเปลี่ยนแปลงเอกสาร'}, {table:[H(), ['1.0.0', '1 ตุลาคม 2569', 'จัดทำเอกสาร'], ['1.0.1', '2 ตุลาคม 2569', last]]}];
test('G: version.2 แถวที่ขึ้นแค่หลักที่สามแต่เพิ่มเนื้อหา แสดงคำแนะนำ', async () => {
  const R = await run(CTL('-เพิ่มหัวข้อขอบเขต'));
  assert.equal(R['version.2'].s, null);
  assert.equal(R['version.2'].note, 'อาจต้องขึ้นหลักที่สอง: 1.0.1 เพิ่มหัวข้อขอบเขต');
  const good = await run(CTL('แก้คำผิด'));
  assert.match(good['version.2'].note, /ไม่พบแถวที่ขึ้นแค่หลักที่สาม/);
});

/* ---------- H. ส่วนนำและเนื้อหา DS (front.0, dsx.2) ---------- */
test('H: front.0 หาชื่อระบบบนปก ไม่พบให้ตรวจภาพปก', async () => {
  const found = await run([P('บทนำ')], 'DS', {cover:'Stealth Trade มาตรฐานเอกสาร'});
  assert.equal(found['front.0'].s, null);
  assert.match(found['front.0'].note, /พบชื่อระบบ "Stealth Trade" บนปก/);
  const none = await run([P('บทนำ')], 'DS', {cover:'มาตรฐานเอกสาร'});
  assert.equal(none['front.0'].note, 'ไม่พบชื่อระบบบนปก ตรวจภาพปก');
});

test('H: dsx.2 ตารางรหัสเอกสารต้องมีทุกรหัสที่เว็บใช้', async () => {
  const codes = Object.keys(DOCS);
  const tbl = list => [{caption:'ตาราง 3 รายละเอียดรหัสเอกสาร'}, {table:[[{t:'ลำดับ', b:true, jc:'center'}, {t:'รหัสเอกสาร', b:true, jc:'center'}], ...list.map((c, i) => [{t:String(i + 1), jc:'center'}, c])]}];
  ok(await run(tbl(codes), 'DS'), 'dsx.2');
  const R = await run(tbl(codes.filter(c => c !== 'SS' && c !== 'AS')), 'DS');
  no(R, 'dsx.2', 2);
  assert.match(R['dsx.2'].note, /ไม่มี SS, AS/);
  assert.equal((await run(tbl(codes), 'RD'))['dsx.2'], undefined);   // ตรวจเฉพาะ DS
});
