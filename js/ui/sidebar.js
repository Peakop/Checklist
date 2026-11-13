import { GROUPS } from '../config/documents.js';
import { persist, state } from '../state.js';
import { renderDoc } from './checklist.js';
import { statsFor } from './summary.js';
import { $, esc } from '../utils/dom.js';

/* ---------- sidebar ---------- */
export function renderDocList(){
  const q = $('#search').value.trim().toLowerCase();
  const out = [];
  GROUPS.forEach(g => {
    const docs = g.docs.filter(([c, n]) => !q || c.toLowerCase().includes(q) || n.toLowerCase().includes(q));
    if (!docs.length) return;
    out.push(`<div class="grp">${esc(g.name)}</div>`);
    docs.forEach(([c, n]) => {
      const st = state.checks[c] && Object.keys(state.checks[c]).length ? statsFor(c) : null;
      const dot = !st || !st.checked ? '' : st.result === 'pass' ? 'ok' : st.result === 'fail' ? 'bad' : 'p';
      out.push(`<button type="button" class="doc" data-code="${c}" aria-current="${c === state.doc}" title="${esc(c + ' – ' + n)}"><span class="code">${c}</span><span class="nm">${esc(n)}</span><span class="dot ${dot}"></span></button>`);
    });
  });
  $('#docList').innerHTML = out.join('') || '<div class="empty-search">ไม่พบเอกสารที่ตรงกับคำค้น</div>';
}
export function selectDoc(code){
  state.files[state.doc] = state.info.fileName;
  state.doc = code;
  state.info.fileName = state.files[state.doc] || '';
  $('#f-fileName').value = state.info.fileName;
  $('#autoRes').hidden = true;
  persist(); renderDoc();
}

export function initSidebar(){
  $('#search').addEventListener('input', renderDocList);
  $('#docList').addEventListener('click', e => {
    const b = e.target.closest('.doc'); if (!b) return;
    if (b.dataset.code === state.doc) return;
    selectDoc(b.dataset.code);
    if (window.matchMedia('(max-width: 900px)').matches) $('.info').scrollIntoView({behavior:'smooth', block:'start'});
  });
}
