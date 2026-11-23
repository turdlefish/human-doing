// Mood stickers for the daily check-in: little kawaii faces.
// The first row is shown by default; '+' reveals the rest.

const INK = '#5B3F52';
const st = (c, w = 4) => `stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const base = (fill, line) => `<circle cx="50" cy="52" r="40" fill="${fill}" ${st(line)}/>`;
const blush = (o = 0.55) => `<ellipse cx="27" cy="60" rx="6.5" ry="3.8" fill="#FF8FB3" opacity="${o}"/><ellipse cx="73" cy="60" rx="6.5" ry="3.8" fill="#FF8FB3" opacity="${o}"/>`;
const dotEyes = (y = 47, gap = 13, r = 4.2) => `<circle cx="${50 - gap}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${50 + gap}" cy="${y}" r="${r}" fill="${INK}"/>`
  + `<circle cx="${50 - gap + 1.4}" cy="${y - 1.5}" r="1.4" fill="#fff"/><circle cx="${50 + gap + 1.4}" cy="${y - 1.5}" r="1.4" fill="#fff"/>`;
const oneEye = (cx, y) => `<circle cx="${cx}" cy="${y}" r="4.2" fill="${INK}"/><circle cx="${cx + 1.4}" cy="${y - 1.5}" r="1.4" fill="#fff"/>`;
const arcEye = (cx, y, up) => `<path d="M${cx - 6} ${y} q6 ${up ? -7 : 6} 12 0" fill="none" ${st(INK, 3.2)}/>`;
const heart = (cx, cy, s, fill) => `<path d="M${cx} ${cy + 5 * s} C${cx - 7 * s} ${cy} ${cx - 6 * s} ${cy - 6 * s} ${cx} ${cy - 3 * s} C${cx + 6 * s} ${cy - 6 * s} ${cx + 7 * s} ${cy} ${cx} ${cy + 5 * s} Z" fill="${fill}"/>`;
const star = (cx, cy, r, fill) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    p.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1));
  }
  return `<polygon points="${p.join(' ')}" fill="${fill}" ${st(fill, 1.5)}/>`;
};
const smile = `<path d="M42 61 q8 8 16 0" fill="none" ${st(INK, 3.2)}/>`;
const bigSmile = `<path d="M38 58 Q50 76 62 58 Z" fill="${INK}" ${st(INK, 2.5)}/><path d="M44 66 Q50 71 56 66 Q50 63 44 66 Z" fill="#FF8FB3"/>`;
const frown = `<path d="M42 68 q8 -8 16 0" fill="none" ${st(INK, 3.2)}/>`;
const wavy = `<path d="M38 65 q6 -5 12 0 q6 5 12 0" fill="none" ${st(INK, 3)}/>`;

export const MOODS = [
  { id: 'happy', label: 'Happy', svg: base('#FFE59A', '#EDC45A') + arcEye(37, 48, true) + arcEye(63, 48, true) + bigSmile + blush() },
  { id: 'love', label: 'Loved', svg: base('#FFC2D6', '#EE87AB') + heart(37, 46, 1.2, '#F0507F') + heart(63, 46, 1.2, '#F0507F') + smile + blush(0.4) },
  { id: 'kiss', label: 'Kissy', svg: base('#FFCFD9', '#EE87AB') + arcEye(37, 47, false) + oneEye(63, 47)
      + `<path d="M50 58 q7 2 1 5 q7 3 -1 6" fill="none" ${st(INK, 3)}/>` + heart(78, 30, 1, '#F290B5') + blush() },
  { id: 'calm', label: 'Calm', svg: base('#BDEBD5', '#7CCFAA') + arcEye(37, 47, false) + arcEye(63, 47, false) + smile + blush() },
  { id: 'okay', label: 'Okay', svg: base('#C3E1FF', '#86BDEB') + dotEyes() + `<path d="M43 63 L57 63" ${st(INK, 3.2)}/>` + blush(0.4) },
  { id: 'sad', label: 'Sad', svg: base('#A9D2F5', '#6FA8D8') + dotEyes(49) + `<path d="M30 38 L42 34 M70 38 L58 34" ${st(INK, 3)}/>` + frown },
  { id: 'sleepy', label: 'Sleepy', svg: base('#D9CBFF', '#AE96E8') + `<path d="M31 49 q6 3 12 0 M57 49 q6 3 12 0" fill="none" ${st(INK, 3.2)}/>`
      + `<circle cx="50" cy="64" r="3.6" fill="${INK}"/>` + `<path d="M70 14 h8 l-8 9 h8 M82 26 h5 l-5 6 h5" fill="none" ${st('#7E66C9', 2.6)}/>` + blush(0.4) },
  { id: 'excited', label: 'Excited', svg: base('#FFE89E', '#EDC45A') + star(37, 46, 7, '#F2A94A') + star(63, 46, 7, '#F2A94A') + bigSmile + blush() },
  { id: 'silly', label: 'Silly', svg: base('#FFD0B5', '#F4A47C') + arcEye(37, 47, true) + oneEye(63, 47)
      + `<path d="M40 60 q10 6 20 0" fill="none" ${st(INK, 3.2)}/><path d="M50 62 q0 10 6 10 q6 0 6 -10" fill="#FF8FB3" ${st('#E36B8A', 2.4)}/>` + blush() },
  { id: 'shy', label: 'Shy', svg: base('#FFD3E2', '#F29BBB') + dotEyes(52, 12, 3.6) + `<path d="M31 42 q6 -3 12 0 M57 42 q6 -3 12 0" fill="none" ${st(INK, 2.4)}/>`
      + `<path d="M46 64 q4 3 8 0" fill="none" ${st(INK, 2.8)}/>` + blush(0.8)
      + `<path d="M22 57 l3 -4 M27 58 l3 -4 M70 57 l3 -4 M75 58 l3 -4" ${st('#F290B5', 2)}/>` },
  { id: 'unsure', label: 'Unsure', svg: base('#E2D6FF', '#AE96E8') + dotEyes() + `<path d="M56 34 q8 -5 14 0" fill="none" ${st(INK, 3)}/>` + wavy },
  { id: 'anxious', label: 'Anxious', svg: base('#DCEBFF', '#86BDEB')
      + `<circle cx="37" cy="47" r="7" fill="#fff" ${st(INK, 2.4)}/><circle cx="63" cy="47" r="7" fill="#fff" ${st(INK, 2.4)}/><circle cx="37" cy="48" r="2.8" fill="${INK}"/><circle cx="63" cy="48" r="2.8" fill="${INK}"/>`
      + wavy + `<path d="M80 26 c4 6 4 9 0 10 c-4 -1 -4 -4 0 -10 Z" fill="#9FD0F5" ${st('#6FA8D8', 1.8)}/>` },
  { id: 'cry', label: 'Teary', svg: base('#B9DCF7', '#6FA8D8') + arcEye(37, 48, true) + arcEye(63, 48, true)
      + `<path d="M33 53 c-2 8 -2 14 1 18 c3 -4 3 -10 -1 -18 Z M67 53 c2 8 2 14 -1 18 c-3 -4 -3 -10 1 -18 Z" fill="#7FC1F0"/>`
      + `<path d="M43 68 q7 -7 14 0 Z" fill="${INK}" ${st(INK, 2.5)}/>` },
  { id: 'grumpy', label: 'Grumpy', svg: base('#FFB3AA', '#E9706A') + dotEyes(49) + `<path d="M28 36 L42 41 M72 36 L58 41" ${st(INK, 3.2)}/>` + frown
      + `<path d="M80 30 l6 -3 M82 37 l7 0" ${st('#E9706A', 2.4)}/>` },
  // The same face as Human Being's: a face mask (it had a thermometer that read as a cigarette).
  { id: 'sick', label: 'Unwell', svg: base('#D2E3BF', '#9EC07F')
      + `<path d="M30 45 L44 45 M56 45 L70 45" ${st(INK, 3)}/>`
      + `<circle cx="37" cy="49" r="2.6" fill="${INK}"/><circle cx="63" cy="49" r="2.6" fill="${INK}"/>`
      + `<path d="M31 37 L42 34 M69 37 L58 34" ${st(INK, 2.6)}/>`
      + `<path d="M31 58 Q20 56 14 49 M69 58 Q80 56 86 49" fill="none" ${st('#86BDEB', 2.2)}/>`
      + `<path d="M30 58 Q50 52 70 58 L68 72 Q50 80 32 72 Z" fill="#EAF5FF" ${st('#86BDEB', 2.4)}/>`
      + `<path d="M35 62 Q50 58 65 62 M35 67 Q50 64 65 67" fill="none" ${st('#A9CFEF', 1.6)}/>`
      + `<path d="M80 25 c4 6 4 9 0 10 c-4 -1 -4 -4 0 -10 Z" fill="#9FD0F5" ${st('#6FA8D8', 1.8)}/>` },
  { id: 'dizzy', label: 'Overwhelmed', svg: base('#C9B6F2', '#9A82D8')
      + `<path d="M37 47 m0 -1 a1.5 1.5 0 1 1 1.5 2 a3.5 3.5 0 1 1 -4.5 -4 a5.5 5.5 0 1 1 7 6.5 M63 47 m0 -1 a1.5 1.5 0 1 1 1.5 2 a3.5 3.5 0 1 1 -4.5 -4 a5.5 5.5 0 1 1 7 6.5" fill="none" ${st(INK, 2.4)}/>`
      + wavy },
];

export const FIRST_ROW = 6;
const byId = Object.fromEntries(MOODS.map(m => [m.id, m]));
// Earlier check-ins stored an emoji; show the matching sticker.
const FROM_EMOJI = { '🥰': 'love', '😊': 'happy', '😌': 'calm', '😐': 'okay', '😕': 'unsure', '😔': 'sad', '😣': 'anxious', '😤': 'grumpy', '😴': 'sleepy', '🥺': 'shy' };
export const moodOf = id => byId[id] || byId[FROM_EMOJI[id]] || null;

/**
 * The sticker moods in a Human Being check-in, in the order they were picked.
 * Since Human Being 1.1 a check-in can hold several: { moods: [ids…], mood: the
 * first }. Moods someone made themselves (ids "own-…") aren't shown here.
 */
export function checkinMoodIds(c) {
  const ids = c && Array.isArray(c.moods) ? c.moods : c && c.mood ? [c.mood] : [];
  const out = [];
  for (const id of ids) {
    const m = moodOf(id);
    if (m && !out.includes(m.id)) out.push(m.id);
  }
  return out;
}

const cache = new Map();
export function moodUri(id) {
  const m = moodOf(id);
  if (!m) return '';
  if (!cache.has(m.id)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${m.svg}</svg>`;
    cache.set(m.id, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/\s+/g, ' ')));
  }
  return cache.get(m.id);
}

export const moodImg = (id, cls = 'mood-img') => (moodOf(id) ? `<img class="${cls}" src="${moodUri(id)}" alt="${moodOf(id).label}" draggable="false">` : '');
