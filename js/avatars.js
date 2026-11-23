// Profile pictures: little witchy stickers — a cat in a witch hat, potions,
// mushrooms, a sleepy moon… Flat kawaii drawings with a white die-cut edge and
// a soft shadow, like the stickers you put on maps and plans. Drawn on a
// transparent 100×100 canvas so they sit inside each person's colour circle.
// `emoji` stands in wherever only text fits.

import { esc } from './util.js';

const OUT = '#4A3355';   // plum line art
const ln = (w = 2, c = OUT) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const mirror = inner => `<g transform="translate(100 0) scale(-1 1)">${inner}</g>`;
const BLUSH = '#FF8FB3';

// The sticker edge: grow the drawing's silhouette into a rounded white border,
// with a soft shadow underneath (same look as .stk-body in app.css).
const sticker = (edge = '#fff') => `<filter id="die" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">`
  + `<feGaussianBlur in="SourceAlpha" stdDeviation="2.3" result="b"/>`
  + `<feComponentTransfer in="b" result="edge"><feFuncA type="linear" slope="18" intercept="-0.9"/></feComponentTransfer>`
  + `<feFlood flood-color="${edge}"/><feComposite in2="edge" operator="in" result="white"/>`
  + `<feGaussianBlur in="edge" stdDeviation="1.6" result="sb"/><feOffset in="sb" dy="1.8" result="so"/>`
  + `<feFlood flood-color="#4A3355" flood-opacity=".28"/><feComposite in2="so" operator="in" result="shadow"/>`
  + `<feMerge><feMergeNode in="shadow"/><feMergeNode in="white"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// Kawaii faces: dot eyes with a sparkle, rosy cheeks, a tiny mouth.
function face(cx, cy, s = 1, { gap = 8, mouth = 'smile', eyes = 'dot', eye = OUT, cheeks = true } = {}) {
  const ex = [cx - gap * s, cx + gap * s];
  let e = '';
  if (eyes === 'happy') e = ex.map(x => `<path d="M${x - 2.8 * s} ${cy + 1 * s} q${2.8 * s} ${-3.6 * s} ${5.6 * s} 0" fill="none" ${ln(1.7 * s, eye)}/>`).join('');
  else if (eyes === 'sleepy') e = ex.map(x => `<path d="M${x - 2.8 * s} ${cy - 0.6 * s} q${2.8 * s} ${3.2 * s} ${5.6 * s} 0" fill="none" ${ln(1.7 * s, eye)}/>`).join('');
  else e = ex.map(x => `<ellipse cx="${x}" cy="${cy}" rx="${2.5 * s}" ry="${2.9 * s}" fill="${eye}"/><circle cx="${x + 0.9 * s}" cy="${cy - 1.1 * s}" r="${0.95 * s}" fill="#fff"/>`).join('');
  const m = {
    smile: `<path d="M${cx - 2.3 * s} ${cy + 3.4 * s} q${2.3 * s} ${2.3 * s} ${4.6 * s} 0" fill="none" ${ln(1.6 * s, eye)}/>`,
    cat: `<path d="M${cx - 3.4 * s} ${cy + 3.2 * s} q${1.7 * s} ${2.2 * s} ${3.4 * s} 0 q${1.7 * s} ${2.2 * s} ${3.4 * s} 0" fill="none" ${ln(1.5 * s, eye)}/>`,
    open: `<path d="M${cx - 2.6 * s} ${cy + 3 * s} q${2.6 * s} ${0.6 * s} ${5.2 * s} 0 q${-0.4 * s} ${3.8 * s} ${-2.6 * s} ${3.8 * s} q${-2.2 * s} 0 ${-2.6 * s} ${-3.8 * s} Z" fill="#C2456A" ${ln(1.2 * s, eye)}/>`,
    fang: `<path d="M${cx - 3 * s} ${cy + 3.2 * s} q${3 * s} ${2.4 * s} ${6 * s} 0" fill="none" ${ln(1.5 * s, eye)}/><path d="M${cx - 1.9 * s} ${cy + 4.1 * s} l${0.7 * s} ${1.8 * s} l${0.7 * s} ${-1.5 * s} Z M${cx + 0.5 * s} ${cy + 4.4 * s} l${0.7 * s} ${1.5 * s} l${0.7 * s} ${-1.8 * s} Z" fill="#fff" stroke="${eye}" stroke-width="${0.6 * s}"/>`,
  }[mouth];
  const c = cheeks ? ex.map(x => `<ellipse cx="${x + (x < cx ? -3.2 : 3.2) * s}" cy="${cy + 3.4 * s}" rx="${2.8 * s}" ry="${1.7 * s}" fill="${BLUSH}" opacity=".6"/>`).join('') : '';
  return e + c + m;
}
const star = (cx, cy, r, fill, w = 1.3) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.48 : r;
    p.push((cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1));
  }
  return `<path d="M${p.join(' L')} Z" fill="${fill}" ${ln(w)}/>`;
};
const twinkle = (cx, cy, r, fill = '#FFE38A') => `<path d="M${cx} ${cy - r} Q${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy} Q${cx + r * 0.18} ${cy + r * 0.18} ${cx} ${cy + r} Q${cx - r * 0.18} ${cy + r * 0.18} ${cx - r} ${cy} Q${cx - r * 0.18} ${cy - r * 0.18} ${cx} ${cy - r} Z" fill="${fill}"/>`;
const shine = d => `<path d="${d}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>`;

