import { itemId, sectionsFor } from '../config/checklists.js';
import { DOCS, FILE_EG } from '../config/documents.js';
import { checksOf, persist, state } from '../state.js';
import { checkFileName } from './form.js';
import { renderDocList } from './sidebar.js';
import { updateSummary } from './summary.js';
import { toast } from './toast.js';
import { $, esc } from '../utils/dom.js';

export let currentSections = [];
/* ---------- checklist ---------- */
export function renderDoc(){
  const d = DOCS[state.doc];
  $('#docCode').textContent = d.code; $('#docName').textContent = d.name; $('#docGroup').textContent = `หมวด${d.group} · รายการตรวจสร้างจาก Document Standard`;
  $('#f-fileName').placeholder = `เช่น ${FILE_EG[d.code] || FILE_EG.default}`;
  checkFileName(); renderDocList(); renderChecklist();
}
export function renderChecklist(){
  const wrap = $('#sections'); wrap.innerHTML = '';
  currentSections = sectionsFor(state.doc);
  currentSections.forEach((sec, si) => {
    const el = document.createElement('section'); el.className = 'card sec';
    el.innerHTML = `<header class="sec-h"><div class="sec-t"><span class="sec-n">${si+1}</span><h3>${esc(sec.title)}</h3><span class="ref">${esc(sec.ref)}</span></div>
      <div class="sec-tools"><span class="sec-prog" data-prog="${sec.key}"></span>
      <button type="button" class="ghost" data-bulk="yes" data-sec="${sec.key}">ข้อที่เหลือ = ผ่าน</button>
      <button type="button" class="ghost" data-bulk="na" data-sec="${sec.key}">ทั้งหมวด ไม่พบข้อมูล</button></div></header>`;
    const rows = document.createElement('div'); rows.className = 'rows';
    sec.items.forEach((t, ii) => {
      const id = itemId(sec, ii); const n = `${si+1}.${ii+1}`;
      const row = document.createElement('div'); row.className = 'row'; row.dataset.id = id;
      row.innerHTML = `<div class="num">${n}</div><div class="txt">${esc(t)}<span class="auto-tag" hidden>อัตโนมัติ</span></div>
        <div class="seg" role="group" aria-label="ผลตรวจ ข้อ ${n}"><button type="button" data-v="yes">ผ่าน</button><button type="button" data-v="no">ไม่ผ่าน</button><button type="button" data-v="na">ไม่พบข้อมูล</button></div>
        <input class="note" id="note-${state.doc}-${id}" type="text" placeholder="รายละเอียด / หน้าที่พบ" aria-label="รายละเอียด ข้อ ${n}">
        <label class="errbox"><span class="lbl-m">ผิดพลาด</span><input class="err" id="err-${state.doc}-${id}" type="number" min="0" step="1" inputmode="numeric" aria-label="จำนวนข้อผิดพลาด ข้อ ${n}"></label>`;
      rows.append(row); syncRow(row);
    });
    el.append(rows); wrap.append(el);
  });
  updateSummary();
}
function syncRow(row){
  const c = checksOf(state.doc)[row.dataset.id] || {};
  row.classList.toggle('is-yes', c.s === 'yes'); row.classList.toggle('is-no', c.s === 'no'); row.classList.toggle('is-na', c.s === 'na');
  row.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === c.s)));
  const note = row.querySelector('.note'); if (document.activeElement !== note) note.value = c.note || '';
  const err = row.querySelector('.err'); err.disabled = c.s !== 'no';
  if (document.activeElement !== err) err.value = c.s === 'no' ? (c.err ?? 1) : '';
  row.querySelector('.auto-tag').hidden = !c.auto;
}
function setCheck(id, patch){
  const ch = checksOf(state.doc); ch[id] = Object.assign({}, ch[id], patch);
  const c = ch[id]; if (!c.s && !c.note) delete ch[id];
  persist();
}
/* reset with in-page confirmation */
let resetArmed = null;

export function initChecklist(){
  $('#sections').addEventListener('click', e => {
    const sb = e.target.closest('.seg button');
    if (sb) {
      const row = sb.closest('.row'); const id = row.dataset.id; const cur = (checksOf(state.doc)[id] || {}).s;
      const v = cur === sb.dataset.v ? null : sb.dataset.v;
      const patch = {s:v, auto:false}; if (v === 'no') { const prev = (checksOf(state.doc)[id] || {}).err; patch.err = prev > 0 ? prev : 1; }
      setCheck(id, patch); syncRow(row); updateSummary();
      if (v === 'no') row.querySelector('.note').focus();
      return;
    }
    const bulk = e.target.closest('[data-bulk]');
    if (bulk) {
      const sec = currentSections.find(s => s.key === bulk.dataset.sec); const ch = checksOf(state.doc);
      sec.items.forEach((_, i) => {
        const id = itemId(sec, i);
        if (bulk.dataset.bulk === 'yes') { if (!ch[id] || !ch[id].s) setCheck(id, {s:'yes', auto:false}); }
        else setCheck(id, {s:'na', auto:false});
      });
      bulk.closest('.sec').querySelectorAll('.row').forEach(syncRow); updateSummary();
    }
  });
  $('#sections').addEventListener('input', e => {
    const row = e.target.closest('.row'); if (!row) return;
    if (e.target.classList.contains('note')) { setCheck(row.dataset.id, {note:e.target.value, auto:false}); syncRow(row); }
    if (e.target.classList.contains('err')) { const v = Math.max(0, parseInt(e.target.value, 10) || 0); setCheck(row.dataset.id, {err:v, auto:false}); syncRow(row); updateSummary(); }
  });
  $('#resetBtn').addEventListener('click', () => {
    const b = $('#resetBtn');
    if (!resetArmed) {
      b.classList.add('danger-arm'); b.textContent = `กดอีกครั้งเพื่อล้าง ${state.doc}`;
      resetArmed = setTimeout(() => { resetArmed = null; b.classList.remove('danger-arm'); b.textContent = 'ล้างผลการตรวจ'; }, 3500);
      return;
    }
    clearTimeout(resetArmed); resetArmed = null; b.classList.remove('danger-arm'); b.textContent = 'ล้างผลการตรวจ';
    delete state.checks[state.doc]; persist(); renderChecklist(); renderDocList(); toast(`ล้างผลการตรวจของ ${state.doc} แล้ว`);
  });
}
