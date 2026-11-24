// Plan: schedules like planner pages, in three kinds:
//   day   – one timeline of time blocks (an ideal day, a routine…)
//   week  – Mon–Sun columns sharing one timeline; swipe sideways on phones
//   month – a calendar with things planned on each date, month by month
// Blocks can be tapped to edit, dragged to move (a deliberate hold on touch;
// across days in a week) and stretched from the bottom handle (also a hold on
// touch, so scrolling past a block never changes its time). Undo follows. Stickers sit on a
// layer above the page (one sticker page per month for monthly schedules).

import * as store from './store.js';
import { COLOR_KEYS, $, clamp, clone, colorVars, dayKey, esc, fmtDay, fmtTime, nowMinutes, prefs, setPref, shiftDay, toast, uid, vibrate } from './util.js';
import { STICKER_ICON, createStickerLayer, tapAway, tray } from './sticker-ui.js';
import { choiceSheet, confirmSheet, markSwatch, openSheet, promptSheet, swatchesHTML } from './ui.js';
import { giftList, myGifts, saveGifts, stickerMoves, theirGifts } from './gifts.js';
import { SETTINGS_ICON } from './icons.js';
import { richFieldHTML, richHTML, wireRich } from './richtext.js';
import { readMySchedules, writeMySchedules } from './docs.js';

const GUTTER = 58;   // px for the time labels
const PAD_T = 16;    // px above the first hour line
const PAD_B = 28;
const MIN_COL = 96;  // narrowest day column in a weekly schedule (zoomed in)
const FIT_MIN_ROW = 24;   // px an hour, at the smallest, when the whole week is in view
const ROW_SIZES = [{ px: 52, label: 'Compact' }, { px: 76, label: 'Cozy' }, { px: 104, label: 'Roomy' }];
const BLOCK_ICONS = ['', '☀️', '☕', '💻', '📚', '🥗', '🍝', '🌿', '🏃', '🧘', '🛁', '😴', '🎮', '🎨', '🛒', '🧺', '💞', '📞', '🎧', '✏️', '💊', '🐶', '🎂', '✈️'];
const TYPES = [
  { id: 'day', label: 'Daily', icon: '☀️', hint: 'one day, hour by hour', name: 'My day', placeholder: 'e.g. Weekdays, Lazy Sunday' },
  { id: 'week', label: 'Weekly', icon: '🗓️', hint: 'Monday to Sunday', name: 'Our week', placeholder: 'e.g. Our usual week, Exam week' },
  { id: 'month', label: 'Monthly', icon: '🌙', hint: 'a calendar, month by month', name: 'Our month', placeholder: 'e.g. Our calendar, Birthdays' },
];
const NOTE_MAX = 2000;   // characters in a note (about 350 words)
// Repeating something on a monthly schedule; `ahead` is how far the repeats run by default (months).
const REPEATS = [
  { id: 'none', label: 'Doesn’t repeat' },
  { id: 'week', label: 'Every week', days: 7, ahead: 3 },
  { id: '2week', label: 'Every 2 weeks', days: 14, ahead: 3 },
  { id: 'month', label: 'Every month', months: 1, ahead: 12 },
  { id: 'year', label: 'Every year', months: 12, ahead: 60 },
];
const MAX_DAYS = 400;    // most copies one save can make
const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const typeInfo = id => TYPES.find(t => t.id === id) || TYPES[0];
const typeOf = s => s.type || 'day';

export function seedSchedules() {
  const b = (title, icon, s, e, color) => ({ id: uid(), title, icon, start: s, end: e, color, note: '' });
  return [{
    id: uid(), name: 'My ideal day', type: 'day', start: 7 * 60, end: 22 * 60, step: 30, row: 76,
    blocks: [
      b('Slow morning', '☀️', 420, 480, 'butter'),
      b('Focus time', '💻', 540, 690, 'lavender'),
      b('Lunch break', '🥗', 720, 780, 'mint'),
      b('Walk outside', '🌿', 1050, 1080, 'sage'),
      b('Dinner together', '🍝', 1110, 1170, 'peach'),
      b('Wind down', '🛁', 1260, 1320, 'sky'),
    ],
    stickers: [],
  }];
}

function newSchedule(name, type) {
  const base = { id: uid(), name, type, weekStart: 1, blocks: [], stickers: [] };
  if (type === 'month') return { ...base, items: {}, monthStickers: {} };
  return { ...base, start: 7 * 60, end: 22 * 60, step: 30, row: 76 };
}

// Days in display order, as JS weekday numbers (0 = Sunday).
const weekOrder = s => Array.from({ length: 7 }, (_, i) => ((s.weekStart ?? 1) + i) % 7);
const dowName = (d, style = 'short') => new Date(2024, 0, 7 + d).toLocaleDateString(undefined, { weekday: style });   // 7 Jan 2024 was a Sunday
const monthOf = k => k.slice(0, 7);
function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const monthLabel = ym => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
// The same date n months on (the 31st becomes the month's last day when it's shorter).
function addMonths(k, n) {
  const [y, m, d] = k.split('-').map(Number);
  return dayKey(new Date(y, m - 1 + n, Math.min(d, new Date(y, m + n, 0).getDate())));
}
// Picked days plus their repeats up to `until` (inclusive), sorted.
function expandDays(days, repeat, until) {
  const out = new Set(days);
  const r = REPEATS.find(x => x.id === repeat);
  if (r && (r.days || r.months) && until) {
    for (const d0 of days) {
      for (let i = 1; out.size < MAX_DAYS; i++) {
        const d = r.days ? shiftDay(d0, r.days * i) : addMonths(d0, r.months * i);
        if (d > until) break;
        out.add(d);
      }
    }
  }
  return [...out].sort();
}
const sortItems = items => [...items].sort((a, b) => (a.time ?? -1) - (b.time ?? -1));

