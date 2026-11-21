const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('../tmp/test-runtime/node_modules/jsdom');
const dom = new JSDOM('<body style="color: red"><dialog></dialog></body>', {
  runScripts: 'outside-only',
});
const w = dom.window;
w.eval(fs.readFileSync(__dirname + '/../portfolio-signature-pad.js', 'utf8'));
const calls = [];
const context = Object.fromEntries(
  ['beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill'].map((key) => [
    key,
    (...args) => calls.push([key, ...args]),
  ]),
);
let ink = 0,
  capture = null;
const canvas = {
  width: 1000,
  height: 300,
  style: {},
  getContext: () => context,
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 500, height: 150 }),
  setPointerCapture: (id) => {
    capture = id;
  },
  hasPointerCapture: (id) => capture === id,
  releasePointerCapture: () => {
    capture = null;
  },
};
w.PortfolioSignaturePad.attach(canvas, () => ink++);
const event = (type, extra = {}) => ({
  type,
  pointerId: 1,
  button: 0,
  clientX: 30,
  clientY: 40,
  preventDefault() {},
  ...extra,
});
canvas.onpointerdown(event('pointerdown'));
assert.equal(ink, 1, 'a tap creates saved ink immediately');
assert.deepEqual(calls.find((c) => c[0] === 'arc').slice(1, 4), [40, 40, 2]);
canvas.onpointerup(event('pointerup'));
assert.equal(capture, null);
canvas.onpointerdown(event('pointerdown', { pointerId: 2 }));
canvas.onpointerdown(event('pointerdown', { pointerId: 3 }));
assert.equal(capture, 2, 'a second touch cannot connect unrelated strokes');
canvas.onpointermove(
  event('pointermove', {
    pointerId: 2,
    getCoalescedEvents: () => [
      event('pointermove', { clientX: 40 }),
      event('pointermove', { clientX: 50 }),
    ],
  }),
);
assert(calls.some((c) => c[0] === 'lineTo' && c[1] === 80));
canvas.onpointercancel(event('pointercancel', { pointerId: 2 }));
const count = ink;
canvas.onpointermove(event('pointermove', { pointerId: 2 }));
canvas.onpointerdown(event('pointerdown', { button: 2 }));
assert.equal(ink, count, 'cancelled or right-click input cannot add ink');
Object.defineProperty(w, 'scrollX', { value: 15 });
Object.defineProperty(w, 'scrollY', { value: 420 });
let restored;
w.scrollTo = (value) => {
  restored = value;
};
const dialog = w.document.querySelector('dialog');
const unlock = w.PortfolioSignaturePad.lockBackground(dialog);
assert.equal(w.document.body.style.position, 'fixed');
assert.equal(w.document.body.style.top, '-420px');
assert.equal(w.document.documentElement.style.overflow, 'hidden');
dialog.dispatchEvent(new w.Event('close'));
assert.equal(w.document.body.getAttribute('style'), 'color: red');
assert.equal(w.document.documentElement.getAttribute('style'), null);
assert.equal(restored.top, 420);
assert.equal(restored.left, 15);
unlock();
console.log(
  'Signature taps, scaled dots, coalesced strokes, pointer isolation, cancellation and scroll restoration passed.',
);
dom.window.close();
