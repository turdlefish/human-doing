// Sticker artwork.
//
// SVG stickers are drawn on a 100×100 canvas (washi tape on 200×56) and served
// as data-URI <img>s, so every sticker is self-contained. Sticker keys:
//   svg:<name>   washi:<pattern>   word:<colour>:<text>   emoji:<char>

import { colorVars, esc } from './util.js';

const INK = '#5B3F52';
const st = (c, w = 4) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const mirror = inner => `<g transform="translate(100 0) scale(-1 1)">${inner}</g>`;
// Points of a regular n-gon (rot = angle of the first vertex, degrees).
const ngon = (cx, cy, r, rot = -90, n = 5) => Array.from({ length: n }, (_, i) => {
  const a = (rot + i * 360 / n) * Math.PI / 180;
  return (cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1);
}).join(' ');

// Kawaii face centred on (cx, cy).
function face(cx, cy, s = 1, o = {}) {
  const ex = 7 * s;
  const eyes = o.sleepy
    ? `<path d="M${cx - ex - 3 * s} ${cy} q${3 * s} ${2.8 * s} ${6 * s} 0 M${cx + ex - 3 * s} ${cy} q${3 * s} ${2.8 * s} ${6 * s} 0" stroke="${INK}" stroke-width="${2 * s}" fill="none" stroke-linecap="round"/>`
    : `<circle cx="${cx - ex}" cy="${cy}" r="${2.6 * s}" fill="${INK}"/><circle cx="${cx + ex}" cy="${cy}" r="${2.6 * s}" fill="${INK}"/>`
      + `<circle cx="${cx - ex + 0.9 * s}" cy="${cy - 0.9 * s}" r="${0.9 * s}" fill="#fff"/><circle cx="${cx + ex + 0.9 * s}" cy="${cy - 0.9 * s}" r="${0.9 * s}" fill="#fff"/>`;
  const mouth = o.w
    ? `<path d="M${cx - 5 * s} ${cy + 4 * s} q${2.5 * s} ${3 * s} ${5 * s} 0 q${2.5 * s} ${3 * s} ${5 * s} 0" stroke="${INK}" stroke-width="${1.8 * s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${cx - 3 * s} ${cy + 4 * s} q${3 * s} ${3.2 * s} ${6 * s} 0" stroke="${INK}" stroke-width="${2 * s}" fill="none" stroke-linecap="round"/>`;
  const blush = `<ellipse cx="${cx - 12.5 * s}" cy="${cy + 4 * s}" rx="${3.8 * s}" ry="${2.3 * s}" fill="#FF8FB3" opacity=".55"/>`
    + `<ellipse cx="${cx + 12.5 * s}" cy="${cy + 4 * s}" rx="${3.8 * s}" ry="${2.3 * s}" fill="#FF8FB3" opacity=".55"/>`;
  return eyes + mouth + blush;
}

const rays = () => [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
  const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return `<line x1="${(50 + c * 31).toFixed(1)}" y1="${(50 + s * 31).toFixed(1)}" x2="${(50 + c * 41).toFixed(1)}" y2="${(50 + s * 41).toFixed(1)}"/>`;
}).join('');

