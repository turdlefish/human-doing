// This app: its name, version, what's new in it (shown once after an update,
// see nudges.js), its website, and where a reminder from your person leads.

export const APP = 'Human Doing';
export const NS = 'doing';   // local storage prefix
export const VERSION = '1.8';
export const WEBSITE = 'https://turdlefish.github.io/human-doing/';
// What's new, by version, newest first (a phone that skipped a version sees both).
export const WHATS_NEW = {
  '1.8': [
    '✋ Plan: hold an event for a moment before it moves or stretches, so scrolling past never changes its time',
    '↩️ Moved one by mistake? Tap Undo at the top',
    '💭 App feedback now also reaches the person who makes Human Doing',
  ],
  '1.7': [
    '🗓️ Plan shows the whole week at a glance (🔍 Zoom in for more room)',
    '💻 On a computer it\'s laid out like a normal webpage, with the sections down the left',
    '👉 Remind your person to log their work day, water and more',
    '🔔 Tell your person what you\'ve added or ticked off on your shared lists',
  ],
};
// A reminder's "Do it now" opens…
export const NUDGE_ROUTES = { work: 'track', water: 'track', meds: 'track', walk: 'track', cycle: 'track', todo: 'todo' };
