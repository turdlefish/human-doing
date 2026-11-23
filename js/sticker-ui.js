// Sticker layer (drag / resize / rotate stickers sitting on top of a page)
// and the sticker drawer shared by the self-care map and the planner.

import { CATEGORIES, defaultSize, stickerInner, stickerKind, wordKey } from './stickers.js';
import { COLOR_KEYS, clamp, esc, prefs, setPref, toast, uid, vibrate } from './util.js';
import { promptSheet } from './ui.js';
import { addFromFile, chooseShape, customKeys, pickPhoto } from './custom.js';

// opts:
//   el             layer element (absolutely positioned over the page)
//   sources()      [{ list, editable, movable, save, primary, from }] — the sticker arrays
//                  shown on this page. `primary` receives new stickers; `from`
//                  labels stickers that came from someone ("from Sam 💌"). `movable`
//                  stickers (your person's) can be moved and resized but not removed.
//   moves          optional { get() -> { id: placement }, save(id, placement) }: where
//                  movable stickers were moved to. A placement wins when its `mt`
//                  (moved-at time) is newer than the sticker's own.
//   posToPx(s)     sticker model -> {x, y} in layer px (sticker centre)
//   pxToPos(x, y)  layer px -> partial model to assign onto the sticker
//   clientToLayer(cx, cy) -> {x, y} layer px
//   active()       whether the page is in decorating mode
//   scale()        optional: multiplier for the default size of new stickers
export function createStickerLayer(opts) {
  const el = opts.el;
  let selId = null;
  let justRemoved = false;
  let g = null;   // active gesture (holds the sticker it's moving: your person's lists are re-read fresh each time)

  // The page's sticker lists, with any newer moves (yours or your person's) applied.
  function sourcesNow() {
    const srcs = opts.sources();
    const moves = opts.moves ? opts.moves.get() : null;
    if (moves) {
      for (const src of srcs) {
        for (const s of src.list) {
          const m = moves[s.id];
          if (m && (m.mt || 0) > (s.mt || 0)) Object.assign(s, m);
        }
      }
    }
    return srcs;
  }

  function locate(id) {
    for (const src of sourcesNow()) {
      const s = src.list.find(x => x.id === id);
      if (s) return { s, src };
    }
    return null;
  }
  const elFor = id => el.querySelector(`.stk[data-id="${id}"]`);

  function html(s, src) {
    const p = opts.posToPx(s);
    const handles = src.editable || src.movable;
    return `<div class="stk${src.editable ? ' editable' : src.movable ? ' movable' : ''}${s.id === selId ? ' sel' : ''}" data-id="${s.id}" data-kind="${stickerKind(s.k)}"
      style="left:${p.x}px;top:${p.y}px;--s:${s.size};transform:translate(-50%,-50%) rotate(${s.rot || 0}deg)">
      <div class="stk-body">${stickerInner(s.k)}</div>
      ${src.from ? `<span class="stk-from">from ${esc(src.from)} 💌</span>` : ''}
      ${src.editable ? '<button type="button" class="stk-del" aria-label="Remove sticker">×</button>' : ''}
      ${handles ? `
      <span class="stk-rot" title="Drag to resize & rotate">↻</span>` : ''}
    </div>`;
  }

  function render() {
    el.innerHTML = sourcesNow().map(src => src.list.map(s => html(s, src)).join('')).join('');
    el.classList.toggle('active', !!opts.active());
  }

  function place(s) {
    const e = elFor(s.id);
    if (!e) return;
    const p = opts.posToPx(s);
    e.style.left = p.x + 'px';
    e.style.top = p.y + 'px';
    e.style.setProperty('--s', s.size);
    e.style.transform = `translate(-50%,-50%) rotate(${s.rot || 0}deg)`;
  }

  function select(id) {
    selId = id;
    if (id) justRemoved = false;
    el.querySelectorAll('.stk').forEach(e => e.classList.toggle('sel', e.dataset.id === id));
  }

  function add(k, layerPt) {
    const src = opts.sources().find(x => x.primary);
    if (!src) return null;
    const scale = opts.scale ? opts.scale() : 1;
    const s = {
      id: uid(), k,
      size: Math.round(clamp(defaultSize(k) * scale, 24, 360)),
      rot: Math.round(Math.random() * 16 - 8),
      ...opts.pxToPos(layerPt.x, layerPt.y),
    };
    src.list.push(s);
    selId = s.id;
    render();
    src.save();
    vibrate(8);
    return s;
  }

  function remove(id) {
    const f = locate(id);
    if (!f || !f.src.editable) return;
    f.src.list.splice(f.src.list.indexOf(f.s), 1);
    if (selId === id) selId = null;
    justRemoved = true;   // deleting counts as setting it down: the next tap away still keeps the drawer open
    elFor(id)?.remove();
    f.src.save();
  }

  function toFront(id) {
    const f = locate(id);
    if (!f) return;
    const list = f.src.list;
    const i = list.indexOf(f.s);
    if (i < list.length - 1) list.push(list.splice(i, 1)[0]);
    const e = elFor(id);
    if (e) el.append(e);
  }

  el.addEventListener('pointerdown', e => {
    if (!opts.active()) return;
    const sEl = e.target.closest('.stk.editable, .stk.movable');
    if (!sEl) return;
    e.stopPropagation();
    e.preventDefault();
    const id = sEl.dataset.id;
    const f = locate(id);
    if (!f) return;
    if (e.target.closest('.stk-del')) { remove(id); return; }
    select(id);
    const p = opts.clientToLayer(e.clientX, e.clientY);
    const c = opts.posToPx(f.s);
    if (e.target.closest('.stk-rot')) {
      g = { mode: 'xf', id, s: f.s, src: f.src, c, a0: Math.atan2(p.y - c.y, p.x - c.x), d0: Math.hypot(p.x - c.x, p.y - c.y) || 1, size0: f.s.size, rot0: f.s.rot || 0, moved: false };
    } else {
      g = { mode: 'move', id, s: f.s, src: f.src, off: { x: p.x - c.x, y: p.y - c.y }, moved: false };
    }
    try { sEl.setPointerCapture(e.pointerId); } catch (err) {}
  });

  el.addEventListener('pointermove', e => {
    if (!g) return;
    const s = g.s;
    const p = opts.clientToLayer(e.clientX, e.clientY);
    if (g.mode === 'move') {
      Object.assign(s, opts.pxToPos(p.x - g.off.x, p.y - g.off.y));
    } else {
      const a = Math.atan2(p.y - g.c.y, p.x - g.c.x);
      const d = Math.hypot(p.x - g.c.x, p.y - g.c.y);
      s.size = Math.round(clamp(g.size0 * d / g.d0, 20, 420));
      let rot = g.rot0 + (a - g.a0) * 180 / Math.PI;
      rot = ((rot + 540) % 360) - 180;
      if (Math.abs(rot) < 3) rot = 0;   // gentle snap to level
      s.rot = Math.round(rot);
    }
    g.moved = true;
    place(s);
  });

  const end = () => {
    if (!g) return;
    const { id, moved } = g;
    const f = { s: g.s, src: g.src };
    g = null;
    toFront(id);
    if (!moved) return;
    f.s.mt = Date.now();   // newest placement wins, whoever moved it
    if (f.src.editable) f.src.save();
    else if (f.src.movable && opts.moves) {
      const c = opts.posToPx(f.s);
      opts.moves.save(id, { ...opts.pxToPos(c.x, c.y), size: f.s.size, rot: f.s.rot || 0, mt: f.s.mt });
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return {
    render,
    add,
    busy: () => !!g,
    deselect: () => select(null),
    /** A tap on the page away from any sticker: puts the chosen sticker down. True if one was chosen. */
    tapAway() {
      if (!selId) {
        if (!justRemoved) return false;
        justRemoved = false;
        return true;
      }
      select(null);
      return true;
    },
    clientToLayer: (cx, cy) => opts.clientToLayer(cx, cy),
    setActive(on) {
      el.classList.toggle('active', !!on);
      if (!on) selId = null;
      render();   // stickers placed earlier become movable (or settle back) straight away
    },
  };
}

// Icon for the "decorate" buttons: a sticker peeling up at one corner.
export const STICKER_ICON = `<svg class="ico-sticker" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7 3h10a4 4 0 0 1 4 4v6.5L13.5 21H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z" fill="#FFC9DC" stroke="#9C4668" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M21 13.5h-4.5a3 3 0 0 0-3 3V21" fill="#FFF3F7" stroke="#9C4668" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M10 12.8c-2-1.3-2.9-2.3-2.6-3.3.3-1 1.7-1.3 2.6-.3.9-1 2.3-.7 2.6.3.3 1-.6 2-2.6 3.3z" fill="#F290B5"/>
</svg>`;

// ── Sticker drawer ────────────────────────────────────────────────────────
// A target is { rectEl, add(k, clientX?, clientY?), onClose(), note? }.

let target = null;
let cat = prefs.trayCat || 'cute';
let press = null;
let ghost = null;

function trayEl() { return document.getElementById('tray'); }

function itemHTML(k) {
  if (k === 'custom') return `<button type="button" class="tray-item custom" data-k="custom" aria-label="Write your own words">✏️<small>your own</small></button>`;
  if (k === 'upload') return `<button type="button" class="tray-item custom" data-k="upload" aria-label="Make a sticker from a photo">📷<small>add photo</small></button>`;
  const kind = stickerKind(k);
  return `<button type="button" class="tray-item ${kind === 'washi' || kind === 'word' ? 'wide' : ''}" data-k="${esc(k)}" data-kind="${kind}" aria-label="Add sticker">
    <span class="stk preview" data-kind="${kind}" style="--s:${kind === 'washi' ? 104 : kind === 'word' ? 56 : kind === 'emoji' ? 46 : 52}"><span class="stk-body">${stickerInner(k)}</span></span>
  </button>`;
}

function itemsFor(c) {
  return c.id === 'ours' ? ['upload', ...customKeys()] : c.items;
}

function build() {
  const el = trayEl();
  const c = CATEGORIES.find(x => x.id === cat) || CATEGORIES[1];
  el.innerHTML = `
    <div class="tray-head">
      <div class="tray-tabs" role="tablist">${CATEGORIES.map(x => `
        <button type="button" role="tab" data-cat="${x.id}" class="${x.id === c.id ? 'on' : ''}" aria-selected="${x.id === c.id}">${x.icon} ${x.label}</button>`).join('')}
      </div>
      <button type="button" class="btn small tray-done">Done</button>
    </div>
    ${target && target.note ? `<p class="tray-note">${esc(target.note)}</p>` : ''}
    <div class="tray-strip">${itemsFor(c).map(itemHTML).join('')}</div>
    <p class="tray-tip">${c.id === 'ours' ? 'make stickers from your photos · you can both use them' : 'tap or drag up to add · tap a sticker to move or resize · tap away to set it down, tap away again when you’re done'}</p>`;
}

async function addCustomWord() {
  const text = await promptSheet('Write your own sticker', { placeholder: 'e.g. you are my person', ok: 'Add sticker', maxlength: 40 });
  if (!text || !target) return;
  const color = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
  target.add(wordKey(text, color));
}

async function addPhotoSticker() {
  const file = await pickPhoto();
  if (!file || !target) return;
  try {
    const shape = await chooseShape(file);
    if (!shape || !target) return;
    const k = await addFromFile(file, shape);
    target.add(k);
    build();
    toast(shape === 'own' ? 'Sticker made — it kept its own shape ✨' : 'Photo sticker made ✨');
  } catch (e) {
    toast("Couldn't use that photo — try another one");
  }
}

function startGhost(k, x, y) {
  ghost = document.createElement('div');
  ghost.className = 'tray-ghost';
  ghost.innerHTML = `<span class="stk preview" data-kind="${stickerKind(k)}" style="--s:${defaultSize(k)}"><span class="stk-body">${stickerInner(k)}</span></span>`;
  document.body.append(ghost);
  moveGhost(x, y);
  vibrate(8);
}
function moveGhost(x, y) { if (ghost) ghost.style.transform = `translate(${x}px, ${y}px)`; }
function dropInside(x, y) {
  if (!target) return false;
  const r = target.rectEl.getBoundingClientRect();
  const t = trayEl().getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && y < t.top;
}

function wireTray() {
  const el = trayEl();
  el.addEventListener('click', e => {
    const tab = e.target.closest('[data-cat]');
    if (tab) { cat = tab.dataset.cat; setPref('trayCat', cat); build(); return; }
    if (e.target.closest('.tray-done')) tray.close();
  });
  el.addEventListener('pointerdown', e => {
    const it = e.target.closest('.tray-item');
    if (!it) return;
    press = { k: it.dataset.k, x: e.clientX, y: e.clientY, dragging: false };
  });
  window.addEventListener('pointermove', e => {
    if (!press) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.dragging) {
      if (press.k !== 'custom' && press.k !== 'upload' && dy < -10 && Math.abs(dy) > Math.abs(dx)) {
        press.dragging = true;
        startGhost(press.k, e.clientX, e.clientY);
      } else if (Math.abs(dx) > 10) {
        press = null;   // horizontal swipe = scrolling the drawer
      }
      return;
    }
    moveGhost(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', e => {
    if (!press) return;
    const p = press;
    press = null;
    if (p.dragging) {
      ghost?.remove();
      ghost = null;
      if (dropInside(e.clientX, e.clientY)) target.add(p.k, e.clientX, e.clientY);
      return;
    }
    if (!target) return;
    if (p.k === 'custom') addCustomWord();
    else if (p.k === 'upload') addPhotoSticker();
    else target.add(p.k);
  });
  window.addEventListener('pointercancel', () => {
    press = null;
    ghost?.remove();
    ghost = null;
  });
}

let wired = false;
export const tray = {
  open(t) {
    if (!wired) { wireTray(); wired = true; }
    if (target && target !== t) tray.close();
    target = t;
    build();
    trayEl().classList.add('open');
    const seen = prefs.decorHint || 0;   // how editing works, the first few times
    if (seen < 3) {
      setPref('decorHint', seen + 1);
      toast('Tap any sticker to move, resize or delete it ✨');
    }
    document.body.classList.add('tray-open');
  },
  close() {
    if (!target) return;
    const t = target;
    target = null;
    trayEl().classList.remove('open');
    document.body.classList.remove('tray-open');
    t.onClose && t.onClose();
  },
  get target() { return target; },
};

// Tapping the page while decorating: the first tap away sets the chosen
// sticker down, the next one finishes (closes the drawer). A gentle hint
// explains this the first few times.
export function tapAway(layer) {
  if (!target) return;
  if (layer.tapAway()) {
    const seen = prefs.tapAwayHint || 0;
    if (seen < 3) {
      setPref('tapAwayHint', seen + 1);
      toast('Sticker set down ✨ Tap away again when you\'re done');
    }
    return;
  }
  tray.close();
}
