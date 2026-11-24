// "Your trackers": switch trackers on and off, drag them into order, open one
// for its settings (sharing, monthly tally, goal), add a ready-made idea, or
// make your own. Every tracker starts private.

import * as store from './store.js';
import { COLOR_KEYS, clamp, colorVars, esc, toast, uid, vibrate } from './util.js';
import { confirmSheet, dragSort, markSwatch, moved, openSheet, swatchesHTML } from './ui.js';
import { BUILT_IN, caffeineCutoff, readSettings, writeSettings } from './docs.js';
import { IDEAS, STICKERS, TYPES, describe, fromIdea, ownIcon, parseOptions } from './own.js';
import { stickerSrc } from './stickers.js';
import { shareRadios } from './cycle.js';
import { NUDGE_EVERY, walkSettings } from './walk.js';
import { bridge, isNative } from './native.js';
import { HB, hbIcon, hbOn } from './moodsleep.js';

const BUILT_IN_DESC = {
  work: 'WFH, office, overtime, leave + hours', cycle: 'periods, symptoms, phase predictions', water: 'glasses a day',
  caffeine: 'cups and time of the last one', meds: 'doses, running-low alerts', walk: 'get up for a walk, with nudges',
  dates: 'how long since each of you planned one, photos, a reminder',
};
const partnerName = () => store.readPartner('profile', null)?.name || 'your person';
const shareRow = (flag, on, label, hint) => `
  <div class="share-row"><span>${label}<small>${hint}</small></span>
    <button type="button" class="tgl${on ? ' on' : ''}" data-flag="${flag}" role="switch" aria-checked="${!!on}" aria-label="${esc(label.replace(/<[^>]+>/g, ''))}"></button></div>`;

// Under a tracker's preview.
const PREVIEW_NOTE = {
  work: 'An example. You tap the kinds of day it was, then set the hours.',
  cycle: 'An example. Your phases show once you log a period, and it stays private until you choose to share.',
  meds: 'An example. Once it\'s on, you add your own medicines.',
  walk: 'An example. Your walks and nudges are in the settings underneath.',
  dates: 'An example. Your dates, photos and reminder are on its page.',
};

/**
 * Opens the tracker list. iconFor(def) draws a tracker's icon, preview(id,
 * def) its card from example data, onMeds opens the medicines sheet, onWork
 * the work year, onClose redraws the page behind.
 */
