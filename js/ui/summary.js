import { itemId, sectionsFor } from '../config/checklists.js';
import { state } from '../state.js';
import { currentSections } from './checklist.js';
import { $ } from '../utils/dom.js';

/* ---------- stats ---------- */
export function statsFor(code){
  const secs = sectionsFor(code); const ch = state.checks[code] || {};
  let total = 0, yes = 0, no = 0, na = 0, err = 0;
  secs.forEach(s => s.items.forEach((_, i) => {
    total++; const c = ch[itemId(s, i)];
    if (!c || !c.s) return;
    if (c.s === 'yes') yes++; else if (c.s === 'na') na++;
    else if (c.s === 'no') { no++; err += Math.max(0, parseInt(c.err, 10) || 0); }
  }));
  const checked = yes + no + na;
  let result = 'pend', label = 'ยังตรวจไม่ครบ';
  if (checked === total) { if (no === 0) { result = 'pass'; label = 'ผ่าน'; } else { result = 'fail'; label = 'ไม่ผ่าน'; } }
  return {total, yes, no, na, err, checked, result, label};
}
export function updateSummary(){
  const st = statsFor(state.doc);
  $('#sTotal').textContent = st.total; $('#sChecked').textContent = st.checked;
  $('#sPct').textContent = Math.round(st.checked / st.total * 100) + '%';
  $('#sYes').textContent = st.yes; $('#sNo').textContent = st.no; $('#sNa').textContent = st.na; $('#sErr').textContent = st.err;
  $('#bY').style.width = (st.yes / st.total * 100) + '%'; $('#bN').style.width = (st.no / st.total * 100) + '%'; $('#bA').style.width = (st.na / st.total * 100) + '%';
  const pill = $('#sResult'); pill.className = 'pill ' + st.result; pill.textContent = st.label;
  $('#outErr').textContent = st.err;
  const out = $('#outResult'); out.innerHTML = `<span class="pill ${st.result}">${st.label}</span>`;
  const ch = state.checks[state.doc] || {};
  currentSections.forEach(sec => {
    const done = sec.items.filter((_, i) => ch[itemId(sec, i)] && ch[itemId(sec, i)].s).length;
    const el = document.querySelector(`[data-prog="${sec.key}"]`);
    if (el) { el.textContent = `${done}/${sec.items.length}`; el.classList.toggle('done', done === sec.items.length); }
  });
  const btn = document.querySelector(`.doc[data-code="${state.doc}"] .dot`);
  if (btn) btn.className = 'dot ' + (!st.checked ? '' : st.result === 'pass' ? 'ok' : st.result === 'fail' ? 'bad' : 'p');
}
