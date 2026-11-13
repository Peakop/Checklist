import { DOCS } from './config/documents.js';
import { todayISO } from './utils/thai-date.js';

/* ---------- state ---------- */
const STORE_KEY = 'st-doc-checklist-v1';
export let state = { doc:'DS', info:{ fileName:'', author:'', qa:'', cycle:'', sprint:'', date:todayISO() }, checks:{}, files:{}, format:{} };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && saved.info) { state = Object.assign(state, saved); state.info = Object.assign({}, state.info, saved.info); if (!DOCS[state.doc]) state.doc = 'DS'; }
} catch (e) {}
state.files = state.files || {};
state.format = state.format || {};
let saveT;
export function persist(){ clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }, 250); }
// ล้างข้อความที่การตรวจอัตโนมัติรุ่นก่อนเติมไว้ (auto:true) ให้ข้อที่ผ่าน/ไม่พบข้อมูล และแถวคำแนะนำที่ไม่มีผล ข้อความที่ผู้ใช้พิมพ์มี auto:false จึงไม่ถูกแตะ
let autoCleaned = false;
Object.values(state.checks || {}).forEach(ch => Object.keys(ch).forEach(id => {
  const c = ch[id]; if (!c || !c.auto || c.s === 'no' || (c.s && !('note' in c))) return;
  if (c.s) delete c.note; else delete ch[id];
  autoCleaned = true;
}));
if (autoCleaned) persist();
export function checksOf(code){ return state.checks[code] || (state.checks[code] = {}); }
