const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/config.js');
require('../src/core/powerlines.js');
const G = globalThis.GridCalc;
const { normalize } = G.config;
const { fractionSeries, placeAxis, onPrimaryDiagonal, computePowerLines, canonAlignment } = G.powerlines;

const view = { width: 1920, height: 1080 };
const labels = (lines) => lines.map((l) => l.label);

test('depth 3 on halves + thirds gives the harmonic set seen in the reference image', () => {
  const p = computePowerLines(normalize({ powerDepth: 3 }), view);
  assert.deepEqual(new Set(labels(p.x)), new Set(['1/2', '1/3', '2/3', '1/4', '3/4', '1/6', '5/6', '1/8', '7/8', '1/12', '11/12']));
});

test('depth 4 reaches 1/16 and 1/24 and mirrors them to the far edge', () => {
  const p = computePowerLines(normalize({ powerDepth: 4 }), view);
  ['1/16', '15/16', '1/24', '23/24'].forEach((l) => assert.ok(labels(p.x).includes(l), l));
});

test('lines mirror about the centre', () => {
  const p = computePowerLines(normalize({ powerDepth: 4 }), view);
  p.x.forEach((l) => assert.ok(p.x.some((m) => Math.abs(m.ideal - (view.width - l.ideal)) < 1e-6), l.label));
});

test('depth 1 keeps only the seeds', () => {
  const p = computePowerLines(normalize({ powerDepth: 1 }), view);
  assert.deepEqual(new Set(labels(p.x)), new Set(['1/2', '1/3', '2/3']));
});

test('base toggles: fifths add 1/5 and 4/5; no bases yields nothing', () => {
  const withFifths = computePowerLines(normalize({ powerBase5: true, powerDepth: 1 }), view);
  assert.ok(labels(withFifths.x).includes('1/5') && labels(withFifths.x).includes('4/5'));
  const none = computePowerLines(normalize({ powerBase2: false, powerBase3: false }), view);
  assert.equal(none.x.length + none.y.length + none.anchors.length, 0);
});

test('margin filter drops lines too close to an edge', () => {
  const tight = computePowerLines(normalize({ powerDepth: 4, powerMargin: 12 }), view); // 96px
  assert.ok(!labels(tight.y).includes('1/24')); // 45px from the top
  assert.ok(labels(tight.x).includes('1/24') === false); // 80px
  assert.ok(labels(tight.x).includes('1/12')); // 160px
});

test('snapping puts every line on the grid and reports the deviation', () => {
  const p = computePowerLines(normalize({ powerDepth: 3 }), view);
  [...p.x, ...p.y].forEach((l) => assert.equal(l.pos % 8, 0, `${l.label} ${l.pos}`));
  const quarter = p.y.find((l) => l.label === '1/4'); // 270px → 272px
  assert.equal(quarter.pos, 272);
  assert.equal(quarter.deviation, 2);
  assert.equal(quarter.exact, false);
  assert.equal(p.x.find((l) => l.label === '1/4').exact, true); // 480px
});

test('snapping off keeps the ideal positions', () => {
  const p = computePowerLines(normalize({ powerSnap: false }), view);
  p.y.forEach((l) => assert.ok(Math.abs(l.pos - l.ideal) < 1e-9));
});

test('lines that collapse onto the same grid line are de-duplicated, strongest kept', () => {
  const small = normalize({ powerDepth: 5, unit: 32, powerMargin: 0 });
  const p = computePowerLines(small, { width: 640, height: 320 });
  const positions = p.x.map((l) => l.pos);
  assert.equal(new Set(positions).size, positions.length);
});

test('primary diagonal test matches the canvas and half-canvas diagonals', () => {
  assert.ok(onPrimaryDiagonal(0.5, 0.5)); // centre
  assert.ok(onPrimaryDiagonal(1 / 3, 1 / 3)); // canvas diagonal
  assert.ok(onPrimaryDiagonal(1 / 4, 1 / 2)); // left-half diagonal
  assert.ok(onPrimaryDiagonal(3 / 4, 1 / 2)); // right-half diagonal
  assert.ok(onPrimaryDiagonal(1 / 6, 1 / 3));
  assert.ok(!onPrimaryDiagonal(1 / 3, 1 / 2));
});

