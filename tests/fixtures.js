/* ทดสอบกับเอกสารจริงในเครื่อง (npm run test:fixtures)
   วางไฟล์ไว้ที่ tests/fixtures/ ตั้งชื่อตามรูปแบบปกติ เช่น 2569-10-25_SS_V1.0.0.docx (รหัสเอกสารอ่านจากชื่อไฟล์)
   ครั้งแรกจะบันทึกผลไว้เป็น <ชื่อไฟล์>.json ครั้งต่อไปเทียบกับผลที่บันทึกไว้ ใช้ --update เพื่อบันทึกผลใหม่
   โฟลเดอร์นี้อยู่ใน .gitignore ทั้งไฟล์เอกสารและผลตรวจ ห้าม commit เพราะ repo เป็นสาธารณะ */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './helpers/docx.js';

const { analyzeXlsx, readXlsx } = await import('../js/autocheck/xlsx.js');
const { DOCS, LONG, MEETING } = await import('../js/config/documents.js');
const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const update = process.argv.includes('--update');
const files = existsSync(dir) ? readdirSync(dir).filter(f => /\.(docx|xlsx)$/i.test(f)) : [];
if (!files.length) { console.log(`ไม่พบไฟล์ใน ${dir} (วางไฟล์ .docx หรือ .xlsx ไว้ก่อน)`); process.exit(0); }

let bad = 0;
for (const f of files) {
  const code = f.replace(/\.[^.]+$/, '').split('_').slice(1).find(t => DOCS[t]);
  if (!code) { console.log(`ข้าม ${f}: ไม่พบรหัสเอกสารในชื่อไฟล์`); continue; }
  const buf = readFileSync(join(dir, f));
  const R = /\.xlsx$/i.test(f)
    ? analyzeXlsx(await readXlsx(buf), {code, name:DOCS[code].name, fileName:f, long:LONG.has(code), meeting:MEETING.has(code)})
    : await analyze(buf, code, f);
  const snap = join(dir, basename(f) + '.json'), now = JSON.stringify(R, null, 1);
  if (update || !existsSync(snap)) { writeFileSync(snap, now + '\n'); console.log(`บันทึก ${f} (${code})`); continue; }
  const before = JSON.parse(readFileSync(snap, 'utf8')), diff = [...new Set([...Object.keys(before), ...Object.keys(R)])].filter(k => JSON.stringify(before[k]) !== JSON.stringify(R[k]));
  if (diff.length) { bad++; console.log(`ต่าง ${f} (${code}): ${diff.join(', ')}`); } else console.log(`เหมือนเดิม ${f} (${code})`);
}
process.exit(bad ? 1 : 0);
