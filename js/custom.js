// Your own photo stickers. Each person keeps a "sticker box" document; both
// boxes show up in the sticker drawer under ✨ Ours, so you can use each
// other's too. Photos are shrunk on the phone before saving so they sync fast.
// The stickers you both made in Human Being show up here as well (read-only:
// they're changed in Human Being).

import * as store from './store.js';
import { setCustomResolver } from './stickers.js';
import { uid } from './util.js';
import { openSheet } from './ui.js';

const MAX_SIDE = 360;   // px — plenty for a sticker, small enough to sync quickly
const boxes = {};       // slot (or "hb:" + slot) -> parsed box (cached; reading big photos is slow)

function box(slot) {
  if (!(slot in boxes)) boxes[slot] = store.read(store.keyFor(slot, 'stickerbox'), null) || { items: [] };
  return boxes[slot];
}
function hbBox(slot) {
  const k = 'hb:' + slot;
  if (!(k in boxes)) boxes[k] = store.read(store.hbKey(slot, 'stickerbox'), null) || { items: [] };
  return boxes[k];
}

store.on(k => {
  const m = /^(hb:)?p:(\w):stickerbox$/.exec(k);
  if (m) delete boxes[(m[1] || '') + m[2]];
});

export function initCustom() {
  setCustomResolver((slot, id) => [...(box(slot).items || []), ...(hbBox(slot).items || [])].find(i => i.id === id) || null);
}

export const myItems = () => box(store.me()).items || [];
export const partnerItems = () => box(store.partner()).items || [];
// From Human Being: [{ ...item, slot }]
export const humanBeingItems = () => [store.me(), store.partner()].flatMap(s => (hbBox(s).items || []).map(i => ({ ...i, slot: s })));

// Sticker keys for the drawer: mine first, then my person's, then the Human Being ones.
export function customKeys() {
  return [
    ...myItems().map(i => `custom:${store.me()}:${i.id}`),
    ...partnerItems().map(i => `custom:${store.partner()}:${i.id}`),
    ...humanBeingItems().map(i => `custom:${i.slot}:${i.id}`),
  ];
}

// ── Shapes: the photo is cut out in its shape, so the white sticker edge follows it ──
export const SHAPES = [
  { id: 'oval', label: 'Oval' },
  { id: 'soft', label: 'Soft square' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'heart', label: 'Heart' },
  { id: 'star', label: 'Star' },
  { id: 'flower', label: 'Flower' },
  { id: 'cloud', label: 'Cloud' },
];
const KEEPS_ASPECT = { oval: true, rect: true, own: true };   // the rest are cut from a centred square

function tracePath(g, shape, w, h) {
  const s = Math.min(w, h);
  g.beginPath();
  if (shape === 'oval') g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'rect') g.roundRect(0, 0, w, h, s * 0.07);
  else if (shape === 'soft') g.roundRect(0, 0, s, s, s * 0.24);
  else if (shape === 'heart') {
    const P = (x, y) => [x * s, y * s];
    g.moveTo(...P(0.5, 0.95));
    g.bezierCurveTo(...P(0.08, 0.66), ...P(-0.02, 0.4), ...P(0.07, 0.22));
    g.bezierCurveTo(...P(0.17, 0.02), ...P(0.43, 0.03), ...P(0.5, 0.22));
    g.bezierCurveTo(...P(0.57, 0.03), ...P(0.83, 0.02), ...P(0.93, 0.22));
    g.bezierCurveTo(...P(1.02, 0.4), ...P(0.92, 0.66), ...P(0.5, 0.95));
  } else if (shape === 'star') {
    // Five points with softly rounded tips.
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * Math.PI / 180, r = (i % 2 ? 0.24 : 0.5) * s;
      pts.push([s / 2 + Math.cos(a) * r, s * 0.53 + Math.sin(a) * r]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    g.moveTo(...mid(pts[9], pts[0]));
    pts.forEach((p, i) => g.arcTo(p[0], p[1], ...mid(p, pts[(i + 1) % 10]), s * (i % 2 ? 0.03 : 0.05)));
  } else if (shape === 'flower') {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, cx = s / 2 + Math.cos(a) * s * 0.31, cy = s / 2 + Math.sin(a) * s * 0.31;
      g.moveTo(cx + s * 0.19, cy);
      g.arc(cx, cy, s * 0.19, 0, Math.PI * 2);
    }
    g.moveTo(s * 0.86, s / 2);
    g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
  } else if (shape === 'cloud') {
    [[0.3, 0.6, 0.21], [0.52, 0.44, 0.29], [0.75, 0.58, 0.22], [0.5, 0.66, 0.24]].forEach(([x, y, r]) => {
      g.moveTo((x + r) * s, y * s);
      g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    });
  }
}

