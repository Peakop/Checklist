import { inCell, inTextbox } from './xml.js';
import { egs, snip } from '../text.js';

// ระดับความเสี่ยงของข้อค้นพบ (SS) ชื่อมาตรฐานกับคำที่ยอมรับ
const SEV = [['วิกฤต', /^(วิกฤต|critical)/i], ['สูง', /^(สูง|high)/i], ['กลาง', /^(ปานกลาง|กลาง|medium|moderate)/i], ['ต่ำ', /^(ต่ำ|low)/i], ['ข้อมูล', /^(ข้อมูล|info)/i]];
const sevOf = v => (SEV.find(([, re]) => re.test(String(v || '').trim())) || [])[0] || null;

/* กฎเนื้อหาของ Security Standard (หมวด ssx) เรียกจาก analyzeDocx เมื่อเอกสารเป็น SS
   ข้อที่นับจากตารางได้ตรง ๆ (ssx.4, 7, 8, 12) ติ๊กผลให้ ข้อ ssx.11 ติ๊กไม่ผ่านเมื่อพบค่าความลับ ข้ออื่นเป็นคำแนะนำ
   ctx: set/hint จาก resultSet, ย่อหน้าและตารางของเอกสาร, tName(ตาราง) คืนชื่อตาราง เช่น "ตาราง 3-2", secretHits คือตำแหน่งค่าความลับ */
