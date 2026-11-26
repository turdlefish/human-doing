// The guide and the tour, both opened from ? in the top bar.
//   tour   a short walk round the app: each step switches to its tab, lights
//          up one part of the screen and says what it's for. Offered once on a
//          phone that has just joined (someone new); later from the guide.
//   guide  a sheet listing everything in the app, section by section, with
//          "Go to …" and ▶ Take the tour.
//   site   the website's address with Open ↗ and 📋 Copy link, in the guide,
//          on the tour's website step ({ site: true }) and on Us (siteRow).
// This file is the same in Human Being and Human Doing: guidetext.js has
// each app's own words and the parts of its screens that the tour points at.

import * as store from './store.js';
import { colorVars, copyText, esc, toast } from './util.js';
import { openSheet } from './ui.js';
import { APP, NS, WEBSITE } from './about.js';
import { isNative } from './native.js';
import { GUIDE, TOUR } from './guidetext.js';

const OFFERED = NS + ':tourOffered';   // this phone has had its one offer of the tour
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const wait = ms => new Promise(r => setTimeout(r, ms));
const tabNow = () => (location.hash || '#').slice(1).split(':')[0];
const val = v => (typeof v === 'function' ? v() : v);

let tour = null;    // the tour on screen: { el, tip, hole, steps, i, target, key, raf, offered, token }
let prepare = null; // the app's own step before the tour shows a tab (Human Doing: Tracking back on today)

/** Wires ? in the top bar. prepare(tab): called as the tour arrives on a tab. */
export function initGuide(opts = {}) {
  prepare = opts.prepare || null;
  const btn = document.getElementById('help-btn');
  if (btn) btn.addEventListener('click', () => openGuide());
  // 📋 Copy link, wherever it shows (the guide, the tour, Us).
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-site="copy"]')) return;
    toast((await copyText(WEBSITE)) ? 'Website link copied' : `The website is ${siteName()}`);
  });
}

// ── The website ───────────────────────────────────────────────────────────
const siteName = () => WEBSITE.replace(/^https?:\/\//, '').replace(/\/$/, '');
const siteAddr = () => `<b class="site-addr">${esc(siteName())}</b>`;

/** Open ↗ (in the app; on the website you're on it already) and 📋 Copy link. */
function siteLinks() {
  return `<span class="site-links">
    ${isNative ? `<a class="btn small" href="${esc(WEBSITE)}" target="_blank" rel="noopener">🌐 Open the website ↗</a>` : ''}
    <button type="button" class="btn ghost small" data-site="copy">📋 Copy link</button></span>`;
}

// What the website is: the same space as the app, synced both ways.
const siteText = () => (isNative
  ? `Use ${APP} in any browser too, on a computer or another phone, at ${siteAddr()}. Put in your space code (it's on Us) and it's the same space: whatever you change there shows up here in the app, and the other way round. It gets new versions by itself, with nothing to install.`
  : `You're on the website: ${siteAddr()}. It's the same space as the Android app, so whatever you change here shows up in the app, and the other way round. Copy the link to open it on another computer or phone, with your space code (it's on Us).`);

/** The website's row on Us (id u-site, which the tour points at). */
export function siteRow() {
  if (!WEBSITE) return '';
  return `<div class="site-row" id="u-site">
    <p>💻 ${isNative ? `<b>On the website too</b>: ${siteAddr()}. The same space, so it syncs with the app both ways.`
      : `<b>The website</b>: ${siteAddr()}. The same space as the Android app, synced both ways.`}</p>
    ${siteLinks()}</div>`;
}

/** A phone that has just joined: offers the tour, once (after that it's under ?). */
export function offerTour() {
  if (lsGet(OFFERED)) return;
  lsSet(OFFERED, String(Date.now()));
  const s = store.getSession();
  if (!s || !s.joined || Date.now() - s.joined > 30 * 60e3) return;   // been here a while: What's new mentions ?
  const go = () => {
    if (tour) return;
    if (document.hidden || document.querySelector('.sheet-wrap, .hug-pop, .onboard')) { setTimeout(go, 1500); return; }
    startTour(0, true);
  };
  setTimeout(go, 1400);
}

// ── The tour ──────────────────────────────────────────────────────────────
/** Starts the tour at step `from` (0 is the welcome). offered: it opened by itself. */
export function startTour(from = 0, offered = false) {
  closeTour();
  document.querySelectorAll('.sheet-wrap.open .sheet-x').forEach(b => b.click());
  const el = document.createElement('div');
  el.className = 'tour';
  el.innerHTML = `<div class="tour-shade"></div><div class="tour-hole" hidden></div>
    <div class="tour-tip" role="dialog" aria-modal="true" aria-labelledby="tour-h" tabindex="-1"></div>`;
  document.body.append(el);
  const steps = TOUR.filter(s => { try { return (!s.site || WEBSITE) && (!s.when || s.when()); } catch (e) { return false; } });
  tour = { el, tip: el.querySelector('.tour-tip'), hole: el.querySelector('.tour-hole'), steps, i: -1, target: null, key: '', raf: 0, offered, token: null, tab: null };
  el.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => el.classList.add('open'));
  loop();
  show(Math.min(from, steps.length - 1));
}

