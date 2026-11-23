// Trackers you make yourself: six kinds, the ready-made ideas in the tracker
// list, and how each kind's card looks and changes when tapped.
//
// A tracker: { id: 'own-…', name, sticker | emoji, color, type, … } where type is
//   yesno    did it or not                     value: true
//   count    glasses, steps (goal?, step)      value: { n, at: [ms] }
//   amount   hours, mg, km (unit, step)        value: number
//   scale    1 to 5 or 1 to 10 (max)           value: number
//   options  pick from a list (options: [{ id, label }], amountUnit?, step)
//                                              value: { picked: [id], amount? }
//   note     a few words                       value: 'text'

import { esc, uid } from './util.js';
import { stickerSrc } from './stickers.js';

export const TYPES = [
  { id: 'yesno', art: '✅', name: 'Yes / no', hint: 'did it or not' },
  { id: 'count', art: '🔢', name: 'Count', hint: 'glasses, steps' },
  { id: 'amount', art: '⏱️', name: 'Amount', hint: 'hours, mg, km' },
  { id: 'scale', art: '⭐', name: 'Scale', hint: '1 to 5 or 1 to 10' },
  { id: 'options', art: '🏷️', name: 'Options', hint: 'pick from a list' },
  { id: 'note', art: '📝', name: 'Note', hint: 'a few words' },
];

const opts = labels => labels.map(label => ({ id: 'o' + uid().slice(0, 5), label }));

// "More ideas" in the tracker list: one tap makes them. (Steps was one until
// v1.3, when Walk replaced it; Steps trackers already made keep working.)
export const IDEAS = [
  { idea: 'exercise', name: 'Exercise', sticker: 'dumbbell', color: 'peach', type: 'options', options: ['🚶 Walk', '🏃 Run', '🧘 Yoga', '🏋️ Gym', '🏊 Swim', '🚲 Bike'], amountUnit: 'min', step: 15, desc: 'what you did and for how long' },
  { idea: 'skincare', name: 'Skincare', sticker: 'bubble', color: 'pink', type: 'options', options: ['🌅 Morning', '🌙 Night'], desc: 'morning and night routine ticks' },
  { idea: 'reading', name: 'Reading', sticker: 'books', color: 'lavender', type: 'amount', unit: 'pages', step: 5, desc: 'pages or minutes' },
];
export function fromIdea(idea) {
  const { desc, ...def } = idea;
  return { ...def, id: 'own-' + uid(), ...(def.options ? { options: opts(def.options) } : {}) };
}

// Stickers to choose from when making a tracker.
export const STICKERS = ['wateringcan', 'sprout', 'tulip', 'clover', 'yarn', 'books', 'sneaker', 'dumbbell', 'yogamat', 'bicycle',
  'bubble', 'headphones', 'palette', 'guitar', 'camera', 'gamepad', 'puzzle', 'heart', 'star', 'sun', 'moon', 'drop', 'latte',
  'boba', 'strawberry', 'cupcake', 'candle', 'letter', 'broom', 'laundry', 'spray', 'trophy', 'check'];

export const ownIcon = (def, cls = 'tk-ico') => (def.sticker
  ? `<img class="${cls}" src="${stickerSrc(def.sticker)}" alt="" draggable="false">`
  : `<span class="${cls}" aria-hidden="true">${esc(def.emoji || '✨')}</span>`);

export const typeOf = id => TYPES.find(t => t.id === id) || TYPES[0];

/** One line about a tracker, for the tracker list. */
export function describe(def) {
  if (def.desc) return def.desc;
  switch (def.type) {
    case 'count': return `a count${def.goal ? ` · goal ${def.goal}` : ''}`;
    case 'amount': return `an amount${def.unit ? ' in ' + def.unit : ''}`;
    case 'scale': return `1 to ${def.max || 5}`;
    case 'options': return (def.options || []).map(o => o.label).join(', ') || 'pick from a list';
    case 'note': return 'a few words a day';
    default: return 'yes or no';
  }
}

const num = n => String(Math.round(n * 100) / 100);
const countOf = v => (typeof v === 'number' ? v : (v && v.n) || 0);

