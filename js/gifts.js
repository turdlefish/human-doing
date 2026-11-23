// Stickers you put on your person's pages ("gifts").
//
// Each partner only ever writes their own documents, so a sticker you place
// on your person's map or plan is saved in YOUR "gifts" document and shown on
// their page with a little "from you" note:
//   { map: [stickers], plan: { "<scheduleId>": [...], "<scheduleId>@YYYY-MM": [...] } }

import * as store from './store.js';
import { clone } from './util.js';

let mine = null;   // shared working copy, so the map and planner don't overwrite each other

store.on((k, source) => {
  if (source === 'remote' && store.getSession() && k === store.keyFor(store.me(), 'gifts')) mine = null;
});

export function myGifts() {
  if (!mine) mine = clone(store.readMine('gifts', {})) || {};
  return mine;
}
export function saveGifts() { store.writeMine('gifts', myGifts()); }
export const theirGifts = () => store.readPartner('gifts', {}) || {};

// Moving each other's stickers: you can't write your person's documents, so
// where you moved one of their stickers is kept in YOUR gifts document too,
//   { moved: { "<stickerId>": { ...position, size, rot, mt } } }
// and both phones show whichever placement is newest (mt).
export function allMoves() {
  const out = { ...(theirGifts().moved || {}) };
  for (const [id, m] of Object.entries(myGifts().moved || {})) {
    if (!out[id] || (m.mt || 0) > (out[id].mt || 0)) out[id] = m;
  }
  return out;
}
export function saveMove(id, placement) {
  const g = myGifts();
  g.moved = { ...(g.moved || {}), [id]: placement };
  saveGifts();
}
export const stickerMoves = { get: allMoves, save: saveMove };

// The sticker list for one page (created on first use).
export function giftList(gifts, area, key) {
  if (area === 'map') return gifts.map || (gifts.map = []);
  gifts.plan = gifts.plan || {};
  return gifts.plan[key] || (gifts.plan[key] = []);
}
