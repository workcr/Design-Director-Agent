const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/model.js');
require('../src/core/exporters.js');
const G = globalThis.GridCalc;
const { normalize } = G.config;
const { layoutAxis } = G.columns;
const { resolveType, snapLeading } = G.typography;
const { buildModel } = G.model;
const { isOnGrid } = G.math;

const measure = (t, size) => t.length * size * 0.5;

test('layoutAxis fit: columns and gutters are whole units, leftover is returned', () => {
  const r = layoutAxis({ start: 96, length: 640, count: 3, gutterUnits: 2, unit: 8, fit: true });
  assert.equal(r.ok, true);
  r.items.forEach((i) => assert.ok(isOnGrid(i.size, 8) && isOnGrid(i.start, 8)));
  assert.equal(r.items[0].size, 200); // floor((80-4)/3)=25 units
  assert.equal(r.leftover, 8);
  assert.equal(r.span.size, 3 * 200 + 2 * 16);
});

test('layoutAxis fit honours anchor', () => {
  const base = { start: 0, length: 640, count: 3, gutterUnits: 2, unit: 8, fit: true };
  assert.equal(layoutAxis({ ...base, anchor: 'start' }).span.start, 0);
  assert.equal(layoutAxis({ ...base, anchor: 'end' }).span.start, 8);
  assert.equal(layoutAxis({ ...base, anchor: 'center' }).span.start, 0); // 1 unit leftover → floor(0.5)=0
});

test('layoutAxis multiple keeps rows on whole line-heights', () => {
  const r = layoutAxis({ start: 0, length: 672, count: 4, gutterUnits: 3, unit: 8, fit: true, multiple: 3 });
  assert.equal(r.items[0].size % 24, 0);
});

test('layoutAxis reports when nothing fits', () => {
  const r = layoutAxis({ start: 0, length: 40, count: 10, gutterUnits: 2, unit: 8, fit: true });
  assert.equal(r.ok, false);
});

test('leading is a multiple of the baseline step and never tighter than the type size', () => {
  const t = resolveType(normalize({}));
  t.scale.forEach((s) => {
    assert.equal(s.leadingUnits % t.baselineUnits, 0, s.name);
    assert.ok(s.leading >= s.size * 1.05 - 1e-9, `${s.name} ${s.leading} vs ${s.size}`);
  });
  assert.equal(t.styles.p.leadingUnits, 3); // 16 × 1.5 / 8
});

test('snapLeading rounds up when too tight', () => {
  assert.equal(snapLeading(1, 1, 3), 4);
  assert.equal(snapLeading(2.6, 3, 2), 3);
});

test('default model: every edge sits on the grid', () => {
  const m = buildModel({}, measure);
  assert.equal(m.integrity.ratio, 1, JSON.stringify(m.integrity.offenders));
  assert.equal(m.warnings.length, 0, JSON.stringify(m.warnings));
});

test('property: snapped + fitted layouts are always 100% on-grid', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 300; i++) {
    const cfg = {
      unit: pick([4, 6, 8, 10, 12, 16]), layout: pick(['spread', 'page']),
      width: 600 + Math.floor(rnd() * 1800), height: 500 + Math.floor(rnd() * 1000),
      divisions: 4 + Math.floor(rnd() * 20), snapMode: pick(['nearest', 'floor', 'ceil']),
      blockMode: pick(['pages', 'centered']), columns: 1 + Math.floor(rnd() * 6), gutter: Math.floor(rnd() * 4),
      rows: 1 + Math.floor(rnd() * 4), rowGutter: Math.floor(rnd() * 4), fitAnchor: pick(['inner', 'outer', 'center']),
      baseSize: 10 + Math.floor(rnd() * 14), baselineMode: pick(['leading', 'unit', 'custom']),
    };
    const m = buildModel(cfg, measure);
    if (m.grids.every((g) => g.ok)) {
      assert.equal(m.integrity.ratio, 1, `${JSON.stringify(cfg)} → ${JSON.stringify(m.integrity.offenders)}`);
    }
  }
});

test('specimen baselines all lie on baseline-grid lines and inside their column', () => {
  const m = buildModel({}, measure);
  assert.ok(m.text.length > 10);
  m.text.forEach((l) => {
    const k = (l.y - m.baseline.origin) / m.baseline.step;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `baseline ${l.y} off the ${m.baseline.step}px grid`);
  });
  const areas = m.grids.flatMap((g) => g.columns);
  m.text.forEach((l) => {
    const a = areas[l.area];
    assert.ok(l.y <= a.y + a.h + 1e-9 && l.y > a.y, 'baseline inside column');
  });
});

