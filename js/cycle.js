// The cycle, worked out from someone's own logs: when periods started, how
// long cycles and periods usually last, and which phase a day falls in.
// These are estimates from the logs, not medical advice.
//
// A day's cycle entry: { flow: 'spotting' | 'light' | 'medium' | 'heavy',
//   symptoms: [id], support: [id] } (support: "period support" picked that day).
//
// Your person's phone works from the periods you share (shared.cycle.runs, at
// "phase" or "everything"), not your logs: see docs.js.

import * as store from './store.js';
import { arranged, mergeById, readMonth, readSettings } from './docs.js';
import { dayKey, esc, keyToDate, shiftDay } from './util.js';

export const PHASES = {
  period: { name: 'Period', color: '#F2918A', sticker: 'pdrop', emoji: '🩸', about: 'Energy is often lower. Warmth, rest and easy food can help.' },
  follicular: { name: 'Follicular phase', color: '#7CCFAA', sticker: 'sprout', emoji: '🌱', about: 'Energy often builds again after your period. A good time for plans and new things.' },
  ovulation: { name: 'Ovulation', color: '#EDC456', sticker: 'sun', emoji: '🌼', about: 'Many people feel their most social and energetic around now.' },
  luteal: { name: 'Luteal phase', color: '#AE96E8', sticker: 'moon', emoji: '🌙', about: 'Energy can dip and cravings creep in towards the end. Slower days and cosy plans suit this bit of the cycle.' },
};

// The first QUICK show on the day view's card; the cycle page has them all (and your own).
export const SYMPTOMS = [
  { id: 'bloating', emoji: '🎈', label: 'Bloating' },
  { id: 'cravings', emoji: '🍫', label: 'Cravings' },
  { id: 'cramps', emoji: '😣', label: 'Cramps' },
  { id: 'headache', emoji: '🤕', label: 'Headache' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
  { id: 'tender', emoji: '💗', label: 'Tender' },
  { id: 'spots', emoji: '🔴', label: 'Spots' },
  { id: 'backache', emoji: '🔙', label: 'Back ache' },
  { id: 'moods', emoji: '🌀', label: 'Mood swings' },
  { id: 'nausea', emoji: '🤢', label: 'Nausea' },
];
export const QUICK = 5;

// Period support: kept apart from the everyday "What would help", so nothing
// about your cycle slips out unless you share it.
export const SUPPORT = [
  { id: 'heat', emoji: '🔥', label: 'Heat pack' },
  { id: 'choc', emoji: '🍫', label: 'Chocolate' },
  { id: 'bath', emoji: '🛁', label: 'A warm bath' },
  { id: 'pain', emoji: '💊', label: 'Pain relief nearby' },
  { id: 'gentle', emoji: '🫂', label: 'Gentle cuddles' },
  { id: 'slow', emoji: '🛋️', label: 'A slow day' },
];

export const FLOWS = [['', 'None'], ['spotting', 'Spotting'], ['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy']];

/** What your person can see of your cycle (settings.cycle.share). */
export function shareOptions(name) {
  return [
    { id: 'none', label: 'Nothing, just for me', hint: 'the default' },
    { id: 'support', label: 'Just the support', hint: `${name} sees what would help, but not that it's period-related` },
    { id: 'phase', label: 'Phase and period support', hint: `${name} sees which phase you're in, and what would help` },
    { id: 'all', label: 'Everything', hint: 'phase, day of your cycle, flow, symptoms and support' },
  ];
}
export const shareRadios = (level, name) => `<div class="radio-list" role="radiogroup">${shareOptions(name).map(o => `
  <button type="button" class="radio${level === o.id ? ' on' : ''}" data-cshare="${o.id}" role="radio" aria-checked="${level === o.id}"><i></i><span>${esc(o.label)}<small>${esc(o.hint)}</small></span></button>`).join('')}</div>`;

/** How much of their cycle someone shares, from their `shared` document: 'none' | 'phase' | 'all'. */
export function cycleLevel(shared) {
  const c = shared && shared.cycle;
  return c && typeof c === 'object' ? c.level : 'none';
}
const partnerShared = () => store.readPartner('shared', null) || {};
// Mine in my order with my names; my person's with their names (from what they share).
const itemsOf = (slot, list, base) => {
  if (slot !== store.me()) return mergeById(base, list === 'support' ? partnerShared().support : (partnerShared().cycle || {}).symptoms);
  const s = readSettings();
  return arranged(list, [...base, ...(s.cycle[list] || [])], s);
};
/** The period support someone can pick: the built-in ideas and their own. */
export const supportItems = slot => itemsOf(slot, 'support', SUPPORT);
/** The symptoms someone can log: the built-in ones and their own. */
export const symptomItems = slot => itemsOf(slot, 'symptoms', SYMPTOMS);

const DEFAULT_CYCLE = 28, DEFAULT_PERIOD = 5;
const bleeding = e =>!!(e && e.cycle && ['light', 'medium', 'heavy'].includes(e.cycle.flow));
const daysBetween = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);
const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

