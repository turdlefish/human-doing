// App feedback: notes for making the app better (bugs, ideas, wishes) that
// either of you can add, edit and tick off once they're sorted. Shown on Us.
//
// Each of you keeps your own "feedback" document (you only ever write yours):
//   { items: [{ id, text, at, t, edited?, done, doneT }],   your notes (at = written, t = last edited)
//     marks: { <your person's note id>: { done, t } } }     their notes you ticked off or reopened
// A note is done or open by whichever of you changed it last (its doneT, or a mark's t).
//
// The person who makes the app can tick a note off too, from their feedback
// inbox (doing/tools/feedback-inbox.html), with an optional reply and the
// version it's in. That's a separate document only they write:
//   p:m:feedback = { notes: { <note id>: { done, at, reply?, in? } } }
// and it counts like any other tick: the newest change wins.

import * as store from './store.js';
import { copyText, dayKey, esc, fmtDay, toast, uid } from './util.js';
import { confirmSheet } from './ui.js';
import { canShare, shareText } from './native.js';

const APP = 'Human Doing';
const MAX = 1000;   // characters in a note

let el = null;
let editing = null;              // id of my note being edited
const drafts = { add: '' };      // text being typed, kept when the page redraws
let showDone = false;

const docOf = slot => {
  const d = store.read(store.keyFor(slot, 'feedback'), null) || {};
  return { items: Array.isArray(d.items) ? d.items : [], marks: d.marks || {} };
};
const makerMarks = () => (store.read(store.keyFor('m', 'feedback'), null) || {}).notes || {};
const nameOf = (p, fallback) => (p && p.name) || fallback;
const day = ms => fmtDay(dayKey(new Date(ms)), { day: 'numeric', month: 'short' });

/** Every note from both of you, with who wrote it and whether it's done. */
function notes() {
  const my = docOf(store.me()), their = docOf(store.partner());
  const myName = nameOf(store.readMine('profile', null), 'Me');
  const theirName = nameOf(store.readPartner('profile', null), 'Your person');
  const mk = makerMarks();
  // The newest of the writer's own tick, the other person's mark and the maker's wins.
  const state = (it, mark) => {
    let s = { done: !!it.done, when: it.doneT || 0, byMaker: false };
    if (mark && (mark.t || 0) > s.when) s = { done: !!mark.done, when: mark.t, byMaker: false };
    const m = mk[it.id];
    if (m && (m.at || 0) > s.when) s = { done: !!m.done, when: m.at, byMaker: !!m.done };
    return { ...s, maker: m || null };
  };
  return [
    ...my.items.map(it => ({ ...it, who: myName, mine: true, ...state(it, their.marks[it.id]) })),
    ...their.items.map(it => ({ ...it, who: theirName, mine: false, ...state(it, my.marks[it.id]) })),
  ];
}

function writeMine(change) {
  const d = docOf(store.me());
  change(d);
  // Forget marks on notes your person has since deleted.
  const theirs = new Set(docOf(store.partner()).items.map(it => it.id));
  for (const id of Object.keys(d.marks)) if (!theirs.has(id)) delete d.marks[id];
  store.writeMine('feedback', { items: d.items, marks: d.marks });
}

function itemHTML(n) {
  const meta = n.done
    ? (n.byMaker
      ? `${esc(n.who)} · <span class="fb-maker">✓ sorted by the person who makes ${APP}${n.maker.in ? ` (in ${esc(n.maker.in)})` : ''}</span> · ${esc(day(n.when))}`
      : `${esc(n.who)} · done ${esc(day(n.when))}`)
    : `${esc(n.who)} · ${esc(day(n.at))}${n.edited ? ' · edited' : ''}`;
  const reply = n.maker && n.maker.reply ? `<span class="fb-reply">💬 ${esc(n.maker.reply)}</span>` : '';
  if (editing === n.id && n.mine) {
    return `<li class="fb-item editing" data-fb="${esc(n.id)}">
      <textarea class="inp fb-edit" rows="3" maxlength="${MAX}" aria-label="Edit note">${esc(drafts[n.id] ?? n.text)}</textarea>
      <div class="fb-edit-row">
        <button type="button" class="btn small ghost" data-fb-act="cancel">Cancel</button>
        <button type="button" class="btn small" data-fb-act="save">Save</button>
      </div>
    </li>`;
  }
  return `<li class="fb-item${n.done ? ' done' : ''}" data-fb="${esc(n.id)}">
    <button type="button" class="fb-tick" data-fb-act="${n.done ? 'reopen' : 'done'}" aria-pressed="${n.done}"
      aria-label="${n.done ? 'Done — tap to reopen' : 'Mark as done'}" title="${n.done ? 'Reopen' : 'Mark as done'}">${n.done ? '✓' : ''}</button>
    <div class="fb-body"><p class="fb-text">${esc(n.text)}</p><span class="fb-meta">${meta}</span>${reply}</div>
    ${n.mine && !n.done ? `<button type="button" class="fb-icon" data-fb-act="edit" aria-label="Edit">✏️</button>` : ''}
    ${n.mine ? `<button type="button" class="fb-icon" data-fb-act="delete" aria-label="Delete">✕</button>` : ''}
  </li>`;
}

