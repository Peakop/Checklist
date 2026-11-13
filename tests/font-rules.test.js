/* ข้อ 4.1 (font.0) และ 4.4 (font.3) ตามข้อตกลง QA จากการตรวจ RD V1.6.0 ทดสอบกับเอกสารจำลอง (ข้อความสมมติทั้งหมด) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocx, analyze } from './helpers/docx.js';

const run = async (blocks, code = 'RD') => analyze(await makeDocx(blocks), code);

/* ---------- font.0: สัญลักษณ์ที่ TH SarabunPSK ไม่มี ---------- */
test('font.0 ผ่าน เมื่อลูกศร → เป็น Arial แยก run และบอกจำนวนที่ไม่นับ', async () => {
  const R = await run([
    {p:'บทนำของเอกสาร'},
    {runs:[{t:'ขั้นตอนแรก '}, {t:'→', font:'Arial'}, {t:' ขั้นตอนถัดไป '}, {t:'→', font:'Arial'}, {t:' ขั้นตอนสุดท้าย'}]},
    // ช่องว่างที่เป็นฟอนต์อื่นไม่นับ
    {runs:[{t:'ข้อความ'}, {t:'  ', font:'Arial'}, {t:'ต่อกัน'}]},
  ]);
  assert.equal(R['font.0'].s, 'yes', R['font.0'].note);
  assert.match(R['font.0'].note, /ไม่นับ → 2 ตัว \(TH SarabunPSK ไม่มีอักขระนี้\)/);
  assert.match(R['font.0'].tip, /ไม่นับสัญลักษณ์ที่ TH SarabunPSK ไม่มี/);
});

test('font.0 ไม่ผ่าน เมื่อสัญลักษณ์อยู่ run เดียวกับข้อความทั่วไป หรือเป็นอักขระที่ Sarabun มี', async () => {
  const R = await run([
    {p:'บทนำของเอกสาร'},
    {runs:[{t:'เริ่ม '}, {t:'→ ถัดไป', font:'Arial'}]},
    {runs:[{t:'ค่าต้อง '}, {t:'≤', font:'Arial'}, {t:' 10'}]},   // ≤ มีใน TH SarabunPSK จึงเปลี่ยนได้
    {runs:[{t:'ผลลัพธ์ '}, {t:'✓', font:'Segoe UI'}]},
  ]);
  assert.equal(R['font.0'].s, 'no');
  assert.equal(R['font.0'].err, 2);
  assert.match(R['font.0'].note, /Arial 7 ตัวอักษร/);
  assert.match(R['font.0'].note, /ไม่นับ ✓ 1 ตัว/);
});

test('font.0 ไม่มีสัญลักษณ์ ไม่มีคำแนะนำเพิ่ม', async () => {
  const R = await run([{p:'บทนำของเอกสาร'}]);
  assert.equal(R['font.0'].s, 'yes');
  assert.equal(R['font.0'].note, 'TH SarabunPSK ทั้งเอกสาร รวม Header และ Footer');
  assert.equal(R['font.0'].tip, undefined);
});

/* ---------- font.3: หัวข้อย่อย = ข้อเลขระดับถัดจากหัวข้อ ---------- */
const TITLE = {p:'Stealth Trade', sz:40, b:true};
const head = t => ({p:t, style:'ListParagraph', num:[1, 0], sz:36, b:true});
const sub = (t, o = {}) => Object.assign({p:t, style:'ListParagraph', num:[1, 1]}, o);

test('font.3 ลำดับเลขอัตโนมัติ: ilvl 0 หนา 18 pt คือหัวข้อ ilvl 1 ปกติ 3 ข้อ ไม่ผ่าน 3', async () => {
  const R = await run([
    TITLE, head('ชื่อระบบ'), {p:'ระบบตัวอย่างสำหรับทดสอบ'},
    head('ขอบเขต'), sub('ผู้ใช้'), sub('ผู้ใช้ทั่วไปเข้าใช้ระบบผ่านเว็บไซต์ได้ตลอดเวลา'),
    {p:'รายการย่อย', style:'ListParagraph', num:[2, 1]},   // bullet ระดับ 1 ไม่ใช่หัวข้อย่อย
    head('ความต้องการ'), sub('ความต้องการด้านระบบ'),
  ]);
  assert.equal(R['font.3'].s, 'no', R['font.3'].note);
  assert.equal(R['font.3'].err, 3);
  assert.equal(R['font.3'].note, '3 จาก 3 ข้อ ไม่หนา: 2.1, 2.2, 3.1');
  // หัวข้อย่อยไม่ถูกนำไปตรวจเป็นเนื้อหา
  assert.match(R['font.4'].note, /ไม่นับหัวข้อย่อย 3 ข้อ/);
});