test('specimen respects column width', () => {
  const m = buildModel({}, measure);
  const areas = m.grids.flatMap((g) => g.columns);
  m.text.forEach((l) => {
    if (!l.text.includes(' ')) return;
    assert.ok(measure(l.text, l.size) <= areas[l.area].w + 1e-6, l.text);
  });
});

test('invalid input is clamped, never thrown', () => {
  const m = buildModel({ unit: -4, columns: 999, divisions: 'abc', cBg: 'red', snapMode: 'sideways' }, measure);
  assert.equal(m.cfg.unit, 1);
  assert.equal(m.cfg.columns, 24);
  assert.equal(m.cfg.divisions, 9);
  assert.equal(m.cfg.cBg, G.config.DEFAULTS.cBg);
  assert.equal(m.cfg.snapMode, 'nearest');
});

test('exporters produce parseable output', () => {
  const m = buildModel({}, measure);
  const css = G.exporters.toCss(m);
  assert.match(css, /--u: 8px;/);
  assert.match(css, /--column-width: 200px;/);
  const json = G.exporters.toJson(m);
  assert.equal(json.foundations.setUp.gridUnit, 8);
  JSON.stringify(json);
  const svg = G.exporters.toSvg(m, G.scene.buildScene(m));
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\n$/);
});

test('toggleGuides hides every guide, then restores the previous mix', () => {
  const { toggleGuides, guidesVisible, GUIDE_KEYS } = G.config;
  const cfg = normalize({ showLadder: false, showGutters: true });
  const off = toggleGuides(cfg, null);
  assert.ok(GUIDE_KEYS.every((k) => off.patch[k] === false));
  assert.equal(guidesVisible(normalize({ ...cfg, ...off.patch })), false);
  const on = toggleGuides(normalize({ ...cfg, ...off.patch }), off.saved);
  assert.equal(on.patch.showLadder, false);
  assert.equal(on.patch.showGutters, true);
  assert.equal(on.patch.showPixelGrid, true);
});

test('toggleGuides falls back to defaults when nothing was saved', () => {
  const { toggleGuides, GUIDE_KEYS } = G.config;
  const allOff = normalize(Object.fromEntries(GUIDE_KEYS.map((k) => [k, false])));
  const on = toggleGuides(allOff, null);
  assert.equal(on.patch.showPixelGrid, true);
  assert.equal(on.patch.showGutters, false); // default is off
});

test('guide toggle leaves the specimen text alone', () => {
  assert.ok(!G.config.GUIDE_KEYS.includes('showSpecimen'));
});

test('solid leading: 36px type on a 36px step can have 36px leading, the default cannot', () => {
  assert.equal(snapLeading(9, 9, 9, 1.0), 9);
  assert.equal(snapLeading(9, 9, 9), 18); // default keeps the 1.05 safety margin
  const solid = resolveType(normalize({ unit: 4, baseSize: 36, lineHeight: 1, baselineMode: 'custom', baselineCustom: 9, tighten: 0, minLeading: 1 }));
  assert.equal(solid.styles.p.leading, 36);
  assert.equal(solid.scale.every((s) => s.leadingUnits % 9 === 0), true);
  const tight = resolveType(normalize({ unit: 4, baseSize: 36, lineHeight: 1, baselineMode: 'custom', baselineCustom: 9, tighten: 0 }));
  assert.equal(tight.styles.p.leading, 72);
});

test('baseline offset shifts the whole grid, specimen and elements included', () => {
  const plain = buildModel({}, measure);
  const shifted = buildModel({ baselineOffset: 10 }, measure);
  assert.equal(shifted.baseline.origin - plain.baseline.origin, 10);
  assert.equal(shifted.baseline.ys[0], 10 % shifted.baseline.step);
  shifted.text.forEach((l) => {
    const k = (l.y - shifted.baseline.origin) / shifted.baseline.step;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9);
  });
  assert.equal(normalize({ baselineOffset: 9999 }).baselineOffset, 400);
  assert.equal(normalize({ minLeading: 0.2 }).minLeading, 1);
});
