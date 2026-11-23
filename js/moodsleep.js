// Mood, sleep, tiredness, brain space and spoons, from Human Being's check-ins. You log
// them in Human Being; Human Doing only reads them (yours and your person's,
// as Human Being already shows you each other's check-ins), for the month
// view's chips and tallies (month.js) and this year page.
//
// A check-in (Human Being's checkins / checkins-YYYY documents):
//   { "YYYY-MM-DD": { moods: [mood ids], mood: <the first>, sleep: 1–10, tired: 1–10,
//                     rating: 1–10 (brain space), spoons: 1–10, … } }
// Which ones show is yours to pick, in your tracker list ("From Human
// Being"): settings.trackers.hb = { mood, sleep, tired, brain, spoons } (mood,
// sleep and tiredness to start with). They can't be shared from here, and aren't cards on
// the day view.

import * as store from './store.js';
import { colorVars, dayKey, esc } from './util.js';
import { readSettings } from './docs.js';
import { checkinMoodIds, moodImg, moodOf } from './moods.js';
import { stickerSrc } from './stickers.js';

export const HB = [
  { id: 'hb-mood', key: 'mood', field: 'mood', name: 'Mood', chip: '🙂 Mood', color: 'butter', desc: 'the face you pick in your check-in' },
  { id: 'hb-sleep', key: 'sleep', field: 'sleep', name: 'Sleep', chip: '🌙 Sleep', color: 'lavender', desc: 'your 1–10 sleep rating' },
  { id: 'hb-tired', key: 'tired', field: 'tired', name: 'Tiredness', chip: '🥱 Tiredness', color: 'sky', desc: 'how tired you are, 1–10' },
  { id: 'hb-brain', key: 'brain', field: 'rating', name: 'Brain space', chip: '🧠 Brain space', color: 'mint', desc: 'how much is on your mind, 1–10' },
  { id: 'hb-spoons', key: 'spoons', field: 'spoons', name: 'Spoons', chip: '🥄 Spoons', color: 'peach', desc: 'how much energy you have, 1–10' },
].map(h => ({ ...h, hb: true }));
const HB_DEFAULT = { mood: true, sleep: true, tired: true, brain: false, spoons: false };
const hbBy = key => HB.find(h => h.key === key);

/** Which of them you've switched on: { mood, sleep, tired, brain, spoons }. */
export const hbOn = (s = readSettings()) => ({ ...HB_DEFAULT, ...(s.trackers.hb || {}) });
/** The ones switched on, as tracker-like definitions for the month view. */
export const hbList = (s = readSettings()) => HB.filter(h => hbOn(s)[h.key]);
export const hbDef = id => HB.find(h => h.id === id) || null;

/** Someone's check-ins: { "YYYY-MM-DD": check-in } (the yearly archives, then the last few weeks). */
export function readCheckins(slot) {
  const docs = store.hbCheckinDocs();
  const out = {};
  for (const doc of [...docs.slice(1), docs[0]]) Object.assign(out, store.read(store.hbKey(slot, doc), null) || {});
  return out;
}

/** A check-in value's icon (the face for mood). */
export function hbIcon(h, cls = 'tk-ico') {
  switch (h.key) {
    case 'mood': return moodImg('happy', cls);
    case 'sleep': return `<img class="${cls}" src="${stickerSrc('moon')}" alt="" draggable="false">`;
    case 'tired': return `<span class="${cls}" aria-hidden="true">🥱</span>`;
    case 'brain': return `<span class="${cls}" aria-hidden="true">🧠</span>`;
    default: return `<span class="${cls}" aria-hidden="true">🥄</span>`;
  }
}

/** "from Human Being", with its icon. */
export const hbPill = '<span class="from-hb"><img src="icons/hb-icon.svg" alt="">Human Being</span>';

// Each mood's colour on the year's squares (the face's outline).
export const MOOD_COLOR = {
  happy: '#EDC45A', love: '#EE87AB', kiss: '#F29BBB', calm: '#7CCFAA', okay: '#86BDEB', sad: '#6FA8D8', sleepy: '#AE96E8',
  excited: '#F2A94A', silly: '#F4A47C', shy: '#F5B3CB', unsure: '#C3B3EC', anxious: '#9FC0E8', cry: '#5C93C8', grumpy: '#E9706A',
  sick: '#9EC07F', dizzy: '#9A82D8',
};

