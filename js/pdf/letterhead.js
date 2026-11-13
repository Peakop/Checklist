/* ---------- PDF rendering (canvas → jsPDF) ---------- */
// Team 4 letterhead artwork (from Tem.docx): top band 0–38 mm, bottom band 270–297 mm of an A4 page
const LH_TOP = 'assets/letterhead/top.png';
const LH_BOT = 'assets/letterhead/bottom.png';
// ขอบซ้ายของแถบแดงใน LH_TOP: [ระยะจากขอบบน มม., ขอบซ้ายของแถบ มม.] วัดจากภาพที่วาดกว้าง 210 x 38 มม.
const LH_BAND = [[0, 52.7], [1.5, 59.8], [3.1, 65.9], [4.6, 71.0], [6.1, 75.8], [7.6, 80.2], [9.2, 84.6], [10.7, 88.9], [12.2, 93.1], [13.7, 97.3],
  [15.3, 101.6], [16.8, 105.9], [18.3, 110.3], [19.8, 114.9], [21.4, 119.9], [22.9, 124.9], [24.4, 130.8], [25.9, 137.5], [27.5, 145.2], [29.0, 153.5],
  [30.5, 162.3], [32.0, 171.5], [33.6, 181.8], [35.1, 193.2], [36.6, 207.5]];
export function bandLeft(y){
  if (y <= 0) return LH_BAND[0][1];
  for (let i = 1; i < LH_BAND.length; i++) { const [y1, x1] = LH_BAND[i]; if (y <= y1) { const [y0, x0] = LH_BAND[i - 1]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } }
  return Infinity;
}
let letterhead;
export function loadLetterhead(){
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  return letterhead || (letterhead = Promise.all([load(LH_TOP), load(LH_BOT)]));
}
