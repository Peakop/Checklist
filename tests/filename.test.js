import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultSet, checkFileNameRules } from '../js/autocheck/result.js';
import { fileNameISO, parseThaiDate, toBE } from '../js/utils/thai-date.js';

const check = (fileName, code, meeting = false) => { const rs = resultSet(); const r = checkFileNameRules(rs, {fileName, code, meeting}); return {R:rs.R, ...r}; };

test('ชื่อไฟล์ตามรูปแบบ YYYY-MM-DD_ID_Version', () => {
  const {R, fileVer, fileDate} = check('2569-10-05_TP_V1.2.0.docx', 'TP');
  assert.equal(R['naming.0'].s, 'yes'); assert.equal(R['naming.1'].s, 'yes'); assert.equal(R['version.0'].s, 'yes');
  assert.equal(fileVer, '1.2.0'); assert.deepEqual(fileDate, [2569, 10, 5]);
  assert.equal(check('2569-13-05_TP_V1.2.0.docx', 'TP').R['naming.0'].s, 'no');
  assert.equal(check('2569-10-05_TS_V1.2.0.docx', 'TP').R['naming.1'].s, 'no');
  assert.equal(check('2569-10-05_TP.docx', 'TP').R['version.0'].s, 'no');
});

test('VC มีรหัสเอกสารที่ควบคุมต่อท้าย และเอกสารประชุมต้องมีครั้งที่', () => {
  assert.equal(check('2569-09-13_VC_UCD_V1.3.0.docx', 'VC').R['naming.0'].s, 'yes');
  assert.equal(check('2569-09-13_MRT_ครั้งที่3_V1.0.0.docx', 'MRT', true).R['naming.2'].s, 'yes');
  assert.equal(check('2569-09-13_MRT_V1.0.0.docx', 'MRT', true).R['naming.2'].s, 'no');
});

test('SS ผ่านข้อรหัสเอกสาร พร้อมหมายเหตุว่ายังไม่อยู่ใน DS V2.2.0', () => {
  const {R} = check('2569-10-25_SS_V1.0.0.docx', 'SS');
  assert.equal(R['naming.1'].s, 'yes');
  assert.equal(R['naming.1'].tip, 'รหัส SS ยังไม่อยู่ใน DS V2.2.0');
  assert.equal(check('2569-10-05_TP_V1.2.0.docx', 'TP').R['naming.1'].tip, undefined);
});

test('วันที่ภาษาไทยและวันที่จากชื่อไฟล์', () => {
  assert.equal(fileNameISO('2569-10-25_SS_V1.0.0'), '2026-10-25');
  assert.equal(fileNameISO('2026-10-25_SS_V1.0.0'), '2026-10-25');
  assert.equal(fileNameISO('SS_V1.0.0'), '');
  assert.deepEqual(toBE(parseThaiDate('แก้ไขเมื่อ 25 ตุลาคม 2569')), [2569, 10, 25]);
});
