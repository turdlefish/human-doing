// Human Doing's documents: what each one holds, which ones your person's
// phone reads, and helpers for settings, tracker months, "On it" and to-dos.
// store.js does the syncing.
//
// Each person's rows are doing:<space>:p:<slot>:<doc>.
//
//   Just yours (your person's phone never downloads these):
//     settings          trackers switched on and their order, your own trackers,
//                       what you share and tally, work and cycle settings
//     trackers-YYYY-MM  one month of your logs: { "YYYY-MM-DD": { <tracker>: value } }
//     trackers-YYYY     a past year, folded into one: { months: { "YYYY-MM": {…} } }
//     month-stickers    the stickers on your Tracking month pages: { "YYYY-MM": [sticker] }
//     todos-private     your "just mine" groups, with their tasks and subtasks
//     schedules-private your plans that are just yours (see readMySchedules)
//     widget            today's tracker summary for your iPhone widgets (only once
//                       you've copied their script: settings.iphone; see iphone.js)
//
//   Shared with your person:
//     profile           { name, color, avatar, emoji }
//     help              "On it": you've seen the period support your person could use
//                       that day: { onIt: { "YYYY-MM-DD": at } }. (Until v1.3 it also held
//                       "What would help today" (days, own); that's in Human Being now.)
//     shared            what you share: { trackers: { <id>: { name, emoji, color, type, … } }, order: [id],
//                       cycle: 'none' | { level: 'phase' | 'all', runs: [{ start, end }], symptoms? },
//                       support: [your own support items] }
//                       (work's types, the symptoms and support also carry the
//                       built-in buttons you've renamed, by their ids: see arranged)
//     shared-YYYY-MM    the shared trackers' days, copied from trackers-YYYY-MM
//     shared-YYYY       a past year of those
//
//   Your cycle has its own sharing choice (settings.cycle.share), private by default:
//     none     nothing
//     support  just the period support you pick, as a day's `support: [id]`, shown
//              in your person's "could use" banner (nothing says it's your cycle:
//              shared.cycle stays 'none')
//     phase    support, plus your periods (shared.cycle.runs), so their phone can
//              show your phase, but not the day of your cycle, flow or symptoms
//     all      everything: also each day's cycle { flow, symptoms }
//     todos             your shared groups, tasks and subtasks, and your edits to your person's
//     schedules, gifts  Plan, the same as in Human Being
//     stickerbox        your photo stickers (your Human Being ones are shown as well)
//     feedback          notes for making the app better: { items: [note], marks: { <your person's
//                       note id>: { done, t } } } (feedback.js, on Us)
//     nudges            what you've sent your person: reminders, news of your shared
//                       lists, "the app has an update" (nudges.js)
//     profile.appV      the version of the app you have (nudges.js)
//
// A month of logs is a few KB, so logging a glass of water sends (and your
// other devices fetch) one small month, not your whole history.
//
// What a day holds, per tracker (taps on today save their time; ms or null):
//   work      { <work type>: hours }              e.g. { wfh: 7.5, overtime: 1 }
//   water     { n, at: [ms] }    caffeine { n, at: [ms] }
//   meds      { <medicine id>: [ms] }             one entry per dose taken
//   walk      [{ at: ms | null, opt, mins }]      each walk, with its option and minutes (see walk.js);
//             your person gets just { n, mins }
//   cycle     { flow: 'spotting' | 'light' | 'medium' | 'heavy', symptoms: [id], support: [id] }
//   own-…     your own trackers, by kind (see own.js)
//   done      { <tracker>: true }   cards folded away with Done ✓ that day (never shared:
//             not a tracker, so sharedDays leaves it out)
// (Sleep and mood were trackers here until v1.3; they're in Human Being's
// check-in now, and what was logged here was cleared: see cleanUpOldTrackers.)