export function openTrackerList({ iconFor, preview, onMeds, onWork, onClose }) {
  const sheet = openSheet({ title: 'Your trackers', className: 'tracker-sheet', body: '<div class="tl-lists"></div><div class="tl-make"></div>', onClose });
  const lists = sheet.el.querySelector('.tl-lists');
  const make = sheet.el.querySelector('.tl-make');

  // Built-in ideas (Walk) join the list once you've switched them on.
  const defs = s => [...BUILT_IN.filter(d => !d.idea || d.id in s.trackers.on), ...s.trackers.own];
  function rowHTML(def, s) {
    const on = !!s.trackers.on[def.id];
    const shared = def.id === 'cycle' ? s.cycle.share !== 'none' : !!s.trackers.share[def.id];
    const tags = [shared ? '💞 shared' : '', s.trackers.tally[def.id] ? '📊 tally' : ''].filter(Boolean).join(' · ');
    return `<div class="tk-item${on ? '' : ' off'}" data-id="${esc(def.id)}">
      <span class="grip" aria-hidden="true">⋮⋮</span>${iconFor(def)}
      <button type="button" class="tk-open" data-open="${esc(def.id)}"><b>${esc(def.name)}</b><small>${tags ? `<em>${tags}</em> · ` : ''}${esc(BUILT_IN_DESC[def.id] || describe(def))}</small></button>
      <button type="button" class="tgl${on ? ' on' : ''}" data-tgl="${esc(def.id)}" role="switch" aria-checked="${on}" aria-label="${esc(def.name)}"></button></div>`;
  }

  function drawLists() {
    const s = readSettings();
    const all = defs(s);
    const ordered = [...s.trackers.order.map(id => all.find(d => d.id === id)).filter(Boolean), ...all.filter(d => !s.trackers.order.includes(d.id))];
    const ideas = IDEAS.filter(i => !s.trackers.own.some(d => d.idea === i.idea));
    const built = BUILT_IN.filter(d => d.idea && !(d.id in s.trackers.on));
    lists.innerHTML = `
      <p class="muted small sheet-hint">Switch on what you want to track. Drag ⋮⋮ to change the order, and tap one to see what it looks like. Everything starts private.</p>
      <div class="tk-list" id="tl-main" style="${colorVars('mint')}">${ordered.map(d => rowHTML(d, s)).join('')}</div>
      <div class="list-cap">From Human Being <img class="hb-cap" src="icons/hb-icon.svg" alt=""></div>
      <div class="tk-list" style="${colorVars('lavender')}">${HB.map(h => {
        const on = !!hbOn(s)[h.key];
        return `<div class="tk-item${on ? '' : ' off'}"><span class="grip"></span>${hbIcon(h)}
          <div class="tk-open"><b>${esc(h.name)}</b><small>${esc(h.desc)}</small></div>
          <button type="button" class="tgl${on ? ' on' : ''}" data-hb="${h.key}" role="switch" aria-checked="${on}" aria-label="${esc(h.name)} from Human Being"></button></div>`;
      }).join('')}</div>
      <p class="note-sm hb-note">You log these in Human Being's check-in. Here they show on your month and year views (and your person's, from their check-ins).</p>
      ${ideas.length || built.length ? `<div class="list-cap">More ideas</div>
        <div class="tk-list" style="${colorVars('mint')}">${built.map(d => `
          <div class="tk-item off"><span class="grip"></span>${iconFor(d)}<button type="button" class="tk-open" data-peek="${esc(d.id)}"><b>${esc(d.name)}</b><small>${esc(BUILT_IN_DESC[d.id] || '')}</small></button>
            <button type="button" class="tgl" data-tgl="${esc(d.id)}" role="switch" aria-checked="false" aria-label="Add ${esc(d.name)}"></button></div>`).join('')}${ideas.map(i => `
          <div class="tk-item off"><span class="grip"></span>${ownIcon(i)}<button type="button" class="tk-open" data-peek-idea="${i.idea}"><b>${esc(i.name)}</b><small>${esc(i.desc)}</small></button>
            <button type="button" class="tgl" data-idea="${i.idea}" role="switch" aria-checked="false" aria-label="Add ${esc(i.name)}"></button></div>`).join('')}</div>` : ''}`;
  }

  // ── drag ⋮⋮ to reorder ─────────────────────────────────────────────────
  lists.addEventListener('pointerdown', e => {
    const grip = e.target.closest('#tl-main .grip');
    if (!grip) return;
    const items = [...grip.closest('.tk-list').children];
    dragSort(e, grip, items, grip.closest('.tk-item'), (from, to) => {
      const s = readSettings();
      s.trackers.order = moved(items.map(el => el.dataset.id), from, to);
      writeSettings(s);
      vibrate(8);
      drawLists();
    });
  });

  lists.addEventListener('click', e => {
    const hb = e.target.closest('[data-hb]');
    if (hb) {
      const s = readSettings();
      const cur = hbOn(s);
      s.trackers.hb = { ...cur, [hb.dataset.hb]: !cur[hb.dataset.hb] };
      writeSettings(s);
      drawLists();
      return;
    }
    const tgl = e.target.closest('[data-tgl]');
    if (tgl) {
      const s = readSettings();
      const id = tgl.dataset.tgl;
      s.trackers.on = { ...s.trackers.on, [id]: !s.trackers.on[id] };
      if (!s.trackers.order.includes(id)) s.trackers.order = [...s.trackers.order, id];
      writeSettings(s);
      drawLists();
      return;
    }
    const idea = e.target.closest('[data-idea]');
    if (idea) {
      const def = fromIdea(IDEAS.find(i => i.idea === idea.dataset.idea));
      addTracker(def, { tally: false, share: false });
      toast(`${def.name} added ✨`);
      drawLists();
      return;
    }
    // A tracker that's off (or an idea): its preview first; one that's on: its settings.
    const peek = e.target.closest('[data-peek]');
    if (peek) { openPreview({ id: peek.dataset.peek }); return; }
    const peekIdea = e.target.closest('[data-peek-idea]');
    if (peekIdea) { openPreview({ idea: peekIdea.dataset.peekIdea }); return; }
    const open = e.target.closest('[data-open]');
    if (open) {
      if (readSettings().trackers.on[open.dataset.open]) openSettings(open.dataset.open);
      else openPreview({ id: open.dataset.open });
    }
  });

  // ── a preview before you switch one on ─────────────────────────────────
  // Its card drawn from example data, Turn it on, and its settings underneath
  // (greyed until it's on). An idea is made when you turn it on.
  function openPreview({ id, idea }) {
    const ideaDef = idea ? fromIdea(IDEAS.find(i => i.idea === idea)) : null;
    const tid = ideaDef ? ideaDef.id : id;
    const builtIn = BUILT_IN.find(d => d.id === tid);
    const ownDef = () => readSettings().trackers.own.find(d => d.id === tid) || ideaDef;
    const first = builtIn || ownDef();
    if (!first) return;
    const flags = { share: false, tally: false };   // an idea's, until it's made
    const sub = openSheet({ title: first.name, body: '<div class="tk-preview"></div>', onClose: drawLists });
    const box = sub.el.querySelector('.tk-preview');
    const draw = () => {
      const st = readSettings();
      const made = !ideaDef || st.trackers.own.some(d => d.id === tid);
      const on = made && !!st.trackers.on[tid];
      const def = builtIn || ownDef();
      box.innerHTML = `
        <div class="preview-tag">Preview · how it'll look on your day</div>
        <div class="preview-box" inert>${preview ? preview(tid, builtIn ? undefined : def) : ''}</div>
        <p class="muted small preview-note">${esc(PREVIEW_NOTE[tid] || 'An example of a day.')}</p>
        ${on ? '<button type="button" class="btn big ghost" disabled>✓ It\'s on</button>'
          : `<button type="button" class="btn big turn-on" data-turn-on style="${colorVars(def.color)}">Turn it on</button>`}
        <div class="preview-settings${on ? '' : ' dim'}"></div>`;
      const set = box.querySelector('.preview-settings');
      if (builtIn) { settingsBox(set, tid, { onMeds, onWork: () => { sub.close(); sheet.close(); onWork(); } }); return; }
      const cur = made ? { share: !!st.trackers.share[tid], tally: !!st.trackers.tally[tid] } : flags;
      set.innerHTML = `${shareRow('tally', cur.tally, '📊 Monthly tally', 'adds it up on the month view')}
        ${shareRow('share', cur.share, `Share with ${esc(partnerName())}`, 'off until you switch it on')}
        ${made ? '<button type="button" class="btn ghost" data-edit-own>✎ Change it (name, sticker, kind)</button>' : ''}`;
    };
    draw();
    box.addEventListener('click', e => {
      if (e.target.closest('[data-turn-on]')) {
        const st = readSettings();
        if (ideaDef && !st.trackers.own.some(d => d.id === tid)) addTracker(ideaDef, flags);
        else {
          st.trackers.on = { ...st.trackers.on, [tid]: true };
          if (!st.trackers.order.includes(tid)) st.trackers.order = [...st.trackers.order, tid];
          writeSettings(st);
        }
        vibrate(8);
        toast(`${first.name} is on ✨`);
        draw();
        return;
      }
      if (builtIn) return;   // its settings box handles the rest
      const flag = e.target.closest('[data-flag]')?.dataset.flag;
      if (flag) {
        const st = readSettings();
        if (st.trackers.own.some(d => d.id === tid)) {
          st.trackers[flag] = { ...st.trackers[flag], [tid]: !st.trackers[flag][tid] };
          writeSettings(st);
        } else flags[flag] = !flags[flag];
        draw();
        return;
      }
      if (e.target.closest('[data-edit-own]')) { sub.close(); openOwnEditor(ownDef()); }
    });
  }

  // ── one tracker's settings ─────────────────────────────────────────────
  function openSettings(id) {
    const own = readSettings().trackers.own.find(d => d.id === id);
    if (own) { openOwnEditor(own); return; }
    builtInSettings(id, { onMeds, onWork: () => { sheet.close(); onWork(); }, onClose: drawLists });
  }

  // ── make your own (and edit it later) ──────────────────────────────────
  function addTracker(def, { tally, share }) {
    const s = readSettings();
    s.trackers.own = [...s.trackers.own, def];
    s.trackers.order = [...s.trackers.order.filter(x => x !== def.id), def.id];
    s.trackers.on = { ...s.trackers.on, [def.id]: true };
    s.trackers.tally = { ...s.trackers.tally, [def.id]: !!tally };
    s.trackers.share = { ...s.trackers.share, [def.id]: !!share };
    writeSettings(s);
  }

  function ownForm(box, def, { onSave, onDelete }) {
    const s = readSettings();
    const draft = def
      ? { ...def, tally: !!s.trackers.tally[def.id], share: !!s.trackers.share[def.id] }
      : { name: '', sticker: 'wateringcan', color: 'mint', type: 'yesno', tally: true, share: false };
    const extras = () => {
      switch (draft.type) {
        case 'count': return `<div class="field two">
            <label><span>Daily goal <span class="field-hint">· optional</span></span><input class="inp" type="number" min="0" name="goal" value="${draft.goal ?? ''}" inputmode="numeric"></label>
            <label><span>Each tap adds</span><input class="inp" type="number" min="1" name="step" value="${draft.step || 1}" inputmode="numeric"></label></div>`;
        case 'amount': return `<div class="field two">
            <label><span>Unit</span><input class="inp" name="unit" maxlength="12" value="${esc(draft.unit || '')}" placeholder="h, mg, km"></label>
            <label><span>Each tap adds</span><input class="inp" type="number" min="0.1" step="any" name="step" value="${draft.step || 1}" inputmode="decimal"></label></div>`;
        case 'scale': return `<div class="field"><span>Scale</span><div class="seg wide" data-max>
            <button type="button" data-v="5" class="${(draft.max || 5) === 5 ? 'on' : ''}">1 to 5</button><button type="button" data-v="10" class="${draft.max === 10 ? 'on' : ''}">1 to 10</button></div></div>`;
        case 'options': return `<label class="field"><span>Options <span class="field-hint">· separate with commas</span></span>
            <input class="inp" name="options" maxlength="200" value="${esc((draft.options || []).map(o => o.label).join(', '))}" placeholder="e.g. 🚶 Walk, 🏃 Run, 🧘 Yoga"></label>
            <div class="field two">
              <label><span>Also how long? <span class="field-hint">· unit</span></span><input class="inp" name="amountUnit" maxlength="12" value="${esc(draft.amountUnit || '')}" placeholder="min"></label>
              <label><span>Each tap adds</span><input class="inp" type="number" min="1" name="step" value="${draft.step || 15}" inputmode="numeric"></label></div>`;
        default: return '';
      }
    };
    const draw = () => {
      box.innerHTML = `
        <form class="own-tracker-form" novalidate>
          ${preview ? '<div class="preview-tag">Preview</div><div class="preview-box own-preview" inert></div>' : ''}
          <label class="field"><span>Name</span><input class="inp" name="name" maxlength="28" value="${esc(draft.name)}" placeholder="e.g. Plant watering" autocomplete="off"></label>
          <div class="field"><span>Sticker</span><div class="icon-row stk-row">
            ${STICKERS.map(n => `<button type="button" class="icon-pick${draft.sticker === n ? ' on' : ''}" data-stk="${n}" aria-label="${n}"><img src="${stickerSrc(n)}" alt="" draggable="false"></button>`).join('')}
            <input class="inp emoji-pick${draft.sticker ? '' : ' on'}" name="emoji" maxlength="8" value="${esc(draft.sticker ? '' : draft.emoji || '')}" placeholder="😊" aria-label="Or an emoji"></div></div>
          <div class="field"><span>Colour</span>${swatchesHTML(draft.color)}</div>
          <div class="field"><span>How do you track it?</span>
            <div class="type-pick six">${TYPES.map(t => `<button type="button" class="type-opt${draft.type === t.id ? ' on' : ''}" data-type="${t.id}"><span class="type-art">${t.art}</span><b>${t.name}</b><small>${t.hint}</small></button>`).join('')}</div></div>
          <div class="type-extra">${extras()}</div>
          ${shareRow('tally', draft.tally, '📊 Monthly tally', 'adds it up on the month view')}
          ${shareRow('share', draft.share, `Share with ${esc(partnerName())}`, 'off until you switch it on')}
          <p class="ob-err own-err" hidden></p>
          <div class="sheet-actions">
            ${onDelete ? '<button type="button" class="btn ghost danger-text" data-del>Delete</button>' : ''}
            <button type="submit" class="btn" style="${colorVars('lavender')}">${def ? 'Save' : 'Add tracker'}</button>
          </div>
        </form>`;
    };
    // Typed values survive redraws (switching the kind of tracker redraws the extras).
    const keepTyped = () => {
      const f = box.querySelector('form');
      if (!f) return;
      const val = n => f.elements.namedItem(n)?.value;
      draft.name = val('name') ?? draft.name;
      if (val('goal') !== undefined) draft.goal = val('goal') === '' ? null : Number(val('goal'));
      if (val('step') !== undefined) draft.step = Number(val('step')) || 1;
      if (val('unit') !== undefined) draft.unit = val('unit').trim();
      if (val('amountUnit') !== undefined) draft.amountUnit = val('amountUnit').trim();
      if (val('options') !== undefined) draft.options = parseOptions(val('options'), draft.options || []);
    };
    // The tracker as it stands (also what's saved).
    const build = () => {
      const out = { id: def ? def.id : 'own-' + uid(), name: draft.name.trim(), color: draft.color || COLOR_KEYS[0], type: draft.type };
      if (def && def.idea) out.idea = def.idea;
      if (draft.sticker) out.sticker = draft.sticker; else out.emoji = draft.emoji || '✨';
      if (draft.type === 'count') { if (draft.goal) out.goal = draft.goal; out.step = draft.step || 1; }
      if (draft.type === 'amount') { out.unit = draft.unit || ''; out.step = draft.step || 1; }
      if (draft.type === 'scale') out.max = draft.max || 5;
      if (draft.type === 'options') { out.options = draft.options || []; if (draft.amountUnit) { out.amountUnit = draft.amountUnit; out.step = draft.step || 15; } }
      return out;
    };
    // The card as it'll look, redrawn as you fill the form in.
    const showPreview = () => {
      const el = box.querySelector('.own-preview');
      if (!el) return;
      keepTyped();
      const d = { ...build(), id: def ? def.id : 'own-preview' };
      if (!d.name) d.name = 'Your tracker';
      if (d.type === 'options' && !d.options.length) d.options = [{ id: 'o1', label: 'An option' }];
      el.innerHTML = preview(d.id, d);
    };
    draw();
    showPreview();
    box.addEventListener('input', e => {
      if (e.target.name === 'emoji') {
        draft.emoji = e.target.value.trim();
        draft.sticker = draft.emoji ? '' : draft.sticker || 'wateringcan';
        box.querySelectorAll('[data-stk]').forEach(b => b.classList.toggle('on', b.dataset.stk === draft.sticker));
        e.target.classList.toggle('on', !!draft.emoji);
      }
      showPreview();
    });
    box.addEventListener('click', e => {
      if (e.target.closest('[data-stk], .sw, [data-type], [data-max] [data-v], [data-flag]')) setTimeout(showPreview);
      const stk = e.target.closest('[data-stk]');
      if (stk) {
        draft.sticker = stk.dataset.stk;
        draft.emoji = '';
        box.querySelectorAll('[data-stk]').forEach(b => b.classList.toggle('on', b === stk));
        const em = box.querySelector('[name=emoji]');
        em.value = '';
        em.classList.remove('on');
        return;
      }
      const sw = e.target.closest('.sw');
      if (sw) { draft.color = sw.dataset.color; markSwatch(box, draft.color); return; }
      const type = e.target.closest('[data-type]');
      if (type) {
        keepTyped();
        draft.type = type.dataset.type;
        box.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('on', b === type));
        box.querySelector('.type-extra').innerHTML = extras();
        return;
      }
      const max = e.target.closest('[data-max] [data-v]');
      if (max) { draft.max = Number(max.dataset.v); max.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === max)); return; }
      const flag = e.target.closest('[data-flag]');
      if (flag) {
        draft[flag.dataset.flag] = !draft[flag.dataset.flag];
        flag.classList.toggle('on', draft[flag.dataset.flag]);
        flag.setAttribute('aria-checked', draft[flag.dataset.flag]);
        return;
      }
      if (e.target.closest('[data-del]')) onDelete();
    });
    box.addEventListener('submit', e => {
      e.preventDefault();
      keepTyped();
      const err = box.querySelector('.own-err');
      const fail = msg => { err.hidden = false; err.textContent = msg; };
      if (!draft.name.trim()) { fail('Give it a name'); box.querySelector('[name=name]').focus(); return; }
      if (draft.type === 'options' && !(draft.options || []).length) { fail('Add a few options, separated with commas'); return; }
      onSave(build(), { tally: draft.tally, share: draft.share });
    });
  }

  function drawMake() {
    make.innerHTML = `<div class="own-box"><h4>✨ Make your own</h4><div class="own-make"></div></div>`;
    ownForm(make.querySelector('.own-make'), null, {
      onSave: (def, flags) => {
        addTracker(def, flags);
        toast(`${def.name} added ✨`);
        drawLists();
        drawMake();
        lists.scrollIntoView({ block: 'start', behavior: 'smooth' });
      },
    });
  }

  function openOwnEditor(def) {
    const sub = openSheet({ title: def.name, body: '<div class="own-edit"></div>', onClose: drawLists });
    ownForm(sub.el.querySelector('.own-edit'), def, {
      onSave: (next, { tally, share }) => {
        const s = readSettings();
        s.trackers.own = s.trackers.own.map(d => (d.id === def.id ? next : d));
        s.trackers.tally = { ...s.trackers.tally, [def.id]: !!tally };
        s.trackers.share = { ...s.trackers.share, [def.id]: !!share };
        writeSettings(s);
        toast('Saved');
        sub.close();
      },
      onDelete: async () => {
        const ok = await confirmSheet(`Delete ${def.name}?`, 'It disappears from your trackers. Days you already logged stay in your backup.', { ok: 'Delete', danger: true });
        if (!ok) return;
        const s = readSettings();
        s.trackers.own = s.trackers.own.filter(d => d.id !== def.id);
        s.trackers.order = s.trackers.order.filter(x => x !== def.id);
        for (const k of ['on', 'share', 'tally']) { const m = { ...s.trackers[k] }; delete m[def.id]; s.trackers[k] = m; }
        writeSettings(s);
        sub.close();
      },
    });
  }

  drawLists();
  drawMake();
}

