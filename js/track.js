// Tracking, day view: the same swipeable day strip as Human Being, a small
// banner when your person shares period support they could use (with On it),
// then one card per tracker you've switched on. "Mine / Sam's" switches to the
// trackers your person shares (read-only). "Month" is in month.js, and the
// work year (leave, work settings, printing) in workyear.js.

import * as store from './store.js';
import { $, colorVars, dayKey, debounce, esc, fmtDay, fmtTime, keyToDate, shiftDay, toast, uid, vibrate } from './util.js';
import { greetingSticker } from './icons.js';
import { avatarHTML } from './avatars.js';
import { stickerSrc } from './stickers.js';
import { confirmSheet, promptSheet } from './ui.js';
import {
  BUILT_IN, markOnIt, monthOf, myWorkTypes, readDay, readMonth, readOnIt, readSettings, workTypes, writeMyDay, writeSettings,
} from './docs.js';
import { PHASES, cycleLevel, cycleOn, ringSVG, supportItems, symptomItems } from './cycle.js';
import { editButtons, foldParts, foldedChips, moreTap, titleRow } from './buttons.js';
import { cycleTap, logBlock, logTitle, logView, supportBlock, supportView } from './cyclelog.js';
import { nextValue, ownBody, ownExample, ownIcon, ownSummary, typedValue } from './own.js';
import { openTrackerList, openTrackerSettings, openWalkSettings } from './picker.js';
import { openRemind } from './remind.js';
import { chipLabel, lastWalkAt, nextNudge, totals, walkMins, walkSettings, walkStreak, walksOf } from './walk.js';
import { isNative } from './native.js';
import { createMonth } from './month.js';
import { createWorkYear } from './workyear.js';
import { createCyclePage } from './cyclepage.js';
import { createMoodSleep } from './moodsleep.js';
import { leaveFor } from './work.js';
import * as act from './actions.js';

const STRIP_BACK = 120, STRIP_AHEAD = 30;   // days in the strip: back as you swipe, and ahead for booking leave

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Hi, night owl';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Hi, night owl';
}

// ── Small helpers ─────────────────────────────────────────────────────────
const stk = (name, cls = 'tk-ico') => `<img class="${cls}" src="${stickerSrc(name)}" alt="" draggable="false">`;
const emo = e => `<span class="tk-ico" aria-hidden="true">${e}</span>`;
const count = v => (typeof v === 'number' ? v : (v && v.n) || 0);
const times = v => (v && Array.isArray(v.at) ? v.at : []);
const toMin = t => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clock = ts => { const d = new Date(ts); return fmtTime(d.getHours() * 60 + d.getMinutes()); };
const hrs = n => String(Math.round(n * 100) / 100);
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
// Anything logged on a day (folding cards away with Done ✓ isn't logging).
const logged = e => !!e && Object.keys(e).some(k => k !== 'done');

// How each built-in tracker's card looks.
const LOOK = {
  work: { color: 'sky', icon: () => emo('💼'), title: 'Work day' },
  cycle: { color: 'coral', icon: () => stk('pdrop'), title: 'Cycle' },
  water: { color: 'sky', icon: () => stk('drop'), title: 'Water' },
  caffeine: { color: 'peach', icon: () => stk('latte'), title: 'Caffeine' },
  meds: { color: 'mint', icon: () => emo('💊'), title: 'Medication' },
  walk: { color: 'mint', icon: () => stk('sneaker'), title: 'Walk' },
};

// Example data for a tracker's preview: { entry, settings?, extra? } (extra:
// what a card would otherwise read from your logs: the cycle, the walk streak,
// the time "now" is).
const EXAMPLE_MEDS = [
  { id: 'ex-vitd', name: 'Vitamin D', dose: '1 tablet', time: '08:00', asNeeded: false, left: 40, lowAt: 5 },
  { id: 'ex-hay', name: 'Hay fever tablet', dose: '', time: '', asNeeded: true, left: null, lowAt: 5 },
  { id: 'ex-iron', name: 'Iron', dose: '1 tablet', time: '20:00', asNeeded: false, left: 4, lowAt: 5 },
];
function example(id, def, s) {
  const today = dayKey();
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };
  switch (id) {
    case 'work': return { entry: { work: { wfh: s.work.normalDay, overtime: 1 } } };
    case 'water': return { entry: { water: { n: 5, at: [] } } };
    case 'caffeine': return { entry: { caffeine: { n: 2, at: [at(8, 30), at(13, 30)] } } };
    case 'meds': return { entry: { meds: { 'ex-vitd': [at(8, 5)] } }, settings: { ...s, meds: EXAMPLE_MEDS } };
    case 'cycle': return {
      entry: { cycle: { symptoms: ['cravings'] } },
      extra: { cycle: { phase: 'luteal', cycleDay: 19, length: 28, periodLength: 5, ovulation: 14, nextPeriod: shiftDay(today, 10), dueIn: 10, start: shiftDay(today, -18), end: shiftDay(today, -14), lengths: [28, 29] } },
    };
    case 'walk': {
      const w = walkSettings(s);
      const [a, b] = [w.options[0], w.options[1] || w.options[0]];
      return {
        entry: { walk: a ? [{ at: at(10, 20), opt: a.id, mins: walkMins(a) }, { at: at(13, 30), opt: b.id, mins: walkMins(b) }] : [] },
        extra: { now: at(13, 45), streak: 4 },
      };
    }
    default: return { entry: def ? { [id]: ownExample(def) } : {} };
  }
}

