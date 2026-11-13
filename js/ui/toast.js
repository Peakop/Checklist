import { $ } from '../utils/dom.js';

/* ---------- toast ---------- */
let toastT;
export function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
