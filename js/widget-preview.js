// The widgets, in the browser (test server only: Us → Sync details →
// Widget preview). The phone paints its widgets natively (doing-android:
// WidgetPainter.java), from the same summary (widgets.js) and with the same
// settings; this page draws them the same way so they can be tried here.
// Taps go through the same steps as on the phone: each becomes an op with
// the day and time it was made, applied with applyOps.

import * as store from './store.js';
import { $, colorVars, dayKey, esc, fmtTime, isDark, keyToDate, shiftDay, toast } from './util.js';
import { stickerSrc } from './stickers.js';
import { avatarHTML } from './avatars.js';
import { applyOps, buildSummary } from './widgets.js';
import { nextNudge } from './walk.js';

// Each widget's settings, with what it starts with (WidgetConfig.java has the same).
export const DEFAULTS = {
  track: { whose: 'me', show: null, plus: true, could: true },
  todo: { groups: null, whose: 'all', subs: true, due: true, who: true, progress: true, done: false, order: 'due', tick: true, add: true },
  plan: { sched: null, view: 'next', todos: true, left: true, theirs: false },
  meds: { meds: null, confirm: false, times: true, next: true, low: true, remind: false, again: false },
  work: { types: null, hours: true, timer: true, totals: true },
  water: { whose: 'me' },
  caffeine: { whose: 'me', cutoff: true },
  walk: { whose: 'me' },
  cycle: { whose: 'me', discreet: false, button: true },
  own: { tracker: null, whose: 'me' },
};
export const WORK_DEFAULT = ['wfh', 'office', 'annual', 'sick'];
const PHASE_SHORT = { period: 'period', follicular: 'follicular', ovulation: 'ovulation', luteal: 'luteal' };
const PILL = { butter: ['#FFE59A', '#EDC45A'], coral: ['#FFC5C0', '#E8857D'], sky: ['#C3E1FF', '#86BDEB'], lavender: ['#D9CBFF', '#AE96E8'],
  mint: ['#BDEBD5', '#7CCFAA'], peach: ['#FFD0B5', '#F4A47C'], pink: ['#FFC9DC', '#F290B5'], sage: ['#D2E3BF', '#9EC07F'] };

// ── little helpers ────────────────────────────────────────────────────────
// Colours for the look being drawn (galaxy or pastel), whatever the page's theme.
let darkLook = false;
const cv = key => colorVars(key, darkLook);
const hrs = n => String(Math.round((n || 0) * 100) / 100);
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const clock = ms => { const d = new Date(ms); return fmtTime(d.getHours() * 60 + d.getMinutes()); };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const stk = (name, cls = '') => `<img class="${cls}" src="${stickerSrc(name)}" alt="" draggable="false">`;
const opAttr = o => `data-op='${esc(JSON.stringify(o))}'`;
function pillUri(color) {
  const [fill, line] = PILL[color] || PILL.butter;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="rotate(-35 50 50)">`
    + `<rect x="12" y="31" width="76" height="38" rx="19" fill="#fff" stroke="${line}" stroke-width="4"/>`
    + `<path d="M50 31 H31 A19 19 0 0 0 31 69 H50 Z" fill="${fill}" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>`
    + `<ellipse cx="28" cy="40" rx="7" ry="3.2" fill="#fff" opacity=".75"/></g>`
    + `<circle cx="43" cy="49" r="2.8" fill="#5B3F52"/><circle cx="57" cy="49" r="2.8" fill="#5B3F52"/>`
    + `<path d="M46.5 54.5 q3.5 3 7 0" stroke="#5B3F52" stroke-width="2" fill="none" stroke-linecap="round"/>`
    + `<ellipse cx="37" cy="55" rx="3.6" ry="2.2" fill="#FF8FB3" opacity=".55"/><ellipse cx="63" cy="55" rx="3.6" ry="2.2" fill="#FF8FB3" opacity=".55"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function dueShort(due, today) {
  if (due === today) return 'today';
  if (due === shiftDay(today, 1)) return 'tomorrow';
  if (due < today) return 'overdue';
  const d = keyToDate(due), ahead = Math.round((d - keyToDate(today)) / 864e5);
  return ahead < 7 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
}
const dateLabel = k => keyToDate(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
// Short names for the work widget's chips.
const workLabel = t => ({ office: 'Office', annual: 'Leave' }[t.id] || t.label);

// ── ring (the cycle's phases) ─────────────────────────────────────────────
const PHASE_COLOR = { period: '#F2918A', follicular: '#7CCFAA', ovulation: '#EDC456', luteal: '#AE96E8' };
function ring(c, size, sw) {
  const len = c.length || 28, per = c.periodLength || 5, ov = len - 14;
  const parts = [['period', per], ['follicular', Math.max(0, ov - 2 - per)], ['ovulation', 3], ['luteal', Math.max(0, len - ov - 1)]];
  const cx = size / 2, r = cx - sw / 2 - 2, C = 2 * Math.PI * r;
  let at = 0, out = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${sw}"/>`;
  for (const [id, n] of parts) {
    const l = (C * n) / len;
    if (l > sw + 3) out += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${PHASE_COLOR[id]}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(l - sw - 3).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-(at + sw / 2 + 1.5)).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>`;
    at += l;
  }
  if (c.cycleDay) {
    const a = ((Math.min(c.cycleDay, len) - 0.5) / len) * 2 * Math.PI - Math.PI / 2;
    out += `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cx + r * Math.sin(a)).toFixed(1)}" r="${(sw * 0.62).toFixed(1)}" fill="#fff" stroke="#5B4B5E" stroke-width="2"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${out}</svg>`;
}

