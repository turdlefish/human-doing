// The cycle page: where you are on the phase wheel, what's coming up, the
// day's log and your period support (the same as on the Tracking card: see
// cyclelog.js), and what your person sees of it all (nothing until you
// choose). Opens from "Open cycle" on the day
// view's Cycle card. Estimates from your own logs, not medical advice.

import * as store from './store.js';
import { colorVars, dayKey, esc, keyToDate, shiftDay, vibrate } from './util.js';
import { avatarHTML } from './avatars.js';
import { stickerSrc } from './stickers.js';
import { readDay, readSettings, writeSettings } from './docs.js';
import { PHASES, cycleOn, phaseDays, ringSVG, shareRadios, supportItems, symptomItems } from './cycle.js';
import { editButtons, moreTap } from './buttons.js';
import { cycleTap, logBlock, supportBlock } from './cyclelog.js';

const shortDate = k => keyToDate(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const daysApart = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
// "heat pack, chocolate & a warm bath"
const listOf = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`);

/**
 * What your person sees of your cycle at each sharing level, in words, for
 * the day `k` (the preview under the sharing choice).
 */
export function cyclePreview(level, k = dayKey()) {
  const me = store.readMine('profile', {}).name || 'You';
  const v = readDay(store.me(), k).cycle || {};
  const c = cycleOn(store.me(), k);
  const could = supportItems(store.me()).filter(x => (v.support || []).includes(x.id)).map(x => lower(x.label));
  const sym = symptomItems(store.me()).filter(x => (v.symptoms || []).includes(x.id)).map(x => lower(x.label));
  const phase = c ? lower(PHASES[c.phase].name) : '';
  const wants = could.length ? `could use ${listOf(could)} 💜` : '';
  switch (level) {
    case 'support': return wants ? `${me} ${wants}` : 'what would help, on days you pick some 💜';
    case 'phase': return [me, phase, wants].filter(Boolean).join(' · ');
    case 'all': return [me, c ? `${phase}, day ${c.cycleDay}` : '', listOf(sym), wants].filter(Boolean).join(' · ');
    default: return 'nothing from your cycle 🔒';
  }
}

/** Creates the cycle page in `el`. day() is the day being logged; onBack() leaves. */
export function createCyclePage(el, { day, onBack }) {
  const me = () => store.me();
  const entry = () => readDay(me(), day()).cycle || {};

  function comingUp(c, k) {
    if (!c) return '';
    const P = c.periodLength, ov = c.ovulation;
    const row = (e, text, small) => `<div class="pred-row"><span class="e" aria-hidden="true">${e}</span><div>${esc(text)}<small>${esc(small)}</small></div></div>`;
    const rows = [];
    rows.push(c.dueIn >= 0
      ? row('🩸', `Next period ~${shortDate(c.nextPeriod)}`, `${c.dueIn === 0 ? 'due today' : c.dueIn === 1 ? 'due tomorrow' : `in about ${c.dueIn} days`} · usually lasts ${plural(P, 'day')}`)
      : row('🩸', `Period ${plural(-c.dueIn, 'day')} later than usual`, `it was due ~${shortDate(c.nextPeriod)}`));
    // Ovulation: this cycle's if it's still to come (or now), otherwise the next cycle's.
    if (c.cycleDay <= ov + 1) {
      const d = shiftDay(c.start, ov - 1);
      rows.push(row('🌼', `${c.cycleDay >= ov - 1 ? 'Ovulation' : 'Next ovulation'} ~${shortDate(d)}`, c.cycleDay >= ov - 1 ? 'around now' : `in about ${daysApart(k, d)} days`));
    } else {
      const next = c.dueIn >= 0 ? c.nextPeriod : shiftDay(k, 1);
      rows.push(row('🌼', `Next ovulation ~${shortDate(shiftDay(next, ov - 1))}`, `follicular phase starts ~${shortDate(shiftDay(next, P))}`));
    }
    const lo = Math.min(...c.lengths), hi = Math.max(...c.lengths);
    rows.push(c.lengths.length
      ? row('📈', `Average cycle ${plural(c.length, 'day')}`, `from your last ${plural(c.lengths.length, 'cycle')} · ${lo === hi ? `all ${lo} days` : `range ${lo}–${hi}`}`)
      : row('📈', 'Still learning your cycle', `until you've logged two periods it uses ${c.length} days`));
    return `<section class="card tk" style="${colorVars('lavender')}">
      <div class="card-tape"></div>
      <div class="tk-head"><img class="tk-ico" src="${stickerSrc('sparkles')}" alt="" draggable="false"><h3>Coming up</h3></div>
      ${rows.join('')}
      <p class="note-sm">These are estimates from your own logs. They're not medical advice and can't be used as contraception.</p>
    </section>`;
  }

  function render() {
    const k = day();
    const s = readSettings();
    const level = s.cycle.share;
    const c = cycleOn(me(), k);
    const v = entry();
    const ph = c ? PHASES[c.phase] : null;
    const range = c ? phaseDays(c)[c.phase] : null;
    const them = store.readPartner('profile', null);
    const name = them ? them.name : 'your person';

    el.innerHTML = `
      <div class="sub-head"><button type="button" class="icon-btn" data-cy="back" aria-label="Back">‹</button><h1>Cycle</h1><span class="muted">${esc(shortDate(k))}</span></div>

      <section class="card tk" style="${colorVars('coral')}">
        <div class="card-tape"></div>
        <div class="ring-wrap">${ringSVG(c, 224, 20)}
          <div class="ring-center">${ph
            ? `<img src="${stickerSrc(ph.sticker)}" alt="" draggable="false"><b>Day ${c.cycleDay}</b><span>${esc(ph.name)}</span>`
            : '<b class="ring-none">No period yet</b><span>Log your flow below</span>'}</div>
        </div>
        <div class="phase-legend cy-legend">${Object.values(PHASES).map(p => `<span><i style="background:${p.color}"></i>${esc(p.name.replace(' phase', ''))}</span>`).join('')}</div>
        <div class="phase-box">${ph
          ? `<b>${ph.emoji} ${esc(ph.name)} · days ${range[0]}–${range[1]}</b>${esc(ph.about)}`
          : '<b>🩸 Start with your period</b>Set the flow on the first day of your period and the wheel fills in. It learns your own cycle as you log.'}</div>
      </section>

      ${comingUp(c, k)}

      <section class="card tk" style="${colorVars('coral')}">
        <div class="card-tape"></div>
        ${logBlock(v, k)}
        ${supportBlock(v, { note: level === 'none' ? '🔒 just you' : `💞 ${esc(them ? them.name : 'your person')} sees it` })}
      </section>

      <section class="card tk" style="${colorVars('peach')}">
        <div class="card-tape"></div>
        <div class="tk-head"><span class="tk-ico" aria-hidden="true">${level === 'none' ? '🔒' : '💞'}</span><h3>Share with ${esc(name)}</h3></div>
        <p class="muted small">Your cycle is kept apart from your other trackers, so nothing about it slips out unless you choose.</p>
        ${shareRadios(level, them ? them.name : 'Your person')}
        <div class="partner-view"><span class="avatar">${avatarHTML(store.readMine('profile', {}))}</span>
          <div><b>${esc(them ? them.name : 'Your person')} sees</b><p>${esc(cyclePreview(level, k))}</p></div></div>
      </section>`;
  }

  // The log's taps are the Tracking card's (cyclelog.js). The page sits inside
  // the Tracking page, so they stop here instead of being handled twice.
  el.addEventListener('click', e => {
    const handled = () => { e.stopPropagation(); vibrate(8); render(); };
    if (cycleTap(e.target, day())) { handled(); return; }
    if (moreTap(e.target)) { e.stopPropagation(); render(); return; }
    const edit = e.target.closest('[data-edit-btns]');
    if (edit) { e.stopPropagation(); editButtons(edit.dataset.editBtns, { onClose: render }); return; }
    const b = e.target.closest('[data-cy], [data-cshare]');
    if (!b) return;
    const d = b.dataset;
    if (d.cy === 'back') onBack();
    else if (d.cshare) {
      const s = readSettings();
      if (s.cycle.share === d.cshare) return;
      s.cycle.share = d.cshare;
      writeSettings(s);
      vibrate(8);
      render();
    }
  });

  return { render };
}
