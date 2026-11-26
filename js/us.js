// Us: profile, partner invite, home-screen setup, preferences, sync status
// and backups.

import * as store from './store.js';
import { CONFIG } from './config.js';
import { $, colorVars, copyText, dayKey, esc, keyToDate, prefs, setPref, shiftDay, toast } from './util.js';
import { confirmSheet, swatchesHTML } from './ui.js';
import { inviteText } from './onboarding.js';
import { canShare, isNative, shareText, stopNative } from './native.js';
import { AVATARS, avatarHTML, avatarId, avatarPickerHTML } from './avatars.js';
import { usSticker } from './icons.js';
import { addFromFile, chooseShape, humanBeingItems, myItems, partnerItems, pickPhoto, removeMine } from './custom.js';
import { addTodo, readDay, readSettings, writeMyDay, writeSettings } from './docs.js';
import { iphoneOn, iphoneScript, setIphone } from './iphone.js';
import { mountFeedback } from './feedback.js';
import { openRemind } from './remind.js';
import { openWhatsNew, tellWhatsNew, versionNote } from './nudges.js';
import { APP, VERSION } from './about.js';
import { siteRow } from './guide.js';
import { isShortCode, startMove } from './spacemove.js';

// The iPhone widget script, made ahead so "Copy" works straight after the tap.
let iphoneText = null;
function makeIphoneScript() {
  if (isNative || iphoneText) return;
  iphoneScript().then(t => { iphoneText = t; }).catch(() => {});
}

const STATUS_TEXT = {
  idle: 'Getting ready…',
  synced: 'All synced 💞',
  saving: 'Saving…',
  offline: 'Offline — your changes are safe on this device and will sync later',
  error: "Couldn't reach the server — will keep trying",
};

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const kb = n => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB');

// On the test server: what's on this phone, what each person's phone gets,
// and how much this session has downloaded.
function syncDetails(them) {
  const st = store.getStats();
  const last = st.lastCheck;
  const rows = (slot, who) => store.listDocs(slot).map(d => {
    const shared = store.partnerReads(d.doc);
    return `<tr><td>${esc(who)}</td><td>${esc(d.doc)}</td><td><span class="tag ${shared ? 'shared' : 'private'}">${shared ? 'shared' : 'just ' + (slot === store.me() ? 'you' : 'them')}</span></td><td class="n">${kb(d.bytes)}</td></tr>`;
  }).join('');
  return `
    <details class="more sync-details" open>
      <summary>Sync details (test server)</summary>
      <p class="stats">
        This session: ${st.requests} requests · about ${kb(st.down)} down · ${kb(st.up)} up · ${st.docsDown} documents downloaded<br>
        ${last ? `Last check ${ago(last.at)}: ${last.full ? 'full' : 'quick'}, ${last.rows} changed row${last.rows === 1 ? '' : 's'}, ${last.docs} downloaded` : 'No check yet'}
        · quick check every ${CONFIG.pollMs / 1000} s
      </p>
      <table>
        <tr><th>Whose</th><th>Document</th><th>Seen by</th><th class="n">Size</th></tr>
        ${rows(store.me(), 'You')}${rows(store.partner(), them ? them.name : 'Your person')}
      </table>
      <div class="btn-row">
        <button type="button" class="btn ghost" data-act="test-data">Add test data</button>
        <button type="button" class="btn ghost" data-act="test-month">Add a month of test data</button>
        <button type="button" class="btn ghost" data-act="test-share">Share water</button>
        <button type="button" class="btn ghost" data-act="test-support">Share period support today</button>
        <button type="button" class="btn ghost" data-act="test-old">Add old sleep and mood (v1.2)</button>
        <button type="button" class="btn ghost" data-act="test-hb">Add Human Being check-ins</button>
        <button type="button" class="btn ghost" data-act="widgets">📱 Widget preview</button>
        <button type="button" class="btn ghost" data-act="iphone-test">🍎 iPhone widget preview</button>
      </div>
    </details>`;
}

