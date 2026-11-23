// Offline-first document store with partner sync.
//
// Human Doing uses Human Being's space code, slots and Supabase table, with
// its own prefix:
//
//   doing:<space>:p:<slot>:<doc>        (Human Being's rows are tend:<space>:…)
//
// <slot> is "a" (whoever started the space) or "b" (whoever joined). Each
// partner only ever writes their own rows, so the two of you can never
// overwrite each other. docs.js describes every document.
//
// Documents live in localStorage as { t: editedAt, d: data } and are pushed
// to the table; when pulling, the newer `t` wins.
//
// Keeping downloads small (Supabase's free plan allows 5 GB a month):
//   • One small query finds what changed: this space's rows whose updated_at
//     moved since the last check, per person. With nothing new the answer is
//     just "[]".
//   • Only changed documents come down, and of your person's only the ones
//     they share (PARTNER_READS). Their private documents never do.
//   • After a push, the server's updated_at for your rows is noted, so your
//     own edits never come back down.
//   • Checks every 60 s while the app is on screen. A full check (every row's
//     stamp, a few KB) runs at start-up and every 10 minutes, in case a phone
//     with a wrong clock wrote something the quick check would skip. Human
//     Being's documents shown here (photo stickers, check-ins) are looked at
//     only then, and come down only when they've changed.

import { CONFIG, apiBase } from './config.js';

const NS = 'doing';
const HB_NS = 'tend';   // Human Being: read, never written
const SESSION_KEY = 'doing:session';
const DIRTY_KEY = 'doing:dirty';
const SEEN_KEY = 'doing:seen';
const CURSOR_KEY = 'doing:cursor';
const DOC_PREFIX = 'doing:doc:';
const DOC = fk => DOC_PREFIX + fk;

// Your person's documents that this phone downloads (see docs.js).
const PARTNER_READS = /^(profile|help|shared(-\d{4}(-\d{2})?)?|todos|schedules|gifts|stickerbox|feedback|nudges)$/;
export const partnerReads = doc => PARTNER_READS.test(doc);
// Human Being documents shown here too (both of yours): your photo stickers,
// and your check-ins (the last few weeks, and a yearly archive from 2026 on),
// for the mood, sleep, tiredness, brain space and spoons month and year views.
export const hbCheckinDocs = () => {
  const out = ['checkins'];
  for (let y = 2026; y <= new Date().getFullYear(); y++) out.push('checkins-' + y);
  return out;
};
const hbReads = () => ['stickerbox', ...hbCheckinDocs()];

function lsGet(k) {
  try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
}
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
function lsHas(k) { try { return localStorage.getItem(k) != null; } catch (e) { return false; } }

let session = lsGet(SESSION_KEY);
let dirty = new Set(lsGet(DIRTY_KEY) || []);
let seen = lsGet(SEEN_KEY) || {};          // full key -> server updated_at of the copy we have
let cursor = lsGet(CURSOR_KEY) || {};      // slot -> newest updated_at seen for that person's rows
const listeners = new Set();
const statusListeners = new Set();
let status = { state: 'idle', at: 0, pending: dirty.size };
let flushTimer = null, pollTimer = null, flushing = null, pulling = null;
let lastFull = 0, lastPull = 0;

// What this session has sent and received (shown on the test server).
const stats = { requests: 0, down: 0, up: 0, docsDown: 0, lastCheck: null };
export const getStats = () => ({ ...stats });

// ── Session ───────────────────────────────────────────────────────────────
export const getSession = () => session;
export function setSession(s) { session = s; lsSet(SESSION_KEY, s); }

export function signOut() {
  try {
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(DOC_PREFIX) || [DIRTY_KEY, SEEN_KEY, CURSOR_KEY, SESSION_KEY].includes(k))) drop.push(k);
    }
    drop.forEach(lsDel);
  } catch (e) {}
  session = null;
  dirty = new Set();
  seen = {};
  cursor = {};
  stopSync();
}

