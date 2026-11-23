// The work year: month by month, hours worked, leave left and your work
// settings, flipping between the calendar year and your financial year, and
// printing (or saving as PDF) one month, the whole year or any dates.
// Opens from the work tally on the month view, the work card, and the Work
// tracker's settings. Just yours: your work settings never leave your phone.

import * as store from './store.js';
import { clamp, colorVars, dayKey, esc, keyToDate, shiftDay, toast, uid, vibrate } from './util.js';
import { confirmSheet, openSheet, promptSheet } from './ui.js';
import { builtInWork, monthOf, myWorkTypes, readMonth, readSettings, writeSettings } from './docs.js';
import { UNITS, allowances, balance, shiftYear, thisWeek, unitOf, workReader, yearOf, yearly } from './work.js';
import { printPage } from './native.js';

// Colours for the hours-worked bars.
const BAR = { wfh: '#86BDEB', office: '#7CCFAA', own: '#F4A47C', overtime: '#AE96E8' };

const num = n => String(Math.round(n * 10) / 10);
const hrs = n => String(Math.round(n * 100) / 100);   // hours keep quarter hours (26.25 h)
const plural = (n, word) => `${num(n)} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
const monthName = m => new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });
const ymShort = ym => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleDateString(undefined, { month: 'short' });
const ymLong = ym => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const shortDate = k => keyToDate(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const longDate = k => keyToDate(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dayLine = k => keyToDate(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const lastDay = ym => dayKey(new Date(+ym.slice(0, 4), +ym.slice(5), 0));
const firstOf = t => (window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(t)][0]?.segment : Array.from(t)[0]) || '';
// "🎓 Study day" → ['🎓', 'Study day'].
function splitEmoji(text) {
  const t = text.trim();
  const g = firstOf(t);
  return g && !/[\p{L}\p{N}\s]/u.test(g) ? [g, t.slice(g.length).trim()] : ['', t];
}

// A type's amount in one month's (or range's) days: days for most, hours for overtime, leave in days (hours ÷ normal day).
const cellValue = (t, per, w) => (t.id === 'overtime' ? per.hours : t.leave ? per.hours / (w.normalDay || 7.5) : per.days);

/** Each work type's days and hours in `days` (already filtered), and the hours worked. */
function sumUp(days, types) {
  const per = {};
  for (const t of types) {
    const hs = Object.values(days).filter(v => v[t.id] != null).map(v => v[t.id] || 0);
    per[t.id] = { days: hs.length, hours: hs.reduce((a, b) => a + b, 0) };
  }
  return { per, worked: types.filter(t => !t.leave).reduce((n, t) => n + per[t.id].hours, 0) };
}
const pick = (days, test) => Object.fromEntries(Object.entries(days).filter(([k]) => test(k)));

/** Creates the work year page in `el`. onBack() leaves it; onMonth(ym) opens a month in the month view. */
export function createWorkYear(el, { onBack, onMonth }) {
  let yr = null;               // the year on screen
  let range = 'year';          // what Print prints: 'month' | 'year' | 'dates'
  let from = `${monthOf(dayKey())}-01`, to = dayKey();

  // The financial year whose leave shows: the one on screen, or (in calendar
  // years) the one running at the end of the year shown, or today if sooner.
  const leaveYear = (w, fy) => (fy ? yr : yearOf(yr.end < dayKey() ? yr.end : dayKey(), true, w.fyStart));
  const columns = (types, days) => types.filter(t => builtInWork(t) || Object.values(days).some(v => v[t.id] != null));

  // ── page ─────────────────────────────────────────────────────────────────
  function render() {
    const s = readSettings();
    const w = s.work;
    const fy = w.yearView !== 'cal';
    const start = fy ? w.fyStart : 1;
    if (!yr || yr.startMonth !== start) yr = yearOf(dayKey(), fy, w.fyStart);
    const daysIn = workReader(store.me());
    const days = daysIn(yr);
    const types = myWorkTypes(w);
    const cols = columns(types, days);
    const current = yr.start <= dayKey() && dayKey() <= yr.end;
    const name = store.readMine('profile', {}).name || '';

    el.innerHTML = `
      <div class="sub-head"><button type="button" class="icon-btn" data-wy="back" aria-label="Back">‹</button><h1>Work year</h1><span class="muted">${esc(name)}</span></div>
      <div class="seg wide wy-view" style="${colorVars('pink')}">
        <button type="button" data-wy-view="cal" class="${fy ? '' : 'on'}" aria-pressed="${!fy}">Calendar year</button><button type="button" data-wy-view="fy" class="${fy ? 'on' : ''}" aria-pressed="${fy}">Financial year</button>
      </div>
      <div class="month-nav wy-nav">
        <button type="button" class="icon-btn" data-wy-year="-1" aria-label="Previous year">‹</button>
        <span class="mn-label">${esc(yr.label)}</span>
        <button type="button" class="icon-btn" data-wy-year="1" aria-label="Next year">›</button>
        ${current ? `<span class="wy-span">${esc(yr.span)}</span>` : '<button type="button" class="today-btn" data-wy-year="0">↩ This year</button>'}
      </div>
      ${tableCard(days, cols, w)}
      ${hoursCard(days, types, current)}
      ${leaveCard(w, fy, daysIn)}
      ${settingsCard(w)}
      <div class="wy-print">
        <button type="button" class="btn big" data-wy="print" style="${colorVars('sky')}">🖨️ Print or save as PDF</button>
        <div class="chips sm print-opts" style="${colorVars('sky')}">
          ${[['month', 'This month'], ['year', 'Whole year'], ['dates', 'Pick dates']].map(([id, label]) => `<button type="button" class="chip${range === id ? ' on' : ''}" data-wy-range="${id}" aria-pressed="${range === id}">${label}</button>`).join('')}
        </div>
        ${range === 'dates' ? `<div class="field two wy-dates">
            <label><span>From</span><input class="inp" type="date" name="from" value="${from}"></label>
            <label><span>To</span><input class="inp" type="date" name="to" value="${to}"></label></div>` : ''}
      </div>`;
  }

  function tableCard(days, cols, w) {
    const today = dayKey();
    const rows = yr.months.map(ym => {
      const md = pick(days, k => k.startsWith(ym));
      const future = `${ym}-01` > today && !Object.keys(md).length;
      const { per } = sumUp(md, cols);
      return `<button type="button" class="mo" data-wy-month="${ym}">${esc(ymShort(ym))}</button>`
        + cols.map(t => { const v = num(cellValue(t, per[t.id], w)); return future ? '<span class="fut">–</span>' : `<span>${v === '0' ? '·' : v}</span>`; }).join('');
    }).join('');
    const { per } = sumUp(days, cols);
    return `<section class="card tk" style="${colorVars('sky')}">
      <div class="card-tape"></div>
      <div class="tk-head"><span class="tk-ico" aria-hidden="true">🏆</span><h3>Month by month</h3><span class="tk-meta">days</span></div>
      <div class="yr-table" style="--cols:${cols.length}">
        <span class="hd"></span>${cols.map(t => `<span class="hd" title="${esc(t.label)}">${esc(t.emoji)}</span>`).join('')}
        ${rows}
        <span class="tot mo">Total</span>${cols.map(t => `<span class="tot">${num(cellValue(t, per[t.id], w))}${t.id === 'overtime' ? 'h' : ''}</span>`).join('')}
      </div>
      <p class="note-sm">⏱️ overtime is in hours, and leave counts half days as halves. Tap a month to open it.</p>
    </section>`;
  }

  function hoursCard(days, types, current) {
    const ownWork = types.filter(t => !builtInWork(t) && !t.leave);
    const months = yr.months.map(ym => {
      const md = pick(days, k => k.startsWith(ym));
      const { per } = sumUp(md, types);
      const parts = [['wfh', per.wfh.hours], ['office', per.office.hours], ['own', ownWork.reduce((n, t) => n + per[t.id].hours, 0)], ['overtime', per.overtime.hours]];
      return { ym, parts, total: parts.reduce((n, p) => n + p[1], 0), future: `${ym}-01` > dayKey() };
    });
    const top = Math.max(1, ...months.map(m => m.total));
    const total = months.reduce((n, m) => n + m.total, 0);
    const used = new Set(months.flatMap(m => m.parts.filter(p => p[1]).map(p => p[0])));
    const name = id => { const t = types.find(x => x.id === id); return t ? `${t.emoji} ${t.label}` : id; };   // your names for them
    const legend = [['wfh', name('wfh')], ['office', name('office')], ['own', '✨ Your own'], ['overtime', name('overtime')]].filter(([k]) => used.has(k));
    return `<section class="card tk" style="${colorVars('lavender')}">
      <div class="card-tape"></div>
      <div class="tk-head"><span class="tk-ico" aria-hidden="true">✨</span><h3>Hours worked</h3><span class="tk-meta">${total ? `${hrs(total)} h${current ? ' so far' : ''}` : ''}</span></div>
      <div class="yr-bars">${months.map(m => (m.future && !m.total ? '<div class="yr-bar fut"></div>'
        : `<div class="yr-bar" title="${esc(ymShort(m.ym))}: ${hrs(m.total)} h">${m.parts.filter(p => p[1]).map(([k, h]) => `<i style="height:${((h / top) * 100).toFixed(1)}%;background:${BAR[k]}"></i>`).join('')}</div>`)).join('')}</div>
      <div class="yr-lbl">${yr.months.map(ym => `<span>${esc(ymShort(ym).charAt(0))}</span>`).join('')}</div>
      ${legend.length ? `<div class="phase-legend wy-legend">${legend.map(([k, label]) => `<span><i style="background:${BAR[k]}"></i>${esc(label)}</span>`).join('')}</div>` : '<p class="muted small">No work logged this year yet.</p>'}
    </section>`;
  }

  function balanceRow(a, b) {
    const u = a.unit === 'days' ? 'day' : 'hour';
    const total = b.amount + b.carried;
    const parts = [b.used ? `${num(b.used)} used` : '', b.booked ? `${num(b.booked)} booked` : '', b.carried ? `${num(b.carried)} carried over` : ''].filter(Boolean);
    return `<div class="bal${b.left < 0 ? ' over' : ''}"><span>${esc(a.emoji || '⭐')} ${esc(a.name)}</span>
      <b>${b.left < 0 ? `${plural(-b.left, u)} over` : `${num(b.left)} of ${plural(total, u)} left`}</b>
      <div class="bal-bar"><i style="width:${total ? clamp((b.left / total) * 100, 0, 100) : 0}%"></i></div>
      <small>${parts.join(' · ') || 'none used yet'}</small></div>`;
  }

  function leaveCard(w, fy, daysIn) {
    const ly = leaveYear(w, fy);
    const all = allowances(w).filter(a => Number(a.amount));
    const yearlyRows = all.filter(yearly).map(a => balanceRow(a, balance(a, ly, w, daysIn))).join('');
    const weekly = all.filter(a => a.unit === 'week').map(a => {
      const { used, from: f, to: t } = thisWeek(a, w, store.me());
      return `<div class="bal"><span>${esc(a.emoji || '⭐')} ${esc(a.name)}</span><b>${num(used)} of ${num(a.amount)} h this week</b>
        <div class="bal-bar"><i style="width:${clamp((used / a.amount) * 100, 0, 100)}%"></i></div><small>${esc(shortDate(f))} – ${esc(shortDate(t))}</small></div>`;
    }).join('');
    return `<section class="card tk" style="${colorVars('peach')}">
      <div class="card-tape"></div>
      <div class="tk-head"><span class="tk-ico" aria-hidden="true">🌴</span><h3>Leave left</h3><span class="tk-meta">${esc(ly.label)}</span></div>
      ${yearlyRows || weekly ? yearlyRows + weekly : '<p class="muted small">Set your leave below and it counts down here as you log it.</p>'}
    </section>`;
  }

  function settingsCard(w) {
    const row = (key, label, value, tag = '') => `<button type="button" class="set-row" data-wy-edit="${esc(key)}"><span>${label}${tag}</span><b>${value} ✎</b></button>`;
    const amount = a => (a.unit === 'number' ? num(Number(a.amount) || 0) : `${num(Number(a.amount) || 0)} ${unitOf(a.unit).label}`);
    return `<section class="card tk" style="${colorVars('mint')}">
      <div class="card-tape"></div>
      <div class="tk-head"><span class="tk-ico" aria-hidden="true">⚙️</span><h3>My work settings</h3><span class="tk-meta">just for you</span></div>
      ${row('normal', '🕘 Normal day', `${num(w.normalDay)} h`)}
      ${row('fy', '📆 Financial year starts', `1 ${esc(monthName(w.fyStart))}`)}
      ${row('annual', '🌴 Annual leave', `${num(w.annual)} days a year${w.carry.annual ? ' · carries over' : ''}`)}
      ${row('sick', '🤒 Sick leave', `${num(w.sick)} days a year${w.carry.sick ? ' · carries over' : ''}`)}
      ${(w.own || []).map(a => row(a.id, `${esc(a.emoji || '⭐')} ${esc(a.name)}`, `${esc(amount(a))}${a.carry && yearly(a) ? ' · carries over' : ''}`, ' <span class="own-tag">your own</span>')).join('')}
      <button type="button" class="add-tracker wy-add" data-wy="add">＋ Add a work setting</button>
      <p class="note-sm">Like study or carer's leave, or hours a week. Link one to a work type and it counts down by itself.</p>
    </section>`;
  }

  // ── editing settings ─────────────────────────────────────────────────────
  function save(fn) {
    const s = readSettings();
    fn(s.work, s);
    writeSettings(s);
    vibrate(8);
    render();
  }

  async function editNormalDay() {
    const v = await promptSheet('Your normal day', { value: num(readSettings().work.normalDay), placeholder: 'hours, e.g. 7.5', maxlength: 5 });
    if (v == null) return;
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { toast('That needs to be a number of hours'); return; }
    save(w => { w.normalDay = clamp(Math.round(n * 4) / 4, 0.25, 24); });
  }

  function editFyStart() {
    const cur = readSettings().work.fyStart;
    const sheet = openSheet({
      title: 'Your financial year starts on',
      body: `<div class="chips month-pick">${Array.from({ length: 12 }, (_, i) => `<button type="button" class="chip${cur === i + 1 ? ' on' : ''}" data-m="${i + 1}" style="${colorVars('mint')}">1 ${esc(monthName(i + 1))}</button>`).join('')}</div>
        <p class="note-sm">Your leave allowances start again each financial year. Pick January if yours follows the calendar year.</p>`,
    });
    sheet.el.addEventListener('click', e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      yr = null;   // back to the year that's running now
      save(w => { w.fyStart = Number(b.dataset.m); });
      sheet.close();
    });
  }

  // Annual or sick leave (amount and carrying over), or one of your own work settings (null: a new one).
  function allowanceSheet(a) {
    const draft = a ? { ...a } : { emoji: '', name: '', amount: '', unit: 'days', type: '', carry: false };
    const sheet = openSheet({ title: a ? a.name : 'Add a work setting', body: '<form class="ws-form" novalidate></form>' });
    const form = sheet.el.querySelector('form');
    const keepTyped = () => {
      const val = n => form.elements.namedItem(n)?.value;
      if (val('name') !== undefined) draft.name = val('name');
      if (val('emoji') !== undefined) draft.emoji = val('emoji');
      if (val('amount') !== undefined) draft.amount = val('amount');
      if (val('opening') !== undefined) draft.opening = val('opening');
      if (val('unit') !== undefined) draft.unit = val('unit');
    };
    const draw = () => {
      const types = myWorkTypes(readSettings().work);
      const unitWord = draft.unit === 'hours' ? 'hours' : 'days';
      form.innerHTML = `
        ${draft.builtIn ? '' : `<div class="own-row">
            <input class="inp own-emoji" name="emoji" maxlength="16" placeholder="⭐" value="${esc(draft.emoji || '')}" aria-label="Emoji (optional)" autocomplete="off">
            <input class="inp" name="name" maxlength="28" placeholder="e.g. Study leave" value="${esc(draft.name)}" aria-label="Name" autocomplete="off"></div>`}
        <div class="field two">
          <label><span>Amount</span><input class="inp" type="number" name="amount" min="0" step="any" inputmode="decimal" value="${esc(draft.amount ?? '')}"></label>
          ${draft.builtIn ? '<label><span>Unit</span><input class="inp" value="days a year" disabled></label>'
            : `<label><span>Unit</span><select class="inp" name="unit">${UNITS.map(u => `<option value="${u.id}"${draft.unit === u.id ? ' selected' : ''}>${u.label}</option>`).join('')}</select></label>`}
        </div>
        ${draft.builtIn || draft.unit === 'number' ? '' : `<div class="field"><span>Used up by <span class="field-hint">· ${draft.unit === 'week' ? 'optional; none counts all hours worked' : 'optional'}</span></span>
          <div class="chips sm">${types.map(t => `<button type="button" class="chip${draft.type === t.id ? ' on' : ''}" data-type="${esc(t.id)}" aria-pressed="${draft.type === t.id}" style="${colorVars('lavender')}">${esc(t.emoji)} ${esc(t.label)}</button>`).join('')}
            <button type="button" class="chip add-own" data-new-type style="${colorVars('lavender')}">＋ new work type</button></div></div>`}
        ${yearly(draft) ? `<div class="share-row"><span>Unused ${unitWord} carry over<small>into the next financial year</small></span>
          <button type="button" class="tgl${draft.carry ? ' on' : ''}" data-carry role="switch" aria-checked="${!!draft.carry}" aria-label="Carry over" style="${colorVars('mint')}"></button></div>` : ''}
        ${yearly(draft) && draft.carry ? `<label class="field"><span>Left over from before <span class="field-hint">· optional, in ${unitWord}</span></span>
          <input class="inp" type="number" name="opening" min="0" step="any" inputmode="decimal" value="${esc(draft.opening || '')}" placeholder="0">
          <small class="muted pref-hint">What you'd built up before you started logging work here (your payslip may show it). It carries into your first year.</small></label>` : ''}
        <p class="ob-err ws-err" hidden></p>
        <div class="sheet-actions">
          ${a && !a.builtIn ? '<button type="button" class="btn ghost danger-text" data-del>Delete</button>' : ''}
          <button type="submit" class="btn" style="${colorVars('mint')}">${a ? 'Save' : 'Add setting'}</button>
        </div>`;
    };
    draw();
    form.addEventListener('change', e => { if (e.target.name === 'unit') { keepTyped(); draw(); } });
    form.addEventListener('click', async e => {
      const t = e.target.closest('[data-type]');
      if (t) { keepTyped(); draft.type = draft.type === t.dataset.type ? '' : t.dataset.type; draw(); return; }
      if (e.target.closest('[data-carry]')) { keepTyped(); draft.carry = !draft.carry; draw(); return; }
      if (e.target.closest('[data-new-type]')) {
        keepTyped();
        const text = await promptSheet('A new work type', { placeholder: 'e.g. 🎓 Study day', ok: 'Add', maxlength: 32 });
        if (!text) return;
        const [emoji, label] = splitEmoji(text);
        const type = { id: 'own-' + uid(), emoji: emoji || '✨', label: label || text };
        const s = readSettings();
        s.work.types = [...s.work.types, type];
        writeSettings(s);
        draft.type = type.id;
        draw();
        return;
      }
      if (e.target.closest('[data-del]')) {
        const ok = await confirmSheet(`Delete ${a.name}?`, 'The work type it was linked to stays, and so do the days you logged.', { ok: 'Delete', danger: true });
        if (!ok) return;
        save(w => { w.own = w.own.filter(x => x.id !== a.id); });
        sheet.close();
      }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      keepTyped();
      const err = form.querySelector('.ws-err');
      const fail = msg => { err.hidden = false; err.textContent = msg; };
      const amount = Number(String(draft.amount).replace(',', '.'));
      if (!draft.builtIn && !draft.name.trim()) { fail('Give it a name'); form.elements.namedItem('name').focus(); return; }
      if (String(draft.amount).trim() === '' || !Number.isFinite(amount) || amount < 0) { fail('The amount needs to be a number'); form.elements.namedItem('amount').focus(); return; }
      const opening = Math.max(0, Number(String(draft.opening || '').replace(',', '.')) || 0);
      const carry = yearly(draft) && !!draft.carry;
      save(w => {
        if (draft.builtIn) {
          w[draft.id] = amount;
          w.carry = { ...w.carry, [draft.id]: carry };
          w.opening = { ...w.opening, [draft.id]: carry ? opening : 0 };
          return;
        }
        const type = draft.unit === 'number' ? '' : draft.type;
        const linked = myWorkTypes(w).find(t => t.id === type);
        const next = {
          id: a ? a.id : 'ws-' + uid(), emoji: firstOf((draft.emoji || '').trim()) || (linked ? linked.emoji : '⭐'),
          name: draft.name.trim(), amount, unit: draft.unit, type, carry, ...(carry && opening ? { opening } : {}),
        };
        w.own = a ? w.own.map(x => (x.id === a.id ? next : x)) : [...w.own, next];
      });
      toast(a ? 'Saved' : `${draft.name.trim()} added ✨`);
      sheet.close();
    });
    if (!a) setTimeout(() => form.elements.namedItem('name')?.focus(), 280);
  }

  // ── printing ─────────────────────────────────────────────────────────────
  // A plain report (black on white) that only shows when printing.
  function reportHTML(r) {
    const s = readSettings();
    const w = s.work;
    const types = myWorkTypes(w);
    const daysIn = workReader(store.me());
    const days = {};
    for (let ym = monthOf(r.from); ym <= monthOf(r.to); ym = monthOf(shiftDay(lastDay(ym), 1))) {
      for (const [k, e] of Object.entries(readMonth(store.me(), ym))) if (e.work && k >= r.from && k <= r.to) days[k] = e.work;
    }
    const cols = columns(types, days);
    const { per, worked } = sumUp(days, types);
    const name = store.readMine('profile', {}).name || '';
    const h = n => (n ? `${hrs(n)} h` : '');

    let detail;
    if (r.year) {
      detail = `<table><thead><tr><th>Month</th>${cols.map(t => `<th class="n">${esc(t.emoji)} ${esc(t.label)}</th>`).join('')}<th class="n">Hours worked</th></tr></thead><tbody>
        ${r.months.map(ym => {
          const sm = sumUp(pick(days, k => k.startsWith(ym)), types);
          return `<tr><td>${esc(ymLong(ym))}</td>${cols.map(t => `<td class="n">${num(cellValue(t, sm.per[t.id], w)) === '0' ? '' : num(cellValue(t, sm.per[t.id], w)) + (t.id === 'overtime' ? ' h' : '')}</td>`).join('')}<td class="n">${h(sm.worked)}</td></tr>`;
        }).join('')}
        <tr class="tot"><td>Total</td>${cols.map(t => `<td class="n">${num(cellValue(t, per[t.id], w))}${t.id === 'overtime' ? ' h' : ''}</td>`).join('')}<td class="n">${h(worked)}</td></tr></tbody></table>`;
    } else {
      const list = Object.keys(days).sort();
      detail = list.length ? `<table><thead><tr><th>Date</th><th>Work</th><th class="n">Hours worked</th><th class="n">Overtime</th></tr></thead><tbody>
        ${list.map(k => {
          const v = days[k];
          const what = types.filter(t => v[t.id] != null && t.id !== 'overtime').map(t => `${t.emoji} ${t.label}${t.leave ? ` (${num(v[t.id] || 0)} h)` : ''}`).join(', ');
          const wk = types.filter(t => !t.leave && t.id !== 'overtime').reduce((n, t) => n + (v[t.id] || 0), 0);
          return `<tr><td>${esc(dayLine(k))}</td><td>${esc(what || '⏱️ Overtime')}</td><td class="n">${h(wk)}</td><td class="n">${h(v.overtime)}</td></tr>`;
        }).join('')}</tbody></table>` : '<p>No work logged in these dates.</p>';
    }

    const totals = types.filter(t => per[t.id].days).map(t => `<tr><td>${esc(t.emoji)} ${esc(t.label)}</td><td class="n">${t.id === 'overtime' ? plural(per[t.id].days, 'time') : plural(t.leave ? per[t.id].hours / w.normalDay : per[t.id].days, 'day')}</td><td class="n">${h(per[t.id].hours)}</td></tr>`).join('');
    const ly = yearOf(r.to < dayKey() ? r.to : dayKey(), true, w.fyStart);
    const leave = allowances(w).filter(a => yearly(a) && Number(a.amount)).map(a => {
      const b = balance(a, ly, w, daysIn);
      const u = a.unit === 'days' ? 'days' : 'h';
      return `<tr><td>${esc(a.emoji || '⭐')} ${esc(a.name)}</td><td class="n">${num(b.amount)} ${u}</td><td class="n">${b.carried ? num(b.carried) : ''}</td><td class="n">${num(b.used)}</td><td class="n">${b.booked ? num(b.booked) : ''}</td><td class="n"><b>${num(b.left)} ${u}</b></td></tr>`;
    }).join('');

    return `<h1>Work · ${esc(r.title)}</h1>
      <p class="pr-sub">${name ? `${esc(name)} · ` : ''}${esc(longDate(r.from))} to ${esc(longDate(r.to))} · normal day ${num(w.normalDay)} h · printed ${esc(longDate(dayKey()))} from Human Doing</p>
      ${detail}
      <h2>Totals</h2>
      ${totals ? `<table><thead><tr><th>Work type</th><th class="n">Days</th><th class="n">Hours</th></tr></thead><tbody>${totals}
        <tr class="tot"><td>Hours worked</td><td></td><td class="n">${h(worked) || '0 h'}</td></tr></tbody></table>` : '<p>Nothing logged.</p>'}
      ${leave ? `<h2>Leave left · ${esc(ly.label)}</h2>
        <table><thead><tr><th>Allowance</th><th class="n">A year</th><th class="n">Carried over</th><th class="n">Used</th><th class="n">Booked</th><th class="n">Left</th></tr></thead><tbody>${leave}</tbody></table>` : ''}`;
  }

  function printReport() {
    let r;
    if (range === 'month') {
      const ym = monthOf(dayKey());
      r = { from: `${ym}-01`, to: lastDay(ym), title: ymLong(ym) };
    } else if (range === 'year') {
      r = { from: yr.start, to: yr.end, title: yr.label, year: true, months: yr.months };
    } else {
      if (!from || !to || from > to) { toast('Pick a start date before the end date'); return; }
      r = { from, to, title: from.slice(0, 4) === to.slice(0, 4) ? `${shortDate(from)} – ${shortDate(to)} ${to.slice(0, 4)}` : `${longDate(from)} – ${longDate(to)}` };
    }
    let box = document.getElementById('print-report');
    if (!box) {
      box = document.createElement('div');
      box.id = 'print-report';
      document.body.append(box);
    }
    box.innerHTML = reportHTML(r);
    if (!printPage(`Work ${r.title}`)) toast('Update Human Doing on your phone to print from it');
  }

  // ── taps ─────────────────────────────────────────────────────────────────
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-wy], [data-wy-view], [data-wy-year], [data-wy-month], [data-wy-edit], [data-wy-range]');
    if (!b) return;
    const d = b.dataset;
    if (d.wy === 'back') onBack();
    else if (d.wy === 'print') printReport();
    else if (d.wy === 'add') allowanceSheet(null);
    else if (d.wyView) { if ((readSettings().work.yearView !== 'cal') !== (d.wyView === 'fy')) { yr = null; save(w => { w.yearView = d.wyView; }); } }
    else if (d.wyYear) { const n = Number(d.wyYear); yr = n ? shiftYear(yr, n) : null; render(); }
    else if (d.wyMonth) onMonth(d.wyMonth);
    else if (d.wyRange) { range = d.wyRange; render(); }
    else if (d.wyEdit === 'normal') editNormalDay();
    else if (d.wyEdit === 'fy') editFyStart();
    else if (d.wyEdit) {
      const a = allowances(readSettings().work).find(x => x.id === d.wyEdit);
      if (a) allowanceSheet(a);
    }
  });
  el.addEventListener('change', e => {
    if (e.target.name === 'from') from = e.target.value;
    if (e.target.name === 'to') to = e.target.value;
  });

  return {
    render,
    /** Shows the year that's running now (when the page opens). */
    reset() { yr = null; },
  };
}
