// Little die-cut stickers that sit next to page headings, in the same style
// as the profile stickers: a sun, flower or moon for the greeting (by time of
// day) and a pair of hearts for Us.

import { stickerFace as face, stickerLine as ln, stickerTwinkle as twinkle, stickerUri } from './avatars.js';
import { isDark } from './util.js';

const heart = (cx, cy, s, fill) => `<path d="M${cx} ${cy + 15 * s} C${cx - 22 * s} ${cy + 1 * s} ${cx - 20 * s} ${cy - 17 * s} ${cx - 9 * s} ${cy - 18 * s} C${cx - 4 * s} ${cy - 18.5 * s} ${cx - 1 * s} ${cy - 15 * s} ${cx} ${cy - 11 * s} C${cx + 1 * s} ${cy - 15 * s} ${cx + 4 * s} ${cy - 18.5 * s} ${cx + 9 * s} ${cy - 18 * s} C${cx + 20 * s} ${cy - 17 * s} ${cx + 22 * s} ${cy + 1 * s} ${cx} ${cy + 15 * s} Z" fill="${fill}" ${ln()}/>`;

const ART = {
  sun: [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<g transform="rotate(${a} 50 52)"><path d="M50 12 Q55 22 50 26 Q45 22 50 12 Z" fill="#FFC24B" ${ln(1.8)}/></g>`).join('')
    + `<circle cx="50" cy="52" r="22" fill="#FFD86B" ${ln()}/>` + face(50, 53, 1.15, { gap: 8 }),
  flower: [0, 72, 144, 216, 288].map(a => `<g transform="rotate(${a} 50 50)"><ellipse cx="50" cy="28" rx="13" ry="15" fill="#F9A1C0" ${ln()}/></g>`).join('')
    + `<circle cx="50" cy="50" r="15" fill="#FFE38A" ${ln()}/>` + face(50, 50, 0.9, { gap: 6.5 })
    + `<path d="M50 72 Q48 84 52 94" fill="none" stroke="#7BAA6A" stroke-width="3" stroke-linecap="round"/>`,
  // A plump, upright crescent with a sleepy face (not banana-shaped).
  moon: `<path d="M61.96 22.32 A32 32 0 1 0 74.52 72.56 A26 26 0 1 1 61.96 22.32 Z" fill="#FFE38A" ${ln()}/>`
    + face(29, 53, 0.95, { eyes: 'sleepy', gap: 5.5 }) + twinkle(76, 30, 5.5) + twinkle(84, 50, 3.2, '#FFF6C8') + twinkle(70, 84, 2.8),
  hearts: heart(62, 46, 1.05, '#C9B5F5') + heart(40, 56, 1.25, '#F7A6C6')
    + face(40, 54, 0.95, { gap: 7 }) + twinkle(80, 22, 5) + twinkle(18, 26, 3.4, '#FFF6C8'),
};

// In the galaxy theme the die-cut edge is a deep navy instead of white, so it sits in the night sky.
const GROW = { moon: 1.18, hearts: 1.1 };   // fill the square a little more
const art = key => (GROW[key] ? `<g transform="translate(50 52) scale(${GROW[key]}) translate(-50 -52)">${ART[key]}</g>` : ART[key]);
const img = (key, label) => `<img class="head-stk" src="${stickerUri('head:' + key, art(key), isDark() ? '#2B3870' : '#fff')}" alt="${label}" draggable="false">`;

/** The greeting's sticker: a sun in the morning, a flower in the afternoon, the moon at night. */
export function greetingSticker(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return img('sun', '');
  if (hour >= 12 && hour < 17) return img('flower', '');
  return img('moon', '');
}

export const usSticker = () => img('hearts', '');

// Toolbar icon for schedule settings: a soft lavender cog, in the style of
// STICKER_ICON (sticker-ui.js) beside it.
function cog(cx, cy, rOut, rIn, teeth) {
  const at = (a, r) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2 - Math.PI / 2, w = Math.PI / teeth;
    pts.push(at(a - w * 0.62, rIn), at(a - w * 0.34, rOut), at(a + w * 0.34, rOut), at(a + w * 0.62, rIn));
  }
  return 'M' + pts.join(' L') + ' Z';
}
export const SETTINGS_ICON = `<svg class="ico-sticker" viewBox="0 0 24 24" aria-hidden="true">
  <path d="${cog(12, 12, 10, 7.4, 8)}" fill="#D9CBFF" stroke="#62509A" stroke-width="1.6" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="3.3" fill="#FFC9DC" stroke="#62509A" stroke-width="1.5"/>
</svg>`;