export const me = () => session.slot;
export const partner = () => (session.slot === 'a' ? 'b' : 'a');
export const keyFor = (slot, doc) => `p:${slot}:${doc}`;
// Human Being's copy of a document: read with read(hbKey(slot, doc)).
export const hbKey = (slot, doc) => `hb:p:${slot}:${doc}`;

const full = (k, space = session.space) => (k.startsWith('hb:') ? `${HB_NS}:${space}:${k.slice(3)}` : `${NS}:${space}:${k}`);
function short(fk) {
  const hb = `${HB_NS}:${session.space}:`;
  return fk.startsWith(hb) ? 'hb:' + fk.slice(hb.length) : fk.slice(`${NS}:${session.space}:`.length);
}
// "doing:<space>:p:<slot>:<doc>" → slot / doc
const parts = fk => { const p = fk.split(':'); return { slot: p[3], doc: p.slice(4).join(':') }; };

// ── Reading & writing ─────────────────────────────────────────────────────
export function read(k, fallback) {
  const e = lsGet(DOC(full(k)));
  return e ? e.d : fallback;
}
// When a doc was last written (ms), on whichever phone wrote it.
export const stampOf = k => (lsGet(DOC(full(k))) || {}).t || 0;
export const readMine = (doc, fb) => read(keyFor(me(), doc), fb);
export const readPartner = (doc, fb) => read(keyFor(partner(), doc), fb);

export function write(k, data) {
  if (k.startsWith('hb:')) throw new Error("Human Being's documents are read-only here");
  const fk = full(k);
  lsSet(DOC(fk), { t: Date.now(), d: data });
  dirty.add(fk);
  lsSet(DIRTY_KEY, [...dirty]);
  emit(k, 'local');
  scheduleFlush();
}
export const writeMine = (doc, data) => write(keyFor(me(), doc), data);

/** The documents of one person on this phone: [{ doc, bytes, t }]. */
export function listDocs(slot) {
  const prefix = DOC(full(keyFor(slot, '')));
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = localStorage.getItem(k) || '';
      let t = 0;
      try { t = JSON.parse(raw).t || 0; } catch (e) {}
      out.push({ doc: k.slice(prefix.length), bytes: raw.length, t });
    }
  } catch (e) {}
  return out.sort((x, y) => x.doc.localeCompare(y.doc));
}

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(k, source) {
  listeners.forEach(fn => { try { fn(k, source); } catch (e) { console.error(e); } });
}

export function onStatus(fn) { statusListeners.add(fn); fn(status); return () => statusListeners.delete(fn); }
export const getStatus = () => status;
/** How many of my documents are waiting to be sent. */
export const pendingCount = () => dirty.size;
function setStatus(state) {
  status = { state, at: Date.now(), pending: dirty.size };
  statusListeners.forEach(fn => fn(status));
}

// ── Network ───────────────────────────────────────────────────────────────
function headers(extra = {}) {
  return { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, ...extra };
}
// Returns the parsed JSON reply (null when there's no body).
async function api(query, opts = {}) {
  stats.requests++;
  if (opts.body) stats.up += opts.body.length;
  const r = await fetch(apiBase() + '/rest/v1/' + CONFIG.table + query, { ...opts, headers: headers(opts.headers) });
  const text = await r.text().catch(() => '');
  stats.down += text.length;
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + text);
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}
const inList = fks => 'in.(' + fks.map(k => '"' + k + '"').join(',') + ')';
const quote = v => '"' + v + '"';   // PostgREST: values with : or . inside or=(…) need quotes

async function fetchDocs(fks) {
  const out = [];
  for (let i = 0; i < fks.length; i += 40) {   // keeps the address a sensible length
    const rows = await api('?select=key,value,updated_at&key=' + encodeURIComponent(inList(fks.slice(i, i + 40)))) || [];
    for (const row of rows) {
      let v = row.value;
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
      out.push({ key: row.key, updated_at: row.updated_at, entry: v });
    }
  }
  return out;
}