test('diagonal anchor mode is a strict subset of every crossing', () => {
  const some = computePowerLines(normalize({ anchorMode: 'diagonal' }), view);
  const all = computePowerLines(normalize({ anchorMode: 'all' }), view);
  assert.equal(all.anchors.length, all.x.length * all.y.length);
  assert.ok(some.anchors.length < all.anchors.length);
  assert.ok(some.anchors.every((a) => a.strong));
  assert.ok(some.anchors.some((a) => a.label === '1/2 · 1/2'));
});

test('single-page canvases use their own size', () => {
  const p = computePowerLines(normalize({ powerSnap: false }), { width: 640, height: 960 });
  assert.ok(Math.abs(p.x.find((l) => l.label === '1/3').pos - 640 / 3) < 1e-9);
  assert.ok(Math.abs(p.y.find((l) => l.label === '1/3').pos - 320) < 1e-9);
});

test('strip diagonals come in pairs and primary diagonals are the six of the reference', () => {
  const p = computePowerLines(normalize({ powerDepth: 3 }), view);
  assert.equal(p.primary.length, 6);
  assert.equal(p.strips.length % 4, 0);
  assert.ok(p.strips.length > 0);
});

test('fractionSeries is strongest-first and de-duplicated', () => {
  const s = fractionSeries([2, 3], 3);
  assert.equal(s[0].level, 0);
  assert.equal(new Set(s.map((f) => f.label)).size, s.length);
});

test('placeAxis never returns the edges themselves', () => {
  const lines = placeAxis(1920, fractionSeries([2, 3], 5), normalize({ powerMargin: 0, powerDepth: 5 }));
  lines.forEach((l) => assert.ok(l.pos > 0 && l.pos < 1920));
});

test('canonAlignment counts block edges that sit on power lines', () => {
  const p = computePowerLines(normalize({}), view);
  const blocks = [{ x: p.x[0].pos, w: p.x[1].pos - p.x[0].pos, y: p.y[0].pos, h: p.y[1].pos - p.y[0].pos }];
  const a = canonAlignment(blocks, p);
  assert.equal(a.matched, a.total);
  assert.equal(a.total, 4);
  assert.equal(canonAlignment([{ x: 3, w: 5, y: 7, h: 11 }], p).matched, 0);
});

test('model lists canon divisions that land on power lines', () => {
  require('../src/core/model.js');
  const m = G.model.buildModel({ powerDepth: 4 }, (t, s) => t.length * s * 0.5);
  [6, 8, 12, 24].forEach((d) => assert.ok(m.alignedDivisions.includes(d), `D${d}`));
  assert.ok(!m.alignedDivisions.includes(9));
  const six = G.model.buildModel({ divisions: 6 }, (t, s) => t.length * s * 0.5);
  assert.ok(six.stats.canonOnPower.matched >= 4);
});

test('exports carry the power lines for downstream tools', () => {
  require('../src/core/model.js');
  require('../src/core/exporters.js');
  const m = G.model.buildModel({}, (t, s) => t.length * s * 0.5);
  const json = G.exporters.toJson(m);
  assert.ok(json.powerLines.x.some((l) => l.fraction === '1/3' && l.position === 640));
  assert.ok(json.powerLines.anchors.some((a) => a.label === '1/2 · 1/2' && a.onDiagonal));
  assert.match(G.exporters.toCss(m), /--power-x-1-3: 640px;/);
  const svg = G.exporters.toSvg(m, G.scene.buildScene(m));
  assert.match(svg, /<circle /);
});

test('snapped lines are mirror-symmetric and agree with the canon margins', () => {
  require('../src/core/model.js');
  const p = computePowerLines(normalize({ powerDepth: 4 }), view);
  p.y.filter((l) => l.value < 0.5).forEach((l) => {
    const twin = p.y.find((m) => m.num + l.num === m.den && m.den === l.den);
    assert.equal(twin.pos, view.height - l.pos, l.label);
  });
  const canon = G.canon.computeCanon(normalize({ divisions: 12 }));
  const fiveSixths = p.y.find((l) => l.label === '5/6');
  assert.equal(canon.blocks[0].y + canon.blocks[0].h, fiveSixths.pos);
});