/** Closes the tour if it's open (Android's back button too). True if it was. */
export function closeTour() {
  const t = tour;
  if (!t) return false;
  tour = null;
  cancelAnimationFrame(t.raf);
  document.removeEventListener('keydown', onKey);
  t.el.classList.remove('open');
  setTimeout(() => t.el.remove(), 220);
  if (t.offered && t.i <= 0) toast('Tap ? at the top any time for the tour and the guide');
  return true;
}

function onClick(e) {
  const b = e.target.closest('[data-t]');
  if (!b || !tour) return;
  const a = b.dataset.t;
  if (a === 'next') show(tour.i + 1);
  else if (a === 'back') show(tour.i - 1);
  else if (a === 'close') closeTour();
  else if (a === 'guide') { closeTour(); openGuide(); }
}

function onKey(e) {
  if (!tour) return;
  if (e.key === 'Escape') { e.preventDefault(); closeTour(); }
  else if (e.key === 'ArrowRight' && tour.i < tour.steps.length - 1) show(tour.i + 1);
  else if (e.key === 'ArrowLeft' && tour.i > 0) show(tour.i - 1);
}

// The first part of the screen a step points at that's on show (selectors in order).
function find(at) {
  for (const sel of [].concat(at || [])) {
    let list = [];
    try { list = [...document.querySelectorAll(sel)]; } catch (e) { continue; }
    const el = list.find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (el) return el;
  }
  return null;
}

async function show(i) {
  const t = tour;
  if (!t || i < 0 || i >= t.steps.length) return;
  const s = t.steps[i];
  const token = t.token = {};
  t.i = i;
  t.el.classList.add('moving');
  if (s.tab) {
    if (tabNow() !== s.tab) { location.hash = s.tab; await wait(60); }
    if (t.tab !== s.tab) { t.tab = s.tab; try { if (prepare) prepare(s.tab); } catch (e) { console.error(e); } }
  }
  await wait(s.tab ? 120 : 20);
  if (tour !== t || t.token !== token) return;
  t.target = s.at ? find(s.at) : null;
  // Into view at once, while the tip is faded out (a smooth scroll can be cut short); a tall part from its top.
  if (t.target) t.target.scrollIntoView({ block: t.target.offsetHeight > window.innerHeight * 0.55 ? 'start' : 'center', inline: 'nearest' });
  renderTip(s, i);
  t.key = '';
  t.el.classList.remove('moving');
}

function renderTip(s, i) {
  const t = tour, n = t.steps.length - 1;   // the welcome isn't counted
  const first = i === 0, last = i === n;
  t.tip.innerHTML = `
    <div class="tour-top">${first ? `<span class="tour-count">${APP}</span>` : `<span class="tour-count">${i} of ${n}</span>`}
      <button type="button" class="tour-x" data-t="close" aria-label="Close the tour">✕</button></div>
    <h3 id="tour-h">${val(s.title || (s.site ? 'On the website too 💻' : ''))}</h3>
    <p>${val(s.text || (s.site ? siteText : ''))}</p>
    ${s.site ? `<div class="tour-site">${siteLinks()}</div>` : ''}
    ${first ? '' : `<div class="tour-dots" aria-hidden="true">${Array.from({ length: n }, (_, k) => `<i${k + 1 === i ? ' class="on"' : ''}></i>`).join('')}</div>`}
    <div class="tour-acts">
      ${first ? `<button type="button" class="btn ghost small" data-t="close">${t.offered ? 'Maybe later' : 'Not now'}</button>`
        : `<button type="button" class="btn ghost small" data-t="back">‹ Back</button>`}
      ${last ? `<button type="button" class="btn ghost small" data-t="guide">📖 Guide</button><button type="button" class="btn small" data-t="close">Finish 🎉</button>`
        : `<button type="button" class="btn small" data-t="next">${first ? 'Show me around ›' : 'Next ›'}</button>`}
    </div>`;
  t.tip.focus({ preventScroll: true });
}

