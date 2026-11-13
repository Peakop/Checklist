import { initSidebar } from './ui/sidebar.js';
import { initChecklist } from './ui/checklist.js';
import { initPreview } from './ui/preview.js';
import { initAutoCheck } from './autocheck/index.js';
import { getDownloads } from './pdf/build-pdf.js';
import { renderDoc } from './ui/checklist.js';
import { initForm } from './ui/form.js';

/* ---------- boot ---------- */
initSidebar();
initChecklist();
initPreview();
initAutoCheck();
initForm();
renderDoc();
getDownloads();