function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ img: i, done: () => URL.revokeObjectURL(url) });
    i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
    i.src = url;
  });
}

// Draws the photo cut to a shape, at most `max` px on its longest side.
// A photo that's already cut out (a PNG or WebP with see-through parts) keeps
// its own shape. Returns the box around its visible part, or null if the
// picture is solid all over.
function cutOutBounds(img) {
  const scale = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  let clear = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3];
      if (a < 200) clear++;
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || clear < w * h * 0.01) return null;   // (almost) no see-through parts
  const pad = 2;   // a hair of room so the edge isn't clipped
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  return { sx: minX / scale, sy: minY / scale, sw: (maxX - minX + 1) / scale, sh: (maxY - minY + 1) / scale };
}

function cutOut(img, shape, max) {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  let sx = 0, sy = 0, sw = nw, sh = nh;
  const own = shape === 'own' ? cutOutBounds(img) : null;
  if (own) ({ sx, sy, sw, sh } = own);   // trimmed to what's visible, shape untouched
  else if (!KEEPS_ASPECT[shape]) {   // centred square crop
    const side = Math.min(nw, nh);
    sx = (nw - side) / 2;
    sy = (nh - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!own) {
    tracePath(g, shape, w, h);
    g.clip();
  }
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return c;
}

async function shrink(file, shape) {
  const { img, done } = await loadImage(file);
  try {
    const c = cutOut(img, shape, MAX_SIDE);
    let src = c.toDataURL('image/webp', 0.85);   // keeps the see-through corners
    if (!src.startsWith('data:image/webp')) src = c.toDataURL('image/png');
    return { src, a: +(c.height / c.width).toFixed(3) };
  } finally {
    done();
  }
}

/**
 * Asks which shape to cut a photo into, with little previews; resolves to a
 * shape id or null. A photo that's already cut out keeps its own shape ('own')
 * without asking.
 */
export async function chooseShape(file) {
  const { img, done } = await loadImage(file);
  if (cutOutBounds(img)) {
    done();
    return 'own';
  }
  const previews = SHAPES.map(s => ({ ...s, src: cutOut(img, s.id, 160).toDataURL('image/png') }));
  done();
  return new Promise(resolve => {
    let picked = null;
    const sheet = openSheet({
      title: 'Pick a sticker shape',
      body: `<div class="shape-grid">${previews.map(p => `
        <button type="button" class="shape-opt" data-shape="${p.id}"><img src="${p.src}" alt="" draggable="false"><span>${p.label}</span></button>`).join('')}</div>`,
      onClose: () => resolve(picked),
    });
    sheet.el.addEventListener('click', e => {
      const b = e.target.closest('[data-shape]');
      if (!b) return;
      picked = b.dataset.shape;
      sheet.close();
    });
  });
}

// Turn a picked photo into a sticker in my box (cut to `shape`); returns its sticker key.
export async function addFromFile(file, shape = 'oval') {
  const { src, a } = await shrink(file, shape);
  const mine = { items: [...myItems()] };
  const item = { id: uid(), src, a, shape, added: Date.now() };
  mine.items.push(item);
  boxes[store.me()] = mine;
  store.writeMine('stickerbox', mine);
  return `custom:${store.me()}:${item.id}`;
}

export function removeMine(id) {
  const mine = { items: myItems().filter(i => i.id !== id) };
  boxes[store.me()] = mine;
  store.writeMine('stickerbox', mine);
}

// Opens the phone's photo picker; resolves with a File (or null).
export function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files && input.files[0] || null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}
