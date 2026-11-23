// Walk: get up for a walk now and then. Your own walk options (each with its
// minutes), a walks-a-day goal, a streak, and nudges to get up when you've
// been still for a while. The phone can't tell when you're sitting (no step
// counting), so a nudge counts from your last walk, or from the start of the
// hours you chose. The nudges themselves are notifications from the Android
// app (doing-android WalkNudge.java works them out the same way); the web
// app shows when the next one is due.
//
//   settings.trackers.walk  { options: [{ id, emoji, name, mins, more? }], goal,
//                             nudge: { on, every: 30 | 45 | 60 | 90 (minutes),
//                                      from: 'HH:MM', to: 'HH:MM', days: 'weekdays' | 'all' } }
//                           (more: "30+ min", counted as 15 minutes longer)
//   a day's value           walk: [{ at: ms | null, opt, mins }]
//   your person's copy      walk: { n, mins }

import { WALK_DEFAULT, monthOf, readMonth, readSettings } from './docs.js';
import { clone, dayKey, shiftDay } from './util.js';

export const NUDGE_EVERY = [30, 45, 60, 90];

/** Walk's settings, with anything missing filled in. */
export function walkSettings(s = readSettings()) {
  const w = s.trackers.walk || {};
  return {
    ...clone(WALK_DEFAULT),
    ...w,
    options: Array.isArray(w.options) ? w.options : clone(WALK_DEFAULT.options),
    nudge: { ...WALK_DEFAULT.nudge, ...(w.nudge || {}) },
  };
}

/** The minutes a walk option counts for ("30+" counts as 45). */
export const walkMins = o => (o.mins || 0) + (o.more ? 15 : 0);
/** "15 min", "30+ min". */
export const minsLabel = o => `${o.mins}${o.more ? '+' : ''} min`;
/** An option's button: "🚶 15 min", or "🧘 5 min stretch" when its name isn't a walk. */
export function chipLabel(o) {
  const name = (o.name || '').trim();
  return `${o.emoji || '🚶'} ${minsLabel(o)}${name && !/walk/i.test(name) ? ' ' + name.toLowerCase() : ''}`;
}
/** Short, for the widgets' buttons: "15m", "30+". */
export const shortLabel = o => (o.more ? `${o.mins}+` : `${o.mins}m`);

/** A day's walks (mine: a list; my person's: their { n, mins }). */
export const walksOf = v => (Array.isArray(v) ? v : []);
export function totals(v) {
  if (v && !Array.isArray(v) && typeof v === 'object') return { n: v.n || 0, mins: v.mins || 0 };
  const list = walksOf(v);
  return { n: list.length, mins: list.reduce((m, w) => m + (w.mins || 0), 0) };
}

/** Days in a row with a walk, up to `day` (today without one yet doesn't break it). */
export function walkStreak(slot, day = dayKey()) {
  const months = {};
  const has = k => {
    const ym = monthOf(k);
    return totals(((months[ym] || (months[ym] = readMonth(slot, ym)))[k] || {}).walk).n > 0;
  };
  let k = has(day) ? day : shiftDay(day, -1), n = 0;
  while (n < 400 && has(k)) { n++; k = shiftDay(k, -1); }
  return n;
}

const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/**
 * When the next nudge to get up is due (ms), or null: `every` minutes after
 * your last walk today, or after the start of your hours; again every `every`
 * minutes while you haven't walked; only inside your hours and days.
 */
export function nextNudge(nudge, lastWalk, now = Date.now()) {
  if (!nudge || !nudge.on) return null;
  const every = (Number(nudge.every) || 60) * 60000;
  const from = toMin(nudge.from) ?? 540, to = toMin(nudge.to) ?? 1050;
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const wd = d.getDay();
    if (nudge.days === 'weekdays' && (wd === 0 || wd === 6)) continue;
    const start = d.getTime() + from * 60000, end = d.getTime() + to * 60000;
    let base = start;
    if (i === 0 && lastWalk && lastWalk > base) base = lastWalk;
    let t = base + every;
    while (t <= now) t += every;
    if (t <= end) return t;
  }
  return null;
}

/** The last walk on a day with a time (ms), or 0. */
export const lastWalkAt = v => walksOf(v).reduce((m, w) => Math.max(m, w.at || 0), 0);
