// Bottom sheets, confirm/prompt dialogs, the colour swatch row and dragging ⋮⋮ to reorder.
import { COLORS, COLOR_KEYS, colorVars, esc } from './util.js';

export const firstEmoji = s => {
  if (!s) return '';
  if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter().segment(s)][0]?.segment || '';
  return Array.from(s)[0] || '';
};

/**
 * Drag ⋮⋮ to reorder, started from a pointerdown on a grip: `items` are the
 * rows in order and `item` the one picked up. Rows can be different heights.
 * The others slide out of the way as you drag; onDrop(from, to) when it's let
 * go somewhere else.
 */
export function dragSort(e, grip, items, item, onDrop) {
  e.preventDefault();
  const from = items.indexOf(item);
  if (from < 0) return;
  const tops = items.map(el => el.offsetTop), hs = items.map(el => el.offsetHeight);
  const gap = items.length > 1 ? Math.max(0, tops[1] - tops[0] - hs[0]) : 0;
  const size = hs[from] + gap;
  const startY = e.clientY;
  let to = from;
  item.classList.add('dragging');
  grip.setPointerCapture(e.pointerId);
  const move = ev => {
    const dy = ev.clientY - startY;
    const mid = tops[from] + hs[from] / 2 + dy;
    to = from;
    items.forEach((el, i) => {
      if (i > from && mid > tops[i] + hs[i] / 2) to = Math.max(to, i);
      if (i < from && mid < tops[i] + hs[i] / 2) to = Math.min(to, i);
    });
    item.style.transform = `translateY(${dy}px)`;
    items.forEach((el, i) => {
      if (el === item) return;
      const shift = from < to && i > from && i <= to ? -size : from > to && i < from && i >= to ? size : 0;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const end = () => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    items.forEach(el => { el.style.transform = ''; });
    item.classList.remove('dragging');
    if (to !== from) onDrop(from, to);
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

/** A list with one entry moved: [...list] with list[from] now at `to`. */
export const moved = (list, from, to) => { const out = [...list]; out.splice(to, 0, out.splice(from, 1)[0]); return out; };

export function openSheet({ title, body = '', onClose, className = '' }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      <header class="sheet-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="icon-btn sheet-x" aria-label="Close">✕</button>
      </header>
      <div class="sheet-body"></div>
    </div>`;
  const bodyEl = wrap.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.append(body);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));

  let closed = false;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 260);
    onClose && onClose();
  }
  // Ignore the tail of the tap that opened the sheet.
  const openedAt = Date.now();
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => { if (Date.now() - openedAt > 400) close(); });
  wrap.querySelector('.sheet-x').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  return { el: bodyEl, close };
}

export function confirmSheet(title, message, { ok = 'Yes', danger = false } = {}) {
  return new Promise(resolve => {
    let answer = false;
    const s = openSheet({
      title,
      body: `<p class="sheet-msg">${esc(message)}</p>
        <div class="sheet-actions">
          <button type="button" class="btn ghost" data-a="no">Cancel</button>
          <button type="button" class="btn ${danger ? 'danger' : ''}" data-a="yes">${esc(ok)}</button>
        </div>`,
      onClose: () => resolve(answer),
    });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      answer = b.dataset.a === 'yes';
      s.close();
    });
  });
}

// A question with a few answers: choices = [{ v, label, danger?, primary? }].
// Resolves to the chosen `v`, or null if the sheet is closed.
export function choiceSheet(title, message, choices) {
  return new Promise(resolve => {
    let answer = null;
    const s = openSheet({
      title,
      body: `<p class="sheet-msg">${esc(message)}</p>
        <div class="sheet-actions choice-actions">${choices.map(c => `
          <button type="button" class="btn ${c.primary ? '' : 'ghost'} ${c.danger ? (c.primary ? 'danger' : 'danger-text') : ''}" data-v="${esc(c.v)}">${esc(c.label)}</button>`).join('')}
        </div>`,
      onClose: () => resolve(answer),
    });
    s.el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      answer = b.dataset.v;
      s.close();
    });
  });
}

export function promptSheet(title, { value = '', placeholder = '', ok = 'Save', maxlength = 60 } = {}) {
  return new Promise(resolve => {
    let answer = null;
    const s = openSheet({
      title,
      body: `<form class="prompt-form">
          <input class="inp" name="v" maxlength="${maxlength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
          <div class="sheet-actions">
            <button type="button" class="btn ghost" data-a="no">Cancel</button>
            <button type="submit" class="btn">${esc(ok)}</button>
          </div>
        </form>`,
      onClose: () => resolve(answer),
    });
    const form = s.el.querySelector('form');
    const inp = form.querySelector('input');
    setTimeout(() => { inp.focus(); inp.select(); }, 280);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      answer = v;
      s.close();
    });
    form.querySelector('[data-a="no"]').addEventListener('click', () => s.close());
  });
}

export function swatchesHTML(selected) {
  return `<div class="swatches" role="radiogroup" aria-label="Colour">${COLOR_KEYS.map(k => `
    <button type="button" class="sw${k === selected ? ' on' : ''}" data-color="${k}" role="radio"
      aria-checked="${k === selected}" aria-label="${COLORS[k].name}" title="${COLORS[k].name}"
      style="${colorVars(k)}"></button>`).join('')}</div>`;
}

export function markSwatch(container, key) {
  container.querySelectorAll('.sw').forEach(b => {
    const on = b.dataset.color === key;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
}
