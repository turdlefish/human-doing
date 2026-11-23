// Human Doing 📋 home-screen widgets for iPhone, through the free Scriptable app.
//
// Made for you by Human Doing (Us → On your home screen → iPhone widgets).
// Paste it into a new Scriptable script called "Human Doing", then add a
// Scriptable widget to your home screen (or lock screen) and pick this script.
//
// What a widget shows: long-press it → Edit Widget → Parameter, and type one of
//   (nothing)      your trackers today, and any period support your person could use
//   todo           your to-do lists       (also: todo mine, todo <a group's name>)
//   plan           what's up next         (also: plan today, plan week)
//   meds, work, water, caffeine, walk, cycle, cycle discreet,
//   or the name of one of your own trackers
// and add "them" for your person's (only what they share), e.g. "water them".
//
// iPhone widgets only show things: tap one to open Human Doing. They look for
// changes about every 20 minutes (iOS decides exactly when), share one look
// when they refresh together, and download only what changed.

const SPACE = "%%SPACE%%";
const ME = "%%ME%%";
const APP_URL = "%%APP_URL%%";
const SB_URL = "%%SB_URL%%";
const SB_KEY = "%%SB_KEY%%";
const H12 = %%H12%%;
const COLORS = %%COLORS%%;   // name: [bg, mid, strong, ink, dark bg]
const SUPPORT = %%SUPPORT%%; // period support ideas: id: [emoji, label]
const WORK = %%WORK%%;       // built-in work types: [id, emoji, label, leave]

const THEM = ME === "a" ? "b" : "a";
const NS = "doing:" + SPACE + ":p:";
const BUILT = ["work", "cycle", "water", "caffeine", "meds", "walk"];
// The app's drawn stickers, as emoji.
const STICKERS = { wateringcan: "🪴", sprout: "🌱", tulip: "🌷", clover: "🍀", yarn: "🧶", books: "📚", sneaker: "👟", dumbbell: "🏋️",
  yogamat: "🧘", bicycle: "🚲", bubble: "🫧", headphones: "🎧", palette: "🎨", guitar: "🎸", camera: "📷", gamepad: "🎮",
  puzzle: "🧩", heart: "💗", star: "⭐", sun: "☀️", moon: "🌙", drop: "💧", latte: "☕", boba: "🧋", strawberry: "🍓",
  cupcake: "🧁", candle: "🕯️", letter: "💌", broom: "🧹", laundry: "🧺", spray: "🧴", trophy: "🏆", check: "✅", sponge: "🧽",
  bucket: "🪣", washer: "🫧", iron: "👔", groceries: "🛒", pdrop: "🩸", blossom: "🌸", clip: "📋" };
const PHASES = { period: ["🩸", "period", "#F2918A"], follicular: ["🌱", "follicular", "#7CCFAA"], ovulation: ["🌼", "ovulation", "#EDC456"], luteal: ["🌙", "luteal", "#AE96E8"] };

// ── Dates and times ───────────────────────────────────────────────────────
const pad = n => (n < 10 ? "0" : "") + n;
const dayKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const keyDate = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const shift = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const daysBetween = (a, b) => Math.round((keyDate(b) - keyDate(a)) / 864e5);
const TODAY = dayKey(new Date());
const MONTH = TODAY.slice(0, 7);
const NOW = new Date().getHours() * 60 + new Date().getMinutes();
function time(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  if (H12) return ((h % 12) || 12) + (m ? ":" + pad(m) : "") + (h < 12 ? "am" : "pm");
  return pad(h) + ":" + pad(m);
}
const clock = ms => { const d = new Date(ms); return time(d.getHours() * 60 + d.getMinutes()); };
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const hrs = n => String(Math.round((n || 0) * 100) / 100);
const fmt = (k, o) => keyDate(k).toLocaleDateString(undefined, o);
function dueShort(due) {
  if (due === TODAY) return "today";
  if (due === shift(TODAY, 1)) return "tomorrow";
  if (due < TODAY) return "overdue";
  return daysBetween(TODAY, due) < 7 ? fmt(due, { weekday: "short" }) : fmt(due, { day: "numeric", month: "short" });
}

// ── Loading: only what changed since last time ────────────────────────────
const WANT = [ME + ":widget", ME + ":profile", ME + ":help", ME + ":todos", ME + ":todos-private", ME + ":schedules", ME + ":schedules-private",
  THEM + ":profile", THEM + ":shared", THEM + ":shared-" + MONTH, THEM + ":todos", THEM + ":schedules"].map(k => NS + k);

async function api(query) {
  const r = new Request(SB_URL + "/rest/v1/tb_store" + query);
  r.headers = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
  return await r.loadJSON();
}
const later = (x, y) => !y || Date.parse(x) > Date.parse(y);
const quoted = k => '"' + k + '"';