const AV = {
  cat: { emoji: '🐈‍⬛', label: 'Witch cat', svg:
    `<path d="M26 52 L24 30 L40 41 Z" fill="#3E3552" ${ln()}/><path d="M28.5 47 L27.5 35 L36 41.5 Z" fill="#F7A8C8"/>`
    + mirror(`<path d="M26 52 L24 30 L40 41 Z" fill="#3E3552" ${ln()}/><path d="M28.5 47 L27.5 35 L36 41.5 Z" fill="#F7A8C8"/>`)
    + `<ellipse cx="50" cy="62" rx="27" ry="22" fill="#3E3552" ${ln()}/>`
    + `<path d="M37 41 Q45 28 50 15 Q53 9 61 11 Q56 14 56 20 Q58 31 63 41 Z" fill="#8B6FD6" ${ln()}/>`
    + `<ellipse cx="50" cy="41.5" rx="19" ry="4.6" fill="#8B6FD6" ${ln()}/><path d="M38.5 37 Q50 40 61.5 37 L62.5 40.5 Q50 43.5 37.5 40.5 Z" fill="#F9A1C0"/>`
    + star(53, 27, 3.6, '#FFE38A', 1)
    + [40, 60].map(x => `<ellipse cx="${x}" cy="62" rx="5" ry="5.6" fill="#FFE27A" ${ln(1.4)}/><ellipse cx="${x}" cy="62.5" rx="2" ry="4" fill="#2A2238"/><circle cx="${x + 1.6}" cy="60" r="1.3" fill="#fff"/>`).join('')
    + `<path d="M48.3 68 L51.7 68 L50 70 Z" fill="#F7A8C8"/><path d="M46.6 71 q1.7 2 3.4 0 q1.7 2 3.4 0" fill="none" stroke="#CFC4E8" stroke-width="1.4" stroke-linecap="round"/>`
    + `<path d="M23 66 L32 67.5 M23.5 71 L32 70 M77 66 L68 67.5 M76.5 71 L68 70" stroke="#CFC4E8" stroke-width="1.3" stroke-linecap="round"/>`
    + `<ellipse cx="32.5" cy="71.5" rx="3.2" ry="1.9" fill="${BLUSH}" opacity=".7"/><ellipse cx="67.5" cy="71.5" rx="3.2" ry="1.9" fill="${BLUSH}" opacity=".7"/>` },

  crystal: { emoji: '🔮', label: 'Crystal ball', svg:
    `<defs><radialGradient id="cb" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#F4EEFF"/><stop offset=".6" stop-color="#CDB8FA"/><stop offset="1" stop-color="#A68AE6"/></radialGradient></defs>`
    + `<path d="M33 79 Q50 74 67 79 L63 87 Q50 90 37 87 Z" fill="#F2C76B" ${ln()}/>`
    + `<circle cx="50" cy="50" r="27" fill="url(#cb)" ${ln()}/>`
    + `<path d="M34 57 Q42 47 52 52 Q62 57 66 46" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>`
    + twinkle(62, 37, 4, '#FFF6C8') + twinkle(39, 66, 2.6, '#FFF6C8') + shine('M33 40 Q36 32 44 28')
    + face(50, 54, 1, { eyes: 'happy', gap: 7 })
    + `<ellipse cx="50" cy="78.5" rx="16.5" ry="3.6" fill="#F7D98C" ${ln(1.6)}/>` },

  potion: { emoji: '🧪', label: 'Love potion', svg:
    `<path d="M44 24 H56 V36 C68 39 75 49 75 60 C75 74 63 85 50 85 C37 85 25 74 25 60 C25 49 32 39 44 36 Z" fill="#EEF5FF" ${ln()}/>`
    + `<path d="M26.6 58 C34 53 42 61 50 57 C58 53 66 61 73.4 58 C74 72 63 83.4 50 83.4 C37 83.4 26 72 26.6 58 Z" fill="#F7A0C6"/>`
    + `<circle cx="36" cy="71" r="2" fill="#fff" opacity=".7"/><circle cx="64" cy="66" r="2.6" fill="#fff" opacity=".7"/>`
    + `<path d="M60 75 c-1.4 -1.8 -4 -1 -3.6 1.2 c.4 1.8 3.6 3.6 3.6 3.6 c0 0 3.2 -1.8 3.6 -3.6 c.4 -2.2 -2.2 -3 -3.6 -1.2 Z" fill="#fff" opacity=".85"/>`
    + `<path d="M44 24 H56 V36 C68 39 75 49 75 60 C75 74 63 85 50 85 C37 85 25 74 25 60 C25 49 32 39 44 36 Z" fill="none" ${ln()}/>`
    + `<rect x="41" y="14" width="18" height="10" rx="3.5" fill="#C99A6B" ${ln()}/><rect x="42.5" y="32" width="15" height="5" rx="2.5" fill="#B79CF0" ${ln(1.5)}/>`
    + shine('M31 52 Q33 45 39 42') + face(50, 66, 1.05, { mouth: 'open' }) },

  cauldron: { emoji: '🫧', label: 'Cauldron', svg:
    `<circle cx="34" cy="31" r="4.6" fill="#B6F2C6" ${ln(1.6)}/><circle cx="60" cy="24" r="3.6" fill="#B6F2C6" ${ln(1.6)}/><circle cx="47" cy="17" r="2.6" fill="#B6F2C6" ${ln(1.4)}/>`
    + `<path d="M21 48 C22 38 31 39 35 42 C39 33 50 34 52 40 C58 32 69 37 70 42 C77 39 81 44 79 48 Z" fill="#8EE6A6" ${ln()}/>`
    + `<ellipse cx="34" cy="85" rx="6" ry="3.5" fill="#3A3150" ${ln(1.6)}/><ellipse cx="66" cy="85" rx="6" ry="3.5" fill="#3A3150" ${ln(1.6)}/>`
    + `<path d="M22 52 H78 C78 70 68 84 50 84 C32 84 22 70 22 52 Z" fill="#4E4466" ${ln()}/>`
    + `<rect x="17" y="45" width="66" height="10" rx="5" fill="#625780" ${ln()}/>`
    + shine('M29 61 Q30 70 36 76') + face(50, 66, 1.05, { eye: '#FFF4FA', mouth: 'cat' }) },

  mushroom: { emoji: '🍄', label: 'Toadstool', svg:
    `<path d="M36 60 C34 72 34 80 38 85 H62 C66 80 66 72 64 60 Z" fill="#FFF3E3" ${ln()}/>`
    + `<path d="M14 58 C14 34 32 19 50 19 C68 19 86 34 86 58 C86 63.5 78 65 50 65 C22 65 14 63.5 14 58 Z" fill="#F2706F" ${ln()}/>`
    + `<ellipse cx="34" cy="38" rx="6" ry="4.6" fill="#fff"/><ellipse cx="55" cy="29" rx="5" ry="3.8" fill="#fff"/><ellipse cx="69" cy="45" rx="5.4" ry="4.2" fill="#fff"/><ellipse cx="48" cy="50" rx="4" ry="3" fill="#fff"/><ellipse cx="22" cy="54" rx="3" ry="2.4" fill="#fff"/>`
    + face(50, 72, 0.95) },

  shrooms: { emoji: '🍄', label: 'Moon mushrooms', svg:
    `<path d="M25 66 C24 74 24 80 27 84 H39 C42 80 42 74 41 66 Z" fill="#FFF3E3" ${ln(1.8)}/>`
    + `<path d="M14 66 C14 54 22 47 33 47 C44 47 52 54 52 66 C52 69 44 70 33 70 C22 70 14 69 14 66 Z" fill="#8ECDF2" ${ln(1.8)}/>`
    + `<path d="M50 56 C48 68 48 78 52 85 H72 C76 78 76 68 74 56 Z" fill="#FFF3E3" ${ln()}/>`
    + `<path d="M32 54 C32 32 46 18 62 18 C78 18 92 32 92 54 C92 59 84 61 62 61 C40 61 32 59 32 54 Z" fill="#B79CF0" ${ln()}/>`
    + star(52, 33, 3.4, '#FFF1B3', 1) + star(72, 28, 2.6, '#FFF1B3', 1) + star(80, 45, 2.2, '#FFF1B3', 1) + `<circle cx="62" cy="47" r="2" fill="#FFF1B3"/>`
    + twinkle(20, 34, 3.2) + face(62, 69, 0.9) },

  // A plump, upright crescent (not a banana) dozing off.
  moon: { emoji: '🌙', label: 'Sleepy moon', svg:
    `<g transform="translate(46 52) scale(1.12) translate(-50 -52)">`
    + `<path d="M61.96 22.32 A32 32 0 1 0 74.52 72.56 A26 26 0 1 1 61.96 22.32 Z" fill="#FFE38A" ${ln()}/>`
    + face(29, 53, 0.95, { eyes: 'sleepy', gap: 5.5 }) + `</g>`
    + twinkle(78, 28, 5) + twinkle(86, 50, 3, '#FFF6C8') + twinkle(70, 84, 2.6)
    + `<path d="M74 62 h6 l-6 7 h6" fill="none" stroke="#AE96E8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` },

  hat: { emoji: '🧙', label: 'Witch hat', svg:
    `<ellipse cx="50" cy="73" rx="35" ry="9.5" fill="#7E64CF" ${ln()}/>`
    + `<path d="M28 71 C34 55 40 37 46 24 C50 15 58 11 67 13 C61 17 58 23 60 31 C63 45 68 59 72 71 Z" fill="#8B6FD6" ${ln()}/>`
    + `<path d="M30.5 64 C44 68 57 68 69.5 64 L71.5 71 C58 75 42 75 28.5 71 Z" fill="#F9A1C0" ${ln(1.7)}/>`
    + `<rect x="45" y="64" width="10" height="9" rx="1.8" fill="none" stroke="#FFD86B" stroke-width="2.4"/>`
    + star(56, 28, 3.6, '#FFE38A', 1) + twinkle(18, 52, 3.4) + twinkle(82, 36, 3)
    + face(50, 50, 0.95, { gap: 7.5 }) },

  book: { emoji: '📖', label: 'Spell book', svg:
    `<rect x="68" y="24" width="10" height="56" rx="2" fill="#FFF7EA" ${ln(1.8)}/>`
    + `<path d="M71 30 V74 M74.5 30 V74" stroke="#E8D9C2" stroke-width="1.2"/>`
    + `<rect x="21" y="19" width="51" height="63" rx="6" fill="#5FB3A6" ${ln()}/>`
    + `<rect x="21" y="19" width="9" height="63" rx="4" fill="#4A9A8E" ${ln(1.6)}/>`
    + `<path d="M64 19 L72 19 L72 27 Z M64 82 L72 82 L72 74 Z" fill="#F2C76B" ${ln(1.3)}/>`
    + `<path d="M55 30 A9 9 0 1 0 60 45 A7 7 0 1 1 55 30 Z" fill="#FFE38A" ${ln(1.4)}/>` + twinkle(62, 31, 2.6, '#FFF6C8')
    + `<path d="M48 82 V92 L51.5 89 L55 92 V82" fill="#F9A1C0" ${ln(1.5)}/>`
    + face(51, 61, 1, { eye: '#2E4F49' }) },

  frog: { emoji: '🐸', label: 'Frog', svg:
    `<circle cx="33" cy="42" r="11" fill="#8ED6A0" ${ln()}/><circle cx="67" cy="42" r="11" fill="#8ED6A0" ${ln()}/>`
    + `<ellipse cx="50" cy="63" rx="31" ry="21" fill="#8ED6A0" ${ln()}/>`
    + `<circle cx="33" cy="42" r="10" fill="#8ED6A0"/><circle cx="67" cy="42" r="10" fill="#8ED6A0"/>`
    + [33, 67].map(x => `<circle cx="${x}" cy="42" r="5" fill="${OUT}"/><circle cx="${x + 1.8}" cy="40.2" r="1.8" fill="#fff"/>`).join('')
    + `<path d="M43 37 Q47 27 50 20 Q52 17 56 18 Q53 21 53.5 25 Q55 31 57 37 Z" fill="#8B6FD6" ${ln(1.6)}/><ellipse cx="50" cy="37.5" rx="10" ry="2.8" fill="#8B6FD6" ${ln(1.6)}/>`
    + `<path d="M38 64 Q50 73 62 64" fill="none" ${ln(1.8)}/><ellipse cx="32" cy="64" rx="4" ry="2.4" fill="${BLUSH}" opacity=".7"/><ellipse cx="68" cy="64" rx="4" ry="2.4" fill="${BLUSH}" opacity=".7"/>`
    + `<circle cx="38" cy="78" r="1.6" fill="#6CBF84"/><circle cx="61" cy="80" r="1.3" fill="#6CBF84"/>` },

  owl: { emoji: '🦉', label: 'Owl', svg:
    `<path d="M27 34 L30 22 L39 31 Z M73 34 L70 22 L61 31 Z" fill="#B48F75" ${ln()}/>`
    + `<path d="M50 24 C68 24 77 38 77 56 C77 74 66 85 50 85 C34 85 23 74 23 56 C23 38 32 24 50 24 Z" fill="#B48F75" ${ln()}/>`
    + `<ellipse cx="50" cy="66" rx="16" ry="15" fill="#F2DCC6"/>`
    + `<path d="M43 63 q2 2 4 0 M53 63 q2 2 4 0 M48 70 q2 2 4 0" fill="none" stroke="#D9B898" stroke-width="1.4" stroke-linecap="round"/>`
    + `<path d="M23 56 C18 64 22 74 30 76 C29 68 29 62 23 56 Z M77 56 C82 64 78 74 70 76 C71 68 71 62 77 56 Z" fill="#9C775F" ${ln(1.6)}/>`
    + [39, 61].map(x => `<circle cx="${x}" cy="47" r="9.5" fill="#fff" ${ln(1.6)}/><circle cx="${x}" cy="48" r="5" fill="${OUT}"/><circle cx="${x + 1.8}" cy="46" r="1.8" fill="#fff"/>`).join('')
    + `<path d="M46.5 55 L53.5 55 L50 60 Z" fill="#F7A35C" ${ln(1.3)}/>`
    + `<ellipse cx="27.5" cy="56" rx="3.4" ry="2" fill="${BLUSH}" opacity=".7"/><ellipse cx="72.5" cy="56" rx="3.4" ry="2" fill="${BLUSH}" opacity=".7"/>` },

  bat: { emoji: '🦇', label: 'Bat', svg:
    `<path d="M38 52 C30 40 18 38 10 44 C15 46 16 50 14 54 C19 53 22 57 21 61 C26 58 31 60 33 64 Z" fill="#8E7CC0" ${ln()}/>`
    + mirror(`<path d="M38 52 C30 40 18 38 10 44 C15 46 16 50 14 54 C19 53 22 57 21 61 C26 58 31 60 33 64 Z" fill="#8E7CC0" ${ln()}/>`)
    + `<path d="M37 42 L35 28 L44 36 Z M63 42 L65 28 L56 36 Z" fill="#7C6AA8" ${ln()}/>`
    + `<circle cx="50" cy="55" r="17" fill="#7C6AA8" ${ln()}/>`
    + `<path d="M38 36.5 L37 31 L41.5 35 Z M62 36.5 L63 31 L58.5 35 Z" fill="#F7A8C8"/>`
    + face(50, 54, 1, { eye: '#FFF4FA', mouth: 'fang', gap: 6.5 })
    + `<path d="M44 72 L44 76 M56 72 L56 76" ${ln(1.8)}/>` + twinkle(80, 26, 3.4) + twinkle(20, 72, 2.6, '#FFF6C8') },

  ghost: { emoji: '👻', label: 'Ghost', svg:
    `<path d="M27 52 C27 33 37 21 50 21 C63 21 73 33 73 52 V77 Q69 84 65 77 Q61.5 71 57.5 77 Q53.5 84 50 77 Q46.5 71 42.5 77 Q38.5 84 35 77 Q31 71 27 77 Z" fill="#FFFFFF" ${ln()}/>`
    + `<path d="M27 56 Q19 58 21 64 Q25 64 27 61 M73 56 Q81 58 79 64 Q75 64 73 61" fill="#fff" ${ln(1.8)}/>`
    + face(50, 50, 1.1, { mouth: 'open', gap: 7.5 })
    + twinkle(80, 30, 3.4) + twinkle(18, 40, 2.6, '#F9A1C0') },

  pumpkin: { emoji: '🎃', label: 'Pumpkin', svg:
    `<path d="M50 30 Q49 22 53 16 Q57 15 57 18 Q53 22 54 30 Z" fill="#7BAA6A" ${ln(1.6)}/>`
    + `<path d="M55 22 Q66 14 72 21 Q64 25 57 25 Z" fill="#9EDDB9" ${ln(1.5)}/>`
    + `<ellipse cx="33" cy="59" rx="16" ry="23" fill="#F7A35C" ${ln()}/><ellipse cx="67" cy="59" rx="16" ry="23" fill="#F7A35C" ${ln()}/>`
    + `<ellipse cx="50" cy="59" rx="19" ry="25" fill="#FBB46F" ${ln()}/>`
    + face(50, 60, 1.05, { mouth: 'smile', gap: 7.5 }) + twinkle(18, 32, 3) },

  candle: { emoji: '🕯️', label: 'Candle', svg:
    `<path d="M50 14 C55 20 57 25 57 29 C57 33 54 36 50 36 C46 36 43 33 43 29 C43 25 45 20 50 14 Z" fill="#FFB86B" ${ln(1.7)}/>`
    + `<path d="M50 22 C52.5 25 53.5 27.5 53.5 29.5 C53.5 31.5 52 33 50 33 C48 33 46.5 31.5 46.5 29.5 C46.5 27.5 47.5 25 50 22 Z" fill="#FFE98A"/>`
    + `<path d="M50 36 V40" ${ln(1.6)}/>`
    + `<path d="M35 42 C35 40 65 40 65 42 V78 H35 Z" fill="#FFF1D6" ${ln()}/>`
    + `<path d="M35 43 C40 45 42 52 44 49 C46 46 48 44 51 46 C53 48 54 55 57 50 C59 47 62 44 65 43" fill="none" stroke="#F3D9AE" stroke-width="2" stroke-linecap="round"/>`
    + `<ellipse cx="50" cy="80" rx="24" ry="6" fill="#F2C76B" ${ln()}/><path d="M74 80 Q82 79 82 84 Q80 88 74 84" fill="none" ${ln(1.8)}/>`
    + face(50, 60, 1) + twinkle(28, 24, 3) + twinkle(73, 30, 2.4, '#FFF6C8') },

  gems: { emoji: '💎', label: 'Crystals', svg:
    `<path d="M22 84 L20 58 L28 46 L36 58 L35 84 Z" fill="#9EDDE0" ${ln()}/><path d="M28 46 L28 84" stroke="#7CC4C8" stroke-width="1.4"/>`
    + `<path d="M66 84 L64 52 L73 40 L82 52 L80 84 Z" fill="#B79CF0" ${ln()}/><path d="M73 40 L73 84" stroke="#9A80DC" stroke-width="1.4"/>`
    + `<path d="M34 86 L32 42 L50 16 L68 42 L66 86 Z" fill="#F7A6C6" ${ln()}/>`
    + `<path d="M50 16 L44 42 L46 86 M50 16 L56 42 L54 86 M32 42 L68 42" fill="none" stroke="#EE8DB4" stroke-width="1.4"/>`
    + shine('M38 50 L37 66') + face(50, 60, 1, { gap: 7.5 }) + twinkle(18, 32, 3.4) + twinkle(84, 26, 2.6, '#FFF6C8') },
};