import * as store from './store.js';
import { clone, dayKey, uid } from './util.js';
// cycle.js reads tracker months from here too; neither uses the other while loading.
import { SUPPORT, SYMPTOMS, myPeriods } from './cycle.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Settings ──────────────────────────────────────────────────────────────
export const BUILT_IN = [
  { id: 'work', name: 'Work day', emoji: '💼', color: 'sky' },
  { id: 'cycle', name: 'Cycle', emoji: '🩸', color: 'coral' },
  { id: 'water', name: 'Water', emoji: '💧', color: 'sky' },
  { id: 'caffeine', name: 'Caffeine', emoji: '☕', color: 'peach' },
  { id: 'meds', name: 'Medication', emoji: '💊', color: 'mint' },
  // An idea (under "More ideas" until you switch it on), with its own settings and nudges.
  { id: 'walk', name: 'Walk', emoji: '🚶', sticker: 'sneaker', color: 'mint', idea: true },
];
// Trackers that were here once (see cleanUpOldTrackers).
const RETIRED = ['sleep', 'mood'];
const RETIRED_KEYS = ['sleep', 'mood', 'moodAt'];

const DEFAULT_SETTINGS = {
  trackers: {
    order: BUILT_IN.filter(t => !t.idea).map(t => t.id),
    on: { work: true, water: true, caffeine: true },
    own: [],              // your own: [{ id: 'own-…', name, sticker, color, type, unit?, goal?, options? }]
    share: {},            // { <tracker>: true }: everything starts private
    tally: { work: true },  // which trackers get a tally on the month view
    goals: { water: 8, caffeine: '14:00' },   // glasses a day; caffeine cut-off ('HH:MM', '' for none)
    month: null,          // which trackers the month view shows: [id] (null: work and cycle)
    walk: null,           // Walk: { options, goal, nudge } (null: WALK_DEFAULT; see walk.js)
    hb: null,             // which of Human Being's check-in values show: { mood, sleep, tired, brain, spoons } (see moodsleep.js)
  },
  // Which one-time clean-ups have run (see cleanUpSettings); missing is 1.
  version: 1,
  // Normal day in hours, financial year's first month (7 = July), leave in days a
  // year (carry: whether unused days carry into the next financial year;
  // opening: days you had before you started logging); types: your own work
  // types [{ id, emoji, label }]; own: your own work settings (see work.js);
  // yearView: the work year by 'fy' or 'cal'endar year; timer: when the
  // overtime timer was started (ms), while it's running.
  work: { normalDay: 7.5, fyStart: 7, annual: 20, sick: 10, carry: { annual: false, sick: false }, opening: { annual: 0, sick: 0 }, types: [], own: [], yearView: 'fy' },
  // Sharing: 'none' | 'support' | 'phase' | 'all'; your own period support
  // items and symptoms: [{ id, emoji, label }].
  cycle: { share: 'none', support: [], symptoms: [] },
  // Medicines: [{ id, name, dose, time: 'HH:MM' | '', asNeeded, left: number | null, lowAt }].
  meds: [],
  // The buttons on each card (see arranged, and buttons.js): { <list>: { names, order, fold } }.
  buttons: {},
};

// Walk's settings to start with: your walk options (minutes; `more`: "or more",
// counted as 15 minutes longer), walks a day, and nudges to get up.
export const WALK_DEFAULT = {
  options: [
    { id: 'w15', emoji: '🚶', name: '15 min walk', mins: 15 },
    { id: 'w30', emoji: '🚶‍♀️', name: '30 min walk', mins: 30 },
    { id: 'wlong', emoji: '🌳', name: 'A long walk', mins: 30, more: true },
    { id: 'wstretch', emoji: '🧘', name: 'Stretch', mins: 5 },
  ],
  goal: 3,
  nudge: { on: true, every: 60, from: '09:00', to: '17:30', days: 'weekdays' },
};

// Fills in whatever a saved document is missing, `depth` levels down (so a
// saved `on: {}` stays empty instead of getting the default trackers back).
function withDefaults(base, saved, depth = 2) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return clone(base);
  const out = { ...saved };
  for (const [k, v] of Object.entries(base)) {
    if (!(k in saved)) out[k] = clone(v);
    else if (depth > 1 && v && typeof v === 'object' && !Array.isArray(v)) out[k] = withDefaults(v, saved[k], depth - 1);
  }
  return out;
}

export const readSettings = () => withDefaults(DEFAULT_SETTINGS, store.readMine('settings', null));