/**
 * The inside of a tracker's card and its corner note: { inner, meta }.
 * fold(items, chip, on): draws an Options tracker's buttons on your own card
 * (your main ones, "N more" and ✎ Edit: see buttons.js).
 */
export function ownBody(def, value, mine, fold = null) {
  const id = esc(def.id);
  switch (def.type) {
    case 'count': {
      const n = countOf(value);
      const pct = def.goal ? Math.min(100, Math.round((n / def.goal) * 100)) : 0;
      return {
        inner: `<div class="mini-row"><span class="big-num">${num(n)}${def.goal ? `<small>/${num(def.goal)}</small>` : ''}</span>
            ${mine ? `<span class="stepper"><button type="button" data-own="${id}" data-op="dec" aria-label="Less">−</button><button type="button" data-own="${id}" data-op="inc" aria-label="More">+</button></span>` : ''}</div>
          ${def.goal ? `<div class="bal-bar" role="img" aria-label="${pct}% of the goal"><i style="width:${pct}%"></i></div>` : ''}
          ${mine && (def.step || 1) > 1 ? `<button type="button" class="link-btn own-type" data-own="${id}" data-op="type">type a number</button>` : ''}`,
        meta: def.goal && n >= def.goal ? 'goal reached ✨' : '',
      };
    }
    case 'amount': {
      const n = typeof value === 'number' ? value : null;
      return {
        inner: `<div class="mini-row">
            ${mine ? `<button type="button" class="big-num num-btn" data-own="${id}" data-op="type">${n == null ? '—' : num(n)}<small> ${esc(def.unit || '')}</small></button>`
              : `<span class="big-num">${n == null ? '—' : num(n)}<small> ${esc(def.unit || '')}</small></span>`}
            ${mine ? `<span class="stepper"><button type="button" data-own="${id}" data-op="dec" aria-label="Less">−</button><button type="button" data-own="${id}" data-op="inc" aria-label="More">+</button></span>` : ''}</div>`,
        meta: '',
      };
    }
    case 'scale': {
      const max = def.max || 5, r = typeof value === 'number' ? value : 0;
      const dots = Array.from({ length: max }, (_, i) => i + 1).map(i => mine
        ? `<button type="button" class="rb${i <= r ? ' on' : ''}${i === r ? ' peak' : ''}" data-own="${id}" data-op="scale" data-v="${i}" aria-label="${i} out of ${max}" aria-pressed="${i === r}">${i}</button>`
        : `<span class="rb${i <= r ? ' on' : ''}${i === r ? ' peak' : ''}">${i}</span>`).join('');
      return { inner: `<div class="rating${max <= 5 ? ' five' : ''}">${dots}</div>`, meta: r ? `${r} / ${max}` : '' };
    }
    case 'options': {
      const v = value || {};
      const picked = new Set(v.picked || []);
      const chip = o => (mine
        ? `<button type="button" class="chip${picked.has(o.id) ? ' on' : ''}" data-own="${id}" data-op="opt" data-v="${esc(o.id)}" aria-pressed="${picked.has(o.id)}">${esc(o.label)}</button>`
        : picked.has(o.id) ? `<span class="chip on">${esc(o.label)}</span>` : '');
      const chips = mine && fold ? fold(def.options || [], chip, o => picked.has(o.id)) : (def.options || []).map(chip).join('');
      const amt = def.amountUnit && (mine || v.amount) ? `<div class="hrs-row"><span>How long</span>
          <span class="stepper">${mine ? `<button type="button" data-own="${id}" data-op="dec" aria-label="Less">−</button>` : ''}<b>${num(v.amount || 0)}</b><small>${esc(def.amountUnit)}</small>${mine ? `<button type="button" data-own="${id}" data-op="inc" aria-label="More">+</button>` : ''}</span></div>` : '';
      return { inner: `<div class="chips sm">${chips || '<span class="muted small">Nothing logged</span>'}</div>${amt}`, meta: '' };
    }
    case 'note':
      return {
        inner: mine
          ? `<textarea class="inp own-note" rows="2" maxlength="300" data-own="${id}" data-op="note" placeholder="A few words…">${esc(value || '')}</textarea>`
          : `<p class="own-note-view">${value ? esc(value) : '<span class="muted small">Nothing logged</span>'}</p>`,
        meta: '',
      };
    default: {
      const on = value === true;
      return {
        inner: mine
          ? `<button type="button" class="yes-btn${on ? ' on' : ''}" data-own="${id}" data-op="yes" aria-pressed="${on}"><span class="tick${on ? ' on' : ''}"></span>${on ? 'Done today' : 'Not yet'}</button>`
          : `<p class="own-note-view">${on ? '✅ Done' : '<span class="muted small">Not yet</span>'}</p>`,
        meta: '',
      };
    }
  }
}