// Every period in the year up to `upTo`: [{ start, end }], oldest first.
// Mine come from my logs (a period starts on a bleeding day with none in the
// two days before it); my person's from the periods they share.
function periodRuns(slot, upTo) {
  if (slot !== store.me()) {
    const c = (store.readPartner('shared', null) || {}).cycle;
    return ((c && c.runs) || []).filter(r => r.start <= upTo).map(r => ({ start: r.start, end: r.end > upTo ? upTo : r.end }));
  }
  const days = {};
  const d = keyToDate(upTo);
  for (let i = 12; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    Object.assign(days, readMonth(slot, dayKey(m).slice(0, 7)));
  }
  const runs = [];
  for (const k of Object.keys(days).filter(x => x <= upTo && bleeding(days[x])).sort()) {
    const prev = runs[runs.length - 1];
    if (prev && daysBetween(prev.end, k) <= 2) prev.end = k;
    else runs.push({ start: k, end: k });
  }
  return runs;
}

// How long cycles and periods usually last, from the last six of each.
function usual(runs) {
  const lengths = runs.slice(1).map((r, i) => daysBetween(runs[i].start, r.start)).filter(n => n >= 15 && n <= 60).slice(-6);
  const periods = runs.slice(0, -1).map(r => daysBetween(r.start, r.end) + 1).slice(-6);
  return {
    lengths,
    length: lengths.length ? Math.round(avg(lengths)) : DEFAULT_CYCLE,
    periodLength: periods.length ? Math.round(avg(periods)) : DEFAULT_PERIOD,
  };
}

function phaseOf(cycleDay, length, periodDays) {
  const ovulation = length - 14;
  if (cycleDay <= periodDays) return 'period';
  if (cycleDay < ovulation - 1) return 'follicular';
  if (cycleDay <= ovulation + 1) return 'ovulation';
  return 'luteal';
}

/** Someone's cycle as of `day` (looking back a year), or null with no period logged. */
export function cycleOn(slot, day = dayKey()) {
  const runs = periodRuns(slot, day);
  if (!runs.length) return null;
  const { lengths, length, periodLength } = usual(runs);
  const current = runs[runs.length - 1];
  const start = current.start;
  const cycleDay = daysBetween(start, day) + 1;
  const phase = phaseOf(cycleDay, length, Math.max(periodLength, daysBetween(current.start, current.end) + 1));
  const nextPeriod = shiftDay(start, length);
  return { start, end: current.end, cycleDay, length, periodLength, ovulation: length - 14, phase, nextPeriod, dueIn: daysBetween(day, nextPeriod), history: lengths.length, lengths };
}

/** The cycle days each phase covers: { period: [1, 5], follicular: [6, 12], … }. */
export function phaseDays(c) {
  const len = c ? c.length : DEFAULT_CYCLE, per = c ? c.periodLength : DEFAULT_PERIOD, ov = len - 14;
  return { period: [1, per], follicular: [per + 1, ov - 2], ovulation: [ov - 1, ov + 1], luteal: [ov + 2, len] };
}

/** My periods in the last year, as my person's phone gets them (at "phase" or "everything"). */
export const myPeriods = () => periodRuns(store.me(), dayKey());

/**
 * The phase of every day from `from` to `to`, for the month view:
 * { "YYYY-MM-DD": { phase, predicted, bleed } }. Days after today are
 * predictions that repeat the usual cycle (a late period is expected from
 * tomorrow); bleed marks the days of a period that's been logged.
 */
export function phasesBetween(slot, from, to) {
  const today = dayKey();
  const runs = periodRuns(slot, to < today ? to : today);
  if (!runs.length) return {};
  const { length, periodLength } = usual(runs);
  const last = runs[runs.length - 1];
  let next = shiftDay(last.start, length);
  if (next <= today) next = shiftDay(today, 1);
  const out = {};
  let r = 0;
  for (let k = from; k <= to; k = shiftDay(k, 1)) {
    while (r + 1 < runs.length && runs[r + 1].start <= k) r++;
    const run = runs[r];
    if (run.start > k) continue;   // before the first period logged
    const predicted = k > today;
    if (predicted && k >= next) {
      out[k] = { phase: phaseOf((daysBetween(next, k) % length) + 1, length, periodLength), predicted };
      continue;
    }
    const logged = daysBetween(run.start, run.end) + 1;
    out[k] = { phase: phaseOf(daysBetween(run.start, k) + 1, length, run === last ? Math.max(periodLength, logged) : logged), predicted, bleed: k <= run.end };
  }
  return out;
}

/** The phase wheel: the cycle's phases round a ring, with a dot on today (unless dot is false). */
export function ringSVG(c, size = 66, sw = 9, dot = true) {
  const len = c ? c.length : DEFAULT_CYCLE;
  const per = c ? c.periodLength : DEFAULT_PERIOD;
  const ov = len - 14;
  const parts = [['period', per], ['follicular', Math.max(0, ov - 2 - per)], ['ovulation', 3], ['luteal', Math.max(0, len - ov - 1)]];
  const cx = size / 2, r = cx - sw / 2 - 3, C = 2 * Math.PI * r;
  let at = 0, out = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="${sw}"/>`;
  for (const [id, n] of parts) {
    const l = (C * n) / len;
    if (l > sw + 3) out += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${PHASES[id].color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(l - sw - 3).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-(at + sw / 2 + 1.5)).toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"/>`;
    at += l;
  }
  if (c && dot) {
    const a = ((Math.min(c.cycleDay, len) - 0.5) / len) * 2 * Math.PI - Math.PI / 2;
    out += `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cx + r * Math.sin(a)).toFixed(1)}" r="${(sw * 0.62).toFixed(1)}" fill="#fff" stroke="#5B4B5E" stroke-width="${size > 100 ? 3 : 2.2}"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${out}</svg>`;
}
