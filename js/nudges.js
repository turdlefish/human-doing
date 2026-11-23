// Little messages to your person, with a notification on their phone:
//   remind   "Log your work day" and the like (👉 Remind, see remind.js)
//   news     what you've added or ticked off on your shared lists (🔔 Tell)
//   version  the app has an update (from What's new)
// Each of you keeps your own "nudges" document of what you've sent:
//   { items: [{ id, kind, what?, v?, text, from, at }], newsFrom? }
// newsFrom: since when your additions count as news (the last 🔔 Tell; before
// the first one, since this phone first ran this version).
// Your person's phone shows new ones in a "From Sam" sheet, and while the app
// is closed the Android app notifies them (Nudges.java in Human Doing,
// PartnerAlerts.java in Human Being). This file is the same in both apps:
// about.js has what differs.
//
// Also here: What's new after an update, your version in your profile (appV),
// and a note when the two of you have different versions.

import * as store from './store.js';
import { esc, toast, uid } from './util.js';
import { openSheet } from './ui.js';
import { APP, NS, NUDGE_ROUTES, VERSION, WEBSITE, WHATS_NEW } from './about.js';

const KEEP = 30;                      // messages kept in your document
const KEEP_MS = 30 * 864e5;           // …and for at most a month
const SEEN = NS + ':nudgeSeen';       // the newest message from your person you've seen (this phone)
const SEEN_V = NS + ':seenVersion';   // the version whose What's new you've seen (this phone)
const NEWS_START = NS + ':newsStart'; // before your first 🔔 Tell: news counts from here (this phone)
const ASKED = NS + ':askedNotify';    // the Android app asked to show notifications (once)
const bridge = window.TendNative || null;

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const docOf = d => ({ items: Array.isArray(d && d.items) ? d.items : [], newsFrom: (d && d.newsFrom) || 0 });
const mine = () => docOf(store.readMine('nudges', null));
const theirs = () => docOf(store.readPartner('nudges', null));
export const them = () => store.readPartner('profile', null);

/** Sends your person a message (kind 'remind', 'news' or 'version'). */
export function sendNudge(kind, text, extra = {}) {
  const d = mine();
  const now = Date.now();
  const items = [...d.items.filter(x => x.at > now - KEEP_MS),
    { id: uid(), kind, text, from: store.readMine('profile', {}).name || '', at: now, ...extra }].slice(-KEEP);
  store.writeMine('nudges', { items, newsFrom: kind === 'news' ? now : d.newsFrom });
}

/** Since when your changes count as news to tell your person. */
export const newsFrom = () => mine().newsFrom || Number(lsGet(NEWS_START)) || Date.now();

// ── Versions ──────────────────────────────────────────────────────────────
const parts = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
/** True if version a is newer than b ("1.10" after "1.9"). */
export function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/** For Us: a line when you and your person have different versions ('' when the same). */
export function versionNote() {
  const t = them();
  if (!t) return '';
  const theirV = t.appV;
  const site = WEBSITE ? ` (or use it at <a href="${esc(WEBSITE)}" target="_blank" rel="noopener">the website</a>)` : '';
  if (theirV && newer(theirV, VERSION)) {
    return `<p class="ver-note">💌 ${esc(t.name)} has ${APP} ${esc(theirV)} and you have ${VERSION}. Ask ${esc(t.name)} to send you the new app${site}.</p>`;
  }
  if (!theirV || newer(VERSION, theirV)) {
    return `<p class="ver-note">📲 ${esc(t.name)} ${theirV ? `still has ${esc(theirV)}` : 'has an older version'}. Send them the new app so you're both on ${VERSION}.</p>`;
  }
  return '';
}

