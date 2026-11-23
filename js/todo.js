// To-Do: lists in groups (shared with your person, or just yours), tasks with
// subtasks, who's doing each one, a due date, repeat, priority, notes and a
// sticker, and "Put it on our Plan" to give a task a time on your Plan
// calendar. docs.js keeps the documents and merges edits when you both change
// the same thing; this file is the screen.
//
// Adding is quick: type on a list's "＋ Add to …" line and press Enter (the
// line stays ready for the next one); tap a task later for its details.
// Holding a task picks it up: drag it up or down to put it in order, or to the
// right to tuck it under the task above as a subtask. Holding a subtask and
// dragging it left makes it a task again.
// 🔔 Tell: sends your person a note of what you've added, changed or ticked
// off on your shared lists since you last told them (see nudges.js).

import * as store from './store.js';
import { clone, colorVars, dayKey, esc, fmtDay, fmtTime, keyToDate, prefs, setPref, shiftDay, toast, uid, vibrate } from './util.js';
import { confirmSheet, dragSort, markSwatch, moved, openSheet, promptSheet, swatchesHTML } from './ui.js';
import { avatarHTML } from './avatars.js';
import { stickerSrc } from './stickers.js';
import { addTodo, editTodo, moveTask, readMySchedules, readTodos, removeTodo, setGroupPrivate, writeMySchedules } from './docs.js';
import { richFieldHTML, wireRich } from './richtext.js';
import { newsFrom, sendNudge } from './nudges.js';

const NOTE_MAX = 2000;
const STICKERS = ['check', 'broom', 'spray', 'sponge', 'bucket', 'laundry', 'washer', 'iron', 'wateringcan', 'groceries',
  'letter', 'books', 'dumbbell', 'sneaker', 'heart', 'star', 'cupcake', 'trophy'];
const REPEATS = [
  { id: '', label: 'No repeat' },
  { id: 'day', label: 'Every day', days: 1 },
  { id: 'week', label: 'Every week', days: 7 },
  { id: '2weeks', label: 'Every 2 weeks', days: 14 },
  { id: 'month', label: 'Every month', months: 1 },
  { id: 'year', label: 'Every year', months: 12 },
];
const PRIORITIES = [['low', 'Low'], ['', 'Medium'], ['high', 'High ❗']];
// Ready-made lists to pick from on your first visit: picked to start with or
// not, and shared or just yours to start with.
const GROUP_IDEAS = [
  { emoji: '🏡', name: 'Home', color: 'mint', on: true, private: false },
  { emoji: '🛒', name: 'Errands', color: 'butter', on: true, private: false },
  { emoji: '🌷', name: 'Personal', color: 'pink', on: true, private: true },
  { emoji: '💼', name: 'Work', color: 'sky', on: false, private: true },
  { emoji: '🌿', name: 'Garden', color: 'sage', on: false, private: false },
  { emoji: '🐶', name: 'Pets', color: 'peach', on: false, private: false },
];
const OWN_COLORS = ['lavender', 'coral', 'sky', 'butter', 'mint', 'pink', 'peach', 'sage'];

// ── A list's order ────────────────────────────────────────────────────────
// Tasks you've dragged into order (their `rank`, the same for you both)
// first, in that order; then the rest by due date, then priority.
const urgency = x => [x.due || '9999', x.priority === 'high' ? 0 : x.priority === 'low' ? 2 : 1, x.order ?? x.created ?? 0];
export function sortOpen(tasks) {
  const byUrgency = (a, b) => { const ua = urgency(a), ub = urgency(b); return ua[0] < ub[0] ? -1 : ua[0] > ub[0] ? 1 : ua[1] - ub[1] || ua[2] - ub[2]; };
  const ranked = tasks.filter(x => typeof x.rank === 'number').sort((a, b) => a.rank - b.rank || byUrgency(a, b));
  return [...ranked, ...tasks.filter(x => typeof x.rank !== 'number').sort(byUrgency)];
}

