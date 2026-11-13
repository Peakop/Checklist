import { loadJSZip } from '../zip.js';

export async function readDocx(file){
  const JSZip = await loadJSZip();
  let zip; try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ .docx'); }
  const dp = new DOMParser(); const names = Object.keys(zip.files);
  const parse = async p => { const f = p && zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
  return {
    document: await parse('word/document.xml'), styles: await parse('word/styles.xml'), numbering: await parse('word/numbering.xml'),
    theme: await parse(names.find(n => /^word\/theme\/theme\d*\.xml$/.test(n))),
    headers: await Promise.all(names.filter(n => /^word\/header\d*\.xml$/.test(n)).map(parse)),
    footers: await Promise.all(names.filter(n => /^word\/footer\d*\.xml$/.test(n)).map(parse))
  };
}