async function load() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.cacheDirectory(), "human-doing-" + SPACE + "-" + ME + ".json");
  let cache = null;
  try { cache = fm.fileExists(path) ? JSON.parse(fm.readString(path)) : null; } catch (e) { cache = null; }
  if (!cache || cache.v !== 1) cache = { v: 1, cursor: {}, stamps: {}, docs: {} };
  // Several widgets refresh together: one look every few minutes does for all of them.
  if (cache.checked && Date.now() - cache.checked < 4 * 60 * 1000 && WANT.every(k => k in cache.docs)) return { docs: cache.docs, offline: false };
  let offline = false;
  try {
    // One small question: whose rows changed since the last look ("[]" when nothing has).
    const like = s => "key.like." + quoted(NS + s + ":*");
    const part = s => (cache.cursor[s] ? "and(" + like(s) + ",updated_at.gt." + quoted(cache.cursor[s]) + ")" : like(s));
    const rows = await api("?select=key,updated_at&or=" + encodeURIComponent("(" + part("a") + "," + part("b") + ")"));
    const next = Object.assign({}, cache.cursor);
    const need = new Set();
    for (const r of rows || []) {
      const slot = r.key.split(":")[3];
      if (later(r.updated_at, next[slot])) next[slot] = r.updated_at;
      if (WANT.includes(r.key) && cache.stamps[r.key] !== r.updated_at) need.add(r.key);
    }
    for (const k of WANT) if (!(k in cache.docs)) need.add(k);   // e.g. a new month's document
    if (need.size) {
      const got = await api("?select=key,value,updated_at&key=" + encodeURIComponent("in.(" + Array.from(need).map(quoted).join(",") + ")"));
      for (const k of need) cache.docs[k] = null;
      for (const r of got || []) {
        let v = r.value;
        if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
        cache.docs[r.key] = v && v.d !== undefined ? v.d : null;
        cache.stamps[r.key] = r.updated_at;
      }
    }
    for (const k of Object.keys(cache.docs)) if (!WANT.includes(k)) { delete cache.docs[k]; delete cache.stamps[k]; }
    cache.cursor = next;
    cache.checked = Date.now();
    fm.writeString(path, JSON.stringify(cache));
  } catch (e) {
    offline = true;
  }
  return { docs: cache.docs, offline };
}

// ── Working things out (as the app does) ──────────────────────────────────
const count = v => (typeof v === "number" ? v : (v && v.n) || 0);
const times = v => (v && Array.isArray(v.at) ? v.at.filter(Boolean) : []);
const BLEEDING = ["light", "medium", "heavy"];
const PILLS = ["butter", "coral", "sky", "lavender", "mint", "peach", "pink", "sage"];
function phaseOf(day, length, periodDays) {
  const ov = length - 14;
  if (day <= periodDays) return "period";
  if (day < ov - 1) return "follicular";
  if (day <= ov + 1) return "ovulation";
  return "luteal";
}
const avg = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
// When Walk's next nudge to get up is due (as nextNudge in the app's walk.js), or null.
function nextNudge(nudge, last) {
  if (!nudge || !nudge.on) return null;
  const every = (Number(nudge.every) || 60) * 60000, now = Date.now();
  const from = toMin(nudge.from), to = toMin(nudge.to);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    if (nudge.days === "weekdays" && (d.getDay() === 0 || d.getDay() === 6)) continue;
    const start = d.getTime() + (from == null ? 540 : from) * 60000, end = d.getTime() + (to == null ? 1050 : to) * 60000;
    let t = (i === 0 && last > start ? last : start) + every;
    while (t <= now) t += every;
    if (t <= end) return t;
  }
  return null;
}

// Your person's cycle, from the periods they share.
function cycleFromRuns(runs, level, entry) {
  runs = (runs || []).filter(r => r.start <= TODAY).map(r => ({ start: r.start, end: r.end > TODAY ? TODAY : r.end }));
  if (!runs.length) return { none: true, level };
  const lengths = runs.slice(1).map((r, i) => daysBetween(runs[i].start, r.start)).filter(n => n >= 15 && n <= 60).slice(-6);
  const periods = runs.slice(0, -1).map(r => daysBetween(r.start, r.end) + 1).slice(-6);
  const length = lengths.length ? Math.round(avg(lengths)) : 28;
  const periodLength = periods.length ? Math.round(avg(periods)) : 5;
  const cur = runs[runs.length - 1];
  const cycleDay = daysBetween(cur.start, TODAY) + 1;
  const phase = phaseOf(cycleDay, length, Math.max(periodLength, daysBetween(cur.start, cur.end) + 1));
  const base = { level, phase, length, periodLength };
  if (level !== "all") return base;
  const nextPeriod = shift(cur.start, length);
  return Object.assign(base, { cycleDay, nextPeriod, dueIn: daysBetween(TODAY, nextPeriod), bleeding: BLEEDING.includes(((entry || {}).cycle || {}).flow) });
}

// What your person shares, as tracker data for today.
function theirTrackers(docs) {
  const sh = docs[NS + THEM + ":shared"] || { trackers: {}, cycle: "none" };
  const month = docs[NS + THEM + ":shared-" + MONTH] || {};
  const e = month[TODAY] || {};
  const defs = sh.trackers || {};
  const level = sh.cycle && typeof sh.cycle === "object" ? sh.cycle.level : "none";
  const has = id => (id === "cycle" ? level === "phase" || level === "all" : !!defs[id]);
  const ids = Array.from(new Set([].concat(sh.order || [], BUILT, Object.keys(defs)))).filter(has);
  const data = {};
  for (const id of ids) {
    const def = defs[id] || {}, v = e[id];
    if (id === "work") {
      // The built-in types, with your person's names for them (their renamed ones share an id), then their own.
      const own = def.types || [];
      const types = WORK.map(t => Object.assign({ id: t[0], emoji: t[1], label: t[2], leave: t[3] }, own.find(x => x.id === t[0]) || {}));
      data.work = { types: types.concat(own.filter(x => !WORK.some(t => t[0] === x.id))), v: v || {}, timer: null };
    }
    else if (id === "water") data.water = { n: count(v), goal: def.goal || 8, at: times(v) };
    else if (id === "caffeine") data.caffeine = { n: count(v), at: times(v), cutoff: "" };
    else if (id === "walk") data.walk = { n: (v && v.n) || 0, mins: (v && v.mins) || 0, goal: def.goal || 3 };
    else if (id === "meds") data.meds = { list: (def.list || []).map((m, i) => Object.assign({ color: PILLS[i % 8], left: null }, m)), taken: v || {} };
    else if (id === "cycle") data.cycle = cycleFromRuns(sh.cycle && sh.cycle.runs, level, e);
    else if (def.type) data[id] = { def: Object.assign({ id, step: 1, max: 5, options: [] }, def), v: v == null ? null : v, streak: 0 };
  }
  return { order: ids.filter(id => data[id]), data };
}

