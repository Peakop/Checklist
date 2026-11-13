import { MEMBERS } from '../config/documents.js';

/* ลายเซ็นอยู่ที่ assets/signatures/Sign_<ชื่อจริง>.png จับคู่จากชื่อจริงของสมาชิกที่เลือก (ไม่สนคำนำหน้าและนามสกุล)
   ตัดขอบโปร่งใสออกก่อนวาด ถ้าโหลดหรืออ่านพิกเซลไม่ได้ (เช่นเปิดจาก file://) ก็ไม่ใส่ลายเซ็น */
const SIGN_FILE = {'พรพิมล':'พลพิมล'};   // ชื่อไฟล์ที่สะกดต่างจากรายชื่อสมาชิก
const firstName = s => String(s || '').trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.)\s*/, '').split(/\s+/)[0];
const signs = new Map();
export function loadSignature(name){
  const first = firstName(name);
  if (!first || !MEMBERS.some(([n]) => firstName(n) === first)) return Promise.resolve(null);
  if (!signs.has(first)) signs.set(first, new Promise(res => {
    const im = new Image();
    im.onerror = () => { signs.delete(first); res(null); };
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const a = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < 0) return res(null);
        const t = document.createElement('canvas'); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
        t.getContext('2d').drawImage(c, -x0, -y0); res(t);
      } catch (e) { res(null); }
    };
    im.src = encodeURI(`assets/signatures/Sign_${SIGN_FILE[first] || first}.png`);
  }));
  return signs.get(first);
}
