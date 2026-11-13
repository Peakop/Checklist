import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GROUPS, DOCS, LONG } from '../js/config/documents.js';
import { sectionsFor, itemId, contentFor } from '../js/config/checklists.js';

const shape = code => sectionsFor(code).map(s => `${s.key}:${s.items.length}`).join(' ');
const snapshot = JSON.parse(readFileSync(new URL('./checklist-snapshot.json', import.meta.url), 'utf8'));

test('ชุดตรวจของทุกเอกสารตรงกับ snapshot (กันการเปลี่ยนชุดตรวจของเอกสารอื่นโดยไม่ตั้งใจ)', () => {
  // ถ้าตั้งใจเพิ่มหรือแก้ชุดตรวจ ให้รัน npm run snapshot แล้ว commit tests/checklist-snapshot.json ไปพร้อมกัน
  const now = {}; GROUPS.forEach(g => g.docs.forEach(([c]) => { now[c] = shape(c); }));
  assert.deepEqual(now, snapshot);
});

test('id ของข้อตรวจไม่ซ้ำกันภายในเอกสารเดียวกัน', () => {
  for (const code of Object.keys(DOCS)) {
    const ids = sectionsFor(code).flatMap(s => s.items.map((_, i) => itemId(s, i)));
    assert.equal(new Set(ids).size, ids.length, code);
  }
});

test('SS ใช้ชุดตรวจแบบเดียวกับ DS/CS/UXIS และมีหมวด ssx 13 ข้อ อ้างอิงแนวปฏิบัติ QA', () => {
  assert.ok(LONG.has('SS'));
  assert.equal(DOCS.SS.group, 'มาตรฐานและคู่มือ');
  // หมวดเนื้อหาเฉพาะเอกสาร (dsx, csx, uxisx, ssx) แทนด้วย CONTENT แล้วโครงชุดตรวจต้องเหมือนกัน
  const keys = code => sectionsFor(code).map(s => s.key === contentFor(code).key ? 'CONTENT' : s.key);
  for (const other of ['DS', 'CS', 'UXIS']) assert.deepEqual(keys('SS'), keys(other), other);
  const ssx = sectionsFor('SS').find(s => s.key === 'ssx');
  assert.equal(ssx.items.length, 13);
  assert.equal(ssx.ref, 'แนวปฏิบัติ QA');
});
