// Small shared helpers: palette, DOM, dates, times, feedback.

export const COLORS = {
  pink:     { name: 'Blush',    bg: '#FFE6EF', mid: '#FFC9DC', strong: '#F290B5', ink: '#9C4668' },
  lavender: { name: 'Lavender', bg: '#EFE8FF', mid: '#D9CBFF', strong: '#AE96E8', ink: '#62509A' },
  mint:     { name: 'Mint',     bg: '#E0F6EC', mid: '#BDEBD5', strong: '#7CCFAA', ink: '#3B7A5E' },
  peach:    { name: 'Peach',    bg: '#FFEBDF', mid: '#FFD0B5', strong: '#F4A47C', ink: '#995436' },
  butter:   { name: 'Butter',   bg: '#FFF6D3', mid: '#FFE89E', strong: '#EDC456', ink: '#86691A' },
  sky:      { name: 'Sky',      bg: '#E2F1FF', mid: '#C3E1FF', strong: '#86BDEB', ink: '#3A6890' },
  sage:     { name: 'Sage',     bg: '#EBF2E2', mid: '#D2E3BF', strong: '#9EC07F', ink: '#55703C' },
  coral:    { name: 'Coral',    bg: '#FFE5E3', mid: '#FFC5C0', strong: '#F2918A', ink: '#9A4741' },
};
export const COLOR_KEYS = Object.keys(COLORS);

// ── Theme ─────────────────────────────────────────────────────────────────
// 'light' (pastel paper) or 'dark' (galaxy). Pastel fills stay pastel in both;
// only surfaces and text flip, so colorVars() hands out theme-aware tints.
let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
export const isDark = () => theme === 'dark';
export function setTheme(t) {
  theme = t === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
}
export const DARK_SURFACE = '#1C2547';
const DARK_CARD = '#161F42';

// Blend two #rrggbb colours (t = 0 → a, 1 → b).
export function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

// Per-colour custom properties:
//   --c-bg   soft tint for backgrounds      --c-mid  pastel fill
//   --c      strong accent                  --c-ink  text on page surfaces
//   --c-on   text sitting on a pastel fill (always dark)
//   --c-card a see-through window with a hint of the colour
// `dark` picks the galaxy or pastel tints regardless of the page (the widget preview uses it).
export function colorVars(key, dark = theme === 'dark') {
  const c = COLORS[key] || COLORS.pink;
  if (dark) return `--c-bg:${mix(c.strong, DARK_SURFACE, 0.78)};--c-mid:${c.mid};--c:${c.strong};--c-ink:${c.mid};--c-on:${c.ink};--c-card:${rgba(mix(DARK_CARD, c.strong, 0.12), 0.74)};`;
  return `--c-bg:${c.bg};--c-mid:${c.mid};--c:${c.strong};--c-ink:${c.ink};--c-on:${c.ink};--c-card:${rgba(mix(c.bg, c.mid, 0.28), 0.6)};`;
}

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function uid() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36).slice(0, 4);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

export function debounce(fn, ms) {
  let t = null, args = null;
  const d = (...a) => { args = a; clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  return d;
}

// ── Dates: days are local "YYYY-MM-DD" keys ───────────────────────────────
const pad = n => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function keyToDate(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function shiftDay(k, n) {
  const d = keyToDate(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function fmtDay(k, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return keyToDate(k).toLocaleDateString(undefined, opts);
}

// ── Local (per-device) preferences ────────────────────────────────────────
const PREFS_KEY = 'doing:prefs';
export const prefs = (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
})();
export function setPref(k, v) {
  prefs[k] = v;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}

// ── Times: minutes since midnight ─────────────────────────────────────────
export function uses12h() {
  if (typeof prefs.hour12 === 'boolean') return prefs.hour12;
  try { return !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12; }
  catch (e) { return true; }
}
export function fmtTime(min) {
  const h12 = uses12h();
  if (min >= 1440 && !h12) return '24:00';
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (h12) return ((h % 12) || 12) + (m ? ':' + pad(m) : '') + (h < 12 ? 'am' : 'pm');
  return pad(h) + ':' + pad(m);
}
export const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// ── Feedback ──────────────────────────────────────────────────────────────
let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function vibrate(ms = 10) {
  try {
    if (window.TendNative) window.TendNative.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}

export function burstHearts(x, y, chars = ['💗', '💖', '💕', '✨']) {
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('span');
    s.className = 'burst';
    s.textContent = chars[i % chars.length];
    const a = Math.PI + Math.random() * Math.PI;
    const d = 50 + Math.random() * 60;
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(a) * d + 'px');
    s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    s.style.setProperty('--r', (Math.random() * 60 - 30) + 'deg');
    document.body.append(s);
    setTimeout(() => s.remove(), 950);
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) {}
    ta.remove();
    return ok;
  }
}
