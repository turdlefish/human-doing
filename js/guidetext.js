// Human Doing's words for the tour and the guide (guide.js shows them).
// A tour step: { tab?, at?: [selectors, first one on show wins], title, text, when? }
// (title and text can be functions; they're HTML, so names go through esc).
// A guide section: { icon, title, sub, color, tab?, tabName?, items: [HTML] }.

import * as store from './store.js';
import { esc } from './util.js';
import { readSettings, readTodos } from './docs.js';

const them = () => store.readPartner('profile', null);
const their = () => esc(them()?.name || 'your person');
const Their = () => esc(them()?.name || 'Your person');
const datesOn = () => { try { return !!readSettings().trackers.on.dates; } catch (e) { return false; } };
const hasLists = () => { try { return readTodos().groups.length > 0; } catch (e) { return false; } };

export const TOUR = [
  {
    title: 'Welcome to Human Doing 📋',
    text: 'The doing side of life for the two of you: trackers, to-dos and plans. Want a quick look around? It takes about a minute.',
  },
  {
    tab: 'track', at: ['#k-body .card.tk:not(.tk-folded):not(.tk-dates)', '#k-body .card.tk', '#k-body'],
    title: 'Your trackers',
    text: 'Each tracker you switch on gets a card: your work day, water, caffeine and more. Tap to log it; it saves straight away, with the time.',
  },
  {
    tab: 'track', at: ['#k-body .tk-vis', '#k-body .card.tk'],
    title: 'Just you, or shared',
    text: () => `🔒 means only you see that tracker. Tap it to share it with ${their()} (💞): it asks first. The cycle has its own sharing choices.`,
  },
  {
    tab: 'track', at: ['#k-body .done-chip', '#k-body .card.tk'],
    title: '✓ Done',
    text: 'Folds a card into one line for the day, and ✏️ opens it again. <b>✎ Edit</b> by a card\'s buttons renames them, puts them in order and adds your own.',
  },
  {
    tab: 'track', at: ['#k-body .tk-dates'], when: datesOn,
    title: 'Date nights 💗',
    text: () => `See how long since each of you planned a date. <b>＋ Plan a date</b> for ${their()} (it can be a 🎁 surprise), or say you can't this month. Your dates and photos make a timeline.`,
  },
  {
    tab: 'track', at: ['#k-body .add-tracker'],
    title: 'Add or make a tracker',
    text: 'Switch trackers on and off and put them in order. Tap one for a preview first, or make your own: yes/no, a count, an amount, a scale, options or a note.',
  },
  {
    tab: 'track', at: ['#k-mode'],
    title: 'Day and Month',
    text: 'Month is a sticker calendar of what you\'ve logged, with monthly tallies like hours worked. Your work year and leave left are on the work card.',
  },
  {
    tab: 'track', at: ['#k-who'], when: () => !!them(),
    title: () => `${Their()}'s trackers`,
    text: () => `See what ${their()} shares with you, and <b>👉 Remind</b> them to log something.`,
  },
  {
    tab: 'todo', at: ['#view-todo .sched-tabs.groups', '#view-todo .td-start', '#view-todo .td-head'],
    title: 'Your lists',
    text: () => (hasLists()
      ? `Lists like Home and Errands: <b>💞 shared</b> with ${their()} (you both add and tick) or <b>🔒 just you</b>. <b>✎ lists</b> renames, reorders and adds them.`
      : `Start by picking your lists, like Home and Errands: <b>💞 shared</b> with ${their()} (you both add and tick) or <b>🔒 just you</b>. Then type on a list's <b>＋ Add</b> line and press Enter to add a task.`),
  },
  {
    tab: 'todo', at: ['#view-todo .quick-add', '#view-todo .td-head'], when: hasLists,
    title: 'Add in a flash',
    text: 'Type on a list\'s <b>＋ Add</b> line and press Enter, then the next one. Tap a task for its details: who, a due date, repeat, priority, notes, subtasks or a time on your Plan.',
  },
  {
    tab: 'todo', at: ['#view-todo .task', '#view-todo .quick-add', '#view-todo .td-head'], when: hasLists,
    title: 'Hold and drag',
    text: 'Hold a task, then drag it up or down to put it in order, or to the right to tuck it under the task above as a subtask.',
  },
  {
    tab: 'todo', at: ['#view-todo .tell-btn'], when: () => !!them() && hasLists(),
    title: () => `🔔 Tell ${Their()}`,
    text: () => `Lets ${their()} know what you've added, changed or ticked off on your shared lists.`,
  },
  {
    tab: 'plan', at: ['#p-tabs'],
    title: 'Plans',
    text: 'Plan a day hour by hour, a week, or a month calendar. Each plan is <b>💞 shared</b> or <b>🔒 just you</b> (by its name), and ⚙ sets its hours and looks.',
  },
  {
    tab: 'plan', at: ['#view-plan .fab'],
    title: 'Events',
    text: 'Tap ＋ or an empty spot to add an event, and tap one to change it. To move one, hold it for a moment, then drag, or stretch it from its bottom edge. Slipped? Tap <b>Undo</b>.',
  },
  {
    tab: 'us', at: ['.tab[data-tab="us"]'],
    title: 'Us',
    text: () => `Your name, colour and character, your space code, <b>👉 reminders</b> for ${their()}, the home-screen widgets, pastel or galaxy, and <b>💭 app feedback</b>.`,
  },
  {
    at: ['#help-btn'],
    title: 'Help is always here',
    text: 'Tap <b>?</b> any time to take this tour again, or read the guide to everything in Human Doing.',
  },
];