/** Saves my settings, and refreshes what my person can see if sharing changed. */
export function writeSettings(next) {
  const before = readSettings();
  store.writeMine('settings', next);
  const shareOf = s => [s.trackers.share, s.cycle, s.trackers.own, s.trackers.order, s.trackers.goals, sharedWorkTypes(s), s.trackers.share.meds ? s.meds.map(medDef) : null, s.trackers.share.walk ? (s.trackers.walk || WALK_DEFAULT).goal : null,
    renamed('symptoms', SYMPTOMS, s), renamed('support', SUPPORT, s)];
  if (!same(shareOf(before), shareOf(next))) refreshShared();
}

export const trackerList = (s = readSettings()) => [...BUILT_IN, ...s.trackers.own];

// ── Card buttons ──────────────────────────────────────────────────────────
// Each card's buttons can be renamed, put in your order, and folded away
// under "more" unless they're your main ones (buttons.js has the sheet).
// settings.buttons = { <list>: { names: { <id>: { emoji?, label? } }, order: [id], fold: [id] } }
// for the lists work (work types), symptoms and support (the cycle), walk,
// meds and own-… (an Options tracker's options). `names` and `order` are only
// for the lists with built-in buttons; your own buttons (and walks,
// medicines, options) are renamed and ordered where they're kept.

/** A list's buttons with my names, in my order. */
export function arranged(list, items, s = readSettings()) {
  const b = (s.buttons || {})[list] || {};
  const names = b.names || {}, order = b.order || [];
  const out = items.map(x => (names[x.id] ? { ...x, ...names[x.id] } : x));
  if (!order.length) return out;
  const at = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return out.map((x, i) => [x, at(x.id), i]).sort((a, c) => a[1] - c[1] || a[2] - c[2]).map(([x]) => x);
}
/** The built-in buttons I've renamed (what my person needs to show my names). */
export const renamed = (list, base, s = readSettings()) => {
  const names = ((s.buttons || {})[list] || {}).names || {};
  return base.filter(x => names[x.id]).map(x => ({ ...x, ...names[x.id] }));
};
/** Built-in buttons with someone's own (and their renamed built-ins) on top. */
export const mergeById = (base, extra) => {
  const byId = new Map(base.map(x => [x.id, x]));
  for (const x of extra || []) byId.set(x.id, byId.has(x.id) ? { ...byId.get(x.id), ...x } : x);
  return [...byId.values()];
};
/** The caffeine cut-off, 'HH:MM' ('' for none; 2 pm until you change it). */
export const caffeineCutoff = (s = readSettings()) => s.trackers.goals.caffeine ?? '14:00';

// Work day: a day's value is { <type>: hours }, e.g. { wfh: 7.5, overtime: 1 }.
export const WORK_TYPES = [
  { id: 'wfh', emoji: '🏡', label: 'WFH' },
  { id: 'office', emoji: '🏢', label: 'In office' },
  { id: 'overtime', emoji: '⏱️', label: 'Overtime', hours: 1 },
  { id: 'annual', emoji: '🌴', label: 'Annual leave', leave: true },
  { id: 'sick', emoji: '🤒', label: 'Sick', leave: true },
  { id: 'bereave', emoji: '🕊️', label: 'Bereavement', leave: true },
];
// Someone's work types: the built-in ones (with their names for them) and their own.
export const workTypes = (own = readSettings().work.types) => mergeById(WORK_TYPES, own);
/** Whether a work type is one of the built-in ones (renamed or not). */
export const builtInWork = t => WORK_TYPES.some(x => x.id === t.id);
// Your own work types count as leave (not hours worked) once one of your own
// work settings in days or hours a year is used up by them.
const leaveLinked = (w, id) => (w.own || []).some(a => a.type === id && (a.unit === 'days' || a.unit === 'hours'));
const ownWorkTypes = w => (w.types || []).map(t => (leaveLinked(w, t.id) ? { ...t, leave: true } : t));
/** All of my work types, in my order and with my names, my own leave-like ones marked as leave. */
export const myWorkTypes = (w = readSettings().work, s = readSettings()) => arranged('work', [...WORK_TYPES, ...ownWorkTypes(w)], s);
// What my person gets: the built-in ones I've renamed, and my own.
const sharedWorkTypes = s => [...renamed('work', WORK_TYPES, s), ...ownWorkTypes(s.work)];
export const trackerDef = (id, s = readSettings()) => trackerList(s).find(t => t.id === id) || null;