// Side-by-side columns for overlapping blocks.
function layoutCols(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const res = new Map();
  let cluster = [], colsEnd = [], clusterEnd = -1;
  const close = () => { const n = Math.max(1, colsEnd.length); cluster.forEach(id => { res.get(id).cols = n; }); cluster = []; colsEnd = []; };
  for (const b of sorted) {
    if (b.start >= clusterEnd) { close(); clusterEnd = -1; }
    let col = colsEnd.findIndex(e => e <= b.start);
    if (col === -1) { col = colsEnd.length; colsEnd.push(b.end); } else colsEnd[col] = b.end;
    res.set(b.id, { col, cols: 1 });
    cluster.push(b.id);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  close();
  return res;
}

export function createPlan(root) {
  let owner = 'me';
  let list = [];
  let decor = false;
  let press = null, drag = null, tapEmpty = null;
  let editorOpen = false;
  let G = { cols: 1, colW: 300, width: 360 };   // timeline geometry from the last render
  const monthCursor = {};                         // schedule id -> 'YYYY-MM' being shown

  root.innerHTML = `
    <div class="view-bar">
      <div class="seg" id="p-owner"></div>
      <div class="bar-actions">
        <button type="button" class="icon-btn" data-act="settings" aria-label="Schedule settings">${SETTINGS_ICON}</button>
        <button type="button" class="icon-btn sticker-btn" data-act="stickers" aria-label="Decorate with stickers">${STICKER_ICON}</button>
      </div>
    </div>
    <div class="sched-tabs" id="p-tabs"></div>
    <p class="muted small plan-note" id="p-note" hidden></p>
    <div class="timeline-wrap" id="p-wrap">
      <div class="timeline-title" id="p-title"></div>
      <div class="week-head" id="p-weekhead" hidden></div>
      <div class="timeline" id="p-tl">
        <div class="tl-gutter" id="p-gutter"></div>
        <div class="tl-grid" id="p-grid"></div>
        <div class="tl-blocks" id="p-blocks"></div>
        <div class="tl-now" id="p-now" hidden></div>
        <div class="sticker-layer" id="p-stickers"></div>
      </div>
      <div class="month" id="p-month" hidden>
        <div class="month-dow" id="p-mdow"></div>
        <div class="month-grid" id="p-mgrid"></div>
        <div class="sticker-layer" id="p-mstickers"></div>
      </div>
      <div class="canvas-msg" id="p-msg" hidden></div>
    </div>
    <button type="button" class="fab" data-act="add-block" aria-label="Add to this schedule">＋</button>`;

  const wrap = $('#p-wrap', root), tl = $('#p-tl', root), grid = $('#p-grid', root), gutter = $('#p-gutter', root),
    blocksEl = $('#p-blocks', root), nowEl = $('#p-now', root), msg = $('#p-msg', root),
    weekHead = $('#p-weekhead', root), monthEl = $('#p-month', root), mgrid = $('#p-mgrid', root);

  const editable = () => owner === 'me';
  const slot = () => (owner === 'me' ? store.me() : store.partner());
  // Yours are kept in two documents: shared, and just yours (docs.js).
  const save = () => { if (editable()) writeMySchedules(list); };

  function curId() { return (prefs.planSel || {})[owner]; }
  function setCur(id) { const s = prefs.planSel || {}; s[owner] = id; setPref('planSel', s); }
  function cur() { return list.find(s => s.id === curId()) || list[0] || null; }
  const isWeek = () => typeOf(cur()) === 'week';
  const isMonth = () => typeOf(cur()) === 'month';
  // The whole week at a glance (a weekly plan, until you zoom in): the seven
  // days fit across the screen and the hours shrink to fit its height.
  const fitWeek = () => isWeek() && prefs.planFit !== false;
  let rowNow = 0;   // px an hour as drawn (set by renderTimeline)
  const ppm = () => (rowNow || cur()?.row || 76) / 60;
  const yOf = min => PAD_T + (min - cur().start) * ppm();
  const findBlock = id => cur()?.blocks.find(b => b.id === id);
  const colOf = b => (isWeek() ? Math.max(0, weekOrder(cur()).indexOf(b.day ?? 1)) : 0);
  const monthKey = s => monthCursor[s.id] || monthOf(dayKey());

  // Stickers on a page: the owner's own, plus any their person gave them
  // (saved in the giver's "gifts", keyed by schedule — and month, for monthly ones).
  const partnerName = () => store.readPartner('profile', null)?.name || 'your person';
  function stickerSources(own, giftKey) {
    return editable()
      ? [{ list: own, editable: decor, save, primary: true },
        { list: giftList(theirGifts(), 'plan', giftKey), editable: false, movable: decor, from: partnerName() }]
      : [{ list: own, editable: false, movable: decor },
        { list: giftList(myGifts(), 'plan', giftKey), editable: decor, save: saveGifts, primary: true, from: 'you' }];
  }

  const layer = createStickerLayer({
    el: $('#p-stickers', root),
    sources: () => (cur() && !isMonth() ? stickerSources(cur().stickers, cur().id) : []),
    moves: stickerMoves,   // your person's stickers can be moved (not removed)
    posToPx: s => ({ x: s.fx * tl.clientWidth, y: yOf(s.t) }),
    pxToPos: (x, y) => ({ fx: +clamp(x / (tl.clientWidth || 1), 0, 1).toFixed(4), t: Math.round(cur().start + (y - PAD_T) / ppm()) }),
    clientToLayer: (cx, cy) => { const r = tl.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; },
    active: () => decor && !isMonth(),
  });

  // Each month of a monthly schedule is its own page to decorate.
  function monthStickers() {
    const s = cur();
    s.monthStickers = s.monthStickers || {};
    const ym = monthKey(s);
    return s.monthStickers[ym] || (s.monthStickers[ym] = []);
  }
  const mlayer = createStickerLayer({
    el: $('#p-mstickers', root),
    sources: () => (cur() && isMonth() ? stickerSources(monthStickers(), cur().id + '@' + monthKey(cur())) : []),
    moves: stickerMoves,
    posToPx: s => ({ x: s.fx * monthEl.clientWidth, y: s.fy * monthEl.clientHeight }),
    pxToPos: (x, y) => ({ fx: +clamp(x / (monthEl.clientWidth || 1), 0, 1).toFixed(4), fy: +clamp(y / (monthEl.clientHeight || 1), 0, 1).toFixed(4) }),
    clientToLayer: (cx, cy) => { const r = monthEl.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; },
    active: () => decor && isMonth(),
  });

  // ── data ───────────────────────────────────────────────────────────────
  function load() {
    let d = editable() ? readMySchedules() : store.readPartner('schedules', null);
    if (!d && editable()) { d = seedSchedules(); writeMySchedules(d); }
    list = clone(d) || [];
    list.forEach(s => {
      s.blocks = s.blocks || [];
      s.stickers = s.stickers || [];
      if (typeOf(s) === 'month') { s.items = s.items || {}; s.monthStickers = s.monthStickers || {}; }
    });
  }

  // ── rendering ──────────────────────────────────────────────────────────
  function renderOwner() {
    const them = store.readPartner('profile', null);
    $('#p-owner', root).innerHTML = `
      <button type="button" data-owner="me" class="${owner === 'me' ? 'on' : ''}" aria-pressed="${owner === 'me'}">My plans</button>
      <button type="button" data-owner="partner" class="${owner === 'partner' ? 'on' : ''}" aria-pressed="${owner === 'partner'}">${esc(them ? them.name + "'s" : 'Their')} plans</button>`;
    root.classList.toggle('readonly', !editable());
  }

  function renderTabs() {
    const c = cur();
    $('#p-tabs', root).innerHTML = list.map(s => `
      <button type="button" class="sched-tab${c && s.id === c.id ? ' on' : ''}" data-sched="${s.id}"><span aria-hidden="true">${typeInfo(typeOf(s)).icon}</span> ${esc(s.name)}${s.private ? ' <small title="Just you">🔒</small>' : ''}</button>`).join('')
      + (editable() ? `<button type="button" class="sched-tab add" data-act="new-sched">＋ New</button>` : '');
    const note = $('#p-note', root);
    note.hidden = editable();
    if (!editable()) note.textContent = `${partnerName()} shares ${list.length === 1 ? '1 plan' : `${list.length} plans`} with you. Plans ${partnerName()} keeps to themself don't show here.`;
  }

  function geom() {
    const W = wrap.clientWidth || 360;
    if (isWeek()) {
      const room = Math.floor((W - GUTTER - 10) / 7);
      const colW = fitWeek() ? Math.max(30, room) : Math.max(MIN_COL, room);
      return { cols: 7, colW, width: GUTTER + colW * 7 + 10 };
    }
    return { cols: 1, colW: W - GUTTER - 10, width: W };
  }

  // Hours as tall as the schedule's row size, or shorter to fit the whole day on screen.
  function rowFor(s) {
    const row = s.row || 76;
    if (!fitWeek()) return row;
    const title = $('#p-title', root).offsetHeight || 90;
    const room = (wrap.clientHeight || 600) - title - 40 - PAD_T - PAD_B;   // less the title and the day names
    return clamp(Math.floor(room / ((s.end - s.start) / 60)), FIT_MIN_ROW, row);
  }

  function renderTimeline() {
    const s = cur();
    const week = isWeek();
    rowNow = rowFor(s);
    // Set the height first so any vertical scrollbar exists before measuring widths.
    tl.style.height = (PAD_T + (s.end - s.start) * ppm() + PAD_B) + 'px';
    G = geom();
    tl.classList.toggle('week', week);
    tl.classList.toggle('narrow', week && G.colW < MIN_COL);   // small words in slim day columns
    tl.classList.toggle('short', rowNow < 50);
    weekHead.classList.toggle('narrow', week && G.colW < MIN_COL);
    tl.style.width = week ? G.width + 'px' : '';

    weekHead.hidden = !week;
    if (week) {
      const today = new Date().getDay();
      weekHead.style.width = G.width + 'px';
      weekHead.innerHTML = `<div class="wh-corner"></div>` + weekOrder(s).map(d => `
        <div class="wh-day${d === today ? ' today' : ''}" style="width:${G.colW}px"><span>${esc(dowName(d))}</span></div>`).join('');
    }

    let labels = '', lines = '';
    const sub = rowNow >= 70 ? s.step : 60;
    for (let m = s.start; m <= s.end; m += sub) {
      const hour = m % 60 === 0;
      lines += `<div class="tl-line${hour ? '' : ' sub'}" style="top:${yOf(m)}px"></div>`;
      if (hour || (rowNow >= 100 && m % 30 === 0)) labels += `<div class="tl-label${hour ? '' : ' half'}" style="top:${yOf(m)}px">${fmtTime(m)}</div>`;
    }
    if (week) for (let i = 1; i < 7; i++) lines += `<div class="tl-vline" style="left:${GUTTER + i * G.colW}px"></div>`;
    gutter.innerHTML = labels;
    grid.innerHTML = lines;
    renderBlocks();
    renderNow();
    layer.render();
  }

  // A week packs its events close together (a pixel or two apart), so their words get the room.
  const gapBelow = () => (G.cols > 1 ? 2 : 3);
  function blockBox(b, col, L) {
    const s = cur();
    const week = G.cols > 1;
    const top = yOf(Math.max(b.start, s.start));
    const h = Math.max(18, (Math.min(b.end, s.end) - Math.max(b.start, s.start)) * ppm() - gapBelow());
    const pad = week ? 1 : 0;
    const inner = G.colW - pad * 2 - (week ? 0 : 4);
    return { top, h, left: GUTTER + col * G.colW + pad + inner * L.col / L.cols, width: inner / L.cols - (L.cols > 1 ? (week ? 1 : 3) : 0) };
  }
  // A week centres each event's words over as many whole lines as fit its height
  // (--lines; app.css has the matching line heights and paddings). In slim day
  // columns the icon only shows when there's room for a few lines, so short
  // events show their words, not just an icon; events squeezed side by side
  // too thin for any word show just their icon.
  function weekFit(b, box, tiny) {
    const narrow = G.colW < MIN_COL;
    const lineH = narrow ? (tiny ? 10 : 11) : 15;
    const padY = tiny ? 0 : narrow ? 4 : 9;
    const timeH = narrow || tiny ? 0 : 13;
    const lines = Math.max(1, Math.floor((box.h - padY - timeH) / lineH));
    const cls = b.icon && box.width < 30 ? ' thin' : narrow && lines < 3 ? ' bare' : '';
    return { style: `--lines:${lines};`, cls };
  }

  function blockInner(b) {
    return `<div class="blk-title">${b.icon ? `<span class="blk-icon">${esc(b.icon)}</span>` : ''}<span>${esc(b.title) || 'Untitled'}</span></div>
      <div class="blk-time">${fmtTime(b.start)} – ${fmtTime(b.end)}</div>
      ${b.note ? `<div class="blk-note rich">${richHTML(b.note)}</div>` : ''}
      ${editable() ? '<div class="blk-handle" aria-hidden="true"></div>' : ''}`;
  }

  function renderBlocks() {
    const s = cur();
    const byCol = new Map();
    s.blocks.filter(b => b.end > s.start && b.start < s.end).forEach(b => {
      const c = colOf(b);
      if (!byCol.has(c)) byCol.set(c, []);
      byCol.get(c).push(b);
    });
    let html = '';
    for (const [col, bs] of byCol) {
      const lay = layoutCols(bs);
      for (const b of bs) {
        const box = blockBox(b, col, lay.get(b.id));
        const tiny = (b.end - b.start) * ppm() < 40;
        const fit = G.cols > 1 ? weekFit(b, box, tiny) : { style: '', cls: '' };
        html += `<div class="blk${tiny ? ' tiny' : ''}${fit.cls}" data-id="${b.id}" style="top:${box.top}px;height:${box.h}px;left:${box.left}px;width:${box.width}px;${fit.style}${colorVars(b.color)}">${blockInner(b)}</div>`;
      }
    }
    blocksEl.innerHTML = html;
  }

  function renderNow() {
    const s = cur();
    const n = nowMinutes();
    if (!s || isMonth() || n < s.start || n > s.end) { nowEl.hidden = true; return; }
    nowEl.hidden = false;
    nowEl.style.top = yOf(n) + 'px';
    if (isWeek()) {
      const col = weekOrder(s).indexOf(new Date().getDay());
      nowEl.style.left = (GUTTER + col * G.colW) + 'px';
      nowEl.style.width = G.colW + 'px';
      nowEl.style.right = 'auto';
    } else {
      nowEl.style.left = nowEl.style.width = nowEl.style.right = '';
    }
  }

  function renderMonth() {
    const s = cur();
    const ym = monthKey(s);
    const [y, m] = ym.split('-').map(Number);
    const order = weekOrder(s);
    const offset = (new Date(y, m - 1, 1).getDay() - order[0] + 7) % 7;
    const total = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7;
    const today = dayKey();
    $('#p-mdow', root).innerHTML = order.map(d => `<span>${esc(dowName(d))}</span>`).join('');
    let cells = '';
    for (let i = 0; i < total; i++) {
      const d = new Date(y, m - 1, 1 - offset + i);
      const k = dayKey(d);
      const items = sortItems(s.items[k] || []);
      cells += `<button type="button" class="mcell${d.getMonth() !== m - 1 ? ' out' : ''}${k === today ? ' today' : ''}" data-date="${k}" aria-label="${esc(fmtDay(k))}, ${items.length} planned">
        <span class="mnum">${d.getDate()}</span>
        ${items.slice(0, 3).map(it => `<span class="mpill" style="${colorVars(it.color)}">${it.icon ? esc(it.icon) + ' ' : ''}${esc(it.title || 'Untitled')}</span>`).join('')}
        ${items.length > 3 ? `<span class="mmore">+${items.length - 3} more</span>` : ''}
      </button>`;
    }
    mgrid.innerHTML = cells;
    mlayer.render();
  }

  function renderTitle() {
    const s = cur();
    const t = typeOf(s);
    const sub = t === 'month' ? 'Monthly'
      : `${t === 'week' ? 'Weekly · ' : ''}${fmtTime(s.start)} – ${fmtTime(s.end)} · ${s.step}-min steps`;
    const ym = t === 'month' ? monthKey(s) : '';
    // Who sees this plan, on the page too (tap to switch; also in its settings).
    const share = editable() ? `<button type="button" class="vis plan-vis${s.private ? ' priv' : ''}" data-act="plan-share" style="${colorVars('lavender')}" aria-pressed="${!s.private}"
      title="${s.private ? `Just you: tap to share it with ${esc(partnerName())}` : `Shared: tap to keep it just for you`}">${s.private ? '🔒 Just me' : `💞 Shared with ${esc(partnerName())}`}</button>` : '';
    $('#p-title', root).innerHTML = `<h2 class="hand">${esc(s.name)}</h2>${editable() ? `<button type="button" class="rename-btn" data-act="rename" aria-label="Rename this schedule" title="Rename">${PENCIL}</button>` : ''}<span class="muted small">${sub}</span>${t === 'week' ? `<button type="button" class="today-btn zoom-btn" data-act="week-fit" aria-pressed="${fitWeek()}">${fitWeek() ? '🔍 Zoom in' : '🗓️ Whole week'}</button>` : ''}${share}
      ${t === 'month' ? `
        <div class="month-nav">
          <button type="button" class="icon-btn" data-act="prev-month" aria-label="Previous month">‹</button>
          <span class="mn-label">${esc(monthLabel(ym))}</span>
          <button type="button" class="icon-btn" data-act="next-month" aria-label="Next month">›</button>
          ${ym !== monthOf(dayKey()) ? '<button type="button" class="today-btn" data-act="this-month">↩ Today</button>' : ''}
        </div>` : ''}`;
  }

  function render() {
    renderOwner();
    renderTabs();
    const s = cur();
    if (!s) {
      tl.hidden = monthEl.hidden = weekHead.hidden = true;
      $('#p-title', root).innerHTML = '';
      msg.hidden = false;
      const them = store.readPartner('profile', null);
      msg.innerHTML = editable()
        ? `<div class="empty-art">🗓️</div><p>No schedules yet.</p><button type="button" class="btn" data-act="new-sched">Make a schedule</button>`
        : them
          ? `<div class="empty-art">🗓️</div><p>${esc(them.name)} hasn't drafted a schedule yet.</p>`
          : `<div class="empty-art">💌</div><p>Your person's plans will appear here once they join.</p>`;
      return;
    }
    msg.hidden = true;
    renderTitle();
    const month = isMonth();
    tl.hidden = month;
    monthEl.hidden = !month;
    root.classList.toggle('month-mode', month);
    if (month) { weekHead.hidden = true; renderMonth(); }
    else renderTimeline();
  }

  // ── block gestures (daily & weekly) ───────────────────────────────────
  // On a phone a block only moves (or stretches, from its bottom handle) after
  // a deliberate hold: it sinks a little while you hold, then lifts with a buzz.
  // A finger that moves before then is scrolling, and a quick tap opens it.
  const HOLD_MS = 550;
  wrap.addEventListener('pointerdown', e => {
    if (!editable() || decor || !cur() || isMonth() || e.button > 0) return;
    const blk = e.target.closest('.blk');
    if (!blk) {
      if (e.target.closest('.timeline') && !e.target.closest('.tl-gutter')) tapEmpty = { x: e.clientX, y: e.clientY };
      return;
    }
    const mode = e.target.closest('.blk-handle') ? 'resize' : 'move';
    const mouse = e.pointerType === 'mouse';
    if (mouse && mode === 'resize') {
      e.preventDefault();
      startDrag('resize', blk.dataset.id, e.clientX, e.clientY);
      return;
    }
    press = { id: blk.dataset.id, mode, x: e.clientX, y: e.clientY, pointerId: e.pointerId, mouse, el: blk, timer: null, cue: null };
    if (!mouse) {
      press.cue = setTimeout(() => blk.classList.add('pressing'), 120);
      press.timer = setTimeout(() => { if (press) startDrag(press.mode, press.id, press.x, press.y); }, HOLD_MS);
    }
  });

  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    clearTimeout(press.cue);
    press.el.classList.remove('pressing');
    press = null;
  }

  window.addEventListener('pointermove', e => {
    if (drag) { drag.lastX = e.clientX; drag.lastY = e.clientY; applyDrag(); return; }
    if (press && e.pointerId === press.pointerId) {
      const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (press.mouse && d > 4) startDrag('move', press.id, press.x, press.y);
      else if (!press.mouse && d > 10) cancelPress();    // finger is scrolling
    }
    if (tapEmpty && Math.hypot(e.clientX - tapEmpty.x, e.clientY - tapEmpty.y) > 9) tapEmpty = null;
  });

  window.addEventListener('pointerup', () => {
    if (drag) { endDrag(); return; }
    if (press) { const id = press.id; cancelPress(); openBlockEditor(id); return; }
    if (tapEmpty) { const { x, y } = tapEmpty; tapEmpty = null; createAt(x, y); }
  });
  window.addEventListener('pointercancel', () => { cancelPress(); tapEmpty = null; if (drag) endDrag(); });

  // While a block is held, stop the page from scrolling under the finger.
  document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  wrap.addEventListener('contextmenu', e => { if (e.target.closest('.blk')) e.preventDefault(); });

  function startDrag(mode, id, x, y) {
    const b = findBlock(id);
    if (!b) return;
    cancelPress();
    tapEmpty = null;
    drag = { mode, id, startY: y, lastX: x, lastY: y, startScroll: wrap.scrollTop, orig: { start: b.start, end: b.end, day: b.day }, el: blocksEl.querySelector(`[data-id="${id}"]`), raf: 0 };
    drag.el?.classList.add('lifted');
    root.classList.add('dragging');
    vibrate(12);
    const loop = () => {
      if (!drag) return;
      const r = wrap.getBoundingClientRect();
      let dy = 0, dx = 0;
      if (drag.lastY < r.top + 50) dy = -8; else if (drag.lastY > r.bottom - 50) dy = 8;
      if (isWeek() && drag.mode === 'move') {
        if (drag.lastX < r.left + GUTTER + 20) dx = -8; else if (drag.lastX > r.right - 30) dx = 8;
      }
      if (dy || dx) { wrap.scrollTop += dy; wrap.scrollLeft += dx; applyDrag(); }
      drag.raf = requestAnimationFrame(loop);
    };
    drag.raf = requestAnimationFrame(loop);
  }

  function applyDrag() {
    const s = cur(), b = findBlock(drag.id);
    if (!b) return;
    const dMin = ((drag.lastY - drag.startY) + (wrap.scrollTop - drag.startScroll)) / ppm();
    const snap = m => Math.round(m / s.step) * s.step;
    if (drag.mode === 'move') {
      const dur = drag.orig.end - drag.orig.start;
      const ns = clamp(snap(drag.orig.start + dMin), s.start, Math.max(s.start, s.end - dur));
      b.start = ns;
      b.end = ns + dur;
      if (isWeek()) {
        const r = tl.getBoundingClientRect();
        const col = clamp(Math.floor((drag.lastX - r.left - GUTTER) / G.colW), 0, 6);
        b.day = weekOrder(s)[col];
        if (drag.el) {
          drag.el.style.left = (GUTTER + col * G.colW + 1) + 'px';
          drag.el.style.width = (G.colW - 2) + 'px';
        }
      }
    } else {
      b.end = clamp(snap(drag.orig.end + dMin), b.start + s.step, s.end);
    }
    if (drag.el) {
      drag.el.style.top = yOf(b.start) + 'px';
      drag.el.style.height = Math.max(18, (b.end - b.start) * ppm() - gapBelow()) + 'px';
      const t = drag.el.querySelector('.blk-time');
      if (t) t.textContent = `${fmtTime(b.start)} – ${fmtTime(b.end)}`;
    }
  }

  function endDrag() {
    cancelAnimationFrame(drag.raf);
    const { id, mode, orig: o } = drag;
    const b = findBlock(id);
    const changed = b && (b.start !== o.start || b.end !== o.end || b.day !== o.day);
    drag = null;
    root.classList.remove('dragging');
    if (changed) {
      save();
      const when = `${isWeek() && b.day !== o.day ? dowName(b.day) + ' ' : ''}${fmtTime(b.start)} – ${fmtTime(b.end)}`;
      toast(`${mode === 'resize' ? 'Now' : 'Moved to'} ${when}`, { label: 'Undo', run: () => {
        const x = findBlock(id);
        if (!x) return;
        x.start = o.start;
        x.end = o.end;
        if (o.day !== undefined) x.day = o.day;
        save();
        renderBlocks();
        vibrate(8);
      } });
    }
    renderBlocks();
  }

  function createAt(clientX, clientY) {
    const s = cur();
    const r = tl.getBoundingClientRect();
    const m = s.start + (clientY - r.top - PAD_T) / ppm();
    const start = clamp(Math.floor(m / s.step) * s.step, s.start, s.end - s.step);
    const end = Math.min(s.end, start + Math.max(s.step, 60));
    const day = isWeek() ? weekOrder(s)[clamp(Math.floor((clientX - r.left - GUTTER) / G.colW), 0, 6)] : undefined;
    addBlock(start, end, day);
  }

  function addBlock(start, end, day) {
    const s = cur();
    const used = new Set(s.blocks.map(b => b.color));
    const color = COLOR_KEYS.find(k => !used.has(k)) || COLOR_KEYS[s.blocks.length % COLOR_KEYS.length];
    const b = { id: uid(), title: '', icon: '', start, end, color, note: '' };
    if (day !== undefined) b.day = day;
    s.blocks.push(b);
    save();
    renderBlocks();
    openBlockEditor(b.id, true);
  }

  // ── editors ────────────────────────────────────────────────────────────
  function timeOptions(from, to, step, selected) {
    const vals = new Set();
    for (let m = from; m <= to; m += step) vals.add(m);
    if (selected >= from && selected <= to) vals.add(selected);
    return [...vals].sort((a, b) => a - b).map(m => `<option value="${m}"${m === selected ? ' selected' : ''}>${fmtTime(m)}</option>`).join('');
  }
  const iconRow = selected => `<div class="icon-row">${BLOCK_ICONS.map(ic => `<button type="button" class="icon-pick${ic === (selected || '') ? ' on' : ''}" data-icon="${ic}" aria-label="${ic || 'No icon'}">${ic || '∅'}</button>`).join('')}</div>`;

  // title: the sheet's heading (e.g. for a fresh copy).
  function openBlockEditor(id, isNew = false, title = '') {
    const s = cur(), b = findBlock(id);
    if (!b) return;
    editorOpen = true;
    const week = isWeek();
    // Weekly: picking more days adds a copy to each (made here, kept in step while the sheet is open).
    const copies = new Map();   // day -> copy's block id
    const daysOn = () => new Set([b.day, ...copies.keys()]);
    const syncCopies = () => {
      for (const [day, cid] of copies) {
        const c = findBlock(cid);
        if (c) Object.assign(c, { title: b.title, icon: b.icon, start: b.start, end: b.end, color: b.color, note: b.note, day });
      }
    };
    let dupId = null, rich = null;
    const sheet = openSheet({
      title: title || (isNew ? 'New time block' : 'Edit time block'),
      className: 'block-sheet',
      body: `
        <label class="field"><span>What's this time for?</span>
          <input class="inp" name="title" maxlength="60" value="${esc(b.title)}" placeholder="e.g. Coffee & cuddles" autocomplete="off"></label>
        <div class="field"><span>Little icon</span>${iconRow(b.icon)}</div>
        ${week ? `<div class="field"><span>Days <small class="field-hint">· pick more than one to add it to each</small></span>
          <div class="seg wide days" data-group="day">${weekOrder(s).map(d => `<button type="button" data-v="${d}" class="${b.day === d ? 'on' : ''}" aria-pressed="${b.day === d}">${esc(dowName(d))}</button>`).join('')}</div></div>` : ''}
        <div class="field two">
          <label><span>Start</span><select class="inp" name="start">${timeOptions(s.start, s.end - s.step, s.step, b.start)}</select></label>
          <label><span>End</span><select class="inp" name="end">${timeOptions(s.start + s.step, s.end, s.step, b.end)}</select></label>
        </div>
        <div class="field"><span>Colour</span>${swatchesHTML(b.color)}</div>
        ${richFieldHTML('Notes', b.note)}
        <div class="sheet-actions">
          <button type="button" class="btn ghost danger-text" data-a="delete">Delete</button>
          <button type="button" class="btn ghost" data-a="dup">Duplicate</button>
          <button type="button" class="btn" data-a="done">Done</button>
        </div>`,
      onClose: () => {
        editorOpen = false;
        rich.stop();
        const blk = findBlock(id);
        if (isNew && blk && !blk.title.trim()) blk.title = 'Untitled';
        syncCopies();
        save();
        renderBlocks();
        if (copies.size) toast(`Added to ${copies.size + 1} days ✨`);
        if (dupId) setTimeout(() => openBlockEditor(dupId, false, 'Your copy'), 280);
      },
    });
    const el = sheet.el;
    const titleEl = el.querySelector('[name=title]');
    if (isNew) setTimeout(() => titleEl.focus(), 280);
    const update = () => { syncCopies(); save(); renderBlocks(); };
    rich = wireRich(el.querySelector('.rt'), el.querySelector('.rt-bar'), md => { b.note = md.slice(0, NOTE_MAX); update(); }, { max: NOTE_MAX });
    el.addEventListener('input', e => {
      if (e.target.closest('.rt')) return;   // notes: handled above
      const n = e.target.name;
      if (n === 'title') b.title = e.target.value;
      else if (n === 'start' || n === 'end') {
        const st = Number(el.querySelector('[name=start]').value);
        let en = Number(el.querySelector('[name=end]').value);
        if (n === 'start' && en <= st) { en = Math.min(s.end, st + (b.end - b.start)); }
        if (en <= st) en = Math.min(s.end, st + s.step);
        b.start = st;
        b.end = en;
        el.querySelector('[name=end]').innerHTML = timeOptions(s.start + s.step, s.end, s.step, b.end);
      }
      update();
    });
    el.addEventListener('click', e => {
      const ic = e.target.closest('[data-icon]');
      if (ic) {
        b.icon = ic.dataset.icon;
        el.querySelectorAll('.icon-pick').forEach(x => x.classList.toggle('on', x === ic));
        update();
        return;
      }
      const dayBtn = e.target.closest('[data-group="day"] button');
      if (dayBtn) {
        const d = Number(dayBtn.dataset.v);
        if (d === b.day) {
          // Unpicking the block's own day: it takes over one of the copies' days instead.
          if (!copies.size) return;   // always on at least one day
          const [nd, cid] = copies.entries().next().value;
          s.blocks = s.blocks.filter(x => x.id !== cid);
          copies.delete(nd);
          b.day = nd;
        } else if (copies.has(d)) {
          s.blocks = s.blocks.filter(x => x.id !== copies.get(d));
          copies.delete(d);
        } else {
          const c = { ...clone(b), id: uid(), day: d };
          s.blocks.push(c);
          copies.set(d, c.id);
        }
        const on = daysOn();
        dayBtn.parentElement.querySelectorAll('button').forEach(x => {
          const v = on.has(Number(x.dataset.v));
          x.classList.toggle('on', v);
          x.setAttribute('aria-pressed', v);
        });
        update();
        return;
      }
      const sw = e.target.closest('.sw');
      if (sw) { b.color = sw.dataset.color; markSwatch(el, b.color); update(); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'done') sheet.close();
      if (a === 'dup') {
        // A copy right after this one (or before it, if the day's full), then edit the copy.
        syncCopies();
        const c = { ...clone(b), id: uid() };
        const dur = b.end - b.start;
        if (b.end + dur <= s.end) { c.start = b.end; c.end = b.end + dur; }
        else if (b.start - dur >= s.start) { c.start = b.start - dur; c.end = b.start; }
        s.blocks.push(c);
        dupId = c.id;
        sheet.close();
      }
      if (a === 'delete') {
        const drop = new Set([id, ...copies.values()]);
        s.blocks = s.blocks.filter(x => !drop.has(x.id));
        copies.clear();
        sheet.close();
      }
    });
    titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sheet.close(); } });
  }

  // A date in a monthly schedule: what's planned, and adding/editing items.
  // An item can go on several days at once and repeat; copies made together
  // share a `series` id, so they can be changed or removed together later.
  function openDaySheet(k) {
    const s = cur();
    editorOpen = true;
    let rich = null;
    const sheet = openSheet({
      title: fmtDay(k),
      className: 'day-sheet',
      body: '<div class="ds"></div>',
      onClose: () => { editorOpen = false; rich?.stop(); save(); renderMonth(); },
    });
    const box = sheet.el.querySelector('.ds');
    let editing = null;   // { draft, orig, isNew, days: Set, repeat, until, calYm }

    // Every item in a set, with its day.
    const inSet = sid => (!sid ? [] : Object.entries(s.items).flatMap(([day, items]) => items.filter(x => x.series === sid).map(it => ({ day, it }))));
    const dropItem = (day, iid) => {
      if (!s.items[day]) return;
      s.items[day] = s.items[day].filter(x => x.id !== iid);
      if (!s.items[day].length) delete s.items[day];
    };
    const putItem = (day, it) => {
      const items = s.items[day] || (s.items[day] = []);
      const i = items.findIndex(x => x.id === it.id);
      if (i >= 0) items[i] = it; else items.push(it);
    };
    const fields = it => ({ title: it.title, icon: it.icon, time: it.time ?? null, color: it.color, note: it.note || '' });

    function showList() {
      rich?.stop();
      rich = null;
      editing = null;
      const items = sortItems(s.items[k] || []);
      box.innerHTML = `
        ${items.length ? `<div class="ds-list">${items.map(it => `
          <button type="button" class="ds-item" data-item="${it.id}" style="${colorVars(it.color)}"${editable() ? '' : ' disabled'}>
            <span class="ds-time">${it.time != null ? fmtTime(it.time) : 'any time'}</span>
            <span class="ds-title">${it.icon ? esc(it.icon) + ' ' : ''}${esc(it.title || 'Untitled')}${inSet(it.series).length > 1 ? ' <span class="ds-rep" title="On more than one day">🔁</span>' : ''}</span>
            ${it.note ? `<span class="ds-note rich">${richHTML(it.note)}</span>` : ''}
          </button>`).join('')}</div>`
          : '<p class="muted ds-empty">Nothing planned yet 🌱</p>'}
        ${editable() ? '<div class="sheet-actions"><button type="button" class="btn" data-a="add">＋ Add to this day</button></div>' : ''}`;
    }

    // The little calendar for picking days.
    function renderCal() {
      const e = editing, ym = e.calYm;
      const [y, m] = ym.split('-').map(Number);
      const order = weekOrder(s);
      const offset = (new Date(y, m - 1, 1).getDay() - order[0] + 7) % 7;
      const setDays = new Set(inSet(e.draft.series).map(x => x.day));
      const today = dayKey();
      let cells = '<span></span>'.repeat(offset);
      for (let dd = 1, n = new Date(y, m, 0).getDate(); dd <= n; dd++) {
        const key = `${ym}-${String(dd).padStart(2, '0')}`;
        const on = e.days.has(key);
        cells += `<button type="button" class="mc-day${on ? ' on' : ''}${key === today ? ' today' : ''}${!on && setDays.has(key) ? ' in-set' : ''}" data-day="${key}" aria-pressed="${on}" aria-label="${esc(fmtDay(key))}">${dd}</button>`;
      }
      const cnt = e.days.size;
      box.querySelector('.mini-cal').innerHTML = `
        <div class="mc-head">
          <button type="button" class="mc-nav" data-cal="-1" aria-label="Previous month">‹</button>
          <span>${esc(monthLabel(ym))}</span>
          <button type="button" class="mc-nav" data-cal="1" aria-label="Next month">›</button>
        </div>
        <div class="mc-dow">${order.map(d => `<span>${esc(dowName(d, 'narrow'))}</span>`).join('')}</div>
        <div class="mc-grid">${cells}</div>
        <p class="mc-count">${cnt === 1 ? 'Tap more days to put it on each of them too' : `On ${cnt} days`}</p>`;
    }

    function showEditor(item, isNew, heading = '') {
      rich?.stop();
      editing = { draft: { ...item }, orig: { ...item }, isNew, days: new Set([k]), repeat: 'none', until: '', calYm: monthOf(k) };
      const d = editing.draft;
      const setSize = inSet(d.series).length;
      let times = '<option value="">Any time</option>';
      for (let m = 0; m < 1440; m += 30) times += `<option value="${m}"${d.time === m ? ' selected' : ''}>${fmtTime(m)}</option>`;
      box.innerHTML = `
        ${heading ? `<p class="ds-heading">${esc(heading)}</p>` : ''}
        <label class="field"><span>What's happening?</span>
          <input class="inp" name="title" maxlength="60" value="${esc(d.title)}" placeholder="e.g. Date night, Mum's birthday" autocomplete="off"></label>
        <div class="field"><span>Little icon</span>${iconRow(d.icon)}</div>
        <label class="field"><span>Time</span><select class="inp" name="time">${times}</select></label>
        <div class="field"><span>Days${setSize > 1 ? ` <small class="field-hint">· 🔁 one of ${setSize} days (dotted)</small>` : ''}</span><div class="mini-cal"></div></div>
        <div class="field two rep-row">
          <label><span>Repeat</span><select class="inp" name="repeat">${REPEATS.map(r => `<option value="${r.id}">${r.label}</option>`).join('')}</select></label>
          <label class="rep-until" hidden><span>Until</span><input class="inp" type="date" name="until" min="${k}"></label>
        </div>
        <div class="field"><span>Colour</span>${swatchesHTML(d.color)}</div>
        ${richFieldHTML('Notes', d.note)}
        <div class="sheet-actions">
          <button type="button" class="btn ghost danger-text" data-a="${isNew ? 'back' : 'del-item'}">${isNew ? 'Cancel' : 'Delete'}</button>
          ${isNew ? '' : '<button type="button" class="btn ghost" data-a="dup-item">Duplicate</button>'}
          <button type="button" class="btn" data-a="save-item">Save</button>
        </div>`;
      renderCal();
      rich = wireRich(box.querySelector('.rt'), box.querySelector('.rt-bar'), md => { if (editing) editing.draft.note = md.slice(0, NOTE_MAX); }, { max: NOTE_MAX });
      if (isNew) setTimeout(() => box.querySelector('[name=title]')?.focus(), 50);
    }

    async function commit() {
      const e = editing, d = e.draft;
      d.title = d.title.trim() || 'Untitled';
      // Changing one of a set: just this day, or every day in it?
      const others = e.isNew ? [] : inSet(d.series).filter(x => x.it.id !== d.id);
      let all = false;
      if (others.length && JSON.stringify(fields(d)) !== JSON.stringify(fields(e.orig))) {
        const ans = await choiceSheet('Change every day?', `“${d.title}” is on ${others.length + 1} days.`, [
          { v: 'one', label: 'Just this day' },
          { v: 'all', label: `All ${others.length + 1} days`, primary: true },
        ]);
        if (!ans || editing !== e) return;   // closed: keep editing
        all = ans === 'all';
      }
      const days = expandDays([...e.days], e.repeat, e.until);
      if (days.length > 1 && !d.series) d.series = uid();
      const home = days.includes(k) ? k : days[0];
      if (home !== k) dropItem(k, d.id);   // moved to another day
      putItem(home, d);
      let added = 0;
      for (const day of days) {
        if (day === home) continue;
        const ex = (s.items[day] || []).find(x => x.series === d.series);
        if (ex) Object.assign(ex, fields(d));
        else { putItem(day, { ...fields(d), id: uid(), series: d.series }); added++; }
      }
      if (all) others.forEach(({ it }) => Object.assign(it, fields(d)));
      save();
      renderMonth();
      if (added) toast(`Added to ${added + 1} days ✨`);
      else if (home !== k) toast(`${e.isNew ? 'Added to' : 'Moved to'} ${fmtDay(home, { weekday: 'short', day: 'numeric', month: 'short' })}`);
      showList();
    }

    async function removeItem() {
      const d = editing.draft;
      const set = inSet(d.series);
      let which = 'one';
      if (set.length > 1) {
        const later = set.filter(x => x.day > k).length;
        which = await choiceSheet('Remove from every day?', `“${d.title || 'Untitled'}” is on ${set.length} days.`, [
          { v: 'one', label: 'Just this day' },
          ...(later ? [{ v: 'later', label: 'This day & after' }] : []),
          { v: 'all', label: `All ${set.length} days`, danger: true, primary: true },
        ]);
        if (!which) return;
      }
      if (which === 'one') dropItem(k, d.id);
      else set.filter(x => which === 'all' || x.day >= k).forEach(x => dropItem(x.day, x.it.id));
      save();
      renderMonth();
      showList();
    }

    box.addEventListener('input', e => {
      if (!editing || e.target.closest('.rt')) return;
      const n = e.target.name;
      if (n === 'title') editing.draft.title = e.target.value;
      else if (n === 'time') editing.draft.time = e.target.value === '' ? null : Number(e.target.value);
      else if (n === 'until') editing.until = e.target.value;
      else if (n === 'repeat') {
        const r = REPEATS.find(x => x.id === e.target.value) || REPEATS[0];
        editing.repeat = r.id;
        const untilBox = box.querySelector('.rep-until');
        untilBox.hidden = !r.ahead;
        if (r.ahead) {
          const last = [...editing.days].sort().pop();
          editing.until = addMonths(last, r.ahead);
          untilBox.querySelector('input').value = editing.until;
        }
      }
    });
    box.addEventListener('keydown', e => {
      if (editing && e.key === 'Enter' && e.target.name === 'title') { e.preventDefault(); commit(); }
    });
    box.addEventListener('click', e => {
      const ic = e.target.closest('[data-icon]');
      if (ic && editing) {
        editing.draft.icon = ic.dataset.icon;
        box.querySelectorAll('.icon-pick').forEach(x => x.classList.toggle('on', x === ic));
        return;
      }
      const sw = e.target.closest('.sw');
      if (sw && editing) { editing.draft.color = sw.dataset.color; markSwatch(box, sw.dataset.color); return; }
      const cal = e.target.closest('[data-cal]');
      if (cal && editing) { editing.calYm = shiftMonth(editing.calYm, Number(cal.dataset.cal)); renderCal(); return; }
      const dayBtn = e.target.closest('[data-day]');
      if (dayBtn && editing) {
        const key = dayBtn.dataset.day;
        if (editing.days.has(key)) { if (editing.days.size > 1) editing.days.delete(key); }   // always on at least one day
        else editing.days.add(key);
        renderCal();
        return;
      }
      const itemBtn = e.target.closest('[data-item]');
      if (itemBtn && editable()) {
        const it = (s.items[k] || []).find(x => x.id === itemBtn.dataset.item);
        if (it) showEditor(it, false);
        return;
      }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'add') {
        const used = new Set((s.items[k] || []).map(x => x.color));
        showEditor({ id: uid(), title: '', icon: '', time: null, color: COLOR_KEYS.find(c => !used.has(c)) || 'pink', note: '' }, true);
      } else if (a === 'save-item') commit();
      else if (a === 'back') showList();
      else if (a === 'del-item') removeItem();
      else if (a === 'dup-item') {
        const copy = { ...fields(editing.draft), id: uid() };
        showEditor(copy, true, 'Your copy — pick the days it goes on, then Save');
      }
    });

    showList();
    if (editable() && !(s.items[k] || []).length) box.querySelector('[data-a="add"]')?.click();
  }

  function hourOptions(from, to, selected) {
    let out = '';
    for (let h = from; h <= to; h++) out += `<option value="${h * 60}"${h * 60 === selected ? ' selected' : ''}>${fmtTime(h * 60)}</option>`;
    return out;
  }

  function openSettings() {
    const s = cur();
    if (!s) return;
    const t = typeOf(s);
    const sheet = openSheet({
      title: `${typeInfo(t).label} schedule`,
      body: `
        <label class="field"><span>Name</span><input class="inp" name="name" maxlength="40" value="${esc(s.name)}"></label>
        <div class="share-row plan-share" style="${colorVars('lavender')}"></div>
        ${t !== 'month' ? `
          <div class="field two">
            <label><span>Day starts</span><select class="inp" name="start">${hourOptions(0, 23, s.start)}</select></label>
            <label><span>Day ends</span><select class="inp" name="end">${hourOptions(1, 24, s.end)}</select></label>
          </div>
          <div class="field"><span>Snap blocks to</span>
            <div class="seg wide" data-group="step">${[15, 30, 60].map(m => `<button type="button" data-v="${m}" class="${s.step === m ? 'on' : ''}">${m} min</button>`).join('')}</div></div>
          <div class="field"><span>Row size</span>
            <div class="seg wide" data-group="row">${ROW_SIZES.map(r => `<button type="button" data-v="${r.px}" class="${s.row === r.px ? 'on' : ''}">${r.label}</button>`).join('')}</div></div>` : ''}
        ${t !== 'day' ? `
          <div class="field"><span>Week starts on</span>
            <div class="seg wide" data-group="weekStart">${[1, 0].map(d => `<button type="button" data-v="${d}" class="${(s.weekStart ?? 1) === d ? 'on' : ''}">${esc(dowName(d, 'long'))}</button>`).join('')}</div></div>` : ''}
        <div class="field"><span>Order of your schedules</span><div class="sched-order"></div></div>
        <div class="sheet-actions">
          <button type="button" class="btn ghost danger-text" data-a="delete">Delete</button>
          <button type="button" class="btn ghost" data-a="dup">Duplicate</button>
          <button type="button" class="btn" data-a="done">Done</button>
        </div>`,
      onClose: () => { save(); render(); },
    });
    const el = sheet.el;
    // Shared with your person, or just you (moved to schedules-private, so it
    // leaves their phone). New plans start shared.
    const renderShare = () => {
      el.querySelector('.plan-share').innerHTML = `<span>💞 Share with ${esc(partnerName())}<small>${s.private
          ? `🔒 Just you: ${esc(partnerName())} doesn't see this plan, or that it exists`
          : `${esc(partnerName())} sees it under “${esc(store.readMine('profile', {}).name || 'your')}'s plans”`}</small></span>
        <button type="button" class="tgl${s.private ? '' : ' on'}" data-plan-share role="switch" aria-checked="${!s.private}" aria-label="Share with ${esc(partnerName())}"></button>`;
    };
    renderShare();
    el.addEventListener('click', e => {
      if (!e.target.closest('[data-plan-share]')) return;
      s.private = !s.private;
      save();
      render();
      renderShare();
      renderOrder();
      toast(s.private ? `🔒 Just you now: it's off ${partnerName()}'s phone` : `💞 Shared with ${partnerName()}`);
    });
    // Reorder the schedule tabs with ↑ / ↓.
    const renderOrder = () => {
      el.querySelector('.sched-order').innerHTML = list.map((x, i) => `
        <div class="so-row${x.id === s.id ? ' cur' : ''}">
          <span class="so-name">${typeInfo(typeOf(x)).icon} ${esc(x.name)}${x.private ? ' 🔒' : ''}</span>
          <button type="button" class="so-btn" data-move="-1" data-id="${x.id}" aria-label="Move ${esc(x.name)} earlier"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="so-btn" data-move="1" data-id="${x.id}" aria-label="Move ${esc(x.name)} later"${i === list.length - 1 ? ' disabled' : ''}>↓</button>
        </div>`).join('');
    };
    renderOrder();
    el.addEventListener('click', e => {
      const mv = e.target.closest('[data-move]');
      if (!mv) return;
      const i = list.findIndex(x => x.id === mv.dataset.id), j = i + Number(mv.dataset.move);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      save();
      render();
      renderOrder();
    });
    el.addEventListener('input', e => {
      if (e.target.name === 'name') s.name = e.target.value.trim() || 'Untitled';
      if (e.target.name === 'start' || e.target.name === 'end') {
        let st = Number(el.querySelector('[name=start]').value), en = Number(el.querySelector('[name=end]').value);
        if (en <= st) { en = Math.min(1440, st + 60); el.querySelector('[name=end]').value = en; }
        s.start = st;
        s.end = en;
      }
      save();
      render();
    });
    el.addEventListener('click', async e => {
      const segBtn = e.target.closest('[data-group] button');
      if (segBtn) {
        const group = segBtn.parentElement.dataset.group;
        s[group] = Number(segBtn.dataset.v);
        segBtn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === segBtn));
        save();
        render();
        return;
      }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'done') sheet.close();
      if (a === 'dup') {
        const copy = clone(s);
        copy.id = uid();
        copy.name = s.name + ' (copy)';
        copy.blocks.forEach(b => { b.id = uid(); });
        copy.stickers.forEach(x => { x.id = uid(); });
        list.push(copy);
        setCur(copy.id);
        sheet.close();
      }
      if (a === 'delete') {
        sheet.close();
        const ok = await confirmSheet('Delete this schedule?', `“${s.name}” and everything on it will be removed.`, { ok: 'Delete', danger: true });
        if (!ok) return;
        list = list.filter(x => x.id !== s.id);
        setCur(list[0]?.id);
        save();
        render();
      }
    });
  }

  function createSchedule() {
    let type = 'day';
    const sheet = openSheet({
      title: 'New schedule',
      body: `
        <form class="new-sched">
          <div class="field"><span>What kind of schedule?</span>
            <div class="type-pick">${TYPES.map(t => `
              <button type="button" class="type-opt${t.id === type ? ' on' : ''}" data-type="${t.id}" aria-pressed="${t.id === type}">
                <span class="type-art">${t.icon}</span><b>${t.label}</b><small>${t.hint}</small>
              </button>`).join('')}</div></div>
          <label class="field"><span>Name</span>
            <input class="inp" name="name" maxlength="40" placeholder="${esc(TYPES[0].placeholder)}" autocomplete="off"></label>
          <div class="sheet-actions">
            <button type="button" class="btn ghost" data-a="cancel">Cancel</button>
            <button type="submit" class="btn">Create</button>
          </div>
        </form>`,
    });
    const form = sheet.el.querySelector('form');
    const name = form.elements.namedItem('name');
    form.addEventListener('click', e => {
      const opt = e.target.closest('[data-type]');
      if (opt) {
        type = opt.dataset.type;
        form.querySelectorAll('.type-opt').forEach(b => { const on = b === opt; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        name.placeholder = typeInfo(type).placeholder;
        return;
      }
      if (e.target.closest('[data-a="cancel"]')) sheet.close();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const s = newSchedule(name.value.trim() || typeInfo(type).name, type);
      list.push(s);
      setCur(s.id);
      save();
      sheet.close();
      render();
      scrollToNow();
    });
  }

  // ── stickers ───────────────────────────────────────────────────────────
  function setDecor(on) {
    decor = on;
    root.classList.toggle('decorating', on);
    layer.setActive(on && !isMonth());
    mlayer.setActive(on && isMonth());
  }
  const trayTarget = {
    rectEl: wrap,
    get note() { return editable() ? '' : `Stickers you add here show on ${partnerName()}'s plan with a little "from you" 💌`; },
    add(k, cx, cy) {
      if (!cur()) return;
      if (cx == null) {
        const r = wrap.getBoundingClientRect();
        cx = r.left + r.width * (0.3 + Math.random() * 0.4);
        cy = r.top + r.height * 0.35 + (Math.random() * 60 - 30);
      }
      const l = isMonth() ? mlayer : layer;
      l.add(k, l.clientToLayer(cx, cy));
    },
    onClose: () => setDecor(false),
  };

  // ── buttons ────────────────────────────────────────────────────────────
  root.addEventListener('click', e => {
    // Decorating: a tap on the plan away from any sticker sets the chosen one down; the next tap finishes.
    if (decor && wrap.contains(e.target) && !e.target.closest('.stk, [data-act], [data-sched], [data-owner]')) {
      tapAway(isMonth() ? mlayer : layer);
      return;
    }
    const ob = e.target.closest('[data-owner]');
    if (ob) {
      if (ob.dataset.owner === owner) return;
      if (tray.target === trayTarget) tray.close();
      owner = ob.dataset.owner;
      load();
      render();
      scrollToNow();
      return;
    }
    const tab = e.target.closest('[data-sched]');
    if (tab) {
      if (tray.target === trayTarget) tray.close();
      setCur(tab.dataset.sched);
      render();
      scrollToNow();
      return;
    }
    const cell = e.target.closest('.mcell');
    if (cell && !decor) { openDaySheet(cell.dataset.date); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const s = cur();
    if (act === 'new-sched') createSchedule();
    else if (act === 'rename') {
      if (!s || !editable()) return;
      promptSheet('Rename schedule', { value: s.name, ok: 'Rename', maxlength: 40 }).then(v => {
        if (!v) return;
        s.name = v;
        save();
        render();
      });
    }
    else if (act === 'settings') { if (editable()) openSettings(); }
    else if (act === 'plan-share') {
      // Just you: moved to schedules-private, so it leaves your person's phone.
      if (!s || !editable()) return;
      s.private = !s.private;
      save();
      render();
      vibrate(8);
      toast(s.private ? `🔒 Just you now: it's off ${partnerName()}'s phone` : `💞 Shared with ${partnerName()}`);
    }
    else if (act === 'week-fit') {
      setPref('planFit', !fitWeek());
      render();
      scrollToNow();
    } else if (act === 'prev-month' || act === 'next-month' || act === 'this-month') {
      monthCursor[s.id] = act === 'this-month' ? monthOf(dayKey()) : shiftMonth(monthKey(s), act === 'prev-month' ? -1 : 1);
      render();
    } else if (act === 'add-block') {
      if (!s || !editable()) return;
      if (isMonth()) {
        const today = dayKey();
        monthCursor[s.id] = monthOf(today);
        render();
        openDaySheet(today);
        return;
      }
      const n = nowMinutes();
      const base = n >= s.start && n < s.end - s.step ? Math.ceil(n / s.step) * s.step : s.start;
      const start = clamp(base, s.start, s.end - s.step);
      addBlock(start, Math.min(s.end, start + 60), isWeek() ? new Date().getDay() : undefined);
    } else if (act === 'stickers') {
      if (tray.target === trayTarget) tray.close();
      else if (s) { setDecor(true); tray.open(trayTarget); }
    }
  });

  // Bring "now" into view: the current hour, and today's column in a week.
  function scrollToNow() {
    const s = cur();
    if (!s) return;
    if (isMonth()) { wrap.scrollTop = 0; return; }
    const n = nowMinutes();
    const target = n > s.start && n < s.end ? n - 60 : s.start;
    wrap.scrollTop = Math.max(0, yOf(target) - 10);
    wrap.scrollLeft = isWeek() ? Math.max(0, weekOrder(s).indexOf(new Date().getDay()) * G.colW - 4) : 0;
  }

  store.on((k, source) => {
    if (k === store.keyFor(store.partner(), 'profile')) renderOwner();
    // Gift stickers (from either of you) or new photo stickers: just redraw stickers.
    if (source === 'remote' && /:(gifts|stickerbox)$/.test(k)) {
      if (cur() && !drag && !layer.busy() && !mlayer.busy()) (isMonth() ? mlayer : layer).render();
      return;
    }
    if (source !== 'remote' || (k !== store.keyFor(slot(), 'schedules') && !(editable() && k === store.keyFor(store.me(), 'schedules-private')))) return;
    if (drag || editorOpen) return;
    load();
    render();
  });

  window.addEventListener('resize', () => { if (cur() && !drag && root.classList.contains('active')) render(); });
  setInterval(() => { if (cur()) renderNow(); }, 60000);

  let shownOnce = false;
  return {
    show() {
      load();
      render();
      if (!shownOnce) { shownOnce = true; scrollToNow(); }
    },
    rerender: () => { if (cur()) render(); },
  };
}
