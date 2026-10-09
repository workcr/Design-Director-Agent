const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/model.js');
const G = globalThis.GridCalc;
const { normalize } = G.config;
const { computeCanon, constructionSegments, resolveCanvas } = G.canon;
const { isOnGrid, snap, perfectDivisions, clipSegment } = G.math;

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

/** Independent line–line intersection, used to verify the closed form. */
function intersect(a, b) {
  const d = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2);
  const t = ((a.x1 - b.x1) * (b.y1 - b.y2) - (a.y1 - b.y1) * (b.x1 - b.x2)) / d;
  return { x: a.x1 + t * (a.x2 - a.x1), y: a.y1 + t * (a.y2 - a.y1) };
}

test('ladder diagonals meet the short diagonal at H/D (closed form matches geometry)', () => {
  const Wp = 960;
  const H = 1080;
  const W = 2 * Wp;
  const l1 = { x1: W / 2, y1: 0, x2: W, y2: H };
  for (const D of [6, 9, 12, 15, 10, 7]) {
    const segs = constructionSegments(Wp, H, D);
    const ladder = segs.filter((s) => s.role === 'ladder' && s.y2 === 0 && s.x2 === (2 * W) / 3);
    const last = ladder[ladder.length - 1]; // d = smallest, but the largest d gives the D box
    const target = ladder.find((s) => Math.abs(s.y1 - H / (D - 3)) < 1e-9);
    assert.ok(target, `ladder line for D=${D}`);
    const p = intersect(target, l1);
    near(p.y, H / D);
    void last;
  }
});

test('margins follow the 1:2 canon (top:bottom = inner:outer = 1:2)', () => {
  const c = computeCanon(normalize({ snapMode: 'none', fitCanvas: false }));
  const { ideal } = c.margins;
  near(ideal.bottom, 2 * ideal.top);
  near(ideal.outer, 2 * ideal.inner);
  near(ideal.top, 1080 / 9);
  near(ideal.inner, 960 / 9);
});

test('text block for D = 9 is two thirds of the page in both directions', () => {
  const c = computeCanon(normalize({ snapMode: 'none', fitCanvas: false, divisions: 9 }));
  const b = c.blocks.find((x) => x.id === 'right');
  near(b.w, (960 * 2) / 3);
  near(b.h, (1080 * 2) / 3);
});

test('left and right blocks mirror each other around the spine', () => {
  const c = computeCanon(normalize({ snapMode: 'none' }));
  const [l, r] = c.blocks;
  near(l.x + l.w + (r.x - 960), 960 - (960 - l.x - l.w) + (r.x - 960));
  near(l.x, 1920 - (r.x + r.w));
});

test('perfect divisions for 1920×1080 @ 8px are the common divisors of 135 and 120 units', () => {
  assert.deepEqual(perfectDivisions({ pageWidth: 960, height: 1080, unit: 8 }), [5, 15]);
});

test('snapping puts every margin and the block on the grid', () => {
  for (const snapMode of ['nearest', 'floor', 'ceil']) {
    const c = computeCanon(normalize({ snapMode }));
    Object.values(c.margins.snapped).forEach((v) => assert.ok(isOnGrid(v, 8), `${snapMode} ${v}`));
    c.blocks.forEach((b) => [b.x, b.y, b.w, b.h].forEach((v) => assert.ok(isOnGrid(v, 8))));
  }
});

test('perfect division needs no snapping at all', () => {
  const c = computeCanon(normalize({ divisions: 15 }));
  c.blocks.forEach((b) => Object.values(b.deviation).forEach((d) => near(d, 0)));
});

test('fitCanvas rounds to whole units, spread width to whole pages', () => {
  const c = resolveCanvas(normalize({ width: 1925, height: 1083, fitCanvas: true }));
  assert.equal(c.height, 1080);
  assert.equal(c.width, 1920);
  assert.equal(c.aligned, true);
  const raw = resolveCanvas(normalize({ width: 1925, height: 1083, fitCanvas: false }));
  assert.equal(raw.aligned, false);
});

test('single page mode shows only the recto block and clips construction to the page', () => {
  const c = computeCanon(normalize({ layout: 'page', width: 640, height: 960 }));
  assert.equal(c.blocks.length, 1);
  assert.equal(c.view.width, 640);
  c.construction.forEach((s) => [s.x1, s.x2].forEach((x) => assert.ok(x >= -1e-6 && x <= 640 + 1e-6)));
});

test('centered mode produces one block spanning the spread', () => {
  const c = computeCanon(normalize({ blockMode: 'centered' }));
  assert.equal(c.blocks.length, 1);
  near(c.blocks[0].x, c.margins.snapped.outer);
  near(c.blocks[0].x + c.blocks[0].w, 1920 - c.margins.snapped.outer);
});

test('snap handles float noise and modes', () => {
  assert.equal(snap(24.0000000001, 8), 24);
  assert.equal(snap(27, 8, 'floor'), 24);
  assert.equal(snap(25, 8, 'ceil'), 32);
  assert.equal(snap(27.3, 8, 'none'), 27.3);
});

test('clipSegment trims and rejects', () => {
  const r = { x: 0, y: 0, w: 10, h: 10 };
  const s = clipSegment({ x1: -5, y1: 5, x2: 15, y2: 5 }, r);
  near(s.x1, 0);
  near(s.x2, 10);
  assert.equal(clipSegment({ x1: 20, y1: 0, x2: 30, y2: 5 }, r), null);
});
