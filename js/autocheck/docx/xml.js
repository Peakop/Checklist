/* ---------- auto check: read a .docx and pre-fill the rule-based items ---------- */
// Only items that can be decided from the file's XML are set; content items stay for the reviewer.
// s:'yes'|'no'|'na' sets the status, s:null leaves it open as a hint. applyAuto only writes the note of a 'no' result
// into the detail box; hints are listed in the result box above the checklist.
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
export const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
export const toArr = nl => { const a = []; for (let i = 0; i < nl.length; i++) a.push(nl.item(i)); return a; };
export const wKids = (el, n) => { const a = []; if (el) for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && c.namespaceURI === NS_W && (!n || c.localName === n)) a.push(c); return a; };
export const wKid = (el, n) => wKids(el, n)[0] || null;
export const wAll = (el, n, ns = NS_W) => el ? toArr(el.getElementsByTagNameNS(ns, n)) : [];
export const att = (el, a = 'val') => el && el.hasAttributeNS(NS_W, a) ? el.getAttributeNS(NS_W, a) : null;
export const onOff = el => el ? !/^(0|false|off)$/i.test(att(el) || '') : undefined;
export function upTo(el, test){ for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (test(p)) return p; return null; }
export const inFallback = el => !!upTo(el, p => p.localName === 'Fallback');
export const ownerP = el => upTo(el, p => p.namespaceURI === NS_W && p.localName === 'p');
export const inCell = el => !!upTo(el, p => p.namespaceURI === NS_W && p.localName === 'tc');
export const inTextbox = el => !!upTo(el, p => p.localName === 'txbxContent');
