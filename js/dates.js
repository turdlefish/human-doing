// Date nights: a Tracking card and a page of their own. How long since each of
// you planned a date for the other, a timeline of your dates (a photo or two
// and a few words each), a reminder when it's been a while, and, when a month
// gets away from you, why and what you'll do for your person instead. Any plan
// can be a surprise: your person sees there's something (and when), not what.
//
// Each of you keeps your own documents (you only ever write yours):
//   dates         { items: [entry], extras: { <their entry id>: { note, photos, t } },
//                   remind: { on, weeks, since } }          your person's phone reads it
//   dates-secret  { <entry id>: { title?, note?, instead? } }   yours alone
// entry  { id, kind: 'date', on: 'YYYY-MM-DD', title, note, photos: [photo], secret?, at, t }
//        { id, kind: 'skip', month: 'YYYY-MM', reason, instead, secret?, at, t }
// photo  { id, w, h }: files in the date-photos storage bucket, <space>/<slot>/<id>.jpg
//        and <id>_t.jpg (a small copy for the timeline), like Property Inspect's.
// extras: your few words and photos on a date your person planned.
//
// A surprise keeps a date's title and note (or, for a skipped month, what you'll
// do instead) in dates-secret until you reveal it. That hides it in the app; it
// isn't locked away like a password would be.

import * as store from './store.js';
import { CONFIG, apiBase } from './config.js';
import { colorVars, dayKey, esc, fmtDay, keyToDate, shiftDay, toast, uid, vibrate } from './util.js';
import { confirmSheet, openSheet } from './ui.js';
import { avatarHTML } from './avatars.js';
import { bridge } from './native.js';
import { stickerSrc } from './stickers.js';

const DOC = 'dates', SECRET = 'dates-secret';
const BUCKET = 'date-photos';
const WEEKS = [2, 3, 4, 6, 8];
const REMIND = { on: true, weeks: 4 };

// ── Reading ───────────────────────────────────────────────────────────────
const me = () => store.me();
const partner = () => store.partner();
const profileOf = slot => (slot === me() ? store.readMine('profile', {}) : store.readPartner('profile', null)) || {};
const nameOf = slot => profileOf(slot).name || (slot === me() ? 'You' : 'Your person');
const theirName = () => profileOf(partner()).name || 'your person';

function docOf(slot) {
  const d = (slot === me() ? store.readMine(DOC, null) : store.readPartner(DOC, null)) || {};
  return {
    items: Array.isArray(d.items) ? d.items.filter(e => e && e.id && (e.kind === 'date' || e.kind === 'skip')) : [],
    extras: d.extras && typeof d.extras === 'object' ? { ...d.extras } : {},
    remind: { ...REMIND, ...(d.remind || {}) },
  };
}
const secrets = () => store.readMine(SECRET, null) || {};

function writeMine(change) {
  const d = docOf(me());
  change(d);
  // Your words on dates your person has since deleted go too (once their list is here).
  if (store.readPartner(DOC, null)) {
    const theirs = new Set(docOf(partner()).items.map(e => e.id));
    for (const id of Object.keys(d.extras)) if (!theirs.has(id)) delete d.extras[id];
  }
  store.writeMine(DOC, { items: d.items, extras: d.extras, remind: d.remind });
  planReminder();
}
function writeSecret(id, v) {
  const s = { ...secrets() };
  if (v) s[id] = v; else delete s[id];
  store.writeMine(SECRET, s);
}