export const GUIDE = {
  intro: 'Everything you can do in Human Doing. Tap a section to open it.',
  sections: [
    {
      icon: '📊', title: 'Tracking', sub: 'your trackers, day by day', color: 'pink', tab: 'track', tabName: 'Tracking',
      items: () => [
        '🗂️ A card for each tracker you switch on, for the day you pick in the strip (swipe back, or up to 30 days ahead to book leave).',
        '💼 <b>Work day</b>: working from home, in the office, overtime, leave, sick and your own types, each with hours. There\'s an overtime timer, and leave left shows as you log it.',
        '💧 <b>Water</b>, ☕ <b>caffeine</b> (with a cut-off time) and 💊 <b>medication</b> (taken, as needed, running low, and reminders on Android).',
        '👟 <b>Walk</b>: your walk options, a goal for the day, your streak, and on Android a nudge to get up after a while without one.',
        '🩸 <b>Cycle</b>: flow and symptoms, your phase and next period (worked out from your own logs), and period support. It\'s private until you choose: nothing, just the support, phase and support, or everything.',
        '💗 <b>Date nights</b>: how long since each of you planned one, <b>＋ Plan a date</b> (or a 🎁 surprise), <b>Can\'t this month</b>, photos, and a reminder.',
        '✨ <b>Your own trackers</b>: yes/no, a count, an amount, a scale, options or a note, plus ideas like exercise, skincare and reading.',
        `🔒 / 💞 by each card's name: just you, or shared with ${their()}. <b>✓ Done</b> folds a card away for the day. <b>✎ Edit</b> renames a card's buttons, puts them in order and ★ marks your main ones.`,
        '📅 <b>Month</b>: a sticker calendar of what you\'ve logged (choose which trackers show) and monthly tallies. The <b>work year</b> has hours worked, leave left and your work settings, and prints or saves a PDF.',
        `💞 <b>Mine / ${Their()}'s</b>: what ${their()} shares with you, with <b>👉 Remind</b> to nudge them.`,
        '🌙 <b>From Human Being</b>: your check-in\'s mood, sleep, tiredness, brain space and spoons, in the month view and a year page. Switch them on in your tracker list.',
      ],
    },
    {
      icon: '✅', title: 'To-Do', sub: 'lists for the two of you', color: 'mint', tab: 'todo', tabName: 'To-Do',
      items: () => [
        `📋 Lists like Home, Errands, Personal and Work, or your own: <b>💞 shared</b> (you both add and tick) or <b>🔒 just you</b>. <b>✎ lists</b> renames, reorders, recolours and adds them.`,
        '⚡ Type on <b>＋ Add to …</b> and press Enter to add tasks one after another.',
        `📝 Tap a task for its details: a sticker, who's doing it (you, ${their()} or both), a due date, a repeat, priority, notes and subtasks. <b>Put it on our Plan</b> gives it a time on your Plan calendar.`,
        '✋ Hold a task and drag it up or down to reorder, or to the right to make it a subtask. Drag a subtask left to make it a task again.',
        '🔁 Ticking off a repeating task moves it to its next date.',
        `📈 This week's progress bar, and <b>Everyone / Me / ${Their()}</b> to filter. <b>Done this week</b> lists finished tasks: untick, delete, or choose several to delete.`,
        `🔔 <b>Tell ${their()}</b> what's new on your shared lists.`,
      ],
    },
    {
      icon: '🗓️', title: 'Plan', sub: 'days, weeks and months', color: 'lavender', tab: 'plan', tabName: 'Plan',
      items: () => [
        '📋 Make as many plans as you like: <b>Daily</b> (hour by hour), <b>Weekly</b> (Monday to Sunday) or <b>Monthly</b> (a calendar). They\'re separate from Human Being\'s.',
        `💞 / 🔒 by each plan's name: shared with ${their()}, or just you.`,
        '➕ Tap ＋ or an empty spot to add an event: what it\'s for, an emoji and a sticker, the time, its colour and notes.',
        '✋ Hold an event for a moment, then drag it to move it, or stretch it from its bottom edge. <b>Undo</b> shows at the top after a move.',
        '🗓️ A week opens on the <b>whole week</b> at a glance; <b>🔍 Zoom in</b> gives each day more room.',
        '⚙ A plan\'s settings: its name, hours, snap, row size, first day of the week and what events show (name, emoji, sticker or a mix).',
        '🎨 Decorate plans with stickers. To-dos you put on the Plan show on your calendar.',
      ],
    },
    {
      icon: '💞', title: 'Us', sub: 'you two, and settings', color: 'peach', tab: 'us', tabName: 'Us',
      items: () => [
        '🙋 Your name, colour and character, and your <b>space code</b> (the same one as Human Being\'s). Keep it between you.',
        `👉 <b>Remind ${their()}</b> to log their work day, have water, take their meds, go for a walk, log their cycle, check their to-dos or do their Human Being check-in, or send your own words.`,
        '📱 <b>On your home screen</b>: Android widgets for Tracking, To-Do and Plan, plus single trackers you can tap to log (water, medication, work day…). iPhone works through the Scriptable app.',
        '🎨 <b>Preferences</b>: 🌷 pastel or 🌌 galaxy, bionic reading, and 12- or 24-hour time.',
        '💭 <b>App feedback</b>: notes on what to fix or add, ticked off together. The person who makes Human Doing reads them too.',
        '☁️ <b>Sync & backup</b>: sync now, save a copy of your data, and see which version you have. <b>📜 Every update</b> is at the very bottom.',
      ],
    },
    {
      icon: '🔔', title: 'On your phone', sub: 'notifications and widgets', color: 'sky',
      items: () => [
        `🔔 The Android app lets you know about reminders and news from ${their()}, your medication reminders, walk nudges and date-night reminders, even while it's closed.`,
        '🧩 Widgets you can tap: add water or coffee, mark medication taken, log your work day, tick off to-dos.',
        `✨ After an update, <b>What's new</b> shows what changed, and <b>🔔 Tell</b> lets ${their()} know.`,
      ],
    },
    {
      icon: '💡', title: 'Good to know', sub: 'little tips', color: 'butter',
      items: () => [
        '📶 It works offline: your changes stay on your phone and sync when you\'re back online.',
        '🔐 Only phones with your space code can see your things, and trackers stay private until you share them.',
        '🌷 <b>Human Being</b>, the sister app, uses the same code for daily check-ins, self-care maps and plans.',
        '💻 Human Doing also works as a website, laid out wide on a computer.',
      ],
    },
  ],
  foot: 'Tap ? at the top of any screen to come back here.',
};
