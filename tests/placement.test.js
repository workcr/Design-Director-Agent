const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/model.js');
require('../src/core/placement.js');
require('../src/core/exporters.js');
const G = globalThis.GridCalc;
const { orientationOf, TEMPLATES } = G.placement;

const measure = (t, s) => t.length * s * 0.5;
const build = (cfg = {}) => G.model.buildModel({ powerDepth: 3, ...cfg }, measure);

const CANVASES = {
  landscape: { layout: 'spread', width: 1920, height: 1080 },
  portrait: { layout: 'page', width: 794, height: 1123 },
  square: { layout: 'page', width: 1080, height: 1080 },
};

test('orientation thresholds', () => {
  assert.equal(orientationOf({ width: 1920, height: 1080 }), 'landscape');
  assert.equal(orientationOf({ width: 794, height: 1123 }), 'portrait');
  assert.equal(orientationOf({ width: 1080, height: 1080 }), 'square');
  assert.equal(orientationOf({ width: 1080, height: 1000 }), 'square');
});

test('every orientation has templates, and template ids are unique', () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  ['landscape', 'portrait', 'square'].forEach((o) => assert.ok(TEMPLATES.filter((t) => t.orientation === o).length >= 2, o));
});

test('placements follow the canvas orientation', () => {
  Object.entries(CANVASES).forEach(([name, c]) => {
    const p = build(c).placements;
    assert.equal(p.orientation, name);
    assert.ok(p.available.length >= 2);
    assert.ok(p.available.every((t) => TEMPLATES.find((x) => x.id === t.id).orientation === name));
  });
});

test('margin token resolves to the 1/12 power line and mirrors', () => {
  const p = build(CANVASES.landscape).placements;
  assert.equal(p.margin.x.label, '1/12');
  assert.equal(p.margin.x.pos, 160);
  assert.equal(p.margin.y.pos, 88); // 1080/12 = 90 → 88
  assert.equal(p.margin.xFar.pos, 1760);
  assert.equal(p.margin.yFar.pos, 992);
});

test('at depth 3 every template edge lands on a power line and on the unit grid', () => {
  Object.values(CANVASES).forEach((c) => {
    const m = build(c);
    m.placements.templates.forEach((t) => {
      t.items.forEach((it) => {
        const { x, y, width, height } = it.box;
        [x, y, width, height].forEach((v) => assert.equal(v % m.unit, 0, `${t.id}/${it.role} ${v}`));
        assert.ok(width > 0 && height > 0, `${t.id}/${it.role} has size`);
        Object.entries(it.edges).forEach(([edge, e]) => assert.ok(e.onPowerLine, `${t.id}/${it.role}/${edge} ${e.fraction}`));
      });
    });
    assert.equal(m.placements.offLines, 0);
  });
});

test('with too few lines, placements fall back to grid-snapped positions and say so', () => {
  const m = build({ ...CANVASES.landscape, powerDepth: 1 });
  assert.ok(m.placements.offLines > 0);
  m.placements.templates.forEach((t) => t.items.forEach((it) => {
    [it.box.x, it.box.y, it.box.width, it.box.height].forEach((v) => assert.equal(v % m.unit, 0));
  }));
  assert.ok(m.warnings.some((w) => /power line/.test(w.text)) === false, 'warning only when previewing');
  const shown = build({ ...CANVASES.landscape, powerDepth: 1, showPlacements: true });
  assert.ok(shown.warnings.some((w) => /power line/.test(w.text)));
});

test('selected template is honoured, and unknown ids fall back to the first', () => {
  const second = TEMPLATES.filter((t) => t.orientation === 'landscape')[1];
  assert.equal(build({ ...CANVASES.landscape, placementTemplate: second.id }).placements.selected.id, second.id);
  const fallback = build({ ...CANVASES.landscape, placementTemplate: 'portrait-stack-top' });
  assert.equal(fallback.placements.selected.id, TEMPLATES.find((t) => t.orientation === 'landscape').id);
});

test('focal points are thirds anchors ranked per orientation', () => {
  const l = build(CANVASES.landscape).placements.focalPoints;
  assert.equal(l.length, 4);
  assert.deepEqual([l[0].x, l[0].y], [1280, 360]); // 2/3 · 1/3
  assert.equal(l[0].rank, 1);
  const s = build(CANVASES.square).placements.focalPoints;
  assert.equal(s[0].label, '1/2 · 1/2');
  assert.ok(s.every((f) => typeof f.onDiagonal === 'boolean'));
});

test('JSON export is complete and machine-readable', () => {
  const m = build(CANVASES.landscape);
  const json = G.exporters.toPlacementsJson(m);
  assert.equal(json.canvas.orientation, 'landscape');
  assert.equal(json.canvas.unit, 8);
  assert.ok(json.lines.x.some((l) => l.fraction === '1/3' && l.position === 640));
  assert.ok(json.templates.length >= 2);
  const item = json.templates[0].items[0];
  assert.ok(item.role && item.anchor && item.anchorPoint && item.box && item.edges);
  assert.equal(JSON.parse(JSON.stringify(json)).selected, m.placements.selected.id);
  assert.equal(JSON.stringify(json), JSON.stringify(G.exporters.toPlacementsJson(build(CANVASES.landscape))), 'deterministic');
});

test('agent brief names the canvas, rules, focal points and the selected template', () => {
  const m = build(CANVASES.landscape);
  const brief = G.exporters.toBrief(m);
  assert.match(brief, /1920 × 1080/);
  assert.match(brief, /8 ?px/);
  assert.match(brief, /Focal points/);
  assert.match(brief, new RegExp(m.placements.selected.name));
  assert.match(brief, /headline/i);
  assert.match(brief, /snap/i);
});

test('scene draws the selected template and focal points only when previewing', () => {
  const off = G.scene.buildScene(build(CANVASES.landscape));
  assert.ok(!off.some((p) => p.role === 'placement'));
  const on = G.scene.buildScene(build({ ...CANVASES.landscape, showPlacements: true }));
  assert.ok(on.filter((p) => p.role === 'placement').length >= 4);
  assert.ok(on.some((p) => p.role === 'focal'));
});
