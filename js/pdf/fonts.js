/* PDF ใช้ TH SarabunPSK (assets/fonts/, ใบอนุญาตใน assets/fonts/LICENSE.txt) ซึ่งตัวเล็กกว่า Sarabun ราว 1.46 เท่าที่ pt เดียวกัน
   ขนาดในโค้ดจัดหน้าเป็นขนาดแบบ Sarabun จึงคูณ 16/11 ตอนวาด ให้เนื้อหา 11 กลายเป็น 16 pt ตาม DS และระยะบรรทัดเท่าเดิม
   ถ้าโหลดฟอนต์ไม่ได้ ใช้ Sarabun ขนาดเดิมแทน */
const PSK_FONTS = [[400, 'assets/fonts/THSarabunPSK.ttf'], [700, 'assets/fonts/THSarabunPSK-Bold.ttf']];
let pskP = null;
function loadPsk(){
  return pskP || (pskP = Promise.all(PSK_FONTS.map(([w, url]) => new FontFace('TH SarabunPSK', `url("${url}")`, {weight:String(w)}).load().then(f => document.fonts.add(f))))
    .then(() => true, () => { pskP = null; return false; }));
}
export async function ensureFonts(){
  const psk = await loadPsk();
  if (!psk) try { await Promise.all([400, 700].map(w => document.fonts.load(`${w} 24px Sarabun`, 'กขค Aa1'))); } catch (e) {}
  return psk;
}