// ── Tracking: one tile per tracker ────────────────────────────────────────
/** { icon, big, small, color, plus } for a tracker's tile. */
export function tile(id, d, mine, def) {
  switch (id) {
    case 'work': {
      const on = d.types.filter(t => d.v[t.id] != null);
      const worked = on.filter(t => !t.leave).reduce((s, t) => s + d.v[t.id], 0);
      const main = on.filter(t => t.id !== 'overtime');
      const icon = { emoji: (main[0] || on[0] || { emoji: '💼' }).emoji };
      if (!on.length) return { icon, big: '—', small: d.timer ? `⏱ since ${clock(d.timer)}` : 'work day', color: 'sky' };
      const leaveOnly = !worked && on.every(t => t.leave);
      return {
        icon, color: 'sky',
        big: leaveOnly ? workLabel(main[0]) : `${hrs(worked)}h`,
        small: d.timer ? `⏱ since ${clock(d.timer)}` : main.map(t => t.label).join(' + ') + (d.v.overtime ? ` +${hrs(d.v.overtime)}h` : ''),
      };
    }
    case 'cycle':
      if (d.none) return { icon: { sticker: 'pdrop' }, big: '—', small: 'cycle', color: 'coral' };
      return d.cycleDay
        ? { icon: { sticker: d.sticker }, big: `Day ${d.cycleDay}`, small: PHASE_SHORT[d.phase], color: 'coral' }
        : { icon: { sticker: d.sticker }, big: PHASE_SHORT[d.phase], small: 'phase', color: 'coral' };
    case 'water': return { icon: { sticker: 'drop' }, big: `${d.n}/${d.goal}`, small: d.n === 1 ? 'glass' : 'glasses', color: 'sky', plus: mine ? { op: 'water', d: 1 } : null };
    case 'caffeine': {
      const last = d.at[d.at.length - 1];
      const late = last && d.cutoff && (new Date(last).getHours() * 60 + new Date(last).getMinutes()) > toMin(d.cutoff);
      return { icon: { sticker: 'latte' }, big: String(d.n), small: late ? 'past cut-off' : d.n === 1 ? 'cup' : 'cups', color: 'peach', plus: mine ? { op: 'caffeine', d: 1 } : null };
    }
    case 'walk': {
      const first = (d.opts || [])[0];
      return { icon: { sticker: 'sneaker' }, big: `${d.n}/${d.goal || 3}`, small: d.n === 1 ? 'walk' : 'walks', color: 'mint', plus: mine && first ? { op: 'walk', opt: first.id } : null };
    }
    case 'meds': {
      const sched = d.list.filter(m => !m.asNeeded);
      const taken = m => (d.taken[m.id] || []).length > 0;
      const next = sched.filter(m => !taken(m) && m.time).sort((a, b) => toMin(a.time) - toMin(b.time))[0];
      const doses = d.list.filter(m => m.asNeeded).reduce((s, m) => s + (d.taken[m.id] || []).length, 0);
      return {
        icon: { emoji: '💊' }, color: 'mint',
        big: sched.length ? `${sched.filter(taken).length}/${sched.length}` : String(doses),
        small: next ? `${next.name} ${fmtTime(toMin(next.time))}` : sched.length && sched.every(taken) ? 'all taken ✓' : sched.length ? 'to take' : doses === 1 ? 'dose' : 'doses',
      };
    }
    default: {
      const o = d.def, v = d.v;
      const icon = o.sticker ? { sticker: o.sticker } : { emoji: o.emoji || '✨' };
      let big = '—';
      if (o.type === 'yesno') big = v === true ? '✓ done' : 'not yet';
      else if (o.type === 'count') { const n = typeof v === 'number' ? v : (v && v.n) || 0; big = o.goal ? `${hrs(n)}/${hrs(o.goal)}` : hrs(n); }
      else if (o.type === 'amount') big = typeof v === 'number' ? `${hrs(v)} ${o.unit}`.trim() : '—';
      else if (o.type === 'scale') big = v ? `${v}/${o.max}` : '—';
      else if (o.type === 'options') { const p = (v && v.picked) || []; big = p.length ? (o.options.find(x => x.id === p[0]) || {}).label || '—' : '—'; }
      else if (o.type === 'note') big = v ? '📝' : '—';
      const plus = mine && o.type === 'count' ? { op: 'own', id: o.id, o: 'inc' } : mine && o.type === 'yesno' ? { op: 'own', id: o.id, o: 'yes', on: v !== true } : null;
      return { icon, big, small: o.name, color: o.color, plus };
    }
  }
}
const iconHTML = (ic, cls = '') => (ic.sticker ? stk(ic.sticker, cls) : `<span class="${cls} e">${esc(ic.emoji || '✨')}</span>`);

