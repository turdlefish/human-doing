// Little formatted text for notes and self-care bubbles: **bold**, "- " dot
// points and "1. " numbered points. It's saved as plain text with those marks,
// so older notes still read fine and nothing ever stores raw HTML.

import { esc } from './util.js';

const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const BULLET = /^\s*[-•]\s+(.*)$/;
const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;

// Saved text -> safe HTML (lines as <div>s, points as lists).
export function richHTML(md) {
  let out = '', list = null;
  const close = () => { if (list) { out += `</${list}>`; list = null; } };
  for (const line of String(md || '').split('\n')) {
    let m;
    if ((m = BULLET.exec(line))) {
      if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; }
      out += `<li>${inline(m[1]) || '<br>'}</li>`;
    } else if ((m = NUMBER.exec(line))) {
      if (list !== 'ol') { close(); out += m[1] === '1' ? '<ol>' : `<ol start="${+m[1]}">`; list = 'ol'; }
      out += `<li>${inline(m[2]) || '<br>'}</li>`;
    } else {
      close();
      out += `<div>${inline(line) || '<br>'}</div>`;
    }
  }
  close();
  return out;
}

// The words only (for "is it empty?" checks and labels).
export const plainText = md => String(md || '').split('\n')
  .map(l => l.replace(BULLET, '$1').replace(NUMBER, '$2').replace(/\*\*/g, '')).join(' ').replace(/\s+/g, ' ').trim();

const isBold = el => el.tagName === 'B' || el.tagName === 'STRONG' || (parseInt(el.style?.fontWeight, 10) || 0) >= 600;
const BLOCKS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'SECTION']);

// An edited box (contenteditable) -> saved text.
export function richFromEditor(root) {
  const lines = [];
  let runs = [], prefix = '';
  const text = (t, bold) => { if (t) runs.push({ t: t.replace(/ /g, ' ').replace(/\n/g, ' '), bold }); };
  const endLine = () => {
    let s = '';
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.bold === r.bold) last.t += r.t; else merged.push({ ...r });
    }
    for (const r of merged) {
      if (!r.bold || !r.t.trim()) { s += r.t; continue; }
      const [, lead, core, trail] = /^(\s*)(.*?)(\s*)$/s.exec(r.t);
      s += `${lead}**${core}**${trail}`;
    }
    lines.push(prefix + s.replace(/\s+$/, ''));
    runs = [];
    prefix = '';
  };
  const softEnd = () => { if (runs.length) endLine(); };   // a waiting point marker stays for the text to come
  function walk(node, bold) {
    for (const ch of node.childNodes) {
      if (ch.nodeType === Node.TEXT_NODE) { text(ch.nodeValue, bold); continue; }
      if (ch.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = ch.tagName;
      if (tag === 'BR') endLine();
      else if (ch.classList.contains('bionic')) text(ch.textContent, bold);   // reading aid, not formatting
      else if (tag === 'UL' || tag === 'OL') {
        softEnd();
        let i = Number(ch.getAttribute('start')) || 1;
        for (const li of ch.querySelectorAll(':scope > li, :scope > * > li')) {
          prefix = tag === 'UL' ? '- ' : `${i++}. `;
          walk(li, bold);
          softEnd();
          prefix = '';
        }
      } else if (tag === 'LI') {
        softEnd();
        prefix = '- ';
        walk(ch, bold);
        softEnd();
        prefix = '';
      } else if (BLOCKS.has(tag)) {
        softEnd();
        walk(ch, bold || isBold(ch));
        softEnd();
      } else walk(ch, bold || isBold(ch));
    }
  }
  walk(root, false);
  softEnd();
  return lines.filter(l => !/^\s*(-|\d+\.)\s*$/.test(l))   // empty points
    .join('\n').replace(/\n+$/, '').replace(/^\n+/, '');
}

// ── The little B / • / 1. bar ─────────────────────────────────────────────
export const FMT_ICONS = {
  bold: '<b class="fmt-b">B</b>',
  ul: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="5" cy="17" r="1.6"/><path d="M10 7h10M10 12h10M10 17h10"/></svg>',
  ol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5L5 4.6V10M3.6 14.6c.3-.7 1-1.1 1.7-.9.9.2 1.1 1.2.5 1.9L3.5 18.6h3M10 7h10M10 12h10M10 17h10"/></svg>',
};
const CMD = { bold: 'bold', ul: 'insertUnorderedList', ol: 'insertOrderedList' };
const LABEL = { bold: 'Bold', ul: 'Dot points', ol: 'Numbered points' };

export const fmtButtons = (keys = ['bold', 'ul', 'ol']) => keys.map(k =>
  `<button type="button" class="fmt-btn" data-fmt="${k}" aria-label="${LABEL[k]}" aria-pressed="false">${FMT_ICONS[k]}</button>`).join('');

/**
 * Makes `box` (contenteditable) and `bar` (its buttons; [data-fmt] ones are
 * handled here) work together. onChange(savedText) runs after every edit.
 * Tapping any button in the bar keeps the caret in the text. Returns
 * { busy() — true while a bar button is pressed (focus may blink away on
 * phones), stop() — unhooks everything }.
 */
export function wireRich(box, bar, onChange, { max = 0 } = {}) {
  let pressing = false, saved = null;
  const ac = new AbortController(), on = { signal: ac.signal };
  const emit = () => {
    const md = richFromEditor(box);
    box.classList.toggle('blank', !md);
    onChange(md);
  };
  const refresh = () => {
    if (!box.contains(document.getSelection()?.anchorNode)) return;
    bar.querySelectorAll('[data-fmt]').forEach(b => {
      let state = false;
      try { state = document.queryCommandState(CMD[b.dataset.fmt]); } catch (e) {}
      b.classList.toggle('on', state);
      b.setAttribute('aria-pressed', state);
    });
  };
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (sel && sel.rangeCount && box.contains(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
    refresh();
  }, on);

  bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }, on);
  bar.addEventListener('pointerdown', e => { if (e.target.closest('button')) pressing = true; }, on);
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    pressing = false;
    if (!b.dataset.fmt) return;
    if (document.activeElement !== box) {
      box.focus();
      if (saved) { const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(saved); }
    }
    try { document.execCommand('styleWithCSS', false, false); } catch (err) {}
    document.execCommand(CMD[b.dataset.fmt], false, null);
    emit();
    refresh();
  }, on);
  box.addEventListener('input', emit, on);
  // Pasted text comes in plain, so it can't bring odd styles along.
  box.addEventListener('paste', e => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
    document.execCommand('insertText', false, t);
  }, on);
  if (max) {
    box.addEventListener('beforeinput', e => {
      if (/^insert(Text|Paragraph|LineBreak|FromPaste)/.test(e.inputType) && richFromEditor(box).length >= max) e.preventDefault();
    }, on);
  }
  box.classList.toggle('blank', !richFromEditor(box));
  return {
    busy: () => pressing,
    stop: () => ac.abort(),
  };
}

// A notes box with its bar, for sheets.
export const richFieldHTML = (label, md, { placeholder = 'optional', name = 'note' } = {}) => `
  <div class="field rt-field"><span>${esc(label)}</span>
    <div class="rt-wrap">
      <div class="rt-bar" role="toolbar" aria-label="Text style">${fmtButtons()}</div>
      <div class="inp rt" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)}" data-name="${name}" data-ph="${esc(placeholder)}">${md ? richHTML(md) : ''}</div>
    </div>
  </div>`;
