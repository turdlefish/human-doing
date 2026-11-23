// The buttons on each card. Your main ones show, the rest fold under
// "N more" (a button that's on for the day always shows), and ✎ Edit (by the
// title above them, the same on every card) opens a sheet to rename them, drag them into your order, ★ your main ones, and add
// or take away your own. The lists:
//   work      work types (built-in and your own)
//   symptoms  the cycle's symptoms        support  period support
//   walk      your walks                  meds     your medicines
//   own-…     an Options tracker's options
// Where each list keeps its names and order: see arranged in docs.js.

import * as store from './store.js';
import { colorVars, esc, fmtTime, uid, vibrate } from './util.js';
import { dragSort, firstEmoji, moved, openSheet } from './ui.js';
import { WORK_TYPES, arranged, myWorkTypes, readSettings, writeSettings } from './docs.js';
import { QUICK, SUPPORT, SYMPTOMS } from './cycle.js';
import { minsLabel, walkSettings } from './walk.js';

// How many show before "more" until you pick your own main ones (other lists: all of them).
const SHOWN = { symptoms: QUICK, support: 3 };

const cfg = (s, list) => (s.buttons || {})[list] || {};
const setCfg = (s, list, patch) => { s.buttons = { ...(s.buttons || {}), [list]: { ...cfg(s, list), ...patch } }; };

/** The buttons folded under "more": the ones you haven't ★'d. */
export function foldOf(list, items, s = readSettings()) {
  const f = cfg(s, list).fold;
  if (Array.isArray(f)) return new Set(f);
  const n = SHOWN[list];
  return new Set(n == null ? [] : items.slice(n).map(x => x.id));
}

// The lists opened with "N more" (the same on the Tracking card and the
// cycle page), until the app restarts.
const opened = new Set();
export const isOpen = list => opened.has(list);
/** "N more" or "Fewer" tapped: true if `target` was one (redraw then). */
export function moreTap(target) {
  const b = target.closest('[data-more]');
  if (!b) return false;
  if (opened.has(b.dataset.more)) opened.delete(b.dataset.more); else opened.add(b.dataset.more);
  return true;
}

/**
 * Which of a list's buttons show on its card: { shown, more } (more: the
 * "N more" / "Fewer" button, or ''). on(x): it's on for the day, so it shows.
 */
export function foldParts(list, items, { on = () => false, open = isOpen(list) } = {}) {
  const fold = foldOf(list, items);
  const hid = items.filter(x => fold.has(x.id) && !on(x)).length;
  const shown = items.filter(x => open || !fold.has(x.id) || on(x));
  const more = !hid ? ''
    : `<button type="button" class="chip more-chip" data-more="${esc(list)}" aria-expanded="${open}">${open ? 'Fewer ▴' : `${hid} more ▾`}</button>`;
  return { shown, more };
}

/** ✎ Edit for a list of buttons, on the right of the title above them. */
export const editLink = list => `<button type="button" class="q-edit" data-edit-btns="${esc(list)}" aria-label="Edit these buttons: rename, reorder, pick your main ones">✎ Edit</button>`;

/**
 * The title above a card's buttons (like a question on Human Being's
 * check-in), with ✎ Edit on the right when `list` is given. title and note are HTML.
 */
export const titleRow = (title, list = '', { note = '', sub = false } = {}) =>
  `<div class="q q-row tk-qrow${sub ? ' sub' : ''}"><span>${title}${note ? ` <span class="q-note">${note}</span>` : ''}</span>${list ? editLink(list) : ''}</div>`;

/** A card's row of buttons: the main ones, then "N more". chip(x) draws one. */
export function foldedChips(list, items, chip, { on, open } = {}) {
  const { shown, more } = foldParts(list, items, { on, open });
  return shown.map(chip).join('') + more;
}

// ── The lists ─────────────────────────────────────────────────────────────
// Lists with built-in buttons: those are renamed in `names` and ordered in
// `order`; your own ones are kept (and renamed) with their settings.
function mixedKind(list, { title, color, hint, note, base, get, put, items }) {
  const builtIn = id => base().find(x => x.id === id);
  return {
    title, color, hint, note, emoji: true,
    items: s => (items ? items(s) : arranged(list, [...base(), ...(get(s) || [])], s))
      .map(x => ({ id: x.id, emoji: x.emoji, label: x.label, own: !builtIn(x.id), was: builtIn(x.id)?.label || '' })),
    rename(s, id, next) {
      const b = builtIn(id);
      if (!b) { put(s, get(s).map(x => (x.id === id ? { ...x, emoji: next.emoji || x.emoji, label: next.label || x.label } : x))); return; }
      const n = {};
      if (next.emoji && next.emoji !== b.emoji) n.emoji = next.emoji;
      if (next.label && next.label !== b.label) n.label = next.label;
      const names = { ...(cfg(s, list).names || {}) };
      if (Object.keys(n).length) names[id] = n; else delete names[id];
      setCfg(s, list, { names });
    },
    reorder: (s, ids) => setCfg(s, list, { order: ids }),
    remove: (s, id) => put(s, get(s).filter(x => x.id !== id)),
    add(s, { emoji, label }) {
      const x = { id: 'own-' + uid(), emoji: emoji || '✨', label };
      put(s, [...(get(s) || []), x]);
    },
  };
}