const SVG = {
  heart: `<path d="M50 84 C22 66 10 50 14 34 C18 18 38 14 50 30 C62 14 82 18 86 34 C90 50 78 66 50 84 Z" fill="#FFB5CD" ${st('#EE87AB')}/>
    <ellipse cx="29" cy="32" rx="6" ry="3.6" fill="#fff" opacity=".75" transform="rotate(-35 29 32)"/>${face(50, 50)}`,

  star: `<path d="M50 12 L62.9 34.2 L88 39.6 L70.9 58.8 L73.5 84.4 L50 74 L26.5 84.4 L29.1 58.8 L12 39.6 L37.1 34.2 Z" fill="#FFE59A" ${st('#EDC45A')}/>${face(50, 54, 0.9)}`,

  sparkles: `<path d="M44 10 C47 34 54 41 78 44 C54 47 47 54 44 78 C41 54 34 47 10 44 C34 41 41 34 44 10 Z" fill="#E6DBFF" ${st('#AE96E8', 3.5)}/>
    <path d="M78 60 C79.5 70 82 72.5 92 74 C82 75.5 79.5 78 78 88 C76.5 78 74 75.5 64 74 C74 72.5 76.5 70 78 60 Z" fill="#FFE59A" ${st('#EDC45A', 3)}/>
    <circle cx="22" cy="80" r="4" fill="#FFC9DC"/>`,

  cloud: `<path d="M26 74 C13 74 9 58 20 52 C18 38 34 31 43 39 C48 25 71 26 74 42 C88 41 93 62 80 72 C78 73.5 76 74 74 74 Z" fill="#F7FBFF" ${st('#9CC8EE')}/>${face(50, 57)}`,

  bunny: `<path d="M34 46 C26 30 26 8 34 8 C42 8 44 30 42 46 Z" fill="#fff" ${st('#E7B3C8')}/><path d="M35 40 C31 28 31 15 34 15 C37 15 39 28 38 40 Z" fill="#FFC9DC"/>
    ${mirror(`<path d="M34 46 C26 30 26 8 34 8 C42 8 44 30 42 46 Z" fill="#fff" ${st('#E7B3C8')}/><path d="M35 40 C31 28 31 15 34 15 C37 15 39 28 38 40 Z" fill="#FFC9DC"/>`)}
    <ellipse cx="50" cy="63" rx="31" ry="25" fill="#fff" ${st('#E7B3C8')}/>${face(50, 62, 1, { w: true })}`,

  bear: `<circle cx="26" cy="30" r="12" fill="#E8C4A6" ${st('#C49373')}/><circle cx="26" cy="30" r="5.5" fill="#FFC9DC"/>
    <circle cx="74" cy="30" r="12" fill="#E8C4A6" ${st('#C49373')}/><circle cx="74" cy="30" r="5.5" fill="#FFC9DC"/>
    <circle cx="50" cy="55" r="32" fill="#E8C4A6" ${st('#C49373')}/>
    <ellipse cx="50" cy="65" rx="13" ry="10" fill="#FFF3E6"/>
    <circle cx="39" cy="50" r="2.8" fill="${INK}"/><circle cx="61" cy="50" r="2.8" fill="${INK}"/>
    <circle cx="40" cy="49" r="1" fill="#fff"/><circle cx="62" cy="49" r="1" fill="#fff"/>
    <ellipse cx="50" cy="61" rx="4.2" ry="3" fill="${INK}"/>
    <path d="M45.5 66 q2.25 2.6 4.5 0 q2.25 2.6 4.5 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="30" cy="61" rx="4" ry="2.5" fill="#FF8FB3" opacity=".55"/><ellipse cx="70" cy="61" rx="4" ry="2.5" fill="#FF8FB3" opacity=".55"/>`,

  cat: `<path d="M18 44 C16 32 18 20 22 12 C30 16 36 22 40 28 C46 26 54 26 60 28 C64 22 70 16 78 12 C82 20 84 32 82 44 C86 64 72 82 50 82 C28 82 14 64 18 44 Z" fill="#FFF0E3" ${st('#D9AE94')}/>
    <path d="M24 20 C28 22 31 25 33 28 L25 32 Z" fill="#FFC9DC"/><path d="M76 20 C72 22 69 25 67 28 L75 32 Z" fill="#FFC9DC"/>
    ${face(50, 54, 1, { w: true })}
    <g ${st('#D9AE94', 2.2)}><line x1="12" y1="55" x2="24" y2="57"/><line x1="12" y1="63" x2="24" y2="61"/><line x1="88" y1="55" x2="76" y2="57"/><line x1="88" y1="63" x2="76" y2="61"/></g>`,

  bee: `<ellipse cx="40" cy="30" rx="11" ry="15" fill="#EEF7FF" ${st('#9CC8EE', 3)} transform="rotate(-25 40 30)"/>
    <ellipse cx="60" cy="28" rx="11" ry="15" fill="#EEF7FF" ${st('#9CC8EE', 3)} transform="rotate(20 60 28)"/>
    <path d="M86 60 L93 60" ${st('#6E5263', 4)}/>
    <ellipse cx="50" cy="60" rx="34" ry="24" fill="#FFE59A" ${st('#E0B23E')}/>
    <path d="M62 37.5 C68 48 68 72 62 82.5" ${st('#6E5263', 6)} fill="none"/><path d="M74 42 C78 51 78 69 74 78" ${st('#6E5263', 6)} fill="none"/>
    ${face(36, 58, 0.9)}`,

  butterfly: `<path d="M48 46 C36 16 10 14 12 34 C14 50 34 54 48 50 Z" fill="#E6DBFF" ${st('#AE96E8', 3.5)}/>
    <path d="M48 54 C34 56 20 66 26 79 C32 89 46 77 48 60 Z" fill="#FFD3E2" ${st('#EE9CBB', 3.5)}/>
    ${mirror(`<path d="M48 46 C36 16 10 14 12 34 C14 50 34 54 48 50 Z" fill="#E6DBFF" ${st('#AE96E8', 3.5)}/><path d="M48 54 C34 56 20 66 26 79 C32 89 46 77 48 60 Z" fill="#FFD3E2" ${st('#EE9CBB', 3.5)}/>`)}
    <circle cx="26" cy="33" r="4" fill="#fff"/><circle cx="74" cy="33" r="4" fill="#fff"/>
    <path d="M47 38 C44 28 40 24 35 22 M53 38 C56 28 60 24 65 22" ${st('#8C6A7E', 3)} fill="none"/>
    <circle cx="35" cy="22" r="3" fill="#8C6A7E"/><circle cx="65" cy="22" r="3" fill="#8C6A7E"/>
    <rect x="44" y="36" width="12" height="44" rx="6" fill="#8C6A7E"/>`,

  mochi: `<path d="M12 70 C10 46 28 30 50 30 C72 30 90 46 88 70 C88 79 78 82 50 82 C22 82 12 79 12 70 Z" fill="#fff" ${st('#EFB8CC')}/>
    <path d="M19 50 C24 38 36 32 50 32 C64 32 76 38 81 50 C68 44 32 44 19 50 Z" fill="#FFD3E2"/>
    <path d="M50 31 C52 22 60 19 66 21 C64 28 57 32 50 31 Z" fill="#9EDDB9" ${st('#64B88F', 2.5)}/>
    ${face(50, 62)}`,

  sun: `<g ${st('#F6C850', 5)}>${rays()}</g><circle cx="50" cy="50" r="24" fill="#FFE59A" ${st('#F2BF45')}/>${face(50, 50, 0.9)}`,

  moon: `<path d="M51.5 14 A36 36 0 1 0 85 58.6 A28 28 0 1 1 51.5 14 Z" fill="#FFF1B8" ${st('#EBCB62')}/>
    ${face(31, 60, 0.75, { sleepy: true })}
    <path d="M80 14 L82.2 20 L88 22 L82.2 24 L80 30 L77.8 24 L72 22 L77.8 20 Z" fill="#FFE59A" ${st('#EDC45A', 2)}/>`,

  rainbow: `<path d="M14 72 A36 36 0 0 1 86 72" fill="none" stroke="#FFB5CD" stroke-width="10" stroke-linecap="round"/>
    <path d="M25 72 A25 25 0 0 1 75 72" fill="none" stroke="#FFE59A" stroke-width="10" stroke-linecap="round"/>
    <path d="M36 72 A14 14 0 0 1 64 72" fill="none" stroke="#BDEBD5" stroke-width="10" stroke-linecap="round"/>
    <path d="M4 82 C2 74 10 69 16 73 C20 66 31 68 31 76 C36 76 36 83 31 84 L8 84 C5.5 84 4 83.5 4 82 Z" fill="#fff" ${st('#C9D9EE', 3)}/>
    ${mirror(`<path d="M4 82 C2 74 10 69 16 73 C20 66 31 68 31 76 C36 76 36 83 31 84 L8 84 C5.5 84 4 83.5 4 82 Z" fill="#fff" ${st('#C9D9EE', 3)}/>`)}`,

  daisy: `<g fill="#fff" ${st('#F2A7C3', 3)}>${[0, 60, 120, 180, 240, 300].map(a => `<ellipse cx="50" cy="29" rx="11" ry="17" transform="rotate(${a} 50 50)"/>`).join('')}</g>
    <circle cx="50" cy="50" r="16" fill="#FFE59A" ${st('#EDC45A', 3)}/>${face(50, 49, 0.62)}`,

  tulip: `<path d="M50 58 L50 92" ${st('#7CCFAA', 5)}/>
    <path d="M50 88 C38 86 30 76 30 66 C40 68 48 76 50 88 Z" fill="#BDEBD5" ${st('#7CCFAA', 3.5)}/>
    <path d="M50 82 C62 80 70 70 70 60 C60 62 52 70 50 82 Z" fill="#BDEBD5" ${st('#7CCFAA', 3.5)}/>
    <path d="M30 20 L40 30 L50 14 L60 30 L70 20 C74 40 68 58 50 60 C32 58 26 40 30 20 Z" fill="#FFB5CD" ${st('#EE87AB')}/>
    ${face(50, 41, 0.75)}`,

  blossom: `<g fill="#FFD3E2" ${st('#F29BBB', 3)}>${[-90, -18, 54, 126, 198].map(a => {
      const r = a * Math.PI / 180;
      return `<circle cx="${(50 + Math.cos(r) * 19).toFixed(1)}" cy="${(50 + Math.sin(r) * 19).toFixed(1)}" r="16"/>`;
    }).join('')}</g>
    <circle cx="50" cy="50" r="12" fill="#FFE6EF"/>
    <g fill="#F290B5">${[-90, -18, 54, 126, 198].map(a => {
      const r = a * Math.PI / 180;
      return `<circle cx="${(50 + Math.cos(r) * 7).toFixed(1)}" cy="${(50 + Math.sin(r) * 7).toFixed(1)}" r="2"/>`;
    }).join('')}</g><circle cx="50" cy="50" r="3.5" fill="#FFE59A"/>`,

  clover: `<path d="M52 60 C54 72 58 82 64 90" ${st('#6FBF98', 5)} fill="none"/>
    <g fill="#BDEBD5" ${st('#6FBF98', 3.5)}><circle cx="36" cy="36" r="15"/><circle cx="64" cy="36" r="15"/><circle cx="36" cy="62" r="15"/><circle cx="64" cy="62" r="15"/></g>
    <circle cx="50" cy="49" r="10" fill="#BDEBD5"/>${face(50, 48, 0.6)}`,

  sprout: `<path d="M50 56 L50 40" ${st('#6FBF98', 4)}/>
    <path d="M50 44 C48 30 36 22 22 24 C22 38 34 46 50 44 Z" fill="#BDEBD5" ${st('#6FBF98', 3.5)}/>
    <path d="M50 42 C52 24 64 16 80 18 C80 34 68 44 50 42 Z" fill="#BDEBD5" ${st('#6FBF98', 3.5)}/>
    <path d="M26 56 L74 56 L68 90 L32 90 Z" fill="#FFCDB2" ${st('#E39A78')}/>
    <rect x="22" y="50" width="56" height="11" rx="5" fill="#FFD9C4" ${st('#E39A78')}/>
    ${face(50, 72, 0.85)}`,

  mushroom: `<path d="M38 56 L62 56 C64 68 64 78 60 86 C56 90 44 90 40 86 C36 78 36 68 38 56 Z" fill="#FFF6EA" ${st('#D9B79E')}/>
    <path d="M12 56 C12 30 32 14 50 14 C68 14 88 30 88 56 C88 60 84 62 80 62 L20 62 C16 62 12 60 12 56 Z" fill="#FFA8B8" ${st('#E57990')}/>
    <g fill="#fff"><circle cx="30" cy="40" r="6"/><circle cx="52" cy="27" r="7"/><circle cx="71" cy="42" r="5.5"/><circle cx="46" cy="50" r="3.5"/></g>
    ${face(50, 74, 0.75)}`,

  drop: `<path d="M50 10 C62 30 78 46 78 62 C78 78 66 90 50 90 C34 90 22 78 22 62 C22 46 38 30 50 10 Z" fill="#CFE8FF" ${st('#86BDEB')}/>
    <ellipse cx="37" cy="48" rx="3.6" ry="7.5" fill="#fff" opacity=".85" transform="rotate(20 37 48)"/>${face(51, 66, 0.9)}`,
  // The cycle tracker's icon (not in the sticker drawer).
  pdrop: `<path d="M50 10 C62 30 78 46 78 62 C78 78 66 90 50 90 C34 90 22 78 22 62 C22 46 38 30 50 10 Z" fill="#FFC2D1" ${st('#EC7E9C')}/>
    <ellipse cx="37" cy="48" rx="3.6" ry="7.5" fill="#fff" opacity=".85" transform="rotate(20 37 48)"/>${face(51, 66, 0.9)}`,

  latte: `<path d="M38 28 C34 22 42 18 38 10 M54 28 C50 22 58 18 54 10" ${st('#E3CBBE', 3.5)} fill="none"/>
    <path d="M72 48 C88 46 90 70 70 68" ${st('#D9A88A', 5)} fill="none"/>
    <path d="M22 40 L74 40 L70 80 C69 86 64 90 58 90 L38 90 C32 90 27 86 26 80 Z" fill="#FFF3E6" ${st('#D9A88A')}/>
    <ellipse cx="48" cy="40" rx="26" ry="6" fill="#E8B993" ${st('#D9A88A', 3)}/>
    <path d="M48 44 C44 41 42 39.5 43.5 38 C45 36.5 47 37.5 48 39 C49 37.5 51 36.5 52.5 38 C54 39.5 52 41 48 44 Z" fill="#FFF3E6"/>
    ${face(48, 62)}`,

  boba: `<path d="M57 6 L50 36" ${st('#F290B5', 7)}/>
    <path d="M24 34 C24 21 76 21 76 34 Z" fill="#fff" ${st('#C9B3E8', 3.5)}/>
    <path d="M24 40 L76 40 L70 86 C69.5 89 67 91 64 91 L36 91 C33 91 30.5 89 30 86 Z" fill="#FFE6D2" ${st('#E0A989')}/>
    <rect x="20" y="32" width="60" height="9" rx="4.5" fill="#E9DDFF" ${st('#AE96E8', 3.5)}/>
    <g fill="#6E5263"><circle cx="39" cy="83" r="3.6"/><circle cx="47" cy="85" r="3.6"/><circle cx="55" cy="83" r="3.6"/><circle cx="62" cy="85" r="3.4"/><circle cx="43" cy="77" r="3.4"/><circle cx="58" cy="77" r="3.4"/><circle cx="51" cy="78" r="3.4"/></g>
    ${face(50, 58)}`,

  strawberry: `<path d="M50 90 C28 80 16 58 22 44 C28 32 44 32 50 36 C56 32 72 32 78 44 C84 58 72 80 50 90 Z" fill="#FF9EB5" ${st('#EB7393')}/>
    <g fill="#FFF1B0"><ellipse cx="30" cy="50" rx="1.8" ry="2.6"/><ellipse cx="70" cy="50" rx="1.8" ry="2.6"/><ellipse cx="34" cy="70" rx="1.8" ry="2.6"/><ellipse cx="66" cy="70" rx="1.8" ry="2.6"/><ellipse cx="50" cy="80" rx="1.8" ry="2.6"/><ellipse cx="42" cy="78" rx="1.8" ry="2.6"/><ellipse cx="58" cy="78" rx="1.8" ry="2.6"/></g>
    <path d="M50 32 C50 26 52 20 56 16" ${st('#64B88F', 4)} fill="none"/>
    <path d="M32 37 C36 26 45 29 50 33 C55 26 65 27 68 37 C60 35 55 39 50 41 C45 39 40 35 32 37 Z" fill="#9EDDB9" ${st('#64B88F', 3)}/>
    ${face(50, 56)}`,

  cupcake: `<path d="M26 56 L74 56 L66 90 L34 90 Z" fill="#C3E1FF" ${st('#86BDEB')}/>
    <path d="M39 58 L41 88 M50 58 L50 88 M61 58 L59 88" ${st('#86BDEB', 2.5)}/>
    <path d="M22 60 C14 58 15 46 25 45 C23 33 37 28 44 34 C48 22 66 24 65 36 C76 32 85 44 77 51 C83 57 78 62 72 62 Z" fill="#FFD3E2" ${st('#EE9CBB')}/>
    <path d="M55 16 C56 11 60 8 64 7" ${st('#6FBF98', 2.5)} fill="none"/>
    <circle cx="54" cy="22" r="7" fill="#FF8FA8" ${st('#E36B8A', 3)}/>
    ${face(50, 72, 0.8)}`,

  candle: `<path d="M50 9 C58 21 60 30 50 38 C40 30 42 21 50 9 Z" fill="#FFD27A" ${st('#F2A94A', 3)}/>
    <path d="M50 22 C54 27 54 32 50 35 C46 32 46 27 50 22 Z" fill="#FFF3C4"/>
    <path d="M50 38 L50 44" ${st('#6E5263', 3)}/>
    <rect x="33" y="44" width="34" height="44" rx="9" fill="#E9DDFF" ${st('#AE96E8')}/>
    <path d="M37 50 C40 50 41 56 44 56 C47 56 47 50 50 50" ${st('#fff', 3)} fill="none" opacity=".8"/>
    ${face(50, 68, 0.8)}`,

  letter: `<rect x="12" y="26" width="76" height="52" rx="8" fill="#FFF7FA" ${st('#E7A3BE')}/>
    <path d="M15 30 L50 56 L85 30" ${st('#E7A3BE')} fill="none"/>
    <path d="M50 65 C43 60 40 56 41.5 52 C43 48 48 48 50 52 C52 48 57 48 58.5 52 C60 56 57 60 50 65 Z" fill="#F290B5" ${st('#E0709A', 2)}/>`,

  bow: `<path d="M46 54 L34 84 L42 81 L46 89 L53 56 Z" fill="#FFC2D8" ${st('#EE87AB', 3.5)}/>
    <path d="M54 54 L66 84 L58 81 L54 89 L47 56 Z" fill="#FFC2D8" ${st('#EE87AB', 3.5)}/>
    <path d="M50 50 C40 36 18 28 14 40 C10 52 20 62 50 54 Z" fill="#FFC2D8" ${st('#EE87AB')}/>
    ${mirror(`<path d="M50 50 C40 36 18 28 14 40 C10 52 20 62 50 54 Z" fill="#FFC2D8" ${st('#EE87AB')}/>`)}
    <rect x="42" y="44" width="16" height="14" rx="6" fill="#FFB0CB" ${st('#EE87AB')}/>`,

  check: `<circle cx="50" cy="50" r="36" fill="#BDEBD5" ${st('#6FBF98')}/><path d="M33 51 L45 63 L68 38" ${st('#fff', 9)} fill="none"/>`,

  bubble: `<path d="M20 18 L80 18 C87 18 92 23 92 30 L92 58 C92 65 87 70 80 70 L44 70 L28 84 L30 70 L20 70 C13 70 8 65 8 58 L8 30 C8 23 13 18 20 18 Z" fill="#fff" ${st('#AE96E8')}/>
    <path d="M50 58 C41 52 36 47 38 41 C40 35 47 35 50 40 C53 35 60 35 62 41 C64 47 59 52 50 58 Z" fill="#FFB5CD" ${st('#EE87AB', 3)}/>`,

  clip: `<g transform="rotate(20 50 50)"><path d="M58 18 L58 70 C58 83 40 83 40 70 L40 26 C40 15 54 15 54 26 L54 66 C54 73 46 73 46 66 L46 32" ${st('#AE96E8', 5)} fill="none"/></g>`,

  // ── Chores ──
  broom: `<g transform="rotate(22 50 50)">
    <rect x="46.5" y="4" width="7" height="52" rx="3.5" fill="#E8C4A6" ${st('#C49373', 3)}/>
    <path d="M33 58 L67 58 L77 90 C60 95 40 95 23 90 Z" fill="#FFE59A" ${st('#EDC45A')}/>
    <path d="M40 66 L36 88 M60 66 L64 88" ${st('#EDC45A', 2.5)}/>
    <rect x="34" y="52" width="32" height="9" rx="4.5" fill="#FFC2D8" ${st('#EE87AB', 3)}/>
    ${face(50, 76, 0.7)}</g>`,

  laundry: `<path d="M58 34 L63 13 L74 15 L70 36 Z" fill="#C3E1FF" ${st('#86BDEB', 3)}/>
    <path d="M27 40 C29 25 44 22 50 32 C56 21 73 24 74 40 Z" fill="#FFC9DC" ${st('#EE87AB', 3.5)}/>
    <path d="M18 42 L82 42 L75 88 C74 91 71 92 68 92 L32 92 C29 92 26 91 25 88 Z" fill="#E9DDFF" ${st('#AE96E8')}/>
    <rect x="14" y="37" width="72" height="10" rx="5" fill="#D9CBFF" ${st('#AE96E8', 3.5)}/>
    <g fill="#AE96E8" opacity=".35"><rect x="26" y="54" width="9" height="5" rx="2.5"/><rect x="65" y="54" width="9" height="5" rx="2.5"/><rect x="30" y="80" width="9" height="5" rx="2.5"/><rect x="61" y="80" width="9" height="5" rx="2.5"/></g>
    ${face(50, 68, 0.9)}`,

  washer: `<rect x="17" y="10" width="66" height="82" rx="12" fill="#F7FBFF" ${st('#86BDEB')}/>
    <path d="M17 30 L83 30" ${st('#86BDEB', 3)}/>
    <circle cx="29" cy="20" r="3.2" fill="#F290B5"/><circle cx="39" cy="20" r="3.2" fill="#FFE59A"/><rect x="55" y="17" width="20" height="6" rx="3" fill="#C3E1FF"/>
    <circle cx="50" cy="61" r="22" fill="#E2F1FF" ${st('#86BDEB')}/>
    <circle cx="50" cy="61" r="15" fill="#B9DCF7"/>
    <circle cx="43" cy="53" r="3" fill="#fff" opacity=".85"/><circle cx="58" cy="68" r="2" fill="#fff" opacity=".85"/>
    ${face(50, 62, 0.7)}`,

  spray: `<g fill="#9FD0F5"><circle cx="85" cy="13" r="2.2"/><circle cx="91" cy="20" r="2"/><circle cx="85" cy="25" r="1.8"/></g>
    <path d="M36 14 L64 14 L68 27 L36 27 Z" fill="#FFC9DC" ${st('#EE87AB', 3.5)}/>
    <rect x="64" y="15.5" width="13" height="8" rx="2.5" fill="#FFC9DC" ${st('#EE87AB', 3)}/>
    <rect x="42" y="27" width="16" height="13" fill="#E0F6EC" ${st('#7CCFAA', 3.5)}/>
    <path d="M45 28 L40 42" ${st('#EE87AB', 4)}/>
    <path d="M34 40 L66 40 C70 40 72 43 72 47 L72 86 C72 90 69 92 65 92 L35 92 C31 92 28 90 28 86 L28 47 C28 43 30 40 34 40 Z" fill="#BDEBD5" ${st('#7CCFAA')}/>
    <rect x="34" y="55" width="32" height="22" rx="6" fill="#fff" opacity=".65"/>
    ${face(50, 64, 0.75)}`,

  sponge: `<g fill="#EAF6FF" ${st('#9CC8EE', 2.5)}><circle cx="27" cy="22" r="8"/><circle cx="45" cy="12" r="6"/><circle cx="71" cy="20" r="10"/></g>
    <circle cx="24" cy="19" r="2" fill="#fff"/><circle cx="67" cy="16" r="2.5" fill="#fff"/>
    <rect x="15" y="40" width="70" height="46" rx="12" fill="#FFE59A" ${st('#EDC45A')}/>
    <rect x="15" y="33" width="70" height="15" rx="7.5" fill="#9EDDB9" ${st('#64B88F', 3.5)}/>
    <g fill="#EDC45A" opacity=".6"><circle cx="25" cy="60" r="2.2"/><circle cx="76" cy="58" r="2.6"/><circle cx="72" cy="76" r="2"/><circle cx="28" cy="77" r="2.4"/></g>
    ${face(50, 64)}`,

  wateringcan: `<path d="M64 56 L85 33" ${st('#E39A78', 7)}/>
    <ellipse cx="87" cy="31" rx="7" ry="4.5" fill="#FFCDB2" ${st('#E39A78', 3)} transform="rotate(-45 87 31)"/>
    <path d="M30 42 C26 18 60 16 58 42" fill="none" ${st('#E39A78', 6)}/>
    <path d="M20 42 L68 42 L64 86 C64 89 61 91 58 91 L30 91 C27 91 24 89 24 86 Z" fill="#FFCDB2" ${st('#E39A78')}/>
    <path d="M93 44 c2.5 4 2.5 7 0 8 c-2.5 -1 -2.5 -4 0 -8 Z M85 50 c2 3.5 2 6 0 7 c-2 -1 -2 -3.5 0 -7 Z" fill="#9FD0F5"/>
    ${face(44, 64, 0.85)}`,

  iron: `<path d="M30 32 C26 26 34 22 30 14 M43 32 C39 26 47 22 43 14" ${st('#E3CBBE', 3.5)} fill="none"/>
    <path d="M42 42 C42 28 52 26 84 26 L84 42" fill="none" ${st('#AE96E8', 6)}/>
    <path d="M12 76 C12 54 32 42 58 42 L86 42 L86 76 Z" fill="#E9DDFF" ${st('#AE96E8')}/>
    <rect x="10" y="74" width="78" height="9" rx="3.5" fill="#EEF1F8" ${st('#AE96E8', 3.5)}/>
    <circle cx="72" cy="56" r="5" fill="#FFC2D8" ${st('#EE87AB', 2.5)}/>
    ${face(44, 60, 0.8)}`,

  groceries: `<rect x="56" y="6" width="13" height="42" rx="6.5" fill="#F6C48F" ${st('#D9965A', 3)} transform="rotate(14 62 27)"/>
    <path d="M30 34 C26 20 34 12 40 14 C42 22 38 30 30 34 Z" fill="#9EDDB9" ${st('#64B88F', 3)}/>
    <path d="M37 35 C39 23 48 18 53 22 C51 30 45 34 37 35 Z" fill="#BDEBD5" ${st('#64B88F', 3)}/>
    <path d="M20 36 L80 36 L75 90 C75 92 73 93 71 93 L29 93 C27 93 25 92 25 90 Z" fill="#FFE6D2" ${st('#E0A989')}/>
    <path d="M36 38 C36 26 64 26 64 38" fill="none" ${st('#E0A989', 4)}/>
    ${face(50, 64)}`,

  bucket: `<path d="M22 40 C22 12 78 12 78 40" fill="none" ${st('#86BDEB', 4)}/>
    <g fill="#EAF6FF" ${st('#9CC8EE', 2.5)}><circle cx="30" cy="32" r="9"/><circle cx="45" cy="26" r="10"/><circle cx="61" cy="28" r="9"/><circle cx="73" cy="34" r="7"/></g>
    <path d="M18 38 L82 38 L74 88 C73 91 70 92 67 92 L33 92 C30 92 27 91 26 88 Z" fill="#C3E1FF" ${st('#86BDEB')}/>
    <rect x="14" y="34" width="72" height="9" rx="4.5" fill="#E2F1FF" ${st('#86BDEB', 3.5)}/>
    ${face(50, 64)}`,

  // ── Sports ──
  soccer: `<defs><clipPath id="b"><circle cx="50" cy="50" r="36"/></clipPath></defs>
    <circle cx="50" cy="50" r="37" fill="#fff" ${st('#B9AEBB')}/>
    <g clip-path="url(#b)" fill="#D9CBFF" ${st('#AE96E8', 2.5)}>
      ${[-90, -18, 54, 126, 198].map(a => `<polygon points="${ngon(50 + Math.cos(a * Math.PI / 180) * 35, 50 + Math.sin(a * Math.PI / 180) * 35, 10, a + 180)}"/>`).join('')}
    </g>
    <g ${st('#B9AEBB', 2.5)}>${[-90, -18, 54, 126, 198].map(a => {
      const r = a * Math.PI / 180;
      return `<line x1="${(50 + Math.cos(r) * 11).toFixed(1)}" y1="${(50 + Math.sin(r) * 11).toFixed(1)}" x2="${(50 + Math.cos(r) * 26).toFixed(1)}" y2="${(50 + Math.sin(r) * 26).toFixed(1)}"/>`;
    }).join('')}</g>
    <polygon points="${ngon(50, 50, 12, -90)}" fill="#FFC2D8" ${st('#EE87AB', 2.5)}/>`,

  basketball: `<circle cx="50" cy="50" r="36" fill="#FFB27A" ${st('#E5864A')}/>
    <path d="M14 50 L86 50 M50 14 L50 86 M27 22 C41 36 41 64 27 78 M73 22 C59 36 59 64 73 78" fill="none" ${st('#E5864A', 3)}/>
    <ellipse cx="34" cy="30" rx="6" ry="3.5" fill="#fff" opacity=".55" transform="rotate(-35 34 30)"/>`,

  tennis: `<defs><clipPath id="r"><ellipse cx="44" cy="36" rx="17" ry="22"/></clipPath></defs>
    <g transform="rotate(-28 44 46)">
      <rect x="40" y="62" width="8" height="30" rx="4" fill="#FFC2D8" ${st('#EE87AB', 3)}/>
      <path d="M38 58 L44 66 L50 58" fill="none" ${st('#86BDEB', 4)}/>
      <ellipse cx="44" cy="36" rx="20" ry="25" fill="#EEF7FF" ${st('#86BDEB', 4)}/>
      <g clip-path="url(#r)" stroke="#9CC8EE" stroke-width="1.6">
        <path d="M32 10 L32 62 M38 10 L38 62 M44 10 L44 62 M50 10 L50 62 M56 10 L56 62 M22 22 L66 22 M22 29 L66 29 M22 36 L66 36 M22 43 L66 43 M22 50 L66 50"/>
      </g>
    </g>
    <circle cx="76" cy="72" r="13" fill="#E6F07A" ${st('#B7C447', 3)}/>
    <path d="M65 66 C71 70 71 78 66 82 M87 62 C80 66 80 76 86 80" fill="none" stroke="#fff" stroke-width="2.5"/>`,

  dumbbell: `<rect x="22" y="46" width="56" height="8" rx="4" fill="#E3E6F0" ${st('#9AA3BD', 3)}/>
    <rect x="4" y="36" width="10" height="28" rx="4" fill="#FFC2D8" ${st('#EE87AB', 3.5)}/>
    <rect x="12" y="28" width="14" height="44" rx="6" fill="#FFC2D8" ${st('#EE87AB')}/>
    ${mirror(`<rect x="4" y="36" width="10" height="28" rx="4" fill="#FFC2D8" ${st('#EE87AB', 3.5)}/><rect x="12" y="28" width="14" height="44" rx="6" fill="#FFC2D8" ${st('#EE87AB')}/>`)}
    <path d="M50 20 L52 26 L58 28 L52 30 L50 36 L48 30 L42 28 L48 26 Z" fill="#FFE59A" ${st('#EDC45A', 2)}/>`,

  sneaker: `<path d="M8 72 L92 72 C92 80 88 86 82 86 L14 86 C10 86 8 80 8 72 Z" fill="#fff" ${st('#AE96E8', 3.5)}/>
    <path d="M10 72 C10 58 14 48 20 44 L32 38 C38 46 50 48 58 46 C66 52 80 56 87 60 C91 63 92 68 92 72 Z" fill="#BDEBD5" ${st('#7CCFAA')}/>
    <path d="M36 46 L42 52 M43 44 L49 50 M50 44 L55 49" ${st('#fff', 3)}/>
    <path d="M28 64 C44 60 60 60 78 63" fill="none" stroke="#FFC2D8" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 79 L86 79" stroke="#E9DDFF" stroke-width="2.5" stroke-dasharray="4 4"/>`,

  bicycle: `<circle cx="25" cy="66" r="16" fill="#fff" fill-opacity=".6" ${st('#86BDEB', 4)}/>
    <circle cx="75" cy="66" r="16" fill="#fff" fill-opacity=".6" ${st('#86BDEB', 4)}/>
    <circle cx="25" cy="66" r="3" fill="#86BDEB"/><circle cx="75" cy="66" r="3" fill="#86BDEB"/>
    <path d="M25 66 L40 42 L66 42 L75 66 M40 42 L51 66 L66 42 M51 66 L25 66 M40 42 L38 34 M66 42 L64 30 L72 28" fill="none" ${st('#F290B5', 4)}/>
    <path d="M32 33 L45 33" ${st('#6E5263', 5)}/>
    <path d="M68 32 L84 32 L82 44 L70 44 Z" fill="#FFE59A" ${st('#EDC45A', 3)}/>
    <path d="M76 30 C73 27 71 25 72.5 23.5 C74 22 75.5 23 76 24 C76.5 23 78 22 79.5 23.5 C81 25 79 27 76 30 Z" fill="#F290B5"/>`,

  yogamat: `<path d="M22 38 L80 38 A16 16 0 0 1 80 70 L22 70 Z" fill="#D9CBFF" ${st('#AE96E8')}/>
    <circle cx="22" cy="54" r="16" fill="#E9DDFF" ${st('#AE96E8')}/>
    <path d="M22 54 m-2 -1 a3 3 0 1 1 4 3 a7 7 0 1 1 -8 -8 a11 11 0 1 1 9 13" fill="none" ${st('#AE96E8', 2.5)}/>
    <rect x="58" y="36" width="8" height="36" rx="2" fill="#FFC2D8" ${st('#EE87AB', 2.5)}/>
    ${face(44, 54, 0.75)}`,

  trophy: `<path d="M30 24 C14 24 14 50 34 52 M70 24 C86 24 86 50 66 52" fill="none" ${st('#E0B23E', 5)}/>
    <path d="M28 14 L72 14 L70 38 C68 54 58 60 50 60 C42 60 32 54 30 38 Z" fill="#FFE59A" ${st('#E0B23E')}/>
    <rect x="44" y="60" width="12" height="13" fill="#FFE59A" ${st('#E0B23E', 3.5)}/>
    <rect x="28" y="73" width="44" height="15" rx="4" fill="#D9CBFF" ${st('#AE96E8')}/>
    <path d="M40 80 L60 80" ${st('#fff', 3)}/>
    ${face(50, 33, 0.8)}`,

  medal: `<path d="M28 6 L44 6 L57 42 L42 42 Z" fill="#C3E1FF" ${st('#86BDEB', 3)}/>
    <path d="M72 6 L56 6 L43 42 L58 42 Z" fill="#FFC2D8" ${st('#EE87AB', 3)}/>
    <circle cx="50" cy="63" r="25" fill="#FFE59A" ${st('#E0B23E')}/>
    <circle cx="50" cy="63" r="18" fill="none" stroke="#E0B23E" stroke-width="2" opacity=".55"/>
    ${face(50, 63, 0.8)}`,

  // ── Hobbies ──
  palette: `<path d="M70 92 L92 62" stroke="#C49373" stroke-width="5" stroke-linecap="round"/>
    <path d="M89 60 C93 53 97 53 97 56 C97 61 93 65 90 64 Z" fill="#FF9EB5"/>
    <path d="M50 12 C72 12 90 27 90 47 C90 61 80 65 70 63 C62 61 58 67 62 75 C66 83 58 89 48 87 C26 85 10 69 10 49 C10 29 28 12 50 12 Z M67 52 a5 5 0 1 0 -10 0 a5 5 0 1 0 10 0 Z" fill="#FFF3E6" fill-rule="evenodd" ${st('#D9A88A')}/>
    <g><circle cx="33" cy="35" r="7" fill="#FF9EB5"/><circle cx="53" cy="27" r="7" fill="#FFE59A"/><circle cx="72" cy="38" r="6" fill="#9EDDB9"/><circle cx="27" cy="57" r="7" fill="#A9D2F5"/><circle cx="43" cy="72" r="6" fill="#C9B6F2"/></g>`,

  guitar: `<g transform="rotate(35 50 50)">
    <rect x="46" y="6" width="8" height="44" fill="#C49373" ${st('#9A6A4F', 2.5)}/>
    <rect x="43" y="1" width="14" height="10" rx="3" fill="#9A6A4F"/>
    <path d="M50 44 C62 44 66 52 62 58 C74 60 76 76 68 84 C60 92 40 92 32 84 C24 76 26 60 38 58 C34 52 38 44 50 44 Z" fill="#FFB27A" ${st('#E5864A')}/>
    <circle cx="50" cy="67" r="6.5" fill="#6E5263"/>
    <rect x="42" y="78" width="16" height="4" rx="2" fill="#9A6A4F"/>
    <path d="M48.5 8 L48.5 80 M51.5 8 L51.5 80" stroke="#fff" stroke-width="1"/></g>`,

  camera: `<rect x="20" y="22" width="11" height="8" rx="2" fill="#AE96E8"/>
    <path d="M32 31 L38 19 L62 19 L68 31 Z" fill="#FFC9DC" ${st('#EE87AB', 3.5)}/>
    <rect x="12" y="30" width="76" height="54" rx="12" fill="#FFC9DC" ${st('#EE87AB')}/>
    <circle cx="50" cy="57" r="18" fill="#fff" ${st('#EE87AB')}/>
    <circle cx="50" cy="57" r="11" fill="#6E5263"/><circle cx="46" cy="53" r="3" fill="#fff"/>
    <rect x="70" y="36" width="11" height="6" rx="2" fill="#FFE59A"/>`,

  books: `<rect x="14" y="68" width="70" height="16" rx="3" fill="#C3E1FF" ${st('#86BDEB', 3.5)}/>
    <rect x="22" y="52" width="62" height="16" rx="3" fill="#FFC9DC" ${st('#EE87AB', 3.5)}/>
    <g transform="rotate(-5 48 42)"><rect x="17" y="35" width="64" height="16" rx="3" fill="#BDEBD5" ${st('#7CCFAA', 3.5)}/>
      <rect x="27" y="41" width="22" height="4" rx="2" fill="#fff" opacity=".75"/></g>
    <path d="M74 52 L74 78" ${st('#fff', 2)} opacity=".8"/>
    <path d="M60 24 C54 20 51 16 53 13 C55 10 58 11 60 14 C62 11 65 10 67 13 C69 16 66 20 60 24 Z" fill="#F290B5" ${st('#E0709A', 2)}/>
    ${face(52, 59, 0.7)}`,

  yarn: `<circle cx="44" cy="58" r="28" fill="#D9CBFF" ${st('#AE96E8')}/>
    <path d="M22 46 C34 40 54 42 67 52 M18 60 C32 52 56 54 71 64 M24 74 C36 66 54 68 64 79 M40 31 C34 44 34 66 44 85" fill="none" stroke="#AE96E8" stroke-width="2.5" stroke-linecap="round" opacity=".85"/>
    <path d="M70 68 C80 72 84 82 92 80" fill="none" ${st('#AE96E8', 3)}/>
    <path d="M30 28 L84 12 M40 22 L90 24" ${st('#C49373', 4)}/>
    <circle cx="84" cy="12" r="3.5" fill="#FFC2D8"/><circle cx="90" cy="24" r="3.5" fill="#FFE59A"/>`,

  gamepad: `<path d="M28 34 L72 34 C84 34 92 46 92 62 C92 76 84 82 76 76 L66 68 L34 68 L24 76 C16 82 8 76 8 62 C8 46 16 34 28 34 Z" fill="#C9B6F2" ${st('#AE96E8')}/>
    <rect x="18" y="48" width="18" height="6" rx="2" fill="#6E5263"/><rect x="24" y="42" width="6" height="18" rx="2" fill="#6E5263"/>
    <circle cx="72" cy="44" r="4" fill="#FF9EB5"/><circle cx="80" cy="51" r="4" fill="#9EDDB9"/><circle cx="64" cy="51" r="4" fill="#A9D2F5"/><circle cx="72" cy="58" r="4" fill="#FFE59A"/>
    ${face(48, 51, 0.65)}`,

  headphones: `<path d="M19 60 C19 24 81 24 81 60" fill="none" ${st('#F290B5', 7)}/>
    <rect x="9" y="52" width="19" height="31" rx="8" fill="#FFC9DC" ${st('#EE87AB')}/>
    <rect x="72" y="52" width="19" height="31" rx="8" fill="#FFC9DC" ${st('#EE87AB')}/>
    <path d="M45 62 L45 42 L60 38 L60 58" fill="none" ${st('#AE96E8', 3)}/>
    <circle cx="41.5" cy="62" r="4.5" fill="#AE96E8"/><circle cx="56.5" cy="58" r="4.5" fill="#AE96E8"/>`,

  puzzle: `<path d="M22 30 L41 30 C39 22 43 15 50 15 C57 15 61 22 59 30 L78 30 L78 48 C86 46 92 50 92 57 C92 64 86 68 78 66 L78 84 L59 84 C61 76 57 71 50 71 C43 71 39 76 41 84 L22 84 Z" fill="#BDEBD5" ${st('#7CCFAA')}/>
    ${face(50, 52)}`,

  clapper: `<g transform="rotate(-14 14 38)"><rect x="14" y="26" width="72" height="12" rx="3" fill="#fff" ${st('#6E5263', 3)}/>
      ${[0, 1, 2, 3, 4].map(i => `<path d="M${22 + i * 14} 26 L${30 + i * 14} 26 L${24 + i * 14} 38 L${16 + i * 14} 38 Z" fill="#6E5263"/>`).join('')}</g>
    <rect x="14" y="40" width="72" height="46" rx="6" fill="#6E5263" ${st('#4E3A47', 3)}/>
    <rect x="14" y="40" width="72" height="11" fill="#fff" ${st('#6E5263', 3)}/>
    ${[0, 1, 2, 3, 4].map(i => `<path d="M${20 + i * 14} 40 L${28 + i * 14} 40 L${22 + i * 14} 51 L${14 + i * 14} 51 Z" fill="#6E5263"/>`).join('')}
    <rect x="22" y="60" width="30" height="4" rx="2" fill="#FFC9DC"/><rect x="22" y="70" width="20" height="4" rx="2" fill="#C3E1FF"/>
    <path d="M70 78 C63 73 60 69 62 66 C64 63 68 64 70 67 C72 64 76 63 78 66 C80 69 77 73 70 78 Z" fill="#F290B5"/>`,
};

