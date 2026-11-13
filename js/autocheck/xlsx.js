import { toArr, upTo } from './docx/xml.js';
import { checkFileNameRules, resultSet } from './result.js';
import { egs, snip } from './text.js';
import { loadJSZip } from './zip.js';

/* ---------- auto check: .xlsx (PP, DC, MC, GC, RM, DOW และเอกสารที่ผู้ใช้สลับเป็นชุดตรวจแบบ Excel) ---------- */
const xAll = (el, n) => el ? toArr(el.getElementsByTagNameNS('*', n)) : [];
const xKid = (el, n) => { if (el) for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && c.localName === n) return c; return null; };
const xAtt = (el, n) => { if (el) for (const a of toArr(el.attributes)) if (a.localName === n) return a.value; return null; };
const xText = el => xAll(el, 't').filter(t => !upTo(t, p => p.localName === 'rPh')).map(t => t.textContent).join('');
const colName = c => { let s = ''; for (c++; c; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + (c - 1) % 26) + s; return s; };
const XL_ERR = /^#(DIV\/0!|REF!|N\/A|VALUE!|NAME\?|NUM!|NULL!|SPILL!|CALC!)$/;
// built-in number formats that show a date (the display depends on the computer's locale)
const XL_DATE_IDS = {14:'วันที่สั้นตามเครื่อง (mm-dd-yy)', 15:'d-mmm-yy', 16:'d-mmm', 17:'mmm-yy', 22:'m/d/yy h:mm'};
[27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58, 71, 72, 73, 74, 75].forEach(i => XL_DATE_IDS[i] = `รูปแบบวันที่ในตัว #${i}`);
const isDateFmt = code => /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^general$/i.test(code);
const TEXT_DATE = /^\s*\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}\s*$/;
export async function readXlsx(file){
  const JSZip = await loadJSZip();
  let zip; try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error('เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่ .xlsx'); }
  const dp = new DOMParser();
  const parse = async p => { const f = p && zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
  const wb = await parse('xl/workbook.xml');
  if (!wb) throw new Error('ไม่พบ xl/workbook.xml ไฟล์อาจไม่ใช่ Excel');
  const rels = {}; xAll(await parse('xl/_rels/workbook.xml.rels'), 'Relationship').forEach(r => rels[xAtt(r, 'Id')] = xAtt(r, 'Target'));
  const shared = xAll(await parse('xl/sharedStrings.xml'), 'si').map(xText);
  const st = await parse('xl/styles.xml');
  const fmtCodes = {}; xAll(st, 'numFmt').forEach(n => fmtCodes[xAtt(n, 'numFmtId')] = xAtt(n, 'formatCode') || '');
  const xfs = xAll(xKid(st && st.documentElement, 'cellXfs'), 'xf').map(x => +(xAtt(x, 'numFmtId') || 0));
  const fmtOf = s => { const id = xfs[+s || 0] || 0; const code = fmtCodes[id];
    return code != null ? {date:isDateFmt(code), pct:/%/.test(code), name:code} : {date:id in XL_DATE_IDS, pct:id === 9 || id === 10, name:XL_DATE_IDS[id] || `#${id}`}; };
  const sheets = [];
  for (const sh of xAll(wb, 'sheet')) {
    const tgt = rels[xAtt(sh, 'id')]; if (!tgt) continue;
    const doc = await parse(tgt.startsWith('/') ? tgt.slice(1) : 'xl/' + tgt.replace(/^\.\//, ''));
    const cells = [];
    xAll(doc, 'c').forEach(c => {
      const m = /^([A-Z]+)(\d+)$/.exec(xAtt(c, 'r') || ''); if (!m) return;
      const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = +m[2];
      const t = xAtt(c, 't'), v = xKid(c, 'v'), raw = v ? v.textContent : null;
      let val = null;
      if (t === 's') val = raw != null ? shared[+raw] : null;
      else if (t === 'inlineStr') val = xText(xKid(c, 'is'));
      else if (t === 'str' || t === 'e') val = raw;
      else if (t === 'b') val = raw === '1';
      else if (raw != null && raw !== '') val = +raw;
      if (val == null || val === '') return;
      cells.push({ref:m[0], row, col, val, err:t === 'e' || (typeof val === 'string' && XL_ERR.test(val.trim())), formula:!!xKid(c, 'f'), fmt:fmtOf(xAtt(c, 's'))});
    });
    sheets.push({name:xAtt(sh, 'name') || '', hidden:/hidden/i.test(xAtt(sh, 'state') || ''), cells});
  }
  if (!sheets.length) throw new Error('ไม่พบชีตในไฟล์');
  return {sheets};
}
/* wb: {sheets:[{name, hidden, cells:[{ref,row,col,val,err,formula,fmt}]}]}; opts as analyzeDocx */
export function analyzeXlsx(wb, opts){
  const rs = resultSet(), {R, set, hint} = rs;
  const {fileVer} = checkFileNameRules(rs, opts);
  const code = opts.code;
  const shown = wb.sheets.filter(s => !s.hidden);
  const all = shown.flatMap(s => s.cells.map(c => Object.assign({sheet:s.name}, c)));
  const where = c => shown.length > 1 ? `${c.sheet}!${c.ref}` : c.ref;
  const txt = c => typeof c.val === 'string' ? c.val.trim() : '';

  /* --- รูปแบบไฟล์ Excel --- */
  const dflt = shown.filter(s => /^(sheet|ชีต|แผ่นงาน)\s*\d*$/i.test(s.name.trim()));
  if (dflt.length) set('sheet.0', 'no', `ชื่อชีตเป็นค่าเริ่มต้น: ${egs(dflt.map(s => s.name), 'ชีต')}`, dflt.length);
  else set('sheet.0', 'yes', `ชีต: ${egs(shown.map(s => s.name), 'ชีต')}`);
  const errs = all.filter(c => c.err);
  if (errs.length) set('sheet.1', 'no', `${egs(errs.map(c => `${where(c)} ${txt(c) || String(c.val)}`), 'เซลล์')}`, errs.length);
  else set('sheet.1', 'yes', `ไม่พบค่าผิดพลาด (ตรวจ ${all.filter(c => c.formula).length} สูตร)`);
  const dateFmts = {};
  const addFmt = (k, c) => (dateFmts[k] || (dateFmts[k] = [])).push(where(c));
  all.forEach(c => { if (typeof c.val === 'number' && c.fmt.date) addFmt(c.fmt.name, c); else if (TEXT_DATE.test(txt(c))) addFmt('วันที่ที่พิมพ์เป็นข้อความ', c); });
  const fk = Object.keys(dateFmts);
  if (!fk.length) hint('sheet.2', 'ไม่พบเซลล์วันที่');
  else if (fk.length > 1) set('sheet.2', 'no', fk.map(k => `${k} ${dateFmts[k].length} เซลล์ เช่น ${dateFmts[k][0]}`).join(' · '), fk.length - 1);
  else set('sheet.2', 'yes', `${dateFmts[fk[0]].length} เซลล์ใช้รูปแบบ ${fk[0]}`);

  /* --- เวอร์ชันในเนื้อไฟล์ --- */
  const right = c => all.find(o => o.sheet === c.sheet && o.row === c.row && o.col > c.col && String(o.val).trim());
  const verCell = all.find(c => /^\s*(version|เวอร์ชัน)(?![a-z])/i.test(txt(c)));
  const verIn = verCell && ((/(\d+\.\d+\.\d+)/.exec(txt(verCell)) || [])[1] || (/(\d+\.\d+\.\d+)/.exec(String((right(verCell) || {}).val || '')) || [])[1]);
  const verId = code === 'MC' || code === 'GC' ? 'mgc.1' : code === 'PP' || code === 'DC' ? 'plan.1' : null;
  if (!verIn) { hint('version.4', 'ไม่พบเลขเวอร์ชันในไฟล์'); if (verId) set(verId, 'no', 'ไม่พบ Version ในส่วนหัว'); }
  else if (!fileVer) { hint('version.4', `ในไฟล์ระบุ ${verIn} แต่ชื่อไฟล์ไม่มีเวอร์ชัน`); if (verId) hint(verId, `ในไฟล์ระบุ ${verIn} แต่ชื่อไฟล์ไม่มีเวอร์ชัน`); }
  else {
    const ok = verIn === fileVer, note = ok ? `${where(verCell)} ระบุ ${verIn}` : `${where(verCell)} ระบุ ${verIn} แต่ชื่อไฟล์ V${fileVer}`;
    set('version.4', ok ? 'yes' : 'no', note); if (verId) set(verId, ok ? 'yes' : 'no', note);
  }

  /* --- ข้อมูลโครงการในส่วนหัว (MC, GC, PP, DC) --- */
  const headId = code === 'MC' || code === 'GC' ? 'mgc.0' : code === 'PP' || code === 'DC' ? 'plan.0' : null;
  if (headId) {
    // ป้ายกำกับต้องมี ":" เพื่อไม่ให้ชื่อในตารางงาน (เช่น Team) ถูกนับเป็นส่วนหัว
    const label = re => all.some(c => new RegExp(`^\\s*(${re})\\s*:`, 'i').test(txt(c)));
    const need = [['ชื่อระบบ', () => label('ชื่อระบบ|system(\\s*name)?|project(\\s*name)?') || all.some(c => /stealth[\s-]*trade/i.test(txt(c)))],
      ['PO', () => label('product\\s*owner|po')], ['บริษัท', () => label('company|บริษัท')], ['Team Leader', () => label('team\\s*leader')],
      ['ทีม', () => label('team|ทีม')], ['เวอร์ชัน', () => !!verCell]];
    if (headId === 'plan.0') need.push(['Framework', () => label('framework')], ['ภาษา', () => label('language|ภาษา')], ['ฐานข้อมูล', () => label('database|ฐานข้อมูล')]);
    const miss = need.filter(([, f]) => !f()).map(([n]) => n);
    if (miss.length) set(headId, 'no', `ไม่พบ ${miss.join(', ')}`, miss.length); else set(headId, 'yes', `พบ ${need.map(([n]) => n).join(' ')}`);
  }

  /* --- ตารางงานของ Master Chart / Gantt Chart --- */
  if (code === 'MC' || code === 'GC') {
    const wId = code === 'MC' ? 'mgc.3' : 'mgc.4';   // ข้อแถบเวลามีเฉพาะ GC ข้อน้ำหนักของ MC จึงเลื่อนขึ้นหนึ่งข้อ
    const COLS = [['ลำดับ', /^(#|no\.?|ลำดับ|ที่)$/i], ['ประเภท', /^(ประเภท|type|category)/i], ['รายละเอียด', /^(รายละเอียด|detail|description|task)/i],
      ['ผู้เกี่ยวข้อง', /^(ผู้เกี่ยวข้อง|ผู้รับผิดชอบ|spec|owner|assignee|responsible)/i], ['วันเริ่ม', /^(วันเริ่ม|start)/i], ['กำหนดส่ง', /^(กำหนดส่ง|deadline|due)/i],
      ['Estimate Man-day', /man[\s-]?day/i], ['น้ำหนัก', /(น้ำหนัก|weight)/i], ['ความคืบหน้า', /^(ความคืบหน้า|progress)/i]];
    let head = null;
    shown.forEach(s => { const rows = {}; s.cells.forEach(c => (rows[c.row] || (rows[c.row] = [])).push(c));
      Object.keys(rows).forEach(r => { const hit = COLS.map(([n, re]) => [n, rows[r].find(c => re.test(txt(c)))]).filter(x => x[1]);
        if (hit.length >= 4 && (!head || hit.length > head.hit.length)) head = {sheet:s, row:+r, hit}; }); });
    if (!head) { if (code === 'MC') set('mgc.2', 'no', 'ไม่พบแถวหัวตารางงาน'); hint(wId, 'ไม่พบแถวหัวตารางงาน จึงรวมน้ำหนักไม่ได้'); }
    else {
      const got = new Set(head.hit.map(x => x[0])), miss = COLS.map(x => x[0]).filter(n => !got.has(n));
      if (code === 'MC') { if (miss.length) set('mgc.2', 'no', `แถว ${head.row} ไม่มีคอลัมน์ ${miss.join(', ')}`, miss.length); else set('mgc.2', 'yes', `แถว ${head.row} มีคอลัมน์ครบ`); }
      const wc = (head.hit.find(x => x[0] === 'น้ำหนัก') || [])[1];
      if (!wc) hint(wId, 'ไม่พบคอลัมน์น้ำหนัก');
      else {
        const below = head.sheet.cells.filter(c => c.row > head.row);
        const totalRow = (below.filter(c => /^(total|รวม)/i.test(txt(c))).sort((a, b) => a.row - b.row)[0] || {}).row || Infinity;
        const ws = below.filter(c => c.col === wc.col && c.row < totalRow);
        const nums = ws.filter(c => typeof c.val === 'number'), sum = nums.reduce((t, c) => t + (c.fmt.pct ? c.val * 100 : c.val), 0);
        const other = ws.filter(c => typeof c.val !== 'number').map(c => `${c.ref} ${snip(String(c.val))}`);
        const note = `รวมน้ำหนัก ${nums.length} งาน (${colName(wc.col)}${head.row + 1}:${colName(wc.col)}${totalRow === Infinity ? '' : totalRow - 1}) = ${+sum.toFixed(2)}%${other.length ? ` · ไม่ใช่ตัวเลข: ${egs(other, 'เซลล์')}` : ''}`;
        if (!nums.length) hint(wId, 'ไม่พบค่าน้ำหนักที่เป็นตัวเลข');
        else set(wId, Math.abs(sum - 100) < 0.05 ? 'yes' : 'no', note);
      }
    }
  }
  return R;
}