function render() {
  if (!el || !el.isConnected) return;
  const all = notes();
  const open = all.filter(n => !n.done).sort((a, b) => b.at - a.at);
  const done = all.filter(n => n.done).sort((a, b) => b.when - a.when);
  el.innerHTML = `
    <div class="card-tape"></div>
    <h3 class="card-title">💭 App feedback</h3>
    <p class="muted small fb-intro">Bugs, ideas and wishes for ${APP}. Either of you can add them, and tick them off once they're sorted. The person who makes ${APP} sees them too, and ticks them off when they're sorted.</p>
    <form class="fb-add">
      <textarea class="inp" name="fb" rows="2" maxlength="${MAX}" placeholder="e.g. A way to snooze the walk nudges" aria-label="New feedback">${esc(drafts.add)}</textarea>
      <button type="submit" class="btn small">Add</button>
    </form>
    ${open.length ? `<ul class="fb-list">${open.map(itemHTML).join('')}</ul>` : '<p class="muted small fb-none">Nothing open — lovely ✨</p>'}
    ${open.length ? `<div class="btn-row fb-share">
      <button type="button" class="btn ghost small" data-fb-act="copy">📋 Copy open feedback</button>
      ${canShare() ? '<button type="button" class="btn ghost small" data-fb-act="share">Share…</button>' : ''}
    </div>` : ''}
    ${done.length ? `<details class="more fb-done"${showDone ? ' open' : ''}><summary>Done (${done.length})</summary>
      <ul class="fb-list">${done.map(itemHTML).join('')}</ul></details>` : ''}`;
}

function openText() {
  const open = notes().filter(n => !n.done).sort((a, b) => a.at - b.at);
  return `${APP} feedback (${open.length} open, ${fmtDay(dayKey(), { day: 'numeric', month: 'short', year: 'numeric' })}):\n`
    + open.map(n => `• ${n.who}: ${n.text.replace(/\s*\n\s*/g, ' / ')}`).join('\n');
}

async function onClick(e) {
  const b = e.target.closest('[data-fb-act]');
  if (!b) return;
  const act = b.dataset.fbAct;
  const id = b.closest('[data-fb]')?.dataset.fb;
  const n = id ? notes().find(x => x.id === id) : null;
  const now = Date.now();
  if (act === 'done' || act === 'reopen') {
    if (!n) return;
    const done = act === 'done';
    writeMine(d => {
      if (n.mine) d.items = d.items.map(it => (it.id === id ? { ...it, done, doneT: now } : it));
      else d.marks[id] = { done, t: now };
    });
    if (done) toast('Ticked off ✨');
    render();
  } else if (act === 'edit') {
    editing = id;
    render();
    const ta = el.querySelector('.fb-edit');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  } else if (act === 'cancel') {
    delete drafts[editing];
    editing = null;
    render();
  } else if (act === 'save') {
    const text = (el.querySelector('.fb-edit')?.value || '').trim();
    if (!text) { toast('Write something first, or delete the note'); return; }
    writeMine(d => { d.items = d.items.map(it => (it.id === id ? { ...it, text, t: now, edited: true } : it)); });
    delete drafts[id];
    editing = null;
    render();
  } else if (act === 'delete') {
    if (!n) return;
    const ok = await confirmSheet('Delete this note?', n.text.length > 80 ? n.text.slice(0, 80) + '…' : n.text, { ok: 'Delete', danger: true });
    if (!ok) return;
    writeMine(d => { d.items = d.items.filter(it => it.id !== id); });
    if (editing === id) editing = null;
    render();
  } else if (act === 'copy') {
    const ok = await copyText(openText());
    toast(ok ? 'Open feedback copied 📋' : "Couldn't copy — try Share instead");
  } else if (act === 'share') {
    shareText(`${APP} feedback`, openText());
  }
}

function onSubmit(e) {
  if (!e.target.closest('.fb-add')) return;
  e.preventDefault();
  const ta = e.target.querySelector('textarea');
  const text = ta.value.trim();
  if (!text) { ta.focus(); return; }
  const now = Date.now();
  writeMine(d => { d.items.push({ id: uid(), text: text.slice(0, MAX), at: now, t: now, done: false, doneT: 0 }); });
  drafts.add = '';
  toast('Feedback added 💭');
  render();
}

function onInput(e) {
  if (e.target.name === 'fb') drafts.add = e.target.value;
  else if (e.target.classList.contains('fb-edit') && editing) drafts[editing] = e.target.value;
}

/** Draws the feedback card into `section` (the Us page calls this each time it redraws). */
export function mountFeedback(section) {
  el = section;
  render();
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', onInput);
  el.addEventListener('toggle', e => { if (e.target.classList?.contains('fb-done')) showDone = e.target.open; }, true);
}

// Notes from your person arrive: redraw, unless you're typing in the card.
store.on((k, source) => {
  if (source !== 'remote' || !/:feedback$/.test(k) || !el || !el.isConnected) return;
  if (el.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
  render();
});
