// Work: financial (or calendar) years, your allowances and how much of each is
// left, all worked out from your work-day logs.
//
// Allowances are annual and sick leave (settings.work.annual / .sick, in days a
// year, with carry.annual / carry.sick and opening.annual / opening.sick) plus
// your own work settings:
//   { id: 'ws-…', emoji, name, amount, unit, type, carry, opening }
//   unit     'days' or 'hours' (a year), 'week' (hours a week), 'number' (just to remember)
//   type     the work type that uses it up ('' for none; for 'week', none = all hours worked)
//   carry    unused days or hours carry into the next financial year
//   opening  what you'd built up before you started logging (carried into your first year)
// Leave in days is hours ÷ your normal day, so half days count as half.

import { myWorkTypes, readMonth } from './docs.js';
import { dayKey, keyToDate, shiftDay } from './util.js';

const pad = n => String(n).padStart(2, '0');
const ymOf = (y, m) => { const d = new Date(y, m - 1, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthShort = m => new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });

export const UNITS = [
  { id: 'days', label: 'days a year', short: 'days' },
  { id: 'hours', label: 'hours a year', short: 'h' },
  { id: 'week', label: 'hours a week', short: 'h' },
  { id: 'number', label: 'just a number', short: '' },
];
export const unitOf = id => UNITS.find(u => u.id === id) || UNITS[0];
export const yearly = a => a.unit === 'days' || a.unit === 'hours';

// ── Years ─────────────────────────────────────────────────────────────────
/** The year starting in month `startMonth` (1–12) of year `y`. */
export function yearFrom(y, startMonth) {
  const months = Array.from({ length: 12 }, (_, i) => ymOf(y, startMonth + i));
  const last = months[11];
  return {
    y, startMonth, months,
    start: `${months[0]}-01`,
    end: dayKey(new Date(+last.slice(0, 4), +last.slice(5), 0)),
    label: startMonth === 1 ? String(y) : `FY ${y}–${String(y + 1).slice(2)}`,
    span: `${monthShort(startMonth)} → ${monthShort(((startMonth + 10) % 12) + 1)}`,
  };
}
/** The year (financial when fy, else calendar) that `day` falls in. */
export function yearOf(day, fy, fyStart) {
  const start = fy ? fyStart : 1;
  const d = keyToDate(day);
  return yearFrom(d.getMonth() + 1 < start ? d.getFullYear() - 1 : d.getFullYear(), start);
}
export const shiftYear = (yr, n) => yearFrom(yr.y + n, yr.startMonth);

/**
 * Reads someone's work days a year at a time (remembered, so a page reads each
 * month once): daysIn(yr) → { "YYYY-MM-DD": { <work type>: hours } }.
 */
export function workReader(slot) {
  const seen = new Map();
  return yr => {
    if (!seen.has(yr.start)) {
      const out = {};
      for (const ym of yr.months) for (const [k, e] of Object.entries(readMonth(slot, ym))) if (e.work) out[k] = e.work;
      seen.set(yr.start, out);
    }
    return seen.get(yr.start);
  };
}

// ── Allowances ────────────────────────────────────────────────────────────
/** Annual and sick leave, then your own work settings. */
export function allowances(w) {
  const built = (id, emoji, name) => ({ id, emoji, name, amount: w[id], unit: 'days', type: id, carry: !!(w.carry || {})[id], opening: (w.opening || {})[id] || 0, builtIn: true });
  return [built('annual', '🌴', 'Annual leave'), built('sick', '🤒', 'Sick leave'), ...(w.own || [])];
}

const toUnit = (a, hours, w) => (a.unit === 'days' ? hours / (w.normalDay || 7.5) : hours);

/**
 * What's left of a yearly allowance in financial year `yr`:
 * { amount, carried, used, booked, left } (booked = days after today).
 * What carries in is what was left the year before, if you logged work that
 * year; otherwise (your first year) it's what you said you had to start with,
 * so a year before you used the app doesn't carry a whole allowance forward.
 */
export function balance(a, yr, w, daysIn, depth = 0) {
  const today = dayKey();
  let used = 0, booked = 0;
  if (a.type) {
    for (const [k, v] of Object.entries(daysIn(yr))) {
      if (v[a.type] == null) continue;
      const n = toUnit(a, v[a.type] || 0, w);
      if (k > today) booked += n; else used += n;
    }
  }
  let carried = 0;
  if (a.carry) {
    const prev = shiftYear(yr, -1);
    carried = depth < 6 && Object.keys(daysIn(prev)).length
      ? Math.max(0, balance(a, prev, w, daysIn, depth + 1).left)
      : Number(a.opening) || 0;
  }
  const amount = Number(a.amount) || 0;
  return { amount, carried, used, booked, left: amount + carried - used - booked };
}

/** Hours this week (Monday to Sunday) for an "hours a week" setting: { used, from, to }. */
export function thisWeek(a, w, slot) {
  const today = dayKey();
  const from = shiftDay(today, -((keyToDate(today).getDay() + 6) % 7));
  const to = shiftDay(from, 6);
  const types = myWorkTypes(w);
  let used = 0;
  for (const ym of new Set([from.slice(0, 7), to.slice(0, 7)])) {
    for (const [k, e] of Object.entries(readMonth(slot, ym))) {
      if (k < from || k > to || !e.work) continue;
      used += a.type ? e.work[a.type] || 0 : types.filter(t => !t.leave).reduce((n, t) => n + (e.work[t.id] || 0), 0);
    }
  }
  return { used, from, to };
}

/** For the day view: the yearly allowances a day's work types use up, with what's left this financial year. */
export function leaveFor(dayWork, day, w, slot) {
  const yr = yearOf(day, true, w.fyStart);
  const daysIn = workReader(slot);
  return allowances(w).filter(a => yearly(a) && a.type && dayWork[a.type] != null && Number(a.amount))
    .map(a => ({ a, yr, ...balance(a, yr, w, daysIn) }));
}
