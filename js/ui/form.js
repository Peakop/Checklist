import { MEETING, MEMBERS, NOT_IN_DS, REF_DEFAULT, notInDsNote } from '../config/documents.js';
import { persist, state } from '../state.js';
import { $, esc } from '../utils/dom.js';

/* ---------- header form ---------- */
const FIELDS = ['fileName','author','qa','cycle','sprint','date'];
export function initForm(){
  $('#members').innerHTML = MEMBERS.map(([n, r]) => `<option value="${esc(n)}">${esc(r)}</option>`).join('');
  FIELDS.forEach(k => { $('#f-' + k).value = state.info[k] || ''; });
  FIELDS.forEach(k => {
    const el = $('#f-' + k);
    el.addEventListener(el.type === 'date' ? 'change' : 'input', () => {
      state.info[k] = el.value;
      if (k === 'fileName') checkFileName();
      persist();
    });
  });
  $('#refChip').textContent = `DS V${(/_V?(\d+\.\d+\.\d+)$/.exec(REF_DEFAULT) || [])[1]}`;
}
export function checkFileName(){
  const hint = $('#fileHint'); const v = (state.info.fileName || '').trim().replace(/\.(docx?|pdf|xlsx?|pptx?)$/i, '');
  hint.className = 'hint';
  if (!v) { hint.textContent = 'กรอกชื่อไฟล์เพื่อตรวจรูปแบบ YYYY-MM-DD_ID_Version ให้อัตโนมัติ'; return; }
  const m = /^(\d{4})-(\d{2})-(\d{2})_([A-Za-z]+)(_ครั้งที่\s?\d+)?_V(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) { hint.className = 'hint bad'; hint.textContent = 'ไม่ตรงรูปแบบ YYYY-MM-DD_ID_Version เช่น 2569-10-05_TP_V1.2.0'; return; }
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) { hint.className = 'hint bad'; hint.textContent = `วันที่ในชื่อไฟล์ไม่ถูกต้อง (${m[1]}-${m[2]}-${m[3]})`; return; }
  if (m[4] !== state.doc) { hint.className = 'hint bad'; hint.textContent = `รหัสในชื่อไฟล์คือ "${m[4]}" แต่เอกสารที่เลือกคือ "${state.doc}"`; return; }
  if (MEETING.has(state.doc) && !m[5]) { hint.className = 'hint bad'; hint.textContent = 'เอกสารการประชุมต้องระบุครั้งที่ เช่น _ครั้งที่1_'; return; }
  hint.className = 'hint ok'; hint.textContent = `ตรงรูปแบบ · เวอร์ชัน ${m[6]}.${m[7]}.${m[8]}` + (NOT_IN_DS.has(state.doc) ? ` · ${notInDsNote(state.doc)}` : '');
}
