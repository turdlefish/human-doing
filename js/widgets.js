// Home-screen widgets (the Android app): what they show, and the taps they
// send back.
//
// Widgets can't run this app, so whenever something changes the app hands the
// phone a small summary of today (buildSummary), and doing-android paints the
// widgets from it (WidgetPainter.java), each with its own settings. A tap on a
// widget (a glass of water, a medicine, a ticked task) is queued on the phone
// with the day and time it happened and shown on the widget straight away.
// This app applies the queued taps (applyOps) the next time it runs: at once
// if it's open, otherwise in a hidden copy that the phone starts just for
// that (runHeadless), which also syncs them and brings back a fresh summary.
//
// Summary (version 1):
//   day, at, h12 (12-hour clock), pending (edits not sent yet)
//   me, them        { slot, name, color, avatar, emoji } (them: null until they join)
//   trackers.me     { order: [id], data: { <tracker>: … } } for the trackers you have on
//   trackers.them   the same for what your person shares (or null)
//     work      { types: [{ id, emoji, label, leave }], v: { <type>: hours }, normalDay,
//                 weekOther: hours this week on other days, monthOther: { <type>: { days, ahead, hours } }, timer }
//     water     { n, goal, at: [ms] }        caffeine { n, at: [ms], cutoff: 'HH:MM' | '' }
//     walk      { n, goal, mins, at: [ms], streak, opts: [{ id, emoji, name, label, mins }], last, next,
//                 nudge: { on, every, from, to, days } } (your person's: n, goal, mins only)
//     meds      { list: [{ id, name, dose, time, asNeeded, left, lowAt, color }], taken: { <id>: [ms] } }
//     cycle     { level, phase, phaseName, sticker, length, periodLength, ovulation,
//                 cycleDay?, nextPeriod?, dueIn?, bleeding? } (the day only at "everything"), or { none, level }
//     own-…     { def, v, streak } (streak: days in a row before today)
//   could           the period support your person could use today: [{ emoji, label }]; onIt: you said "On it"
//   todo            { groups (in your shared order), tasks (open, and done this week; rank: their place
//                   in their list once dragged into order, or null), weekFrom (ms), sunday }
//   plan            { from, to, scheds: [{ id, name, type, owner: 'me' | 'them', private, blocks | items }] }
//                   (yours shared and just yours; your person's only the ones they share)
//   stickers        sticker names the widgets need (sent once each as PNGs)
//
// Taps (ops) all carry { op, day, at }; ones about shared things say what they
// should end up as, so a tap made on an out-of-date widget can't undo your
// person's change:
//   water / caffeine { d }          med { id, on } (as needed: { id, add })   med-undo { id }
//   work { type, on, among }        hours { type, step }       ot-start / ot-stop     period { on }
//   own { id, o: inc | dec | yes | scale | opt, v, on }
//   walk { opt }                    walk-undo { wat } (the walk logged at that time, else the last one)
//   tick { id, done, due }          subtick { id, done }       onit { on }

import * as store from './store.js';
import { dayKey, keyToDate, shiftDay, uses12h } from './util.js';
import {
  BUILT_IN, caffeineCutoff, monthOf, myWorkTypes, readDay, readMonth, readMySchedules, readOnIt, readSettings, readTodos, workTypes,
} from './docs.js';
import { PHASES, cycleLevel, cycleOn, supportItems } from './cycle.js';
import { avatarId } from './avatars.js';
import { stickerSrc } from './stickers.js';
import { syncTodoPlan, tickSub, tickTask } from './todo.js';
import { bridge } from './native.js';
import * as act from './actions.js';
import { lastWalkAt, nextNudge, shortLabel, totals, walkMins, walkSettings, walkStreak, walksOf } from './walk.js';

const BLEEDING = ['light', 'medium', 'heavy'];
const PILL_COLORS = ['butter', 'coral', 'sky', 'lavender', 'mint', 'peach', 'pink', 'sage'];
// Stickers the widgets always use: water, coffee, walks, the cycle's phases.
const BASE_STICKERS = ['drop', 'latte', 'sneaker', 'pdrop', 'moon', 'sprout', 'sun', 'blossom', 'clip', 'star', 'check'];