// ── A built-in tracker's settings ─────────────────────────────────────────
// Sharing, monthly tally, and what each one needs: water's goal, caffeine's
// cut-off, your medicines, the work settings, Walk's options and nudges.
// onMeds opens the medicines sheet, onWork the work year.
function builtInSettings(id, { onMeds, onWork = () => {}, onClose } = {}) {
  const def = BUILT_IN.find(d => d.id === id);
  if (!def) return null;
  const sub = openSheet({ title: def.name, body: '<div class="tk-settings"></div>', onClose });
  settingsBox(sub.el.querySelector('.tk-settings'), id, { onMeds, onWork: () => { sub.close(); onWork(); } });
  return sub;
}

// The settings themselves, drawn into `box` (a sheet, or under a preview).
function settingsBox(box, id, { onMeds = () => {}, onWork = () => {} } = {}) {
  const draw = () => {
    const st = readSettings();
    box.innerHTML = `
      ${id === 'walk' ? walkHTML(st) : ''}
      ${id === 'dates' ? `<p class="muted small pref-hint">Always shared with ${esc(partnerName())}: it's for the two of you, and surprises stay secret. Your reminder is on its page.</p>` : id === 'cycle' ? `
        <div class="field cycle-share" style="${colorVars('coral')}"><span>Share with ${esc(partnerName())}</span>
          ${shareRadios(st.cycle.share, store.readPartner('profile', null)?.name || 'Your person')}
          <small class="muted pref-hint">Private by default. Period support is picked day by day on the cycle page.</small></div>`
        : shareRow('share', st.trackers.share[id], `Share with ${esc(partnerName())}`, st.trackers.share[id] ? (id === 'walk' ? 'they see how many walks and how long' : 'they see this tracker\'s days') : 'off until you switch it on')}
      ${id === 'dates' ? '' : shareRow('tally', st.trackers.tally[id], '📊 Monthly tally', id === 'walk' ? 'walks and minutes, day by day' : 'adds it up on the month view')}
      ${id === 'water' ? `<div class="hrs-row goal-row"><span>💧 Glasses a day</span><span class="stepper">
          <button type="button" data-goal="-1" aria-label="Fewer">−</button><b>${st.trackers.goals.water}</b><button type="button" data-goal="1" aria-label="More">+</button></span></div>` : ''}
      ${id === 'caffeine' ? `<label class="hrs-row goal-row"><span>☕ Cut-off time<small class="muted pref-hint">the caffeine widget warns you after it (clear it for none)</small></span>
          <input class="inp cutoff-inp" type="time" data-cutoff value="${esc(caffeineCutoff(st))}"></label>` : ''}
      ${id === 'meds' ? '<button type="button" class="btn ghost" data-meds>✎ Your medicines</button>' : ''}
      ${id === 'work' ? '<button type="button" class="btn ghost" data-work-year>⚙️ Work settings, leave and printing</button>' : ''}`;
  };
  draw();
  // Walk's settings: change them, save, and draw again.
  const walk = fn => {
    const st = readSettings();
    const w = walkSettings(st);
    fn(w);
    st.trackers.walk = w;
    writeSettings(st);
  };
  box.addEventListener('click', e => {
    if (id === 'walk' && walkClick(e, walk)) { draw(); return; }
    const st = readSettings();
    const flag = e.target.closest('[data-flag]')?.dataset.flag;
    const cyc = e.target.closest('[data-cshare]');
    const goal = e.target.closest('[data-goal]');
    if (flag) st.trackers[flag] = { ...st.trackers[flag], [id]: !st.trackers[flag][id] };
    else if (cyc) st.cycle.share = cyc.dataset.cshare;
    else if (goal) st.trackers.goals.water = clamp(st.trackers.goals.water + Number(goal.dataset.goal), 1, 20);
    else if (e.target.closest('[data-meds]')) { onMeds(); return; }
    else if (e.target.closest('[data-work-year]')) { onWork(); return; }
    else return;
    writeSettings(st);
    draw();
  });
  box.addEventListener('change', e => {
    if (e.target.matches('[data-cutoff]')) {
      const st = readSettings();
      st.trackers.goals = { ...st.trackers.goals, caffeine: e.target.value || '' };
      writeSettings(st);
      return;
    }
    if (id === 'walk') walkChange(e, walk);
  });
}

