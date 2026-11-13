/* ---------- data from Document Standard V2.2.0 ---------- */
export const REF_DEFAULT = '2569-10-11_DS_V2.2.0';
export const MEMBERS = [
  ['นายปรเมษฐ ศิริรัตน์','Team Leader'],['นายณทชัย อินจา','Plan Manager'],['นายฉัตรชัย วิเศษโวหาร','Plan Engineer'],
  ['นายอนุศักดิ์ ทรัพย์การ์ณ','Development Manager'],['นายภูมิพัฒน์ รื่นรวย','Development Engineer'],['นายภควัต ศรีบุษย์','Development Engineer'],
  ['นางสาววิมลวรรณ แซ่จิว','Quality Manager'],['นางสาวพรพิมล ค้ำชู','Quality Engineer'],['นายฐาปกรณ์ โสวรรณะ','Quality Engineer'],
  ['นายอานันท์วัฒน์ พลตะคุ','Support Manager'],['นายพงศ์พสุ บุญครอง','Support Engineer']
];
export const GROUPS = [
  {name:'การประชุม', docs:[['AMPO','Agenda of Meeting of PO'],['AMT','Agenda of Meeting Team'],['MIPO','Meeting Invite Product Owner'],['MIT','Meeting Invite Team'],['MRPO','Meeting Report Product Owner'],['MRT','Meeting Report Team'],['IM','Inspection Meeting']]},
  {name:'ความต้องการ', docs:[['RD','Requirements Document'],['SRSD','Software Requirement Specification Document'],['US','User Story'],['RP','Requirement Prototype'],['TM','Traceability Matrix'],['SDAD','System Design Acceptance Document'],['AP','Approve Form']]},
  {name:'การออกแบบระบบ', docs:[['UCD','Use Case Diagram'],['UCDS','Use Case Description'],['AD','Activity Diagram'],['SD','Sequence Diagram'],['CD','Class Diagram'],['SMD','State Machine Diagram'],['ERD','Entity Relationship Diagram'],['DD','Data Dictionary'],['SM','Site Map']]},
  {name:'การทดสอบและคุณภาพ', docs:[['TP','Test Plan'],['TS','Test Scenario'],['TC','Test Case'],['TSC','Test Script'],['CL','Checklist'],['DTS','Defect Type Standard'],['IC','Inspection Coding'],['RVD','Revised Document']]},
  {name:'การวางแผนและติดตาม', docs:[['PP','Personal Plan'],['PSR','Plan Summary Report'],['WBS','Work Breakdown Structure'],['DOW','Division Of Workload'],['GC','Gantt Chart'],['MS','Milestone'],['MC','Master Chart'],['DC','Detail Chart'],['BC','Burndown Chart'],['VLC','Velocity Chart'],['RM','Risk Management'],['TG','Team Goal'],['RG','Role Goal'],['MG','Member Goal']]},
  {name:'มาตรฐานและคู่มือ', docs:[['DS','Document Standard'],['CS','Coding Standard'],['UXIS','UX/UI Standard'],['SS','Security Standard'],['AS','Architectural Style'],['VC','Version Control'],['APID','API Document'],['CM','Configuration Manual'],['INM','Introduction Manual'],['UM','User Manual']]},
];
export const DOCS = {};
GROUPS.forEach(g => g.docs.forEach(([code, name]) => DOCS[code] = {code, name, group:g.name}));
export const MEETING = new Set(['AMPO','AMT','MIPO','MIT','MRPO','MRT']);
export const INVITE = new Set(['MIPO','MIT']);
export const AGENDA = new Set(['AMPO','AMT']);
export const REPORT = new Set(['MRPO','MRT','IM']);
export const CHART = new Set(['GC','MS','MC','DC','BC','VLC']);
export const SHEET = new Set(['PP','DC','MC','GC','RM','DOW']);    // ส่งเป็นไฟล์ Excel ไม่มีหน้ากระดาษ A4
export const LONG = new Set(['SRSD','TP','DS','CS','UXIS','SS','AS']);      // เอกสารยาวที่มีหน้าปก ตารางควบคุมการเปลี่ยนแปลง และสารบัญ
export const DIAGRAM_IMG = new Set(['UCD','AD','SD','CD','SMD','ERD','SM']);  // ส่งเป็นไฟล์ภาพเดี่ยว (.jpg/.png) ไม่มีหน้ากระดาษ
// รหัสที่ทีมใช้แล้วแต่ยังไม่อยู่ในตาราง 3 (ตารางรหัสเอกสาร) ของ DS V2.2.0 ระบบยอมรับรหัสนี้ และแจ้งเป็นหมายเหตุ
export const NOT_IN_DS = new Set(['SS', 'AS']);
export const notInDsNote = code => `รหัส ${code} ยังไม่อยู่ใน DS V2.2.0`;
// ตัวอย่างชื่อไฟล์ในช่องชื่อไฟล์
export const FILE_EG = {default:'2569-10-05_TP_V1.2.0', SS:'2569-10-25_SS_V1.0.0'};