// Lists that are all yours: renamed and ordered where they're kept.
function ownKind({ title, color, hint, note, emoji = false, get, put, toItem, rename, make }) {
  return {
    title, color, hint, note, emoji,
    items: s => get(s).map(x => ({ ...toItem(x), own: true })),
    rename: (s, id, next) => put(s, get(s).map(x => (x.id === id ? rename(x, next) : x))),
    reorder(s, ids) {
      const by = new Map(get(s).map(x => [x.id, x]));
      put(s, ids.map(id => by.get(id)).filter(Boolean));
    },
    remove: (s, id) => put(s, get(s).filter(x => x.id !== id)),
    add: make ? (s, v) => put(s, [...get(s), make(v)]) : null,
  };
}

const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

function kindOf(list, s = readSettings()) {
  switch (list) {
    case 'work': return mixedKind('work', {
      title: 'Work day buttons', color: 'sky', hint: 'e.g. Study day',
      base: () => WORK_TYPES, get: st => st.work.types, put: (st, l) => { st.work.types = l; }, items: st => myWorkTypes(st.work, st),
    });
    case 'symptoms': return mixedKind('symptoms', {
      title: 'Symptoms', color: 'coral', hint: 'e.g. Restless',
      base: () => SYMPTOMS, get: st => st.cycle.symptoms, put: (st, l) => { st.cycle.symptoms = l; },
    });
    case 'support': return mixedKind('support', {
      title: 'Period support', color: 'peach', hint: 'e.g. Ginger tea',
      note: `${store.readPartner('profile', null)?.name || 'Your person'} sees the names you give these, on the days you pick them (unless your cycle is just yours).`,
      base: () => SUPPORT, get: st => st.cycle.support, put: (st, l) => { st.cycle.support = l; },
    });
    case 'walk': return ownKind({
      title: 'Walks', color: 'mint', hint: 'e.g. Walk to the shop', emoji: true,
      note: 'A new walk counts as 20 minutes: change it in ⚙️ Walks and nudges.',
      get: st => walkSettings(st).options,
      put: (st, l) => { st.trackers.walk = { ...walkSettings(st), options: l }; },
      toItem: o => ({ id: o.id, emoji: o.emoji || '🚶', label: o.name || '', sub: minsLabel(o) }),
      rename: (o, n) => ({ ...o, emoji: n.emoji || o.emoji, name: n.label || o.name }),
      make: ({ emoji, label }) => ({ id: 'w' + uid().slice(0, 6), emoji: emoji || '🚶', name: label, mins: 20 }),
    });
    case 'meds': return ownKind({
      title: 'Your medicines', color: 'mint',
      get: st => st.meds, put: (st, l) => { st.meds = l; },
      toItem: m => ({ id: m.id, label: m.name, sub: [m.dose, m.asNeeded ? 'as needed' : m.time ? fmtTime(toMin(m.time)) : '', m.left != null ? `${m.left} left` : ''].filter(Boolean).join(' · ') }),
      rename: (m, n) => ({ ...m, name: n.label || m.name }),
    });
    default: {
      const def = s.trackers.own.find(d => d.id === list);
      if (!def || def.type !== 'options') return null;
      const opts = st => (st.trackers.own.find(d => d.id === list) || {}).options || [];
      return ownKind({
        title: def.name, color: def.color, hint: 'e.g. 🧘 Yoga',
        get: opts,
        put: (st, l) => { st.trackers.own = st.trackers.own.map(d => (d.id === list ? { ...d, options: l } : d)); },
        toItem: o => ({ id: o.id, label: o.label }),
        rename: (o, n) => ({ ...o, label: n.label || o.label }),
        make: ({ label }) => ({ id: 'o' + uid().slice(0, 5), label }),
      });
    }
  }
}

/**
 * ✎ Edit: a list's buttons to rename, drag ⋮⋮ into order, ★ as main, and
 * (your own) take away with ✕ or add. extra: { html(), bind(box, draw) } adds
 * more under the list (the medicines' form).
 */