// ── Tracker months ────────────────────────────────────────────────────────
export const monthOf = day => day.slice(0, 7);
const yearOf = ym => ym.slice(0, 4);
const MONTH_DOC = /^(trackers|shared)-(\d{4})-(\d{2})$/;

// One month of logs. Mine come from my private log; my person's from what they share.
function monthIn(slot, kind, ym) {
  const archived = store.read(store.keyFor(slot, `${kind}-${yearOf(ym)}`), null);
  const month = store.read(store.keyFor(slot, `${kind}-${ym}`), null);
  return { ...((archived && archived.months && archived.months[ym]) || {}), ...(month || {}) };
}
export const readMonth = (slot, ym) => monthIn(slot, slot === store.me() ? 'trackers' : 'shared', ym);
export const readDay = (slot, day) => readMonth(slot, monthOf(day))[day] || {};

// Sets one tracker's value for a day in my month doc (or that year's
// archive, once it's been folded in). null removes it.
function putDay(kind, day, tracker, value) {
  const ym = monthOf(day), yDoc = `${kind}-${yearOf(ym)}`;
  const archived = store.readMine(yDoc, null);
  const inArchive = !!(archived && archived.months && archived.months[ym]);
  const month = monthIn(store.me(), kind, ym);
  const entry = { ...(month[day] || {}) };
  if (value == null) delete entry[tracker]; else entry[tracker] = value;
  if (Object.keys(entry).length) month[day] = entry; else delete month[day];
  if (inArchive) {
    store.writeMine(yDoc, { ...archived, months: { ...archived.months, [ym]: month } });
    if (store.readMine(`${kind}-${ym}`, null)) store.writeMine(`${kind}-${ym}`, null);
  } else store.writeMine(`${kind}-${ym}`, month);
}

/** Log (or with value = null, clear) one of my trackers for a day. */
export function writeMyDay(day, tracker, value) {
  const s = readSettings();
  putDay('trackers', day, tracker, value);
  if (!shares(s, tracker)) return;
  for (const [key, v] of Object.entries(sharedParts(s, tracker, value))) putShared(day, key, v);
  if (tracker === 'cycle' && (s.cycle.share === 'phase' || s.cycle.share === 'all')) refreshCycleMeta(s);
}

// ── What my person sees ───────────────────────────────────────────────────
const shares = (s, id) => (id === 'cycle' ? s.cycle.share !== 'none' : !!s.trackers.share[id]);
const medDef = ({ id, name, dose, time, asNeeded }) => ({ id, name, dose, time, asNeeded });

// What my person gets of one tracker's day: { <key>: value, or null for nothing }.
// The cycle splits in two: its own entry (only at "everything") and the
// period support picked that day (at any level but "nothing").
function sharedParts(s, id, value) {
  // Walks: how many and how long, not when.
  if (id === 'walk') return { walk: Array.isArray(value) && value.length ? { n: value.length, mins: value.reduce((m, w) => m + (w.mins || 0), 0) } : null };
  if (id !== 'cycle') return { [id]: value };
  const { support, ...rest } = value || {};
  return {
    cycle: s.cycle.share === 'all' && Object.keys(rest).length ? rest : null,
    support: support && support.length ? support : null,
  };
}

// Sets one key of a day in my shared month, leaving the month alone when
// there's nothing to add or take away.
function putShared(day, key, value) {
  const cur = monthIn(store.me(), 'shared', monthOf(day))[day];
  if (value == null && !(cur && key in cur)) return;
  putDay('shared', day, key, value);
}

function sharedDays(days, s) {
  const out = {};
  for (const [day, entry] of Object.entries(days || {})) {
    const e = {};
    for (const [id, v] of Object.entries(entry)) {
      if (!shares(s, id)) continue;
      for (const [key, sv] of Object.entries(sharedParts(s, id, v))) if (sv != null) e[key] = sv;
    }
    if (Object.keys(e).length) out[day] = e;
  }
  return out;
}