test('font.3 แบบ RD V1.6.0: 2.1, 3.1–3.6, 4.1–4.7 ตัวปกติ ได้ไม่ผ่าน 14', async () => {
  const blocks = [TITLE, head('ชื่อระบบ'), {p:'ระบบตัวอย่าง'}, head('ภาพรวม'), sub('ภาพรวมระบบ')];
  blocks.push(head('ความต้องการ')); for (let i = 1; i <= 6; i++) blocks.push(sub(`ความต้องการข้อที่ ${i}`));
  blocks.push(head('ข้อจำกัด')); for (let i = 1; i <= 7; i++) blocks.push(sub(`ระบบต้องรองรับข้อจำกัดที่ ${i} ตามที่ตกลงไว้`));
  const R = await run(blocks);
  assert.equal(R['font.3'].s, 'no');
  assert.equal(R['font.3'].err, 14);
  assert.equal(R['font.3'].note, '14 จาก 14 ข้อ ไม่หนา: 2.1, 3.1–3.6, 4.1–4.7');
});

test('font.3 ผ่าน เมื่อหัวข้อย่อยหนา 16 pt และแยกขนาดผิดกับไม่หนา', async () => {
  const ok = await run([TITLE, head('ขอบเขต'), sub('ผู้ใช้', {b:true}), sub('ผู้ดูแล', {b:true})]);
  assert.equal(ok['font.3'].s, 'yes', ok['font.3'].note);
  assert.equal(ok['font.3'].note, '2 ข้อ ขนาด 16 pt ตัวหนา');
  const R = await run([TITLE, head('ขอบเขต'), sub('ผู้ใช้', {b:true}), sub('ผู้ดูแล', {sz:28, b:true}), sub('ผู้ตรวจ')]);
  assert.equal(R['font.3'].err, 2);
  assert.equal(R['font.3'].note, '2 จาก 3 ข้อ ขนาด 14 pt: 1.2 · ไม่หนา: 1.3');
  assert.equal(R['font.4'].s, 'yes', 'หัวข้อย่อย 14 pt ไม่ถูกนับซ้ำในข้อ font.4');
});

test('font.3 พิมพ์เลขเอง: หัวข้อ "1." หัวข้อย่อย "1.1 "', async () => {
  const R = await run([TITLE, {p:'1. ชื่อระบบ\t3'}, {p:'1.1 ผู้ใช้\t3'},   // สารบัญที่พิมพ์เอง ไม่นับ
    {p:'1. ชื่อระบบ', sz:36, b:true}, {p:'1.1 ระบบนี้ใช้สำหรับทดสอบการตรวจ'}, {p:'1.2 ผู้ใช้', b:true}, {p:'ย่อหน้าเนื้อหาทั่วไป'}]);
  assert.equal(R['font.3'].s, 'no');
  assert.equal(R['font.3'].err, 1);
  assert.equal(R['font.3'].note, '1 จาก 2 ข้อ ไม่หนา: 1.1');
});

test('font.3 ไม่พบหัวข้อย่อย เป็นคำแนะนำ', async () => {
  const R = await run([TITLE, {p:'ย่อหน้าเนื้อหาทั่วไป'}]);
  assert.equal(R['font.3'].s, null);
  assert.match(R['font.3'].note, /ไม่พบหัวข้อย่อย/);
});

/* ---------- font.3 แบบ SS: Heading 1 = "1." Heading 2 = "1.1" Heading 3 = "1.1.1" (ผลเหมือนเดิม) ---------- */
const SS = extra => [
  {h1:'1. บทนำ', sz:40, b:true}, {h2:'1.1 วัตถุประสงค์', sz:36, b:true},
  {h3:'1.1.1 ขอบเขตของเอกสาร', b:true}, {p:'เนื้อหาของหัวข้อย่อย'}, {h3:'1.1.2 ผู้อ่าน', b:true}, ...extra,
];
test('font.3 Heading 1–3 แบบ SS ผลเหมือนเดิม', async () => {
  const ok = await run(SS([]), 'SS');
  assert.equal(ok['font.3'].s, 'yes', ok['font.3'].note);
  assert.equal(ok['font.3'].note, '2 ข้อ ขนาด 16 pt ตัวหนา');
  const bad = await run(SS([{h3:'1.1.3 ผู้รับผิดชอบ'}]), 'SS');
  assert.equal(bad['font.3'].s, 'no');
  assert.equal(bad['font.3'].err, 1);
  assert.equal(bad['font.3'].note, '1 จาก 3 ข้อ ไม่หนา: 1.1.3');
  // ไม่มี Heading 3 และไม่มีเลขระดับหัวข้อย่อย ยังเป็นคำแนะนำเหมือนเดิม
  const none = await run([{h1:'1. บทนำ', sz:40, b:true}, {h2:'1.1 วัตถุประสงค์', sz:36, b:true}, {p:'เนื้อหา'}], 'SS');
  assert.equal(none['font.3'].s, null);
});

test('font.3 แบบ SS นับย่อหน้าที่พิมพ์เลข "1.1.1 " เองด้วย แต่ไม่นับ "1.1 "', async () => {
  const R = await run(SS([{p:'1.1.3 ข้อที่พิมพ์เลขเองโดยไม่ใช้สไตล์'}, {p:'1.5 เท่าของค่าเดิม ไม่ใช่หัวข้อย่อยในเอกสารนี้'}]), 'SS');
  assert.equal(R['font.3'].s, 'no');
  assert.equal(R['font.3'].err, 1);
  assert.equal(R['font.3'].note, '1 จาก 3 ข้อ ไม่หนา: 1.1.3');
});
