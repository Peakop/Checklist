/* กฎหมวด ssx ของ Security Standard ทดสอบกับเอกสารจำลอง (ข้อความสมมติทั้งหมด) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDocx, analyze } from './helpers/docx.js';

const REQ = (rows) => [['ข้อกำหนด', 'ระดับ', 'สถานะ', 'หลักฐาน / หมายเหตุ'], ...rows];
const REGISTER = [['รหัส', 'ข้อค้นพบ', 'ตำแหน่ง', 'ระดับ', 'แนวทางแก้ไข'],
  ['F-01', 'ข้อค้นพบตัวอย่างที่หนึ่ง', 'app/Example.php:10', 'สูง', 'แก้ตามตัวอย่าง ก.1'],
  ['F-02', 'ข้อค้นพบตัวอย่างที่สอง', 'app/Other.php:5', 'กลาง', 'แก้ตามตัวอย่าง ก.2'],
  ['F-03', 'ข้อค้นพบตัวอย่างที่สาม', 'config/app.php', 'ต่ำ', 'ปรับค่าตั้งค่า']];

// เอกสารที่ควรผ่านข้อ ssx.4, 7, 8, 12 ปรับบางส่วนได้ด้วย patch
function blocks(patch = {}){
  return [
    {h1:'บทนำ'}, {h2:'วัตถุประสงค์'}, {p:'เอกสารนี้กำหนดมาตรฐานความปลอดภัยของระบบตัวอย่าง'},
    {h2:'ขอบเขต'}, {p:'ระบบที่ตรวจ: Framework 1.2 และไลบรารี Example 3.4'}, {p:'นอกขอบเขต: การตั้งค่าเครือข่าย'},
    {h2:'วิธีประเมิน และข้อจำกัด'}, {p:'ตรวจแบบ static review จาก git commit abc1234 มีข้อจำกัดคือไม่ได้รันระบบ'},
    {h1:'การพิสูจน์ตัวตน และการควบคุมการเข้าถึง'}, {caption:'ตาราง 2-1 มาตรฐานรหัสผ่าน'},
    {table:REQ(patch.reqRows || [['เก็บรหัสผ่านแบบ hash', 'ต้อง', 'ผ่าน', 'User.php:12'], ['ล็อกบัญชีเมื่อเดาผิด', 'ควร', 'ไม่ผ่าน', 'LoginRequest.php:40']])},
    {p:'ต้อง ตรวจสอบข้อมูลนำเข้าทุกฟอร์ม'},
    ...(patch.extra || []),
    {h1:'ผลการประเมิน และแผนแก้ไข'}, {h2:'สรุปข้อค้นพบ'},
    {p:patch.summary || 'การประเมินพบข้อค้นพบ 3 รายการ แบ่งเป็นระดับสูง 1 กลาง 1 และต่ำ 1 ระดับความเสี่ยงกำหนดจากโอกาสเกิดเหตุและผลกระทบ'},
    {h2:'ทะเบียนข้อค้นพบ'}, {caption:'ตาราง 8-1 ทะเบียนข้อค้นพบ'}, {table:patch.register || REGISTER},
    {h1:'ภาคผนวก ตัวอย่างโค้ดแนวทางแก้ไข'}, {h2:`ก.1 ตัวอย่างที่หนึ่ง (แก้ ${patch.fixRef || 'F-01'})`}, {p:'return true;'}, {h2:'ก.2 ตัวอย่างที่สอง (แก้ F-02, F-03)'}, {p:'return false;'},
  ];
}
const run = async patch => analyze(await makeDocx(blocks(patch)), 'SS');

test('เอกสารที่ถูกต้อง: ssx.4/7/8/12 ผ่าน และทุกข้อ ssx มีผลหรือคำแนะนำ', async () => {
  const R = await run();
  assert.equal(R['ssx.4'].s, 'yes', R['ssx.4'].note);
  assert.equal(R['ssx.7'].s, 'yes', R['ssx.7'].note);
  assert.equal(R['ssx.8'].s, 'yes', R['ssx.8'].note);
  assert.equal(R['ssx.12'].s, 'yes', R['ssx.12'].note);
  assert.match(R['ssx.7'].note, /3 รายการ \(F-01–F-03\)/);
  for (let i = 0; i <= 12; i++) assert.ok(R[`ssx.${i}`], `ssx.${i} ไม่มีผลหรือคำแนะนำ`);
  assert.equal(R['ssx.11'].s, null);   // ไม่พบความลับ = คำแนะนำ ไม่ติ๊กผ่าน
});

test('ssx.4 ไม่ผ่านเมื่อข้อกำหนดไม่มีระดับ และบอกตารางกับแถว', async () => {
  const R = await run({reqRows:[['เก็บรหัสผ่านแบบ hash', 'ต้อง', 'ผ่าน', 'User.php:12'], ['ล็อกบัญชีเมื่อเดาผิด', '', 'ไม่ผ่าน', '-'], ['ข้อที่สาม', 'ควร', 'ผ่าน', 'a.php']]});
  assert.equal(R['ssx.4'].s, 'no');
  assert.match(R['ssx.4'].note, /ตาราง 2-1 แถว 3/);
});

test('ssx.7 ไม่ผ่านเมื่อทะเบียนขาดตำแหน่ง ระดับ หรือแนวทางแก้ไข หรือรหัสซ้ำ', async () => {
  const reg = REGISTER.map(r => r.slice()); reg[2][2] = ''; reg[3][0] = 'F-01';
  const R = await run({register:reg});
  assert.equal(R['ssx.7'].s, 'no');
  assert.match(R['ssx.7'].note, /F-02 ไม่มีตำแหน่ง/);
  assert.match(R['ssx.7'].note, /F-01 ซ้ำ/);
});

test('ssx.8 ไม่ผ่านเมื่อจำนวนในสรุปไม่ตรงกับทะเบียน และบอกตัวเลขที่ต่าง', async () => {
  const R = await run({summary:'การประเมินพบข้อค้นพบ 4 รายการ แบ่งเป็นระดับสูง 2 กลาง 1 และต่ำ 1 ระดับความเสี่ยงกำหนดจากโอกาสเกิดเหตุและผลกระทบ'});
  assert.equal(R['ssx.8'].s, 'no');
  assert.match(R['ssx.8'].note, /สรุป 4 รายการ แต่ทะเบียนมี 3 รายการ/);
  assert.match(R['ssx.8'].note, /สูง: สรุป 2 ทะเบียน 1/);
});

test('ssx.8 เป็นคำแนะนำเมื่อจำนวนตรงแต่ไม่อธิบายเกณฑ์ให้ระดับ', async () => {
  const R = await run({summary:'การประเมินพบข้อค้นพบ 3 รายการ แบ่งเป็นระดับสูง 1 กลาง 1 และต่ำ 1'});
  assert.equal(R['ssx.8'].s, null);
});

test('ssx.12 ไม่ผ่านเมื่อภาคผนวกอ้างรหัสที่ไม่มีในทะเบียน', async () => {
  const R = await run({fixRef:'F-99'});
  assert.equal(R['ssx.12'].s, 'no');
  assert.match(R['ssx.12'].note, /F-99/);
});

test('ssx.11 ไม่ผ่านเมื่อพบความลับ แสดงแค่ตำแหน่ง และไม่มีค่าความลับในผลตรวจข้อใดเลย', async () => {
  const KEY = 'Qm9ndXNLZXlGb3JUZXN0aW5nT25seTEyMzQ1Njc4OTA=', PW = 'Zq9FakePass';
  const R = await run({extra:[{h2:'ความลับ และไฟล์ตั้งค่า'}, {p:`APP_KEY=base64:${KEY} MAIL_PASSWORD=${PW}`}, {p:`ข้อความต่างๆ base64:${KEY}`}]});
  assert.equal(R['ssx.11'].s, 'no');
  assert.match(R['ssx.11'].note, /ใต้หัวข้อ "ความลับ และไฟล์ตั้งค่า"/);
  const all = JSON.stringify(R);
  for (let i = 0; i + 4 <= KEY.length; i++) assert.ok(!all.includes(KEY.substr(i, 4)), `พบชิ้นส่วน ${KEY.substr(i, 4)}`);
  assert.ok(!all.includes(PW.slice(0, 4)));
});

test('กฎ SS ไม่ทำงานกับเอกสารอื่น', async () => {
  const R = await analyze(await makeDocx(blocks()), 'DS');
  assert.equal(Object.keys(R).filter(k => k.startsWith('ssx.')).length, 0);
});
