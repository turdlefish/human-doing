// Logging a tracker: the same steps whether you tap the day view, a
// home-screen widget or a reminder's "Taken" button. `at` is when the tap
// happened (ms), or null for a tap on a day other than today (those have no
// time). Widget taps carry the day and time they were made, so a tap that
// waits a while to reach the app still lands on the right day.

import * as store from './store.js';
import { readDay, readSettings, workTypes, writeMyDay, writeSettings, markOnIt, readOnIt } from './docs.js';
import { nextValue } from './own.js';
import { walkMins, walkSettings, walksOf } from './walk.js';
import { dayKey } from './util.js';

export const count = v => (typeof v === 'number' ? v : (v && v.n) || 0);
export const times = v => (v && Array.isArray(v.at) ? v.at : []);
const entry = day => readDay(store.me(), day);
const BLEEDING = ['light', 'medium', 'heavy'];

// ── Water and caffeine: { n, at: [ms] } ───────────────────────────────────
export function setCount(day, id, n, at) {
  const v = entry(day)[id];
  let ts = times(v).slice(0, count(v));
  while (ts.length < n) ts.push(at);
  ts = ts.slice(0, n);
  writeMyDay(day, id, n ? { n, at: ts } : null);
}
export const addDrink = (day, id, delta, at) => setCount(day, id, Math.max(0, count(entry(day)[id]) + delta), at);

// ── Medication: { <medicine id>: [ms] }, one entry per dose ───────────────
/** Takes (or un-takes) a dose and counts the pack down (or back up). */
export function dose(day, id, add, at) {
  const s = readSettings();
  const med = s.meds.find(m => m.id === id);
  if (!med) return;
  const taken = { ...(entry(day).meds || {}) };
  const ts = [...(taken[id] || [])];
  if (add) ts.push(at); else if (ts.length) ts.pop(); else return;
  if (ts.length) taken[id] = ts; else delete taken[id];
  if (med.left != null) {
    med.left = Math.max(0, med.left + (add ? -1 : 1));
    writeSettings(s);
  }
  writeMyDay(day, 'meds', Object.keys(taken).length ? taken : null);
}
/** A widget's medicine sticker: taken / not taken, or one more dose of an "as needed" one. */
export function tapMed(day, id, at) {
  const med = readSettings().meds.find(m => m.id === id);
  if (!med) return;
  const had = ((entry(day).meds || {})[id] || []).length;
  dose(day, id, med.asNeeded ? true : !had, at);
}

// ── Work day: { <work type>: hours } ──────────────────────────────────────
export function setWork(day, fn) {
  const v = { ...(entry(day).work || {}) };
  fn(v);
  writeMyDay(day, 'work', Object.keys(v).length ? v : null);
}
/** The day view's chips: each type on or off (a new one gets your normal day). */
export function toggleWork(day, typeId) {
  const s = readSettings();
  const t = workTypes(s.work.types).find(x => x.id === typeId);
  if (!t) return;
  setWork(day, v => { if (v[t.id] != null) delete v[t.id]; else v[t.id] = t.hours ?? s.work.normalDay; });
}
/**
 * A widget's work types work like a radio: picking one swaps out the other
 * types shown on that widget (`among`), keeping their hours; picking the one
 * that's on clears it. Overtime and types not on the widget are left alone.
 */
export function pickWork(day, typeId, among = []) {
  const s = readSettings();
  const t = workTypes(s.work.types).find(x => x.id === typeId);
  if (!t) return;
  setWork(day, v => {
    if (v[t.id] != null) { delete v[t.id]; return; }
    let hours = t.hours ?? s.work.normalDay;
    for (const id of among) {
      if (id === t.id || id === 'overtime' || v[id] == null) continue;
      hours = v[id];
      delete v[id];
    }
    v[t.id] = t.hours ?? hours;
  });
}
export const stepWork = (day, typeId, step) => setWork(day, v => { v[typeId] = Math.min(24, Math.max(0, (v[typeId] || 0) + step)); });
/** ✕ on a work-day line: takes that type off the day. */
export const removeWork = (day, typeId) => setWork(day, v => { delete v[typeId]; });

/** The overtime timer (settings.work.timer: when it started). */
export function startOvertime(at) {
  const s = readSettings();
  s.work.timer = at;
  writeSettings(s);
}
/** Stops the overtime timer and adds its time (to the nearest quarter hour) to the day it started. Returns the hours. */
export function stopOvertime(at) {
  const s = readSettings();
  const start = s.work.timer;
  if (!start) return 0;
  delete s.work.timer;
  writeSettings(s);
  const h = Math.max(0.25, Math.round((at - start) / 9e5) / 4);
  setWork(dayKey(new Date(start)), v => { v.overtime = Math.min(24, (v.overtime || 0) + h); });
  return h;
}

// ── Walk: [{ at, opt, mins }] (see walk.js) ───────────────────────────────
/** Logs a walk of one of your options (the first one if it's gone). */
export function addWalk(day, optId, at) {
  const { options } = walkSettings();
  const o = options.find(x => x.id === optId) || options[0];
  if (!o) return;
  writeMyDay(day, 'walk', [...walksOf(entry(day).walk), { at: at || null, opt: o.id, mins: walkMins(o) }]);
}
/** ✕ on a walk: takes it off (i: its place in the day's list). */
export function removeWalk(day, i) {
  const list = walksOf(entry(day).walk).filter((_, j) => j !== i);
  writeMyDay(day, 'walk', list.length ? list : null);
}

// ── Done ✓: { <tracker>: true }, the cards folded away that day ───────────
// Just yours: the shared copies only ever take tracker ids, so this never
// reaches your person.
export function setDone(day, id, on) {
  const d = { ...(entry(day).done || {}) };
  if (on) d[id] = true; else delete d[id];
  writeMyDay(day, 'done', Object.keys(d).length ? d : null);
}

// ── Cycle ─────────────────────────────────────────────────────────────────
/** 🩸 Period: today's flow on (medium) or off. */
export function togglePeriod(day) {
  const v = { ...(entry(day).cycle || {}) };
  if (BLEEDING.includes(v.flow)) delete v.flow; else v.flow = 'medium';
  writeMyDay(day, 'cycle', Object.keys(v).length ? v : null);
}

// ── Your own trackers (see own.js) ────────────────────────────────────────
export function ownTap(day, id, op, v, at) {
  const def = readSettings().trackers.own.find(x => x.id === id);
  if (!def) return;
  const next = nextValue(def, entry(day)[id], op, v, at);
  if (next !== undefined) writeMyDay(day, id, next);
}

// ── "On it" for the period support your person shares ─────────────────────
export const toggleOnIt = day => markOnIt(day, !readOnIt(store.me(), day));