export const AVATAR_IDS = ['cat', 'crystal', 'potion', 'cauldron', 'mushroom', 'shrooms', 'moon', 'hat',
  'book', 'frog', 'owl', 'bat', 'ghost', 'pumpkin', 'candle', 'gems'];
export const AVATARS = AV;

// Earlier picks (and emoji-only profiles) map onto a witchy sticker.
const RENAMED = {
  sakura: 'potion', kuro: 'cat', neko: 'cat', usagi: 'ghost', sora: 'moon', momo: 'mushroom', kuma: 'owl',
  yuki: 'crystal', hana: 'shrooms', megane: 'book', kitsune: 'pumpkin', beanie: 'frog',
  bunny: 'ghost', bob: 'hat', bear: 'owl', curls: 'shrooms', long: 'crystal', fox: 'pumpkin', bun: 'mushroom',
  panda: 'bat', short: 'moon',
};
const FROM_EMOJI = { '🐰': 'ghost', '🐻': 'owl', '🐱': 'cat', '🦊': 'pumpkin', '🐼': 'bat', '🐸': 'frog' };
export const avatarId = p => {
  if (!p) return null;
  if (AV[p.avatar]) return p.avatar;
  return RENAMED[p.avatar] || FROM_EMOJI[p.emoji] || null;
};

