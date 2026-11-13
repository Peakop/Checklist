export const TH_CH = /[\u0E00-\u0E7F]/;
export const cm = tw => (tw / 1440 * 2.54).toFixed(2);
export const snip = s => { s = s.replace(/\s+/g, ' ').trim(); return `"${s.length > 30 ? s.slice(0, 30) + '…' : s}"`; };
export const egs = (a, unit = 'จุด') => a.slice(0, 3).join(', ') + (a.length > 3 ? ` และอีก ${a.length - 3} ${unit}` : '');
export const pt = hp => hp == null ? '?' : `${hp / 2} pt`;
export const verCmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