const lastDayOf = ym => { const [y, m] = ym.split('-').map(Number); return dayKey(new Date(y, m, 0)); };
const firstOfNext = ym => shiftDay(lastDayOf(ym), 1);
const daysBetween = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);
const monthName = ym => keyToDate(ym + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const whenOf = e => (e.kind === 'date' ? e.on : lastDayOf(e.month));

/** Every entry from both of you, with who planned it. */
function allEntries() {
  const out = [];
  for (const slot of [me(), partner()]) for (const e of docOf(slot).items) out.push({ ...e, by: slot, mine: slot === me() });
  return out;
}

/** Where someone's at: their next date, their last one (and how long ago), and this month's skip. */
function statusOf(slot) {
  const today = dayKey();
  const items = docOf(slot).items;
  const dates = items.filter(e => e.kind === 'date' && e.on).sort((a, b) => a.on.localeCompare(b.on));
  const next = dates.find(e => e.on >= today) || null;
  const last = [...dates].reverse().find(e => e.on < today) || null;
  const skip = items.find(e => e.kind === 'skip' && e.month === today.slice(0, 7)) || null;
  return { next, last, days: last ? daysBetween(last.on, today) : null, skip };
}

function ago(n) {
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 63) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30.4)} months ago`;
}
function soon(k) {
  const n = daysBetween(dayKey(), k);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 7) return 'on ' + fmtDay(k, { weekday: 'long' });
  return 'on ' + fmtDay(k, { weekday: 'short', day: 'numeric', month: 'short' });
}
const nice = k => fmtDay(k, { weekday: 'short', day: 'numeric', month: 'short', year: k.slice(0, 4) === dayKey().slice(0, 4) ? undefined : 'numeric' });

// ── The reminder ──────────────────────────────────────────────────────────
// When it's been `weeks` since you last planned a date for your person (one
// coming up counts; so does a skipped month, until the next one). Shown on
// the card, and the Android app sends a notification on the day at 10am, then
// weekly until you plan one.
function remindNow() {
  const d = docOf(me());
  if (!d.remind.on) return null;
  const st = statusOf(me());
  if (st.next) return null;
  const today = dayKey();
  const base = st.last ? st.last.on : (d.remind.since || today);
  let due = shiftDay(base, d.remind.weeks * 7);
  if (st.skip && due < firstOfNext(st.skip.month)) due = firstOfNext(st.skip.month);
  // How long it really has been (since your last date, or since you started counting).
  const gone = Math.max(1, Math.floor(daysBetween(base, today) / 7));
  return { due, overdue: due <= today, weeks: d.remind.weeks, skipped: !!st.skip, gone, hadOne: !!st.last };
}

/** Tells the Android app when to remind you (or that there's nothing to). */
export function planReminder() {
  if (!store.getSession()) return;
  const d = docOf(me());
  // The count starts from your first look, if you've no dates yet.
  if (d.remind.on && !d.remind.since && !d.items.length && store.readMine(DOC, null) === null) {
    store.writeMine(DOC, { items: [], extras: {}, remind: { ...d.remind, since: dayKey() } });
  }
  if (!bridge || !bridge.setDateReminder) return;
  const r = remindNow();
  if (!r) { bridge.setDateReminder(''); return; }
  const at = keyToDate(r.due);
  at.setHours(10, 0, 0, 0);
  let t = at.getTime();
  if (t < Date.now() + 60e3) {   // already due: the next 10am
    const n = new Date();
    if (n.getHours() >= 10) n.setDate(n.getDate() + 1);
    n.setHours(10, 0, 0, 0);
    t = n.getTime();
  }
  bridge.setDateReminder(JSON.stringify({
    at: t,
    title: `A date night for ${theirName()}? 💞`,
    text: `${r.hadOne ? `It's been ${r.overdue ? r.gone : r.weeks} weeks since your last one. ` : ''}Plan something, or note what you'll do instead.`,
  }));
}

// ── Photos (the date-photos bucket) ──────────────────────────────────────
const space = () => store.getSession().space;
const pathOf = (slot, id, thumb, sp = space()) => `${sp}/${slot}/${id}${thumb ? '_t' : ''}.jpg`;
const photoUrl = (slot, id, thumb) => `${apiBase()}/storage/v1/object/public/${BUCKET}/${pathOf(slot, id, thumb)}`;
// The storage only takes (and lists) a space's files when the request names it (x-space).
const head = (sp, extra = {}) => ({ apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'x-space': sp, ...extra });