// My cycle as my person's phone gets it: my periods (so it can work out my
// phase) at "phase" and "everything", plus my own symptoms' names at "everything".
function cycleMeta(s) {
  const level = s.cycle.share;
  if (level !== 'phase' && level !== 'all') return 'none';
  return { level, runs: myPeriods(), ...(level === 'all' ? { symptoms: [...renamed('symptoms', SYMPTOMS, s), ...s.cycle.symptoms] } : {}) };
}
function refreshCycleMeta(s) {
  const cur = store.readMine('shared', null);
  if (!cur) { refreshShared(); return; }
  const next = { ...cur, cycle: cycleMeta(s) };
  if (!same(cur, next)) store.writeMine('shared', next);
}

/**
 * Rebuilds everything my person can see of my trackers from my settings and
 * logs, so switching sharing off also takes the old days back out.
 */
export function refreshShared() {
  const s = readSettings();
  const defs = {};
  for (const t of trackerList(s)) {
    if (t.id === 'cycle' || !s.trackers.share[t.id]) continue;
    const { id, ...def } = t;
    if (def.idea === true) delete def.idea;   // a built-in idea (Walk): nothing your person needs
    // What your person needs to draw the card: your goal, work types, medicine names.
    if (id === 'water') def.goal = s.trackers.goals.water;
    if (id === 'work') def.types = sharedWorkTypes(s);
    if (id === 'meds') def.list = s.meds.map(medDef);
    if (id === 'walk') def.goal = (s.trackers.walk || WALK_DEFAULT).goal;
    defs[id] = def;
  }
  const level = s.cycle.share;
  const meta = {
    trackers: defs,
    cycle: cycleMeta(s),
    support: level !== 'none' ? [...renamed('support', SUPPORT, s), ...s.cycle.support] : [],
    order: s.trackers.order.filter(id => defs[id] || (id === 'cycle' && (level === 'phase' || level === 'all'))),
  };
  if (!same(store.readMine('shared', null), meta)) store.writeMine('shared', meta);

  const docs = store.listDocs(store.me()).map(d => d.doc);
  for (const doc of docs) {
    const m = MONTH_DOC.exec(doc);
    if (m && m[1] === 'trackers') {
      const next = sharedDays(store.readMine(doc, null), s);
      const name = `shared-${m[2]}-${m[3]}`;
      const cur = store.readMine(name, null);
      if (!same(cur || {}, next) && (cur || Object.keys(next).length)) store.writeMine(name, next);
    } else if (/^trackers-\d{4}$/.test(doc)) {
      const months = {};
      for (const [ym, days] of Object.entries(store.readMine(doc, {}).months || {})) months[ym] = sharedDays(days, s);
      const name = doc.replace('trackers', 'shared');
      const cur = store.readMine(name, null);
      if (!same(cur, { months })) store.writeMine(name, { months });
    }
  }
}

// ── Plans ─────────────────────────────────────────────────────────────────
// Your plans (Plan's schedules) are shared with your person in `schedules`,
// unless you switch one to just you: those live in `schedules-private`, which
// their phone never downloads. Read and write them together; each plan says
// `private`, and `pos` keeps your one order across the two documents.
export function readMySchedules() {
  const shared = store.readMine('schedules', null), priv = store.readMine('schedules-private', null);
  if (!Array.isArray(shared) && !Array.isArray(priv)) return null;
  const all = [...(shared || []).map(s => ({ ...s, private: false })), ...(priv || []).map(s => ({ ...s, private: true }))];
  return all.map((s, i) => [s, s.pos ?? i]).sort((a, b) => a[1] - b[1]).map(([s]) => s);
}
export function writeMySchedules(list) {
  const out = list.map(({ private: p, ...s }, i) => [!!p, { ...s, pos: i }]);
  const shared = out.filter(([p]) => !p).map(([, s]) => s), priv = out.filter(([p]) => p).map(([, s]) => s);
  if (!same(store.readMine('schedules', null), shared)) store.writeMine('schedules', shared);
  const cur = store.readMine('schedules-private', null);
  if ((cur || priv.length) && !same(cur || [], priv)) store.writeMine('schedules-private', priv);
}

// ── Month view stickers ───────────────────────────────────────────────────
// Each month page of your trackers can be decorated, like a Plan month. Just
// yours: your person's phone never downloads them.
export const readMonthStickers = () => store.readMine('month-stickers', null) || {};
export function writeMonthStickers(pages) {
  const out = {};
  for (const [ym, list] of Object.entries(pages)) if (list && list.length) out[ym] = list;
  store.writeMine('month-stickers', out);
}

