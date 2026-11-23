// Tracking, month view: a sticker calendar of your trackers. The chips pick
// which trackers show on it; the cycle's phases run along the bottom of each
// day (dashed where they're predicted); each month can be decorated with
// stickers, like a Plan month; and underneath, you pick which trackers get a
// monthly tally (Work to start with), separately from the calendar's chips.
//
// On your person's month you see only what they share, read-only, with the
// tallies you pick there.

import * as store from './store.js';
import { $, clamp, clone, colorVars, dayKey, esc, fmtDay, fmtTime, keyToDate, shiftDay, vibrate } from './util.js';
import { stickerSrc } from './stickers.js';
import { STICKER_ICON, createStickerLayer, tapAway, tray } from './sticker-ui.js';
import { BUILT_IN, builtInWork, monthOf, myWorkTypes, readMonth, readMonthStickers, readSettings, workTypes, writeMonthStickers, writeSettings } from './docs.js';
import { PHASES, cycleLevel, cycleOn, phasesBetween, symptomItems } from './cycle.js';
import { ownIcon } from './own.js';
import { totals, walkSettings } from './walk.js';
import { hbIcon, hbList, hbPill, readCheckins } from './moodsleep.js';
import { checkinMoodIds, moodImg, moodOf } from './moods.js';

const CHIP = { work: '💼 Work', cycle: '🩸 Cycle', water: '💧 Water', caffeine: '☕ Caffeine', meds: '💊 Meds', walk: '🚶 Walk' };
const TITLE = { work: 'Work', cycle: 'Cycle', water: 'Water', caffeine: 'Caffeine', meds: 'Medication', walk: 'Walk' };
const DEFAULT_SHOWN = ['work', 'cycle', 'hb-mood', 'hb-sleep'];
// Check-in tallies on to start with (until you hide them).
const tallyMine = (tally, id) => tally[id] ?? (id === 'hb-mood' || id === 'hb-sleep' || id === 'hb-tired');

// ── Small helpers ─────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const shiftMonth = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = ym => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const monthName = m => new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });
const num = n => String(Math.round(n * 100) / 100);
const short = n => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? Math.round(n / 100) / 10 + 'k' : num(n));
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
const count = v => (typeof v === 'number' ? v : (v && v.n) || 0);
const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const img = (name, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${stickerSrc(name)}" alt="" draggable="false">`;
const mini = (icon, n) => `<span class="tc-n">${icon}${esc(n)}</span>`;
const dayName = k => `${keyToDate(k).toLocaleDateString(undefined, { weekday: 'short' })} ${keyToDate(k).getDate()}`;
const shortDate = k => keyToDate(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const daysApart = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);
// An option's leading emoji ("🚶 Walk" → "🚶"), if it has one.
function lead(label) {
  const g = window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(label)][0]?.segment : Array.from(label)[0];
  return g && !/[\p{L}\p{N}\s]/u.test(g) ? g : '';
}

/** Days of month `ym` up to today: ["YYYY-MM-DD"]. */
function daysSoFar(ym) {
  const today = dayKey(), out = [];
  for (let k = `${ym}-01`; monthOf(k) === ym && k <= today; k = shiftDay(k, 1)) out.push(k);
  return out;
}

/**
 * Creates the month view in `el`. who() is 'me' or 'them'; onDay(k) opens a
 * day in the day view; iconFor(def) draws a tracker's icon; onWorkYear()
 * opens the work year.
 */