async function shrink(file, max, quality = 0.82) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
    const url = URL.createObjectURL(file);
    img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Could not read that image')); i.src = url; });
  }
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('Could not read that image'))), 'image/jpeg', quality));
  return { blob, w, h };
}
async function upload(path, blob, sp = space()) {
  const r = await fetch(`${apiBase()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: head(sp, { 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '31536000' }),
    body: blob,
  });
  if (!r.ok) throw new Error(/bucket not found/i.test(await r.text().catch(() => '')) ? 'NO_BUCKET' : 'Upload failed (' + r.status + ')');
}
/** Shrinks and uploads a photo of yours; returns its record. */
async function addPhoto(file) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const big = await shrink(file, 1600);
  const small = await shrink(file, 480, 0.78);
  await upload(pathOf(me(), id), big.blob);
  await upload(pathOf(me(), id, true), small.blob);
  return { id, w: big.w, h: big.h };
}
function deletePhotoFiles(ids) {
  if (!ids.length) return;
  fetch(`${apiBase()}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: head(space(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: ids.flatMap(id => [pathOf(me(), id), pathOf(me(), id, true)]) }),
  }).catch(() => {});
}
const pickPhoto = () => new Promise(resolve => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.addEventListener('change', () => resolve(inp.files && inp.files[0] || null), { once: true });
  inp.click();
});

/**
 * After a move to a new space code (spacemove.js): copies both of your date
 * photos into the new code's folders. Ones already there are skipped; the
 * old files stay until the old space is removed.
 */
export async function copyDatePhotos(from, to) {
  const pub = (sp, path) => `${apiBase()}/storage/v1/object/public/${BUCKET}/${sp}/${path}`;
  for (const slot of ['a', 'b']) {
    const d = (slot === me() ? store.readMine(DOC, null) : store.readPartner(DOC, null)) || {};
    const photos = [...(d.items || []).flatMap(e => e.photos || []), ...Object.values(d.extras || {}).flatMap(x => x.photos || [])];
    for (const p of photos) {
      for (const f of [`${p.id}.jpg`, `${p.id}_t.jpg`]) {
        const there = await fetch(pub(to, `${slot}/${f}`), { method: 'HEAD' }).catch(() => null);
        if (there && there.ok) continue;
        const got = await fetch(pub(from, `${slot}/${f}`)).catch(() => null);
        if (!got || !got.ok) continue;
        await upload(`${to}/${slot}/${f}`, await got.blob(), to);
      }
    }
  }
}

// ── The Tracking card ─────────────────────────────────────────────────────
function personLine(slot) {
  const st = statusOf(slot);
  const p = profileOf(slot);
  const mine = slot === me();
  const who = mine ? 'You' : esc(nameOf(slot));
  let what;
  if (st.next) {
    const hidden = st.next.secret && !mine;
    const title = hidden ? '🎁 a surprise' : esc((st.next.secret ? (secrets()[st.next.id] || {}).title : st.next.title) || 'a date');
    what = `${title}, ${esc(soon(st.next.on))}`;
  } else if (st.skip) {
    what = `couldn't plan one this month${st.skip.secret ? ' · 🎁 a surprise instead' : ''}`;
  } else if (st.last) {
    what = `last planned one ${esc(ago(st.days))}`;
  } else {
    what = mine ? "haven't planned one here yet" : "hasn't planned one here yet";
  }
  return `<div class="dt-who" style="${colorVars(p.color || 'pink')}"><span class="avatar">${avatarHTML(p)}</span>
    <div><b>${who}</b><span>${what}</span></div>${st.next ? '<span class="dt-tag">✓ planned</span>' : ''}</div>`;
}

function remindLine() {
  const r = remindNow();
  if (!r) return '';
  if (r.overdue) {
    const long = r.hadOne ? `It's been ${r.gone} week${r.gone === 1 ? '' : 's'} since your last one: time` : 'Time';
    return `<div class="dt-due">💞 ${long} to plan a date for ${esc(theirName())}${r.skipped ? '' : ', or note what you\'ll do instead'}.</div>`;
  }
  return `<div class="dt-next">⏰ I'll remind you ${esc(soon(r.due))}${bridge && bridge.setDateReminder ? '' : ' (the Android app sends a notification)'}</div>`;
}

function lastTogether() {
  const today = dayKey();
  const past = allEntries().filter(e => e.kind === 'date' && e.on && e.on < today).sort((a, b) => b.on.localeCompare(a.on))[0];
  if (!past) return '';
  const title = past.secret && !past.mine ? 'a surprise date' : (past.secret ? (secrets()[past.id] || {}).title : past.title) || 'a date night';
  return `<p class="dt-last">Your last date night: <b>${esc(title)}</b>, ${esc(ago(daysBetween(past.on, today)))}</p>`;
}

