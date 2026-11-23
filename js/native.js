// Glue for the Android app (doing-android), which exposes window.TendNative.
// In a normal browser all of this quietly does nothing.

import * as store from './store.js';
import { CONFIG } from './config.js';

export const bridge = window.TendNative || null;
export const isNative = !!bridge;

export const canShare = () => isNative || !!navigator.share;

export async function shareText(title, text) {
  if (bridge) { bridge.share(title, text); return; }
  try { await navigator.share({ title, text }); } catch (e) { /* cancelled */ }
}

/**
 * Prints the page (its print styles show only the report). The Android app
 * opens the phone's print screen, which can also save a PDF. False when an
 * older Android app can't print yet.
 */
export function printPage(title) {
  if (bridge) {
    if (!bridge.print) return false;
    bridge.print(title);
    return true;
  }
  window.print();
  return true;
}

// Status / navigation bar colours follow the app's light or galaxy theme.
export function nativeTheme(dark) {
  if (bridge && bridge.setTheme) bridge.setTheme(dark ? 'dark' : 'light');
}

export function startNative() {
  if (!bridge) return;
  const s = store.getSession();
  // Lets the home-screen widgets refresh from the database while the app is closed.
  bridge.setSession(JSON.stringify({ url: CONFIG.supabaseUrl, key: CONFIG.supabaseKey, table: CONFIG.table, space: s.space, slot: s.slot }));
}

export function stopNative() {
  if (bridge) bridge.setSession('');
}
