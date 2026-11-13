import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets, redactText } from '../js/autocheck/secrets.js';

// ค่าความลับปลอมที่สุ่มขึ้นสำหรับทดสอบเท่านั้น
const KEY = 'Qm9ndXNLZXlGb3JUZXN0aW5nT25seTEyMzQ1Njc4OTA=';
const GOCSPX = 'FakeSecretForUnitTest_123';
const AIZA = 'FakeApiKeyForUnitTesting1234567890a';   // ความยาวเท่าคีย์จริง (AIza + 35 ตัว)

test('พบค่าความลับทุกรูปแบบที่รู้จัก', () => {
  const kinds = t => findSecrets(t).map(x => x.kind);
  assert.deepEqual(kinds(`APP_KEY=base64:${KEY}`), ['APP_KEY แบบ base64']);
  assert.deepEqual(kinds(`GOOGLE_CLIENT_SECRET=GOCSPX-${GOCSPX}`), ['Google client secret (GOCSPX-)']);
  assert.deepEqual(kinds(`key=AIza${AIZA}`), ['Google API key (AIza)']);
  assert.deepEqual(kinds('-----BEGIN RSA PRIVATE KEY-----'), ['Private key']);
  assert.deepEqual(kinds('MAIL_PASSWORD=Hunter2xyz'), ['รหัสผ่าน (password=)']);
  assert.deepEqual(kinds("$cfg->password = 'value'"), []);   // มีช่องว่างก่อน = ถือเป็นโค้ด ไม่ใช่ค่าตั้งค่า
  assert.deepEqual(kinds("password='S3cret pass'"), ['รหัสผ่าน (password=)']);
});

test('ไม่นับข้อความที่หน้าตาคล้ายความลับแต่ไม่ใช่', () => {
  for (const t of ['Password::defaults()', '$user->password = Str::random(40);', 'DB_PASSWORD=', 'DB_PASSWORD=${DB_PASSWORD}',
    'MAIL_PASSWORD=********', 'DB_PASSWORD=ว่าง', 'git commit 0123456789abcdef0123456789abcdef01234567', '-----BEGIN PUBLIC KEY-----',
    'resources/js/Pages/Auth/ConfirmPasswordFormComponent', 'ค้นรูปแบบ GOCSPX , client_secret']) {
    assert.deepEqual(findSecrets(t), [], t);
  }
});

test('ซ่อนค่าความลับในข้อความผลตรวจ รวมถึงชิ้นส่วนที่ถูกตัดเหลือไม่กี่ตัว', () => {
  const vals = findSecrets(`APP_KEY=base64:${KEY} MAIL_PASSWORD=Hunter2xyz`).map(x => x.value);
  const out = redactText(`พบ "APP_KEY=base64:${KEY.slice(0, 20)}…" และ "${KEY.slice(10, 30)}" และ MAIL_PASSWORD=Hunt…`, vals);
  for (let i = 0; i + 4 <= KEY.length; i++) assert.ok(!out.includes(KEY.substr(i, 4)), out);
  assert.ok(!out.includes('Hunt'), out);
  assert.match(out, /\[ซ่อนค่าความลับ\]/);
  assert.equal(redactText('(APP_KEY แบบ base64)', vals), '(APP_KEY แบบ base64)');   // ชื่อรูปแบบไม่ถูกซ่อน
  assert.equal(redactText('ข้อความปกติ', []), 'ข้อความปกติ');
});