export function analyzeSecurityStandard({set, hint, allBodyP, gridT, cover, isToc, tName, secretHits}){
  const txt = allBodyP.filter(m => !isToc(m) && m.text.trim());
  const heads = txt.filter(m => m.lvl != null && !cover.has(m.el) && !inCell(m.el) && !inTextbox(m.el));
  const bodyTxt = txt.map(m => m.text).join('\n'), headTxt = heads.map(m => m.text).join('\n');
  const hdrOf = t => t.rows[0].map(c => t.cellText(c).trim());
  const colOf = (t, re) => hdrOf(t).findIndex(h => re.test(h));
  const bodyRows = t => t.rows.slice(1).map((r, k) => ({r, n:k + 2})).filter(x => x.r.some(c => t.cellText(c)));
  const cellAt = (t, r, i) => i < 0 ? '' : t.cellText(r[i] || []).trim();
  const blank = v => /^[-–—]?$/.test(v);
  const found = (pairs, tail) => {
    const yes = pairs.filter(p => p[1]).map(p => p[0]), no = pairs.filter(p => !p[1]).map(p => p[0]);
    return `${yes.length ? `พบ ${yes.join(' ')}` : ''}${yes.length && no.length ? ' · ' : ''}${no.length ? `ไม่พบ ${no.join(' ')}` : ''}${tail ? ` · ${tail}` : ''}`;
  };

  // ssx.0, ssx.1: บทนำ
  hint('ssx.0', found([['วัตถุประสงค์', /วัตถุประสงค์/.test(headTxt + bodyTxt)], ['ขอบเขต', /ขอบเขต/.test(headTxt)],
    ['ส่วนที่อยู่นอกขอบเขต', /นอกขอบเขต|out of scope/i.test(bodyTxt)]], 'ตรวจว่าขอบเขตระบุ framework และไลบรารีพร้อมเวอร์ชัน'));
  const commit = /commit\s*([0-9a-f]{7,40})\b/i.exec(bodyTxt);
  hint('ssx.1', found([['วิธีประเมิน', /วิธี(การ)?ประเมิน|static review|code review|ตรวจโค้ด/i.test(headTxt + bodyTxt)],
    [`commit ที่ตรวจ${commit ? ` (${commit[1]})` : ''}`, !!commit], ['ข้อจำกัด', /ข้อจำกัด/.test(headTxt + bodyTxt)]], 'ตรวจว่าข้อจำกัดของการประเมินชัดเจน'));

  // ssx.2: ตารางสินทรัพย์
  const assetT = gridT.find(t => colOf(t, /สินทรัพย์|asset/i) >= 0 && colOf(t, /ที่เก็บ|storage/i) >= 0 && colOf(t, /ผลกระทบ|impact/i) >= 0);
  hint('ssx.2', assetT ? `พบ${tName(assetT)} (${bodyRows(assetT).length} รายการ) ตรวจว่าครบทุกสินทรัพย์ที่ต้องปกป้อง`
                       : 'ไม่พบตารางที่มีคอลัมน์ สินทรัพย์ ที่เก็บ และผลกระทบ ตรวจด้วยตา');

  // ssx.3: แผนภาพสถาปัตยกรรมและ Trust Boundary
  const caps = txt.filter(m => /^ภาพ\s*[\d.-]+/.test(m.text.trim()));
  const archCap = caps.find(m => /สถาปัตยกรรม|architecture/i.test(m.text) && /trust boundary|เส้นแบ่งความเชื่อถือ|ขอบเขตความเชื่อถือ/i.test(m.text))
               || caps.find(m => /สถาปัตยกรรม|architecture/i.test(m.text));
  const tb = /trust boundary|เส้นแบ่งความเชื่อถือ|ขอบเขตความเชื่อถือ/i.test(bodyTxt);
  hint('ssx.3', archCap ? `พบ ${snip(archCap.text)}${tb ? '' : ' แต่ไม่พบคำว่า Trust Boundary'} ตรวจว่าภาพแสดงเส้นแบ่งความเชื่อถือ`
                        : `ไม่พบชื่อภาพสถาปัตยกรรม${tb ? ' (พบคำว่า Trust Boundary ในเนื้อหา)' : ''} ตรวจด้วยตา`);

  // ssx.4: ระดับ ต้อง/ควร ในตารางที่มีคอลัมน์ "ระดับ" (ไม่นับตารางระดับความเสี่ยง) และย่อหน้าที่ขึ้นต้นด้วย ต้อง/ควร
  const reqT = []; let must = 0, should = 0; const noLvl = [];
  gridT.forEach(t => {
    const li = colOf(t, /^ระดับ/); if (li < 0) return;
    const rows = bodyRows(t), vals = rows.map(x => cellAt(t, x.r, li));
    const hit = vals.filter(v => /^(ต้อง|ควร)/.test(v)).length;
    if (!hit || hit < vals.length / 2) return;   // ระดับเป็น สูง/กลาง/ต่ำ คือตารางความเสี่ยง ไม่ใช่ข้อกำหนด
    reqT.push(t);
    vals.forEach((v, k) => { if (/^ต้อง/.test(v)) must++; else if (/^ควร/.test(v)) should++; else noLvl.push(`${tName(t)} แถว ${rows[k].n}`); });
  });
  const reqP = txt.filter(m => m.lvl == null && !inCell(m.el) && !cover.has(m.el) && /^(ต้อง|ควร)\s/.test(m.text.trim()));
  reqP.forEach(m => { if (/^ต้อง/.test(m.text.trim())) must++; else should++; });
  if (!reqT.length && !reqP.length) hint('ssx.4', 'ไม่พบตารางที่มีคอลัมน์ "ระดับ" ระบุ ต้อง/ควร หรือย่อหน้าที่ขึ้นต้นด้วย ต้อง/ควร ตรวจด้วยตา');
  else if (noLvl.length) set('ssx.4', 'no', `${noLvl.length} ข้อกำหนดไม่ระบุ ต้อง/ควร: ${egs(noLvl, 'แถว')}`, noLvl.length);
  else set('ssx.4', 'yes', `ต้อง ${must} ข้อ ควร ${should} ข้อ (${reqT.length} ตาราง${reqP.length ? ` และ ${reqP.length} ย่อหน้า` : ''})`);

  // ssx.5: สถานะผลตรวจและหลักฐานของข้อกำหนดในตาราง
  if (!reqT.length) hint('ssx.5', 'ไม่พบตารางข้อกำหนด ตรวจด้วยตาว่าทุกข้อกำหนดมีสถานะและหลักฐาน');
  else {
    const noStat = [], noEv = [], emptyStat = [];
    reqT.forEach(t => {
      const si = colOf(t, /สถานะ|ผลตรวจ|status/i), ei = colOf(t, /หลักฐาน|ตำแหน่ง|evidence/i);
      if (si < 0) noStat.push(tName(t)); else bodyRows(t).forEach(x => { if (blank(cellAt(t, x.r, si))) emptyStat.push(`${tName(t)} แถว ${x.n}`); });
      if (ei < 0) noEv.push(tName(t));
    });
    const parts = [noStat.length && `ไม่มีคอลัมน์สถานะ: ${egs(noStat, 'ตาราง')}`, emptyStat.length && `สถานะว่าง: ${egs(emptyStat, 'แถว')}`,
                   noEv.length && `ไม่มีคอลัมน์หลักฐาน: ${egs(noEv, 'ตาราง')}`].filter(Boolean);
    hint('ssx.5', `${reqT.length} ตารางข้อกำหนด${parts.length ? ' · ' + parts.join(' · ') : ' มีคอลัมน์สถานะและหลักฐานครบ'} · ตรวจว่าหลักฐานระบุไฟล์หรือบรรทัดจริง`);
  }

  // ssx.6: หมวดหลักจากหัวข้อ
  hint('ssx.6', found([['การพิสูจน์ตัวตนและการเข้าถึง', /พิสูจน์ตัวตน|ยืนยันตัวตน|การเข้าถึง|authentication|access control/i.test(headTxt)],
    ['ความปลอดภัยของข้อมูล', /ความปลอดภัยของข้อมูล|การจำแนกข้อมูล|data security/i.test(headTxt)],
    ['ความปลอดภัยของเว็บแอป', /เว็บ|web/i.test(headTxt)], ['ไลบรารี', /ไลบรารี|library|dependenc/i.test(headTxt)],
    ['การติดตั้งและส่งมอบ', /ติดตั้ง|ส่งมอบ|deploy/i.test(headTxt)]].map(([k, v]) => [`"${k}"`, v]), 'ดูจากหัวข้อ ตรวจเนื้อหาของแต่ละหมวดเอง'));

  // ssx.7: ทะเบียนข้อค้นพบ (ตารางที่คอลัมน์ "รหัส" เป็น F-xx) รวมตารางที่ต่อหน้า
  const FID = /^F-\d{2,}$/;
  const regT = gridT.filter(t => { const ci = colOf(t, /^รหัส|^id$/i); return ci >= 0 && bodyRows(t).some(x => FID.test(cellAt(t, x.r, ci))); });
  const reg = [];   // {id, sev, at}
  if (!regT.length) hint('ssx.7', 'ไม่พบตารางทะเบียนข้อค้นพบที่คอลัมน์ "รหัส" เป็น F-xx ตรวจด้วยตา');
  else {
    const bad = [], noCol = [];
    regT.forEach(t => {
      const ci = colOf(t, /^รหัส|^id$/i), cols = [['ตำแหน่ง', colOf(t, /ตำแหน่ง|location/i)], ['ระดับ', colOf(t, /ระดับ|ความเสี่ยง|severity/i)], ['แนวทางแก้ไข', colOf(t, /แนวทาง|การแก้ไข|remediation/i)]];
      cols.filter(c => c[1] < 0).forEach(c => noCol.push(`${tName(t)} ไม่มีคอลัมน์${c[0]}`));
      bodyRows(t).forEach(x => {
        const id = cellAt(t, x.r, ci), at = `${tName(t)} แถว ${x.n}`;
        if (/^(รหัส|id)$/i.test(id)) return;   // ส่วนหัวซ้ำในตารางที่ต่อหน้า
        if (!FID.test(id)) { bad.push(`${at} รหัส ${id ? snip(id) : 'ว่าง'}`); return; }
        const miss = cols.filter(c => c[1] >= 0 && blank(cellAt(t, x.r, c[1]))).map(c => c[0]);
        if (miss.length) bad.push(`${id} ไม่มี${miss.join(' ')}`);
        reg.push({id, sev:sevOf(cellAt(t, x.r, cols[1][1])), at});
      });
    });
    const seen = new Set(), dup = new Set(); reg.forEach(f => (seen.has(f.id) ? dup : seen).add(f.id));
    dup.forEach(id => bad.push(`${id} ซ้ำ`));
    const e = noCol.concat(bad);
    if (e.length) set('ssx.7', 'no', egs(e, 'รายการ'), e.length);
    else set('ssx.7', 'yes', `${reg.length} รายการ (${reg[0].id}–${reg[reg.length - 1].id}) มีตำแหน่ง ระดับ และแนวทางแก้ไขครบ`);
  }
  const regIds = new Set(reg.map(f => f.id));

  // ssx.8: จำนวนในประโยคสรุปเทียบกับทะเบียน
  const sumP = txt.find(m => !inCell(m.el) && /ข้อค้นพบ\D{0,20}\d+\s*รายการ/.test(m.text));
  if (!reg.length) hint('ssx.8', 'ไม่พบทะเบียนข้อค้นพบ จึงเทียบจำนวนในสรุปไม่ได้');
  else if (!sumP) hint('ssx.8', `ไม่พบประโยคสรุป เช่น "พบข้อค้นพบ N รายการ แบ่งเป็นระดับสูง … กลาง …" (ทะเบียนมี ${reg.length} รายการ)`);
  else {
    const sm = /ข้อค้นพบ\D{0,20}(\d+)\s*รายการ/.exec(sumP.text), after = sumP.text.slice(sm.index + sm[0].length);
    const said = {}; let lm; const lre = /(วิกฤต|สูง|ปานกลาง|กลาง|ต่ำ|ข้อมูล)\s*(\d+)/g;
    while ((lm = lre.exec(after))) { const k = sevOf(lm[1]); if (said[k] == null) said[k] = +lm[2]; }
    const have = {}; reg.forEach(f => { const k = f.sev || 'ไม่ระบุ'; have[k] = (have[k] || 0) + 1; });
    const diff = [];
    if (+sm[1] !== reg.length) diff.push(`สรุป ${sm[1]} รายการ แต่ทะเบียนมี ${reg.length} รายการ`);
    [...new Set([...SEV.map(x => x[0]), 'ไม่ระบุ'])].forEach(k => { const a = said[k] || 0, b = have[k] || 0; if (a !== b) diff.push(`${k}: สรุป ${a} ทะเบียน ${b}`); });
    const sumLv = Object.values(said).reduce((a, b) => a + b, 0);
    if (Object.keys(said).length && sumLv !== +sm[1]) diff.push(`ผลรวมรายระดับในสรุป ${sumLv} ไม่เท่ากับ ${sm[1]}`);
    const crit = /เกณฑ์|กำหนดจาก|โอกาส\S*.{0,40}ผลกระทบ|likelihood|impact/i.test(sumP.text) || /เกณฑ์(การ)?(ให้|กำหนด)ระดับ|เมทริกซ์ความเสี่ยง|risk matrix/i.test(bodyTxt);
    const lvTxt = SEV.map(x => x[0]).filter(k => have[k]).map(k => `${k} ${have[k]}`).join(' ');
    if (diff.length) set('ssx.8', 'no', `จำนวนในสรุปไม่ตรงกับทะเบียน: ${diff.join(' · ')}`, diff.length);
    else if (!crit) hint('ssx.8', `จำนวนตรงกับทะเบียน (${reg.length} รายการ: ${lvTxt}) แต่ไม่พบคำอธิบายเกณฑ์ให้ระดับความเสี่ยง ตรวจด้วยตา`);
    else set('ssx.8', 'yes', `สรุป ${reg.length} รายการ ตรงกับทะเบียน (${lvTxt})`);
  }

  // ssx.9: ลำดับความสำคัญและรายการตรวจก่อนขึ้นระบบจริง
  hint('ssx.9', found([['ลำดับความสำคัญการแก้ไข', /ลำดับความสำคัญ|priority/i.test(headTxt) || /(^|\n)P1\b/.test(bodyTxt)],
    ['รายการตรวจก่อนขึ้นระบบจริง', /ก่อนขึ้น(ระบบ|ใช้งาน)จริง|go-?live|pre-?production/i.test(headTxt + bodyTxt)]], 'ตรวจว่าทุกข้อค้นพบระดับสูงอยู่ในลำดับแรก'));

  // ssx.10: กรณีทดสอบที่อ้างรหัสข้อค้นพบ
  const tcT = gridT.filter(t => { const ci = colOf(t, /^รหัส|^id$/i); return ci >= 0 && bodyRows(t).some(x => /^TC-?\d+/i.test(cellAt(t, x.r, ci))); });
  if (!tcT.length) hint('ssx.10', 'ไม่พบตารางกรณีทดสอบที่คอลัมน์ "รหัส" เป็น TC-xx ตรวจด้วยตา');
  else {
    let n = 0, linked = 0; const refs = new Set();
    tcT.forEach(t => { const ci = colOf(t, /^รหัส|^id$/i); bodyRows(t).forEach(x => {
      if (!/^TC-?\d+/i.test(cellAt(t, x.r, ci))) return; n++;
      const ids = x.r.map(c => t.cellText(c)).join(' ').match(/F-\d{2,}/g) || []; if (ids.length) linked++; ids.forEach(i => refs.add(i));
    }); });
    const unknown = [...refs].filter(i => regIds.size && !regIds.has(i)), uncovered = [...regIds].filter(i => !refs.has(i));
    hint('ssx.10', `${n} กรณีทดสอบ อ้างรหัสข้อค้นพบ ${linked} กรณี` + (unknown.length ? ` · อ้างรหัสที่ไม่มีในทะเบียน: ${egs(unknown, 'รหัส')}` : '') +
      (uncovered.length ? ` · ข้อค้นพบที่ยังไม่มีกรณีทดสอบ: ${egs(uncovered, 'รหัส')}` : '') + ' · ตรวจว่ากรณีทดสอบพิสูจน์การแก้ไขได้จริง');
  }

  // ssx.11: ค่าความลับ แสดงเฉพาะตำแหน่ง
  if (secretHits.length) set('ssx.11', 'no', `พบรูปแบบค่าความลับ ${secretHits.length} จุด (ไม่แสดงค่า): ${egs(secretHits)} · ลบค่าจริงหรือแทนด้วยค่าตัวอย่าง`, secretHits.length);
  else hint('ssx.11', 'ไม่พบรูปแบบค่าความลับที่รู้จัก (APP_KEY base64, GOCSPX-, AIza, Private key, password=) ตรวจด้วยตาอีกครั้ง โดยเฉพาะในภาพหน้าจอ');

  // ssx.12: หัวข้อในภาคผนวกที่อ้าง "แก้ F-xx"
  const apx = heads.findIndex(m => /^ภาคผนวก|appendix/i.test(m.text.trim()));
  const apxH = apx < 0 ? [] : heads.slice(apx + 1);
  const fixH = (apxH.length ? apxH : heads).filter(m => /แก้\s*F-\d{2,}/.test(m.text));
  if (!fixH.length) {
    if (apxH.length) set('ssx.12', 'no', `${apxH.length} หัวข้อในภาคผนวกไม่ระบุว่าแก้ข้อค้นพบใด (เช่น "(แก้ F-01)")`, 1);
    else hint('ssx.12', apx < 0 ? 'ไม่พบหัวข้อภาคผนวก ตรวจด้วยตา' : 'ภาคผนวกไม่มีหัวข้อย่อย ตรวจด้วยตา');
  } else {
    const ids = new Set(); fixH.forEach(m => (m.text.slice(m.text.search(/แก้\s*F-/)).match(/F-\d{2,}/g) || []).forEach(i => ids.add(i)));
    const missing = [...ids].filter(i => !regIds.has(i));
    if (!regIds.size) hint('ssx.12', `${fixH.length} หัวข้ออ้าง ${egs([...ids], 'รหัส')} แต่ไม่พบทะเบียนข้อค้นพบให้เทียบ`);
    else if (missing.length) set('ssx.12', 'no', `อ้างรหัสที่ไม่มีในทะเบียน: ${egs(missing, 'รหัส')}`, missing.length);
    else set('ssx.12', 'yes', `${fixH.length} หัวข้อ อ้าง ${ids.size} รหัสที่มีในทะเบียน`);
  }
}
