// Bionic reading: the first part of each word is bolded to guide the eye.
// Applied to reading text (labels, check-ins, bubbles, blocks, notes) as it
// appears on screen — headings and buttons keep their usual look. Text you are
// typing is never touched.

const READ = 'p, label, li, summary, small, .q, .chip, .txt, .blk-title, .blk-note, .mpill, .ds-title, .ds-note, '
  + '.hist-t, .rating-ends, .rv-label, .hug-pill, .need-quote, .spoons-note, .wp-card, .field > span, .tray-tip, .tray-note';
const SKIP = 'input, textarea, select, script, style, svg, button.tab, .bionic, .no-bionic, [contenteditable="true"], [contenteditable="plaintext-only"]';
const WORD = /(\p{L}[\p{L}'’]*)/u;

let observer = null;
let level = 3;

// Fixation F1–F5: how much of each word is bold (F1 the most, F5 the least).
const RATIO = { 1: 0.62, 2: 0.53, 3: 0.45, 4: 0.36, 5: 0.27 };
const boldLength = n => (n <= 2 ? 1 : n === 3 ? (level <= 2 ? 2 : 1) : Math.max(1, Math.min(n - 1, Math.ceil(n * RATIO[level]))));

function convertText(node) {
  const parent = node.parentElement;
  if (!parent || !parent.closest(READ) || parent.closest(SKIP)) return;
  const text = node.nodeValue;
  if (!WORD.test(text)) return;
  const frag = document.createDocumentFragment();
  for (const part of text.split(WORD)) {
    if (!part) continue;
    if (WORD.test(part) && /^\p{L}/u.test(part)) {
      const span = document.createElement('span');
      span.className = 'bionic';
      const b = document.createElement('b');
      const cut = boldLength(part.length);
      b.textContent = part.slice(0, cut);
      span.append(b, part.slice(cut));
      frag.append(span);
    } else {
      frag.append(part);
    }
  }
  parent.replaceChild(frag, node);
}

function convertTree(root) {
  if (root.nodeType === Node.TEXT_NODE) { convertText(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest?.(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(convertText);
}

function unwrapAll() {
  document.querySelectorAll('span.bionic').forEach(s => {
    const parent = s.parentNode;
    s.replaceWith(document.createTextNode(s.textContent));
    parent && parent.normalize();
  });
}

// on: bionic reading on or off; fixation: 1 (boldest) … 5 (lightest).
export function setBionic(on, fixation = 3) {
  const next = RATIO[fixation] ? fixation : 3;
  document.documentElement.classList.toggle('bionic-on', on);
  if (on && observer && next !== level) {
    observer.disconnect();
    observer = null;
    unwrapAll();
  }
  level = next;
  if (on && !observer) {
    convertTree(document.body);
    observer = new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(convertTree);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } else if (!on && observer) {
    observer.disconnect();
    observer = null;
    unwrapAll();
  }
}
