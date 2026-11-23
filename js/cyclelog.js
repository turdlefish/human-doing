// A day's cycle log, drawn the same on the Tracking card and the cycle page
// (so a tap on one shows on the other): the flow (none, spotting, light,
// medium or heavy; light to heavy is a period day), your symptoms (your main
// ones and "N more": see buttons.js), and the period support you pick for the
// day. Laid out like Human Being's check-in: a block per question with its
// title (and ✎ Edit by the buttons it edits), and once the card's ✓ Done, the
// same blocks read-only, showing just what you picked.

import * as store from './store.js';
import { dayKey, esc, keyToDate } from './util.js';
import { readDay, writeMyDay } from './docs.js';
import { FLOWS, supportItems, symptomItems } from './cycle.js';
import { foldedChips, titleRow } from './buttons.js';

/** "Today's log", or "Log for Tue, Oct 13". */
export const logTitle = day => (day === dayKey() ? 'Today\'s log'
  : `Log for ${keyToDate(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`);

const chip = (attr, set) => x => `<button type="button" class="chip${set.has(x.id) ? ' on' : ''}" ${attr}="${esc(x.id)}" aria-pressed="${set.has(x.id)}">${esc(x.emoji)} ${esc(x.label)}</button>`;

/** The flow, then your symptoms. v: the day's cycle entry. edit: ✎ Edit by the symptoms. */
export function logHTML(v, { edit = true } = {}) {
  const sym = new Set(v.symptoms || []);
  const flow = v.flow || '';
  return `${titleRow('🩸 Flow', '', { sub: true })}
    <div class="seg flow" role="group" aria-label="Flow">${FLOWS.map(([id, label]) => `<button type="button" data-flow="${id}" class="${flow === id ? 'on' : ''}" aria-pressed="${flow === id}">${label}</button>`).join('')}</div>
    ${titleRow('Symptoms', edit ? 'symptoms' : '', { sub: true })}
    <div class="chips sm">${foldedChips('symptoms', symptomItems(store.me()), chip('data-sym', sym), { on: x => sym.has(x.id) })}</div>`;
}

/** The period support to pick for the day. */
export function supportHTML(v) {
  const sup = new Set(v.support || []);
  return `<div class="chips sm">${foldedChips('support', supportItems(store.me()), chip('data-sup', sup), { on: x => sup.has(x.id) })}</div>`;
}

/** The log as a block: "Today's log", then the flow and your symptoms. */
export const logBlock = (v, day, { edit = true } = {}) =>
  `<section class="q-block cyc-block">${titleRow(esc(logTitle(day)))}${logHTML(v, { edit })}</section>`;

/** Period support as a block, with ✎ Edit. note: who sees it (HTML). extra: under the buttons. */
export const supportBlock = (v, { note = '', edit = true, extra = '' } = {}) =>
  `<section class="q-block cyc-block">${titleRow('Period support', edit ? 'support' : '', { note })}${supportHTML(v)}${extra}</section>`;

// ── Done: just what was picked, read-only ────────────────────────────────
const FLOW_WORD = { spotting: '💧 Spotting', light: '🩸 Period · light', medium: '🩸 Period · medium', heavy: '🩸 Period · heavy' };
const picked = (items, ids) => items.filter(x => (ids || []).includes(x.id)).map(x => `<span class="chip on">${esc(x.emoji)} ${esc(x.label)}</span>`);
const viewBlock = (label, chips, none) => `<section class="q-block cyc-view"><span class="rv-label">${label}</span>${
  chips.length ? `<div class="chips readonly">${chips.join('')}</div>` : `<p class="cyc-none">${none}</p>`}</section>`;

/** The day's log, read-only: the flow and the symptoms picked. */
export const logView = (v, day) => viewBlock(esc(logTitle(day)),
  [...(v.flow && FLOW_WORD[v.flow] ? [`<span class="chip on">${FLOW_WORD[v.flow]}</span>`] : []), ...picked(symptomItems(store.me()), v.symptoms)],
  'Nothing logged');

/** The period support picked, read-only. note: who sees it (HTML). */
export const supportView = (v, note = '') => viewBlock(`Period support${note ? ` <span class="q-note">${note}</span>` : ''}`,
  picked(supportItems(store.me()), v.support), 'None picked');

/**
 * A tap on a log for `day`: a flow (None, or the one chosen tapped again,
 * clears it), a symptom or some support. Saves it and returns true, or false
 * if it wasn't one.
 */
export function cycleTap(target, day) {
  const b = target.closest('[data-flow], [data-sym], [data-sup]');
  if (!b) return false;
  const d = b.dataset;
  const v = { ...(readDay(store.me(), day).cycle || {}) };
  if (d.flow !== undefined) {
    if (v.flow === d.flow || !d.flow) delete v.flow; else v.flow = d.flow;
  } else {
    const key = d.sym ? 'symptoms' : 'support', id = d.sym || d.sup;
    const set = new Set(v[key] || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    if (set.size) v[key] = [...set]; else delete v[key];
  }
  writeMyDay(day, 'cycle', Object.keys(v).length ? v : null);
  return true;
}
