import { itemId, sectionsFor } from '../config/checklists.js';
import { DOCS } from '../config/documents.js';
import { ensureFonts } from './fonts.js';
import { bandLeft, loadLetterhead } from './letterhead.js';
import { loadSignature } from './signature.js';
import { wrapText } from './thai-wrap.js';
import { state } from '../state.js';
import { statsFor } from '../ui/summary.js';
import { toast } from '../ui/toast.js';
import { beStamp, fileNameISO, thDate } from '../utils/thai-date.js';

export async function buildPages(){
  const psk = await ensureFonts();
  const [lhTop, lhBot] = await loadLetterhead();
  const sigImg = await Promise.all([loadSignature(state.info.author), loadSignature(state.info.qa)]);
  const K = 8, PT = 0.3528 * K, mm = v => v * K;
  // เนื้อหาจบที่ PH - MB = 269 มม. ส่วนลายของแถบท้ายกระดาษ LH_BOT เริ่มที่ 271.9 มม. (ภาพวาดตั้งแต่ 270 มม. แถวบนเป็นสีขาว) จึงไม่ทับกัน
  const PW = 210, PH = 297, ML = 38.1, MR = 25.4, MT = 41, MB = 28, CW = PW - ML - MR, PADX = 1.8;
  const INK = '#111827', GREY = '#6B7280', LINE = '#4B5563', HEAD = '#DCE3EC', SECF = '#EEF2F7', LBL = '#D9E2F3';
  const d = DOCS[state.doc]; const info = state.info; const st = statsFor(state.doc); const ch = state.checks[state.doc] || {};
  const secs = sectionsFor(state.doc);
  // TH SarabunPSK มีแค่ตัวปกติกับตัวหนา น้ำหนัก 600 จึงเป็นตัวหนา
  const font = (size, w = 400) => psk ? `${w >= 600 ? 700 : 400} ${size * 16 / 11 * PT}px "TH SarabunPSK"` : `${w} ${size * PT}px Sarabun, "Noto Sans Thai", sans-serif`;
  const LH = size => size * PT * 1.5;
  const pages = []; let ctx, y;
  const HEAD_R = PW - 8;   // แนวขวาของชื่อเอกสารและเลขหน้าบนแถบแดง ห่างขอบกระดาษ 8 มม. แบบหัวกระดาษ Document Standard

  /* ชื่อเอกสาร 2 บรรทัดและเลขหน้า ชิดขวาบนแถบแดงของหัวกระดาษ แถบแดงแคบลงเมื่อลงล่าง จึงย่อบรรทัดที่ล้นทีละ 0.25 pt
     โดยให้บรรทัดภาษาอังกฤษเล็กกว่าบรรทัดภาษาไทยเสมอ คำนวณครั้งเดียวแล้วใช้ทุกหน้า */
  let head;
  function headLayout(){
    if (head) return head;
    const right = HEAD_R, pad = 2.5, top = 1.5, MIN = 6;
    const L = [{t:`Checklist ${d.name}`, size:17, w:400}, {t:`แบบตรวจสอบเอกสาร ${d.name}`, size:18.5, w:600}, {t:'หน้า | 88', size:11, w:700}];
    for (let n = 0; n < 400; n++) {
      let yy = top, bad = -1;
      L.forEach((l, i) => {
        ctx.font = font(l.size, l.w); const m = ctx.measureText(l.t);
        const fa = (m.fontBoundingBoxAscent || l.size * PT * 1.07) / K, fd = (m.fontBoundingBoxDescent || l.size * PT * 0.23) / K;
        l.y = yy + fa; yy = l.y + fd;
        if (bad < 0 && bandLeft(l.y + m.actualBoundingBoxDescent / K) + pad > right - m.width / K && l.size > MIN) bad = i;
      });
      if (bad < 0) break;
      L[bad].size -= 0.25;
      if (L[0].size > L[1].size - 1) L[0].size = Math.max(MIN, L[1].size - 1);
    }
    return (head = L);
  }

  function newPage(){
    const c = document.createElement('canvas'); c.width = Math.round(PW * K); c.height = Math.round(PH * K);
    ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); pages.push(c);
    if (lhTop) ctx.drawImage(lhTop, 0, 0, mm(PW), mm(38));
    if (lhBot) ctx.drawImage(lhBot, 0, mm(270), mm(PW), mm(PH - 270));
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'right'; ctx.fillStyle = lhTop ? '#fff' : INK;
    headLayout().forEach((l, i) => { ctx.font = font(l.size, l.w); ctx.fillText(i === 2 ? `หน้า | ${pages.length}` : l.t, mm(HEAD_R), mm(l.y)); });
    ctx.textAlign = 'left';
    y = mm(MT);
  }
  function text(str, x, size, w, color, align = 'left'){ ctx.font = font(size, w); ctx.fillStyle = color || INK; ctx.textAlign = align; ctx.fillText(str, x, y); ctx.textAlign = 'left'; }
  function drawCheck(cx, cy, s, color){
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = mm(0.55); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx - s * 0.55, cy + s * 0.02); ctx.lineTo(cx - s * 0.12, cy + s * 0.45); ctx.lineTo(cx + s * 0.6, cy - s * 0.45); ctx.stroke(); ctx.restore();
  }
  function rowHeight(cells, size){
    return Math.max(mm(7), ...cells.map(c => {
      if (c.mark !== undefined) return 0;
      ctx.font = font(c.size || size, c.weight || 400);
      c.lines = wrapText(ctx, c.text, mm(c.w - 2 * PADX));
      return c.lines.length * LH(c.size || size) + mm(2.6);
    }));
  }
  function drawRow(cells, opts = {}){
    const size = opts.size || 10.5;
    let h = rowHeight(cells, size);
    if (y + h > mm(PH - MB)) { newPage(); if (opts.onBreak) opts.onBreak(); h = rowHeight(cells, size); }
    let x = mm(ML);
    cells.forEach(c => {
      const w = mm(c.w);
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = LINE; ctx.lineWidth = mm(0.2); ctx.strokeRect(x, y, w, h);
      if (c.mark) drawCheck(x + w / 2, y + h / 2, mm(2.2), c.mark);
      else if (c.lines) {
        const sz = c.size || size, lh = LH(sz), fs = sz * PT;
        ctx.font = font(sz, c.weight || 400); ctx.fillStyle = c.color || INK; ctx.textAlign = c.align || 'left';
        let ty = y + (h - c.lines.length * lh) / 2 + (lh - fs) / 2 + fs * 0.86;
        const tx = c.align === 'center' ? x + w / 2 : c.align === 'right' ? x + w - mm(PADX) : x + mm(PADX);
        c.lines.forEach(ln => { ctx.fillText(ln, tx, ty); ty += lh; });
        ctx.textAlign = 'left';
      }
      x += w;
    });
    y += h;
  }
  // keep: ความสูงของสิ่งที่ต้องอยู่หน้าเดียวกับชื่อตาราง (อย่างน้อยแถวแรกของตาราง) ชื่อตารางจะไม่ค้างท้ายหน้าคนเดียว
  function caption(label, rest, keep){
    if (y + mm(7.5) + keep > mm(PH - MB)) newPage();
    y += mm(5);
    ctx.font = font(11, 700); ctx.fillStyle = INK; ctx.fillText(label, mm(ML), y);
    const lw = ctx.measureText(label + ' ').width;
    ctx.font = font(11); ctx.fillText(rest, mm(ML) + lw, y);
    y += mm(2.5);
  }

  newPage();
  // title block
  y += mm(2);
  text('แบบตรวจสอบเอกสาร (Checklist)', mm(PW / 2), 16, 700, INK, 'center'); y += mm(7.5);
  text(`${d.name} (${d.code})`, mm(PW / 2), 12, 400, GREY, 'center'); y += mm(4);

  // info table
  const LW = 31, VW = CW / 2 - LW;
  const resColor = st.result === 'pass' ? '#166534' : st.result === 'fail' ? '#B91C1C' : '#92400E';
  const cyc = [info.cycle ? `Cycle ${info.cycle}` : '', info.sprint ? `Sprint ${info.sprint}` : ''].filter(Boolean).join(' / ') || '-';
  const infoRows = [
    [{w:LW, text:'ชื่อเอกสาร', fill:LBL, weight:600}, {w:CW - LW, text:info.fileName || '-'}],
    [{w:LW, text:'ประเภทเอกสาร', fill:LBL, weight:600}, {w:CW - LW, text:`${d.code} – ${d.name}`}],
    [{w:LW, text:'ผู้จัดทำ', fill:LBL, weight:600}, {w:VW, text:info.author || '-'}, {w:LW, text:'QA ผู้ตรวจ', fill:LBL, weight:600}, {w:VW, text:info.qa || '-'}],
    [{w:LW, text:'Cycle / Sprint', fill:LBL, weight:600}, {w:VW, text:cyc}, {w:LW, text:'วันที่ตรวจ', fill:LBL, weight:600}, {w:VW, text:thDate(info.date)}],
    [{w:LW, text:'จำนวนที่ผิดพลาด', fill:LBL, weight:600}, {w:VW, text:String(st.err)}, {w:LW, text:'ผลการตรวจ', fill:LBL, weight:600}, {w:VW, text:st.label, weight:700, color:resColor}]
  ];
  caption('ตาราง 1', 'ข้อมูลเอกสารที่ตรวจสอบ', rowHeight(infoRows[0], 10.5));
  infoRows.forEach(r => drawRow(r));

  // checklist table
  // คอลัมน์ผ่าน/ไม่ผ่านกว้างพอให้หัว "ไม่ผ่าน" อยู่บรรทัดเดียว (ปัดขึ้นทีละ 0.5 มม.) แล้วลดคอลัมน์รายละเอียดลงแทน
  ctx.font = font(10.5, 700);
  const MW = Math.max(11.5, Math.ceil((ctx.measureText('ไม่ผ่าน').width / K + 2 * PADX + 0.6) * 2) / 2);
  const C = [11, 55, MW, MW, CW - 11 - 55 - 2 * MW - 15, 15];
  const headCells = () => [
    {w:C[0], text:'ข้อ', align:'center', weight:700, fill:HEAD}, {w:C[1], text:'รายการตรวจสอบ', align:'center', weight:700, fill:HEAD},
    {w:C[2], text:'ผ่าน', align:'center', weight:700, fill:HEAD}, {w:C[3], text:'ไม่ผ่าน', align:'center', weight:700, fill:HEAD},
    {w:C[4], text:'รายละเอียด', align:'center', weight:700, fill:HEAD}, {w:C[5], text:'จำนวน\nผิดพลาด', align:'center', weight:700, fill:HEAD, size:9.5}];
  const header = () => drawRow(headCells());
  const onBreak = () => { y += mm(2); ctx.font = font(11, 700); ctx.fillStyle = INK; ctx.fillText('ตาราง 2 (ต่อ)', mm(ML), y); y += mm(2.5); header(); };
  const secCells = (sec, si) => [{w:CW, text:`${si + 1}. ${sec.title}  (${sec.ref})`, weight:700, fill:SECF}];
  const itemCells = (sec, si, ii) => {
    const c = ch[itemId(sec, ii)] || {};
    // ผ่าน/ไม่ผ่าน ติ๊กช่องเดียว อีกช่องว่าง ข้อที่ไม่พบข้อมูลรวมสองช่องเป็นช่องเดียว
    // รายละเอียดกับจำนวนผิดพลาดที่ไม่มีข้อมูลใส่ "-" สีเทากลางช่อง ข้อที่ยังไม่ตรวจเว้นว่างทุกช่อง
    // รายละเอียดแสดงเฉพาะข้อที่ไม่ผ่าน หมายเหตุของข้ออื่นยังอยู่ใน state แค่ไม่พิมพ์ลง PDF
    const empty = w => ({w, text:c.s ? '-' : '', align:'center', color:GREY});
    const note = c.s === 'no' ? String(c.note || '').trim() : '';
    const marks = c.s === 'na' ? [{w:C[2] + C[3], text:'ไม่พบข้อมูล', align:'center', color:GREY, size:10}] : [
      c.s === 'yes' ? {w:C[2], mark:'#166534'} : {w:C[2], text:''},
      c.s === 'no' ? {w:C[3], mark:'#B91C1C', fill:'#FDF0EE'} : {w:C[3], text:''}];
    return [
      {w:C[0], text:`${si + 1}.${ii + 1}`, align:'center'}, {w:C[1], text:sec.items[ii]}, ...marks,
      note ? {w:C[4], text:note, size:10} : empty(C[4]),
      c.s === 'no' ? {w:C[5], text:String(Math.max(0, parseInt(c.err, 10) || 0)), align:'center'} : empty(C[5])
    ];
  };
  // หัวหมวดต้องอยู่หน้าเดียวกับข้อแรกของหมวด (keep with next) วัดจากความสูงจริงของทั้งสองแถว
  const secKeepH = si => rowHeight(secCells(secs[si], si), 10.5) + (secs[si].items.length ? rowHeight(itemCells(secs[si], si, 0), 10.5) : 0);
  caption('ตาราง 2', 'รายการตรวจสอบตามมาตรฐานเอกสาร', rowHeight(headCells(), 10.5) + (secs.length ? secKeepH(0) : 0));
  header();
  secs.forEach((sec, si) => {
    if (y + secKeepH(si) > mm(PH - MB)) { newPage(); onBreak(); }
    drawRow(secCells(sec, si), {onBreak});
    sec.items.forEach((_, ii) => drawRow(itemCells(sec, si, ii), {onBreak}));
  });

  // summary + signatures are kept together on one page
  const SW = CW / 4, SIG_H = mm(42);
  const sumRows = [
    [{w:SW, text:'รายการทั้งหมด', fill:LBL, weight:600}, {w:SW, text:`${st.total} ข้อ`, align:'center'}, {w:SW, text:'ตรวจแล้ว', fill:LBL, weight:600}, {w:SW, text:`${st.checked} ข้อ`, align:'center'}],
    [{w:SW, text:'ผ่าน', fill:LBL, weight:600}, {w:SW, text:`${st.yes} ข้อ`, align:'center'}, {w:SW, text:'ไม่ผ่าน', fill:LBL, weight:600}, {w:SW, text:`${st.no} ข้อ`, align:'center'}],
    [{w:SW, text:'ไม่พบข้อมูล', fill:LBL, weight:600}, {w:SW, text:`${st.na} ข้อ`, align:'center'}, {w:SW, text:'จำนวนที่ผิดพลาด', fill:LBL, weight:600}, {w:SW, text:`${st.err} จุด`, align:'center'}],
    [{w:SW, text:'ผลการตรวจ', fill:LBL, weight:600}, {w:CW - SW, text:st.label, weight:700, color:resColor, align:'center'}]
  ];
  const sumH = mm(7.5) + sumRows.reduce((s, r) => s + rowHeight(r, 10.5), 0);
  if (y + sumH + SIG_H > mm(PH - MB)) newPage();
  caption('ตาราง 3', 'สรุปผลการตรวจสอบ', rowHeight(sumRows[0], 10.5));
  sumRows.forEach(r => drawRow(r));

  // signatures
  y += mm(16);
  const colX = [mm(ML + CW / 4), mm(ML + CW * 3 / 4)];
  const sig = [[info.author, 'ผู้จัดทำ'], [info.qa, 'QA ผู้ตรวจ']];
  const sigDate = [fileNameISO(info.fileName), info.date];
  sig.forEach(([name, role], i) => {
    const y0 = y; const x = colX[i];
    const LINE_T = 'ลงชื่อ ......................................................';
    text(LINE_T, x, 11, 400, INK, 'center');
    const im = sigImg[i];
    if (im) {
      // วางกลางเส้นจุด ฐานลายเซ็นทับเส้นเล็กน้อย สูงไม่เกิน 13 มม. ไม่ชนตารางสรุปด้านบน
      ctx.font = font(11); const full = ctx.measureText(LINE_T).width, lw = ctx.measureText('ลงชื่อ ').width;
      const s = Math.min(mm(13) / im.height, (full - lw) * 0.9 / im.width);
      const w = im.width * s, h = im.height * s, cx = x - full / 2 + lw + (full - lw) / 2;
      ctx.drawImage(im, cx - w / 2, y + mm(1.5) - h, w, h);
    }
    y += mm(7);
    text(`( ${name || '......................................................'} )`, x, 11, 400, INK, 'center'); y += mm(6);
    text(role, x, 11, 600, INK, 'center'); y += mm(6);
    text(`วันที่ ${sigDate[i] ? thDate(sigDate[i]) : '........ / ........ / ........'}`, x, 10.5, 400, GREY, 'center');
    if (i === 0) y = y0;
  });
  return pages;
}
export function pdfBaseName(){
  return `${beStamp(state.info.date)}_CL_${state.doc}_V1.0.0`;
}
function buildPdfBlob(pages){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({unit:'mm', format:'a4', orientation:'portrait', compress:true});
  pages.forEach((c, i) => { if (i) pdf.addPage('a4', 'portrait'); pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST'); });
  pdf.setProperties({ title:`Checklist ${state.doc} – ${state.info.fileName || DOCS[state.doc].name}`, subject:'Document Checklist', author:state.info.qa || '', creator:'Doc Checklist' });
  return pdf.output('blob');
}
let downloadsP = null;
export function getDownloads(){
  if (!downloadsP) downloadsP = (window.claude && window.claude.use) ? window.claude.use('downloads').catch(() => null) : Promise.resolve(undefined);
  return downloadsP;
}
export async function savePdf(pages, name){
  if (!window.jspdf) { toast('โหลดตัวสร้าง PDF ไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง'); return; }
  const filename = (name || pdfBaseName()).replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';
  const blob = buildPdfBlob(pages);
  const dl = await getDownloads();
  if (dl) {
    try { const r = await dl.save({filename, data:blob}); if (r && r.status === 'saved') toast(`บันทึก ${filename} แล้ว`); }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') toast('ยกเลิกการดาวน์โหลด');
      else if (code === 'rate_limited') toast('มีหน้าต่างดาวน์โหลดเปิดอยู่ รอสักครู่แล้วลองใหม่');
      else toast('ดาวน์โหลดไม่ได้ในมุมมองนี้');
    }
    return;
  }
  if (dl === null) { toast('ดาวน์โหลดไม่ได้ในมุมมองนี้ ลองเปิดหน้านี้ใน claude.ai'); return; }
  // standalone hosting fallback (outside the Claude viewer)
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`บันทึก ${filename} แล้ว`);
}