// ── On it ─────────────────────────────────────────────────────────────────
// "On it" for the period support your person shares: always shared, both
// ways, in the `help` document. Old days drop off after ON_IT_KEEP_DAYS.
// ("What would help today?" lived here until v1.3; it's in Human Being now,
// so its old `days` and `own` are dropped the next time this is saved.)
const ON_IT_KEEP_DAYS = 45;

const onItDoc = slot => ((store.read(store.keyFor(slot, 'help'), null) || {}).onIt || {});
export const readOnIt = (slot, day) => onItDoc(slot)[day] || 0;

/** "On it": I've seen what my person could use today. */
export function markOnIt(day, on = true) {
  const onIt = { ...onItDoc(store.me()) };
  if (on) onIt[day] = Date.now(); else delete onIt[day];
  const cutoff = dayKey(new Date(Date.now() - ON_IT_KEEP_DAYS * 864e5));
  for (const k of Object.keys(onIt)) if (k < cutoff) delete onIt[k];
  store.writeMine('help', { onIt });
}

// ── To-Do ─────────────────────────────────────────────────────────────────
// Groups, tasks and subtasks live in the document of whoever made them:
// "todos" for shared groups (and anything added to one), "todos-private" for
// "just mine" groups. You can't write your person's documents, so editing or
// ticking something of theirs is kept in YOUR todos as an edit:
//
//   edits: { "<id>": { <field>: [value, editedAt] } }
//
// Everything remembers when each of its fields last changed (mt), and both
// phones show the newest change field by field, so ticking different
// subtasks at the same moment never undoes the other person's tick.
//
//   group { id, name, emoji, color, order, created, mt }
//   task  { id, group, title, sticker, who: ['a'] | ['b'] | ['a','b'], due, repeat,
//           priority: 'low' | '' | 'high', notes, done, doneAt, doneBy,
//           plan_a, plan_b, order, created, mt }
//   sub   { id, task, title, done, doneAt, order, created, mt }
// plan_a / plan_b: that person put the task on their Plan calendar
// ({ sched, time, item, placed }); one field each, so you can both do it.
// Deleting something of your person's is an edit too: { removed: [true, ms] }.

const KINDS = { group: 'groups', task: 'tasks', sub: 'subs' };
const todoDoc = (slot, name) => withDefaults({ groups: [], tasks: [], subs: [], edits: {} }, store.read(store.keyFor(slot, name), null));

function resolve(obj, edits) {
  const out = { ...obj };
  for (const [f, [v, at]] of Object.entries(edits || {})) {
    if (at > ((obj.mt || {})[f] || obj.created || 0)) out[f] = v;
  }
  return out;
}

/**
 * Everything on both lists, as each phone should show it:
 * { groups, tasks } with each task's subtasks in task.subs, and every item
 * marked with its owner (slot) and whether it's private.
 */
export function readTodos() {
  const m = store.me(), p = store.partner();
  const mine = todoDoc(m, 'todos'), priv = todoDoc(m, 'todos-private'), theirs = todoDoc(p, 'todos');
  const out = { groups: [], tasks: [], subs: [] };
  const add = (doc, owner, isPrivate, edits) => {
    for (const [kind, list] of Object.entries(KINDS)) {
      for (const o of doc[list]) {
        const r = isPrivate ? { ...o } : resolve(o, edits[o.id]);
        if (!r.removed) out[list].push({ ...r, owner, private: isPrivate });
      }
    }
  };
  add(mine, m, false, theirs.edits);
  add(priv, m, true, {});
  add(theirs, p, false, mine.edits);
  const byOrder = (x, y) => (x.order ?? x.created) - (y.order ?? y.created);
  const groups = out.groups.sort(byOrder);
  const groupIds = new Set(groups.map(g => g.id));
  const tasks = out.tasks.filter(t => groupIds.has(t.group)).sort(byOrder);
  const taskIds = new Set(tasks.map(t => t.id));
  const subs = out.subs.filter(s => taskIds.has(s.task)).sort(byOrder);
  tasks.forEach(t => { t.subs = subs.filter(s => s.task === t.id); });
  return { groups, tasks };
}