export function editButtons(list, { onClose, extra } = {}) {
  const k = kindOf(list);
  if (!k) return null;
  const sheet = openSheet({ title: k.title, body: '<div class="btn-edit"></div>', onClose });
  const box = sheet.el.querySelector('.btn-edit');
  const change = fn => { const s = readSettings(); fn(s); writeSettings(s); };
  const draw = () => {
    const s = readSettings();
    const items = k.items(s);
    const fold = foldOf(list, items, s);
    box.innerHTML = `
      <p class="muted small sheet-hint">★ Your main buttons always show on the card; the rest fold under <b>more</b>. Tap a name to rename it, and drag ⋮⋮ to change the order.</p>
      <div class="edit-list">${items.map(x => `
        <div class="el-row bt-row" data-bid="${esc(x.id)}" style="${colorVars(k.color)}">
          <span class="grip" aria-hidden="true">⋮⋮</span>
          ${k.emoji ? `<input class="emo" data-bemoji="${esc(x.id)}" maxlength="16" value="${esc(x.emoji || '')}" aria-label="Emoji for ${esc(x.label)}" autocomplete="off">` : ''}
          <div class="bt-name"><input data-bname="${esc(x.id)}" maxlength="28" value="${esc(x.label)}" placeholder="${esc(x.was)}" aria-label="Name" autocomplete="off">${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</div>
          <button type="button" class="bt-star${fold.has(x.id) ? '' : ' on'}" data-bstar="${esc(x.id)}" aria-pressed="${!fold.has(x.id)}" aria-label="${esc(x.label)}: a main button" title="Main: always on the card">${fold.has(x.id) ? '☆' : '★'}</button>
          ${x.own ? `<button type="button" class="row-x" data-bdel="${esc(x.id)}" aria-label="Remove ${esc(x.label)}">✕</button>` : ''}
        </div>`).join('') || '<p class="muted small">Nothing here yet.</p>'}</div>
      ${k.add ? `<form class="own-form bt-add"><div class="own-row">
          ${k.emoji ? '<input class="inp own-emoji" name="emoji" maxlength="16" placeholder="✨" aria-label="Emoji (optional)" autocomplete="off">' : ''}
          <input class="inp" name="label" maxlength="28" placeholder="${esc(k.hint)}" aria-label="A new one's name" autocomplete="off"></div>
          <button type="submit" class="btn ghost">＋ Add your own</button></form>` : ''}
      ${k.note ? `<p class="note-sm">${esc(k.note)}</p>` : ''}
      ${extra ? extra.html() : ''}`;
  };
  draw();

  // Renaming saves when you leave the box; an emptied name goes back to what it was.
  box.addEventListener('change', e => {
    const id = e.target.dataset.bname || e.target.dataset.bemoji;
    if (!id) return;
    const row = e.target.closest('.bt-row');
    const label = row.querySelector('[data-bname]').value.trim();
    const emoji = firstEmoji(row.querySelector('[data-bemoji]')?.value.trim() || '');
    change(s => k.rename(s, id, { label, emoji }));
    if (!label || (k.emoji && !emoji)) draw();
  });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.dataset.bname || e.target.dataset.bemoji)) e.target.blur(); });
  box.addEventListener('click', e => {
    const star = e.target.closest('[data-bstar]');
    if (star) {
      change(s => {
        const items = k.items(s), fold = foldOf(list, items, s), id = star.dataset.bstar;
        if (fold.has(id)) fold.delete(id); else fold.add(id);
        setCfg(s, list, { fold: items.filter(x => fold.has(x.id)).map(x => x.id) });
      });
      vibrate(8);
      draw();
      return;
    }
    const del = e.target.closest('[data-bdel]');
    if (del) { change(s => k.remove(s, del.dataset.bdel)); draw(); }
  });
  box.addEventListener('submit', e => {
    if (!e.target.matches('.bt-add')) return;
    e.preventDefault();
    const f = e.target, name = f.elements.namedItem('label');
    const label = name.value.trim();
    if (!label) { name.focus(); return; }
    change(s => k.add(s, { emoji: firstEmoji(f.elements.namedItem('emoji')?.value.trim() || ''), label }));
    vibrate(8);
    draw();
    box.querySelector('.bt-add [name=label]')?.focus();
  });
  box.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.bt-row .grip');
    if (!grip) return;
    const rows = [...box.querySelectorAll('.bt-row')];
    dragSort(e, grip, rows, grip.closest('.bt-row'), (from, to) => {
      change(s => k.reorder(s, moved(rows.map(r => r.dataset.bid), from, to)));
      vibrate(8);
      draw();
    });
  });
  if (extra) extra.bind(box, draw);
  return sheet;
}