export function createMonth(el, { who, onDay, iconFor, onWorkYear, onHbYear }) {
  let ym = monthOf(dayKey());
  let themShown = null;    // which of your person's trackers show (this session only)
  let themTallies = null;  // and which of their tallies
  let decor = false;
  let pages = {};          // my month stickers: { "YYYY-MM": [sticker] }

  el.innerHTML = `
    <div class="month-nav tm-nav">
      <button type="button" class="icon-btn" data-mnav="-1" aria-label="Previous month">‹</button>
      <span class="mn-label" id="m-label"></span>
      <button type="button" class="icon-btn" data-mnav="1" aria-label="Next month">›</button>
      <button type="button" class="today-btn" data-mnav="0" hidden>↩ Today</button>
    </div>
    <div class="filters" id="m-chips" aria-label="Trackers on the calendar"></div>
    <div class="month tmonth" id="m-page">
      <div class="month-dow" id="m-dow"></div>
      <div class="month-grid" id="m-grid"></div>
      <div class="sticker-layer" id="m-stickers"></div>
    </div>
    <div class="phase-legend" id="m-legend">
      ${Object.values(PHASES).map(p => `<span><i style="background:${p.color}"></i>${esc(p.name.replace(' phase', ''))}</span>`).join('')}
      <span><i class="pred-key"></i>predicted</span>
    </div>
    <div id="m-tallies"></div>
    <div class="month-float"><button type="button" class="icon-btn sticker-btn" data-act="m-stickers" aria-label="Decorate this month with stickers">${STICKER_ICON}</button></div>`;
  const page = $('#m-page', el);
  const grid = $('#m-grid', el);

  // Mondays first, in the phone's language (1 Jan 2024 was a Monday).
  $('#m-dow', el).innerHTML = Array.from({ length: 7 }, (_, i) => `<span>${esc(new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }))}</span>`).join('');

  // ── which trackers ───────────────────────────────────────────────────────
  const mine = () => who() === 'me';
  const slot = () => (mine() ? store.me() : store.partner());

  // The trackers that can show: yours that are switched on, or the ones your
  // person shares; then mood, sleep, brain space and spoons from Human Being's
  // check-ins, the ones you've switched on (for your person's month too).
  const trackers = () => [...logged(), ...hbList()];
  function logged() {
    if (mine()) {
      const s = readSettings();
      const own = Object.fromEntries(s.trackers.own.map(d => [d.id, d]));
      return s.trackers.order.filter(id => s.trackers.on[id] && (CHIP[id] || own[id])).map(id => own[id] || BUILT_IN.find(b => b.id === id));
    }
    const shared = store.readPartner('shared', null) || { trackers: {}, cycle: 'none' };
    const level = cycleLevel(shared);
    // (Sleep or mood shared from an older version don't show any more.)
    const has = id => (id === 'cycle' ? level === 'phase' || level === 'all' : !!shared.trackers[id] && (!!CHIP[id] || !!shared.trackers[id].type));
    return [...new Set([...(shared.order || []), ...BUILT_IN.map(x => x.id), ...Object.keys(shared.trackers)])]
      .filter(has).map(id => ({ ...(BUILT_IN.find(b => b.id === id) || {}), ...(shared.trackers[id] || {}), id }));
  }
  function shownOf(list) {
    const ids = list.map(d => d.id);
    let pick = mine() ? readSettings().trackers.month : themShown;
    if (!Array.isArray(pick)) {
      pick = DEFAULT_SHOWN.filter(id => ids.includes(id));
      if (!pick.length) pick = ids.slice(0, 3);
    }
    return new Set(pick.filter(id => ids.includes(id)));
  }
  function toggleShown(id) {
    const list = trackers();
    const shown = shownOf(list);
    if (shown.has(id)) shown.delete(id); else shown.add(id);
    const next = list.map(d => d.id).filter(x => shown.has(x));
    if (!mine()) { themShown = next; return; }
    const s = readSettings();
    s.trackers.month = next;
    writeSettings(s);
  }
  // Which tallies show: yours are saved in settings.trackers.tally; on your
  // person's month they start from your picks and last this session.
  function talliesOn(list) {
    const mineOn = readSettings().trackers.tally;
    const ids = list.map(d => d.id);
    if (mine()) return new Set(ids.filter(id => tallyMine(mineOn, id)));
    if (!themTallies) themTallies = ids.filter(id => tallyMine(mineOn, id));
    return new Set(themTallies.filter(id => ids.includes(id)));
  }
  function setTally(id, on) {
    if (!mine()) {
      const cur = new Set(themTallies || []);
      if (on) cur.add(id); else cur.delete(id);
      themTallies = [...cur];
      return;
    }
    const s = readSettings();
    s.trackers.tally = { ...s.trackers.tally, [id]: on };
    writeSettings(s);
  }

  const chipLabel = d => (d.hb ? esc(d.chip) : CHIP[d.id]
    ? esc(CHIP[d.id])
    : `${d.sticker ? img(d.sticker) : esc(d.emoji || '✨')} ${esc(d.name)}`);

  // ── a day on the calendar ────────────────────────────────────────────────
  // Returns [stickers, line under them] for one tracker on one day.
  function bits(def, v, ctx) {
    if (def.hb) {
      // From the day's check-in: the face (the first mood picked), or the 1–10 rating.
      if (def.key === 'mood') return [moodOf(v) ? moodImg(v, '') : '', ''];
      const icon = { sleep: '🌙', tired: '🥱', brain: '🧠', spoons: '🥄' }[def.key];
      return [typeof v === 'number' && v > 0 ? `<span class="tc-sl" title="${esc(def.name)}: ${v}/10">${icon}${v}</span>` : '', ''];
    }
    if (def.id === 'cycle') {
      // A drop on period days: solid when it's been logged, faded when predicted.
      const ph = ctx.phases[ctx.k];
      if (!ph) return ['', ''];
      return [ph.bleed ? img('pdrop', 'pd') : ph.predicted && ph.phase === 'period' ? img('pdrop', 'pd pred') : '', ''];
    }
    if (v == null) return ['', ''];
    switch (def.id) {
      case 'work': {
        const picked = ctx.workTypes.filter(t => v[t.id] != null && t.id !== 'overtime');
        const worked = ctx.workTypes.filter(t => !t.leave && t.id !== 'overtime').reduce((n, t) => n + (v[t.id] || 0), 0);
        const stk = picked.slice(0, 2).map(t => `<span class="tc-w" title="${esc(t.label)}">${esc(t.emoji)}</span>`).join('')
          || (v.overtime != null ? '<span class="tc-w" title="Overtime">⏱️</span>' : '');
        const line = worked || v.overtime ? `<span class="tc-h">${worked ? num(worked) + 'h' : ''}${v.overtime ? ` <em>+${num(v.overtime)}</em>` : ''}</span>` : '';
        return [stk, line];
      }
      case 'water': return [count(v) ? mini(img('drop'), count(v)) : '', ''];
      case 'caffeine': return [count(v) ? mini(img('latte'), count(v)) : '', ''];
      case 'walk': { const n = totals(v).n; return [n ? mini(img('sneaker'), n) : '', '']; }
      case 'meds': {
        const sched = ctx.meds.filter(m => !m.asNeeded);
        const took = sched.filter(m => (v[m.id] || []).length).length;
        const prn = ctx.meds.filter(m => m.asNeeded).reduce((n, m) => n + (v[m.id] || []).length, 0);
        if (took) return [`<span class="tc-n" title="${took} of ${sched.length} taken">💊${took === sched.length ? '✓' : '½'}</span>`, ''];
        return [prn ? `<span class="tc-n" title="${prn} as needed">💊${prn}</span>` : '', ''];
      }
    }
    const icon = ownIcon(def, 'tc-own');
    switch (def.type) {
      case 'count': return [count(v) ? mini(icon, short(count(v))) : '', ''];
      case 'amount':
      case 'scale': return [typeof v === 'number' ? mini(icon, short(v)) : '', ''];
      case 'options': {
        const picked = (def.options || []).filter(o => (v.picked || []).includes(o.id));
        const marks = picked.map(o => lead(o.label)).filter(Boolean).slice(0, 2);
        return [picked.length || v.amount ? (marks.length ? marks.map(m => `<span class="tc-w">${esc(m)}</span>`).join('') : icon) : '', ''];
      }
      case 'note': return [v ? icon : '', ''];
      default: return [v === true ? icon : '', ''];
    }
  }

  function gridHTML(defs, days, phases, showPhases) {
    const [y, m] = ym.split('-').map(Number);
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const total = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7;
    const today = dayKey();
    const s = mine() ? readSettings() : null;
    const work = defs.find(d => d.id === 'work');
    const meds = defs.find(d => d.id === 'meds');
    const ctx = {
      phases,
      workTypes: work ? (mine() ? myWorkTypes(s.work) : workTypes(work.types || [])) : [],
      meds: meds ? (mine() ? s.meds : meds.list || []) : [],
      ci: defs.some(d => d.hb) ? readCheckins(slot()) : {},
    };
    let out = '';
    for (let i = 0; i < total; i++) {
      const k = dayKey(new Date(y, m - 1, 1 - offset + i));
      const inMonth = monthOf(k) === ym;
      let stk = '', line = '';
      if (inMonth) {
        ctx.k = k;
        const e = days[k] || {};
        const c = ctx.ci[k] || {};
        for (const d of defs) { const [a, b] = bits(d, d.hb ? c[d.field] : e[d.id], ctx); stk += a; line += b; }
      }
      const ph = showPhases && phases[k];
      out += `<button type="button" class="mcell tcell${inMonth ? '' : ' out'}${k === today ? ' today' : ''}" data-mdate="${k}" aria-label="${esc(fmtDay(k))}">
        <span class="mnum">${keyToDate(k).getDate()}</span><span class="tc-stk">${stk}</span>${line}
        ${ph ? `<i class="phr${ph.predicted ? ' pred' : ''}" style="background:${PHASES[ph.phase].color}"></i>` : ''}</button>`;
    }
    return out;
  }

  // ── tallies ──────────────────────────────────────────────────────────────
  const row = (icon, label, n, h = '', zero = false) =>
    `<div class="tally-row${zero ? ' zero' : ''}"><span>${icon}</span><span>${esc(label)}</span><span class="n">${esc(n)}</span><span class="h">${esc(h)}</span></div>`;
  const foot = text => (text ? `<div class="tk-foot">${text}</div>` : '');
  const nothing = '<p class="muted small">Nothing logged this month yet.</p>';

  // Little bars, one per day so far (vals: [{ k, v }], v null = nothing logged).
  const bars = (vals, max, hit) => `<div class="mini-bars">${vals.map(({ k, v }) => {
    const d = keyToDate(k).getDate();
    return `<div class="mb" title="${esc(dayName(k))}: ${v == null ? '—' : esc(short(v))}"><i class="${v != null && hit(v) ? 'hit' : ''}" style="--h:${v ? clamp(v / max, 0.06, 1) : 0}"></i><span>${d === 1 || d % 5 === 0 ? d : ''}</span></div>`;
  }).join('')}</div>`;

  function workTally(def, days, s) {
    const types = mine() ? myWorkTypes(s.work) : workTypes(def.types || []);
    const today = dayKey();
    let worked = 0;
    const rows = types.map(t => {
      const ds = Object.keys(days).filter(k => days[k].work && days[k].work[t.id] != null);
      const hours = ds.reduce((n, k) => n + (days[k].work[t.id] || 0), 0);
      if (!t.leave) worked += hours;
      if (!ds.length && !builtInWork(t)) return '';   // your own types only once used
      const ahead = ds.filter(k => k > today).length;
      if (t.id === 'overtime') return row(esc(t.emoji), t.label, ds.length ? `${ds.length}×` : '0', hours ? `${num(hours)} h` : '', !ds.length);
      const h = t.leave ? (ahead ? (ahead === ds.length ? 'booked' : `${ahead} booked`) : '') : hours ? `${num(hours)} h` : '';
      return row(esc(t.emoji), t.label, ds.length ? plural(ds.length, 'day') : '0', h, !ds.length);
    }).join('');
    return {
      meta: worked ? `${num(worked)} h worked` : '',
      inner: `<div class="tally">${rows}</div>`
        + (mine() ? foot(`⚙️ Your normal day is ${num(s.work.normalDay)} h · your financial year starts 1 ${esc(monthName(s.work.fyStart))}`)
          + '<button type="button" class="open-link" data-mworkyear>See the whole year and print ›</button>' : ''),
    };
  }

  function cycleTally(days) {
    const today = dayKey();
    const last = shiftDay(`${shiftMonth(ym, 1)}-01`, -1);
    const c = cycleOn(slot(), last < today ? last : today);
    if (!c) return { inner: `<p class="muted small">No period logged yet.${mine() ? ' Set the flow on the day view when one starts.' : ''}</p>` };
    const range = c.start === c.end ? shortDate(c.start)
      : monthOf(c.start) === monthOf(c.end) ? `${keyToDate(c.start).getDate()}–${shortDate(c.end)}` : `${shortDate(c.start)} – ${shortDate(c.end)}`;
    const sym = {};
    for (const e of Object.values(days)) for (const id of (e.cycle && e.cycle.symptoms) || []) sym[id] = (sym[id] || 0) + 1;
    const top = Object.entries(sym).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([id, n]) => `${(symptomItems(slot()).find(x => x.id === id)?.label || id).toLowerCase()} ×${n}`);
    const late = c.dueIn < 0 && last >= today;
    return {
      meta: `day ${c.cycleDay} of ~${c.length}`,
      inner: `<div class="tally">
          ${row('🩸', c.cycleDay <= daysApart(c.start, c.end) + 1 ? 'This period' : 'Last period', range, plural(daysApart(c.start, c.end) + 1, 'day'))}
          ${row('🔁', 'Cycle length', c.lengths.length ? plural(c.lengths[c.lengths.length - 1], 'day') : '—', c.lengths.length ? `usually ${c.length}` : 'after 2 periods')}
          ${row('📅', 'Next due', late ? `${plural(-c.dueIn, 'day')} late` : `~${shortDate(c.nextPeriod)}`)}
          ${top.length ? row('🎈', 'Top symptoms', top[0], top[1] || '') : ''}
        </div>
        <p class="note-sm">Estimates from ${mine() ? 'your' : 'their'} own logs, not medical advice.</p>`,
    };
  }

  // Bars for one value a day, with an average and the days it hit a goal.
  function barTally(days, valueOf, { max, hit, unit, goal }) {
    const vals = daysSoFar(ym).map(k => ({ k, v: days[k] ? valueOf(days[k]) : null }));
    const got = vals.filter(x => x.v != null && x.v !== 0);
    if (!got.length) return { inner: nothing, got, foot: '' };
    const top = Math.max(max || 0, ...got.map(x => x.v));
    const a = avg(got.map(x => x.v));
    const hits = goal != null ? got.filter(x => x.v >= goal).length : 0;
    return {
      got, a, hits,
      inner: bars(vals, top, hit || (() => false)),
      foot: `${short(Math.round(a * 10) / 10)}${unit ? ' ' + unit : ''} a day on average${goal != null ? ` · goal of ${short(goal)} reached on ${plural(hits, 'day')}` : ''}`,
    };
  }

  function caffeineTally(days) {
    const t = barTally(days, e => count(e.caffeine) || null, { max: 4, hit: v => v >= 3 });
    if (!t.got.length) return t;
    // When the last cup usually is: the middle of each day's last tap.
    const lastCups = t.got.map(x => (days[x.k].caffeine.at || []).filter(Boolean).pop()).filter(Boolean)
      .map(ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
    const total = t.got.reduce((n, x) => n + x.v, 0);
    return {
      inner: t.inner + foot(`${plural(total, 'cup')} · ${num(Math.round(t.a * 10) / 10)} a day${lastCups.length ? ` · last cup usually around ${fmtTime(lastCups[Math.floor(lastCups.length / 2)])}` : ''}`),
    };
  }

  // Mood, sleep, tiredness, brain space and spoons from the month's check-ins in Human Being.
  function hbTally(def) {
    const ci = readCheckins(slot());
    const them = store.readPartner('profile', null);
    const whose = mine() ? 'your' : `${esc(them ? them.name : 'their')}'s`;
    const from = `From ${whose} Human Being check-ins ${hbPill}`;
    const year = '<button type="button" class="open-link" data-hbyear>The whole year ›</button>';
    if (def.key === 'mood') {
      const n = {};
      let days = 0;
      for (const k of daysSoFar(ym)) {
        const picked = checkinMoodIds(ci[k]);   // every mood picked that day
        if (!picked.length) continue;
        days++;
        for (const id of picked) n[id] = (n[id] || 0) + 1;
      }
      const list = Object.entries(n).sort((a, b) => b[1] - a[1]);
      if (!list.length) return { inner: `<p class="muted small">No moods in ${whose} check-ins this month yet.</p>${foot(from)}${year}` };
      const label = id => esc(moodOf(id).label.toLowerCase());
      return {
        meta: plural(days, 'day'),
        inner: `<div class="mood-tally">${list.map(([id, c]) => `<div title="${esc(moodOf(id).label)}">${moodImg(id, '')}×${c}</div>`).join('')}</div>`
          + foot(`Felt ${label(list[0][0])} most often${list[1] ? `, then ${label(list[1][0])}` : ''} · ${from}`) + year,
      };
    }
    const t = barTally(ci, e => (typeof e[def.field] === 'number' && e[def.field] > 0 ? e[def.field] : null), { max: 10, hit: v => v >= 7 });
    if (!t.got.length) return { inner: `<p class="muted small">No ${esc(def.name.toLowerCase())} ratings in ${whose} check-ins this month yet.</p>${foot(from)}${year}` };
    const a = num(Math.round(t.a * 10) / 10), seven = t.got.filter(x => x.v >= 7).length;
    const what = { sleep: `${mine() ? 'Your' : whose.charAt(0).toUpperCase() + whose.slice(1)} sleep rating`, tired: 'Tiredness', brain: 'Brain space', spoons: 'Spoons' }[def.key];
    return {
      meta: `${a} / 10`,
      inner: t.inner + foot(`${what} ${a}/10 on average · 7 or more on ${plural(seven, def.key === 'sleep' ? 'night' : 'day')} ${hbPill}`) + year,
    };
  }

  // Walks a day (bars, the goal), and the minutes they add up to.
  function walkTally(def, days) {
    const goal = (mine() ? walkSettings().goal : def.goal) || 3;
    const t = barTally(days, e => totals(e.walk).n || null, { max: goal, hit: v => v >= goal, unit: 'walks', goal });
    if (!t.got.length) return t;
    const n = t.got.reduce((a, x) => a + x.v, 0);
    const mins = daysSoFar(ym).reduce((a, k) => a + totals((days[k] || {}).walk).mins, 0);
    return { meta: `${num(mins)} min`, inner: t.inner + foot(`${plural(n, 'walk')} · ${num(mins)} min in all · goal of ${goal} reached on ${plural(t.hits, 'day')}`) };
  }

  function medsTally(def, days, s) {
    const list = mine() ? s.meds : def.list || [];
    if (!list.length) return { inner: `<p class="muted small">${mine() ? 'Add your medicines on the day view.' : 'No medicines yet.'}</p>` };
    // Counted from the first day any medicine was logged this month.
    const all = daysSoFar(ym);
    const first = all.find(k => days[k] && days[k].meds);
    if (!first) return { inner: nothing };
    const range = all.filter(k => k >= first);
    const rows = list.map(m => {
      const taken = range.filter(k => ((days[k].meds || {})[m.id] || []).length);
      if (m.asNeeded) {
        const doses = range.reduce((n, k) => n + ((days[k].meds || {})[m.id] || []).length, 0);
        return row('💊', m.name, plural(doses, 'dose'), 'as needed', !doses);
      }
      const missed = range.filter(k => !taken.includes(k)).map(k => keyToDate(k).getDate());
      return row('💊', m.name, `${taken.length} of ${range.length}`,
        missed.length ? `missed ${missed.length > 3 ? missed.length + ' days' : missed.join(', ')}` : '100%');
    }).join('');
    return { inner: `<div class="tally">${rows}</div>` };
  }

  function ownTally(def, days) {
    const so = daysSoFar(ym);
    const vals = so.map(k => (days[k] || {})[def.id]).filter(v => v != null);
    if (!vals.length) return { inner: nothing };
    switch (def.type) {
      case 'count': {
        const t = barTally(days, e => count(e[def.id]) || null, { max: def.goal || 0, hit: v => !!def.goal && v >= def.goal, unit: '', goal: def.goal || null });
        const total = t.got.reduce((n, x) => n + x.v, 0);
        return { meta: total ? `${short(total)} in all` : '', inner: t.inner + foot(esc(t.foot)) };
      }
      case 'amount': {
        const t = barTally(days, e => (typeof e[def.id] === 'number' ? e[def.id] : null), { unit: def.unit || '' });
        const total = t.got.reduce((n, x) => n + x.v, 0);
        return { meta: total ? `${short(total)} ${esc(def.unit || '')} in all` : '', inner: t.inner + foot(esc(t.foot)) };
      }
      case 'scale': {
        const max = def.max || 5;
        const t = barTally(days, e => (typeof e[def.id] === 'number' ? e[def.id] : null), { max, hit: v => v >= max * 0.8, unit: '' });
        return { inner: t.inner + (t.got.length ? foot(`${num(Math.round(t.a * 10) / 10)} / ${max} on average · logged on ${plural(t.got.length, 'day')}`) : '') };
      }
      case 'options': {
        const rows = (def.options || []).map(o => {
          const n = vals.filter(v => (v.picked || []).includes(o.id)).length;
          return row(esc(lead(o.label) || '•'), lead(o.label) ? o.label.slice(lead(o.label).length).trim() : o.label, n ? `${n}×` : '0', '', !n);
        }).join('');
        const amount = vals.reduce((n, v) => n + (v.amount || 0), 0);
        return { inner: `<div class="tally">${rows}</div>${def.amountUnit && amount ? foot(`${num(amount)} ${esc(def.amountUnit)} in all`) : ''}` };
      }
      case 'note': {
        const notes = so.filter(k => days[k] && days[k][def.id]).slice(-3).reverse();
        return {
          meta: plural(vals.length, 'day'),
          inner: notes.map(k => `<div class="tally-note"><b>${esc(dayName(k))}</b>${esc(days[k][def.id])}</div>`).join(''),
        };
      }
      default: {
        // Yes / no: a dot for every day so far, and the longest run of days in a row.
        let run = 0, best = 0;
        const dots = so.map(k => {
          const on = (days[k] || {})[def.id] === true;
          run = on ? run + 1 : 0;
          best = Math.max(best, run);
          return `<i class="${on ? 'on' : ''}" title="${esc(dayName(k))}"></i>`;
        }).join('');
        return { inner: `<div class="tally-dots">${dots}</div>` + foot(`Done on ${vals.length} of ${plural(so.length, 'day')}${best > 1 ? ` · longest run ${best} days` : ''}`) };
      }
    }
  }

  function tallyFor(def, days, s) {
    if (def.hb) return hbTally(def);
    switch (def.id) {
      case 'work': return workTally(def, days, s);
      case 'cycle': return cycleTally(days);
      case 'water': {
        const goal = (mine() ? s.trackers.goals.water : def.goal) || 8;
        const t = barTally(days, e => count(e.water) || null, { max: goal, hit: v => v >= goal, unit: 'glasses', goal });
        return { inner: t.inner + foot(esc(t.foot)) };
      }
      case 'caffeine': return caffeineTally(days);
      case 'walk': return walkTally(def, days);
      case 'meds': return medsTally(def, days, s);
      default: return ownTally(def, days);
    }
  }

  // You pick which tallies show, from any tracker that's on (Work to start
  // with), whether or not it's on the calendar. Tap a chip, or "hide" on a card.
  function talliesHTML(all, days) {
    // Your person's cycle tally only when they share everything about it.
    const list = mine() || cycleLevel(store.readPartner('shared', null)) === 'all' ? all : all.filter(d => d.id !== 'cycle');
    if (!list.length) return '';
    const s = mine() ? readSettings() : null;
    const on = talliesOn(list);
    const chips = list.map(d => `<button type="button" class="chip${on.has(d.id) ? ' on' : ''}" data-mtally="${esc(d.id)}" aria-pressed="${on.has(d.id)}" style="${colorVars(d.color)}">${chipLabel(d)}</button>`).join('');
    const cards = list.filter(d => on.has(d.id)).map(d => {
      const { inner, meta } = tallyFor(d, days, s);
      return `<article class="card tk tally-card" data-tally="${esc(d.id)}" style="${colorVars(d.color)}">
        <div class="card-tape"></div>
        <div class="tk-head">${d.hb ? hbIcon(d) : iconFor(d)}<h3>${esc(d.hb ? `${d.name} in ${monthName(+ym.slice(5))}` : `${TITLE[d.id] || d.name} tally`)}</h3>${meta ? `<span class="tk-meta">${meta}</span>` : ''}
          <button type="button" class="tally-hide" data-mtally-hide="${esc(d.id)}" aria-label="Hide the ${esc(TITLE[d.id] || d.name)} tally">hide</button></div>
        ${inner}
      </article>`;
    }).join('');
    return `<div class="tally-pick"><b>📊 Monthly tallies</b><div class="chips sm">${chips}</div>
        ${cards ? '' : '<p class="muted small tally-none">Tap the trackers you\'d like added up for the month.</p>'}</div>${cards}`;
  }

  // ── stickers on top, like a Plan month ───────────────────────────────────
  const pageList = () => pages[ym] || (pages[ym] = []);
  const layer = createStickerLayer({
    el: $('#m-stickers', el),
    sources: () => (mine() ? [{ list: pageList(), editable: decor, save: () => writeMonthStickers(pages), primary: true }] : []),
    posToPx: s => ({ x: s.fx * page.clientWidth, y: s.fy * page.clientHeight }),
    pxToPos: (x, y) => ({ fx: +clamp(x / (page.clientWidth || 1), 0, 1).toFixed(4), fy: +clamp(y / (page.clientHeight || 1), 0, 1).toFixed(4) }),
    clientToLayer: (cx, cy) => { const r = page.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; },
    active: () => decor,
    scale: () => 0.6,   // the days are small, so new stickers start smaller than on a Plan
  });
  function setDecor(on) {
    decor = on;
    el.classList.toggle('decorating', on);
    layer.setActive(on);
  }
  const trayTarget = {
    rectEl: page,
    add(k, cx, cy) {
      if (cx == null) {
        // Somewhere on the part of the page you can see, above the drawer.
        const r = page.getBoundingClientRect(), v = el.closest('.view').getBoundingClientRect();
        const top = Math.max(r.top, v.top), bottom = Math.min(r.bottom, v.bottom - 180);
        cx = r.left + r.width * (0.3 + Math.random() * 0.4);
        cy = bottom > top + 40 ? top + (bottom - top) * (0.35 + Math.random() * 0.3) : r.top + r.height * 0.3;
      }
      layer.add(k, layer.clientToLayer(cx, cy));
    },
    onClose: () => setDecor(false),
  };

  // ── drawing ──────────────────────────────────────────────────────────────
  function render() {
    if (layer.busy()) return;
    const today = dayKey();
    const list = trackers();
    const shown = shownOf(list);
    const defs = list.filter(d => shown.has(d.id));
    const days = readMonth(slot(), ym);
    const [y, m] = ym.split('-').map(Number);
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const first = dayKey(new Date(y, m - 1, 1 - offset));
    const last = dayKey(new Date(y, m - 1, 1 - offset + Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7 - 1));
    const phases = shown.has('cycle') ? phasesBetween(slot(), first, last) : {};

    $('#m-label', el).textContent = monthLabel(ym);
    $('[data-mnav="0"]', el).hidden = ym === monthOf(today);
    const them = store.readPartner('profile', null);
    $('#m-chips', el).innerHTML = list.length
      ? list.map(d => `<button type="button" class="chip${shown.has(d.id) ? ' on' : ''}" data-mchip="${esc(d.id)}" aria-pressed="${shown.has(d.id)}" style="${colorVars(d.color)}">${chipLabel(d)}</button>`).join('')
      : `<p class="filters-empty">${mine() ? 'Switch on a tracker on the day view and it can show here.' : `🔒 ${esc(them ? them.name : 'Your person')} hasn't shared any trackers yet.`}</p>`;
    grid.innerHTML = gridHTML(defs, days, phases, shown.has('cycle'));
    $('#m-legend', el).hidden = !shown.has('cycle') || !Object.keys(phases).length;
    $('#m-tallies', el).innerHTML = talliesHTML(list, days);
    $('.month-float', el).hidden = !mine();
    if (!mine() && tray.target === trayTarget) tray.close();
    pages = clone(readMonthStickers());
    layer.render();
  }

  // ── taps ─────────────────────────────────────────────────────────────────
  el.addEventListener('click', e => {
    // Decorating: a tap on the page away from any sticker sets the chosen one down; the next tap finishes.
    if (decor && page.contains(e.target) && !e.target.closest('.stk')) { tapAway(layer); return; }
    const nav = e.target.closest('[data-mnav]');
    if (nav) {
      const n = Number(nav.dataset.mnav);
      ym = n ? shiftMonth(ym, n) : monthOf(dayKey());
      render();
      return;
    }
    const chip = e.target.closest('[data-mchip]');
    if (chip) { toggleShown(chip.dataset.mchip); vibrate(8); render(); return; }
    const tally = e.target.closest('[data-mtally]');
    if (tally) { setTally(tally.dataset.mtally, tally.getAttribute('aria-pressed') !== 'true'); vibrate(8); render(); return; }
    const hide = e.target.closest('[data-mtally-hide]');
    if (hide) { setTally(hide.dataset.mtallyHide, false); render(); return; }
    if (e.target.closest('[data-mworkyear]')) { onWorkYear(); return; }
    if (e.target.closest('[data-hbyear]')) { onHbYear && onHbYear(mine() ? 'me' : 'them'); return; }
    if (e.target.closest('[data-act="m-stickers"]')) {
      if (tray.target === trayTarget) tray.close();
      else if (mine()) { setDecor(true); tray.open(trayTarget); }
      return;
    }
    const cell = e.target.closest('[data-mdate]');
    if (cell && !decor) onDay(cell.dataset.mdate);
  });

  window.addEventListener('resize', () => { if (!el.hidden && el.offsetParent && !layer.busy()) layer.render(); });

  return {
    render,
    /** Leaving the month view: put the sticker drawer away. */
    leave() { if (tray.target === trayTarget) tray.close(); },
    /** Shows month `v` ("YYYY-MM") next time. */
    setMonth(v) { ym = v; },
  };
}