export function createTrack(root) {
  let day = dayKey();
  let followToday = true;
  let who = 'me';          // 'me' | 'them'
  let mode = 'day';        // 'day' | 'month', or a page: 'year' (the work year) | 'cycle' | 'hb' (the year of check-ins)
  let backTo = 'day';      // where a page's ‹ goes back to
  let stripStart = null;

  root.innerHTML = `
    <div class="page track">
      <div class="today-head" id="k-head"></div>
      <div class="row-segs" id="k-segs">
        <div class="seg" id="k-who" style="${colorVars('pink')}"></div>
        <div class="seg" id="k-mode" style="${colorVars('pink')}">
          <button type="button" data-mode="day" class="on">Day</button><button type="button" data-mode="month">Month</button>
        </div>
      </div>
      <div class="strip-head" id="k-strip-head">
        <span class="strip-month" id="k-month"></span>
        <button type="button" class="today-btn" data-act="go-today" hidden>↩ Today</button>
      </div>
      <div class="day-strip" id="k-strip" aria-label="Days"></div>
      <div id="k-body"></div>
      <div id="k-monthview" hidden></div>
      <div id="k-year" hidden></div>
      <div id="k-cycle" hidden></div>
      <div id="k-hb" hidden></div>
    </div>`;
  const strip = $('#k-strip', root);
  const todayBtn = $('.today-btn', root);
  const body = $('#k-body', root);
  const monthEl = $('#k-monthview', root);
  const yearEl = $('#k-year', root);
  const cycleEl = $('#k-cycle', root);
  const hbEl = $('#k-hb', root);
  const isPage = () => mode === 'year' || mode === 'cycle' || mode === 'hb';
  const iconFor = d => (LOOK[d.id] ? LOOK[d.id].icon() : ownIcon(d));

  // The month view; tapping a date there opens that day here.
  const monthView = createMonth(monthEl, {
    who: () => who,
    iconFor,
    onDay: k => {
      if (k > shiftDay(dayKey(), STRIP_AHEAD)) { toast(`You can log up to ${STRIP_AHEAD} days ahead`); return; }
      monthView.leave();
      mode = 'day';
      renderHead();
      setDay(k);
      centerOn(k, false);
      root.scrollTop = 0;
    },
    onWorkYear: () => openPage('year'),
    onHbYear: from => { hbView.reset(from); openPage('hb'); },
  });

  // Pages of their own, each with a ‹ back to where you were: the work year
  // and the cycle (which logs the day you're on).
  const yearView = createWorkYear(yearEl, {
    onBack: () => closePage(),
    onMonth: ym => { monthView.setMonth(ym); closePage('month'); },
  });
  const cycleView = createCyclePage(cycleEl, { day: () => day, onBack: () => closePage() });
  const hbView = createMoodSleep(hbEl, { onBack: () => closePage() });
  function openPage(name) {
    if (!isPage()) backTo = mode;
    monthView.leave();
    who = 'me';
    mode = name;
    if (name === 'year') yearView.reset();
    renderHead();
    renderBody();
    root.scrollTop = 0;
  }
  function closePage(to = backTo) {
    mode = to;
    renderHead();
    renderBody();
    root.scrollTop = 0;
    if (mode === 'day') centerOn(day, false);
  }

  const me = () => store.me();
  const them = () => store.readPartner('profile', null);
  const themName = () => them()?.name || 'Your person';

  // ── header and switches ────────────────────────────────────────────────
  function renderHead() {
    const p = store.readMine('profile', {});
    $('#k-head', root).innerHTML = `<h1 class="display">${esc(greeting())}${p.name ? ', ' + esc(p.name) : ''} <span class="wave">${greetingSticker()}</span></h1>`;
    const t = them();
    if (!t) who = 'me';
    $('#k-who', root).innerHTML = t
      ? `<button type="button" data-who="me" class="${who === 'me' ? 'on' : ''}">Mine</button><button type="button" data-who="them" class="${who === 'them' ? 'on' : ''}">${esc(t.name)}'s</button>`
      : '';
    $('#k-who', root).hidden = !t;
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    $('#k-strip-head', root).hidden = strip.hidden = mode !== 'day';
    $('#k-head', root).hidden = $('#k-segs', root).hidden = isPage();
  }

  // ── day strip (as in Human Being, plus a month ahead for booking leave) ──
  function cellHTML(k, today) {
    const d = keyToDate(k);
    return `<button type="button" class="wk${k === day ? ' on' : ''}${k === today ? ' today' : ''}${k > today ? ' ahead' : ''}" data-day="${k}" aria-label="${esc(fmtDay(k))}">
      <span class="wk-d">${esc(d.toLocaleDateString(undefined, { weekday: 'narrow' }))}</span>
      <span class="wk-n">${d.getDate()}</span>
      <span class="wk-dots"><i></i><i></i></span>
    </button>`;
  }
  function cellsBetween(from, to, today) {
    let out = '';
    for (let k = from; k <= to; k = shiftDay(k, 1)) out += cellHTML(k, today);
    return out;
  }
  function buildStrip() {
    const today = dayKey();
    stripStart = shiftDay(today, -STRIP_BACK);
    if (day < stripStart) stripStart = shiftDay(day, -14);
    strip.innerHTML = cellsBetween(stripStart, shiftDay(today, STRIP_AHEAD), today);
    strip.dataset.today = today;
    refreshDots();
    centerOn(day, false);
  }
  function extendStrip() {
    const today = dayKey();
    const from = shiftDay(stripStart, -STRIP_BACK);
    const before = strip.scrollWidth;
    strip.insertAdjacentHTML('afterbegin', cellsBetween(from, shiftDay(stripStart, -1), today));
    stripStart = from;
    strip.scrollLeft += strip.scrollWidth - before;
    refreshDots();
  }

  // Dots: anything logged that day, by me and by my person (what they share).
  function refreshDots() {
    const cells = [...strip.querySelectorAll('.wk')];
    if (!cells.length) return;
    const months = new Set(cells.map(c => monthOf(c.dataset.day)));
    const mine = {}, theirs = {};
    for (const ym of months) {
      Object.assign(mine, readMonth(me(), ym));
      if (them()) Object.assign(theirs, readMonth(store.partner(), ym));
    }
    const meVars = colorVars(store.readMine('profile', {}).color), themVars = colorVars(them()?.color || 'lavender');
    cells.forEach(cell => {
      const k = cell.dataset.day;
      const [a, b] = cell.querySelectorAll('.wk-dots i');
      a.style.cssText = meVars;
      b.style.cssText = themVars;
      a.classList.toggle('on', logged(mine[k]));
      b.classList.toggle('on', !!them() && logged(theirs[k]));
    });
  }
  const markSelected = () => strip.querySelectorAll('.wk').forEach(c => c.classList.toggle('on', c.dataset.day === day));

  let gliding = 0;
  function centerOn(k, smooth = true) {
    const cell = strip.querySelector(`.wk[data-day="${k}"]`);
    if (!cell || !strip.clientWidth) return;
    const left = cell.offsetLeft - (strip.clientWidth - cell.offsetWidth) / 2;
    if (smooth) gliding = Date.now() + 900;
    strip.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
    updateStripChrome();
  }
  function updateStripChrome() {
    const cells = strip.querySelectorAll('.wk');
    if (!cells.length) return;
    const step = cells.length > 1 ? cells[1].offsetLeft - cells[0].offsetLeft : 1;
    const mid = Math.round((strip.scrollLeft + strip.clientWidth / 2 - cells[0].offsetLeft - step / 2) / step);
    const cell = cells[Math.min(cells.length - 1, Math.max(0, mid))];
    if (!cell) return;
    $('#k-month', root).textContent = keyToDate(cell.dataset.day).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const t = strip.querySelector('.wk.today');
    const todayInView = t && t.offsetLeft >= strip.scrollLeft - 2 && t.offsetLeft + t.offsetWidth <= strip.scrollLeft + strip.clientWidth + 2;
    todayBtn.hidden = day === dayKey() && !!todayInView;
  }

  // Fingers swipe the strip natively; let a mouse drag it too.
  let mouseDrag = null, dragEndedAt = 0;
  strip.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button === 0) mouseDrag = { x: e.clientX, left: strip.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', e => {
    if (!mouseDrag) return;
    const dx = e.clientX - mouseDrag.x;
    if (!mouseDrag.moved && Math.abs(dx) > 5) { mouseDrag.moved = true; strip.style.scrollSnapType = 'none'; }
    if (mouseDrag.moved) strip.scrollLeft = mouseDrag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!mouseDrag) return;
    if (mouseDrag.moved) { strip.style.scrollSnapType = ''; dragEndedAt = Date.now(); }
    mouseDrag = null;
  });
  let stripRaf = 0;
  strip.addEventListener('scroll', () => {
    if (stripRaf) return;
    stripRaf = requestAnimationFrame(() => {
      stripRaf = 0;
      if (strip.scrollLeft < strip.clientWidth * 0.5 && Date.now() > gliding) extendStrip();
      updateStripChrome();
    });
  }, { passive: true });

  function setDay(k) {
    saveNote.flush();   // a note being typed belongs to the day it was typed on
    day = k;
    followToday = k === dayKey();
    if (k < stripStart) buildStrip();
    else { markSelected(); centerOn(k); }
    renderBody();
  }

  // ── cards ──────────────────────────────────────────────────────────────
  const lookOf = (id, ctx) => LOOK[id] || { color: ctx.def.color, icon: () => ownIcon(ctx.def), title: esc(ctx.def.name) };
  // Done ✓: a card folded away for the day (the day's `done`, just yours).
  const isDone = (id, ctx) => ctx.mine && !!(ctx.entry.done || {})[id];

  // A card's buttons: your main ones and "N more" (see buttons.js), under a
  // title with ✎ Edit, the same on every card (not in a tracker's preview).
  const buttons = (list, items, chip, on) => foldedChips(list, items, chip, { on });
  const buttonsTitle = (title, list, ctx) => titleRow(title, ctx.preview ? '' : list);

  // Whether my person sees a tracker: the cycle by its own sharing choice.
  const sharedNow = (id, s) => (id === 'cycle' ? s.cycle.share !== 'none' : !!s.trackers.share[id]);
  const CYCLE_SHARE = { support: 'just your period support', phase: 'your phase and period support', all: 'everything about your cycle' };

  // 🔒 / 💞 by the title: who sees this card (tap to change it).
  function visIcon(id, ctx) {
    if (!ctx.mine || ctx.preview) return '';
    const on = sharedNow(id, ctx.settings);
    const name = themName();
    const says = !on ? `Just you: ${name} doesn't see this` : id === 'cycle' ? `${name} sees ${CYCLE_SHARE[ctx.settings.cycle.share]}` : `Shared: ${name} sees this`;
    return `<button type="button" class="tk-vis${on ? ' on' : ''}" data-vis="${esc(id)}" title="${esc(says)}" aria-label="${esc(says)}">${on ? '💞' : '🔒'}</button>`;
  }

  // My cards get a ✓ Done chip, the same on every card.
  function card(id, ctx, inner, meta = '') {
    const look = lookOf(id, ctx);
    const doneChip = ctx.mine && !isDone(id, ctx)
      ? `<button type="button" class="done-chip" data-done="${esc(id)}" aria-label="Done: fold ${esc(ctx.def?.name || look.title)} away for today">✓ Done</button>` : '';
    return `<article class="card tk" data-tracker="${esc(id)}" style="${colorVars(look.color)}">
      <div class="card-tape"></div>
      <div class="tk-head">${look.icon()}<h3>${look.title}</h3>${visIcon(id, ctx)}${meta ? `<span class="tk-meta">${meta}</span>` : ''}${doneChip}</div>
      ${inner}
    </article>`;
  }

  // A card folded away with Done ✓: one line, and ✏️ to open it again.
  function foldedCard(id, ctx) {
    const look = lookOf(id, ctx);
    return `<article class="card tk tk-folded" data-tracker="${esc(id)}" style="${colorVars(look.color)}">
      <div class="tk-fold">${look.icon()}<div><b>${look.title}</b><small>${esc(summaryOf(id, ctx))}</small></div>
        <span class="ok-dot" aria-hidden="true">✓</span>
        <button type="button" class="row-x" data-undone="${esc(id)}" aria-label="Open it again">✏️</button></div>
    </article>`;
  }

  // The folded line: what the day adds up to, per tracker.
  function summaryOf(id, ctx) {
    const v = ctx.entry[id];
    switch (id) {
      case 'water': { const goal = ctx.settings.trackers.goals.water || 8; return `${count(v)} of ${goal} glasses${count(v) >= goal ? ' ✨' : ''}`; }
      case 'caffeine': {
        const n = count(v), last = times(v).filter(Boolean).pop();
        return n ? `${n} cup${n === 1 ? '' : 's'}${last ? ` · last one ${clock(last)}` : ''}` : 'No caffeine';
      }
      case 'walk': {
        const t = totals(v), goal = walkSettings(ctx.settings).goal;
        return `${t.n} of ${goal} walk${goal === 1 ? '' : 's'} · ${t.mins} min${t.n >= goal ? ' ✨' : ''}`;
      }
      case 'meds': {
        const list = ctx.settings.meds, taken = v || {};
        if (!list.length) return 'No medicines yet';
        const sched = list.filter(m => !m.asNeeded);
        const took = sched.filter(m => (taken[m.id] || []).length);
        const when = took.map(m => taken[m.id][0]).filter(Boolean).sort((a, b) => a - b).map(clock);
        const prn = list.filter(m => m.asNeeded).reduce((n, m) => n + (taken[m.id] || []).length, 0);
        return [sched.length ? `${took.length} of ${sched.length} taken` : '', ...when, prn ? `${prn} as needed` : ''].filter(Boolean).join(' · ') || 'Nothing taken';
      }
      default: return ctx.def && ctx.def.type ? ownSummary(ctx.def, v) : '';
    }
  }

  // Your own trackers (and your person's, read-only): see own.js.
  function ownCard(id, ctx) {
    const { inner, meta } = ownBody(ctx.def, ctx.entry[id], ctx.mine, ctx.mine ? (items, chip, on) => buttons(id, items, chip, on) : null);
    const head = ctx.mine && ctx.def.type === 'options' ? buttonsTitle(esc(logTitle(day)), id, ctx) : '';
    return card(id, ctx, head + inner, meta);
  }

  // Work day: tap the kinds of day it was, then set the hours for each.
  function workCard(ctx) {
    const v = ctx.entry.work || {};
    const types = ctx.mine ? myWorkTypes(ctx.settings.work, ctx.settings) : workTypes(ctx.def.types || []);
    const picked = types.filter(t => v[t.id] != null);
    const total = picked.filter(t => !t.leave).reduce((s, t) => s + (v[t.id] || 0), 0);
    const chips = ctx.mine
      ? buttons('work', types, t => `<button type="button" class="chip${v[t.id] != null ? ' on' : ''}" data-work="${t.id}" aria-pressed="${v[t.id] != null}">${esc(t.emoji)} ${esc(t.label)}</button>`, t => v[t.id] != null)
      : picked.map(t => `<span class="chip on">${esc(t.emoji)} ${esc(t.label)}</span>`).join('');
    const rows = picked.map(t => `
      <div class="hrs-row"><span>${esc(t.emoji)} ${esc(t.label)}</span>
        ${ctx.mine
          ? `<span class="stepper"><button type="button" data-hrs="${t.id}" data-step="-0.5" aria-label="Less">−</button><b>${hrs(v[t.id])}</b><small>h</small><button type="button" data-hrs="${t.id}" data-step="0.5" aria-label="More">+</button></span>
            <button type="button" class="row-x" data-work-x="${t.id}" aria-label="Take ${esc(t.label)} off this day">✕</button>`
          : `<span class="stepper"><b>${hrs(v[t.id])}</b><small>h</small></span>`}
      </div>`).join('');
    const meta = total ? `${hrs(total)} h` : '';
    // Leave taken this day: what's left of it this financial year.
    const leave = ctx.mine && !ctx.preview ? leaveFor(v, day, ctx.settings.work, me()).map(({ a, left, yr }) => {
      const u = a.unit === 'days' ? 'day' : 'hour';
      const n = Math.round(Math.abs(left) * 10) / 10;
      return `<p class="leave-left">${esc(a.emoji || '⭐')} ${left < 0 ? `${n} ${u}${n === 1 ? '' : 's'} over` : `${n} ${u}${n === 1 ? '' : 's'} left`} of your ${esc(a.name.toLowerCase())} in ${esc(yr.label)}</p>`;
    }).join('') : '';
    const timer = ctx.mine && (ctx.preview || day === dayKey()) ? overtimeRow(ctx.preview ? null : ctx.settings.work.timer) : '';
    // ✓ Done folds it into a summary, like Human Being's check-in card.
    if (isDone('work', ctx)) {
      return card('work', ctx, `
        <div class="work-sum">${picked.map(t => `<div class="ws-row"><span>${esc(t.emoji)} ${esc(t.label)}</span><b>${hrs(v[t.id])} h</b></div>`).join('')
          || '<div class="ws-row"><span class="muted">Nothing logged</span></div>'}</div>
        ${total ? `<div class="ws-total">${hrs(total)} hour${total === 1 ? '' : 's'} worked</div>` : ''}
        ${leave}
        ${ctx.settings.work.timer ? timer : ''}
        <button type="button" class="btn ghost edit-btn" data-undone="work">✏️ Edit my work day</button>`, '✓ done');
    }
    return card('work', ctx, `
      ${ctx.mine ? buttonsTitle(esc(logTitle(day)), 'work', ctx) : ''}
      <div class="chips sm">${chips || '<span class="muted small">Nothing logged</span>'}</div>
      ${rows}
      ${leave}
      ${timer}
      ${ctx.preview ? '' : workFoot(ctx, types)}
      ${ctx.mine ? '<button type="button" class="open-link" data-act="work-year">Work year and leave ›</button>' : ''}`, meta);
  }
  // The overtime timer (also on the work widget): start, and stop to log the hours.
  function overtimeRow(timer) {
    return `<div class="ot-row">${timer
      ? `<span>⏱️ Overtime since ${esc(clock(timer))}</span><button type="button" class="plus-btn on" data-act="ot-stop">⏹ Stop and log it</button>`
      : '<button type="button" class="plus-btn" data-act="ot-start">⏱ Start the overtime timer</button>'}</div>`;
  }
  function workFoot(ctx, types) {
    const month = readMonth(ctx.slot, monthOf(day));
    const today = dayKey();
    const parts = [];
    for (const t of types) {
      const ds = Object.keys(month).filter(k => month[k].work && month[k].work[t.id] != null);
      if (!ds.length) continue;
      if (t.id === 'overtime') { parts.push(`${t.emoji} ${hrs(ds.reduce((s, k) => s + month[k].work.overtime, 0))} h`); continue; }
      const ahead = ds.filter(k => k > today).length;
      const n = ds.length - ahead;
      parts.push(`${t.emoji} ${n ? `${n} day${n === 1 ? '' : 's'}` : ''}${n && ahead ? ' · ' : ''}${ahead ? `${ahead} booked` : ''}`);
    }
    if (!parts.length) return '';
    const label = keyToDate(day).toLocaleDateString(undefined, { month: 'long' }) + (monthOf(day) === monthOf(today) ? ' so far' : '');
    return `<div class="tk-foot">${esc(label)}: ${parts.map(esc).join(' · ')}</div>`;
  }

  // Water and caffeine: a little row of stickers to tap, each tap's time saved.
  function drinkCard(id, ctx) {
    const v = ctx.entry[id];
    const n = count(v);
    if (id === 'water') {
      const goal = (ctx.mine ? ctx.settings.trackers.goals.water : ctx.def.goal) || 8;
      const drops = Array.from({ length: Math.max(goal, n) }, (_, i) => ctx.mine
        ? `<button type="button" class="drink${i < n ? '' : ' off'}" data-drink="water" data-i="${i}" aria-label="${i + 1} glasses">${stk('drop', '')}</button>`
        : `<span class="drink${i < n ? '' : ' off'}">${stk('drop', '')}</span>`).join('');
      return card('water', ctx, `
        <div class="drops">${drops}</div>
        <div class="mini-row"><span class="big-num">${n}<small>/${goal}</small></span>${ctx.mine ? '<button type="button" class="plus-btn" data-act="add-water">＋ glass</button>' : ''}</div>`);
    }
    const cups = Array.from({ length: Math.min(8, Math.max(3, n + 1)) }, (_, i) => ctx.mine
      ? `<button type="button" class="drink${i < n ? '' : ' off'}" data-drink="caffeine" data-i="${i}" aria-label="${i + 1} cups">${stk('latte', '')}</button>`
      : `<span class="drink${i < n ? '' : ' off'}">${stk('latte', '')}</span>`).join('');
    const last = times(v).filter(Boolean).pop();
    return card('caffeine', ctx, `
      <div class="cups">${cups}</div>
      <div class="mini-row"><span class="big-num">${n}<small> cup${n === 1 ? '' : 's'}</small></span>${ctx.mine ? '<button type="button" class="plus-btn" data-act="add-caffeine">＋ cup</button>' : ''}</div>
      ${last ? `<div class="note-sm">last one ${esc(clock(last))}</div>` : ''}`);
  }

  // Medication: tick what you've taken (the time is saved), count "as needed" doses.
  function medsCard(ctx) {
    const list = ctx.mine ? ctx.settings.meds : ctx.def.list || [];
    const taken = ctx.entry.meds || {};
    const scheduled = list.filter(m => !m.asNeeded);
    const done = scheduled.filter(m => (taken[m.id] || []).length).length;
    // Mine: your main medicines, and any taken today; the rest under "N more".
    const { shown, more } = ctx.mine ? foldParts('meds', list, { on: m => (taken[m.id] || []).length > 0 }) : { shown: list, more: '' };
    const rows = shown.map(m => {
      const ts = taken[m.id] || [];
      const info = [m.dose, m.asNeeded ? 'as needed' : m.time ? fmtTime(toMin(m.time)) : ''].filter(Boolean);
      if (m.asNeeded) info.push(ts.length ? `${ts.length} dose${ts.length === 1 ? '' : 's'}${ts.filter(Boolean).length ? ', last ' + clock(ts.filter(Boolean).pop()) : ''}` : 'none today');
      else if (ts.length) info.push(ts[0] ? 'taken ' + clock(ts[0]) : 'taken');
      const tick = ctx.mine
        ? `<button type="button" class="tick${ts.length ? ' on' : ''}${m.asNeeded ? ' prn' : ''}" data-med="${m.id}" aria-pressed="${!!ts.length}" aria-label="${esc(m.name)} ${ts.length ? 'taken' : 'not taken'}"></button>`
        : `<span class="tick${ts.length ? ' on' : ''}${m.asNeeded ? ' prn' : ''}"></span>`;
      return `<div class="med">${tick}<div><b>${esc(m.name)}</b><small>${esc(info.join(' · '))}</small></div>
        ${ctx.mine && m.asNeeded ? `<button type="button" class="plus-btn" data-dose="${m.id}">＋ dose</button>` : ''}</div>`;
    }).join('');
    const low = ctx.mine ? list.filter(m => m.left != null && m.left <= (m.lowAt ?? 5)) : [];
    return card('meds', ctx, `
      ${ctx.mine && list.length ? buttonsTitle(esc(logTitle(day)), 'meds', ctx) : ''}
      ${rows || `<p class="muted small">${ctx.mine ? 'Add the medicines you take, and tick them off each day.' : 'Nothing here yet'}</p>`}
      ${more ? `<div class="chips sm meds-more">${more}</div>` : ''}
      ${low.map(m => `<span class="low">🔔 ${esc(m.name)} is running low: ${m.left} left</span>`).join(' ')}
      ${ctx.mine && !list.length ? '<button type="button" class="open-link" data-act="edit-meds">＋ Add medicines</button>' : ''}`,
    scheduled.length ? `${done} of ${scheduled.length} today` : '');
  }

  // Cycle, laid out like Human Being's check-in card: where you are (the
  // phase wheel, the day of your cycle, the next period), then a block each
  // for the day's log and your period support (the same as on the cycle page:
  // cyclelog.js). ✓ Done keeps it full size, read-only: just what you picked,
  // with ✏️ to edit it again. Your person's card shows only what you share:
  // just the phase, or at "everything" the day, flow and symptoms too (your
  // period support reaches them in their "could use" banner).
  function cycleNow(c, ctx, full) {
    const yours = ctx.mine ? 'your' : 'their';
    if (!c) return `<section class="q-block cyc-now">${ringSVG(null, 76, 10, false)}
      <p class="cyc-next">${ctx.mine ? 'Set the <b>flow</b> on the first day of your period, and your phases will show here.' : 'No period shared yet'}</p></section>`;
    const ph = PHASES[c.phase];
    let day1 = '', next = esc(ph.about);
    if (full) {
      const due = keyToDate(c.nextPeriod).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      day1 = c.phase === 'period' ? `Day ${c.cycleDay} of ${yours} period` : `Day ${c.cycleDay} of about ${c.length}`;
      next = c.phase === 'period' ? `${ctx.mine ? 'Your periods usually last' : 'Usually lasts'} ${c.periodLength} days`
        : c.dueIn > 1 ? `🩸 Next period in about ${c.dueIn} days · ${esc(due)}`
        : c.dueIn === 1 ? '🩸 Period due tomorrow' : c.dueIn === 0 ? '🩸 Period due today'
        : `🩸 Period ${-c.dueIn} day${c.dueIn === -1 ? '' : 's'} later than usual`;
    }
    return `<section class="q-block cyc-now">${ringSVG(c, 76, 10, full)}
      <div><div class="phase-name">${ph.emoji} ${esc(ph.name)}</div>${day1 ? `<div class="cyc-day">${day1}</div>` : ''}<p class="cyc-next">${next}</p></div></section>`;
  }

  function cycleCard(ctx) {
    const c = ctx.preview ? ctx.cycle : cycleOn(ctx.slot, day);
    const v = ctx.entry.cycle || {};
    const full = ctx.mine || ctx.level === 'all';
    const estimate = c ? `<p class="note-sm">Estimates from ${ctx.mine ? 'your' : 'their'} own logs, not medical advice.</p>` : '';
    if (!ctx.mine) {
      // My person's: their phase, and at "everything" what they logged.
      const sym = new Set(v.symptoms || []);
      const bleeding = ['light', 'medium', 'heavy'].includes(v.flow);
      const chips = full ? [bleeding ? '<span class="chip on">🩸 Period</span>' : '',
        ...symptomItems(ctx.slot).filter(s => sym.has(s.id)).map(s => `<span class="chip on">${esc(s.emoji)} ${esc(s.label)}</span>`)].join('') : '';
      return card('cycle', ctx, `${cycleNow(c, ctx, full)}
        ${chips ? `<section class="q-block cyc-view"><span class="rv-label">${esc(logTitle(day))}</span><div class="chips readonly">${chips}</div></section>` : ''}
        ${estimate}`);
    }
    // My person said "On it" to the period support I shared today.
    const t = them();
    const onIt = !ctx.preview && t && (v.support || []).length && ctx.settings.cycle.share !== 'none' && readOnIt(store.partner(), day)
      ? `<p class="on-it-note" style="${colorVars(t.color)}">💗 ${esc(t.name)}'s on it</p>` : '';
    // Period support, picked day by day: your person sees it unless your cycle is just yours.
    const who = ctx.settings.cycle.share === 'none' ? '🔒 just you' : `💞 ${esc(themName())} sees it`;
    if (isDone('cycle', ctx)) {
      return card('cycle', ctx, `${cycleNow(c, ctx, full)}
        ${logView(v, day)}
        ${supportView(v, who)}
        ${onIt}
        <button type="button" class="btn ghost edit-btn" data-undone="cycle">✏️ Edit my cycle log</button>`, '✓ done');
    }
    return card('cycle', ctx, `${cycleNow(c, ctx, full)}
      ${logBlock(v, day, { edit: !ctx.preview })}
      ${supportBlock(v, { note: who, edit: !ctx.preview, extra: onIt })}
      ${estimate}
      <button type="button" class="open-link" data-act="cycle-page">Open cycle ›</button>`);
  }

  // Walk: a ＋ for each of your walk options, today's walks with ✕, the goal,
  // the streak, and when the next nudge to get up is due (see walk.js).
  function walkCard(ctx) {
    if (!ctx.mine) {
      const t = totals(ctx.entry.walk), goal = ctx.def.goal || 3;
      return card('walk', ctx, `<div class="mini-row"><span class="big-num">${t.n}<small>/${goal} walks</small></span><span class="muted small">${t.mins} min</span></div>`, `${t.n} / ${goal}`);
    }
    const w = walkSettings(ctx.settings);
    const list = walksOf(ctx.entry.walk);
    const byId = Object.fromEntries(w.options.map(o => [o.id, o]));
    const t = totals(list);
    const isToday = ctx.preview || day === dayKey();
    const chips = w.options.length ? buttons('walk', w.options, o => `<button type="button" class="chip" data-walk-add="${esc(o.id)}">＋ ${esc(chipLabel(o))}</button>`, () => false) : '';
    const log = list.map((x, i) => `<div class="wl"><span>${esc(byId[x.opt] ? chipLabel(byId[x.opt]) : `🚶 ${x.mins} min`)}</span>${x.at ? `<small>${esc(clock(x.at))}</small>` : ''}
      <button type="button" class="row-x" data-walk-x="${i}" aria-label="Take this walk off">✕</button></div>`).join('');
    const last = lastWalkAt(list);
    let nudge = '';
    if (isToday && w.nudge.on) {
      const next = nextNudge(w.nudge, last, ctx.now || Date.now());
      const when = next && dayKey(new Date(next)) !== day ? `${new Date(next).toLocaleDateString(undefined, { weekday: 'short' })} ${clock(next)}` : next ? clock(next) : '';
      nudge = `${last ? `Last walk ${clock(last)} · ` : ''}${!next ? 'no more nudges this week' : isNative ? `I'll nudge you to get up around ${when}` : `the Android app nudges you to get up around ${when}`}`;
    } else if (isToday && last) nudge = `Last walk ${clock(last)}`;
    const streak = ctx.preview ? ctx.streak : walkStreak(me(), day);
    return card('walk', ctx, `
      ${buttonsTitle('Add a walk', 'walk', ctx)}
      ${chips ? `<div class="chips sm walk-chips">${chips}</div>` : '<p class="muted small">Add the walks you do with ✎ Edit.</p>'}
      ${log ? `<div class="walk-log">${log}</div>` : ''}
      ${nudge ? `<div class="nudge">🔔 ${esc(nudge)}</div>` : ''}
      <div class="tk-foot">${t.n} of ${w.goal} walk${w.goal === 1 ? '' : 's'}${isToday ? ' today' : ''} · ${t.mins} min${streak > 1 ? ` · 🔥 ${streak} days in a row` : ''}</div>
      <button type="button" class="open-link" data-act="walk-settings">⚙️ Walks and nudges ›</button>`,
    `${t.n} / ${w.goal}`);
  }

  const RENDER = { work: workCard, water: c => drinkCard('water', c), caffeine: c => drinkCard('caffeine', c), meds: medsCard, cycle: cycleCard, walk: walkCard };

  function cardFor(id, ctx) {
    if (!RENDER[id] && !(ctx.def && ctx.def.type)) return '';
    // The work day and the cycle stay full size when done (a summary); the rest fold to a line.
    if (id !== 'work' && id !== 'cycle' && isDone(id, ctx)) return foldedCard(id, ctx);
    return RENDER[id] ? RENDER[id](ctx) : ownCard(id, ctx);
  }

  // One card per row. (Water and caffeine sat side by side until v1.4, when
  // every card got the same ✓ Done and 🔒 / 💞, which a half-width card has no room for.)
  const cardsHTML = (ids, ctxFor) => ids.map(id => cardFor(id, ctxFor(id))).join('');

  // ── Previews ───────────────────────────────────────────────────────────
  // A tracker's card drawn from example data, for the tracker list (before
  // you switch it on, and while you make your own). def: an own tracker's
  // definition (built-ins don't need one).
  function previewHTML(id, def) {
    const s = readSettings();
    const ex = example(id, def, s);
    return cardFor(id, { slot: me(), mine: true, preview: true, entry: ex.entry || {}, settings: ex.settings || s, def, ...ex.extra });
  }

  // ── Could use ──────────────────────────────────────────────────────────
  // The period support my person shares for the day, at "just the support"
  // or more (shown without saying it's about their cycle). [{ emoji, label }]
  function theirWants() {
    const p = store.partner();
    const support = Object.fromEntries(supportItems(p).map(x => [x.id, x]));
    return (readDay(p, day).support || []).map(id => support[id]).filter(Boolean);
  }

  // A small banner at the top of the day, with On it.
  function banner() {
    const t = them();
    if (!t) return '';
    const wants = theirWants();
    if (!wants.length) return '';
    const what = wants.map(x => `${x.emoji} ${lower(x.label)}`).join(' · ');
    const onIt = readOnIt(me(), day);
    return `<div class="support-banner" style="${colorVars(t.color)}">
      <span class="avatar">${avatarHTML(t)}</span>
      <div><b>${esc(t.name)} could use</b><span class="what">${esc(what)}</span></div>
      <button type="button" class="plus-btn${onIt ? ' on' : ''}" data-act="on-it" aria-pressed="${!!onIt}">${onIt ? '✓ On it' : '💗 On it'}</button>
    </div>`;
  }

  // ── the page body ──────────────────────────────────────────────────────
  function dayTitle() {
    const today = dayKey();
    const tag = day === today ? ' · today' : day === shiftDay(today, -1) ? ' · yesterday' : day === shiftDay(today, 1) ? ' · tomorrow' : '';
    return `<div class="day-title">${esc(fmtDay(day))}${tag}</div>`;
  }

  function renderBody() {
    body.hidden = mode !== 'day';
    monthEl.hidden = mode !== 'month';
    yearEl.hidden = mode !== 'year';
    cycleEl.hidden = mode !== 'cycle';
    hbEl.hidden = mode !== 'hb';
    if (mode === 'month') { monthView.render(); return; }
    if (mode === 'hb') { hbView.render(); return; }
    if (mode === 'year') { yearView.render(); return; }
    if (mode === 'cycle') { cycleView.render(); return; }
    if (who === 'them' && them()) { body.innerHTML = renderThem(); return; }
    const s = readSettings();
    const entry = readDay(me(), day);
    const own = Object.fromEntries(s.trackers.own.map(d => [d.id, d]));
    const ids = s.trackers.order.filter(id => s.trackers.on[id] && (RENDER[id] || own[id]));
    body.innerHTML = `
      ${banner()}
      ${dayTitle()}
      ${cardsHTML(ids, id => ({ slot: me(), mine: true, entry, settings: s, def: own[id] }))}
      <button type="button" class="add-tracker" data-act="trackers">＋ Add or make a tracker</button>`;
  }

  function renderThem() {
    const t = them();
    const shared = store.readPartner('shared', null) || { trackers: {}, cycle: 'none' };
    const entry = readDay(store.partner(), day);
    const level = cycleLevel(shared);
    // (Sleep or mood shared from an older version have no card any more.)
    const has = id => (id === 'cycle' ? level === 'phase' || level === 'all' : !!shared.trackers[id] && (!!RENDER[id] || !!shared.trackers[id].type));
    const ids = [...new Set([...(shared.order || []), ...BUILT_IN.map(x => x.id), ...Object.keys(shared.trackers)])].filter(has);
    return `
      ${banner()}
      ${dayTitle()}
      <button type="button" class="remind-btn" data-act="remind" style="${colorVars(t.color)}">👉 Remind ${esc(t.name)} to fill something in</button>
      ${ids.length ? cardsHTML(ids, id => ({ slot: store.partner(), mine: false, entry, level, def: shared.trackers[id] ? { id, ...shared.trackers[id] } : {} }))
        : `<section class="card tk tk-empty" style="${colorVars(t.color)}"><div class="card-tape"></div>
            <p>🔒 ${esc(t.name)} hasn't shared any trackers yet.</p>
            <p class="muted small">Trackers start private: ${esc(t.name)} chooses which ones you see.</p></section>`}`;
  }

  function rerender() { renderBody(); refreshDots(); }

  // ── writing ────────────────────────────────────────────────────────────
  const entryNow = () => readDay(me(), day);
  const done = () => { vibrate(8); rerender(); };
  const log = (tracker, value) => { writeMyDay(day, tracker, value); done(); };
  const stamp = () => (day === dayKey() ? Date.now() : null);   // taps on other days have no time

  // The steps themselves are in actions.js, shared with the widgets.
  const setCount = (id, n) => { act.setCount(day, id, n, stamp()); done(); };


  // Your medicines: rename, order and ★ them like any card's buttons, with
  // the form for adding one underneath.
  function medsSheet() {
    editButtons('meds', { onClose: rerender, extra: { html: () => `
        <div class="tk-q add-head">＋ Add a medicine</div>
        <form class="med-form">
          <label class="field"><span>Medicine</span><input class="inp" name="name" maxlength="40" placeholder="e.g. Vitamin D" autocomplete="off" required></label>
          <div class="field two">
            <label><span>Dose <span class="field-hint">· optional</span></span><input class="inp" name="dose" maxlength="30" placeholder="1 tablet" autocomplete="off"></label>
            <label><span>Time <span class="field-hint">· optional</span></span><input class="inp" type="time" name="time"></label>
          </div>
          <div class="field two">
            <label><span>How many left <span class="field-hint">· optional</span></span><input class="inp" type="number" name="left" min="0" max="9999" inputmode="numeric"></label>
            <label class="check-field"><input type="checkbox" name="prn"> <span>Only as needed</span></label>
          </div>
          <button type="submit" class="btn">Add medicine</button>
        </form>`,
    bind: (box, draw) => box.addEventListener('submit', e => {
      if (!e.target.matches('.med-form')) return;
      e.preventDefault();
      const f = e.target, val = n => f.elements.namedItem(n);
      const name = val('name').value.trim();
      if (!name) { val('name').focus(); return; }
      const left = val('left').value === '' ? null : Math.max(0, Math.round(Number(val('left').value)));
      const s = readSettings();
      s.meds = [...s.meds, { id: 'med-' + uid(), name, dose: val('dose').value.trim(), time: val('prn').checked ? '' : val('time').value, asNeeded: val('prn').checked, left, lowAt: 5 }];
      writeSettings(s);
      draw();
    }) } });
  }

  // Taking (or un-taking) a dose; counts down how many are left.
  const dose = (id, add) => { act.dose(day, id, add, stamp()); done(); };

  // 🔒 / 💞 on a card: sharing asks first; making it just yours doesn't.
  // The cycle has more than on and off, so it opens its sharing choice.
  async function toggleShare(id) {
    if (id === 'cycle') { openTrackerSettings('cycle', { onClose: rerender }); return; }
    const s = readSettings();
    const def = s.trackers.own.find(x => x.id === id) || BUILT_IN.find(x => x.id === id);
    if (!def) return;
    const on = !s.trackers.share[id], name = themName();
    if (on) {
      const what = id === 'walk' ? 'how many walks you do and how long' : `your ${lower(def.name)} days`;
      const ok = await confirmSheet(`Share ${def.name} with ${name}?`, `${name} will see ${what}. Tap 💞 again to make it just yours.`, { ok: 'Share' });
      if (!ok) return;
    }
    const st = readSettings();
    st.trackers.share = { ...st.trackers.share, [id]: on };
    writeSettings(st);
    vibrate(8);
    toast(on ? `💞 ${name} can see ${def.name} now` : `🔒 ${def.name} is just yours now`);
    rerender();
  }

  // ── taps ───────────────────────────────────────────────────────────────
  root.addEventListener('click', e => {
    const dayBtn = e.target.closest('[data-day]');
    if (dayBtn && strip.contains(dayBtn)) {
      if (Date.now() - dragEndedAt < 250) return;
      setDay(dayBtn.dataset.day);
      return;
    }
    const w = e.target.closest('[data-who]');
    if (w) { who = w.dataset.who; renderHead(); renderBody(); return; }
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      if (mode === 'day') monthView.leave();
      renderHead();
      renderBody();
      if (mode === 'day') centerOn(day, false);
      return;
    }
    const wk = e.target.closest('[data-work]');
    if (wk) { act.toggleWork(day, wk.dataset.work); done(); return; }
    const walkAdd = e.target.closest('[data-walk-add]');
    if (walkAdd) { act.addWalk(day, walkAdd.dataset.walkAdd, stamp()); done(); return; }
    const walkX = e.target.closest('[data-walk-x]');
    if (walkX) { act.removeWalk(day, Number(walkX.dataset.walkX)); done(); return; }
    const workX = e.target.closest('[data-work-x]');
    if (workX) { act.removeWork(day, workX.dataset.workX); done(); return; }
    const vis = e.target.closest('[data-vis]');
    if (vis) { toggleShare(vis.dataset.vis); return; }
    if (moreTap(e.target)) { renderBody(); return; }
    if (cycleTap(e.target, day)) { done(); return; }
    const editBtns = e.target.closest('[data-edit-btns]');
    if (editBtns) { if (editBtns.dataset.editBtns === 'meds') medsSheet(); else editButtons(editBtns.dataset.editBtns, { onClose: rerender }); return; }
    const fold = e.target.closest('[data-done]');
    if (fold) { saveNote.flush(); act.setDone(day, fold.dataset.done, true); done(); return; }
    const unfold = e.target.closest('[data-undone]');
    if (unfold) { act.setDone(day, unfold.dataset.undone, false); done(); return; }
    const step = e.target.closest('[data-hrs]');
    if (step) { act.stepWork(day, step.dataset.hrs, Number(step.dataset.step)); done(); return; }
    const drink = e.target.closest('[data-drink]');
    if (drink) {
      const id = drink.dataset.drink, i = Number(drink.dataset.i), n = count(entryNow()[id]);
      setCount(id, i + 1 === n ? i : i + 1);
      return;
    }
    const med = e.target.closest('[data-med]');
    if (med) {
      const s = readSettings().meds.find(x => x.id === med.dataset.med);
      const had = ((entryNow().meds || {})[med.dataset.med] || []).length;
      dose(med.dataset.med, s && s.asNeeded ? false : !had);
      return;
    }
    const d = e.target.closest('[data-dose]');
    if (d) { dose(d.dataset.dose, true); return; }
    const own = e.target.closest('[data-own]');
    if (own && own.dataset.op !== 'note') {
      const def = readSettings().trackers.own.find(x => x.id === own.dataset.own);
      if (!def) return;
      const value = entryNow()[def.id];
      if (own.dataset.op === 'type') {
        promptSheet(def.name, { value: value == null ? '' : String(typeof value === 'object' ? value.n : value), placeholder: def.unit || 'a number', ok: 'Save', maxlength: 12 })
          .then(v => { if (v == null) return; const next = typedValue(def, value, v, stamp()); if (next !== undefined) log(def.id, next); });
        return;
      }
      const next = nextValue(def, value, own.dataset.op, own.dataset.v, stamp());
      if (next !== undefined) log(def.id, next);
      return;
    }

    switch (e.target.closest('[data-act]')?.dataset.act) {
      case 'go-today': setDay(dayKey()); break;
      case 'remind': openRemind(); break;
      case 'add-water': setCount('water', count(entryNow().water) + 1); break;
      case 'add-caffeine': setCount('caffeine', count(entryNow().caffeine) + 1); break;
      case 'edit-meds': medsSheet(); break;
      case 'walk-settings': openWalkSettings({ onClose: rerender }); break;
      case 'trackers': openTrackerList({ iconFor, preview: previewHTML, onMeds: medsSheet, onWork: () => openPage('year'), onClose: rerender }); break;
      case 'work-year': openPage('year'); break;
      case 'cycle-page': openPage('cycle'); break;
      case 'ot-start': act.startOvertime(Date.now()); done(); break;
      case 'ot-stop': { const h = act.stopOvertime(Date.now()); done(); toast(`⏱️ ${hrs(h)} h of overtime logged`); break; }
      case 'on-it': {
        const on = !readOnIt(me(), day);
        markOnIt(day, on);
        vibrate(8);
        if (on) toast(`${themName()} will see you're on it 💗`);
        rerender();
        break;
      }
    }
  });

  // Note trackers save as you type (without redrawing under your fingers).
  const saveNote = debounce((id, text) => { writeMyDay(day, id, text.trim() ? text : null); refreshDots(); }, 400);
  root.addEventListener('input', e => {
    const el = e.target.closest('[data-own][data-op="note"]');
    if (el) saveNote(el.dataset.own, el.value);
  });
  root.addEventListener('focusout', e => { if (e.target.closest('[data-op="note"]')) saveNote.flush(); });

  // Changes from my person (or my other devices): redraw what they touch,
  // unless you're in the middle of typing a note.
  store.on((k, source) => {
    if (source !== 'remote' || !root.classList.contains('active')) return;
    if (k.endsWith(':profile')) renderHead();
    const typing = document.activeElement && body.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA';
    if ((/^p:\w:(help|shared(-[\d-]+)?|settings|trackers-[\d-]+|month-stickers)$/.test(k) || /^hb:p:\w:checkins/.test(k)) && !typing) rerender();
  });

  return {
    show() {
      if (followToday && day !== dayKey()) day = dayKey();
      renderHead();
      if (!stripStart || strip.dataset.today !== dayKey() || !strip.clientWidth) buildStrip();
      else { markSelected(); refreshDots(); updateStripChrome(); }
      renderBody();
    },
    /** From a widget: 'cycle' or 'year' (those pages), 'them' (your person's day) or 'today'. */
    open(route) {
      if (route === 'cycle' || route === 'year') { openPage(route); return; }
      if (isPage()) closePage('day');
      if (mode !== 'day') { monthView.leave(); mode = 'day'; }
      who = route === 'them' && them() ? 'them' : 'me';
      renderHead();
      setDay(dayKey());
    },
    /** Android's back button: leaves the work year or cycle page. True if it did. */
    back() {
      if (!isPage()) return false;
      closePage();
      return true;
    },
  };
}