/** A made-up day's value, for a tracker's preview. */
export function ownExample(def) {
  const step = def.step || 1;
  switch (def.type) {
    case 'count': return { n: def.goal ? Math.max(step, Math.round((def.goal * 0.6) / step) * step) : 3 * step, at: [] };
    case 'amount': return 3 * step;
    case 'scale': return Math.max(1, (def.max || 5) - 1);
    case 'options': return { picked: (def.options || []).slice(0, 1).map(o => o.id), ...(def.amountUnit ? { amount: 2 * (def.step || 15) } : {}) };
    case 'note': return 'A good day, with a long lunch outside.';
    default: return true;
  }
}

/** One line about a day's value, for a card folded away with Done ✓. */
export function ownSummary(def, value) {
  switch (def.type) {
    case 'count': {
      const n = countOf(value);
      return def.goal ? `${num(n)} of ${num(def.goal)}${n >= def.goal ? ' · goal reached ✨' : ''}` : num(n);
    }
    case 'amount': return typeof value === 'number' ? `${num(value)} ${def.unit || ''}`.trim() : 'Nothing logged';
    case 'scale': return typeof value === 'number' ? `${value} / ${def.max || 5}` : 'Nothing logged';
    case 'options': {
      const v = value || {};
      const picked = (def.options || []).filter(o => (v.picked || []).includes(o.id)).map(o => o.label);
      if (def.amountUnit && v.amount) picked.push(`${num(v.amount)} ${def.amountUnit}`);
      return picked.join(' · ') || 'Nothing logged';
    }
    case 'note': return value ? String(value).replace(/\s+/g, ' ').trim() : 'Nothing written';
    default: return value === true ? 'Done today ✓' : 'Not today';
  }
}

/** The value after a tap (undefined: nothing changes; null: cleared). */
export function nextValue(def, value, op, v, stamp) {
  const step = def.step || 1;
  switch (def.type) {
    case 'count': {
      const n = Math.max(0, countOf(value) + (op === 'inc' ? step : -step));
      let at = (value && Array.isArray(value.at) ? value.at : []).slice(0, Math.ceil(n / step));
      if (op === 'inc') at = [...at, stamp];
      return n ? { n, at } : null;
    }
    case 'amount': {
      const n = Math.max(0, (typeof value === 'number' ? value : 0) + (op === 'inc' ? step : -step));
      return n || op === 'inc' ? n : null;
    }
    case 'scale': return Number(v) === value ? null : Number(v);
    case 'options': {
      const cur = value || {};
      if (op === 'opt') {
        const picked = new Set(cur.picked || []);
        if (picked.has(v)) picked.delete(v); else picked.add(v);
        const next = { ...cur, picked: [...picked] };
        return next.picked.length || next.amount ? next : null;
      }
      const amount = Math.max(0, (cur.amount || 0) + (op === 'inc' ? step : -step));
      const next = { ...cur, amount };
      if (!amount) delete next.amount;
      return (next.picked || []).length || next.amount ? next : null;
    }
    case 'yesno': return value === true ? null : true;
    default: return undefined;
  }
}

/** A typed-in number for count and amount trackers. */
export function typedValue(def, value, typed, stamp) {
  const n = Math.max(0, Number(String(typed).replace(',', '.')));
  if (!Number.isFinite(n)) return undefined;
  if (def.type === 'count') return n ? { n, at: [...((value && value.at) || []), stamp] } : null;
  return n;
}

/** Turns "Walk, Run" into options, keeping the ids of ones that already exist. */
export function parseOptions(text, existing = []) {
  return String(text).split(',').map(s => s.trim()).filter(Boolean).slice(0, 12).map(label =>
    existing.find(o => o.label === label) || { id: 'o' + uid().slice(0, 5), label });
}