/** The card's insides (track.js wraps it; the page shows it too, without the link to itself). */
export function datesCardHTML(ctx, onPage = false) {
  if (ctx && ctx.preview) {
    return `<div class="dt-who" style="${colorVars('lavender')}"><span class="avatar">🌙</span><div><b>You</b><span>last planned one 3 weeks ago</span></div></div>
      <div class="dt-who" style="${colorVars('sky')}"><span class="avatar">☀️</span><div><b>Sam</b><span>🎁 a surprise, on Saturday</span></div><span class="dt-tag">✓ planned</span></div>
      <p class="dt-last">Your last date night: <b>Sushi and a movie</b>, 3 weeks ago</p>
      <div class="dt-next">⏰ I'll remind you on Tuesday</div>`;
  }
  return `${personLine(me())}${store.readPartner('profile', null) ? personLine(partner()) : ''}
    ${lastTogether()}
    ${remindLine()}
    <div class="btn-row dt-btns">
      <button type="button" class="btn small" data-dt="plan">＋ Plan a date</button>
      <button type="button" class="btn small ghost" data-dt="skip">Can't this month</button>
    </div>
    ${onPage ? '' : '<button type="button" class="open-link" data-dt="page">📖 Your dates, photos and reminder ›</button>'}`;
}

// ── The page: your dates as a timeline ────────────────────────────────────
function photosHTML(slot, photos) {
  if (!photos || !photos.length) return '';
  return `<div class="dt-photos${photos.length === 1 ? ' one' : ''}">${photos.map(p => `
    <button type="button" class="dt-ph" data-dt="photo" data-slot="${slot}" data-ph="${esc(p.id)}" aria-label="See the photo">
      <img src="${esc(photoUrl(slot, p.id, true))}" alt="" loading="lazy" draggable="false"></button>`).join('')}</div>`;
}

function entryHTML(e) {
  const other = e.by === me() ? partner() : me();
  const p = profileOf(e.by);
  const who = e.mine ? 'You' : esc(nameOf(e.by));
  const hidden = e.secret && !e.mine;
  const sec = e.mine && e.secret ? (secrets()[e.id] || {}) : {};
  const extra = docOf(other).extras[e.id];
  const today = dayKey();
  let head, body = '', acts = '';
  if (e.kind === 'date') {
    const coming = e.on >= today;
    const title = hidden ? `🎁 ${who} planned a surprise` : esc((e.secret ? sec.title : e.title) || 'Date night');
    const note = hidden ? '' : (e.secret ? sec.note : e.note) || '';
    head = `<span class="dt-when">${esc(nice(e.on))}${coming ? ` · ${esc(soon(e.on))}` : ''}</span><b class="dt-title">${title}</b>
      <span class="dt-by">${hidden ? `${who} knows what it is` : `planned by ${who}`}${e.mine && e.secret ? ` · 🔒 a surprise: ${esc(theirName())} sees there's a date, not what` : ''}</span>`;
    body = `${note ? `<p class="dt-note">${esc(note)}</p>` : ''}${e.secret ? '' : photosHTML(e.by, e.photos)}
      ${extra && (extra.note || (extra.photos || []).length) ? `<div class="dt-extra"><span class="dt-by">${other === me() ? 'You' : esc(nameOf(other))}:</span>
        ${extra.note ? `<p class="dt-note">${esc(extra.note)}</p>` : ''}${photosHTML(other, extra.photos)}</div>` : ''}`;
    if (e.mine) {
      acts = `<button type="button" class="chip" data-dt="edit" data-id="${esc(e.id)}">✎ Edit</button>
        ${e.secret ? `<button type="button" class="chip" data-dt="reveal" data-id="${esc(e.id)}">🎁 Reveal it</button>`
          : `<button type="button" class="chip" data-dt="add-photo" data-id="${esc(e.id)}">📷 Add a photo</button>`}`;
    } else if (!hidden) {
      acts = `<button type="button" class="chip" data-dt="extra" data-id="${esc(e.id)}">💬 ${extra && extra.note ? 'Edit your words' : 'Add your words'}</button>
        <button type="button" class="chip" data-dt="extra-photo" data-id="${esc(e.id)}">📷 Add a photo</button>`;
    }
  } else {
    const instead = hidden ? '' : e.secret ? sec.instead : e.instead;
    head = `<span class="dt-when">${esc(monthName(e.month))}</span>
      <b class="dt-title">${e.mine ? 'You' : who} couldn't plan a date this month</b>`;
    body = `${e.reason ? `<p class="dt-note"><span class="dt-k">Why:</span> ${esc(e.reason)}</p>` : ''}
      ${hidden ? `<p class="dt-surprise">🎁 ${who} has a surprise for you instead. No peeking.</p>`
        : instead ? `<p class="dt-note"><span class="dt-k">Instead:</span> ${esc(instead)}${e.mine && e.secret ? ` <span class="dt-by">· 🔒 a surprise for ${esc(theirName())}</span>` : ''}</p>` : ''}`;
    if (e.mine) {
      acts = `<button type="button" class="chip" data-dt="edit" data-id="${esc(e.id)}">✎ Edit</button>
        ${e.secret ? `<button type="button" class="chip" data-dt="reveal" data-id="${esc(e.id)}">🎁 Reveal it</button>` : ''}`;
    }
  }
  return `<article class="dt-entry${e.kind === 'skip' ? ' skip' : ''}${hidden ? ' hidden' : ''}" style="${colorVars(p.color || 'pink')}">
    ${head}${body}${acts ? `<div class="dt-acts">${acts}</div>` : ''}</article>`;
}