// Washi tape patterns (pattern ids are safe to repeat — each tape is its own image).
const WASHI = {
  pink: { base: '#FFE3EE', pat: '<pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="#FFC2D8"/></pattern>' },
  mint: { base: '#E3F7EC', pat: '<pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="3" fill="#A8E2C4"/></pattern>' },
  lavender: { base: '#F0E9FF', pat: '<pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="16" fill="#D9CBFF" opacity=".6"/><rect width="16" height="8" fill="#D9CBFF" opacity=".6"/></pattern>' },
  butter: { base: '#FFF5D1', pat: '<pattern id="p" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M11 16 C6 13 4 10 5.5 7.5 C7 5 10 5.5 11 8 C12 5.5 15 5 16.5 7.5 C18 10 16 13 11 16 Z" fill="#FFD66E"/></pattern>' },
  sky: { base: '#E4F2FF', pat: '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M12 5 L13.5 10.5 L19 12 L13.5 13.5 L12 19 L10.5 13.5 L5 12 L10.5 10.5 Z" fill="#A9D2F5"/></pattern>' },
  peach: { base: '#FFE9DC', pat: '<pattern id="p" width="20" height="56" patternUnits="userSpaceOnUse"><rect width="10" height="56" fill="#FFD2B8"/></pattern>' },
};
const WASHI_EDGE = 'M4 4 L196 4 L192 10 L197 16 L192 22 L197 28 L192 34 L197 40 L192 46 L196 52 L4 52 L8 46 L3 40 L8 34 L3 28 L8 22 L3 16 L8 10 Z';

