import { TH_CH } from './text.js';

/* ค่าความลับรูปแบบที่รู้จัก ใช้ทั้งข้อ ssx.11 และการซ่อนค่าเหล่านี้ออกจากผลตรวจทุกข้อ (หน้าเว็บ, localStorage และ PDF)
   [ชื่อรูปแบบ, regex, ตัวกรองเพิ่ม (คืนส่วนที่เป็นความลับไว้ซ่อน ไม่รวมคำนำหน้าอย่าง base64: หรือ null ถ้าไม่ใช่)] */
const SECRET_PH = /^(\*+|x+|•+|\.{2,}|…|-+|null|none|empty|changeme|your\w*|\w*_here)$/i;   // ค่าตัวอย่างที่ไม่ใช่ความลับจริง
const SECRETS = [
  ['APP_KEY แบบ base64', /base64:([A-Za-z0-9+/]{40,}={0,2})/g, m => m[1]],
  ['Google client secret (GOCSPX-)', /GOCSPX-([A-Za-z0-9_-]{10,})/g, m => m[1]],
  ['Google API key (AIza)', /AIza([0-9A-Za-z_-]{30,})/g, m => m[1]],
  ['Private key', /-----BEGIN (?!PUBLIC\b)[A-Z0-9 ]*KEY-----/g, m => m[0]],
  // password=ค่า ไม่นับค่าว่าง ค่าตัวอย่าง ข้อความภาษาไทย และโค้ด เช่น $user->password = Str::random(40) หรือ Password::defaults()
  ['รหัสผ่าน (password=)', /[A-Za-z0-9_]*(?:password|passwd|pwd)=(?![=>])(?:[ \t]*(["'])([^"'\n]+)\1|([^\s"'`,;<>()]+))/gi,
    m => { const v = (m[2] || m[3] || '').trim(); return v && !SECRET_PH.test(v) && !TH_CH.test(v) && !/^\$|::|->|\(/.test(v) ? v : null; }],
  // สตริงสุ่มยาว 40 ตัวขึ้นไปที่มีทั้งตัวพิมพ์ใหญ่ เล็ก และตัวเลข (ไม่นับ commit hash ซึ่งเป็นเลขฐานสิบหกล้วน และพาธไฟล์)
  ['สตริงสุ่มยาว 40 ตัวขึ้นไป', /(?<![A-Za-z0-9+/:_-])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/_-])/g,
    m => /[a-z]/.test(m[0]) && /[A-Z]/.test(m[0]) && /\d/.test(m[0]) && (m[0].match(/\//g) || []).length <= 2 ? m[0] : null]
];
// [{kind, value}] ของทุกค่าความลับในข้อความ รูปแบบเรียงจากเฉพาะไปกว้าง ช่วงที่รูปแบบก่อนหน้าจับได้แล้วไม่นับซ้ำ
export function findSecrets(text){
  const out = [], taken = [];
  SECRETS.forEach(([kind, re, keep]) => {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      const a = m.index, b = a + m[0].length;
      if (taken.some(([x, y]) => a < y && x < b)) continue;
      const v = keep(m); if (v) { out.push({kind, value:v}); taken.push([a, b]); }
    }
  });
  return out;
}
// ซ่อนทุกช่วงในข้อความที่ซ้ำกับค่าความลับตั้งแต่ 6 ตัวอักษรขึ้นไป (ข้อความตัวอย่างในผลตรวจตัดเหลือ 30 ตัว จึงอาจมีความลับเพียงบางส่วน)
export function redactText(s, values){
  if (!s || !values.length) return s;
  // ค่าที่ตามหลังคำนำหน้าที่รู้จักถูกซ่อนเสมอ แม้ข้อความตัวอย่างจะตัดเหลือไม่กี่ตัว
  s = s.replace(/(base64:|GOCSPX-|AIza|(?:password|passwd|pwd)=)[^\s"'`,;<>()…]+/gi, '$1[ซ่อนค่าความลับ]');
  const wins = new Set(); values.forEach(v => { const L = Math.min(6, v.length); for (let i = 0; i + L <= v.length; i++) wins.add(v.substr(i, L)); });
  const sizes = [...new Set(values.map(v => Math.min(6, v.length)))];
  const hide = new Array(s.length).fill(false);
  for (let j = 0; j < s.length; j++) sizes.forEach(L => { if (wins.has(s.substr(j, L))) for (let k = j; k < j + L; k++) hide[k] = true; });
  let out = '', on = false;
  for (let j = 0; j < s.length; j++) { if (hide[j]) { if (!on) out += '[ซ่อนค่าความลับ]'; on = true; } else { out += s[j]; on = false; } }
  return out;
}
