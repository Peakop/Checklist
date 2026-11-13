import { NOT_IN_DS, notInDsNote } from '../config/documents.js';

export function resultSet(){
  const R = {};
  const set = (id, s, note, err) => { R[id] = {s, note}; if (s === 'no') R[id].err = Math.max(1, err || 1); };
  const hint = (id, note) => { R[id] = {s:null, note}; };
  // หมายเหตุเพิ่มของข้อที่ตัดสินแล้ว แสดงในรายการคำแนะนำ ไม่ลงช่องรายละเอียด
  const tip = (id, note) => { if (R[id]) R[id].tip = note; };
  return {R, set, hint, tip};
}
/* file name and version digits (DS ข้อ 3), shared by Word and Excel; returns the version in the file name */
export function checkFileNameRules({set, tip}, opts){
  const base = opts.fileName.replace(/\.(docx|xlsx)$/i, '').replace(/\s*\(\d+\)$/, '').trim();
  // VC ต่อท้ายด้วยรหัสเอกสารที่ควบคุม เช่น 2569-09-13_VC_UCD_V1.3.0
  const fm = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})_([A-Za-z]+)${opts.code === 'VC' ? '(?:_[A-Za-z]+)?' : ''}(_ครั้งที่\\s?\\d+)?_V(\\d+\\.\\d+\\.\\d+)$`).exec(base);
  const fileVer = (/_V(\d+\.\d+\.\d+)$/.exec(base) || [])[1] || null;
  const dateOk = fm && +fm[2] >= 1 && +fm[2] <= 12 && +fm[3] >= 1 && +fm[3] <= 31;
  if (fm && dateOk) set('naming.0', 'yes', `ชื่อไฟล์ ${base}`);
  else set('naming.0', 'no', `ชื่อไฟล์ "${base}" ไม่ตรงรูปแบบ YYYY-MM-DD_ID_Version`);
  const codeIn = fm ? fm[4] : (/_([A-Za-z]{2,5})(?=_)/.exec(base) || [])[1];
  if (codeIn === opts.code) set('naming.1', 'yes', `รหัส ${codeIn}`);
  else set('naming.1', 'no', codeIn ? `รหัสในชื่อไฟล์คือ "${codeIn}" ไม่ใช่ "${opts.code}"` : `ไม่พบรหัส "${opts.code}" ในชื่อไฟล์`);
  if (NOT_IN_DS.has(opts.code)) tip('naming.1', notInDsNote(opts.code));
  if (opts.meeting) { if (/_ครั้งที่\s?\d+_/.test(base)) set('naming.2', 'yes', (/ครั้งที่\s?\d+/.exec(base) || [''])[0]); else set('naming.2', 'no', 'ไม่พบ _ครั้งที่N_ ในชื่อไฟล์'); }
  if (fileVer) set('version.0', 'yes', `V${fileVer}`); else set('version.0', 'no', 'ไม่พบเลขเวอร์ชัน 3 หลัก (_VX.x.x) ท้ายชื่อไฟล์');
  return {fileVer, fileDate:fm && dateOk ? [+fm[1], +fm[2], +fm[3]] : null};
}