const WORDS = [
  ['pink', 'you got this!'], ['lavender', 'self care'], ['mint', 'rest day'], ['peach', 'proud of you'],
  ['sky', 'breathe'], ['butter', 'yay!'], ['coral', 'love you'], ['lavender', 'me time'],
  ['sky', 'drink water'], ['sage', 'slow down'], ['pink', "today's focus"], ['peach', 'cozy night'],
  ['coral', 'date night'], ['mint', 'be gentle'], ['butter', 'little wins'], ['lavender', 'nap time'],
  ['pink', 'hug me'], ['sage', 'one step at a time'],
];

const EMOJI = ['🌷', '🌸', '🌼', '🌻', '🌈', '☀️', '🌙', '⭐', '✨', '☁️', '🍓', '🍑', '🍒', '🧁', '🍰', '🍵',
  '☕', '🧋', '🍪', '🐻', '🐰', '🐱', '🐶', '🐥', '🦋', '🐝', '🐌', '🍄', '🌿', '🍀', '🎀', '💌', '💗', '💖',
  '💕', '💞', '🫶', '🧸', '🎈', '🕯️', '🛁', '📚', '🎧', '🎨', '🧶', '✏️', '📌', '⏰', '💤', '🧘', '🚶', '🥗',
  '💧', '🫧', '🛌', '🎮', '🎬', '🌊', '🎉', '🏡'];