const mondayOf = k => shiftDay(k, -((keyToDate(k).getDay() + 6) % 7));
const nextYm = ym => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const lastOfMonth = k => { const d = keyToDate(k); return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

// Someone's logged days from `from` to `to`.
function daysBetween(slot, from, to) {
  const out = {};
  for (let ym = monthOf(from); ym <= monthOf(to); ym = nextYm(ym)) {
    for (const [k, e] of Object.entries(readMonth(slot, ym))) if (k >= from && k <= to) out[k] = e;
  }
  return out;
}

function person(p, slot) {
  return p ? { slot, name: p.name || '', color: p.color || 'pink', avatar: avatarId(p) || '', emoji: p.emoji || '💗' } : null;
}

// ── Trackers ──────────────────────────────────────────────────────────────
function workData(slot, mine, s, def, day, entry) {
  const types = (mine ? myWorkTypes(s.work) : workTypes(def.types || [])).map(t => ({ id: t.id, emoji: t.emoji, label: t.label, leave: !!t.leave }));
  const leave = new Set(types.filter(t => t.leave).map(t => t.id));
  const mon = mondayOf(day);
  let weekOther = 0;
  for (const [k, e] of Object.entries(daysBetween(slot, mon, shiftDay(mon, 6)))) {
    if (k === day || !e.work) continue;
    for (const [id, h] of Object.entries(e.work)) if (!leave.has(id)) weekOther += h || 0;
  }
  const monthOther = {};
  for (const [k, e] of Object.entries(readMonth(slot, monthOf(day)))) {
    if (k === day || !e.work) continue;
    for (const [id, h] of Object.entries(e.work)) {
      const m = monthOther[id] || (monthOther[id] = { days: 0, ahead: 0, hours: 0 });
      if (k > day) m.ahead++; else m.days++;
      m.hours += h || 0;
    }
  }
  return { types, v: entry.work || {}, normalDay: mine ? s.work.normalDay : 7.5, weekOther, monthOther, timer: mine ? s.work.timer || null : null };
}

function cycleData(slot, mine, level, day, entry) {
  const c = cycleOn(slot, day);
  if (!c) return { none: true, level };
  const base = { level, phase: c.phase, phaseName: PHASES[c.phase].name, sticker: PHASES[c.phase].sticker, length: c.length, periodLength: c.periodLength, ovulation: c.ovulation };
  if (!mine && level !== 'all') return base;   // "phase": no day of the cycle, no flow
  return { ...base, cycleDay: c.cycleDay, nextPeriod: c.nextPeriod, dueIn: c.dueIn, bleeding: BLEEDING.includes((entry.cycle || {}).flow) };
}

// Days in a row (before `day`) with something logged for a tracker.
function streakOf(slot, id, day) {
  const months = {};
  let n = 0;
  for (let k = shiftDay(day, -1); n < 120; k = shiftDay(k, -1)) {
    const ym = monthOf(k);
    const v = ((months[ym] || (months[ym] = readMonth(slot, ym)))[k] || {})[id];
    if (v == null || v === false || v === '') break;
    n++;
  }
  return n;
}

/** Someone's trackers for a day, as the widgets get them (also the iPhone widget's document). */
export function trackerData(slot, day) {
  const mine = slot === store.me();
  const s = mine ? readSettings() : null;
  const shared = mine ? null : store.readPartner('shared', null) || { trackers: {}, cycle: 'none' };
  const level = mine ? 'all' : cycleLevel(shared);
  const entry = readDay(slot, day);
  let ids, defOf;
  if (mine) {
    const own = Object.fromEntries(s.trackers.own.map(d => [d.id, d]));
    ids = s.trackers.order.filter(id => s.trackers.on[id] && (BUILT_IN.some(b => b.id === id) || own[id]));
    defOf = id => own[id] || BUILT_IN.find(b => b.id === id);
  } else {
    const has = id => (id === 'cycle' ? level === 'phase' || level === 'all' : !!(shared.trackers || {})[id]);
    ids = [...new Set([...(shared.order || []), ...BUILT_IN.map(x => x.id), ...Object.keys(shared.trackers || {})])].filter(has);
    defOf = id => ({ id, ...((shared.trackers || {})[id] || {}) });
  }
  const data = {};
  for (const id of ids) {
    const def = defOf(id) || {};
    const v = entry[id];
    switch (id) {
      case 'work': data.work = workData(slot, mine, s, def, day, entry); break;
      case 'water': data.water = { n: act.count(v), goal: (mine ? s.trackers.goals.water : def.goal) || 8, at: act.times(v).filter(Boolean) }; break;
      case 'caffeine': data.caffeine = { n: act.count(v), at: act.times(v).filter(Boolean), cutoff: mine ? caffeineCutoff(s) : '' }; break;
      case 'meds':
        data.meds = {
          list: (mine ? s.meds : def.list || []).map((m, i) => ({
            id: m.id, name: m.name, dose: m.dose || '', time: m.time || '', asNeeded: !!m.asNeeded,
            left: mine && m.left != null ? m.left : null, lowAt: m.lowAt ?? 5, color: PILL_COLORS[i % PILL_COLORS.length],
          })),
          taken: v || {},
        };
        break;
      case 'cycle': data.cycle = cycleData(slot, mine, level, day, entry); break;
      case 'walk': {
        const t = totals(v);
        if (!mine) { data.walk = { n: t.n, mins: t.mins, goal: def.goal || 3 }; break; }
        const w = walkSettings(s), last = lastWalkAt(v);
        data.walk = {
          n: t.n, mins: t.mins, goal: w.goal, at: walksOf(v).map(x => x.at).filter(Boolean), streak: walkStreak(slot, day),
          opts: w.options.map(o => ({ id: o.id, emoji: o.emoji || '🚶', name: o.name || '', label: shortLabel(o), mins: walkMins(o) })),
          last, nudge: w.nudge, next: day === dayKey() ? nextNudge(w.nudge, last) : null,
        };
        break;
      }
      default:
        if (!def.type) break;
        data[id] = {
          def: { id, name: def.name || '', sticker: def.sticker || '', emoji: def.emoji || '', color: def.color || 'mint', type: def.type,
            unit: def.unit || '', goal: def.goal || 0, step: def.step || 1, max: def.max || 5, options: def.options || [], amountUnit: def.amountUnit || '' },
          v: v ?? null,
          streak: streakOf(slot, id, day),
        };
    }
  }
  return { order: ids.filter(id => data[id]), data };
}

// The period support my person shares for today (never marked as their cycle).
function wants(p, day) {
  const support = Object.fromEntries(supportItems(p).map(x => [x.id, x]));
  return (readDay(p, day).support || []).map(id => support[id])
    .filter(Boolean).map(x => ({ emoji: x.emoji, label: x.label }));
}

// ── To-Do and Plan ────────────────────────────────────────────────────────
function todoData(today) {
  const { groups, tasks } = readTodos();
  const mon = mondayOf(today);
  const weekFrom = keyToDate(mon).getTime();
  const key = `plan_${store.me()}`;
  return {
    groups: groups.map(g => ({ id: g.id, name: g.name || '', emoji: g.emoji || '📋', color: g.color || 'mint', private: !!g.private, owner: g.owner })),
    tasks: tasks.filter(t => !t.done || (t.doneAt || 0) >= weekFrom).map(t => ({
      id: t.id, group: t.group, title: t.title || '', sticker: t.sticker || '', owner: t.owner,
      who: t.who && t.who.length ? t.who : [t.owner], due: t.due || '', priority: t.priority || '', repeat: t.repeat || '',
      done: !!t.done, doneAt: t.doneAt || 0, time: t[key] && t[key].time != null ? t[key].time : null, order: t.order ?? t.created ?? 0,
      rank: typeof t.rank === 'number' ? t.rank : null,
      subs: (t.subs || []).map(x => ({ id: x.id, title: x.title || '', done: !!x.done })),
    })),
    weekFrom,
    sunday: shiftDay(mon, 6),
  };
}

// Plans for this month and the week ahead. Daily and weekly schedules repeat,
// so they go as their blocks; monthly ones as the items on those dates.
function planData(today) {
  const from = today.slice(0, 8) + '01';
  const end = lastOfMonth(today), soon = shiftDay(today, 7);
  const to = end > soon ? end : soon;
  const scheds = [];
  // Yours from both documents (shared and just yours); your person's only what they share.
  for (const [owner, list] of [['me', readMySchedules()], ['them', store.readPartner('schedules', null)]]) {
    for (const s of Array.isArray(list) ? list : []) {
      const type = s.type || 'day';
      const out = { id: s.id, name: s.name || '', type, owner, private: !!s.private };
      if (type === 'month') {
        out.items = [];
        for (const [d, items] of Object.entries(s.items || {})) {
          if (d < from || d > to) continue;
          for (const it of items) out.items.push({ d, t: it.time ?? null, title: it.title || '', icon: it.icon || '', color: it.color || 'lavender', todo: !!it.todo });
        }
      } else {
        out.blocks = (s.blocks || []).map(b => ({ day: type === 'week' ? b.day ?? 1 : null, t: b.start, e: b.end, title: b.title || '', icon: b.icon || '', color: b.color || 'lavender' }));
      }
      scheds.push(out);
    }
  }
  return { from, to, scheds };
}

/** Everything the widgets show, as of now. */
export function buildSummary() {
  const day = dayKey();
  const themP = store.readPartner('profile', null);
  const trackers = { me: trackerData(store.me(), day), them: themP ? trackerData(store.partner(), day) : null };
  const todo = todoData(day);
  const stickers = new Set(BASE_STICKERS);
  for (const side of [trackers.me, trackers.them]) {
    for (const t of Object.values(side ? side.data : {})) if (t.def && t.def.sticker) stickers.add(t.def.sticker);
  }
  for (const t of todo.tasks) if (t.sticker) stickers.add(t.sticker);
  return {
    v: 1, day, at: Date.now(), h12: uses12h(), pending: store.pendingCount() > 0,
    me: person(store.readMine('profile', {}), store.me()), them: person(themP, store.partner()),
    trackers,
    could: themP ? wants(store.partner(), day) : [],
    onIt: !!readOnIt(store.me(), day),
    todo,
    plan: planData(day),
    stickers: [...stickers],
  };
}

// ── Taps from the widgets ─────────────────────────────────────────────────
/** Applies widget taps; returns how many there were. */
export function applyOps(ops) {
  for (const o of ops || []) {
    try {
      const at = Number(o.at) || Date.now();
      const day = o.day || dayKey(new Date(at));
      const e = readDay(store.me(), day);
      switch (o.op) {
        case 'water': case 'caffeine': act.addDrink(day, o.op, Number(o.d) || 1, at); break;
        case 'med': {
          const med = readSettings().meds.find(m => m.id === o.id);
          if (!med) break;
          const had = ((e.meds || {})[o.id] || []).length > 0;
          if (med.asNeeded || o.add) act.dose(day, o.id, true, at);
          else if (o.on !== had) act.dose(day, o.id, !!o.on, at);
          break;
        }
        case 'med-undo': act.dose(day, o.id, false, at); break;
        case 'work': if (o.on !== ((e.work || {})[o.type] != null)) act.pickWork(day, o.type, o.among || []); break;
        case 'hours': act.stepWork(day, o.type, Number(o.step) || 0); break;
        case 'ot-start': if (!readSettings().work.timer) act.startOvertime(at); break;
        case 'ot-stop': act.stopOvertime(at); break;
        case 'period': if (o.on !== BLEEDING.includes((e.cycle || {}).flow)) act.togglePeriod(day); break;
        case 'walk': act.addWalk(day, o.opt, at); break;
        case 'walk-undo': {
          const list = walksOf(e.walk);
          const i = o.wat ? list.findIndex(x => x.at === Number(o.wat)) : list.length - 1;
          if (i >= 0) act.removeWalk(day, i);
          break;
        }
        case 'own':
          if (o.o === 'yes' && o.on === (e[o.id] === true)) break;
          act.ownTap(day, o.id, o.o, o.v, at);
          break;
        case 'tick': {
          const t = readTodos().tasks.find(x => x.id === o.id);
          if (!t) break;
          if (o.done === false) { if (t.done) tickTask(o.id); }
          else if (!t.done && (t.due || '') === (o.due || '')) tickTask(o.id);   // not already ticked by your person
          break;
        }
        case 'subtick': {
          const s = readTodos().tasks.flatMap(t => t.subs).find(x => x.id === o.id);
          if (s && !!s.done !== !!o.done) tickSub(o.id);
          break;
        }
        case 'onit': if (!!o.on !== !!readOnIt(store.me(), day)) act.toggleOnIt(day); break;
        default: break;
      }
    } catch (err) {
      console.warn('Human Doing: a widget tap could not be applied', o, err);
    }
  }
  return (ops || []).length;
}

// ── Talking to the phone ──────────────────────────────────────────────────
const native = () => !!(bridge && bridge.updateWidgets);

/** Takes the taps waiting on the phone and applies them; true if there were any. */
export function drainOps() {
  if (!bridge || !bridge.takeWidgetOps) return false;
  let ops = [];
  try { ops = JSON.parse(bridge.takeWidgetOps() || '[]'); } catch (e) { ops = []; }
  if (!ops.length) return false;
  applyOps(ops);
  pushNow();
  return true;
}

// A sticker as a PNG (base64), for the phone to keep.
async function stickerPNG(name, size = 144) {
  const img = new Image();
  img.src = stickerSrc(name);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/png').split(',')[1];
}

const sent = new Set();
async function sendStickers(names) {
  if (!bridge.saveSticker || !bridge.stickerNames) return;
  const have = new Set(String(bridge.stickerNames() || '').split(',').filter(Boolean));
  for (const n of names) {
    if (have.has(n) || sent.has(n)) continue;
    sent.add(n);
    try { bridge.saveSticker(n, await stickerPNG(n)); } catch (e) { sent.delete(n); }
  }
}

let pushTimer = null;
let sentPending = false;   // the last summary said edits were waiting to be sent
/** Sends the widgets a fresh summary (and any stickers they don't have yet). */
export function pushNow() {
  clearTimeout(pushTimer);
  pushTimer = null;
  if (!native() || !store.getSession()) return Promise.resolve();
  const sum = buildSummary();
  sentPending = sum.pending;
  bridge.updateWidgets(JSON.stringify(sum));
  return sendStickers(sum.stickers).catch(() => {});
}
/** The same, a moment later (many edits in a row send one summary). */
export function pushSoon(ms = 500) {
  if (!native()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, ms);
}

/** Starts keeping the widgets up to date while the app runs. */
export function startWidgets() {
  if (!native()) return;
  store.on(() => pushSoon());
  // Once your edits are sent, say so (or the phone would sync again for nothing).
  store.onStatus(s => { if (s.state === 'synced' && sentPending) pushSoon(); });
  drainOps();
  pushNow();
}

/**
 * The hidden copy the phone starts when the app is closed (index.html?widgets):
 * apply the waiting taps, sync, and send the widgets a fresh summary.
 */
export async function runHeadless() {
  try {
    if (!store.getSession()) return;
    drainOps();
    await store.flush();
    await store.pull({ quick: true });
    syncTodoPlan();    // your person's to-do changes, onto your Plan
    drainOps();        // anything tapped meanwhile
    await store.flush();
    await pushNow();
  } catch (e) {
    console.warn('Human Doing: widget sync failed', e);
  } finally {
    if (bridge && bridge.headlessDone) bridge.headlessDone();
  }
}