function trackWidget(sum, cfg, side) {
  const mine = side === 'me';
  const p = mine ? sum.me : sum.them;
  const t = mine ? sum.trackers.me : sum.trackers.them;
  if (!p || !t) return head('Tracking', 'pink', { icon: 'app' }) + '<p class="wg-empty">Your person hasn’t joined yet</p>';
  const ids = t.order.filter(id => !cfg.show || cfg.show.includes(id));
  const tiles = ids.map(id => {
    const x = tile(id, t.data[id], mine);
    return `<div class="wg-tile" style="${cv(x.color)}" ${opAttr({ open: mine ? 'track' : 'track:them' })}>${iconHTML(x.icon, 't-ic')}<b>${esc(x.big)}</b><small>${esc(x.small)}</small>
      ${cfg.plus && x.plus ? `<button type="button" class="wg-plus" ${opAttr(x.plus)} aria-label="Add one">＋</button>` : ''}</div>`;
  }).join('');
  const flip = cfg.whose === 'both' && sum.them ? `<button type="button" class="wg-flip" data-flip aria-label="Show the other person">‹ ›</button>` : '';
  const could = mine && cfg.could && sum.them && sum.could.length
    ? `<button type="button" class="wg-support${sum.onIt ? ' on' : ''}" ${opAttr({ op: 'onit', on: !sum.onIt })}>💞 ${esc(sum.them.name)} could use: ${esc(sum.could.map(x => `${x.emoji} ${x.label.toLowerCase()}`).join(' · '))}${sum.onIt ? ' · ✓ on it' : ''}</button>` : '';
  return head('Tracking', 'pink', { icon: 'app', right: dateLabel(sum.day), who: p, flip })
    + (tiles ? `<div class="wg-tiles">${tiles}</div>` : `<p class="wg-empty">${mine ? 'Switch some trackers on in the app' : `${esc(p.name)} hasn’t shared any trackers yet`}</p>`)
    + could;
}

// The widget's header: icon, title, something on the right.
function head(title, color, { icon, right = '', who = null, flip = '', add = null, sticker = null } = {}) {
  const ic = icon === 'app' ? '<img class="wg-icon" src="icons/icon.svg" alt="">' : sticker ? stk(sticker, 'wg-icon') : icon ? `<span class="wg-e">${esc(icon)}</span>` : '';
  return `<div class="wg-head" style="${cv(color)}">${ic}<b>${esc(title)}</b><span class="push">${esc(right)}</span>
    ${who ? `<span class="wg-who" style="${cv(who.color)}">${avatarHTML(who)}</span>` : ''}${flip}
    ${add ? `<button type="button" class="wg-add" ${opAttr(add)} aria-label="Add">＋</button>` : ''}</div>`;
}