// Where something lives: { owner, doc } or null.
function locate(kind, id) {
  const list = KINDS[kind];
  for (const [owner, doc] of [[store.me(), 'todos'], [store.me(), 'todos-private'], [store.partner(), 'todos']]) {
    if (todoDoc(owner, doc)[list].some(o => o.id === id)) return { owner, doc };
  }
  return null;
}

// Saves one of my to-do documents, dropping edits that no longer matter.
function saveTodoDoc(name, d) {
  if (name === 'todos') {
    const theirs = todoDoc(store.partner(), 'todos');
    const objs = new Map(Object.values(KINDS).flatMap(l => theirs[l].map(o => [o.id, o])));
    for (const [id, e] of Object.entries(d.edits)) {
      const o = objs.get(id);
      if (!o) { delete d.edits[id]; continue; }
      for (const [f, [, at]] of Object.entries(e)) if (((o.mt || {})[f] || 0) >= at) delete e[f];
      if (!Object.keys(e).length) delete d.edits[id];
    }
  }
  store.writeMine(name, d);
}

/**
 * Adds a group ({ name, emoji, color, private }), a task ({ group, title, … })
 * or a subtask ({ task, title, … }); returns its id. Anything in a private
 * group stays private.
 */
export function addTodo(kind, fields) {
  const { private: isPrivate, ...rest } = fields;
  const parent = kind === 'task' ? locate('group', fields.group) : kind === 'sub' ? locate('task', fields.task) : null;
  const name = (kind === 'group' ? isPrivate : parent && parent.doc === 'todos-private') ? 'todos-private' : 'todos';
  const obj = { id: uid(), ...rest, created: Date.now(), mt: {} };
  const d = todoDoc(store.me(), name);
  d[KINDS[kind]].push(obj);
  saveTodoDoc(name, d);
  return obj.id;
}

/** Changes some fields of a group, task or subtask, whoever made it. */
export function editTodo(kind, id, patch) {
  const where = locate(kind, id);
  if (!where) return;
  const now = Date.now();
  if (where.owner === store.me()) {
    const d = todoDoc(store.me(), where.doc);
    const obj = d[KINDS[kind]].find(o => o.id === id);
    Object.assign(obj, patch);
    obj.mt = { ...obj.mt };
    for (const f of Object.keys(patch)) obj.mt[f] = now;
    saveTodoDoc(where.doc, d);
  } else {
    const d = todoDoc(store.me(), 'todos');
    const e = { ...(d.edits[id] || {}) };
    for (const [f, v] of Object.entries(patch)) e[f] = [v, now];
    d.edits[id] = e;
    saveTodoDoc('todos', d);
  }
}

/** Deletes a group (with what's in it), task (with its subtasks) or subtask. */
export function removeTodo(kind, id) {
  const where = locate(kind, id);
  if (!where) return;
  if (where.owner !== store.me()) { editTodo(kind, id, { removed: true }); return; }
  const d = todoDoc(store.me(), where.doc);
  const gone = new Set([id]);
  if (kind === 'group') d.tasks.filter(t => t.group === id).forEach(t => gone.add(t.id));
  if (kind !== 'sub') d.subs.filter(s => gone.has(s.task)).forEach(s => gone.add(s.id));
  for (const list of Object.values(KINDS)) d[list] = d[list].filter(o => !gone.has(o.id));
  saveTodoDoc(where.doc, d);
}

// Moves my tasks (with their subtasks), and a group if given, between my two
// to-do documents, so "just mine" things never sit in the shared one.
function relocate(fromDoc, toDoc, { groupId, taskIds }) {
  const src = todoDoc(store.me(), fromDoc), dst = todoDoc(store.me(), toDoc);
  const tasks = new Set(taskIds);
  const take = (list, test) => { dst[list].push(...src[list].filter(test)); src[list] = src[list].filter(o => !test(o)); };
  if (groupId) take('groups', g => g.id === groupId);
  take('tasks', t => tasks.has(t.id));
  take('subs', s => tasks.has(s.task));
  saveTodoDoc(fromDoc, src);
  saveTodoDoc(toDoc, dst);
}

/**
 * Puts a task in another group. One of mine moves to my other document when
 * it goes between a shared group and a "just mine" one (your person's tasks
 * can only go to shared groups).
 */