// Stamps of this space's rows: all of them, or only those newer than each person's cursor.
function fetchStamps(all) {
  const space = session.space;
  if (all) return api('?select=key,updated_at&key=' + encodeURIComponent(`like.${NS}:${space}:*`));
  const like = s => `key.like.${quote(`${NS}:${space}:p:${s}:*`)}`;
  const part = s => (cursor[s] ? `and(${like(s)},updated_at.gt.${quote(cursor[s])})` : like(s));
  return api('?select=key,updated_at&or=' + encodeURIComponent(`(${part('a')},${part('b')})`));
}
const hbKeys = () => ['a', 'b'].flatMap(s => hbReads().map(d => full(hbKey(s, d))));
const later = (x, y) => !y || Date.parse(x) > Date.parse(y);

/**
 * Pull whatever changed on the server since the last look. A full check runs
 * when asked, or when the last one was a while ago. Resolves true if the
 * server was reached.
 */
export function pull({ full: all = false, quick = false } = {}) {
  if (pulling) return all ? pulling.then(() => pull({ full: true })) : pulling;
  // quick: never the full check (the widgets' short background runs, so they stay small).
  pulling = doPull(!quick && (all || Date.now() - lastFull > CONFIG.fullCheckMs)).finally(() => { pulling = null; });
  return pulling;
}

async function doPull(all) {
  if (!session) return false;
  if (navigator.onLine === false) { setStatus('offline'); return false; }
  lastPull = Date.now();
  try {
    const [stamps, hbStamps] = await Promise.all([
      fetchStamps(all),
      all ? api('?select=key,updated_at&key=' + encodeURIComponent(inList(hbKeys()))) : null,
    ]);
    const next = { ...cursor };
    const want = [];
    for (const s of stamps || []) {
      const { slot, doc } = parts(s.key);
      if (slot !== 'a' && slot !== 'b') continue;
      if (later(s.updated_at, next[slot])) next[slot] = s.updated_at;
      if (slot !== session.slot && !PARTNER_READS.test(doc)) continue;   // theirs alone
      if (seen[s.key] !== s.updated_at || !lsHas(DOC(s.key))) want.push(s.key);
    }
    for (const s of hbStamps || []) {
      if (seen[s.key] !== s.updated_at || !lsHas(DOC(s.key))) want.push(s.key);
    }
    if (want.length) {
      const rows = await fetchDocs(want);
      stats.docsDown += rows.length;
      const changed = [];
      for (const row of rows) {
        seen[row.key] = row.updated_at;
        const e = row.entry;
        if (!e || typeof e.t !== 'number' || dirty.has(row.key)) continue;
        const local = lsGet(DOC(row.key));
        if (!local || e.t > local.t) {
          lsSet(DOC(row.key), e);
          changed.push(short(row.key));
        }
      }
      lsSet(SEEN_KEY, seen);
      changed.forEach(k => emit(k, 'remote'));
    }
    // Only move on once everything wanted has arrived.
    cursor = next;
    lsSet(CURSOR_KEY, cursor);
    if (all) lastFull = Date.now();
    stats.lastCheck = { at: Date.now(), full: all, rows: (stamps || []).length, docs: want.length };
    if (!dirty.size) setStatus('synced');
    return true;
  } catch (e) {
    console.warn('Human Doing: pull failed', e);
    setStatus(navigator.onLine === false ? 'offline' : 'error');
    return false;
  }
}

function scheduleFlush(ms = 700) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), ms);
  setStatus('saving');
}

