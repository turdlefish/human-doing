// Home-screen widgets for iPhone, through the free Scriptable app.
//
// iOS only lets native apps put widgets on the home screen, so (like Human
// Being) the app makes a Scriptable script with your space code in it
// (scriptable/human-doing.js) that reads the shared database and draws the
// widgets. It works out your person's shared trackers, their period support, the
// to-do lists and the plans itself. Your own trackers it can't (your cycle
// needs a year of logs), so once you've copied the script, the app keeps a
// small private copy of today's tracker summary for it: the "widget" document,
// which your person's phone never downloads. It only changes when your
// trackers do.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { COLORS, DARK_SURFACE, dayKey, mix, uses12h } from './util.js';
import { WORK_TYPES, readSettings, writeSettings } from './docs.js';
import { SUPPORT } from './cycle.js';
import { trackerData } from './widgets.js';

/** The script, made for you (space code, which of you, the database). */
export async function iphoneScript() {
  const s = store.getSession();
  const r = await fetch(new URL('../scriptable/human-doing.js', import.meta.url));
  if (!r.ok) throw new Error('script ' + r.status);
  const colors = {};
  for (const [k, c] of Object.entries(COLORS)) colors[k] = [c.bg, c.mid, c.strong, c.ink, mix(c.strong, DARK_SURFACE, 0.78)];
  const items = list => Object.fromEntries(list.map(x => [x.id, [x.emoji, x.label]]));
  const put = {
    SPACE: s.space,
    ME: s.slot,
    APP_URL: location.origin + location.pathname,
    SB_URL: CONFIG.supabaseUrl,
    SB_KEY: CONFIG.supabaseKey,
    H12: JSON.stringify(uses12h()),
    COLORS: JSON.stringify(colors),
    SUPPORT: JSON.stringify(items(SUPPORT)),
    WORK: JSON.stringify(WORK_TYPES.map(t => [t.id, t.emoji, t.label, !!t.leave])),
  };
  return (await r.text()).replace(/%%([A-Z0-9_]+)%%/g, (m, k) => (k in put ? put[k] : m));
}

/** Whether you've set up the iPhone widget (so the app keeps its "widget" document). */
export const iphoneOn = () => !!readSettings().iphone;

export function setIphone(on) {
  const s = readSettings();
  if (!!s.iphone === on) return;
  s.iphone = on;
  writeSettings(s);
  if (on) keepWidgetDoc();
  else if (store.readMine('widget', null)) store.writeMine('widget', null);
}

// Today's tracker summary for the iPhone widget, saved when it changes.
function keepWidgetDoc() {
  if (!store.getSession() || !iphoneOn()) return;
  const day = dayKey();
  const next = { v: 1, day, trackers: trackerData(store.me(), day) };
  const cur = store.readMine('widget', null);
  if (cur && cur.day === next.day && JSON.stringify(cur.trackers) === JSON.stringify(next.trackers)) return;
  store.writeMine('widget', { ...next, at: Date.now() });
}

let timer = null;
/** Keeps the iPhone widget's document up to date while the app runs. */
export function startIphone() {
  const soon = () => { clearTimeout(timer); timer = setTimeout(keepWidgetDoc, 1500); };
  store.on(k => { if (!k.endsWith(':widget')) soon(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(); });
  soon();
}