function timelineHTML() {
  const today = dayKey();
  const all = allEntries().sort((a, b) => whenOf(b).localeCompare(whenOf(a)) || (b.at || 0) - (a.at || 0));
  if (!all.length) {
    return `<p class="muted dt-empty">No dates here yet. Plan one, or add one you've had, and it starts your timeline 💞</p>`;
  }
  const coming = all.filter(e => e.kind === 'date' && e.on >= today).reverse();
  const past = all.filter(e => !(e.kind === 'date' && e.on >= today));
  let html = coming.length ? `<h3 class="dt-month">Coming up</h3>${coming.map(entryHTML).join('')}` : '';
  let month = '';
  for (const e of past) {
    const m = whenOf(e).slice(0, 7);
    if (m !== month) { month = m; html += `<h3 class="dt-month">${esc(monthName(m))}</h3>`; }
    html += entryHTML(e);
  }
  return html;
}

export function createDatesPage(el, { onBack }) {
  function render() {
    const r = docOf(me()).remind;
    el.innerHTML = `
      <div class="sub-head"><button type="button" class="icon-btn" data-dt="back" aria-label="Back">‹</button><h1>Date nights</h1></div>
      <section class="card tk tk-dates" style="${colorVars('pink')}">
        <div class="card-tape"></div>
        ${datesCardHTML({}, true)}
        <div class="dt-remind">
          <div class="share-row"><span>⏰ Remind me to plan one<small>${r.on ? `when it's been ${r.weeks} weeks since my last${isAndroid() ? ', with a notification' : ' (the Android app sends a notification)'}` : 'off'}</small></span>
            <button type="button" class="tgl${r.on ? ' on' : ''}" data-dt="remind-on" role="switch" aria-checked="${r.on}" aria-label="Remind me"></button></div>
          ${r.on ? `<div class="seg wide dt-weeks">${WEEKS.map(w => `<button type="button" data-dt="weeks" data-w="${w}" class="${r.weeks === w ? 'on' : ''}">${w} weeks</button>`).join('')}</div>` : ''}
        </div>
      </section>
      <div class="dt-timeline">${timelineHTML()}</div>`;
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-dt]');
    if (!b) return;
    if (b.dataset.dt === 'back') { onBack(); return; }
    onDatesAction(b, { refresh: render });
  });
  // Your person's dates (or your other phone's changes) arrive.
  store.on((k, source) => {
    if (source === 'remote' && /:(dates|dates-secret|profile)$/.test(k) && el.offsetParent) render();
  });
  return { render };
}
const isAndroid = () => !!(bridge && bridge.setDateReminder);

// ── Actions (from the card and the page) ──────────────────────────────────
/** A tap on a [data-dt] button. refresh: redraw whatever's showing; openPage: the dates page. */
export function onDatesAction(b, { refresh = () => {}, openPage = () => {} } = {}) {
  const act = b.dataset.dt;
  const id = b.dataset.id;
  if (act === 'page') return openPage();
  if (act === 'plan') return editDate(null, refresh);
  if (act === 'skip') return editSkip(null, refresh);
  if (act === 'edit') {
    const e = docOf(me()).items.find(x => x.id === id);
    if (e) (e.kind === 'date' ? editDate : editSkip)(e, refresh);
    return;
  }
  if (act === 'reveal') return reveal(id, refresh);
  if (act === 'add-photo') return addPhotoTo(id, false, refresh);
  if (act === 'extra-photo') return addPhotoTo(id, true, refresh);
  if (act === 'extra') return editExtra(id, refresh);
  if (act === 'photo') return showPhoto(b.dataset.slot, b.dataset.ph);
  if (act === 'remind-on' || act === 'weeks') {
    writeMine(d => {
      if (act === 'remind-on') d.remind.on = !d.remind.on;
      else d.remind.weeks = Number(b.dataset.w) || 4;
      if (!d.remind.since) d.remind.since = dayKey();
    });
    refresh();
  }
}

const nextSaturday = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return dayKey(d); };
const secretRow = (on, what) => `<div class="share-row dt-secret"><span>🎁 Keep it a surprise<small>${esc(theirName())} sees ${what}, not what it is. You can reveal it later.</small></span>
  <button type="button" class="tgl${on ? ' on' : ''}" data-secret role="switch" aria-checked="${!!on}" aria-label="Keep it a surprise"></button></div>`;

function editDate(e, refresh) {
  const sec = e && e.secret ? (secrets()[e.id] || {}) : {};
  const v = { on: e ? e.on : nextSaturday(), title: e ? (e.secret ? sec.title : e.title) || '' : '', note: e ? (e.secret ? sec.note : e.note) || '' : '', secret: !!(e && e.secret) };
  const photos = e ? [...(e.photos || [])] : [];
  const sheet = openSheet({
    title: e ? 'Your date' : 'Plan a date 💞',
    className: 'dt-sheet',
    body: `
      <label class="field"><span>When</span><input class="inp" type="date" name="on" value="${esc(v.on)}"></label>
      <label class="field"><span>What's the plan?</span><input class="inp" name="title" maxlength="80" value="${esc(v.title)}" placeholder="e.g. A picnic at the beach, then gelato" autocomplete="off"></label>
      <label class="field"><span>How did it go? <small class="field-hint">· for after, or a note for now</small></span>
        <textarea class="inp" name="note" rows="3" maxlength="600" placeholder="A few words to remember it by">${esc(v.note)}</textarea></label>
      ${secretRow(v.secret, 'you\'ve planned something for that day')}
      ${photos.length ? `<div class="field"><span>Photos <small class="field-hint">· ✕ to take one off</small></span><div class="dt-photos edit">${photos.map(p => `
        <span class="dt-ph"><img src="${esc(photoUrl(me(), p.id, true))}" alt=""><button type="button" class="row-x" data-rm="${esc(p.id)}" aria-label="Take this photo off">✕</button></span>`).join('')}</div></div>` : ''}
      <p class="muted small">${v.secret ? 'Photos can go on once it\'s not a surprise any more.' : 'Add photos from your timeline (📷 under the date).'}</p>
      <div class="sheet-actions">
        ${e ? '<button type="button" class="btn ghost danger-text" data-a="delete">Delete</button>' : ''}
        <button type="button" class="btn" data-a="save">${e ? 'Save' : 'Add it'}</button>
      </div>`,
  });
  const el = sheet.el;
  const removed = [];
  el.addEventListener('click', async ev => {
    const t = ev.target;
    if (t.closest('[data-secret]')) {
      v.secret = !v.secret;
      const g = t.closest('[data-secret]');
      g.classList.toggle('on', v.secret);
      g.setAttribute('aria-checked', v.secret);
      return;
    }
    const rm = t.closest('[data-rm]');
    if (rm) {
      const i = photos.findIndex(p => p.id === rm.dataset.rm);
      if (i >= 0) removed.push(...photos.splice(i, 1).map(p => p.id));
      rm.closest('.dt-ph').remove();
      return;
    }
    const a = t.closest('[data-a]')?.dataset.a;
    if (a === 'delete') {
      if (!(await confirmSheet('Delete this date?', 'It comes off your timeline, with its photos.', { ok: 'Delete', danger: true }))) return;
      writeMine(d => { d.items = d.items.filter(x => x.id !== e.id); });
      writeSecret(e.id, null);
      deletePhotoFiles((e.photos || []).map(p => p.id));
      sheet.close();
      refresh();
      return;
    }
    if (a === 'save') {
      const on = el.querySelector('[name=on]').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) { toast('Pick a day for it'); return; }
      const title = el.querySelector('[name=title]').value.trim();
      const note = el.querySelector('[name=note]').value.trim();
      const now = Date.now();
      const entry = { id: e ? e.id : uid(), kind: 'date', on, at: e ? e.at : now, t: now,
        ...(v.secret ? { title: '', note: '', photos: [], secret: true } : { title, note, photos, secret: false }) };
      writeMine(d => {
        const i = d.items.findIndex(x => x.id === entry.id);
        if (i >= 0) d.items[i] = entry; else d.items.push(entry);
      });
      writeSecret(entry.id, v.secret ? { title, note } : null);
      if (v.secret && photos.length) deletePhotoFiles(photos.map(p => p.id));
      deletePhotoFiles(removed);
      vibrate(10);
      toast(e ? 'Saved 💞' : on >= dayKey() ? `Planned ${soon(on)} 💞` : 'Added to your timeline 💞');
      sheet.close();
      refresh();
    }
  });
}

function editSkip(e, refresh) {
  const today = dayKey();
  const months = [today.slice(0, 7), shiftDay(today.slice(0, 7) + '-01', -1).slice(0, 7)];
  const sec = e && e.secret ? (secrets()[e.id] || {}) : {};
  const v = { month: e ? e.month : months[0], reason: e ? e.reason || '' : '', instead: e ? (e.secret ? sec.instead : e.instead) || '' : '', secret: !!(e && e.secret) };
  if (!months.includes(v.month)) months.unshift(v.month);
  const sheet = openSheet({
    title: e ? 'This month' : "Can't plan a date this month",
    className: 'dt-sheet',
    body: `
      <div class="field"><span>Which month</span><div class="seg wide" data-group="month">${months.map(m => `<button type="button" data-v="${m}" class="${m === v.month ? 'on' : ''}">${esc(monthName(m))}</button>`).join('')}</div></div>
      <label class="field"><span>What got in the way?</span><textarea class="inp" name="reason" rows="2" maxlength="400" placeholder="e.g. Exams, work trips, we were both sick">${esc(v.reason)}</textarea></label>
      <label class="field"><span>What you'll do for ${esc(theirName())} instead</span><textarea class="inp" name="instead" rows="2" maxlength="400" placeholder="e.g. Breakfast in bed on Sunday">${esc(v.instead)}</textarea></label>
      ${secretRow(v.secret, 'there\'s something for them')}
      <div class="sheet-actions">
        ${e ? '<button type="button" class="btn ghost danger-text" data-a="delete">Delete</button>' : ''}
        <button type="button" class="btn" data-a="save">${e ? 'Save' : 'Add it'}</button>
      </div>`,
  });
  const el = sheet.el;
  el.addEventListener('click', async ev => {
    const t = ev.target;
    const mb = t.closest('[data-group="month"] button');
    if (mb) { v.month = mb.dataset.v; mb.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === mb)); return; }
    if (t.closest('[data-secret]')) {
      v.secret = !v.secret;
      const g = t.closest('[data-secret]');
      g.classList.toggle('on', v.secret);
      g.setAttribute('aria-checked', v.secret);
      return;
    }
    const a = t.closest('[data-a]')?.dataset.a;
    if (a === 'delete') {
      if (!(await confirmSheet('Delete this?', 'It comes off your timeline.', { ok: 'Delete', danger: true }))) return;
      writeMine(d => { d.items = d.items.filter(x => x.id !== e.id); });
      writeSecret(e.id, null);
      sheet.close();
      refresh();
      return;
    }
    if (a === 'save') {
      const reason = el.querySelector('[name=reason]').value.trim();
      const instead = el.querySelector('[name=instead]').value.trim();
      const now = Date.now();
      const entry = { id: e ? e.id : uid(), kind: 'skip', month: v.month, reason, at: e ? e.at : now, t: now,
        ...(v.secret ? { instead: '', secret: true } : { instead, secret: false }) };
      writeMine(d => {
        const i = d.items.findIndex(x => x.id === entry.id);
        if (i >= 0) d.items[i] = entry; else d.items.push(entry);
      });
      writeSecret(entry.id, v.secret ? { instead } : null);
      vibrate(10);
      toast(v.secret ? `🎁 Noted. ${theirName()} sees there's a surprise` : 'Noted 💞');
      sheet.close();
      refresh();
    }
  });
}