/** Walk's settings on their own (from the Walk card). */
export const openWalkSettings = ({ onClose } = {}) => builtInSettings('walk', { onClose });
/** A built-in tracker's settings on their own (the cycle's sharing, from its card's 🔒 / 💞). */
export const openTrackerSettings = (id, opts) => builtInSettings(id, opts);

// ── Walk's settings (see walk.js) ─────────────────────────────────────────
const WALK_MINS = ['5', '10', '15', '20', '25', '30', '30+', '45', '60', '60+', '90'];
const minsValue = o => `${o.mins}${o.more ? '+' : ''}`;

function walkHTML(st) {
  const w = walkSettings(st);
  const opt = o => {
    const v = minsValue(o);
    const choices = WALK_MINS.includes(v) ? WALK_MINS : [...WALK_MINS, v];
    return `<div class="opt-row" data-opt="${esc(o.id)}" style="${colorVars('mint')}">
      <input class="emo" name="emoji" maxlength="8" value="${esc(o.emoji || '')}" aria-label="Emoji">
      <input name="name" maxlength="24" value="${esc(o.name || '')}" placeholder="Name" aria-label="Name">
      <select class="mins" name="mins" aria-label="Minutes">${choices.map(m => `<option value="${m}"${m === v ? ' selected' : ''}>${m} min</option>`).join('')}</select>
      <button type="button" class="row-x" data-opt-del="${esc(o.id)}" aria-label="Remove ${esc(o.name || 'this walk')}">✕</button></div>`;
  };
  const n = w.nudge;
  return `
    <div class="list-cap first">Your walks</div>
    <div class="opt-list">${w.options.map(opt).join('') || '<p class="muted small">No walks yet: add one.</p>'}</div>
    <button type="button" class="chip add-own opt-add" data-opt-add>＋ Add one (name and minutes)</button>
    <div class="hrs-row goal-row" style="${colorVars('mint')}"><span>🎯 Walks a day</span><span class="stepper">
      <button type="button" data-wgoal="-1" aria-label="Fewer">−</button><b>${w.goal}</b><button type="button" data-wgoal="1" aria-label="More">+</button></span></div>
    <div class="list-cap">Nudge me to get up</div>
    <div style="${colorVars('mint')}">${shareRow('nudge', n.on, '🔔 When I\'ve been still for a while', isNative ? 'a gentle notification on your phone' : 'a notification from the Human Doing Android app')}</div>
    <div class="nudge-set${n.on ? '' : ' dim'}" style="${colorVars('mint')}">
      <div class="field"><span>After</span><div class="seg wide" data-every>${NUDGE_EVERY.map(m => `<button type="button" data-v="${m}" class="${n.every === m ? 'on' : ''}">${m === 60 ? '1 hour' : m + ' min'}</button>`).join('')}</div></div>
      <div class="field two">
        <label><span>From</span><input class="inp" type="time" name="from" value="${esc(n.from)}"></label>
        <label><span>Until</span><input class="inp" type="time" name="to" value="${esc(n.to)}"></label></div>
      <div class="field"><span>On</span><div class="seg wide" data-days>
        <button type="button" data-v="weekdays" class="${n.days === 'weekdays' ? 'on' : ''}">Weekdays</button><button type="button" data-v="all" class="${n.days === 'all' ? 'on' : ''}">Every day</button></div></div>
      <p class="note-sm">The phone can't tell when you're sitting, so it counts from your last walk; a walk starts it again.${isNative ? '' : ' Nudges come from the Android app.'}</p>
    </div>
    <div class="tip">💡 <b>A good rhythm:</b> many health guides suggest getting up and moving for a few minutes every 30 to 60 minutes of sitting. Even a short walk can lift your mood and help you focus. Not medical advice.</div>`;
}

