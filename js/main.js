// App shell: onboarding, tab routing, top bar and sync indicator.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { $, $$, colorVars, copyText, esc, isDark, prefs, setTheme, toast } from './util.js';
import { showOnboarding } from './onboarding.js';
import { createTrack } from './track.js';
import { createTodo } from './todo.js';
import { createPlan } from './plan.js';
import { createUs } from './us.js';
import { tray } from './sticker-ui.js';
import { bridge, isNative, nativeTheme, startNative, updateNativeSession } from './native.js';
import { initMove } from './spacemove.js';
import { openSheet } from './ui.js';
import { drainOps, pushNow, runHeadless, startWidgets } from './widgets.js';
import { startIphone } from './iphone.js';
import { avatarHTML } from './avatars.js';
import { initCustom } from './custom.js';
import { setBionic } from './bionic.js';
import { addDatesTracker, cleanUpOldTrackers, tidyMyDocs } from './docs.js';
import { copyDatePhotos, planReminder } from './dates.js';
import { startNudges } from './nudges.js';

const views = {};
let current = null;

const SYNC_LABEL = { idle: '', synced: 'synced', saving: 'saving…', offline: 'offline', error: 'sync issue' };

// ── Theme: 'auto' follows the phone; 'light' pastel paper; 'dark' galaxy ──
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(rerender = false) {
  const pref = prefs.theme || 'auto';
  setTheme(pref === 'dark' || (pref === 'auto' && darkQuery.matches) ? 'dark' : 'light');
  $('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#0B1029' : '#FFF4F8');
  nativeTheme(isDark());
  if (rerender && current) { renderTopbar(); views[current].show(); }
}
darkQuery.addEventListener('change', () => applyTheme(true));

function renderTopbar() {
  const me = store.readMine('profile', {});
  const them = store.readPartner('profile', null);
  $('#duo').innerHTML = `
    <span class="av" style="${colorVars(me.color)}" title="${esc(me.name || 'Me')}">${avatarHTML(me)}</span>
    <span class="av${them ? '' : ' empty'}" style="${colorVars(them ? them.color : 'lavender')}" title="${esc(them ? them.name : 'Waiting for your person')}">${them ? avatarHTML(them) : '＋'}</span>`;
}

function renderSync(s) {
  const el = $('#sync');
  el.dataset.state = s.state;
  el.querySelector('.sync-txt').textContent = SYNC_LABEL[s.state] || '';
}

function route() {
  // "#todo:task:<id>" (from an iPhone widget) opens the tab, then that place in it.
  const [name, ...more] = (location.hash || '#track').slice(1).split(':');
  const v = views[name] ? name : 'track';
  if (tray.target) tray.close();
  $$('.view').forEach(el => el.classList.toggle('active', el.dataset.view === v));
  $$('.tab').forEach(b => {
    const on = b.dataset.tab === v;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.body.dataset.view = v;
  current = v;
  views[v].show();
  if (more.length && views[v].open) {
    history.replaceState(null, '', '#' + v);
    views[v].open(more.join(':'));
  }
}

function startApp() {
  $('#app').hidden = false;
  initCustom();
  tidyMyDocs();
  if (CONFIG.mock) $('#mock-badge').hidden = false;
  views.track = createTrack($('#view-track'));
  views.todo = createTodo($('#view-todo'));
  views.plan = createPlan($('#view-plan'));
  views.us = createUs($('#view-us'), { onTimeFormat: () => views.plan.rerender(), onTheme: () => applyTheme(true), onBionic: () => setBionic(!!prefs.bionic, prefs.bionicLevel) });

  $$('.tab').forEach(b => b.addEventListener('click', () => {
    if (location.hash === '#' + b.dataset.tab) route(); else location.hash = b.dataset.tab;
  }));
  $('#duo').addEventListener('click', () => { location.hash = 'us'; });
  window.addEventListener('hashchange', route);

  store.on(k => { if (k.endsWith(':profile')) renderTopbar(); });
  store.onStatus(renderSync);
  renderTopbar();
  route();
  // One-time clean-ups, once this phone has everything (see docs.js).
  const synced = store.startSync();
  synced.then(ok => { if (ok && cleanUpOldTrackers() && current) views[current].show(); });
  synced.then(ok => { if (ok && addDatesTracker() && current) views[current].show(); planReminder(); });
  if (!new URLSearchParams(location.search).has('widgets')) startNudges(synced);
  setBionic(!!prefs.bionic, prefs.bionicLevel);
  startNative();
  startWidgets();
  startIphone();
  if (bridge && bridge.takeRoute) openRoute(bridge.takeRoute());
  if (!new URLSearchParams(location.search).has('widgets')) {
    // A move to a longer space code: asks for the new code when another app made one (spacemove.js).
    initMove({
      ns: 'doing', app: 'Human Doing', store, toast, copyText,
      sheet: (title, body) => openSheet({ title, body }),
      busy: () => !!document.querySelector('.sheet-wrap'),
      myName: () => store.readMine('profile', {}).name,
      after: () => { updateNativeSession(); route(); },
      photos: copyDatePhotos,
      cls: { input: 'inp', code: 'code-pill big', actions: 'sheet-actions', primary: 'btn', ghost: 'btn ghost', err: 'ob-err' },
    });
  }
}

// ── From the home-screen widgets (Android) ────────────────────────────────
// A tap that opens the app at a place: 'track', 'track:cycle', 'todo:new',
// 'todo:task:<id>', 'plan'…
function openRoute(r) {
  if (!r || !views.track) return;
  const [tab, ...rest] = String(r).split(':');
  if (!views[tab]) return;
  history.replaceState(null, '', '#' + tab);
  route();
  if (rest.length && views[tab].open) views[tab].open(rest.join(':'));
}
window.doingRoute = openRoute;
// Taps waiting from the widgets: applied as the app comes back on screen.
window.doingWidgetOps = () => { if (drainOps() && current) views[current].show(); };
// The phone asks for a fresh summary as you leave the app.
window.tendPushWidget = () => { pushNow(); };

// Android back button: close the top sheet / sticker drawer / edit first.
window.tendBack = () => {
  const sheets = document.querySelectorAll('.sheet-wrap.open');
  if (sheets.length) { sheets[sheets.length - 1].querySelector('.sheet-x').click(); return true; }
  if (tray.target) { tray.close(); return true; }
  if (document.activeElement && document.activeElement.isContentEditable) { document.activeElement.blur(); return true; }
  if (current && views[current].back && views[current].back()) return true;   // e.g. out of the work year
  return false;
};

function registerSW() {
  if (isNative || !('serviceWorker' in navigator)) return;   // the Android app bundles its files
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (location.protocol !== 'https:' && !local) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// index.html?widgets is the hidden copy the phone runs for its widgets while
// the app is closed: no screens, just their taps, a sync and a fresh summary.
if (new URLSearchParams(location.search).has('widgets')) runHeadless();
else {
  registerSW();
  applyTheme();
  if (store.getSession()) startApp();
  else showOnboarding(startApp);
}