// ── The year page ─────────────────────────────────────────────────────────
const MONTH_LETTERS = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'narrow' }));
const monthLong = m => new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'long' });
const pad = n => String(n).padStart(2, '0');
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const one = n => String(Math.round(n * 10) / 10);
const card = (color, icon, title, inner, meta = '') => `<article class="card tk" style="${colorVars(color)}"><div class="card-tape"></div>
  <div class="tk-head">${icon}<h3>${esc(title)}</h3>${meta ? `<span class="tk-meta">${esc(meta)}</span>` : ''}</div>${inner}</article>`;

/**
 * The year of check-ins, opened from a check-in tally ("The whole year ›").
 * onBack() closes it.
 */
export function createMoodSleep(el, { onBack }) {
  let year = new Date().getFullYear();
  let who = 'me';

  function render() {
    const them = store.readPartner('profile', null);
    if (!them) who = 'me';
    const slot = who === 'me' ? store.me() : store.partner();
    const ci = readCheckins(slot);
    const on = hbOn();
    const today = dayKey();
    const days = Object.keys(ci).filter(k => k.startsWith(`${year}-`) && k <= today).sort();
    const val = (k, field) => (ci[k] || {})[field];
    const byMonth = field => Array.from({ length: 12 }, (_, m) => days.filter(k => +k.slice(5, 7) === m + 1).map(k => val(k, field)).filter(v => typeof v === 'number' && v > 0));
    const bars = (field, hitAt) => {
      const months = byMonth(field);
      return `<div class="mini-bars">${months.map((xs, m) => `<div class="mb" title="${esc(monthLong(m))}: ${xs.length ? one(avg(xs)) : '—'}"><i class="${xs.length && avg(xs) >= hitAt ? 'hit' : ''}" style="--h:${xs.length ? avg(xs) / 10 : 0}"></i><span>${MONTH_LETTERS[m]}</span></div>`).join('')}</div>`;
    };
    const whose = who === 'me' ? 'your' : `${esc(them.name)}'s`;
    let cards = '';
    if (on.mood) {
      const count = {};
      let grid = '';
      for (let m = 0; m < 12; m++) {
        grid += `<b>${MONTH_LETTERS[m]}</b>`;
        const len = new Date(year, m + 1, 0).getDate();
        for (let d = 1; d <= 31; d++) {
          const k = `${year}-${pad(m + 1)}-${pad(d)}`;
          const picked = d <= len && k <= today ? checkinMoodIds(ci[k]) : [];
          const mood = picked.length ? moodOf(picked[0]) : null;
          for (const id of picked) count[id] = (count[id] || 0) + 1;
          grid += `<i${d > len ? ' class="none"' : ''}${mood ? ` style="background:${MOOD_COLOR[mood.id] || '#ccc'}" title="${esc(k)}: ${esc(picked.map(id => moodOf(id).label).join(', '))}"` : ''}></i>`;
        }
      }
      const top = Object.entries(count).sort((a, b) => b[1] - a[1]);
      const logged = days.filter(k => checkinMoodIds(ci[k]).length).length;
      cards += card('butter', moodImg('happy', 'tk-ico'), 'A year of moods', `<div class="yr">${grid}</div>
        ${top.length ? `<div class="yr-key">${top.slice(0, 8).map(([id, n]) => `<span><i style="background:${MOOD_COLOR[id]}"></i>${esc(moodOf(id).label.toLowerCase())} ${n}</span>`).join('')}</div>` : '<p class="muted small">No moods in these check-ins yet.</p>'}`,
      logged ? `${logged} day${logged === 1 ? '' : 's'}` : '');
      // The mood that came up most each month.
      const faces = Array.from({ length: 12 }, (_, m) => {
        const c = {};
        for (const k of days) if (+k.slice(5, 7) === m + 1) for (const id of checkinMoodIds(ci[k])) c[id] = (c[id] || 0) + 1;
        const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
        return `<div${best ? '' : ' class="none"'}>${best ? moodImg(best[0], '') : '·<br>'}${MONTH_LETTERS[m]}</div>`;
      }).join('');
      if (top.length) cards += card('butter', moodImg('calm', 'tk-ico'), 'Most often, month by month', `<div class="yr-faces">${faces}</div>`);
    }
    if (on.sleep) {
      const months = byMonth('sleep');
      const avgs = months.map(xs => (xs.length ? avg(xs) : null));
      const got = avgs.map((a, m) => [a, m]).filter(([a]) => a != null);
      const best = got.length ? got.reduce((x, y) => (y[0] > x[0] ? y : x)) : null;
      const worst = got.length ? got.reduce((x, y) => (y[0] < x[0] ? y : x)) : null;
      cards += card('lavender', hbIcon(hbBy('sleep')), 'Sleep, month by month', got.length ? `${bars('sleep', 7)}
        <div class="tk-foot">Average rating each month${got.length > 1 ? ` · best: ${esc(monthLong(best[1]))} (${one(best[0])}) · roughest: ${esc(monthLong(worst[1]))} (${one(worst[0])})` : ''} ${hbPill}</div>`
        : '<p class="muted small">No sleep ratings in these check-ins yet.</p>');
    }
    if (on.tired) {
      const avgs = byMonth('tired').map(xs => (xs.length ? avg(xs) : null));
      const got = avgs.map((a, m) => [a, m]).filter(([a]) => a != null);
      const most = got.length ? got.reduce((x, y) => (y[0] > x[0] ? y : x)) : null;
      const least = got.length ? got.reduce((x, y) => (y[0] < x[0] ? y : x)) : null;
      cards += card('sky', hbIcon(hbBy('tired')), 'Tiredness, month by month', got.length ? `${bars('tired', 7)}
        <div class="tk-foot">Average each month, 1–10${got.length > 1 ? ` · most tired: ${esc(monthLong(most[1]))} (${one(most[0])}) · most rested: ${esc(monthLong(least[1]))} (${one(least[0])})` : ''} ${hbPill}</div>`
        : '<p class="muted small">No tiredness ratings in these check-ins yet.</p>');
    }
    if (on.brain || on.spoons) {
      const rows = [on.brain ? ['🧠', bars('rating', 7)] : null, on.spoons ? ['🥄', bars('spoons', 7)] : null].filter(Boolean);
      cards += card('peach', hbIcon(hbBy(on.spoons ? 'spoons' : 'brain')), [on.brain ? 'Brain space' : '', on.spoons ? 'spoons' : ''].filter(Boolean).join(' and ').replace(/^s/, 'S'),
        `<div class="duo-bars">${rows.map(([e, b]) => `<span>${e}</span>${b}`).join('')}</div>
        <div class="tk-foot">Average each month, 1–10 ${hbPill}</div>`);
    }
    if (!cards) cards = '<p class="muted small">Switch on mood, sleep, tiredness, brain space or spoons under "From Human Being" in your tracker list.</p>';
    el.innerHTML = `
      <div class="sub-head"><button type="button" class="icon-btn" data-hb-back aria-label="Back">‹</button><h1>From Human Being</h1><span class="muted">${year}</span></div>
      <div class="row-segs">
        ${them ? `<div class="seg" style="${colorVars('pink')}"><button type="button" data-hb-who="me" class="${who === 'me' ? 'on' : ''}">Mine</button><button type="button" data-hb-who="them" class="${who === 'them' ? 'on' : ''}">${esc(them.name)}'s</button></div>` : '<span></span>'}
        <div class="seg" style="${colorVars('pink')}"><button type="button" data-hb-year="-1" aria-label="Year before">‹</button><button type="button" class="on" disabled>${year}</button><button type="button" data-hb-year="1" aria-label="Year after"${year >= new Date().getFullYear() ? ' disabled' : ''}>›</button></div>
      </div>
      ${days.length ? '' : `<p class="muted small hb-none">No Human Being check-ins from ${who === 'me' ? 'you' : esc(them.name)} in ${year}.</p>`}
      ${cards}
      <p class="note-sm">From ${whose} check-ins in Human Being, where you log them. Human Doing only reads them.</p>`;
  }

  el.addEventListener('click', e => {
    if (e.target.closest('[data-hb-back]')) { onBack(); return; }
    const w = e.target.closest('[data-hb-who]');
    if (w) { who = w.dataset.hbWho; render(); return; }
    const y = e.target.closest('[data-hb-year]');
    if (y && !y.disabled) { year += Number(y.dataset.hbYear); render(); }
  });

  return {
    render,
    /** Opens on this year, and whose month it came from. */
    reset(from = 'me') { year = new Date().getFullYear(); who = from; },
  };
}