export function moveTask(id, groupId) {
  const from = locate('task', id), to = locate('group', groupId);
  if (!from || !to) return;
  editTodo('task', id, { group: groupId });
  const target = to.doc === 'todos-private' ? 'todos-private' : 'todos';
  if (from.owner === store.me() && from.doc !== target) relocate(from.doc, target, { taskIds: [id] });
}

/** Makes one of my groups "just mine" (or shared again), taking my tasks in it along. */
export function setGroupPrivate(id, makePrivate) {
  const from = locate('group', id);
  if (!from || from.owner !== store.me()) return;
  const target = makePrivate ? 'todos-private' : 'todos';
  if (from.doc === target) return;
  const ids = todoDoc(store.me(), from.doc).tasks.filter(t => t.group === id).map(t => t.id);
  relocate(from.doc, target, { groupId: id, taskIds: ids });
}

// ── One-time clean-ups ────────────────────────────────────────────────────
// settings.version says which have run. Each runs once, after a successful
// sync (so a phone that hasn't downloaded your logs yet can't miss any, and a
// new phone never writes default settings over your real ones).
//   2 (v1.3)  Sleep and mood moved to Human Being: what was logged of them here
//             is deleted from your months, archives and shared copies, and they
//             come out of the tracker settings.
export function cleanUpOldTrackers() {
  if (!store.getSession() || !store.readMine('settings', null)) return false;
  const s = readSettings();
  if (s.version >= 2) return false;
  const strip = days => {
    let changed = false;
    const out = {};
    for (const [day, entry] of Object.entries(days || {})) {
      const e = { ...entry };
      for (const k of RETIRED_KEYS) if (k in e) { delete e[k]; changed = true; }
      if (Object.keys(e).length) out[day] = e; else changed = true;
    }
    return changed ? out : null;
  };
  for (const { doc } of store.listDocs(store.me())) {
    if (/^trackers-\d{4}-\d{2}$/.test(doc)) {
      const next = strip(store.readMine(doc, null));
      if (next) store.writeMine(doc, next);
    } else if (/^trackers-\d{4}$/.test(doc)) {
      const archive = store.readMine(doc, null);
      if (!archive || !archive.months) continue;
      const months = {};
      let changed = false;
      for (const [ym, days] of Object.entries(archive.months)) {
        const next = strip(days);
        months[ym] = next || days;
        if (next) changed = true;
      }
      if (changed) store.writeMine(doc, { ...archive, months });
    }
  }
  const t = s.trackers;
  t.order = t.order.filter(id => !RETIRED.includes(id));
  for (const k of ['on', 'share', 'tally']) { t[k] = { ...t[k] }; for (const id of RETIRED) delete t[k][id]; }
  if (Array.isArray(t.month)) t.month = t.month.filter(id => !RETIRED.includes(id));
  s.version = 2;
  store.writeMine('settings', s);
  refreshShared();   // the shared copies, rebuilt from the cleaned months
  return true;
}

// ── Tidying ───────────────────────────────────────────────────────────────
// A past year's months are folded into one archive document once they're
// two months old (so late edits still land in the small month documents).
export function tidyMyDocs() {
  if (!store.getSession()) return;
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const cutoff = dayKey(new Date(now.getFullYear(), now.getMonth() - 2, 1)).slice(0, 7);
  const byYear = {};
  for (const { doc } of store.listDocs(store.me())) {
    const m = MONTH_DOC.exec(doc);
    if (!m || m[2] >= thisYear || `${m[2]}-${m[3]}` >= cutoff) continue;
    const days = store.readMine(doc, null);
    if (!days) continue;   // already folded
    ((byYear[`${m[1]}-${m[2]}`] = byYear[`${m[1]}-${m[2]}`] || {}))[`${m[2]}-${m[3]}`] = { doc, days };
  }
  for (const [yDoc, months] of Object.entries(byYear)) {
    const archive = store.readMine(yDoc, null) || { months: {} };
    const next = { ...archive, months: { ...archive.months } };
    for (const [ym, { days }] of Object.entries(months)) next.months[ym] = { ...(next.months[ym] || {}), ...days };
    store.writeMine(yDoc, next);
    for (const { doc } of Object.values(months)) store.writeMine(doc, null);
  }
}
