import { DOCS } from '../config/documents.js';
import { buildPages, pdfBaseName, savePdf } from '../pdf/build-pdf.js';
import { state } from '../state.js';
import { $ } from '../utils/dom.js';

let lastPages = null;
async function openPreview(){
  const m = $('#modal'); m.hidden = false; document.body.style.overflow = 'hidden';
  $('#pages').innerHTML = '<div class="loading">กำลังจัดหน้าเอกสาร…</div>'; $('#mSub').textContent = 'กำลังสร้าง…';
  $('#f-pdfName').value = pdfBaseName();
  lastPages = await buildPages();
  const box = $('#pages'); box.innerHTML = '';
  lastPages.forEach((c, i) => { c.setAttribute('aria-label', `หน้า ${i + 1}`); box.append(c); });
  $('#mSub').textContent = `${DOCS[state.doc].code} · ${lastPages.length} หน้า · A4`;
  $('#mClose').focus();
}
function closePreview(){ $('#modal').hidden = true; document.body.style.overflow = ''; $('#previewBtn').focus(); }
async function withBusy(btn, fn){ btn.disabled = true; const t = btn.innerHTML; btn.textContent = 'กำลังสร้าง PDF…'; try { await fn(); } finally { btn.disabled = false; btn.innerHTML = t; } }

export function initPreview(){
  $('#previewBtn').addEventListener('click', openPreview);
  $('#mClose').addEventListener('click', closePreview);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closePreview(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closePreview(); });
  $('#mDownload').addEventListener('click', e => withBusy(e.currentTarget, async () => { await savePdf(lastPages || await buildPages(), $('#f-pdfName').value.trim()); }));
  $('#downloadBtn').addEventListener('click', e => withBusy(e.currentTarget, async () => { await savePdf(await buildPages(), pdfBaseName()); }));
}
