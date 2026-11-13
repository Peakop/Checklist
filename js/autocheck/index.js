import { analyzeDocx } from './docx/analyze.js';
import { readDocx } from './docx/read.js';
import { analyzeXlsx, readXlsx } from './xlsx.js';
import { isSheet, itemId } from '../config/checklists.js';
import { DOCS, LONG, MEETING, SHEET } from '../config/documents.js';
import { checksOf, persist, state } from '../state.js';
import { currentSections, renderChecklist } from '../ui/checklist.js';
import { checkFileName } from '../ui/form.js';
import { renderDocList, selectDoc } from '../ui/sidebar.js';
import { toast } from '../ui/toast.js';
import { $, esc } from '../utils/dom.js';

/* write results into the checklist; anything the reviewer already filled in is left alone */
function applyAuto(R){
  const ch = checksOf(state.doc);
  Object.keys(ch).forEach(id => { if (ch[id].auto) delete ch[id]; });
  const ids = new Map(); currentSections.forEach((s, si) => s.items.forEach((_, i) => ids.set(itemId(s, i), `${si + 1}.${i + 1}`)));
  const out = {yes:0, no:0, na:0, kept:0, hints:[], total:ids.size};
  ids.forEach((n, id) => {
    const r = R[id], cur = ch[id]; if (!r) return;
    if (r.tip) out.hints.push({n, note:r.tip});
    // คำแนะนำไม่ลงช่องรายละเอียด แสดงในกล่องผลตรวจแทน ข้ามข้อที่ผู้ใช้ตอบแล้ว
    if (!r.s) { if (r.note && !(cur && cur.s)) out.hints.push({n, note:r.note}); return; }
    if (cur && (cur.s || cur.note)) { out.kept++; return; }
    // รายละเอียดเติมเฉพาะข้อที่ไม่ผ่าน เพื่อบอกจุดที่ผิด
    ch[id] = r.s === 'no' ? {s:'no', note:r.note || '', err:r.err, auto:true} : {s:r.s, auto:true};
    out[r.s]++;
  });
  persist(); renderChecklist(); renderDocList();
  return out;
}
function showAuto(kind, html){ const el = $('#autoRes'); el.className = 'auto-res' + (kind === 'bad' ? ' bad' : ''); el.innerHTML = html; el.hidden = false; }
// ข้อผิดพลาดที่ผู้ใช้ต้องแก้ไฟล์เอง แสดงทั้งในกล่องผลตรวจและ toast
function autoFail(msg){ showAuto('bad', esc(msg)); toast(msg); }
const FMT_NAME = {xlsx:'Excel', docx:'Word'};
/* ไฟล์ .docx/.xlsx จริงเป็น zip (ขึ้นต้นด้วย PK) ไฟล์ที่ตั้งรหัสผ่านและไฟล์ .doc/.xls รุ่นเก่าเป็นไฟล์ OLE (D0 CF 11 E0) */
async function fileProblem(file, ext){
  if (!file.size) return 'ไฟล์ว่างเปล่า (0 ไบต์) เลือกไฟล์ใหม่อีกครั้ง';
  const b = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (b[0] === 0x50 && b[1] === 0x4B) return null;
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
    // ไฟล์ Office ที่ตั้งรหัสผ่านเก็บสตรีม EncryptionInfo (ชื่อสตรีมเป็น UTF-16LE)
    const all = new TextDecoder('utf-16le').decode(await file.arrayBuffer());
    if (all.includes('EncryptionInfo')) return `ไฟล์ ${file.name} ถูกตั้งรหัสผ่านไว้ เปิดในโปรแกรมแล้วเอารหัสผ่านออก (ไฟล์ > ข้อมูล > ป้องกัน) แล้วบันทึกใหม่ก่อนอัปโหลด`;
    return ext === 'xlsx' ? `ไฟล์ ${file.name} เป็นไฟล์ Excel รุ่นเก่า (.xls) ที่เปลี่ยนนามสกุล เปิดใน Excel แล้วบันทึกเป็น .xlsx ก่อน`
                          : `ไฟล์ ${file.name} เป็นไฟล์ Word รุ่นเก่า (.doc) ที่เปลี่ยนนามสกุล เปิดใน Word แล้วบันทึกเป็น .docx ก่อน`;
  }
  return `อ่านไฟล์ ${file.name} ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ไฟล์ .${ext} จริง ลองเปิดในโปรแกรมแล้วบันทึกใหม่`;
}
let pendingFile = null;   // ไฟล์ที่รอผู้ใช้ตอบว่าจะสลับชุดตรวจหรือไม่
async function autoCheck(file){
  if (!file) return;
  pendingFile = null;
  // ดูจากนามสกุลเป็นหลัก เพราะบาง browser บน Mac ส่ง file.type มาเป็นค่าว่าง
  const ext = ((/\.([^.]+)$/.exec(file.name) || [])[1] || '').toLowerCase();
  if (ext === 'doc' || ext === 'xls') { autoFail(ext === 'doc' ? 'ไฟล์ .doc แบบเก่ายังไม่รองรับ เปิดใน Word แล้วบันทึกเป็น .docx ก่อน' : 'ไฟล์ .xls แบบเก่ายังไม่รองรับ เปิดใน Excel แล้วบันทึกเป็น .xlsx ก่อน'); return; }
  if (ext !== 'docx' && ext !== 'xlsx') { autoFail(`รองรับเฉพาะไฟล์ Word (.docx) และ Excel (.xlsx) แต่ไฟล์นี้คือ ${file.name}`); return; }
  let bad; try { bad = await fileProblem(file, ext); } catch (e) { bad = `อ่านไฟล์ ${file.name} ไม่ได้ ลองเลือกไฟล์ใหม่อีกครั้ง`; }
  if (bad) { autoFail(bad); return; }
  // รหัสแรกหลังวันที่ที่อยู่ในตารางรหัสเอกสาร (VC_UCD → VC, UC01_AD → AD)
  const code = file.name.replace(/\.[^.]+$/, '').split('_').slice(1).find(t => DOCS[t]);
  if (code && code !== state.doc) { selectDoc(code); toast(`เปลี่ยนเป็นเอกสาร ${code} ตามชื่อไฟล์`); }
  const excel = ext === 'xlsx';
  if (isSheet(state.doc) !== excel) {
    // ไม่ปฏิเสธไฟล์ ถามก่อนว่าจะสลับชุดตรวจของเอกสารนี้ตามชนิดไฟล์หรือไม่
    pendingFile = file;
    const to = excel ? 'xlsx' : 'docx', from = excel ? 'Word' : 'Excel';
    showAuto('', `<b>ไฟล์นี้เป็น ${FMT_NAME[to]} – สลับเป็นชุดตรวจแบบ ${FMT_NAME[to]} ไหม</b>` +
      `<span class="sub">${esc(state.doc)} ใช้ชุดตรวจแบบ ${from} อยู่ ถ้าสลับ ระบบจะจำไว้สำหรับเอกสารนี้ และตรวจ ${esc(file.name)} ต่อทันที</span>` +
      `<div class="auto-act"><button type="button" class="btn primary" data-fmt="${to}">สลับเป็นชุดตรวจแบบ ${FMT_NAME[to]}</button><button type="button" class="btn" data-fmt="cancel">ไม่สลับ</button></div>`);
    return;
  }
  state.info.fileName = file.name.replace(/\.(docx|xlsx)$/i, ''); $('#f-fileName').value = state.info.fileName; checkFileName(); persist();
  const btn = $('#autoBtn'); btn.disabled = true; showAuto('', `กำลังตรวจ ${esc(file.name)}…`);
  try {
    const opts = {code:state.doc, name:DOCS[state.doc].name, fileName:file.name, long:LONG.has(state.doc), meeting:MEETING.has(state.doc)};
    const R = excel ? analyzeXlsx(await readXlsx(file), opts) : analyzeDocx(await readDocx(file), opts);
    const o = applyAuto(R); const done = o.yes + o.no + o.na;
    const fmt = state.format[state.doc], back = fmt && (fmt === 'xlsx') !== SHEET.has(state.doc) ? (fmt === 'xlsx' ? 'docx' : 'xlsx') : null;
    showAuto('', `<b>ตรวจ ${esc(file.name)} แล้ว</b> · ติ๊กผลให้ ${done} ข้อ (ผ่าน ${o.yes} · ไม่ผ่าน ${o.no} · ไม่พบข้อมูล ${o.na}) · ต้องตรวจเองอีก ${o.total - done} ข้อ` +
      `<span class="sub">ข้อที่มีป้าย "อัตโนมัติ" ตรวจจากรูปแบบในไฟล์ ควรตรวจทานก่อนส่ง${o.kept ? ` · ไม่ทับ ${o.kept} ข้อที่ตรวจเองไว้แล้ว` : ''}</span>` +
      (o.hints.length ? `<span class="sub">คำแนะนำสำหรับข้อที่ต้องตรวจเอง ${o.hints.length} ข้อ</span><ul class="auto-hints">${o.hints.map(h => `<li>ข้อ ${h.n} ${esc(h.note)}</li>`).join('')}</ul>` : '') +
      (back ? `<div class="auto-act"><button type="button" class="btn" data-fmt="${back}">กลับไปใช้ชุดตรวจแบบ ${FMT_NAME[back]}</button></div>` : ''));
  } catch (e) {
    autoFail(`ตรวจไม่สำเร็จ: ${e.message || e}`);
  } finally { btn.disabled = false; }
}
// a file dropped anywhere on the page goes to the checker instead of the browser opening it
let dragN = 0;

export function initAutoCheck(){
  $('#autoRes').addEventListener('click', e => {
    const b = e.target.closest('[data-fmt]'); if (!b) return;
    const f = pendingFile; pendingFile = null;
    if (b.dataset.fmt === 'cancel') { $('#autoRes').hidden = true; toast('ไม่ได้ตรวจไฟล์ ชุดตรวจยังเหมือนเดิม'); return; }
    state.format[state.doc] = b.dataset.fmt; persist(); renderChecklist(); renderDocList();
    toast(`${state.doc} ใช้ชุดตรวจแบบ ${FMT_NAME[b.dataset.fmt]} แล้ว`);
    if (f) autoCheck(f); else $('#autoRes').hidden = true;
  });
  $('#autoBtn').addEventListener('click', () => $('#autoFile').click());
  $('#autoFile').addEventListener('change', e => { autoCheck(e.target.files[0]); e.target.value = ''; });
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN++; $('#autoBox').classList.add('drag'); } });
  window.addEventListener('dragleave', () => { if (dragN && !--dragN) $('#autoBox').classList.remove('drag'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('#autoBox').classList.remove('drag'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) autoCheck(f); });
}