// Push every locally-edited document in one upsert.
export async function flush({ keepalive = false } = {}) {
  if (!session || !dirty.size) return true;
  if (flushing) return flushing;
  if (navigator.onLine === false) { setStatus('offline'); return false; }
  const batch = [...dirty].map(fk => ({ fk, entry: lsGet(DOC(fk)) })).filter(x => x.entry);
  const now = new Date().toISOString();
  flushing = (async () => {
    try {
      // The reply is just each row's key and updated_at (about 100 bytes a row).
      const rows = await api('?select=key,updated_at', {
        method: 'POST',
        keepalive,
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch.map(x => ({ key: x.fk, value: JSON.stringify(x.entry), updated_at: now }))),
      });
      const stamped = new Map((Array.isArray(rows) ? rows : []).map(r => [r.key, r.updated_at]));
      for (const x of batch) {
        seen[x.fk] = stamped.get(x.fk) || now;   // our own copy: never download it again
        const cur = lsGet(DOC(x.fk));
        if (cur && cur.t === x.entry.t) dirty.delete(x.fk);   // edited again mid-flight? keep it dirty
      }
      lsSet(SEEN_KEY, seen);
      lsSet(DIRTY_KEY, [...dirty]);
      if (dirty.size) scheduleFlush(300); else setStatus('synced');
      return true;
    } catch (e) {
      console.warn('Human Doing: push failed', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      return false;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Starts syncing; resolves true once the first full check has reached the server. */
export function startSync() {
  stopSync();
  const first = pull({ full: true });
  first.then(() => flush());
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') { flush(); pull(); }
  }, CONFIG.pollMs);
  return first;
}
export function stopSync() { clearInterval(pollTimer); pollTimer = null; }
export const syncNow = () => flush().then(() => pull({ full: true }));

// The Android app's widgets may have run a hidden copy of the app while this
// one was out of sight (doing-android SyncJob): pick up what it sent and noted.
function rereadBookkeeping() {
  for (const k of lsGet(DIRTY_KEY) || []) dirty.add(k);
  seen = { ...seen, ...(lsGet(SEEN_KEY) || {}) };
  const saved = lsGet(CURSOR_KEY) || {};
  for (const [slot, at] of Object.entries(saved)) if (later(at, cursor[slot])) cursor[slot] = at;
}

document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.visibilityState === 'visible') {
    rereadBookkeeping();
    flush();
    if (Date.now() - lastPull > 15000) pull();   // coming back after a while: catch up now
  } else flush({ keepalive: true });
});
window.addEventListener('online', () => { if (session) { flush(); pull(); } });
window.addEventListener('offline', () => setStatus('offline'));

// ── Spaces ────────────────────────────────────────────────────────────────
const ADJ = ['sunny', 'cozy', 'fuzzy', 'sweet', 'misty', 'dreamy', 'peachy', 'minty', 'sleepy', 'bubbly',
  'snug', 'honey', 'velvet', 'starry', 'dewy', 'rosy', 'lucky', 'gentle', 'merry', 'breezy', 'cloudy',
  'golden', 'lilac', 'silky', 'twinkly', 'jolly', 'mellow', 'plushy', 'sparkly', 'tender'];
const NOUN = ['otter', 'bunny', 'panda', 'koala', 'fawn', 'duckling', 'kitten', 'puffin', 'hedgehog', 'lamb',
  'robin', 'seal', 'cub', 'sparrow', 'bee', 'fox', 'mochi', 'dumpling', 'teacup', 'petal', 'clover',
  'cloud', 'acorn', 'pebble', 'muffin', 'peach', 'plum', 'tulip', 'fern', 'moon'];

export function makeSpaceCode() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${ADJ[r[0] % ADJ.length]}-${NOUN[r[1] % NOUN.length]}-${1000 + (r[2] % 9000)}`;
}
export const normalizeCode = s => String(s || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// Who's already in a space? Returns { a?, b? } (Human Doing profiles) and
// hb: { a?, b? } (Human Being profiles, for couples who already use it).
export async function peekSpace(code) {
  const fks = ['a', 'b'].flatMap(s => [`${NS}:${code}:p:${s}:profile`, `${HB_NS}:${code}:p:${s}:profile`]);
  const rows = await fetchDocs(fks);
  const out = { hb: {} };
  rows.forEach(r => {
    const [ns, , , slot] = r.key.split(':');
    if (r.entry && r.entry.d) (ns === HB_NS ? out.hb : out)[slot] = r.entry.d;
  });
  return out;
}

export function exportMine() {
  const out = { app: 'human-doing', exported: new Date().toISOString(), space: session.space, slot: session.slot };
  listDocs(me()).forEach(({ doc }) => { out[doc] = readMine(doc, null); });
  return out;
}