// 'ours' is filled in by the sticker drawer with your own photo stickers.
export const CATEGORIES = [
  { id: 'ours', label: 'Ours', icon: '✨', items: [] },
  { id: 'cute', label: 'Cute', icon: '🐰', items: ['heart', 'star', 'sparkles', 'cloud', 'bunny', 'bear', 'cat', 'bee', 'butterfly', 'mochi'].map(k => 'svg:' + k) },
  { id: 'nature', label: 'Nature', icon: '🌷', items: ['sun', 'moon', 'rainbow', 'daisy', 'tulip', 'blossom', 'clover', 'sprout', 'mushroom', 'drop'].map(k => 'svg:' + k) },
  { id: 'cozy', label: 'Cozy', icon: '☕', items: ['latte', 'boba', 'strawberry', 'cupcake', 'candle', 'letter', 'bow', 'check', 'bubble', 'clip'].map(k => 'svg:' + k) },
  { id: 'chores', label: 'Chores', icon: '🧺', items: ['broom', 'laundry', 'washer', 'spray', 'sponge', 'wateringcan', 'iron', 'groceries', 'bucket'].map(k => 'svg:' + k) },
  { id: 'sports', label: 'Sports', icon: '⚽', items: ['soccer', 'basketball', 'tennis', 'dumbbell', 'sneaker', 'bicycle', 'yogamat', 'trophy', 'medal'].map(k => 'svg:' + k) },
  { id: 'hobbies', label: 'Hobbies', icon: '🎨', items: ['palette', 'guitar', 'camera', 'books', 'yarn', 'gamepad', 'headphones', 'puzzle', 'clapper'].map(k => 'svg:' + k) },
  { id: 'washi', label: 'Washi', icon: '🎀', items: Object.keys(WASHI).map(k => 'washi:' + k) },
  { id: 'words', label: 'Words', icon: '💬', items: ['custom', ...WORDS.map(([c, t]) => `word:${c}:${t}`)] },
  { id: 'emoji', label: 'Emoji', icon: '😊', items: EMOJI.map(e => 'emoji:' + e) },
];