// Any 100×100 drawing as a die-cut sticker image (also used for the little
// heading stickers in icons.js). `edge` colours the die-cut border.
const cache = new Map();
export function stickerUri(key, inner, edge = '#fff') {
  key += '|' + edge;
  if (!cache.has(key)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${sticker(edge)}</defs>`
      + `<g transform="translate(50 52) scale(.86) translate(-50 -52)"><g filter="url(#die)">${inner}</g></g></svg>`;
    cache.set(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ')));
  }
  return cache.get(key);
}
export const avatarUri = id => stickerUri('avatar:' + id, AV[id].svg);
export { face as stickerFace, twinkle as stickerTwinkle, ln as stickerLine };

// Inner markup for any avatar circle (the circle itself supplies the colour).
export function avatarHTML(p) {
  const id = avatarId(p);
  return id ? `<img class="av-img" src="${avatarUri(id)}" alt="" draggable="false">` : esc((p && p.emoji) || '💗');
}

// selectedFirst: the chosen one leads (so it shows when only the first row does).
export function avatarPickerHTML(selected, colorStyle, { selectedFirst = false } = {}) {
  const ids = selectedFirst && AVATAR_IDS.includes(selected) ? [selected, ...AVATAR_IDS.filter(id => id !== selected)] : AVATAR_IDS;
  return `<div class="avatar-grid" role="radiogroup" aria-label="Profile picture">${ids.map(id => `
    <button type="button" class="avatar-pick${id === selected ? ' on' : ''}" data-avatar="${id}" role="radio" aria-checked="${id === selected}" aria-label="${AV[id].label}" style="${colorStyle}">
      <img class="av-img" src="${avatarUri(id)}" alt="" draggable="false">
    </button>`).join('')}</div>`;
}
