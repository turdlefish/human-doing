// 👉 Remind your person: pick what to fill in (work day, water…), or write your
// own words, and their phone gets a notification (see nudges.js).

import { esc, toast, vibrate } from './util.js';
import { openSheet } from './ui.js';
import { sendNudge, them } from './nudges.js';

const THINGS = [
  { id: 'work', emoji: '💼', text: 'Log your work day' },
  { id: 'water', emoji: '💧', text: 'Have a glass of water' },
  { id: 'meds', emoji: '💊', text: 'Take your meds' },
  { id: 'walk', emoji: '🚶', text: 'Go for a little walk' },
  { id: 'cycle', emoji: '🩸', text: 'Log your cycle' },
  { id: 'todo', emoji: '✅', text: 'Check your to-dos' },
  { id: 'checkin', emoji: '🌷', text: 'Do your Human Being check-in' },
];

export function openRemind() {
  const t = them();
  if (!t) { toast('Invite your person first 💌'); return; }
  const picked = new Set();
  const sheet = openSheet({
    title: `Remind ${t.name} 👉`,
    body: `<p class="muted small">Pick one or more, or write your own. ${esc(t.name)} gets a notification.</p>
      <div class="chips rm-chips">${THINGS.map(x => `<button type="button" class="chip" data-rm="${x.id}" aria-pressed="false">${x.emoji} ${esc(x.text)}</button>`).join('')}</div>
      <label class="field rm-own"><span>Or in your own words</span>
        <input class="inp" name="own" maxlength="120" placeholder="e.g. Don't forget the bins tonight 🗑️" autocomplete="off"></label>
      <div class="sheet-actions">
        <button type="button" class="btn ghost" data-rm-cancel>Cancel</button>
        <button type="button" class="btn" data-rm-send disabled>Send 👉</button>
      </div>`,
  });
  const own = sheet.el.querySelector('[name=own]');
  const send = sheet.el.querySelector('[data-rm-send]');
  const ready = () => { send.disabled = !picked.size && !own.value.trim(); };
  own.addEventListener('input', ready);
  sheet.el.addEventListener('click', e => {
    const chip = e.target.closest('[data-rm]');
    if (chip) {
      const id = chip.dataset.rm;
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      chip.classList.toggle('on', picked.has(id));
      chip.setAttribute('aria-pressed', picked.has(id));
      ready();
      return;
    }
    if (e.target.closest('[data-rm-cancel]')) { sheet.close(); return; }
    if (!e.target.closest('[data-rm-send]') || send.disabled) return;
    const chosen = THINGS.filter(x => picked.has(x.id));
    const words = [...chosen.map(x => `${x.text} ${x.emoji}`), own.value.trim()].filter(Boolean);
    sendNudge('remind', words.join(' · '), chosen.length ? { what: chosen[0].id } : {});
    vibrate(10);
    toast(`Sent 👉 ${t.name} will get a nudge`);
    sheet.close();
  });
}