/** After an update: What's new, once, with a button to tell your person. Also puts your version in your profile. */
export function checkWhatsNew() {
  const p = store.readMine('profile', null);
  if (p && p.appV !== VERSION) store.writeMine('profile', { ...p, appV: VERSION });
  const seen = lsGet(SEEN_V);
  lsSet(SEEN_V, VERSION);
  const s = store.getSession();
  const justJoined = s && s.joined && Date.now() - s.joined < 10 * 60e3;   // a new phone: nothing to announce
  if (seen === VERSION || justJoined || !WHATS_NEW.length) return;
  const t = them();
  const sheet = openSheet({
    title: `What's new in ${APP} ${VERSION} ✨`,
    body: `<ul class="wn-list">${WHATS_NEW.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-wn="close">Lovely</button>
        ${t ? `<button type="button" class="btn" data-wn="tell">🔔 Tell ${esc(t.name)}</button>` : ''}
      </div>`,
  });
  sheet.el.addEventListener('click', e => {
    const b = e.target.closest('[data-wn]');
    if (!b) return;
    if (b.dataset.wn === 'tell' && t) {
      sendNudge('version', `${APP} ${VERSION} is here: ${WHATS_NEW.map(x => x.replace(/^\S+\s/, '').replace(/ \(.*\)$/, '')).join(' · ')}`, { v: VERSION });
      toast(`Told ${t.name} ✨`);
    }
    sheet.close();
  });
}

// ── Receiving ─────────────────────────────────────────────────────────────
const seenAt = () => Number(lsGet(SEEN)) || 0;
const KIND = { remind: ['👉', 'Reminder'], news: ['🔔', 'News'], version: ['✨', 'App update'] };
let showing = false, retry = 0;

function markSeen(at) {
  if (at > seenAt()) lsSet(SEEN, String(at));
  if (bridge && bridge.nudgeSeen) bridge.nudgeSeen(String(at));
}

/** Shows new messages from your person in a "From Sam" sheet (once nothing else is open). */
export function checkInbox() {
  if (showing || !store.getSession()) return;
  const t = them();
  const fresh = theirs().items.filter(x => x.at > seenAt()).sort((a, b) => b.at - a.at);
  if (!t || !fresh.length) return;
  if (document.hidden || document.querySelector('.sheet-wrap')) {   // later, when you're not busy with something else
    clearTimeout(retry);
    retry = setTimeout(checkInbox, 4000);
    return;
  }
  showing = true;
  const when = at => new Date(at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const row = x => {
    const [icon, what] = KIND[x.kind] || ['💌', 'a message'];
    const go = x.kind === 'remind' && NUDGE_ROUTES[x.what];
    const update = x.kind === 'version' && x.v && newer(x.v, VERSION)
      ? `<small class="nd-hint">You have ${VERSION}: ask ${esc(t.name)} to send you the new app${WEBSITE ? ', or use the website' : ''}.</small>` : '';
    return `<div class="nd-item nd-${esc(x.kind)}"><span class="nd-ico" aria-hidden="true">${icon}</span>
      <div class="nd-body"><b>${esc(x.text)}</b><small>${what} · ${esc(when(x.at))}</small>${update}</div>
      ${go ? `<button type="button" class="btn small" data-nd-go="${esc(go)}">Do it now</button>` : ''}</div>`;
  };
  const sheet = openSheet({
    title: `From ${t.name} 💌`,
    body: `<div class="nd-list">${fresh.map(row).join('')}</div>
      <div class="sheet-actions"><button type="button" class="btn" data-nd-ok>Thank you 💗</button></div>`,
    onClose: () => { showing = false; markSeen(fresh[0].at); },
  });
  sheet.el.addEventListener('click', e => {
    const go = e.target.closest('[data-nd-go]');
    if (go) { location.hash = go.dataset.ndGo; sheet.close(); return; }
    if (e.target.closest('[data-nd-ok]')) sheet.close();
  });
}

/**
 * Starts listening for your person's messages, and shows What's new after an
 * update. synced: the start-up sync (so your profile is up to date before
 * your version goes in it).
 */
export function startNudges(synced) {
  const now = String(Date.now());
  if (!lsGet(SEEN)) lsSet(SEEN, now);               // first run: older messages aren't news
  if (!lsGet(NEWS_START)) lsSet(NEWS_START, now);   // …nor are older changes
  store.on((k, source) => {
    if (source === 'remote' && k === store.keyFor(store.partner(), 'nudges')) checkInbox();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkInbox(); });
  const later = new Promise(r => setTimeout(r, 8000));
  Promise.race([Promise.resolve(synced).catch(() => {}), later])
    .then(() => setTimeout(() => {
      checkWhatsNew();
      checkInbox();
      // So your person's reminders can reach you while the app is closed.
      if (bridge && bridge.askNotifications && them() && !lsGet(ASKED)) { lsSet(ASKED, '1'); bridge.askNotifications(); }
    }, 600));
}
