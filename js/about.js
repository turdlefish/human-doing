// This app: its name, version, what's new in it (shown once after an update,
// see nudges.js), its website, and where a reminder from your person leads.

export const APP = 'Human Doing';
export const NS = 'doing';   // local storage prefix
export const VERSION = '1.12';
export const WEBSITE = 'https://turdlefish.github.io/human-doing/';
// What's new, by version, newest first. A phone that skipped versions sees
// them all, 🔔 Tell sends your person everything after their version, and Us
// lists every one. (1.4 covers 1.4 to 1.4.4, and 1.3 covers 1.3.1.)
export const WHATS_NEW = {
  '1.12': [
    '🗓️ Whole week: events sit closer together, with their words centred and wrapped so they\'re easier to read (🔍 Zoom in shows them in full)',
  ],
  '1.11': [
    '✓ When the person who makes Human Doing sorts one of your feedback notes, it ticks itself off here, sometimes with a reply',
  ],
  '1.10': [
    '🔑 Make your space code longer (Us → Your person): everything is copied to the new code and nothing is deleted. Your other apps ask for the new code',
    'ℹ️ Us shows which version of Human Doing you\'re using (Sync & backup)',
  ],
  '1.9': [
    '🔐 Your lists, plans and trackers are now locked to your space: only phones with your code can see or change them',
    '✨ Skipped an update? What\'s new now shows everything you missed, and 🔔 Tell sends your person everything they\'re missing',
    '📜 Every update is listed at the bottom of Us',
    '🍎 Using the iPhone widget? Copy its script again from Us (On your home screen) so it keeps updating',
  ],
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
  '1.6': [
    '⚡ To-Do: type straight into "＋ Add to…" and press Enter to add a task, then the next one',
    '↪️ Hold a task and drag it right to tuck it under the one above as a subtask (drag it left to make it a task again)',
  ],
  '1.5': [
    '🥱 Tiredness from your Human Being check-ins, in the month and year views',
    '😊 Mood tallies count every mood you picked that day',
    '😷 A new Unwell face',
    '💭 App feedback on Us: note what to fix or add',
  ],
  '1.4': [
    '✎ Edit on every card: rename its buttons, put them in order and star the main ones',
    '✓ The same Done button on every card, and 🔒/💞 by each card\'s name to share it or keep it to yourself',
    '🩸 The Cycle card holds today\'s log, a Flow row and your period support',
    '🗑️ Choose which done tasks to delete, or delete them all',
  ],
  '1.3': [
    '🚶 A Walk tracker, with nudges to get up and move',
    '🌙 Mood, sleep, brain space and spoons now come from your Human Being check-ins',
    '📋 Several to-do lists: rename them, reorder them and drag tasks into place',
    '💞 Share each plan with your person, or keep it just for you',
  ],
};
// A phone that has never shown What's new ran this version or older (What's new came in 1.7).
export const OLDEST_SEEN = '1.6';
// A reminder's "Do it now" opens…
export const NUDGE_ROUTES = { work: 'track', water: 'track', meds: 'track', walk: 'track', cycle: 'track', todo: 'todo' };
