/* เขียน tests/checklist-snapshot.json ใหม่จากชุดตรวจปัจจุบัน ใช้เมื่อตั้งใจเพิ่มหรือแก้ชุดตรวจ (npm run snapshot) */
import { writeFileSync } from 'node:fs';
import { GROUPS } from '../js/config/documents.js';
import { sectionsFor } from '../js/config/checklists.js';

const out = {};
GROUPS.forEach(g => g.docs.forEach(([c]) => { out[c] = sectionsFor(c).map(s => `${s.key}:${s.items.length}`).join(' '); }));
writeFileSync(new URL('./checklist-snapshot.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`บันทึก snapshot ของ ${Object.keys(out).length} เอกสารแล้ว ตรวจ git diff ก่อน commit`);