// ── Dates and repeats ─────────────────────────────────────────────────────
function addMonths(k, n) {
  const [y, m, d] = k.split('-').map(Number);
  return dayKey(new Date(y, m - 1 + n, Math.min(d, new Date(y, m + n, 0).getDate())));
}
/** A repeating task's next due date after today (null if it doesn't repeat). */
function nextDue(t) {
  const r = REPEATS.find(x => x.id === (t.repeat || ''));
  if (!r || !r.id) return null;
  const step = k => (r.days ? shiftDay(k, r.days) : addMonths(k, r.months));
  const today = dayKey();
  let k = step(t.due || today);
  while (k <= today) k = step(k);
  return k;
}
const mondayOf = k => shiftDay(k, -((keyToDate(k).getDay() + 6) % 7));
function dueLabel(due) {
  const today = dayKey();
  if (due === today) return 'today';
  if (due === shiftDay(today, 1)) return 'tomorrow';
  if (due === shiftDay(today, -1)) return 'yesterday';
  const d = keyToDate(due);
  const ahead = Math.round((d - keyToDate(today)) / 864e5);
  // This week: "Sat 17" (built by hand: some browsers write "17 Sat").
  if (ahead > 0 && ahead < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function repeatLabel(t) {
  switch (t.repeat) {
    case 'day': return 'every day';
    case 'week': return t.due ? `every ${keyToDate(t.due).toLocaleDateString(undefined, { weekday: 'long' })}` : 'every week';
    case '2weeks': return 'every 2 weeks';
    case 'month': return 'every month';
    case 'year': return 'every year';
    default: return '';
  }
}
const whenDone = ms => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── The Plan link ─────────────────────────────────────────────────────────
// A task I put on my Plan has plan_<me> = { sched, time, item, placed }: an
// item on that monthly calendar on the task's due date. This keeps those
// items in step with their tasks (title, date, time, ✓ when done); the task
// is what counts, so change them from the task. Deleting the item on the
// Plan lets go of the link instead of bringing it back.
const planKey = () => `plan_${store.me()}`;
// My monthly calendars, shared or just mine (a task on a private one stays private too).
const monthSchedules = () => (readMySchedules() || []).filter(s => s.type === 'month');

export function syncTodoPlan() {
  if (!store.getSession()) return;
  const saved = readMySchedules();
  if (!Array.isArray(saved)) return;
  const key = planKey();
  const { groups, tasks } = readTodos();
  const want = new Map();
  for (const t of tasks) {
    const p = t[key];
    if (!p || !p.item || !t.due) continue;
    const g = groups.find(x => x.id === t.group) || {};
    want.set(p.item, { task: t, p, day: t.due, fields: { title: (t.done ? '✓ ' : '') + t.title, icon: g.emoji || '✅', time: p.time ?? null, color: g.color || 'mint', todo: t.id } });
  }
  const list = clone(saved);
  const seen = new Set();
  let changed = false;
  for (const s of list) {
    if (s.type !== 'month' || !s.items) continue;
    for (const day of Object.keys(s.items)) {
      const keep = [];
      for (const it of s.items[day]) {
        if (!it.todo) { keep.push(it); continue; }
        seen.add(it.id);
        const w = want.get(it.id);
        if (!w || w.p.sched !== s.id || w.day !== day) { changed = true; continue; }   // gone, or moving (added back below)
        const next = { ...it, ...w.fields };
        if (!same(next, it)) changed = true;
        keep.push(next);
        w.here = true;
      }
      if (keep.length) s.items[day] = keep; else delete s.items[day];
    }
  }
  const placed = [], dropped = [];
  for (const [id, w] of want) {
    if (w.here) continue;
    const s = list.find(x => x.id === w.p.sched && x.type === 'month');
    if (!s || (w.p.placed && !seen.has(id))) { dropped.push(w.task); continue; }
    s.items = s.items || {};
    (s.items[w.day] = s.items[w.day] || []).push({ id, note: '', ...w.fields });
    changed = true;
    if (!w.p.placed) placed.push(w.task);
  }
  if (changed) writeMySchedules(list);
  for (const t of placed) editTodo('task', t.id, { [key]: { ...t[key], placed: true } });
  for (const t of dropped) editTodo('task', t.id, { [key]: null });
}

/**
 * Ticks a task off (or back on). A repeating task moves on to its next date
 * instead, with its subtasks unticked. Used by the list and the widgets;
 * returns the next due date of a repeating task, or null.
 */
export function tickTask(id) {
  const x = readTodos().tasks.find(t => t.id === id);
  if (!x) return null;
  let next = null;
  if (x.done) editTodo('task', id, { done: false });
  else {
    next = nextDue(x);
    if (next) {
      editTodo('task', id, { due: next, doneAt: Date.now(), doneBy: store.me() });
      for (const s of x.subs || []) if (s.done) editTodo('sub', s.id, { done: false });
    } else editTodo('task', id, { done: true, doneAt: Date.now(), doneBy: store.me() });
  }
  syncTodoPlan();
  return next;
}
/** Ticks a subtask off or back on. */
export function tickSub(id) {
  const s = readTodos().tasks.flatMap(t => t.subs).find(x => x.id === id);
  if (s) editTodo('sub', s.id, { done: !s.done, doneAt: Date.now() });
}

// A monthly calendar on my Plan for tasks to go on, made if there isn't one.
function ensureCalendar() {
  const list = clone(readMySchedules() || []);
  const found = list.find(s => s.type === 'month');
  if (found) return found.id;
  const s = { id: uid(), name: 'Our calendar', type: 'month', weekStart: 1, blocks: [], stickers: [], items: {}, monthStickers: {} };
  writeMySchedules([...list, s]);
  return s.id;
}

// ── The screen ────────────────────────────────────────────────────────────
export function createTodo(root) {
  let tab = prefs.todoGroup || 'all';       // 'all' or a group id
  let who = prefs.todoWho || 'all';         // 'all' | 'me' | 'them'
  const openSubs = new Set();               // tasks with their subtasks folded open

  const me = () => store.me();
  const them = () => store.readPartner('profile', null);
  const profileOf = slot => (slot === me() ? store.readMine('profile', {}) : them() || {});
  const nameOf = slot => (slot === me() ? 'you' : (them() || {}).name || 'your person');
  const avatar = (slot, cls = 't-av') => { const p = profileOf(slot); return `<span class="${cls}" style="${colorVars(p.color || 'lavender')}">${avatarHTML(p)}</span>`; };
  const find = id => readTodos().tasks.find(t => t.id === id);

  function weekNumbers(tasks) {
    const today = dayKey(), mon = mondayOf(today), sun = shiftDay(mon, 6);
    const from = keyToDate(mon).getTime(), to = keyToDate(shiftDay(mon, 7)).getTime();
    const doneNow = t => t.doneAt >= from && t.doneAt < to;
    // Done this week (a repeating task counts once), out of that plus what's still due by Sunday.
    const done = tasks.filter(doneNow).length;
    const open = tasks.filter(t => !t.done && t.due && t.due <= sun).length;
    return { done, total: done + open, from };
  }

  // ── 🔔 Tell your person ────────────────────────────────────────────────
  // What I've added, changed or ticked off on our shared lists since I last told
  // them: [{ at, kind: 'add'|'change'|'tick', title, list }], oldest first.
  const QUIET = /^(done|doneAt|doneBy|order|mt|removed)$/;   // not news by themselves
  function news() {
    const from = newsFrom();
    if (!them()) return [];
    const { groups, tasks } = readTodos();
    const out = [];
    for (const x of tasks) {
      const g = groups.find(y => y.id === x.group);
      if (!g || g.private) continue;
      const list = `${g.emoji || '📋'} ${g.name}`;
      const added = x.owner === me() && x.created > from;
      if (x.doneBy === me() && x.doneAt > from && (x.done || x.repeat)) out.push({ at: x.doneAt, kind: 'tick', title: x.title, list });
      else if (added) out.push({ at: x.created, kind: 'add', title: x.title, list });
      else if (x.owner === me() && Object.entries(x.mt || {}).some(([k, t]) => t > from && !QUIET.test(k))) {
        out.push({ at: Math.max(...Object.values(x.mt)), kind: 'change', title: x.title, list });
      }
      for (const sub of x.subs || []) {
        if (!added && sub.owner === me() && sub.created > from) out.push({ at: sub.created, kind: 'add', title: `${sub.title} (in “${x.title}”)`, list });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }
  const NEWS_WORDS = { add: ['＋', 'Added'], change: ['✎', 'Changed'], tick: ['✓', 'Ticked off'] };
  function newsText(items, note) {
    const parts = ['add', 'tick', 'change'].map(kind => {
      const xs = items.filter(x => x.kind === kind);
      if (!xs.length) return '';
      const names = xs.slice(0, 6).map(x => `“${x.title}”`).join(', ') + (xs.length > 6 ? ` and ${xs.length - 6} more` : '');
      return `${NEWS_WORDS[kind][1]} ${names}`;
    }).filter(Boolean);
    return [note, parts.join(' · ')].filter(Boolean).join(' · ').slice(0, 400);
  }
  function tellSheet() {
    const t = them();
    const items = news();
    if (!t) return;
    const sheet = openSheet({
      title: `Tell ${t.name} what's new 🔔`,
      body: `${items.length ? `<p class="muted small">Since you last told ${esc(t.name)}, on your shared lists:</p>
        <ul class="news-list">${items.map(x => `<li><span class="nw-ico" aria-hidden="true">${NEWS_WORDS[x.kind][0]}</span><span><b>${esc(NEWS_WORDS[x.kind][1])}</b> ${esc(x.title)} <small>${esc(x.list)}</small></span></li>`).join('')}</ul>`
        : `<p class="muted small">Nothing new on your shared lists since you last told ${esc(t.name)}. You can still send a note.</p>`}
        <label class="field"><span>Add a note <small class="field-hint">(if you like)</small></span>
          <input class="inp" name="note" maxlength="120" placeholder="e.g. Grabbed the groceries 🛒" autocomplete="off"></label>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-tl="cancel">Cancel</button>
          <button type="button" class="btn" data-tl="send"${items.length ? '' : ' disabled'}>Send 🔔</button>
        </div>`,
    });
    const note = sheet.el.querySelector('[name=note]');
    const send = sheet.el.querySelector('[data-tl=send]');
    note.addEventListener('input', () => { send.disabled = !items.length && !note.value.trim(); });
    sheet.el.addEventListener('click', e => {
      const b = e.target.closest('[data-tl]');
      if (!b) return;
      if (b.dataset.tl === 'send') {
        if (send.disabled) return;
        sendNudge('news', newsText(items, note.value.trim()), { n: items.length });
        vibrate(10);
        toast(`Told ${t.name} 🔔`);
        render();
      }
      sheet.close();
    });
  }

  // grip: a ⋮⋮ to drag it into order (open tasks in a list of two or more).
  function taskRow(x, grip = null) {
    const today = dayKey();
    const subs = x.subs || [];
    const subsDone = subs.filter(s => s.done).length;
    const open = openSubs.has(x.id);
    const p = x[planKey()];
    const tags = [];
    if (x.done) tags.push(`<span class="tag">done${x.doneBy ? ` by ${esc(nameOf(x.doneBy))}` : ''}${x.doneAt ? ` · ${esc(whenDone(x.doneAt))}` : ''}</span>`);
    else {
      if (x.priority === 'high') tags.push('<span class="tag hot">❗ high</span>');
      if (x.due) tags.push(`<span class="tag${x.due < today ? ' hot' : ''}">📅 ${x.due < today ? 'overdue · ' : ''}${esc(dueLabel(x.due))}</span>`);
      if (x.repeat) tags.push(`<span class="tag">🔁 ${esc(repeatLabel(x))}</span>`);
      if (p && x.due) tags.push(`<span class="tag plan">🗓️ in Plan · ${esc(dueLabel(x.due))}${p.time != null ? `, ${esc(fmtTime(p.time))}` : ''}</span>`);
      if (x.notes) tags.push('<span class="tag" title="Has notes">📝</span>');
    }
    if (subs.length) tags.push(`<button type="button" class="tag sub-count" data-fold="${x.id}" aria-expanded="${open}">${subsDone}/${subs.length} ${open ? '▾' : '▸'}</button>`);
    return `<div class="task${x.done ? ' done' : ''}" data-task="${x.id}">
      ${grip == null ? '' : grip ? '<span class="grip" aria-hidden="true">⋮⋮</span>' : '<span></span>'}
      <button type="button" class="tick${x.done ? ' on' : ''}" data-tick="${x.id}" aria-pressed="${!!x.done}" aria-label="${esc(x.title)}${x.done ? ', done' : ''}"></button>
      <div class="t-body">
        <button type="button" class="t-title" data-edit="${x.id}">${x.sticker ? `<img class="t-stk" src="${stickerSrc(x.sticker)}" alt="" draggable="false">` : ''}${esc(x.title)}</button>
        ${tags.length ? `<div class="t-meta">${tags.join('')}</div>` : ''}
        ${open ? `<div class="subs">${subs.map(s => `
          <div class="sub${s.done ? ' done' : ''}" data-sub="${s.id}"><button type="button" class="tick${s.done ? ' on' : ''}" data-subtick="${s.id}" aria-pressed="${!!s.done}" aria-label="${esc(s.title)}"></button><span>${esc(s.title)}</span></div>`).join('')}
          ${quickAdd('qasub', x.id, 'Add a subtask…', `Add a subtask to ${x.title}`)}</div>` : ''}
      </div>
      <span class="t-avs">${(them() ? x.who || [] : []).map(s => avatar(s)).join('')}</span>
    </div>`;
  }

  function groupCard(g, tasks, weekFrom) {
    const t = them();
    const list = tasks.filter(x => x.group === g.id);
    const open = sortOpen(list.filter(x => !x.done));
    const doneLately = list.filter(x => x.done && x.doneAt >= weekFrom).sort((a, b) => b.doneAt - a.doneAt);
    const shown = [...open, ...doneLately];
    const drag = open.length > 1;
    const hint = drag && !open.some(x => typeof x.rank === 'number');   // until you've put it in order once
    const tuckTip = drag && !prefs.todoTucked;                          // until you've made a subtask by dragging
    const whose = g.private ? '🔒 just me' : g.owner === me() ? (t ? `shared with ${t.name}` : 'shared') : `${t ? t.name : 'your person'}'s, shared`;
    return `<section class="card tk td-group${drag ? ' task-wrap' : ''}" data-group="${g.id}" style="${colorVars(g.color)}">
      <div class="card-tape"></div>
      <div class="g-head"><span class="tk-ico" aria-hidden="true">${esc(g.emoji || '📋')}</span>
        <div><h3>${esc(g.name)}</h3><span class="muted">${esc(whose)}${shown.length ? ` · ${doneLately.length} of ${shown.length} done` : ''}${hint ? ' · hold a task to move it' : ''}</span></div>
        <button type="button" class="more" data-gedit="${g.id}" aria-label="${esc(g.name)} settings">⋯</button></div>
      ${shown.map(x => taskRow(x, drag ? !x.done : null)).join('') || '<p class="muted small td-none">Nothing here right now.</p>'}
      ${tuckTip ? '<p class="td-tip">💡 Hold a task and drag it to the right to tuck it under the one above as a subtask.</p>' : ''}
      ${quickAdd('qa', g.id, `Add to ${g.name}…`, `Add a task to ${g.name}`)}
    </section>`;
  }

  // A line you type on and press Enter: a new task in a group (kind 'qa'), or a
  // subtask (kind 'qasub'). "Add" shows once there's something typed.
  const quickAdd = (kind, id, placeholder, label) => `<form class="quick-add${kind === 'qasub' ? ' sub-qa' : ''}" data-${kind}="${id}" novalidate>
      <span class="qa-plus" aria-hidden="true">＋</span>
      <input class="qa-inp" name="qa" maxlength="80" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" enterkeyhint="done" autocomplete="off" autocapitalize="sentences">
      <button type="submit" class="qa-go">Add</button>
    </form>`;

  /** Puts the cursor on a list's "＋ Add to …" line (the ＋ button, a widget's "new"). */
  function focusQuickAdd(groupId) {
    const { groups } = readTodos();
    const gid = groupId && groups.some(g => g.id === groupId) ? groupId : tab !== 'all' ? tab : groups[0]?.id;
    if (!gid) return;
    if (tab !== 'all' && tab !== gid) { tab = gid; setPref('todoGroup', tab); render(); }
    const inp = root.querySelector(`[data-qa="${gid}"] .qa-inp`);
    if (!inp) return;
    inp.focus({ preventScroll: true });
    inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ── your first visit: pick several lists at once ───────────────────────
  let picks = null;   // [{ emoji, name, color, on, private }] while you pick
  const whoSees = t => `<div class="who-box"><b>💞 Shared:</b> you both see it, add to it and tick things off.<br>
    <b>🔒 Just me:</b> ${esc(t ? t.name : 'Your person')} never sees it, or that it exists. It's kept in a separate private document that's never sent to ${esc(t ? `${t.name}'s` : 'their')} phone.</div>`;
  function startCard(t) {
    if (!picks) picks = GROUP_IDEAS.map(g => ({ ...g }));
    const picked = picks.filter(p => p.on);
    const name = t ? t.name : 'your person';
    return `<section class="card tk td-start" style="${colorVars('mint')}">
      <div class="card-tape"></div>
      <div class="tk-head"><img class="tk-ico" src="${stickerSrc('clip')}" alt="" draggable="false"><h3>Pick your lists</h3></div>
      <p class="muted small">Pick as many as you like. You can rename them, change their order and add more later.</p>
      <div class="pick-grid">${picks.map((p, i) => `<button type="button" class="pick${p.on ? ' on' : ''}" data-pick="${i}" aria-pressed="${p.on}" style="${colorVars(p.color)}">${esc(p.emoji)} ${esc(p.name)}<span class="tick${p.on ? ' on' : ''}"></span></button>`).join('')}</div>
      <button type="button" class="chip add-own" data-td="pick-own">＋ your own</button>
      ${picked.length ? `<div class="list-cap">Who sees them?</div>
        <div class="made">${picks.map((p, i) => (p.on ? `<div class="made-row" style="${colorVars(p.color)}"><span>${esc(p.emoji)} ${esc(p.name)}</span>
          <button type="button" class="vis${p.private ? ' priv' : ''}" data-pickvis="${i}">${p.private ? '🔒 Just me' : `💞 Shared with ${esc(name)}`}</button></div>` : '')).join('')}</div>` : ''}
      <button type="button" class="btn big make-lists" data-td="make-lists" style="${colorVars('mint')}"${picked.length ? '' : ' disabled'}>${picked.length ? `Make ${picked.length === 1 ? 'this list' : `these ${picked.length} lists`}` : 'Pick a list or two'}</button>
      ${whoSees(t)}
    </section>`;
  }
  function makeLists() {
    const base = Date.now();
    picks.filter(p => p.on).forEach((p, i) => addTodo('group', { name: p.name, emoji: p.emoji, color: p.color, private: p.private, order: base + i }));
    picks = null;
    vibrate(10);
    render();
  }

  function render() {
    // Typing on a quick-add line when the page redraws (you pressed Enter, or
    // your person changed something): keep the cursor there, with what you typed.
    const a = document.activeElement;
    const typing = a && a.classList && a.classList.contains('qa-inp') && root.contains(a) && a.form
      ? { sel: a.form.dataset.qa ? `[data-qa="${a.form.dataset.qa}"]` : `[data-qasub="${a.form.dataset.qasub}"]`, value: a.value, at: a.selectionStart } : null;
    draw();
    if (!typing) return;
    const inp = root.querySelector(`${typing.sel} .qa-inp`);
    if (!inp) return;
    inp.value = typing.value;
    inp.focus({ preventScroll: true });
    try { inp.setSelectionRange(typing.at, typing.at); } catch (e) { /* not every input allows it */ }
  }

  function draw() {
    const { groups, tasks } = readTodos();
    const t = them();
    if (tab !== 'all' && !groups.some(g => g.id === tab)) tab = 'all';
    if (!t) who = 'all';
    const mine = x => (x.who && x.who.length ? x.who : [x.owner]).includes(who === 'me' ? me() : store.partner());
    const visible = who === 'all' ? tasks : tasks.filter(mine);
    const w = weekNumbers(tasks);
    const pct = w.total ? Math.round((w.done / w.total) * 100) : 0;
    const summary = !w.total ? 'Nothing due this week. Add something below.'
      : `${w.done} of ${w.total} done this week${w.done === w.total ? '. All done! 🎉' : w.done ? '. Nice going!' : ''}`;
    const doneCount = tasks.filter(x => x.done).length;
    const fresh = t ? news().length : 0;
    root.innerHTML = `
      <div class="page todo">
        <div class="today-head td-head">
          <h1 class="display">Things to do <span class="wave"><img class="head-stk" src="${stickerSrc('star')}" alt="" draggable="false"></span></h1>
          <p class="muted td-sum">${esc(summary)}</p>
          <div class="td-bar" role="img" aria-label="${pct}% done this week"><i style="width:${pct}%"></i></div>
          ${t && groups.length ? `<button type="button" class="tell-btn${fresh ? ' has' : ''}" data-td="tell">🔔 Tell ${esc(t.name)}${fresh ? ` <b>${fresh} new</b>` : ' what’s new'}</button>` : ''}
        </div>
        ${groups.length ? `<div class="sched-tabs groups">
          <button type="button" class="sched-tab${tab === 'all' ? ' on' : ''}" data-gtab="all">All</button>
          ${groups.map(g => `<button type="button" class="sched-tab${tab === g.id ? ' on' : ''}" data-gtab="${g.id}">${esc(g.emoji || '📋')} ${esc(g.name)}${g.private ? ' <small title="Just you">🔒</small>' : ''}</button>`).join('')}
          <button type="button" class="sched-tab add" data-td="lists">✎ lists</button></div>` : ''}
        ${t && groups.length ? `<div class="seg wide td-who" style="${colorVars('mint')}">
          <button type="button" data-who="all" class="${who === 'all' ? 'on' : ''}">Everyone</button>
          <button type="button" data-who="me" class="${who === 'me' ? 'on' : ''}">${avatar(me(), 'seg-av')}Me</button>
          <button type="button" data-who="them" class="${who === 'them' ? 'on' : ''}">${avatar(store.partner(), 'seg-av')}${esc(t.name)}</button></div>` : ''}
        ${groups.length ? (tab === 'all' ? groups : groups.filter(g => g.id === tab)).map(g => groupCard(g, visible, w.from)).join('')
          : startCard(t)}
        ${doneCount ? `<button type="button" class="done-row" data-td="done"><span>✓ ${w.done ? `${w.done} done this week` : 'Done tasks'}</span><span aria-hidden="true">›</span></button>` : ''}
      </div>
      ${groups.length ? '<button type="button" class="fab td-fab" data-td="new" aria-label="Add a task">＋</button>' : ''}`;
  }

  // ── ticking things off ─────────────────────────────────────────────────
  function tick(id) {
    if (!find(id)) return;
    const next = tickTask(id);
    if (next) toast(`Done ✨ Next time: ${dueLabel(next)}`);
    vibrate(10);
    render();
  }

  // ── a group's settings (or a new group) ────────────────────────────────
  // onSaved(): after a change or delete (the lists sheet redraws).
  function groupSheet(g, onMade, onSaved) {
    const t = them();
    const isNew = !g;
    const mine = isNew || g.owner === me();
    const draft = { name: g ? g.name : '', emoji: g ? g.emoji : '', color: g ? g.color : 'mint', private: g ? !!g.private : false };
    const sheet = openSheet({ title: isNew ? 'New group' : g.name, body: '<form class="grp-form" novalidate></form>' });
    const form = sheet.el.querySelector('form');
    form.innerHTML = `
      <div class="own-row">
        <input class="inp own-emoji" name="emoji" maxlength="16" placeholder="📋" value="${esc(draft.emoji)}" aria-label="Emoji" autocomplete="off">
        <input class="inp" name="name" maxlength="28" placeholder="e.g. Garden" value="${esc(draft.name)}" aria-label="Name" autocomplete="off"></div>
      <div class="field"><span>Colour</span>${swatchesHTML(draft.color)}</div>
      ${mine ? `<div class="share-row"><span>Shared with ${esc(t ? t.name : 'your person')}<small>${draft.private ? 'just you: they never see it' : 'you can both add, tick and change things'}</small></span>
        <button type="button" class="tgl${draft.private ? '' : ' on'}" data-share role="switch" aria-checked="${!draft.private}" aria-label="Shared"></button></div>`
        : `<p class="muted small">${esc(t ? t.name : 'Your person')} made this group. You can both add, tick and change things in it.</p>`}
      <p class="ob-err grp-err" hidden></p>
      <div class="sheet-actions">
        ${isNew ? '' : '<button type="button" class="btn ghost danger-text" data-del>Delete</button>'}
        <button type="submit" class="btn" style="${colorVars('mint')}">${isNew ? 'Add group' : 'Save'}</button>
      </div>`;
    if (isNew) setTimeout(() => form.elements.namedItem('name').focus(), 280);
    form.addEventListener('click', async e => {
      const sw = e.target.closest('.sw');
      if (sw) { draft.color = sw.dataset.color; markSwatch(form, draft.color); return; }
      const share = e.target.closest('[data-share]');
      if (share) {
        draft.private = !draft.private;
        share.classList.toggle('on', !draft.private);
        share.setAttribute('aria-checked', !draft.private);
        share.previousElementSibling.querySelector('small').textContent = draft.private ? 'just you: they never see it' : 'you can both add, tick and change things';
        return;
      }
      if (e.target.closest('[data-del]')) {
        const n = readTodos().tasks.filter(x => x.group === g.id).length;
        const ok = await confirmSheet(`Delete ${g.name}?`, `${n === 1 ? 'Its task goes too. ' : n ? `Its ${n} tasks go too. ` : ''}${g.private ? '' : `It goes for ${t ? t.name : 'your person'} as well.`}`, { ok: 'Delete', danger: true });
        if (!ok) return;
        removeTodo('group', g.id);
        sheet.close();
        syncTodoPlan();
        render();
        if (onSaved) onSaved();
      }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.elements.namedItem('name').value.trim();
      const emoji = form.elements.namedItem('emoji').value.trim();
      const err = form.querySelector('.grp-err');
      if (!name) { err.hidden = false; err.textContent = 'Give it a name'; form.elements.namedItem('name').focus(); return; }
      const first = (emoji && (window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(emoji)][0].segment : Array.from(emoji)[0])) || '📋';
      if (isNew) {
        const id = addTodo('group', { name, emoji: first, color: draft.color, private: draft.private, order: Date.now() });
        sheet.close();
        if (onMade) onMade(id); else { tab = id; setPref('todoGroup', id); render(); }
        return;
      }
      const patch = {};
      if (name !== g.name) patch.name = name;
      if (first !== g.emoji) patch.emoji = first;
      if (draft.color !== g.color) patch.color = draft.color;
      if (Object.keys(patch).length) editTodo('group', g.id, patch);
      if (mine && draft.private !== !!g.private) {
        if (draft.private) {
          const ok = await confirmSheet(`Make ${name} just yours?`, `${t ? t.name : 'Your person'} won't see this group or its tasks any more.`, { ok: 'Just mine' });
          if (!ok) return;
        }
        setGroupPrivate(g.id, draft.private);
      }
      sheet.close();
      syncTodoPlan();
      render();
      if (onSaved) onSaved();
    });
  }

  // ── all your lists: rename, reorder, who sees each ─────────────────────
  // One order for you both: dragging saves each list's `order` (your
  // person's lists through the usual edits).
  function listsSheet() {
    const t = them();
    const sheet = openSheet({ title: 'Your lists', body: '<div class="lists-edit"></div>', onClose: render });
    const box = sheet.el.querySelector('.lists-edit');
    const name = t ? t.name : 'your person';
    const draw = () => {
      const { groups } = readTodos();
      box.innerHTML = `
        <p class="muted small sheet-hint">Tap a name to rename it, drag ⋮⋮ to change the order (the tabs follow), and tap 💞 / 🔒 for who sees it.</p>
        <div class="edit-list">${groups.map(g => `<div class="el-row" data-gid="${g.id}" style="${colorVars(g.color)}">
          <span class="grip" aria-hidden="true">⋮⋮</span><span class="emo">${esc(g.emoji || '📋')}</span>
          <input class="el-name" data-rename="${g.id}" maxlength="28" value="${esc(g.name)}" aria-label="Name">
          ${g.owner === me() ? `<button type="button" class="vis${g.private ? ' priv' : ''}" data-gvis="${g.id}">${g.private ? '🔒 Just me' : '💞 Shared'}</button>`
            : `<span class="vis" title="Only ${esc(name)} can make it private">💞 ${esc(name)}'s</span>`}
          <button type="button" class="row-x" data-gmore="${g.id}" aria-label="${esc(g.name)}: colour, emoji, delete">⋯</button></div>`).join('')}</div>
        <button type="button" class="chip add-own el-new" data-gnew>＋ New list</button>
        <p class="note-sm">One order for you both. Making a shared list "Just me" asks first, and takes its tasks off ${esc(name)}'s phone. ${esc(name)}'s own shared lists show here too, but only ${esc(name)} can make them private.</p>
        ${whoSees(t)}`;
    };
    draw();
    box.addEventListener('change', e => {
      const id = e.target.dataset.rename;
      if (!id) return;
      const g = readTodos().groups.find(x => x.id === id);
      const next = e.target.value.trim();
      if (!g || !next) { e.target.value = g ? g.name : ''; return; }
      if (next !== g.name) { editTodo('group', id, { name: next }); toast('Renamed'); }
    });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.rename) e.target.blur(); });
    box.addEventListener('click', async e => {
      const vis = e.target.closest('[data-gvis]');
      if (vis) {
        const g = readTodos().groups.find(x => x.id === vis.dataset.gvis);
        if (!g) return;
        if (!g.private) {
          const ok = await confirmSheet(`Make ${g.name} just yours?`, `${t ? t.name : 'Your person'} won't see this list or its tasks any more.`, { ok: 'Just mine' });
          if (!ok) return;
        }
        setGroupPrivate(g.id, !g.private);
        syncTodoPlan();
        vibrate(8);
        draw();
        return;
      }
      const more = e.target.closest('[data-gmore]');
      if (more) { const g = readTodos().groups.find(x => x.id === more.dataset.gmore); if (g) groupSheet(g, null, draw); return; }
      if (e.target.closest('[data-gnew]')) groupSheet(null, () => { render(); draw(); });
    });
    box.addEventListener('pointerdown', e => {
      const grip = e.target.closest('.el-row .grip');
      if (!grip) return;
      const rows = [...box.querySelectorAll('.el-row')];
      dragSort(e, grip, rows, grip.closest('.el-row'), (from, to) => {
        const groups = readTodos().groups;
        moved(rows.map(r => r.dataset.gid), from, to).forEach((id, i) => {
          const g = groups.find(x => x.id === id);
          if (g && g.order !== i) editTodo('group', id, { order: i });
        });
        vibrate(8);
        draw();
      });
    });
  }

  // ── holding a task ─────────────────────────────────────────────────────
  // Hold a task (or press its ⋮⋮) and drag: up or down puts the list in order
  // (each open task gets a `rank`, the same for you both); to the right tucks
  // it under the task above it as a subtask. Hold a subtask and drag it left to
  // make it a task again, just under the one it came from.
  const HOLD_MS = 350;   // how long a finger rests before the task lifts
  const SIDEWAYS = 44;   // px to the side that counts as "make it a subtask" (or a task)
  let press = null, drag = null, noClickUntil = 0;

  const cancelPress = () => { if (press) clearTimeout(press.timer); press = null; };

  root.addEventListener('pointerdown', e => {
    if (e.button > 0 || drag) return;
    if (e.target.closest('.tick, [data-fold], .quick-add, .more')) return;   // those are taps
    const sub = e.target.closest('.td-group .subs .sub[data-sub]');
    const row = sub ? null : e.target.closest('.td-group .task[data-task]:not(.done)');
    if (!sub && !row) return;
    press = { el: sub || row, kind: sub ? 'sub' : 'task', x: e.clientX, y: e.clientY, pid: e.pointerId, mouse: e.pointerType === 'mouse', timer: 0 };
    if (!sub && e.target.closest('.grip')) { e.preventDefault(); startDrag(); }
    else if (!press.mouse) press.timer = setTimeout(startDrag, HOLD_MS);
  });
  window.addEventListener('pointermove', e => {
    if (drag) { if (e.pointerId === drag.pid) moveDrag(e); return; }
    if (!press || e.pointerId !== press.pid) return;
    const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.mouse && d > 5) startDrag();
    else if (!press.mouse && d > 9) cancelPress();   // the finger is scrolling the page
  });
  window.addEventListener('pointerup', () => { if (drag) endDrag(false); else cancelPress(); });
  window.addEventListener('pointercancel', () => { if (drag) endDrag(true); else cancelPress(); });
  // While a task is held, the page doesn't scroll under the finger (and no long-press menu).
  document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', e => { if (e.target.closest('.td-group .task, .td-group .sub')) e.preventDefault(); });

  function startDrag() {
    const p = press;
    cancelPress();
    if (!p || !p.el.isConnected) return;
    vibrate(12);
    noClickUntil = Infinity;   // letting go isn't a tap
    const hint = document.createElement('span');
    hint.className = 'drop-hint';
    hint.hidden = true;
    p.el.append(hint);
    p.el.classList.add('dragging');
    root.classList.add('td-dragging');
    if (p.kind === 'sub') {
      drag = { kind: 'sub', el: p.el, pid: p.pid, x: p.x, y: p.y, hint, out: false };
      return;
    }
    const rows = [...p.el.closest('.td-group').querySelectorAll('.task[data-task]:not(.done)')];
    const from = rows.indexOf(p.el);
    const tops = rows.map(r => r.offsetTop), hs = rows.map(r => r.offsetHeight);
    const gap = rows.length > 1 ? Math.max(0, tops[1] - tops[0] - hs[0]) : 0;
    const x = find(p.el.dataset.task);
    drag = { kind: 'task', el: p.el, pid: p.pid, x: p.x, y: p.y, hint, rows, from, to: from, tops, hs, size: hs[from] + gap,
      parent: null, hasSubs: !!(x && (x.subs || []).length) };
  }

  function moveDrag(e) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.kind === 'sub') {
      // Only sideways: far enough left and it'll be a task.
      drag.out = dx < -SIDEWAYS;
      drag.el.style.transform = `translateX(${Math.max(-80, Math.min(8, dx))}px)`;
      drag.el.classList.toggle('promoting', drag.out);
      drag.hint.hidden = !drag.out;
      drag.hint.textContent = '↖ make it a task';
      return;
    }
    const { rows, from, tops, hs, size } = drag;
    const mid = tops[from] + hs[from] / 2 + dy;
    let to = from;
    rows.forEach((el, i) => {
      if (i > from && mid > tops[i] + hs[i] / 2) to = Math.max(to, i);
      if (i < from && mid < tops[i] + hs[i] / 2) to = Math.min(to, i);
    });
    drag.to = to;
    // It would go under the task just above where it lands.
    const order = moved(rows.map(r => r.dataset.task), from, to);
    const above = order[order.indexOf(drag.el.dataset.task) - 1] || null;
    const right = dx > SIDEWAYS;
    const parent = right && above && !drag.hasSubs ? above : null;
    if (!!parent !== !!drag.parent) vibrate(6);
    drag.parent = parent;
    rows.forEach((el, i) => {
      if (el === drag.el) return;
      const shift = from < to && i > from && i <= to ? -size : from > to && i < from && i >= to ? size : 0;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
      el.classList.toggle('drop-parent', el.dataset.task === parent);
    });
    drag.el.style.transform = `translate(${Math.max(-8, Math.min(dx, 72))}px, ${dy}px)`;
    drag.el.classList.toggle('indenting', !!parent);
    const parentTask = parent ? find(parent) : null;
    drag.hint.hidden = !right;
    drag.hint.textContent = parentTask ? `↳ subtask of “${parentTask.title}”` : drag.hasSubs ? 'it has subtasks of its own' : 'nothing above to go under';
  }

  async function endDrag(cancelled) {
    const d = drag;
    drag = null;
    noClickUntil = Date.now() + 400;
    root.classList.remove('td-dragging');
    if (d.kind === 'sub') {
      if (!cancelled && d.out) promoteSub(d.el.dataset.sub); else render();
      return;
    }
    if (!cancelled && d.parent) { await makeSubtask(d.el.dataset.task, d.parent); return; }
    if (!cancelled && d.to !== d.from) {
      const tasks = readTodos().tasks;
      moved(d.rows.map(r => r.dataset.task), d.from, d.to).forEach((id, i) => {
        const x = tasks.find(y => y.id === id);
        if (x && x.rank !== i) editTodo('task', id, { rank: i });
      });
      vibrate(8);
    }
    render();
  }

  // A task dragged under another becomes its subtask. Subtasks are just a name
  // and a tick, so it asks first if the task has more than that.
  async function makeSubtask(id, parentId) {
    const x = find(id), parent = find(parentId);
    if (!x || !parent) { render(); return; }
    const lost = [x.due && 'due date', x.repeat && 'repeat', x.priority && 'priority', x.notes && 'notes', x.sticker && 'sticker', x[planKey()] && 'spot on the Plan'].filter(Boolean);
    if (lost.length) {
      const list = lost.length > 1 ? `${lost.slice(0, -1).join(', ')} and ${lost[lost.length - 1]}` : lost[0];
      const ok = await confirmSheet(`Tuck “${x.title}” under “${parent.title}”?`, `Subtasks are just a name and a tick, so its ${list} won't come along.`, { ok: 'Make it a subtask' });
      if (!ok) { render(); return; }
    }
    addTodo('sub', { task: parentId, title: x.title, done: false, order: Date.now() });
    removeTodo('task', id);
    openSubs.add(parentId);
    syncTodoPlan();
    const first = !prefs.todoTucked;
    setPref('todoTucked', true);
    toast(`↳ Now a subtask of “${parent.title}”${first ? ' · hold it and drag left to undo' : ''}`);
    vibrate(10);
    render();
  }

  // A subtask dragged out becomes a task again, just under the one it came from.
  function promoteSub(subId) {
    const parent = readTodos().tasks.find(t => (t.subs || []).some(y => y.id === subId));
    const sub = parent && parent.subs.find(y => y.id === subId);
    if (!sub) { render(); return; }
    const id = addTodo('task', { title: sub.title, group: parent.group, who: [...(parent.who && parent.who.length ? parent.who : [parent.owner])],
      due: '', repeat: '', priority: '', notes: '', sticker: '', done: !!sub.done, ...(sub.done ? { doneAt: sub.doneAt || Date.now(), doneBy: me() } : {}), order: Date.now() });
    removeTodo('sub', subId);
    if (!parent.done && !sub.done) {
      const order = sortOpen(readTodos().tasks.filter(t => t.group === parent.group && !t.done)).map(t => t.id).filter(t => t !== id);
      order.splice(order.indexOf(parent.id) + 1, 0, id);
      const tasks = readTodos().tasks;
      order.forEach((tid, i) => { const t = tasks.find(y => y.id === tid); if (t && t.rank !== i) editTodo('task', tid, { rank: i }); });
    }
    if (parent.subs.length <= 1) openSubs.delete(parent.id);
    toast(`↖ “${sub.title}” is a task again`);
    vibrate(10);
    render();
  }

  // ── adding with a quick line: type, Enter, and the line's ready for the next ──
  root.addEventListener('submit', e => {
    const form = e.target.closest('.quick-add');
    if (!form) return;
    e.preventDefault();
    const inp = form.querySelector('.qa-inp');
    const title = inp.value.trim().slice(0, 80);
    if (!title) { inp.blur(); return; }   // Enter on an empty line: done adding
    if (form.dataset.qa) {
      addTodo('task', { title, group: form.dataset.qa, who: [me()], due: '', repeat: '', priority: '', notes: '', sticker: '', done: false, order: Date.now() });
      const seen = prefs.todoQuickHint || 0;
      if (seen < 3) { setPref('todoQuickHint', seen + 1); toast('Added ✨ Tap it any time to add a date, who or subtasks'); }
    } else if (form.dataset.qasub) {
      addTodo('sub', { task: form.dataset.qasub, title, done: false, order: Date.now() });
      openSubs.add(form.dataset.qasub);
    }
    inp.value = '';
    vibrate(6);
    render();   // the cursor stays on this line (see render)
  });

  // ── a task's editor ────────────────────────────────────────────────────
  function taskSheet(task, preset = {}) {
    const isNew = !task;
    const mine = isNew || task.owner === me();
    const key = planKey();
    const p0 = task ? task[key] : null;
    const groupsNow = () => readTodos().groups.filter(g => mine || !g.private);   // your person's tasks stay in shared groups
    const draft = {
      title: task ? task.title : '', sticker: task ? task.sticker || '' : '',
      group: task ? task.group : preset.group || groupsNow()[0]?.id || '',
      who: task ? [...(task.who || [task.owner])] : [me()],
      due: task ? task.due || '' : preset.due || '', repeat: task ? task.repeat || '' : '', priority: task ? task.priority || '' : '',
      notes: task ? task.notes || '' : '',
      subs: task ? (task.subs || []).map(s => ({ id: s.id, title: s.title, done: !!s.done })) : [],
      planOn: !!p0, sched: p0 ? p0.sched : monthSchedules()[0]?.id || '', time: p0 ? p0.time ?? null : null,
    };
    let rich = null;
    const sheet = openSheet({ title: isNew ? 'New task' : 'Edit task', className: 'task-sheet', body: '<form class="task-form" novalidate></form>', onClose: () => rich?.stop() });
    const form = sheet.el.querySelector('form');
    const keepTyped = () => {
      const val = n => form.elements.namedItem(n)?.value;
      if (val('title') !== undefined) draft.title = val('title');
      if (val('due') !== undefined) draft.due = val('due');
      if (val('repeat') !== undefined) draft.repeat = val('repeat');
      if (val('time') !== undefined) draft.time = val('time') === '' ? null : Number(val('time'));
      form.querySelectorAll('[data-subtitle]').forEach(inp => { draft.subs[Number(inp.dataset.subtitle)].title = inp.value; });
      const extra = val('newsub');
      if (extra && extra.trim()) draft.subs.push({ title: extra.trim(), done: false });
    };
    const whoIs = list => (list.length === 2 ? 'both' : list[0] === me() ? 'me' : 'them');

    function draw() {
      rich?.stop();
      const t = them();
      const scheds = monthSchedules();
      const sched = scheds.find(s => s.id === draft.sched) || scheds[0];
      let times = '<option value="">Any time</option>';
      for (let m = 0; m < 1440; m += 30) times += `<option value="${m}"${draft.time === m ? ' selected' : ''}>${fmtTime(m)}</option>`;
      const planHint = !draft.due ? 'give it a due date first'
        : `adds it to ${sched ? `“${sched.name}”` : 'a new calendar, “Our calendar”'} on ${fmtDay(draft.due, { weekday: 'short', day: 'numeric', month: 'short' })}`;
      form.innerHTML = `
        <label class="field"><span>Task</span><input class="inp" name="title" maxlength="80" value="${esc(draft.title)}" placeholder="e.g. Deep clean the bathroom" autocomplete="off"></label>
        <div class="field"><span>Sticker</span><div class="icon-row stk-row">
          <button type="button" class="icon-pick${draft.sticker ? '' : ' on'}" data-stk="" aria-label="No sticker">∅</button>
          ${STICKERS.map(n => `<button type="button" class="icon-pick${draft.sticker === n ? ' on' : ''}" data-stk="${n}" aria-label="${n}"><img src="${stickerSrc(n)}" alt="" draggable="false"></button>`).join('')}</div></div>
        <div class="field"><span>Group</span><div class="chips sm">
          ${groupsNow().map(g => `<button type="button" class="chip${draft.group === g.id ? ' on' : ''}" data-grp="${g.id}" aria-pressed="${draft.group === g.id}" style="${colorVars(g.color)}">${esc(g.emoji || '📋')} ${esc(g.name)}${g.private ? ' 🔒' : ''}</button>`).join('')}
          <button type="button" class="chip add-own" data-newgrp>＋ new group</button></div></div>
        ${t ? `<div class="field who"><span>Who's doing it?</span><div class="seg wide" style="${colorVars('mint')}">
          <button type="button" data-whom="me" class="${whoIs(draft.who) === 'me' ? 'on' : ''}">${avatar(me(), 'seg-av')}Me</button>
          <button type="button" data-whom="them" class="${whoIs(draft.who) === 'them' ? 'on' : ''}">${avatar(store.partner(), 'seg-av')}${esc(t.name)}</button>
          <button type="button" data-whom="both" class="${whoIs(draft.who) === 'both' ? 'on' : ''}">💞 Both</button></div></div>` : ''}
        <div class="field two">
          <label><span>Due <span class="field-hint">· optional</span></span><input class="inp" type="date" name="due" value="${esc(draft.due)}"></label>
          <label><span>Repeat</span><select class="inp" name="repeat">${REPEATS.map(r => `<option value="${r.id}"${draft.repeat === r.id ? ' selected' : ''}>${r.label}</option>`).join('')}</select></label>
        </div>
        <div class="field"><span>Priority</span><div class="seg wide" style="${colorVars('mint')}">
          ${PRIORITIES.map(([id, label]) => `<button type="button" data-prio="${id}" class="${draft.priority === id ? 'on' : ''}">${label}</button>`).join('')}</div></div>
        <div class="field"><span>Subtasks${draft.subs.length > 1 ? ' <span class="field-hint">· drag ⋮⋮ to reorder</span>' : ''}</span>
          <div class="sub-edit">
            ${draft.subs.map((s, i) => `<div class="sub" data-i="${i}">
              <button type="button" class="tick${s.done ? ' on' : ''}" data-subdone="${i}" aria-pressed="${s.done}" aria-label="Done"></button>
              <input class="inp sub-inp" data-subtitle="${i}" value="${esc(s.title)}" maxlength="80" aria-label="Subtask">
              <button type="button" class="own-del" data-subdel="${i}" aria-label="Remove">×</button>
              <span class="grip" aria-hidden="true">⋮⋮</span></div>`).join('')}
            <input class="inp" name="newsub" maxlength="80" placeholder="＋ Add a subtask…" enterkeyhint="done" autocomplete="off">
          </div></div>
        ${richFieldHTML('Notes', draft.notes)}
        <div class="share-row" style="${colorVars('lavender')}"><span>🗓️ Put it on our Plan<small>${esc(planHint)}</small></span>
          <button type="button" class="tgl${draft.planOn ? ' on' : ''}" data-planon role="switch" aria-checked="${draft.planOn}" aria-label="Put it on our Plan"></button></div>
        ${draft.planOn ? `<div class="field two plan-pick">
          ${scheds.length > 1 ? `<label><span>Calendar</span><select class="inp" name="sched">${scheds.map(s => `<option value="${s.id}"${sched && s.id === sched.id ? ' selected' : ''}>${esc(s.name)}${s.private ? ' 🔒' : ''}</option>`).join('')}</select></label>` : ''}
          <label><span>Time</span><select class="inp" name="time">${times}</select></label></div>` : ''}
        <p class="ob-err td-err" hidden></p>
        <div class="sheet-actions">
          ${isNew ? '' : '<button type="button" class="btn ghost danger-text" data-del>Delete</button>'}
          <button type="submit" class="btn" style="${colorVars('mint')}">${isNew ? 'Add task' : 'Save'}</button>
        </div>`;
      rich = wireRich(form.querySelector('.rt'), form.querySelector('.rt-bar'), md => { draft.notes = md.slice(0, NOTE_MAX); }, { max: NOTE_MAX });
    }
    const redraw = () => { keepTyped(); draw(); };
    const pickIn = (sel, btn) => form.querySelectorAll(sel).forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-pressed', b === btn); });
    draw();
    if (isNew) setTimeout(() => form.elements.namedItem('title')?.focus(), 280);

    form.addEventListener('change', e => { if (e.target.name === 'sched') draft.sched = e.target.value; if (e.target.name === 'due' && draft.planOn) redraw(); });
    form.addEventListener('keydown', e => {
      if (e.target.name !== 'newsub' || e.key !== 'Enter') return;
      e.preventDefault();
      redraw();
      form.elements.namedItem('newsub')?.focus();
    });
    form.addEventListener('click', e => {
      const stk = e.target.closest('[data-stk]');
      if (stk) { draft.sticker = stk.dataset.stk; pickIn('[data-stk]', stk); return; }
      const grp = e.target.closest('[data-grp]');
      if (grp) { draft.group = grp.dataset.grp; pickIn('[data-grp]', grp); return; }
      const whom = e.target.closest('[data-whom]');
      if (whom) {
        draft.who = whom.dataset.whom === 'both' ? [me(), store.partner()] : [whom.dataset.whom === 'me' ? me() : store.partner()];
        form.querySelectorAll('[data-whom]').forEach(b => b.classList.toggle('on', b === whom));
        return;
      }
      const prio = e.target.closest('[data-prio]');
      if (prio) { draft.priority = prio.dataset.prio; form.querySelectorAll('[data-prio]').forEach(b => b.classList.toggle('on', b === prio)); return; }
      const sd = e.target.closest('[data-subdone]');
      if (sd) { keepTyped(); const s = draft.subs[Number(sd.dataset.subdone)]; s.done = !s.done; draw(); return; }
      const del = e.target.closest('[data-subdel]');
      if (del) { keepTyped(); draft.subs.splice(Number(del.dataset.subdel), 1); draw(); return; }
      if (e.target.closest('[data-planon]')) { keepTyped(); draft.planOn = !draft.planOn; draw(); return; }
      if (e.target.closest('[data-newgrp]')) { keepTyped(); groupSheet(null, id => { draft.group = id; draw(); render(); }); return; }
      if (e.target.closest('[data-del]')) {
        confirmSheet(`Delete “${task.title}”?`, task.owner === me() ? 'It goes from both of your lists.' : `It goes from ${(them() || {}).name || 'your person'}'s list too.`, { ok: 'Delete', danger: true })
          .then(ok => { if (!ok) return; removeTodo('task', task.id); sheet.close(); syncTodoPlan(); render(); });
      }
    });

    // Drag ⋮⋮ to put subtasks in order.
    form.addEventListener('pointerdown', e => {
      const grip = e.target.closest('.sub-edit .grip');
      if (!grip) return;
      keepTyped();
      dragSort(e, grip, [...form.querySelectorAll('.sub-edit .sub')], grip.closest('.sub'), (from, to) => {
        draft.subs.splice(to, 0, draft.subs.splice(from, 1)[0]);
        draw();
      });
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      keepTyped();
      const err = form.querySelector('.td-err');
      const fail = msg => { err.hidden = false; err.textContent = msg; };
      const title = draft.title.trim();
      if (!title) { fail('What needs doing?'); form.elements.namedItem('title').focus(); return; }
      if (!draft.group) { fail('Pick a group (or make one)'); return; }
      if (draft.planOn && !draft.due) { fail('Give it a due date to put it on the Plan'); return; }
      const subs = draft.subs.filter(s => s.title.trim());
      const fields = { title, sticker: draft.sticker, who: draft.who, due: draft.due, repeat: draft.repeat, priority: draft.priority, notes: draft.notes };
      let plan = null;
      if (draft.planOn) {
        const sched = monthSchedules().some(s => s.id === draft.sched) ? draft.sched : ensureCalendar();
        plan = { sched, time: draft.time, item: (p0 && p0.item) || uid(), placed: !!(p0 && p0.placed) };
      }
      let id;
      if (isNew) {
        id = addTodo('task', { ...fields, group: draft.group, done: false, order: Date.now(), ...(plan ? { [key]: plan } : {}) });
      } else {
        id = task.id;
        const patch = {};
        for (const [f, v] of Object.entries(fields)) if (!same(task[f] ?? '', v ?? '')) patch[f] = v;
        if (!same(task[key] || null, plan)) patch[key] = plan;
        if (Object.keys(patch).length) editTodo('task', id, patch);
        if (draft.group !== task.group) moveTask(id, draft.group);
      }
      // Subtasks: new ones added, changed ones edited, removed ones deleted, all in this order.
      const before = new Map((task ? task.subs || [] : []).map(s => [s.id, s]));
      subs.forEach((s, i) => {
        if (!s.id) { addTodo('sub', { task: id, title: s.title.trim(), done: s.done, order: i }); return; }
        const b = before.get(s.id);
        before.delete(s.id);
        const patch = {};
        if (b.title !== s.title.trim()) patch.title = s.title.trim();
        if (!!b.done !== s.done) Object.assign(patch, { done: s.done, doneAt: Date.now() });
        if ((b.order ?? -1) !== i) patch.order = i;
        if (Object.keys(patch).length) editTodo('sub', s.id, patch);
      });
      for (const gone of before.keys()) removeTodo('sub', gone);
      sheet.close();
      syncTodoPlan();
      if (isNew) toast('Added ✨');
      render();
    });
  }

  // ── done tasks ─────────────────────────────────────────────────────────
  // Tick one to put it back on its list, or ✕ to delete it. *Choose tasks to
  // delete* lets you tick the ones to go (or all of them) and delete those
  // together, asking first. A shared list's tasks go for you both.
  function doneSheet() {
    const sheet = openSheet({ title: 'Done', body: '<div class="done-list"></div>', onClose: render });
    const box = sheet.el.querySelector('.done-list');
    let choosing = false;
    const picked = new Set();
    const doneTasks = () => readTodos().tasks.filter(x => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 60);
    const draw = () => {
      const { groups } = readTodos();
      const done = doneTasks();
      for (const id of [...picked]) if (!done.some(x => x.id === id)) picked.delete(id);
      if (!done.length) { choosing = false; box.innerHTML = '<p class="muted">Nothing ticked off yet.</p>'; return; }
      const meta = x => {
        const g = groups.find(y => y.id === x.group) || {};
        return `<div class="t-body"><span class="t-title">${esc(x.title)}</span><div class="t-meta"><span class="tag">${esc(g.emoji || '📋')} ${esc(g.name || '')}</span><span class="tag">done${x.doneBy ? ` by ${esc(nameOf(x.doneBy))}` : ''}${x.doneAt ? ` · ${esc(whenDone(x.doneAt))}` : ''}</span></div></div>`;
      };
      if (!choosing) {
        box.innerHTML = done.map(x => `<div class="task done"><button type="button" class="tick on" data-undo="${x.id}" aria-label="${esc(x.title)}: not done after all"></button>
            ${meta(x)}<button type="button" class="row-x" data-del-done="${x.id}" aria-label="Delete ${esc(x.title)}">✕</button></div>`).join('')
          + `<p class="muted small">Tap a tick to put a task back on the list, or ✕ to delete it.</p>
            <button type="button" class="btn ghost danger-text clear-done" data-choose>☑ Choose tasks to delete</button>`;
        return;
      }
      const all = done.every(x => picked.has(x.id));
      box.innerHTML = `<div class="done-tools"><span>${picked.size ? `${picked.size} chosen` : 'Tap the ones to delete'}</span>
          <button type="button" class="link-btn" data-pick-all>${all ? 'Select none' : 'Select all'}</button></div>`
        + done.map(x => `<div class="task done pick-row${picked.has(x.id) ? ' picked' : ''}" data-pick-done="${x.id}" role="checkbox" aria-checked="${picked.has(x.id)}" tabindex="0">
            <span class="pick-box" aria-hidden="true"></span>${meta(x)}<span></span></div>`).join('')
        + `<div class="sheet-actions done-actions"><button type="button" class="btn ghost" data-choose-off>Cancel</button>
            <button type="button" class="btn danger" data-del-picked${picked.size ? '' : ' disabled'}>🗑 Delete ${picked.size || ''}</button></div>`;
    };
    draw();
    const deleted = n => { syncTodoPlan(); toast(`🗑 ${n === 1 ? 'Deleted' : `${n} done tasks deleted`}`); };
    box.addEventListener('click', async e => {
      const b = e.target.closest('[data-undo], [data-del-done], [data-choose], [data-choose-off], [data-pick-all], [data-pick-done], [data-del-picked]');
      if (!b) return;
      const d = b.dataset;
      if (d.undo) { editTodo('task', d.undo, { done: false }); vibrate(8); syncTodoPlan(); }
      else if (d.delDone) { removeTodo('task', d.delDone); vibrate(8); deleted(1); }
      else if (d.choose !== undefined) { choosing = true; picked.clear(); }
      else if (d.chooseOff !== undefined) { choosing = false; picked.clear(); }
      else if (d.pickAll !== undefined) {
        const done = doneTasks();
        if (done.every(x => picked.has(x.id))) picked.clear(); else done.forEach(x => picked.add(x.id));
      } else if (d.pickDone) {
        if (picked.has(d.pickDone)) picked.delete(d.pickDone); else picked.add(d.pickDone);
        vibrate(6);
      } else if (d.delPicked !== undefined) {
        if (!picked.size) return;
        const { tasks, groups } = readTodos();
        const t = them();
        const shared = t && tasks.some(x => picked.has(x.id) && !(groups.find(g => g.id === x.group) || {}).private);
        const n = picked.size;
        const ok = await confirmSheet(`Delete ${n} done task${n === 1 ? '' : 's'}?`,
          `They're gone for good${shared ? `, from ${t.name}'s lists too` : ''}. The rest stay in your done list.`, { ok: 'Delete', danger: true });
        if (!ok) return;
        for (const id of picked) removeTodo('task', id);
        picked.clear();
        choosing = false;
        deleted(n);
      }
      draw();
    });
    box.addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && e.target.matches('[data-pick-done]')) { e.preventDefault(); e.target.click(); }
    });
  }

  // ── taps ───────────────────────────────────────────────────────────────
  root.addEventListener('click', async e => {
    if (Date.now() < noClickUntil) { e.preventDefault(); return; }   // letting go of a held task
    const b = e.target.closest('[data-tick], [data-subtick], [data-fold], [data-edit], [data-gtab], [data-gedit], [data-who], [data-td], [data-pick], [data-pickvis]');
    if (!b) return;
    const d = b.dataset;
    if (d.tick) tick(d.tick);
    else if (d.subtick) { tickSub(d.subtick); vibrate(8); render(); }
    else if (d.fold) { if (openSubs.has(d.fold)) openSubs.delete(d.fold); else openSubs.add(d.fold); render(); }
    else if (d.edit) { const t = find(d.edit); if (t) taskSheet(t); }
    else if (d.gtab) { tab = d.gtab; setPref('todoGroup', tab); render(); }
    else if (d.gedit) { const g = readTodos().groups.find(x => x.id === d.gedit); if (g) groupSheet(g); }
    else if (d.who) { who = d.who; setPref('todoWho', who); render(); }
    else if (d.pick) { const p = picks[Number(d.pick)]; p.on = !p.on; vibrate(8); render(); }
    else if (d.pickvis) { const p = picks[Number(d.pickvis)]; p.private = !p.private; render(); }
    else if (d.td === 'pick-own') {
      const text = await promptSheet('Your own list', { placeholder: 'e.g. 🎄 Christmas', ok: 'Add', maxlength: 28 });
      if (!text || !picks) return;
      const seg = window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(text)][0]?.segment : Array.from(text)[0];
      const emoji = seg && !/[\p{L}\p{N}\s]/u.test(seg) ? seg : '';
      const name = (emoji ? text.slice(emoji.length) : text).trim() || text.trim();
      picks.push({ emoji: emoji || '📋', name, color: OWN_COLORS[picks.length % OWN_COLORS.length], on: true, private: false });
      render();
    } else if (d.td === 'make-lists') makeLists();
    else if (d.td === 'lists') listsSheet();
    else if (d.td === 'new') focusQuickAdd();
    else if (d.td === 'new-group') groupSheet(null);
    else if (d.td === 'done') doneSheet();
    else if (d.td === 'tell') tellSheet();
  });

  // Your person's ticks and edits (or your other devices'): redraw, and keep my Plan in step.
  store.on((k, source) => {
    if (source !== 'remote') return;
    if (/:todos(-private)?$/.test(k)) {
      syncTodoPlan();
      if (root.classList.contains('active') && !drag) render();
    } else if (k.endsWith(':profile') && root.classList.contains('active')) render();
  });
  syncTodoPlan();

  return {
    show() { syncTodoPlan(); render(); },
    /** From a widget: 'new' or 'new:<group>' (that list's "＋ Add to …" line), or 'task:<id>' (that task). */
    open(route) {
      const [what, id] = route.split(':');
      if (what === 'new') focusQuickAdd(id);
      else if (what === 'task') { const t = find(id); if (t) taskSheet(t); }
    },
  };
}