async function reveal(id, refresh) {
  const e = docOf(me()).items.find(x => x.id === id);
  if (!e) return;
  if (!(await confirmSheet('Reveal the surprise?', `${theirName()} will see what it is.`, { ok: '🎁 Reveal it' }))) return;
  const sec = secrets()[id] || {};
  writeMine(d => {
    const i = d.items.findIndex(x => x.id === id);
    if (i < 0) return;
    d.items[i] = e.kind === 'date'
      ? { ...d.items[i], title: sec.title || '', note: sec.note || '', secret: false, t: Date.now() }
      : { ...d.items[i], instead: sec.instead || '', secret: false, t: Date.now() };
  });
  writeSecret(id, null);
  toast('🎁 Revealed');
  refresh();
}

async function addPhotoTo(id, extra, refresh) {
  const file = await pickPhoto();
  if (!file) return;
  toast('Adding the photo…');
  try {
    const ph = await addPhoto(file);
    writeMine(d => {
      if (extra) {
        const x = d.extras[id] || { note: '', photos: [] };
        d.extras[id] = { ...x, photos: [...(x.photos || []), ph], t: Date.now() };
      } else {
        const i = d.items.findIndex(x => x.id === id);
        if (i >= 0) d.items[i] = { ...d.items[i], photos: [...(d.items[i].photos || []), ph], t: Date.now() };
      }
    });
    toast('Photo added 📷');
    refresh();
  } catch (err) {
    toast(err && err.message === 'NO_BUCKET' ? 'Photos aren\'t set up yet (the date-photos storage is missing)' : 'Couldn\'t add that photo. Check your connection and try again.');
  }
}