const uriCache = new Map();
function svgUri(name) {
  if (!uriCache.has(name)) {
    let svg;
    if (name.startsWith('washi:')) {
      const w = WASHI[name.slice(6)] || WASHI.pink;
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 56"><defs>${w.pat}</defs><path d="${WASHI_EDGE}" fill="${w.base}"/><path d="${WASHI_EDGE}" fill="url(#p)"/><path d="M6 9 L194 9" stroke="#fff" stroke-opacity=".55" stroke-width="2"/></svg>`;
    } else {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${SVG[name] || SVG.heart}</svg>`;
    }
    uriCache.set(name, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ')));
  }
  return uriCache.get(name);
}

export const stickerKind = k => k.slice(0, k.indexOf(':'));

/** The image address of a drawn sticker, e.g. stickerSrc("clip"). */
export const stickerSrc = name => svgUri(name);

export function defaultSize(k) {
  return { svg: 76, washi: 150, word: 84, emoji: 56, custom: 96 }[stickerKind(k)] || 72;
}

// Photo stickers ("custom:<slot>:<id>") live in each person's sticker box;
// custom.js tells us how to find them.
let resolveCustom = () => null;
export function setCustomResolver(fn) { resolveCustom = fn; }

// Inner markup for a sticker; its size comes from the `--s` custom property
// on the wrapper, so resizing never re-creates the image.
export function stickerInner(k) {
  const kind = stickerKind(k);
  const rest = k.slice(kind.length + 1);
  if (kind === 'svg') return `<img class="stk-img" src="${svgUri(rest)}" alt="" draggable="false">`;
  if (kind === 'washi') return `<img class="stk-img" style="--a:.28" src="${svgUri(k)}" alt="" draggable="false">`;
  if (kind === 'emoji') return `<span class="stk-emoji">${esc(rest)}</span>`;
  if (kind === 'word') {
    const i = rest.indexOf(':');
    return `<span class="stk-word" style="${colorVars(rest.slice(0, i))}">${esc(rest.slice(i + 1))}</span>`;
  }
  if (kind === 'custom') {
    const [slot, id] = rest.split(':');
    const item = resolveCustom(slot, id);
    return item
      ? `<img class="stk-img stk-photo${item.shape ? ' shaped' : ''}" style="--a:${item.a}" src="${item.src}" alt="" draggable="false">`
      : '<span class="stk-missing" title="This sticker was removed">🖼️</span>';
  }
  return '';
}

export function wordKey(text, color) { return `word:${color}:${text}`; }