// Keeps the light and the tip on the part being shown (it can scroll, or the screen redraw).
function loop() {
  const t = tour;
  if (!t) return;
  t.raf = requestAnimationFrame(loop);
  const s = t.steps[t.i];
  if (s && s.at && (!t.target || !t.target.isConnected)) t.target = find(s.at);
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const r = t.target ? t.target.getBoundingClientRect() : null;
  const tw = t.tip.offsetWidth, th = t.tip.offsetHeight;
  const key = (r ? [r.left, r.top, r.width, r.height].map(Math.round).join() : '-') + `|${vw}x${vh}|${tw}x${th}`;
  if (key === t.key) return;
  t.key = key;
  const M = 12, P = 6;
  if (!r || !r.width) {
    t.hole.hidden = true;
    t.el.classList.add('no-hole');
    t.tip.style.left = Math.max(M, (vw - tw) / 2) + 'px';
    t.tip.style.top = Math.max(M, (vh - th) / 2) + 'px';
    return;
  }
  t.el.classList.remove('no-hole');
  t.hole.hidden = false;
  const x1 = Math.max(4, r.left - P), y1 = Math.max(4, r.top - P);
  const x2 = Math.min(vw - 4, r.right + P), y2 = Math.min(vh - 4, r.bottom + P);
  Object.assign(t.hole.style, { left: x1 + 'px', top: y1 + 'px', width: Math.max(0, x2 - x1) + 'px', height: Math.max(0, y2 - y1) + 'px' });
  let top;
  if (vh - y2 >= th + 2 * M) top = y2 + M;           // under it
  else if (y1 >= th + 2 * M) top = y1 - M - th;      // over it
  else top = vh - th - M;                            // a big part: over its lower end
  t.tip.style.left = Math.min(Math.max(M, (x1 + x2) / 2 - tw / 2), vw - tw - M) + 'px';
  t.tip.style.top = Math.max(M, top) + 'px';
}

// ── The guide ─────────────────────────────────────────────────────────────
/** A sheet listing everything in the app, with ▶ Take the tour. */
export function openGuide() {
  closeTour();
  const sheet = openSheet({
    title: `How ${APP} works 📖`,
    className: 'guide-sheet',
    body: `
      <p class="gd-intro">${val(GUIDE.intro)}</p>
      <button type="button" class="btn gd-tour" data-gd="tour">▶ Take the tour <small>about a minute</small></button>
      ${WEBSITE ? `<div class="gd-site" style="${colorVars('sky')}"><h4>💻 On the website too</h4><p>${siteText()}</p>${siteLinks()}</div>` : ''}
      ${GUIDE.sections.map((s, i) => `
        <details class="gd-sec" style="${colorVars(s.color)}"${i === 0 ? ' open' : ''}>
          <summary><span class="gd-ico" aria-hidden="true">${s.icon}</span><span class="gd-name"><b>${s.title}</b><small>${val(s.sub)}</small></span></summary>
          <ul class="gd-list">${val(s.items).map(x => `<li>${x}</li>`).join('')}</ul>
          ${s.tab ? `<button type="button" class="btn ghost small gd-go" data-gd-go="${s.tab}">Go to ${s.tabName} ›</button>` : ''}
        </details>`).join('')}
      ${GUIDE.foot ? `<p class="muted small gd-foot">${val(GUIDE.foot)}</p>` : ''}`,
  });
  sheet.el.addEventListener('click', e => {
    if (e.target.closest('[data-gd="tour"]')) { sheet.close(); setTimeout(() => startTour(1), 280); return; }
    const go = e.target.closest('[data-gd-go]');
    if (go) { sheet.close(); location.hash = go.dataset.gdGo; }
  });
}