function editExtra(id, refresh) {
  const x = docOf(me()).extras[id] || { note: '', photos: [] };
  const sheet = openSheet({
    title: 'Your few words',
    className: 'dt-sheet',
    body: `<label class="field"><span>About ${esc(theirName())}'s date</span><textarea class="inp" name="note" rows="3" maxlength="600" placeholder="What you loved about it">${esc(x.note || '')}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn" data-a="save">Save</button></div>`,
  });
  sheet.el.addEventListener('click', ev => {
    if (!ev.target.closest('[data-a="save"]')) return;
    const note = sheet.el.querySelector('[name=note]').value.trim();
    writeMine(d => { d.extras[id] = { ...(d.extras[id] || { photos: [] }), note, t: Date.now() }; });
    sheet.close();
    refresh();
  });
}

function showPhoto(slot, id) {
  const sheet = openSheet({
    title: '📷',
    className: 'dt-photo-sheet',
    body: `<img class="dt-full" src="${esc(photoUrl(slot, id, false))}" alt="" draggable="false">`,
  });
  sheet.el.addEventListener('click', ev => { if (ev.target.closest('.dt-full')) sheet.close(); });
}

// The Android reminder follows your dates, wherever they change from.
store.on(k => { if (/^p:\w:dates$/.test(k)) planReminder(); });

// (A sticker for the card's corner, so it matches the other trackers.)
export const datesIcon = () => `<img class="tk-ico" src="${stickerSrc('heart')}" alt="" draggable="false">`;