export function createUs(root, { onTimeFormat, onTheme, onBionic } = {}) {
  root.innerHTML = '<div class="page us" id="u-page"></div>';
  const page = $('#u-page', root);
  // The profile pictures show one row (yours first) until "Show all".
  let avatarsOpen = false;

  function render() {
    const me = store.readMine('profile', {});
    const them = store.readPartner('profile', null);
    const sess = store.getSession();
    const status = store.getStatus();
    const hbItems = humanBeingItems();
    const wasOpen = [...page.querySelectorAll('details')].map(d => d.open);   // kept open when your person's changes redraw this
    page.innerHTML = `
      <h1 class="display">Us <span class="wave">${usSticker()}</span></h1>

      <section class="card" style="${colorVars(me.color)}">
        <div class="card-tape"></div>
        <h3 class="card-title">You</h3>
        <div class="profile-row">
          <span class="avatar big">${avatarHTML(me)}</span>
          <label class="field grow"><span>Your name</span>
            <input class="inp" id="u-name" maxlength="24" value="${esc(me.name || '')}" autocomplete="nickname"></label>
        </div>
        <div class="field"><span>Your colour</span>${swatchesHTML(me.color)}</div>
        <div class="field"><span class="field-row">Your profile picture
            <button type="button" class="link-btn av-more" data-act="avatars" aria-expanded="${avatarsOpen}">${avatarsOpen ? 'Show fewer ▴' : 'Show all ▾'}</button></span>
          <div class="av-fold${avatarsOpen ? '' : ' folded'}">${avatarPickerHTML(avatarId(me), colorVars(me.color), { selectedFirst: !avatarsOpen })}</div></div>
      </section>

      <section class="card" style="${colorVars(them ? them.color : 'lavender')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Your person</h3>
        ${them ? `
          <div class="profile-row">
            <span class="avatar big">${avatarHTML(them)}</span>
            <div><p class="big-name">${esc(them.name)}</p><p class="muted small">connected · sharing lists and plans, and the trackers you each choose</p></div>
          </div>` : `
          <p>Invite your person so you can share to-do lists and plans, and see the trackers you each choose to share.</p>`}
        <p class="muted small">Your space code${them ? '' : ' (the same one works in Human Being)'}</p>
        <div class="code-pill">${esc(sess.space)}</div>
        ${isShortCode(sess.space) ? '<button type="button" class="btn ghost" data-act="longer-code">🔑 Make our code longer</button>' : ''}
        ${them ? '' : '<button type="button" class="btn" data-act="invite">Copy invite</button>'}
        ${canShare() && !them ? '<button type="button" class="btn ghost" data-act="share">Share…</button>' : ''}
        ${them ? `<button type="button" class="btn ghost remind-us" data-act="remind">👉 Remind ${esc(them.name)}…</button>${versionNote()}` : ''}
      </section>

      <section class="card" style="${colorVars('peach')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Your sticker book</h3>
        <p class="muted small">Turn your photos into stickers for your plans. You can both use them — they're under ✨ Ours in the sticker drawer.</p>
        <div class="sbook">
          <button type="button" class="sbook-add" data-act="add-sticker">📷<small>add photo</small></button>
          ${myItems().map(i => `<div class="sbook-item"><img src="${i.src}"${i.shape ? ' class="shaped"' : ''} alt="" draggable="false"><button type="button" class="sbook-del" data-del-sticker="${i.id}" aria-label="Remove sticker">×</button></div>`).join('')}
        </div>
        ${them && partnerItems().length ? `
          <p class="muted small sbook-label">Made by ${esc(them.name)}</p>
          <div class="sbook">${partnerItems().map(i => `<div class="sbook-item"><img src="${i.src}"${i.shape ? ' class="shaped"' : ''} alt="" draggable="false"></div>`).join('')}</div>` : ''}
        ${hbItems.length ? `
          <p class="muted small sbook-label">From Human Being (change these there)</p>
          <div class="sbook">${hbItems.map(i => `<div class="sbook-item hb"><img src="${i.src}"${i.shape ? ' class="shaped"' : ''} alt="" draggable="false"></div>`).join('')}</div>` : ''}
      </section>

      <section class="card" style="${colorVars('mint')}">
        <div class="card-tape"></div>
        <h3 class="card-title">On your home screen</h3>
        ${isNative ? `
          <p>Long-press your home screen → <b>Widgets</b> → <b>Human Doing</b>. There's one each for <b>Tracking</b>, <b>To-Do</b> and <b>Plan</b>, and little ones you tap to log: Medication, Work day, Water, Caffeine, Walk, Cycle and your own trackers.</p>
          <p class="muted small">Long-press a widget and tap its settings to choose what it shows, its look and how see-through it is. Medication reminders are switched on there too.</p>
          <p class="muted small">${esc(them ? them.name : 'Your person')} on an iPhone? They can get widgets through the free Scriptable app: open Human Doing in Safari → Us → On your home screen.</p>` : `
          <h4>Add Human Doing as an app</h4>
          <ul class="steps">
            <li><b>Android:</b> open Human Doing in Chrome → menu ⋮ → <b>Add to Home screen</b> (or <b>Install app</b>).</li>
            <li><b>iPhone:</b> open Human Doing in Safari → Share <span aria-hidden="true">⬆️</span> → <b>Add to Home Screen</b>.</li>
          </ul>
          <h4>Widgets</h4>
          <p>On Android, the widgets come with the <b>Human Doing Android app</b>: Tracking, To-Do and Plan, and little ones you tap to log.</p>
          <details class="more"${iphoneOn() ? ' open' : ''}>
            <summary>On an iPhone?</summary>
            <ol class="steps">
              <li>Install the free <b>Scriptable</b> app from the App Store.</li>
              <li>Tap <b>Copy widget script</b> below.</li>
              <li>In Scriptable, tap <b>＋</b>, paste, and call the script <b>Human Doing</b>.</li>
              <li>Long-press your home screen → <b>＋</b> → <b>Scriptable</b> → pick a size → <b>Add Widget</b>.</li>
              <li>Long-press the new widget → <b>Edit Widget</b> → Script: <b>Human Doing</b>. Under <b>Parameter</b>, say what it shows (or leave it empty for your trackers):</li>
            </ol>
            <ul class="param-list">
              <li><code>todo</code> your lists (or <code>todo Home</code> for one group, <code>todo mine</code>)</li>
              <li><code>plan</code> up next (or <code>plan today</code>, <code>plan week</code>)</li>
              <li><code>meds</code> <code>work</code> <code>water</code> <code>caffeine</code> <code>walk</code> <code>cycle</code> one tracker, or your own tracker's name</li>
              <li><code>cycle discreet</code> just the wheel, a flower and a number</li>
              <li><code>water them</code> add <b>them</b> for ${esc(them ? them.name + "'s" : "your person's")} (only what they share)</li>
            </ul>
            <p class="muted small">Add as many as you like, on the lock screen too. They show things only (tap one to open Human Doing) and look for changes about every 20 minutes.</p>
            <button type="button" class="btn" data-act="copy-iphone">Copy widget script</button>
            ${iphoneOn() ? '<button type="button" class="btn ghost" data-act="stop-iphone">Stop updating the iPhone widgets</button>' : ''}
          </details>`}
      </section>

      <section class="card" style="${colorVars('butter')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Preferences</h3>
        <div class="field"><span>Look</span>
          <div class="seg wide" data-pref="theme">
            <button type="button" data-v="auto" class="${!prefs.theme || prefs.theme === 'auto' ? 'on' : ''}">Auto</button>
            <button type="button" data-v="light" class="${prefs.theme === 'light' ? 'on' : ''}">🌷 Pastel</button>
            <button type="button" data-v="dark" class="${prefs.theme === 'dark' ? 'on' : ''}">🌌 Galaxy</button>
          </div></div>
        <div class="field"><span>Reading</span>
          <div class="seg wide" data-pref="bionic">
            <button type="button" data-v="off" class="${prefs.bionic ? '' : 'on'}">Normal</button>
            <button type="button" data-v="on" class="${prefs.bionic ? 'on' : ''}"><b>Bio</b>nic <b>rea</b>ding</button>
          </div>
          <small class="muted pref-hint">Bolds the start of each word to help your eyes glide along.</small></div>
        <div class="field bionic-level"${prefs.bionic ? '' : ' hidden'}><span>Bold strength</span>
          <div class="seg wide" data-pref="bionicLevel">
            ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" class="${(prefs.bionicLevel || 3) === n ? 'on' : ''}">F${n}</button>`).join('')}
          </div>
          <small class="muted pref-hint">F1 bolds the most of each word, F5 the least.</small></div>
        <div class="field"><span>Time format</span>
          <div class="seg wide" data-pref="hour12">
            <button type="button" data-v="auto" class="${typeof prefs.hour12 !== 'boolean' ? 'on' : ''}">Auto</button>
            <button type="button" data-v="12" class="${prefs.hour12 === true ? 'on' : ''}">12-hour</button>
            <button type="button" data-v="24" class="${prefs.hour12 === false ? 'on' : ''}">24-hour</button>
          </div></div>
      </section>

      <section class="card fb-card" id="u-fb" style="${colorVars('lavender')}"></section>

      <section class="card" style="${colorVars('sky')}">
        <div class="card-tape"></div>
        <h3 class="card-title">Sync & backup</h3>
        <p class="muted small app-ver">📱 You're using <b>${APP} ${VERSION}</b>, ${isNative ? 'the Android app' : 'the website'}.</p>
        ${siteRow()}
        <p class="sync-line" data-state="${status.state}"><span class="dot"></span><span id="u-status">${esc(STATUS_TEXT[status.state] || '')}</span></p>
        ${CONFIG.mock ? '<p class="muted small">Using the local test server (mock mode).</p>' : ''}
        <div class="btn-row">
          <button type="button" class="btn ghost" data-act="sync">Sync now</button>
          <button type="button" class="btn ghost" data-act="backup">${isNative ? 'Share a backup' : 'Download my data'}</button>
        </div>
        <button type="button" class="btn ghost danger-text" data-act="signout">Sign out on this device</button>
        ${CONFIG.mock ? syncDetails(them) : ''}
      </section>

      <p class="footer-note">made with 💗 for two<br><button type="button" class="link-btn" data-act="whats-new">📜 ${APP} ${VERSION}: every update</button></p>`;
    mountFeedback($('#u-fb', page));
    page.querySelectorAll('details').forEach((d, i) => { if (i < wasOpen.length) d.open = wasOpen[i]; });
    makeIphoneScript();
  }

  page.addEventListener('input', e => {
    if (e.target.id === 'u-name') {
      const p = store.readMine('profile', {});
      p.name = e.target.value.trim() || p.name;
      store.writeMine('profile', p);
    }
  });

  page.addEventListener('click', async e => {
    const sw = e.target.closest('.sw');
    if (sw) {
      const p = store.readMine('profile', {});
      p.color = sw.dataset.color;
      store.writeMine('profile', p);
      render();
      return;
    }
    const av = e.target.closest('[data-avatar]');
    if (av) {
      const p = store.readMine('profile', {});
      p.avatar = av.dataset.avatar;
      p.emoji = AVATARS[p.avatar].emoji;   // text stand-in for widgets
      store.writeMine('profile', p);
      render();
      return;
    }
    const pref = e.target.closest('[data-pref] button');
    if (pref) {
      const v = pref.dataset.v;
      pref.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === pref));
      if (pref.parentElement.dataset.pref === 'theme') {
        setPref('theme', v);
        onTheme && onTheme();
      } else if (pref.parentElement.dataset.pref === 'bionic') {
        setPref('bionic', v === 'on');
        root.querySelector('.bionic-level').hidden = v !== 'on';
        onBionic && onBionic();
      } else if (pref.parentElement.dataset.pref === 'bionicLevel') {
        setPref('bionicLevel', Number(v));
        onBionic && onBionic();
      } else {
        setPref('hour12', v === 'auto' ? null : v === '12');
        onTimeFormat && onTimeFormat();
      }
      return;
    }
    const del = e.target.closest('[data-del-sticker]');
    if (del) {
      const ok = await confirmSheet('Remove this sticker?', "It'll disappear from your sticker book and anywhere it's been placed.", { ok: 'Remove', danger: true });
      if (ok) { removeMine(del.dataset.delSticker); render(); }
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    switch (act) {
      case 'avatars': avatarsOpen = !avatarsOpen; render(); break;
      case 'add-sticker': {
        const file = await pickPhoto();
        if (!file) break;
        try {
          const shape = await chooseShape(file);
          if (!shape) break;
          await addFromFile(file, shape);
          render();
          toast(shape === 'own' ? 'Sticker made — it kept its own shape ✨' : 'Photo sticker made ✨');
        } catch (err) {
          toast("Couldn't use that photo — try another one");
        }
        break;
      }
      case 'remind': openRemind(); break;
      case 'longer-code': startMove(); break;
      case 'whats-new': openWhatsNew(); break;
      case 'tell-new': tellWhatsNew(); break;
      case 'invite': {
        const ok = await copyText(inviteText());
        toast(ok ? 'Invite copied — send it to your person 💌' : 'Could not copy — share the code instead');
        break;
      }
      case 'share':
        shareText('Human Doing', inviteText());
        break;
      case 'sync':
        toast('Syncing…');
        await store.syncNow();
        toast(STATUS_TEXT[store.getStatus().state] || 'Done');
        render();
        break;
      case 'test-data': {
        // A day of trackers and a shared to-do (test server only).
        const day = dayKey();
        writeMyDay(day, 'work', { wfh: 7.5, overtime: 1 });
        writeMyDay(day, 'water', 5);
        const group = addTodo('group', { name: 'Home', emoji: '🏡', color: 'mint' });
        const task = addTodo('task', { group, title: 'Deep clean the bathroom', who: [store.me()] });
        addTodo('sub', { task, title: 'Scrub the shower' });
        addTodo('group', { name: 'Personal', emoji: '🌷', color: 'pink', private: true });
        toast('Test data added');
        render();
        break;
      }
      case 'test-month': {
        // Six weeks of every built-in tracker, two periods 28 days apart and
        // two days of leave booked ahead, for the month view (test server only).
        const s = readSettings();
        s.trackers.on = { ...s.trackers.on, work: true, cycle: true, water: true, caffeine: true, meds: true };
        if (!s.meds.length) {
          s.meds = [
            { id: 'med-vitd', name: 'Vitamin D', dose: '1 tablet', time: '08:00', asNeeded: false, left: 40, lowAt: 5 },
            { id: 'med-iron', name: 'Iron', dose: '1 tablet', time: '20:00', asNeeded: false, left: 4, lowAt: 5 },
            { id: 'med-anti', name: 'Antihistamine', dose: '', time: '', asNeeded: true, left: null, lowAt: 5 },
          ];
        }
        writeSettings(s);
        const today = dayKey();
        const at = (k, h, m) => { const d = keyToDate(k); d.setHours(h, m, 0, 0); return d.getTime(); };
        const flows = ['medium', 'heavy', 'heavy', 'medium', 'light'];
        for (let i = 44; i >= 0; i--) {
          const k = shiftDay(today, -i), wd = keyToDate(k).getDay(), r = (i * 7 + 3) % 11;
          if (wd >= 1 && wd <= 5) writeMyDay(k, 'work', i === 9 ? { sick: 7.5 } : { [i % 3 ? 'wfh' : 'office']: 7.5, ...(r === 2 || r === 7 ? { overtime: 1.5 } : {}) });
          writeMyDay(k, 'water', { n: 3 + (r % 6), at: [] });
          const cups = 1 + (r % 3);
          writeMyDay(k, 'caffeine', { n: cups, at: [at(k, 8, 30), at(k, 11, 5), at(k, 13, 10 + r * 3)].slice(0, cups) });
          writeMyDay(k, 'meds', { 'med-vitd': [at(k, 8, 5)], ...(r === 5 ? {} : { 'med-iron': [at(k, 20, 10)] }), ...(r === 8 ? { 'med-anti': [at(k, 15, 0)] } : {}) });
          const p = i >= 39 && i <= 43 ? 43 - i : i >= 11 && i <= 15 ? 15 - i : -1;
          const sym = i >= 16 && i <= 18 ? ['bloating', 'cravings'] : p === 0 || p === 1 ? ['cramps'] : null;
          if (p >= 0 || sym) writeMyDay(k, 'cycle', { ...(p >= 0 ? { flow: flows[p] } : {}), ...(sym ? { symptoms: sym } : {}), ...(p === 0 || p === 1 ? { support: ['heat', 'choc'] } : {}) });
        }
        for (const n of [4, 11]) writeMyDay(shiftDay(today, n), 'work', { annual: 7.5 });
        toast('A month of test data added');
        render();
        break;
      }
      case 'test-support': {
        // Your person sees "could use" with these (test server only).
        const s = readSettings();
        if (s.cycle.share === 'none') s.cycle.share = 'support';
        s.trackers.on = { ...s.trackers.on, cycle: true };
        writeSettings(s);
        const day = dayKey();
        const v = readDay(store.me(), day);
        writeMyDay(day, 'cycle', { ...(v.cycle || {}), support: ['heat', 'choc'] });
        toast('Period support shared for today');
        render();
        break;
      }
      case 'test-old': {
        // Sleep and mood as v1.2 logged them, shared, and the clean-up not run
        // yet: reload to see it clear them (test server only).
        const s = readSettings();
        s.version = 1;
        s.trackers.order = [...s.trackers.order.filter(x => x !== 'sleep' && x !== 'mood'), 'sleep', 'mood'];
        s.trackers.on = { ...s.trackers.on, sleep: true, mood: true };
        s.trackers.share = { ...s.trackers.share, sleep: true, mood: true };
        s.trackers.tally = { ...s.trackers.tally, mood: true };
        writeSettings(s);
        for (let i = 6; i >= 0; i--) {
          const k = shiftDay(dayKey(), -i);
          writeMyDay(k, 'mood', [['happy', 'calm', 'sad'][i % 3]]);
          writeMyDay(k, 'moodAt', { [['happy', 'calm', 'sad'][i % 3]]: Date.now() - i * 864e5 });
          writeMyDay(k, 'sleep', { bed: '23:00', up: '07:00', rested: 1 + (i % 5) });
        }
        toast('Old sleep and mood added: reload to clear them');
        render();
        break;
      }
      case 'test-hb': {
        // Human Being check-ins for you both since January (test server only),
        // written straight into the fake table as Human Being would: the last
        // few weeks in "checkins", older days in "checkins-<year>".
        const sess = store.getSession();
        const moods = ['happy', 'calm', 'okay', 'love', 'sleepy', 'happy', 'anxious', 'calm', 'excited', 'okay', 'sad', 'happy', 'grumpy', 'calm', 'sick'];
        const bias = [0, -1, -2, -1, 0, 2, 1, 1, 0, -1, 0, 0];
        const ten = n => Math.max(1, Math.min(10, n));
        const today = dayKey(), keep = shiftDay(today, -45), now = Date.now();
        const rows = [];
        for (const slot of ['a', 'b']) {
          const docs = { checkins: {} };
          for (let k = '2026-01-01'; k <= today; k = shiftDay(k, 1)) {
            const d = keyToDate(k), m = d.getMonth(), n = d.getDate(), x = slot === 'a' ? 0 : 5;
            if ((n * 7 + m + x) % 11 === 3) continue;   // a day without a check-in now and then
            const entry = {
              mood: moods[(m * 7 + n * 3 + x + (n % 4)) % moods.length],
              sleep: ten(4 + ((m * 5 + n * 7 + x) % 6) + bias[m]), rating: ten(3 + ((m * 3 + n * 5 + x) % 7)), spoons: ten(4 + ((m * 4 + n * 2 + x) % 6) - bias[m]),
              tired: ten(3 + ((m * 6 + n * 4 + x) % 7) - bias[m]),
              updated: now,
            };
            // Since Human Being 1.1 a check-in can hold several moods (the first stays in "mood").
            entry.moods = n % 5 === 0 ? [entry.mood, moods[(n + m) % moods.length]].filter((v, i, a) => a.indexOf(v) === i) : [entry.mood];
            const doc = k >= keep ? 'checkins' : `checkins-${k.slice(0, 4)}`;
            (docs[doc] = docs[doc] || {})[k] = entry;
          }
          for (const [doc, d] of Object.entries(docs)) rows.push({ key: `tend:${sess.space}:p:${slot}:${doc}`, value: JSON.stringify({ t: now, d }), updated_at: new Date().toISOString() });
        }
        await fetch(location.origin + '/rest/v1/' + CONFIG.table, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-space': sess.space }, body: JSON.stringify(rows) });
        await store.pull({ full: true });
        toast('Human Being check-ins added for you both');
        render();
        break;
      }
      case 'widgets':
        import('./widget-preview.js').then(m => m.openWidgetPreview());
        break;
      case 'iphone-test':
        window.open('tools/iphone-widget-test.html', '_blank');
        break;
      case 'copy-iphone': {
        // Copy straight away (Safari only allows it right after the tap), so the script is made ahead.
        const script = iphoneText || await iphoneScript().catch(() => null);
        const ok = script ? await copyText(script) : false;
        if (ok) { setIphone(true); render(); }
        toast(ok ? 'Widget script copied: paste it into Scriptable 📱' : 'Could not copy the script. Try again in a moment.');
        break;
      }
      case 'stop-iphone': {
        const ok = await confirmSheet('Stop updating the iPhone widgets?', 'Your trackers will stop showing on them (your lists and plans still will). Copy the script again to start again.', { ok: 'Stop' });
        if (ok) { setIphone(false); render(); }
        break;
      }
      case 'test-share': {
        const s = readSettings();
        s.trackers.share.water = !s.trackers.share.water;
        writeSettings(s);
        toast(s.trackers.share.water ? 'Water is shared now' : 'Water is private again');
        render();
        break;
      }
      case 'backup': {
        const json = JSON.stringify(store.exportMine(), null, 2);
        if (isNative) { shareText(`Human Doing backup ${dayKey()}`, json); break; }   // WebViews can't download files
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `human-doing-backup-${dayKey()}.json`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        break;
      }
      case 'signout': {
        const pending = store.getStatus().pending;
        const ok = await confirmSheet('Sign out on this device?',
          pending
            ? `You have ${pending} change${pending > 1 ? 's' : ''} that haven't synced yet and would be lost. Your space stays safe — you can sign back in with your code.`
            : 'Your data stays safe in your space — sign back in any time with your code.',
          { ok: 'Sign out', danger: true });
        if (!ok) return;
        stopNative();
        store.signOut();
        location.hash = '';
        location.reload();
        break;
      }
    }
  });

  store.onStatus(s => {
    const line = page.querySelector('.sync-line');
    if (!line) return;
    line.dataset.state = s.state;
    const el = page.querySelector('#u-status');
    if (el) el.textContent = (STATUS_TEXT[s.state] || '') + (s.state === 'synced' ? ' · ' + ago(s.at) : '');
  });

  store.on((k, source) => {
    if (source === 'remote' && root.classList.contains('active')) {
      const typing = document.activeElement && page.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
      if (!typing) render();
    }
  });

  return { show: render };
}