// Your own trackers come from the app (your "widget" document). A day or more
// old, they're moved on to today: nothing logged yet, the cycle a day further.
function myTrackers(docs) {
  const w = docs[NS + ME + ":widget"];
  if (!w || !w.trackers) return null;
  const days = daysBetween(w.day, TODAY);
  if (days <= 0) return w.trackers;
  const data = {};
  for (const id of Object.keys(w.trackers.data)) {
    const d = w.trackers.data[id];
    if (id === "water" || id === "caffeine") data[id] = Object.assign({}, d, { n: 0, at: [] });
    else if (id === "meds") data[id] = { list: d.list, taken: {} };
    else if (id === "walk") data[id] = Object.assign({}, d, { n: 0, mins: 0, at: [], last: 0, streak: days === 1 && d.n > 0 ? d.streak : 0 });
    else if (id === "work") data[id] = Object.assign({}, d, { v: {} });
    else if (id === "cycle" && d.cycleDay) {
      const cycleDay = d.cycleDay + days;
      data[id] = Object.assign({}, d, { cycleDay, dueIn: d.dueIn - days, bleeding: false, phase: phaseOf(cycleDay, d.length, d.periodLength) });
    } else if (d.def) data[id] = Object.assign({}, d, { v: null, streak: 0 });
    else data[id] = d;
  }
  return { order: w.trackers.order, data };
}

// What your person could use today: the period support they share.
function couldUse(docs) {
  const sh = docs[NS + THEM + ":shared"] || {};
  const sup = {};
  for (const x of sh.support || []) sup[x.id] = [x.emoji, x.label];
  const month = docs[NS + THEM + ":shared-" + MONTH] || {};
  const out = [];
  for (const id of (month[TODAY] || {}).support || []) { const x = sup[id] || SUPPORT[id]; if (x) out.push(x); }   // their names first
  return out;
}

// Both of your lists, as each phone shows them (docs.js readTodos).
function todos(docs) {
  const doc = slot => Object.assign({ groups: [], tasks: [], subs: [], edits: {} }, docs[NS + slot] || {});
  const mine = doc(ME + ":todos"), priv = doc(ME + ":todos-private"), theirs = doc(THEM + ":todos");
  const resolve = (o, edits) => {
    const out = Object.assign({}, o);
    for (const f of Object.keys(edits || {})) { const e = edits[f]; if (e[1] > ((o.mt || {})[f] || o.created || 0)) out[f] = e[0]; }
    return out;
  };
  const all = { groups: [], tasks: [], subs: [] };
  const add = (d, owner, isPrivate, edits) => {
    for (const list of ["groups", "tasks", "subs"]) for (const o of d[list] || []) {
      const r = isPrivate ? Object.assign({}, o) : resolve(o, edits[o.id]);
      if (!r.removed) all[list].push(Object.assign(r, { owner, private: isPrivate }));
    }
  };
  add(mine, ME, false, theirs.edits || {});
  add(priv, ME, true, {});
  add(theirs, THEM, false, mine.edits || {});
  const byOrder = (x, y) => (x.order != null ? x.order : x.created) - (y.order != null ? y.order : y.created);
  const groups = all.groups.sort(byOrder);
  const gids = new Set(groups.map(g => g.id));
  const tasks = all.tasks.filter(t => gids.has(t.group)).sort(byOrder);
  const tids = new Set(tasks.map(t => t.id));
  const subs = all.subs.filter(s => tids.has(s.task)).sort(byOrder);
  for (const t of tasks) { t.subs = subs.filter(s => s.task === t.id); t.who = t.who && t.who.length ? t.who : [t.owner]; }
  return { groups, tasks };
}

