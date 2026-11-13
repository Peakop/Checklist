let jszipP = null;
export function loadJSZip(){
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return jszipP || (jszipP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = () => res(window.JSZip);
    s.onerror = () => { jszipP = null; s.remove(); rej(new Error('โหลดตัวอ่านไฟล์ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่')); };
    document.head.append(s);
  }));
}
