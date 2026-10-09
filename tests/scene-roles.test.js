const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/model.js');
require('../src/core/exporters.js');
require('../src/core/library.js');
const G = globalThis.GridCalc;
const { makeElement } = G.config;

const measure = (t, s) => t.length * s * 0.5;

/** A tiny analysis with every part the overlay draws. */
const analysis = {
  version: 1, width: 1416, height: 2000, ratio: 0.708, coverage: 0.07, confidence: 1, warnings: [], fragments: [], micro: null,
  blocks: [{ id: 0, lines: 3, align: 'left', size: 34, ascent: 25, xHeight: 17, leading: 36, leadingRatio: 1.06, left: 481, right: 900, top: 920, bottom: 1100, baselines: [945, 981, 1017], polarity: 'dark', allCaps: false }],
  clusters: [{ id: 0, size: 34, ascent: 25, xHeight: 17, blocks: [0], lines: 3, leading: 36, leadingRatio: 1.06, ratioToBody: 1, role: 'body' }],
  baseline: { step: 36, offset: 9, lines: 3, onGrid: 3, confidence: 1, sizeRatio: 1.06, cluster: 0, others: [] },
  axes: [{ side: 'left', x: 481, fraction: 0.34, fragments: 3, blocks: 1, match: { label: '1/3', pos: 472, deviation: 9, deviationPct: 0.6, chance: 0.1, strength: 'near' } }],
  extremes: null,
};

test('every drawing primitive the scene can produce has a style (no role is silently skipped)', () => {
  const style = { id: 'x', name: 'Test', works: 2, confidence: 0.5, signature: ['a'], axes: [{ side: 'left', fraction: 0.33, label: '1/3' }] };
  const model = G.model.buildModel({
    showPlacements: true, showSlots: true, showStyleAxes: true, showReference: true, showDetected: true, showStripDiagonals: true, showPowerDiagonals: true, showGutters: true,
    anchorMode: 'all', rows: 2,
    elements: [makeElement('headline', 'h', { value: 'Hi' }), makeElement('logo', 'l', { asset: { id: 'a-1', name: 'x.svg', kind: 'svg', width: 4, height: 1 } }), makeElement('image', 'i', { asset: { id: 'a-2', name: 'x.png', kind: 'bitmap', width: 3, height: 2 } })],
  }, measure, { reference: { assetId: 'a-ref', name: 'ref', analysis }, style });
  const styles = G.scene.roleStyles(model.cfg);
  const scene = G.scene.buildScene(model);
  const roles = new Set(scene.map((p) => p.role));
  [...roles].forEach((r) => assert.ok(styles[r], `role "${r}" has no style`));
  ['reference', 'refAxis', 'refBaseline', 'refBlock', 'refLabel', 'styleAxis', 'styleLabel', 'placement', 'focal', 'asset', 'element'].forEach((r) => assert.ok(roles.has(r), `scene never produced "${r}"`));
});

test('the reference underlay comes first so everything is drawn over it', () => {
  const model = G.model.buildModel({ showReference: true }, measure, { reference: { assetId: 'a-ref', name: 'ref', analysis } });
  const scene = G.scene.buildScene(model);
  assert.equal(scene[0].role, 'reference');
  assert.equal(scene[0].t, 'image');
  assert.equal(scene[0].alpha, model.cfg.referenceOpacity);
});

test('detected overlay scales analysis coordinates onto a canvas of a different size', () => {
  const model = G.model.buildModel({ layout: 'page', width: 708, height: 1000, showDetected: true, fitCanvas: false }, measure, { reference: { assetId: 'a', analysis } });
  const axis = G.scene.buildScene(model).find((p) => p.role === 'refAxis');
  assert.ok(Math.abs(axis.x1 - 240.5) < 1e-6); // 481 × (708 / 1416)
  assert.equal(axis.y2, 1000);
});

test('the applied style appears in the placements JSON and the agent brief', () => {
  const style = { id: 'x', name: 'Josef Müller-Brockmann', works: 3, confidence: 0.6, signature: ['Sets body text solid.'], axes: [{ side: 'left', fraction: 0.333, label: '1/3' }] };
  const model = G.model.buildModel({}, measure, { style });
  assert.equal(G.exporters.toPlacementsJson(model).style.designer, 'Josef Müller-Brockmann');
  const brief = G.exporters.toBrief(model);
  assert.match(brief, /Style: Josef Müller-Brockmann \(3 works analysed, confidence 60%\)/);
  assert.match(brief, /Sets body text solid/);
  assert.equal(G.exporters.toPlacementsJson(G.model.buildModel({}, measure)).style, null);
});
