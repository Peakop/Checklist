const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
export function todayISO(){ const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; }
export function thDate(iso){ if (!iso) return '-'; const [y,m,d] = iso.split('-').map(Number); return `${d} ${TH_MONTHS[m-1]} ${y+543}`; }
export function beStamp(iso){ const [y,m,d] = (iso || todayISO()).split('-'); return `${+y+543}-${m}-${d}`; }
// วันที่จากชื่อไฟล์ (YYYY-MM-DD_… ปี พ.ศ. หรือ ค.ศ.) เป็น ISO ค.ศ. ไม่พบหรือไม่ถูกต้องคืน ''
export function fileNameISO(name){
  const m = /^(\d{4})-(\d{2})-(\d{2})_/.exec((name || '').trim()); if (!m) return '';
  const y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y >= 2400 ? y - 543 : y}-${m[2]}-${m[3]}`;
}
export function parseThaiDate(s){
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return [+m[1], +m[2], +m[3]];
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return [+m[3], +m[2], +m[1]];
  const SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  m = /(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/.exec(s);
  if (m) { let mo = TH_MONTHS.indexOf(m[2]); if (mo < 0) mo = SHORT.indexOf(m[2]); if (mo >= 0) return [+m[3], mo + 1, +m[1]]; }
  return null;
}
export const toBE = ([y, m, d]) => [y < 2400 ? y + 543 : y, m, d];