// ── To-Do ─────────────────────────────────────────────────────────────────
/** The tasks a To-Do widget lists, in its order: { open, done, progress }. */
export function todoList(sum, cfg) {
  const me = sum.me.slot, them = sum.them && sum.them.slot;
  let tasks = sum.todo.tasks.filter(t => !cfg.groups || cfg.groups.includes(t.group));
  if (cfg.whose === 'me') tasks = tasks.filter(t => t.who.includes(me));
  else if (cfg.whose === 'them' && them) tasks = tasks.filter(t => t.who.includes(them));
  const prio = t => (t.priority === 'high' ? 0 : t.priority === 'low' ? 2 : 1);
  const byDue = (a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : prio(a) - prio(b) || a.order - b.order;
  const gi = Object.fromEntries(sum.todo.groups.map((g, i) => [g.id, i]));
  // In a list's own order: the ones dragged into order first (todo.js sortOpen).
  const byRank = (a, b) => (a.rank == null ? (b.rank == null ? 0 : 1) : b.rank == null ? -1 : a.rank - b.rank);
  const order = cfg.order === 'priority' ? (a, b) => prio(a) - prio(b) || byDue(a, b)
    : cfg.order === 'group' ? (a, b) => (gi[a.group] ?? 99) - (gi[b.group] ?? 99) || byRank(a, b) || byDue(a, b) : byDue;
  const open = tasks.filter(t => !t.done).sort(order);
  const done = tasks.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
  const end = sum.todo.weekFrom + 7 * 864e5;
  const doneWeek = tasks.filter(t => t.doneAt >= sum.todo.weekFrom && t.doneAt < end).length;
  const due = tasks.filter(t => !t.done && t.due && t.due <= sum.todo.sunday).length;
  return { open, done, progress: { done: doneWeek, total: doneWeek + due } };
}

function todoWidget(sum, cfg) {
  const { open, done, progress } = todoList(sum, cfg);
  const groups = sum.todo.groups.filter(g => !cfg.groups || cfg.groups.includes(g.id));
  const right = cfg.groups ? groups.map(g => `${g.emoji} ${g.name}`).join(' · ') : 'All lists';
  const people = Object.fromEntries([sum.me, sum.them].filter(Boolean).map(p => [p.slot, p]));
  const today = sum.day;
  const row = t => {
    const tags = [];
    if (cfg.due && t.priority === 'high') tags.push('<span class="tag hot">❗</span>');
    if (cfg.due && t.due) tags.push(`<span class="tag${t.due < today ? ' hot' : ''}">${esc(dueShort(t.due, today))}${t.time != null ? ' ' + esc(fmtTime(t.time)) : ''}</span>`);
    if (t.subs.length) tags.push(`<span class="tag">${t.subs.filter(s => s.done).length}/${t.subs.length}</span>`);
    const avs = cfg.who && sum.them ? t.who.map(s => people[s]).filter(Boolean).map(p => `<span class="av" style="${cv(p.color)}">${avatarHTML(p)}</span>`).join('') : '';
    const tick = cfg.tick ? `<button type="button" class="tick${t.done ? ' on' : ''}" ${opAttr({ op: 'tick', id: t.id, done: !t.done, due: t.due })} aria-label="Tick"></button>` : `<span class="tick${t.done ? ' on' : ''}"></span>`;
    const subs = cfg.subs && !t.done ? t.subs.filter(s => !s.done).slice(0, 2).map(s => `<div class="wg-task sub">
        ${cfg.tick ? `<button type="button" class="tick" ${opAttr({ op: 'subtick', id: s.id, done: true })} aria-label="Tick"></button>` : '<span class="tick"></span>'}<span class="t">${esc(s.title)}</span></div>`).join('') : '';
    return `<div class="wg-task${t.done ? ' done' : ''}">${tick}<span class="t" ${opAttr({ open: `todo:task:${t.id}` })}>${t.sticker ? stk(t.sticker, 't-stk') : ''}${esc(t.title)}</span>${tags.join('')}${avs}</div>${subs}`;
  };
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const rows = [...open.map(row), ...(cfg.done ? done.map(row) : [])];
  return head('To-Do', 'mint', { icon: 'app', right, add: cfg.add ? { open: `todo:new${cfg.groups && cfg.groups.length === 1 ? ':' + cfg.groups[0] : ''}` } : null })
    + (cfg.progress ? `<div class="wg-bar" style="${cv('mint')}" title="${progress.done} of ${progress.total} this week"><i style="width:${pct}%"></i></div>` : '')
    + (rows.length ? `<div class="wg-tasks" style="${cv('mint')}">${rows.join('')}</div>` : `<p class="wg-empty">${progress.done ? 'All done this week ✨' : 'Nothing to do 🌱'}</p>`);
}

// ── Plan ──────────────────────────────────────────────────────────────────
export function pickSched(sum, cfg) {
  const mine = sum.plan.scheds.filter(s => s.owner === 'me');
  return mine.find(s => s.id === cfg.sched) || mine.find(s => s.type === 'month') || mine[0] || null;
}
/** What's planned on a date: [{ t, e, title, icon, color, todo, owner }] by time (untimed first). */
export function planOn(sum, cfg, d) {
  const sched = pickSched(sum, cfg);
  if (!sched) return [];
  const list = [sched, ...(cfg.theirs ? sum.plan.scheds.filter(s => s.owner === 'them' && s.type === sched.type) : [])];
  const wd = keyToDate(d).getDay();
  const out = [];
  for (const s of list) {
    if (s.type === 'month') { for (const it of s.items) if (it.d === d && (cfg.todos || !it.todo)) out.push({ ...it, e: null, owner: s.owner }); }
    else for (const b of s.blocks) if (s.type === 'day' || b.day === wd) out.push({ ...b, todo: false, owner: s.owner });
  }
  return out.sort((a, b) => (a.t ?? -1) - (b.t ?? -1));
}
const left = mins => (mins < 60 ? `in ${mins} min` : `in ${Math.round(mins / 60)} h`);

function planWidget(sum, cfg) {
  const sched = pickSched(sum, cfg);
  if (!sched) return head('Plan', 'lavender', { icon: '🗓️' }) + '<p class="wg-empty">Make a plan in the app</p>';
  const today = sum.day, now = nowMin();
  const blk = (it, cls, sub) => `<div class="wg-blk ${cls}" style="${cv(it.color)}" ${opAttr({ open: 'plan' })}><b>${esc(it.icon ? it.icon + ' ' : '')}${esc(it.title || 'Untitled')}${it.owner === 'them' ? ' · ' + esc(sum.them.name) : ''}</b><small>${esc(sub)}</small></div>`;
  const when = it => (it.t == null ? 'today' : fmtTime(it.t) + (it.e != null ? ` – ${fmtTime(it.e)}` : ''));
  if (cfg.view === 'next') {
    const items = planOn(sum, cfg, today).filter(it => it.t == null || (it.e ?? it.t + 60) > now);
    let html = items.slice(0, 3).map((it, i) => {
      const ongoing = it.t != null && it.t <= now;
      const sub = it.t == null ? 'today' : ongoing ? `now · until ${fmtTime(it.e ?? it.t + 60)}` : fmtTime(it.t) + (cfg.left && i === 0 ? ` · ${left(it.t - now)}` : '');
      return blk(it, i ? 'later' : '', sub);
    }).join('');
    if (!html) {
      for (let i = 1; i <= 7 && !html; i++) {
        const k = shiftDay(today, i), list = planOn(sum, cfg, k);
        if (list.length) html = `<p class="wg-when">${i === 1 ? 'Tomorrow' : esc(dateLabel(k))}</p>` + list.slice(0, 2).map((it, j) => blk(it, j ? 'later' : '', when(it))).join('');
      }
    }
    return head('Up next', 'lavender', { right: sched.name }) + (html || '<p class="wg-empty">Nothing planned this week 🌿</p>');
  }
  if (cfg.view === 'today') {
    const items = planOn(sum, cfg, today);
    return head('Today', 'lavender', { right: sched.name }) + (items.map(it => blk(it, it.t != null && (it.e ?? it.t + 60) <= now ? 'past' : '', when(it))).join('') || '<p class="wg-empty">Nothing planned today 🌿</p>');
  }
  if (cfg.view === 'week') {
    const rows = Array.from({ length: 7 }, (_, i) => shiftDay(today, i)).map(k => {
      const items = planOn(sum, cfg, k);
      return `<div class="wg-wk${k === today ? ' today' : ''}"><span>${esc(keyToDate(k).toLocaleDateString(undefined, { weekday: 'short' }))} ${keyToDate(k).getDate()}</span>
        <span class="wk-items">${items.map(it => `<i style="${cv(it.color)}">${esc(it.icon ? it.icon + ' ' : '')}${esc(it.title)}${it.t != null ? ' ' + esc(fmtTime(it.t)) : ''}</i>`).join('') || '<em>—</em>'}</span></div>`;
    }).join('');
    return head('This week', 'lavender', { right: sched.name }) + `<div class="wg-week">${rows}</div>`;
  }
  // month
  const d0 = keyToDate(today.slice(0, 8) + '01');
  const lead = (d0.getDay() + 6) % 7, days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let n = 1; n <= days; n++) {
    const k = today.slice(0, 8) + String(n).padStart(2, '0');
    const items = planOn(sum, cfg, k);
    cells.push(`<span class="${k === today ? 'today' : ''}">${n}${items.length ? `<i style="${cv(items[0].color)}"></i>` : ''}</span>`);
  }
  return head(d0.toLocaleDateString(undefined, { month: 'long' }), 'lavender', { right: sched.name })
    + `<div class="wg-cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<b>${x}</b>`).join('')}${cells.join('')}</div>`;
}

// ── Single trackers ───────────────────────────────────────────────────────
function medsWidget(sum, cfg, d, mine) {
  const list = d.list.filter(m => !cfg.meds || cfg.meds.includes(m.id)).slice(0, 4);
  const sched = d.list.filter(m => !m.asNeeded);
  const takenN = sched.filter(m => (d.taken[m.id] || []).length).length;
  const now = nowMin();
  const cells = list.map(m => {
    const ts = (d.taken[m.id] || []).filter(x => x !== undefined);
    const on = ts.length > 0;
    let line, missed = false;
    if (m.asNeeded) line = ts.length ? `${ts.length} today${cfg.times && ts[ts.length - 1] ? ' · ' + clock(ts[ts.length - 1]) : ''}` : 'as needed';
    else if (on) line = cfg.times && ts[0] ? `✓ ${clock(ts[0])}` : '✓ taken';
    else if (m.time && toMin(m.time) + 60 < now) { line = `missed ${fmtTime(toMin(m.time))}`; missed = true; }
    else line = m.time && cfg.next ? `due ${fmtTime(toMin(m.time))}` : 'not yet';
    const op = !mine ? null : m.asNeeded ? { op: 'med', id: m.id, add: true } : { op: 'med', id: m.id, on: !on };
    return `<button type="button" class="med-stk${on && !m.asNeeded ? ' taken' : ''}${m.asNeeded ? ' prn' : ''}${missed ? ' missed' : ''}" ${op ? opAttr(cfg.confirm ? { ...op, confirm: true } : op) : ''}>
      <span class="pill-wrap"><img src="${pillUri(m.color)}" alt=""><i class="ok${m.asNeeded && ts.length ? ' show' : ''}">${m.asNeeded ? ts.length : '✓'}</i></span><b>${esc(m.name)}</b><small>${esc(line)}</small></button>`;
  }).join('');
  const low = cfg.low && mine ? d.list.filter(m => m.left != null && m.left <= m.lowAt) : [];
  return head('Medication', 'mint', { icon: '💊', right: sched.length ? `${takenN} of ${sched.length} taken` : '' })
    + (cells ? `<div class="meds-row">${cells}</div>` : '<p class="wg-empty">Add your medicines in the app</p>')
    + low.map(m => `<div class="wg-low">🔔 ${esc(m.name)}: ${m.left} left in the pack</div>`).join('');
}

function workWidget(sum, cfg, d, mine) {
  const ids = cfg.types || WORK_DEFAULT;
  const types = ids.map(id => d.types.find(t => t.id === id)).filter(Boolean).slice(0, 5);
  const among = types.map(t => t.id);
  const chips = types.map(t => {
    const on = d.v[t.id] != null;
    return `<button type="button" class="wt${on ? ' on' : ''}" ${mine ? opAttr({ op: 'work', type: t.id, on: !on, among }) : ''}>${esc(t.emoji)} ${esc(workLabel(t))}</button>`;
  }).join('');
  const cur = types.find(t => d.v[t.id] != null && t.id !== 'overtime');
  const hoursRow = cfg.hours ? `<div class="wk-hrs"><span class="lbl">Hours</span>
      ${mine && cur ? `<button type="button" ${opAttr({ op: 'hours', type: cur.id, step: -0.5 })}>−</button>` : ''}<b>${cur ? hrs(d.v[cur.id]) : '—'}</b><small>h</small>
      ${mine && cur ? `<button type="button" ${opAttr({ op: 'hours', type: cur.id, step: 0.5 })}>+</button>` : ''}
      ${mine && cfg.timer ? (d.timer ? `<button type="button" class="ot-btn run" ${opAttr({ op: 'ot-stop' })}>⏹ Stop · since ${esc(clock(d.timer))}</button>` : `<button type="button" class="ot-btn" ${opAttr({ op: 'ot-start' })}>⏱ Start overtime</button>`) : ''}</div>` : '';
  let foot = '';
  if (cfg.totals) {
    const leave = new Set(d.types.filter(t => t.leave).map(t => t.id));
    const week = d.weekOther + Object.entries(d.v).filter(([id]) => !leave.has(id)).reduce((s, [, h]) => s + h, 0);
    const parts = d.types.map(t => {
      const m = d.monthOther[t.id] || { days: 0, ahead: 0, hours: 0 };
      const todayH = d.v[t.id];
      if (t.id === 'overtime') { const h = m.hours + (todayH || 0); return h ? `${t.emoji} ${hrs(h)} h` : ''; }
      const n = m.days + (todayH != null ? 1 : 0);
      return n || m.ahead ? `${t.emoji} ${n ? `${n} day${n === 1 ? '' : 's'}` : ''}${n && m.ahead ? ' · ' : ''}${m.ahead ? `${m.ahead} booked` : ''}` : '';
    }).filter(Boolean);
    foot = `<div class="wg-foot">This week ${hrs(week)} h${parts.length ? ` · ${esc(keyToDate(sum.day).toLocaleDateString(undefined, { month: 'long' }))}: ${esc(parts.join(' · '))}` : ''}</div>`;
  }
  return head('Work day', 'sky', { icon: '💼', right: dateLabel(sum.day) }) + `<div class="wk-types">${chips}</div>` + hoursRow + foot;
}

function waterWidget(sum, cfg, d, mine) {
  const slots = Math.min(12, Math.max(d.goal, d.n));
  return head('Water', 'sky', { sticker: 'drop' })
    + `<div class="wg-drops">${Array.from({ length: slots }, (_, i) => stk('drop', i < d.n ? '' : 'off')).join('')}</div>`
    + `<div class="wg-water-foot"><span class="big-num">${d.n}<small>/${d.goal}</small></span>${mine ? `<button type="button" class="wg-add" ${opAttr({ op: 'water', d: 1 })}>＋</button>` : ''}</div>`;
}

function caffeineWidget(sum, cfg, d, mine) {
  const slots = Math.max(4, Math.min(8, d.n));
  const last = d.at[d.at.length - 1];
  const late = last && d.cutoff && (new Date(last).getHours() * 60 + new Date(last).getMinutes()) > toMin(d.cutoff);
  const line = [last ? `last ${clock(last)}` : 'none yet', cfg.cutoff && d.cutoff ? (late ? `⚠️ past your ${fmtTime(toMin(d.cutoff))} cut-off` : `cut-off ${fmtTime(toMin(d.cutoff))}`) : ''].filter(Boolean).join(' · ');
  return head('Caffeine', 'peach', { sticker: 'latte' })
    + `<div class="cups4">${Array.from({ length: slots }, (_, i) => stk('latte', i < d.n ? '' : 'off')).join('')}</div>`
    + `<small class="wg-sub${late ? ' warn' : ''}">${esc(line)}</small>`
    + `<div class="wg-water-foot"><span class="big-num">${d.n}<small> cup${d.n === 1 ? '' : 's'}</small></span>${mine ? `<button type="button" class="wg-add" ${opAttr({ op: 'caffeine', d: 1 })}>＋</button>` : ''}</div>`;
}

// Walk: walks out of your goal, the minutes, when the next nudge is due, and a
// button per walk option (up to three).
function walkWidget(sum, cfg, d, mine) {
  const last = Math.max(d.last || 0, ...(d.at || []));
  const next = mine && d.nudge ? nextNudge(d.nudge, last) : null;
  const when = next && dayKey(new Date(next)) !== sum.day ? `${new Date(next).toLocaleDateString(undefined, { weekday: 'short' })} ${clock(next)}` : next ? clock(next) : '';
  const line = `${d.mins} min${next ? ` · next nudge ~${when}` : last ? ` · last ${clock(last)}` : ''}`;
  return head('Walk', 'mint', { sticker: 'sneaker', right: mine && d.streak > 1 ? `🔥 ${d.streak} days` : '' })
    + `<span class="big-num">${d.n}<small>/${d.goal} walk${d.goal === 1 ? '' : 's'}</small></span>`
    + `<small class="wg-sub">${esc(line)}</small>`
    + (mine && (d.opts || []).length ? `<div class="sl-row">${d.opts.slice(0, 3).map(o => `<button type="button" ${opAttr({ op: 'walk', opt: o.id })} title="${esc(o.name)}">${esc(o.label)}</button>`).join('')}</div>` : '');
}

function cycleWidget(sum, cfg, d, mine) {
  if (d.none) return head('Cycle', 'coral', { sticker: 'pdrop' }) + `<p class="wg-empty">${mine ? 'Log a period in the app to start' : 'Nothing shared yet'}</p>`;
  if (cfg.discreet) {
    return `<div class="discreet-c">${ring(d, 96, 10)}${stk('blossom', 'ring-flower')}</div><small class="wg-sub center">${d.cycleDay || ''}</small>`;
  }
  const due = d.nextPeriod ? keyToDate(d.nextPeriod).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  return head('Cycle', 'coral', { sticker: 'pdrop' })
    + `<div class="cyc-mini">${ring(d, 54, 7)}<span><b>${d.cycleDay ? `Day ${d.cycleDay}` : esc(d.phaseName)}</b><small>${esc(PHASE_SHORT[d.phase])}${due ? ` · due ~${esc(due)}` : ''}</small></span></div>`
    + (mine && cfg.button ? `<button type="button" class="cyc-btn${d.bleeding ? ' on' : ''}" ${opAttr({ op: 'period', on: !d.bleeding })}>${d.bleeding ? '🩸 Period today ✓' : '🩸 Period today'}</button>` : '');
}

function ownWidget(sum, cfg, d, mine) {
  const o = d.def, v = d.v;
  const icon = o.sticker ? { sticker: o.sticker } : { emoji: o.emoji || '✨' };
  const has = v != null && v !== false && v !== '';
  const streak = d.streak + (has ? 1 : 0);
  const fire = streak > 1 ? ` · 🔥 ${streak} days` : '';
  const btn = (op, label, cls = '') => `<button type="button" class="${cls}" ${mine ? opAttr(op) : ''}>${label}</button>`;
  let body = '';
  switch (o.type) {
    case 'yesno':
      body = `<button type="button" class="yn-btn${v === true ? ' on' : ''}" ${mine ? opAttr({ op: 'own', id: o.id, o: 'yes', on: v !== true }) : ''}>${iconHTML(icon)}<i class="ok">✓</i></button>
        <small class="wg-sub center">${v === true ? '✓ done' : mine ? 'tap when done' : 'not yet'}${fire}</small>`;
      break;
    case 'count': {
      const n = typeof v === 'number' ? v : (v && v.n) || 0;
      body = `<div class="own-big">${iconHTML(icon)}<span class="big-num">${hrs(n)}${o.goal ? `<small>/${hrs(o.goal)}</small>` : ''}</span></div>
        <div class="sl-row">${btn({ op: 'own', id: o.id, o: 'dec' }, '−')}${btn({ op: 'own', id: o.id, o: 'inc' }, `＋ ${hrs(o.step)}`)}</div><small class="wg-sub center">${fire.slice(3)}</small>`;
      break;
    }
    case 'amount':
      body = `<div class="own-big">${iconHTML(icon)}<span class="big-num">${typeof v === 'number' ? hrs(v) : '—'}<small> ${esc(o.unit)}</small></span></div>
        <div class="sl-row">${btn({ op: 'own', id: o.id, o: 'dec' }, '−')}${btn({ op: 'own', id: o.id, o: 'inc' }, '+')}</div>`;
      break;
    case 'scale':
      body = `<div class="own-big">${iconHTML(icon)}</div><div class="rest-dots wide">${Array.from({ length: o.max }, (_, i) => i + 1).map(i =>
        `<button type="button" class="${typeof v === 'number' && i <= v ? 'on' : ''}" ${mine ? opAttr({ op: 'own', id: o.id, o: 'scale', v: i }) : ''}>${o.max <= 5 ? i : ''}</button>`).join('')}</div>`;
      break;
    case 'options': {
      const picked = new Set((v && v.picked) || []);
      body = `<div class="own-opts">${o.options.slice(0, 4).map(x => `<button type="button" class="wt${picked.has(x.id) ? ' on' : ''}" ${mine ? opAttr({ op: 'own', id: o.id, o: 'opt', v: x.id }) : ''}>${esc(x.label)}</button>`).join('')}</div>`;
      break;
    }
    default:
      body = `<p class="wg-note" ${opAttr({ open: 'track' })}>${v ? esc(v) : 'Tap to write a note'}</p>`;
  }
  return head(o.name, o.color, { sticker: o.sticker || null, icon: o.sticker ? null : o.emoji }) + body;
}

const SINGLE = { meds: medsWidget, work: workWidget, water: waterWidget, caffeine: caffeineWidget, walk: walkWidget, cycle: cycleWidget, own: ownWidget };
const SINGLE_INFO = {
  meds: { title: '💊 Medication', size: '4 × 2', color: 'mint' }, work: { title: '💼 Work day', size: '4 × 2', color: 'sky' },
  water: { title: '💧 Water', size: '2 × 2', small: true, color: 'sky' },
  caffeine: { title: '☕ Caffeine', size: '2 × 2', small: true, color: 'peach' }, walk: { title: '🚶 Walk', size: '2 × 2', small: true, color: 'mint' },
  cycle: { title: '🩸 Cycle', size: '2 × 2', small: true, color: 'coral' }, own: { title: '✨ Your own tracker', size: '2 × 2', small: true, color: 'mint' },
};

// ── The page ──────────────────────────────────────────────────────────────
export function openWidgetPreview() {
  const cfgs = {
    track: { ...DEFAULTS.track }, todo: { ...DEFAULTS.todo }, plan: { ...DEFAULTS.plan },
    meds: { ...DEFAULTS.meds }, work: { ...DEFAULTS.work }, water: { ...DEFAULTS.water },
    caffeine: { ...DEFAULTS.caffeine }, walk: { ...DEFAULTS.walk }, cycle: { ...DEFAULTS.cycle }, cycle2: { ...DEFAULTS.cycle, discreet: true }, own: { ...DEFAULTS.own },
  };
  let flipped = false, style = 'auto', alpha = 0;
  const log = [];
  const el = document.createElement('div');
  el.className = 'wgp';
  document.body.append(el);
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const seg = (key, field, opts) => `<div class="wgp-opts">${opts.map(([v, label]) =>
    `<button type="button" class="chip${cfgs[key][field] === v ? ' on' : ''}" data-cfg="${key}" data-f="${field}" data-v='${esc(JSON.stringify(v))}'>${esc(label)}</button>`).join('')}</div>`;

  function frame(kind, key, inner, { small = false, color = 'pink' } = {}) {
    return `<div class="wg${small ? ' wg-sm' : ''}" data-kind="${kind}" data-key="${key}" style="${cv(color)}">${inner}</div>`;
  }

  function render() {
    const sum = buildSummary();
    darkLook = style === 'galaxy' || style === 'mono_dark' || (style === 'auto' && isDark());
    const name = sum.them ? sum.them.name : 'Sam';
    const side = flipped && sum.them ? (cfgs.track.whose === 'me' ? 'them' : 'me') : cfgs.track.whose === 'them' ? 'them' : 'me';
    const single = (kind, key) => {
      const cfg = cfgs[key];
      const t = cfg.whose === 'them' ? sum.trackers.them : sum.trackers.me;
      const mine = cfg.whose !== 'them';
      let id = kind;
      if (kind === 'own') id = cfg.tracker || (t ? t.order.find(x => x.startsWith('own-')) : null);
      const d = t && id ? t.data[id] : null;
      const info = SINGLE_INFO[kind];
      const inner = d ? SINGLE[kind](sum, cfg, d, mine)
        : `<p class="wg-empty">${kind === 'own' ? 'Make your own tracker in the app' : mine ? `Switch ${info.title.slice(3)} on in the app` : `${esc(name)} doesn’t share this`}</p>`;
      return frame(kind, key, inner, { small: info.small, color: kind === 'own' && d ? d.def.color : info.color });
    };
    const ownList = sum.trackers.me.order.filter(x => x.startsWith('own-'));
    el.innerHTML = `
      <div class="wgp-in">
        <div class="sub-head"><button type="button" class="icon-btn" data-x aria-label="Close">‹</button><h1>Widgets</h1><span class="muted">preview</span></div>
        <p class="muted small">The phone’s widgets, drawn from the same summary the app sends them. Taps here go through the same steps as on the phone: each is saved with the day and time you tapped. Each widget’s main settings are under it; on the phone they’re in the widget’s ✏️ settings.</p>
        <div class="wgp-opts wgp-style">${[['auto', '🌗 Auto'], ['pastel', '🌷 Pastel'], ['galaxy', '🌌 Galaxy'], ['mono', '🤍 Mono'], ['mono_dark', '🖤 Mono dark']].map(([v, l]) =>
          `<button type="button" class="chip${style === v ? ' on' : ''}" data-style="${v}">${l}</button>`).join('')}
          <label class="wgp-alpha">See-through <input type="range" min="0" max="100" step="10" value="${alpha}" data-alpha> ${alpha}%</label></div>
        <div class="wgp-home" data-look="${style}" data-dark="${darkLook ? 1 : 0}" style="--wg-a:${(100 - alpha) / 100}">
          <section><h3>📊 Tracking <small>4 × 2</small></h3>
            ${frame('track', 'track', trackWidget(sum, cfgs.track, side))}
            ${seg('track', 'whose', [['me', 'Mine'], ['them', `${name}'s`], ['both', 'Both, ‹ › to flip']])}
            ${seg('track', 'plus', [[true, '＋ log on the widget'], [false, 'no ＋']])}</section>
          <section><h3>✅ To-Do <small>4 × 2</small></h3>
            ${frame('todo', 'todo', todoWidget(sum, cfgs.todo), { color: 'mint' })}
            ${seg('todo', 'whose', [['all', 'Everyone'], ['me', 'Mine'], ['them', `${name}'s`]])}
            ${seg('todo', 'order', [['due', 'Due date'], ['priority', 'Priority'], ['group', 'Group']])}
            ${seg('todo', 'done', [[false, 'Hide finished'], [true, 'Show finished']])}</section>
          <section><h3>🗓️ Plan <small>2 × 2 and up</small></h3>
            ${frame('plan', 'plan', planWidget(sum, cfgs.plan), { color: 'lavender' })}
            ${seg('plan', 'view', [['next', 'Up next'], ['today', 'Today'], ['week', 'Week'], ['month', 'Month']])}
            ${seg('plan', 'theirs', [[false, 'Just mine'], [true, `${name}'s plans too`]])}</section>
          <section><h3>💊 Medication <small>4 × 2</small></h3>${single('meds', 'meds')}
            ${seg('meds', 'confirm', [[false, 'Tap = taken'], [true, 'Ask first']])}</section>
          <section><h3>💼 Work day <small>4 × 2</small></h3>${single('work', 'work')}</section>
          <section class="pair"><h3>💧 Water · ☕ Caffeine <small>2 × 2 each</small></h3><div class="wg-row">${single('water', 'water')}${single('caffeine', 'caffeine')}</div>
            ${seg('water', 'whose', [['me', 'Mine'], ['them', `${name}'s water`]])}</section>
          <section class="pair"><h3>🚶 Walk · ✨ Your own <small>2 × 2 each</small></h3><div class="wg-row">${single('walk', 'walk')}${single('own', 'own')}</div>
            ${seg('walk', 'whose', [['me', 'Mine'], ['them', `${name}'s walks`]])}
            ${ownList.length > 1 ? seg('own', 'tracker', ownList.map(id => [id, sum.trackers.me.data[id].def.name])) : ''}</section>
          <section class="pair"><h3>🩸 Cycle · discreet <small>2 × 2 each</small></h3><div class="wg-row">${single('cycle', 'cycle')}${single('cycle', 'cycle2')}</div></section>
        </div>
        <div class="wgp-log"><b>Taps, as the phone saves them</b>${log.length ? log.map(l => `<code>${esc(l)}</code>`).join('') : '<span class="muted small">Tap something on a widget.</span>'}</div>
      </div>`;
  }

  el.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) { close(); return; }
    const st = e.target.closest('[data-style]');
    if (st) { style = st.dataset.style; render(); return; }
    const c = e.target.closest('[data-cfg]');
    if (c) { cfgs[c.dataset.cfg][c.dataset.f] = JSON.parse(c.dataset.v); flipped = false; render(); return; }
    if (e.target.closest('[data-flip]')) { flipped = !flipped; render(); return; }
    const b = e.target.closest('[data-op]');
    if (!b) return;
    const o = JSON.parse(b.dataset.op);
    if (o.open) { toast(`On the phone this opens the app: ${o.open}`); return; }
    if (o.confirm && !confirm('Mark it taken?')) return;
    delete o.confirm;
    const now = Date.now();
    const op = { ...o, day: dayKey(), at: now };
    log.unshift(`${new Date(now).toLocaleTimeString()} ${JSON.stringify(op)}`);
    log.length = Math.min(log.length, 6);
    applyOps([op]);
    render();
  });
  el.addEventListener('input', e => {
    if (!e.target.matches('[data-alpha]')) return;
    alpha = Number(e.target.value);
    $('.wgp-home', el).style.setProperty('--wg-a', (100 - alpha) / 100);
    e.target.nextSibling.textContent = ` ${alpha}%`;
  });
  // Your person's changes (the other test tab) show up here too.
  const off = store.on((k, source) => { if (source === 'remote' && el.isConnected) render(); });
  const obs = new MutationObserver(() => { if (!el.isConnected) { off(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
  render();
}