// A tap in Walk's settings; true if it was one (and was saved).
function walkClick(e, walk) {
  const del = e.target.closest('[data-opt-del]');
  if (del) { walk(w => { w.options = w.options.filter(o => o.id !== del.dataset.optDel); }); return true; }
  if (e.target.closest('[data-opt-add]')) {
    walk(w => { w.options = [...w.options, { id: 'w' + uid().slice(0, 6), emoji: '🚶', name: 'Walk', mins: 20 }]; });
    return true;
  }
  const g = e.target.closest('[data-wgoal]');
  if (g) { walk(w => { w.goal = clamp(w.goal + Number(g.dataset.wgoal), 1, 12); }); return true; }
  if (e.target.closest('[data-flag="nudge"]')) {
    let on = false;
    walk(w => { w.nudge.on = on = !w.nudge.on; });
    // The Android app needs permission to post the nudges.
    if (on && bridge && bridge.askNotifications) bridge.askNotifications();
    return true;
  }
  const every = e.target.closest('[data-every] [data-v]');
  if (every) { walk(w => { w.nudge.every = Number(every.dataset.v); }); return true; }
  const days = e.target.closest('[data-days] [data-v]');
  if (days) { walk(w => { w.nudge.days = days.dataset.v; }); return true; }
  return false;
}

// Typing in Walk's settings: saved when you leave a field (no redraw under your fingers).
function walkChange(e, walk) {
  const row = e.target.closest('[data-opt]');
  if (row) {
    const { name, value } = e.target;
    walk(w => {
      const o = w.options.find(x => x.id === row.dataset.opt);
      if (!o) return;
      if (name === 'emoji') o.emoji = value.trim() || '🚶';
      else if (name === 'name') o.name = value.trim() || o.name;
      else if (name === 'mins') { o.mins = parseInt(value, 10) || 15; if (value.endsWith('+')) o.more = true; else delete o.more; }
    });
    return;
  }
  if (e.target.name === 'from' || e.target.name === 'to') {
    const { name, value } = e.target;
    if (value) walk(w => { w.nudge[name] = value; });
  }
}