// What's planned on a date, from the first monthly calendar (or your first plan).
function planOn(docs, d, theirsToo) {
  // Yours shared and just yours, in your order (as the app's readMySchedules).
  const mine = (docs[NS + ME + ":schedules"] || []).concat(docs[NS + ME + ":schedules-private"] || [])
    .map((s, i) => [s, s.pos == null ? i : s.pos]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  const s0 = mine.find(s => s.type === "month") || mine[0];
  if (!s0) return null;
  const list = [s0].concat(theirsToo ? (docs[NS + THEM + ":schedules"] || []).filter(s => (s.type || "day") === (s0.type || "day")) : []);
  const wd = keyDate(d).getDay();
  const out = [];
  for (const s of list) {
    const owner = s === s0 ? ME : THEM;
    if (s.type === "month") for (const it of (s.items || {})[d] || []) out.push({ t: it.time == null ? null : it.time, e: null, title: it.title || "", icon: it.icon || "", color: it.color || "lavender", owner });
    else for (const b of s.blocks || []) if (s.type !== "week" || b.day === wd) out.push({ t: b.start, e: b.end, title: b.title || "", icon: b.icon || "", color: b.color || "lavender", owner });
  }
  out.name = s0.name;
  return out.sort((a, b) => (a.t == null ? -1 : a.t) - (b.t == null ? -1 : b.t));
}

// One tracker as a tile: { icon, big, small, color } (as on the Android widget).
function tile(id, d, single) {
  if (id === "work") {
    const on = d.types.filter(t => d.v[t.id] != null);
    const worked = on.filter(t => !t.leave).reduce((s, t) => s + d.v[t.id], 0);
    const main = on.filter(t => t.id !== "overtime");
    const icon = (main[0] || on[0] || { emoji: "💼" }).emoji;
    if (!on.length) return { icon, big: "—", small: d.timer ? "⏱ since " + clock(d.timer) : "work day", color: "sky" };
    const leaveOnly = !worked && on.every(t => t.leave);
    return { icon, color: "sky", big: leaveOnly ? (main[0].id === "annual" ? "Leave" : main[0].label) : hrs(worked) + "h",
      small: d.timer ? "⏱ since " + clock(d.timer) : main.map(t => t.label).join(" + ") + (d.v.overtime ? " +" + hrs(d.v.overtime) + "h" : "") };
  }
  if (id === "cycle") {
    if (d.none) return { icon: "🩸", big: "—", small: "cycle", color: "coral" };
    const p = PHASES[d.phase] || PHASES.luteal;
    return d.cycleDay ? { icon: p[0], big: "Day " + d.cycleDay, small: p[1], color: "coral" } : { icon: p[0], big: p[1], small: "phase", color: "coral" };
  }
  if (id === "water") return { icon: "💧", big: d.n + "/" + d.goal, small: d.n === 1 ? "glass" : "glasses", color: "sky" };
  if (id === "caffeine") {
    const last = d.at[d.at.length - 1], cut = toMin(d.cutoff);
    const late = last && cut != null && new Date(last).getHours() * 60 + new Date(last).getMinutes() > cut;
    return { icon: "☕", big: String(d.n), small: late ? "past cut-off" : d.n === 1 ? "cup" : "cups", color: "peach" };
  }
  if (id === "walk") return { icon: "🚶", big: d.n + "/" + (d.goal || 3), small: d.n === 1 ? "walk" : "walks", color: "mint" };
  if (id === "meds") {
    const sched = d.list.filter(m => !m.asNeeded);
    const taken = m => (d.taken[m.id] || []).length > 0;
    const next = sched.filter(m => !taken(m) && m.time).sort((a, b) => toMin(a.time) - toMin(b.time))[0];
    const doses = d.list.filter(m => m.asNeeded).reduce((s, m) => s + (d.taken[m.id] || []).length, 0);
    return { icon: "💊", color: "mint", big: sched.length ? sched.filter(taken).length + "/" + sched.length : String(doses),
      small: next ? next.name + " " + time(toMin(next.time)) : sched.length && sched.every(taken) ? "all taken ✓" : sched.length ? "to take" : "doses" };
  }
  const o = d.def, v = d.v;
  let big = "—";
  if (o.type === "yesno") big = v === true ? "✓ done" : "not yet";
  else if (o.type === "count") { const n = count(v); big = o.goal ? hrs(n) + "/" + hrs(o.goal) : hrs(n); }
  else if (o.type === "amount") big = typeof v === "number" ? (hrs(v) + " " + (o.unit || "")).trim() : "—";
  else if (o.type === "scale") big = v ? v + "/" + (o.max || 5) : "—";
  else if (o.type === "options") { const p = (v && v.picked) || []; const x = (o.options || []).find(x => x.id === p[0]); big = x ? x.label : "—"; }
  else if (o.type === "note") big = v ? "📝" : "—";
  return { icon: STICKERS[o.sticker] || o.emoji || "✨", big, small: single ? "today" : o.name, color: o.color || "mint" };
}

// ── Drawing ───────────────────────────────────────────────────────────────
const C = name => COLORS[name] || COLORS.pink;
const dyn = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const INK = dyn("#5B4B5E", "#EEF2FF"), SOFT = dyn("#8C7B8F", "#AEB9DC"), FAINT = dyn("#BCAFBE", "#6E7AA6");
const tint = name => dyn(C(name)[0], C(name)[4]);          // --c-bg
const mid = name => new Color(C(name)[1]);                    // --c-mid
const ink = name => dyn(C(name)[3], C(name)[1]);            // --c-ink
const SURFACE = dyn("#FFFFFF", "#283562");

function text(stack, s, size, color, weight, lines) {
  const t = stack.addText(String(s));
  t.font = weight === "heavy" ? Font.heavyRoundedSystemFont(size) : weight === "bold" ? Font.boldRoundedSystemFont(size)
    : weight === "semi" ? Font.semiboldRoundedSystemFont(size) : Font.mediumRoundedSystemFont(size);
  t.textColor = color || INK;
  t.lineLimit = lines || 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function header(w, title, color, right, emoji) {
  const h = w.addStack();
  h.centerAlignContent();
  if (emoji) { text(h, emoji, 13); h.addSpacer(4); }
  text(h, title, 14, ink(color), "bold");
  h.addSpacer();
  if (right) text(h, right, 10, SOFT);
  w.addSpacer(6);
  return h;
}

function tileBox(parent, t, width, height) {
  const b = parent.addStack();
  b.size = new Size(width, height);
  b.backgroundColor = tint(t.color);
  b.cornerRadius = 12;
  b.setPadding(4, 6, 4, 4);
  b.centerAlignContent();
  text(b, t.icon, 17);
  b.addSpacer(5);
  const v = b.addStack();
  v.layoutVertically();
  text(v, t.big, 13, ink(t.color), "bold");
  text(v, t.small, 9, SOFT);
  b.addSpacer();
  return b;
}

function tiles(w, side, cols, rows, width) {
  const ids = side.order.slice(0, cols * rows);
  const gap = 5, tw = (width - gap * (cols - 1)) / cols;
  for (let r = 0; r * cols < ids.length; r++) {
    const row = w.addStack();
    row.spacing = gap;
    for (let c = 0; c < cols; c++) {
      const id = ids[r * cols + c];
      if (id) tileBox(row, tile(id, side.data[id]), tw, 36);
      else { const s = row.addStack(); s.size = new Size(tw, 36); }
    }
    w.addSpacer(gap);
  }
}

function pill(w, s, color) {
  const b = w.addStack();
  b.backgroundColor = tint(color);
  b.cornerRadius = 10;
  b.setPadding(4, 8, 4, 8);
  text(b, s, 10, ink(color), "semi");
  b.addSpacer();
  return b;
}

function note(w, s) {
  text(w, s, 12, SOFT, "", 3);
}

// The cycle's phases round a ring (with a dot on the day when there is one).
function ring(c, size) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const sw = Math.max(5, size * 0.11), cx = size / 2, r = cx - sw / 2 - 2;
  const len = c.length || 28, per = c.periodLength || 5, ov = len - 14;
  const parts = [["period", per], ["follicular", Math.max(0, ov - 2 - per)], ["ovulation", 3], ["luteal", Math.max(0, len - ov - 1)]];
  const arc = (from, to, color) => {
    const p = new Path();
    const steps = Math.max(2, Math.ceil((to - from) * 40));
    for (let i = 0; i <= steps; i++) {
      const a = (from + (to - from) * i / steps) * 2 * Math.PI - Math.PI / 2;
      const pt = new Point(cx + r * Math.cos(a), cx + r * Math.sin(a));
      if (i) p.addLine(pt); else p.move(pt);
    }
    ctx.addPath(p);
    ctx.setStrokeColor(new Color(color));
    ctx.setLineWidth(sw);
    ctx.strokePath();
  };
  arc(0, 1, "#E9E1EC");
  let at = 0;
  for (const [id, n] of parts) {
    const gap = (sw + 3) / (2 * Math.PI * r) / 2;
    if (n > 0) arc(at / len + gap, (at + n) / len - gap, PHASES[id][2]);
    at += n;
  }
  if (c.cycleDay) {
    const a = ((Math.min(c.cycleDay, len) - 0.5) / len) * 2 * Math.PI - Math.PI / 2;
    const x = cx + r * Math.cos(a), y = cx + r * Math.sin(a), d = sw * 1.25;
    ctx.setFillColor(new Color("#5B4B5E"));
    ctx.fillEllipse(new Rect(x - d / 2 - 1.5, y - d / 2 - 1.5, d + 3, d + 3));
    ctx.setFillColor(Color.white());
    ctx.fillEllipse(new Rect(x - d / 2, y - d / 2, d, d));
  }
  return ctx.getImage();
}

// ── Each kind of widget ───────────────────────────────────────────────────
function trackWidget(w, data, fam, width, them) {
  const who = them ? data.them : data.me;
  const side = them ? data.theirs : data.mine;
  header(w, them ? (who ? who.name + "'s day" : "Their day") : "Tracking", "pink", fam === "small" ? "" : fmt(TODAY, { weekday: "short", day: "numeric", month: "short" }), "📋");
  if (!side) { note(w, them ? "Your person hasn't joined yet 💌" : "Open Human Doing once, and this fills in 🌱"); return; }
  if (!side.order.length) { note(w, them ? (who ? who.name : "Your person") + " hasn't shared any trackers yet" : "Switch some trackers on in Human Doing"); return; }
  const cols = fam === "small" ? 2 : 3, rows = fam === "large" ? 3 : 2;
  tiles(w, side, cols, rows, width);
  if (!them && fam !== "small" && data.them && data.could.length) {
    const s = "💞 " + data.them.name + " could use: " + data.could.map(x => x[0] + " " + x[1].toLowerCase()).join(" · ") + (data.onIt ? " · ✓ on it" : "");
    pill(w, s, "lavender");
    w.addSpacer(5);
  }
  if (fam === "large" && !them) { w.addSpacer(4); todoRows(w, data, {}, 4); }
}

function todoRows(w, data, opt, max, small) {
  const { groups, tasks } = data.todo;
  const g = opt.group ? groups.find(x => x.name.toLowerCase() === opt.group) : null;
  let list = tasks.filter(t => !t.done && (!g || t.group === g.id));
  if (opt.mine) list = list.filter(t => t.who.includes(ME));
  const prio = t => (t.priority === "high" ? 0 : t.priority === "low" ? 2 : 1);
  const byDue = (a, b) => ((a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : prio(a) - prio(b));
  // One list: in the order you dragged it into (as the app), the rest by due date.
  const ranked = t => typeof t.rank === "number";
  list.sort(g ? (a, b) => (ranked(a) !== ranked(b) ? (ranked(a) ? -1 : 1) : ranked(a) ? a.rank - b.rank || byDue(a, b) : byDue(a, b)) : byDue);
  if (!list.length) { note(w, "Nothing to do 🌱"); return; }
  for (const t of list.slice(0, max)) {
    const row = w.addStack();
    row.centerAlignContent();
    row.url = APP_URL + "#todo:task:" + t.id;
    const box = row.addStack();
    box.size = new Size(14, 14);
    box.cornerRadius = 4.5;
    box.borderWidth = 1.5;
    box.borderColor = mid("mint");
    box.backgroundColor = SURFACE;
    row.addSpacer(7);
    text(row, (STICKERS[t.sticker] ? STICKERS[t.sticker] + " " : "") + t.title, 12, INK, "semi");
    row.addSpacer();
    const tag = small ? (t.priority === "high" ? "❗" : "")
      : [t.priority === "high" ? "❗" : "", t.due ? dueShort(t.due) : "", t.subs.length ? t.subs.filter(s => s.done).length + "/" + t.subs.length : ""].filter(Boolean).join(" · ");
    if (tag) text(row, tag, 9, t.due && t.due < TODAY ? ink("coral") : ink("mint"), "semi");
    if (data.them && t.who.length && !small) { row.addSpacer(4); text(row, t.who.map(s => (s === ME ? data.me : data.them).emoji || "💗").join(""), 10); }
    w.addSpacer(5);
  }
  if (list.length > max) text(w, "+ " + (list.length - max) + " more", 9, FAINT);
}

function todoWidget(w, data, fam, opt) {
  const g = opt.group ? data.todo.groups.find(x => x.name.toLowerCase() === opt.group) : null;
  header(w, g ? g.name : "To-Do", "mint", fam === "small" ? "" : g ? "" : "All lists", g ? g.emoji : "✅");
  const mon = shift(TODAY, -((keyDate(TODAY).getDay() + 6) % 7)), from = keyDate(mon).getTime(), sun = shift(mon, 6);
  const tasks = data.todo.tasks.filter(t => !g || t.group === g.id);
  const done = tasks.filter(t => t.doneAt >= from && t.doneAt < from + 7 * 864e5).length;
  const due = tasks.filter(t => !t.done && t.due && t.due <= sun).length;
  if (done + due > 0 && fam !== "small") {
    text(w, done + " of " + (done + due) + " done this week" + (done === done + due ? " 🎉" : ""), 10, SOFT);
    w.addSpacer(5);
  }
  todoRows(w, data, opt, fam === "large" ? 11 : 4, fam === "small");
}

function block(w, it, sub, strong, data) {
  const b = w.addStack();
  b.layoutVertically();
  b.backgroundColor = strong ? mid(it.color) : tint(it.color);
  b.cornerRadius = 9;
  b.setPadding(4, 8, 4, 8);
  const top = b.addStack();
  text(top, (it.icon ? it.icon + " " : "") + (it.title || "Untitled") + (it.owner === THEM && data.them ? " · " + data.them.name : ""), 12, strong ? new Color(C(it.color)[3]) : INK, "bold");
  top.addSpacer();
  text(b, sub, 9.5, strong ? new Color(C(it.color)[3]) : SOFT);
  w.addSpacer(5);
}

function planWidget(w, data, fam, opt) {
  const docs = data.docs;
  const today = planOn(docs, TODAY, opt.them);
  if (!today) { header(w, "Plan", "lavender", "", "🗓️"); note(w, "Make a plan in Human Doing"); return; }
  if (opt.week) {
    header(w, "This week", "lavender", today.name, "🗓️");
    for (let i = 0; i < 7; i++) {
      const d = shift(TODAY, i), items = planOn(docs, d, opt.them);
      const row = w.addStack();
      row.centerAlignContent();
      const day = row.addStack();
      day.size = new Size(44, 0);
      text(day, fmt(d, { weekday: "short" }) + " " + keyDate(d).getDate(), 10, i ? SOFT : ink("lavender"), "semi");
      text(row, items.length ? items.map(x => (x.icon ? x.icon + " " : "") + x.title + (x.t != null ? " " + time(x.t) : "")).join(" · ") : "—", 10, items.length ? INK : FAINT);
      row.addSpacer();
      w.addSpacer(fam === "large" ? 8 : 2);
    }
    return;
  }
  const when = it => (it.t == null ? "today" : time(it.t) + (it.e != null ? " – " + time(it.e) : ""));
  if (opt.today) {
    header(w, "Today", "lavender", today.name, "🗓️");
    if (!today.length) note(w, "Nothing planned today 🌿");
    for (const it of today.slice(0, fam === "large" ? 7 : fam === "medium" ? 3 : 2)) block(w, it, when(it), false, data);
    return;
  }
  header(w, "Up next", "lavender", fam === "small" ? "" : today.name, "🗓️");
  const left = today.filter(it => it.t == null || (it.e != null ? it.e : it.t + 60) > NOW);
  const max = fam === "large" ? 6 : fam === "medium" ? 3 : 2;
  if (left.length) {
    left.slice(0, max).forEach((it, i) => {
      const going = it.t != null && it.t <= NOW;
      const mins = it.t == null ? 0 : it.t - NOW;
      const sub = it.t == null ? "today" : going ? "now · until " + time(it.e != null ? it.e : it.t + 60) : time(it.t) + (i === 0 ? " · in " + (mins < 60 ? mins + " min" : Math.round(mins / 60) + " h") : "");
      block(w, it, sub, i === 0, data);
    });
    return;
  }
  for (let k = 1; k <= 7; k++) {
    const d = shift(TODAY, k), items = planOn(docs, d, opt.them);
    if (!items.length) continue;
    text(w, k === 1 ? "Tomorrow" : fmt(d, { weekday: "short", day: "numeric", month: "short" }), 10, SOFT, "semi");
    w.addSpacer(4);
    items.slice(0, max).forEach((it, i) => block(w, it, when(it), i === 0, data));
    return;
  }
  note(w, "Nothing planned this week 🌿");
}

// One tracker on its own.
function singleWidget(w, data, fam, kind, opt, width) {
  const side = opt.them ? data.theirs : data.mine;
  const who = opt.them && data.them ? data.them.name + "'s " : "";
  let id = kind;
  if (kind === "own") id = side ? side.order.find(x => side.data[x].def && side.data[x].def.name.toLowerCase() === opt.name) : null;
  const d = side && id ? side.data[id] : null;
  const names = { meds: ["Medication", "💊", "mint"], work: ["Work day", "💼", "sky"], water: ["Water", "💧", "sky"],
    caffeine: ["Caffeine", "☕", "peach"], walk: ["Walk", "🚶", "mint"], cycle: ["Cycle", "🩸", "coral"] };
  const n = names[kind] || (d ? [d.def.name, STICKERS[d.def.sticker] || d.def.emoji || "✨", d.def.color || "mint"] : ["Tracker", "✨", "mint"]);
  if (!d) {
    header(w, n[0], n[2], "", n[1]);
    note(w, opt.them ? (data.them ? data.them.name : "Your person") + " doesn't share this" : side ? "Switch it on in Human Doing" : "Open Human Doing once, and this fills in 🌱");
    return;
  }
  if (kind === "cycle" && opt.discreet) {
    const s = w.addStack();
    s.addSpacer();
    s.addImage(ring(d, fam === "small" ? 96 : 110)).imageSize = new Size(fam === "small" ? 96 : 110, fam === "small" ? 96 : 110);
    s.addSpacer();
    w.addSpacer(4);
    const t = text(w, d.cycleDay ? String(d.cycleDay) : "🌸", 11, SOFT, "semi");
    t.centerAlignText();
    return;
  }
  header(w, who + n[0], n[2], "", n[1]);
  const t = tile(id, d, true);
  if (kind === "meds") {
    const row = w.addStack();
    row.spacing = 5;
    const list = d.list.slice(0, fam === "small" ? 2 : 4);
    for (const m of list) {
      const ts = d.taken[m.id] || [];
      const tm = toMin(m.time);
      const missed = !m.asNeeded && !ts.length && tm != null && tm + 60 < NOW;
      const card = row.addStack();
      card.layoutVertically();
      card.size = new Size((width - 5 * (list.length - 1)) / list.length, fam === "large" ? 84 : 70);
      card.backgroundColor = tint(missed ? "coral" : "mint");
      card.cornerRadius = 12;
      card.setPadding(6, 4, 6, 4);
      const top = card.addStack();
      top.addSpacer();
      text(top, (m.asNeeded ? "💊" : ts.length ? "✅" : "💊"), 20);
      top.addSpacer();
      const nm = text(card, m.name, 11, INK, "bold");
      nm.centerAlignText();
      const line = m.asNeeded ? (ts.length ? ts.length + " today" : "as needed") : ts.length ? "✓ " + (ts[0] ? clock(ts[0]) : "taken") : missed ? "missed " + time(tm) : tm != null ? "due " + time(tm) : "not yet";
      const l = text(card, line, 9, missed ? ink("coral") : ts.length ? ink("mint") : SOFT, "semi");
      l.centerAlignText();
    }
    const low = d.list.filter(m => m.left != null && m.left <= (m.lowAt == null ? 5 : m.lowAt));
    if (low.length && fam !== "small") { w.addSpacer(5); pill(w, "🔔 " + low[0].name + ": " + low[0].left + " left in the pack", "butter"); }
    return;
  }
  if (kind === "cycle") {
    const row = w.addStack();
    row.centerAlignContent();
    row.addImage(ring(d, 56)).imageSize = new Size(56, 56);
    row.addSpacer(10);
    const v = row.addStack();
    v.layoutVertically();
    text(v, d.cycleDay ? "Day " + d.cycleDay : (PHASES[d.phase] || PHASES.luteal)[1], 17, ink("coral"), "bold");
    text(v, (PHASES[d.phase] || PHASES.luteal)[1], 10, SOFT);
    if (d.nextPeriod) text(v, "due ~" + fmt(d.nextPeriod, { day: "numeric", month: "short" }), 10, SOFT);
    if (fam !== "small" && d.dueIn != null) {
      w.addSpacer(8);
      text(w, d.dueIn > 1 ? "Next period in about " + d.dueIn + " days" : d.dueIn === 1 ? "Period due tomorrow" : d.dueIn === 0 ? "Period due today" : "Period " + -d.dueIn + " days later than usual", 11, SOFT);
      text(w, "Estimates from logs, not medical advice", 9, FAINT);
    }
    return;
  }
  // Water, caffeine, walk, work and your own: the big number and a line.
  const big = w.addStack();
  big.centerAlignContent();
  text(big, t.icon, fam === "small" ? 30 : 34);
  big.addSpacer(8);
  const v = big.addStack();
  v.layoutVertically();
  text(v, t.big, fam === "small" ? 22 : 26, ink(t.color), "heavy");
  text(v, t.small, 11, SOFT);
  w.addSpacer(6);
  let line = "";
  if (kind === "water") line = Array.from({ length: Math.min(12, Math.max(d.goal, d.n)) }, (_, i) => (i < d.n ? "💧" : "◦")).join("");
  else if (kind === "caffeine" && d.at.length) line = "last " + clock(d.at[d.at.length - 1]) + (d.cutoff ? " · cut-off " + time(toMin(d.cutoff)) : "");
  else if (kind === "walk") {
    // The minutes, and (yours) when the next nudge to get up is due: the Android app nudges, this only shows it.
    const last = Math.max(d.last || 0, ...(d.at || []));
    const next = opt.them ? null : nextNudge(d.nudge, last);
    line = d.mins + " min" + (next ? " · next nudge ~" + (dayKey(new Date(next)) === TODAY ? "" : fmt(dayKey(new Date(next)), { weekday: "short" }) + " ") + clock(next) : last ? " · last " + clock(last) : "")
      + (!opt.them && d.streak > 1 ? "\n🔥 " + d.streak + " days in a row" : "");
  }
  else if (kind === "own" && d.streak + (d.v != null ? 1 : 0) > 1) line = "🔥 " + (d.streak + (d.v != null ? 1 : 0)) + " days";
  else if (kind === "work" && fam !== "small") {
    const leave = new Set(d.types.filter(x => x.leave).map(x => x.id));
    let week = d.weekOther || 0;
    for (const k of Object.keys(d.v)) if (!leave.has(k)) week += d.v[k];
    const parts = [];
    for (const x of d.types) {
      const m = (d.monthOther || {})[x.id] || { days: 0, ahead: 0, hours: 0 }, today = d.v[x.id];
      if (x.id === "overtime") { const h = m.hours + (today || 0); if (h) parts.push(x.emoji + " " + hrs(h) + " h"); continue; }
      const n = m.days + (today != null ? 1 : 0);
      if (n || m.ahead) parts.push(x.emoji + " " + (n ? n + (n === 1 ? " day" : " days") : "") + (n && m.ahead ? " · " : "") + (m.ahead ? m.ahead + " booked" : ""));
    }
    line = "This week " + hrs(week) + " h" + (parts.length ? " · " + fmt(TODAY, { month: "long" }) + ": " + parts.join(" · ") : "");
    if (d.timer) line = "⏱ Overtime since " + clock(d.timer) + "\n" + line;
  }
  if (line) text(w, line, kind === "water" ? 12 : 10, SOFT, "", 3);
}

// The lock screen: a line or three.
function accessory(w, data, fam, kind, opt) {
  const side = opt.them ? data.theirs : data.mine;
  const open = data.todo.tasks.filter(t => !t.done && t.due && t.due <= TODAY).length;
  const bits = [];
  if (side) for (const id of side.order.slice(0, 4)) { const t = tile(id, side.data[id]); if (t.big !== "—") bits.push(t.icon + " " + t.big); }
  if (kind === "todo") bits.unshift("✅ " + open + " due");
  if (kind === "plan") { const p = planOn(data.docs, TODAY, false) || []; const n = p.find(it => it.t != null && it.t > NOW); bits.unshift(n ? (n.icon || "🗓️") + " " + n.title + " " + time(n.t) : "🗓️ nothing next"); }
  if (fam === "accessoryInline") { text(w, bits.slice(0, 3).join("  "), 12); return; }
  if (fam === "accessoryCircular") {
    const t = side && side.data.water ? side.data.water.n + "/" + side.data.water.goal : String(open);
    const s = w.addStack(); s.addSpacer(); text(s, side && side.data.water ? "💧" : "✅", 12); s.addSpacer();
    const n = w.addStack(); n.addSpacer(); text(n, t, 14, null, "bold"); n.addSpacer();
    return;
  }
  for (const b of bits.slice(0, 3)) text(w, b, 13, null, "semi");
}

// ── The widget ────────────────────────────────────────────────────────────
const loaded = await load();
const docs = loaded.docs;
const meP = docs[NS + ME + ":profile"] || {};
const themP = docs[NS + THEM + ":profile"];
const data = {
  docs,
  me: { name: meP.name || "Me", emoji: meP.emoji || "💗", color: meP.color || "pink" },
  them: themP ? { name: themP.name || "Your person", emoji: themP.emoji || "💗", color: themP.color || "lavender" } : null,
  mine: myTrackers(docs),
  theirs: themP ? theirTrackers(docs) : null,
  could: themP ? couldUse(docs) : [],
  onIt: !!(((docs[NS + ME + ":help"] || {}).onIt || {})[TODAY]),
  todo: todos(docs),
};

// The parameter: "todo", "plan week", "water them", "cycle discreet", "<your tracker's name>"…
const words = String((typeof args !== "undefined" && args.widgetParameter) || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
const themName = data.them ? data.them.name.toLowerCase() : "";
const opt = { them: words.some(x => x === "them" || x === "their" || (themName && x === themName)), discreet: words.includes("discreet"),
  week: words.includes("week"), today: words.includes("today"), mine: words.includes("mine") };
const rest = words.filter(x => !["them", "their", "discreet", "week", "today", "mine", themName].includes(x));
const KINDS = ["todo", "plan", "meds", "work", "water", "caffeine", "walk", "cycle", "track"];
let kind = rest[0] && KINDS.includes(rest[0]) ? rest[0] : rest.length ? "own" : "track";
if (kind === "todo" && rest.length > 1) opt.group = rest.slice(1).join(" ");
if (kind === "own") opt.name = rest.join(" ");
if (kind === "own" && data.todo.groups.some(g => g.name.toLowerCase() === opt.name)) { kind = "todo"; opt.group = opt.name; }

const fam = config.widgetFamily || "medium";
const w = new ListWidget();
if (fam.startsWith("accessory")) {
  accessory(w, data, fam, kind, opt);
} else {
  const g = new LinearGradient();
  g.colors = [dyn("#FFF4F8", "#141C3B"), dyn("#F1EAFF", "#0B1029")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(12, 12, 10, 12);
  const width = fam === "small" ? 134 : 314;
  if (kind === "track") trackWidget(w, data, fam, width, opt.them);
  else if (kind === "todo") todoWidget(w, data, fam, opt);
  else if (kind === "plan") planWidget(w, data, fam, opt);
  else singleWidget(w, data, fam, kind, opt, width);
  w.addSpacer();
  if (loaded.offline) text(w, "offline · showing what it had", 8, FAINT);
}
w.url = APP_URL + "#" + (kind === "todo" || kind === "plan" ? kind : kind === "cycle" && !opt.them ? "track:cycle" : opt.them ? "track:them" : "track");
w.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(w);
else if (fam === "small") await w.presentSmall();
else if (fam === "large") await w.presentLarge();
else await w.presentMedium();
Script.complete();
