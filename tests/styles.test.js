const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/library.js');
const G = globalThis.GridCalc;
const { features, buildProfile, rank, styleToPatch, SOLID } = G.styles;
const lib = G.library;

/** A hand-built analysis: only the fields the learning layer reads. */
function fake({ W = 1416, H = 2000, step = 36, bodySize = 34, bodyLead = 36, displaySize = 180, displayLead = 176, align = 'left', axes, left = 0.13, right = 0.08, coverage = 0.07 } = {}) {
  const axisList = axes || [{ side: 'left', x: 481, fraction: 0.3397, fragments: 21, blocks: 5, label: '1/3', strength: 'near' }, { side: 'right', x: 944, fraction: 0.6667, fragments: 3, blocks: 2, label: '2/3', strength: 'strong' }];
  return {
    version: 1, width: W, height: H, ratio: W / H, coverage, confidence: 1, warnings: [],
    blocks: [
      { id: 0, lines: 2, align: 'left', size: displaySize, ascent: displaySize * 0.72, xHeight: displaySize * 0.5, leading: displayLead, leadingRatio: displayLead / displaySize, left: 480, right: 1121, top: 51, bottom: 356, polarity: 'dark', allCaps: false },
      { id: 1, lines: 9, align, size: bodySize, ascent: bodySize * 0.72, xHeight: bodySize * 0.5, leading: bodyLead, leadingRatio: bodyLead / bodySize, left: 481, right: 856, top: 1460, bottom: 1780, polarity: 'dark', allCaps: false },
    ],
    clusters: [
      { id: 0, size: displaySize, ascent: displaySize * 0.72, xHeight: displaySize * 0.5, blocks: [0], lines: 2, leading: displayLead, leadingRatio: displayLead / displaySize, ratioToBody: displaySize / bodySize, role: 'display' },
      { id: 1, size: bodySize, ascent: bodySize * 0.72, xHeight: bodySize * 0.5, blocks: [1], lines: 9, leading: bodyLead, leadingRatio: bodyLead / bodySize, ratioToBody: 1, role: 'body' },
    ],
    baseline: { step, offset: 9, lines: 9, onGrid: 9, confidence: 1, sizeRatio: step / bodySize },
    axes: axisList.map((x) => ({ ...x, match: { label: x.label, pos: x.x, deviation: 0, deviationPct: 0, chance: 0.1, strength: x.strength } })),
    extremes: {
      left: { x: left * W, fraction: left, match: { label: '1/8', pos: 0, deviation: 0, deviationPct: 0, chance: 1, strength: 'none' } },
      right: { x: (1 - right) * W, fraction: 1 - right, match: { label: '11/12', pos: 0, deviation: 0, deviationPct: 0, chance: 0.1, strength: 'strong' } },
      top: { y: 51, fraction: 51 / H, match: { label: '1/24', pos: 0, deviation: 0, deviationPct: 0, chance: 1, strength: 'none' } },
      bottom: { y: 1774, fraction: 1774 / H, match: { label: '7/8', pos: 0, deviation: 0, deviationPct: 0, chance: 1, strength: 'none' } },
    },
    micro: null,
  };
}

/** Designer A: solid-set, hangs on thirds. Designer B: open leading, centred, two sizes, no axes in common. */
const solid = (over = {}) => fake({ bodyLead: 35, displaySize: 175, ...over });
const open = (over = {}) => fake({ bodyLead: 52, displaySize: 70, step: 52, align: 'center', axes: [{ side: 'center', x: 708, fraction: 0.5, fragments: 8, blocks: 3, label: '1/2', strength: 'strong' }], left: 0.2, right: 0.2, coverage: 0.18, ...over });

test('features: scale-free description of a layout', () => {
  const f = features(solid());
  assert.ok(Math.abs(f.aspect - 1416 / 2000) < 1e-9);
  assert.ok(Math.abs(f.baselineStepRatio - 36 / 2000) < 1e-4);
  assert.ok(f.bodyLeadingRatio <= SOLID);
  assert.ok(Math.abs(f.displayBodyRatio - 175 / 34) < 0.05);
  assert.equal(f.sizeCount, 2);
  assert.equal(f.alignLeft, 1); // the only multi-line blocks are flush-left
  assert.ok(f.axes.some((x) => x.label === '2/3' && x.side === 'right'));
  assert.ok(Math.abs(f.marginRight - 0.08) < 1e-3);
});

test('profile pools works: mean, spread, recurring axes, signature, confidence grows', () => {
  const list = [features(solid()), features(solid({ bodyLead: 36 })), features(solid({ displaySize: 190 }))];
  const p = buildProfile(list);
  assert.equal(p.works, 3);
  assert.ok(p.stats.bodyLeadingRatio.mean > 0.98 && p.stats.bodyLeadingRatio.mean < 1.12);
  assert.ok(p.stats.displayBodyRatio.sd > 0);
  assert.equal(p.solidShare, 1);
  const labels = p.axes.map((x) => `${x.side}:${x.label}`);
  assert.ok(labels.includes('left:1/3') && labels.includes('right:2/3'));
  assert.ok(p.axes.every((x) => x.frequency === 1));
  assert.ok(p.signature.some((s) => /solid/i.test(s)) && p.signature.some((s) => /1\/3/.test(s)));
  assert.ok(buildProfile([list[0]]).confidence < p.confidence);
  assert.deepEqual(buildProfile([]).signature, []);
});

test('axes seen in fewer than half of the works are not part of the style', () => {
  const odd = fake({ axes: [{ side: 'left', x: 300, fraction: 0.2, fragments: 5, blocks: 2, label: '1/6', strength: 'near' }] });
  const p = buildProfile([features(solid()), features(solid()), features(odd)]);
  assert.ok(!p.axes.some((x) => x.label === '1/6'));
  assert.ok(p.axes.some((x) => x.label === '1/3' && x.frequency === 0.67));
});

test('rank suggests the right designer only from profiles with two or more works', () => {
  let l = lib.emptyLibrary();
  l = lib.addWork(l, { designer: 'Solid Person', title: 'a', analysis: solid() }, { id: 'a1', now: 1 });
  assert.equal(lib.suggest(l, features(solid())).best, null, 'one work is not enough to suggest');
  l = lib.addWork(l, { designer: 'Solid Person', title: 'b', analysis: solid({ bodyLead: 36 }) }, { id: 'a2', now: 2 });
  l = lib.addWork(l, { designer: 'Open Person', title: 'c', analysis: open() }, { id: 'b1', now: 3 });
  l = lib.addWork(l, { designer: 'Open Person', title: 'd', analysis: open({ bodyLead: 54 }) }, { id: 'b2', now: 4 });
  const forSolid = lib.suggest(l, features(solid({ displaySize: 182 })));
  assert.equal(forSolid.best.designerId, 'solid-person');
  assert.ok(forSolid.ranking[0].similarity > forSolid.ranking[1].similarity);
  const forOpen = lib.suggest(l, features(open({ bodyLead: 53 })));
  assert.equal(forOpen.best.designerId, 'open-person');
});

test('a layout unlike every profile gets no confident suggestion', () => {
  let l = lib.emptyLibrary();
  ['a', 'b'].forEach((t, i) => { l = lib.addWork(l, { designer: 'Solid Person', title: t, analysis: solid() }, { id: `s${i}`, now: i }); });
  const alien = fake({ bodyLead: 90, bodySize: 20, step: 90, displaySize: 22, align: 'right', coverage: 0.5, left: 0.02, right: 0.02, axes: [{ side: 'right', x: 1300, fraction: 0.92, fragments: 5, blocks: 2, label: '11/12', strength: 'strong' }] });
  assert.equal(lib.suggest(l, features(alien)).best, null);
});

test('styleToPatch turns a profile into tool settings that fit the target canvas', () => {
  const p = buildProfile([features(solid()), features(solid())]);
  const patch = styleToPatch(p, { width: 1416, height: 2000, unit: 4 });
  assert.equal(patch.minLeading, 1);
  assert.equal(patch.baselineMode, 'custom');
  assert.equal(patch.baselineCustom, 9); // 36px at unit 4
  assert.ok(patch.baseSize >= 30 && patch.baseSize <= 36);
  const small = styleToPatch(p, { width: 708, height: 1000, unit: 4 });
  assert.equal(small.baselineCustom, 5); // same proportions on a half-size canvas
  const loose = styleToPatch(buildProfile([features(open()), features(open())]), { width: 1000, height: 1000, unit: 8 });
  assert.equal(loose.minLeading, 1.05);
});

/* ---------- library ---------- */

test('library: add, group by designer (accents ignored), remove', () => {
  let l = lib.emptyLibrary();
  l = lib.addWork(l, { designer: 'Josef Müller-Brockmann', title: 'Opernhaus', analysis: solid() }, { id: 'w1', now: 1 });
  l = lib.addWork(l, { designer: 'josef muller-brockmann', title: 'Beethoven', analysis: solid() }, { id: 'w2', now: 2 });
  assert.equal(l.designers.length, 1);
  assert.equal(l.designers[0].id, 'josef-muller-brockmann');
  assert.equal(l.designers[0].name, 'Josef Müller-Brockmann');
  assert.equal(l.designers[0].works.length, 2);
  assert.deepEqual(lib.counts(l), { designers: 1, works: 2 });
  assert.equal(lib.removeWork(l, 'w1').designers[0].works.length, 1);
  assert.equal(lib.removeWork(lib.removeWork(l, 'w1'), 'w2').designers.length, 0, 'an emptied designer disappears');
  assert.equal(lib.removeDesigner(l, 'josef-muller-brockmann').designers.length, 0);
});

test('library is immutable and refuses layouts with nothing measured', () => {
  const base = lib.emptyLibrary();
  const next = lib.addWork(base, { designer: 'X', analysis: solid() }, { id: 'w1' });
  assert.equal(base.designers.length, 0);
  assert.notEqual(base, next);
  assert.throws(() => lib.addWork(base, { designer: 'X', analysis: { width: 100, height: 100, blocks: [], clusters: [] } }), /nothing to learn/);
  assert.throws(() => lib.addWork(base, { designer: 'X', analysis: null }), /nothing to learn/);
  assert.equal(next.designers[0].works[0].title, 'Untitled');
  assert.equal(lib.addWork(base, { analysis: solid() }, { id: 'w' }).designers[0].name, 'Unassigned');
});

test('sanitize: clamps and whitelists, recomputes features, drops junk, never trusts imported features', () => {
  const dirty = {
    designers: [
      { name: '  Evil <b>Name</b>\u0000', works: [{ id: 'bad id!', title: 'x'.repeat(500), analysis: { ...solid(), blocks: [...solid().blocks, { id: 99, lines: 'many', align: 'nope', size: 1e12, polarity: 'x' }] }, features: { aspect: 999 }, thumb: 'javascript:alert(1)' }, { analysis: { nothing: true } }, null] },
      { name: '', works: [] }, 'garbage', null,
      { name: 'evil <b>name</b>', works: [] },
    ],
  };
  const clean = lib.sanitizeLibrary(dirty);
  assert.equal(clean.designers.length, 1);
  const w = clean.designers[0].works[0];
  assert.equal(clean.designers[0].works.length, 1);
  assert.ok(w.title.length <= 120);
  assert.equal(w.thumb, '');
  assert.ok(Math.abs(w.features.aspect - 1416 / 2000) < 1e-9, 'features recomputed, not imported');
  assert.equal(w.analysis.blocks[2].align, 'single');
  assert.ok(w.analysis.blocks[2].size <= 1e5);
  assert.match(w.id, /^[a-z0-9-]+$/);
  assert.deepEqual(lib.sanitizeLibrary('nope'), lib.emptyLibrary());
  assert.deepEqual(lib.sanitizeLibrary({ designers: 'x' }), lib.emptyLibrary());
});

test('sanitize round-trips a real library unchanged', () => {
  let l = lib.emptyLibrary();
  l = lib.addWork(l, { designer: 'A', title: 'one', analysis: solid() }, { id: 'w1', now: 5 });
  l = lib.addWork(l, { designer: 'B', title: 'two', analysis: open() }, { id: 'w2', now: 6 });
  const again = lib.sanitizeLibrary(JSON.parse(JSON.stringify(l)));
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(l)));
});

test('merge: imports add new works, never duplicate or overwrite existing ones', () => {
  let a = lib.addWork(lib.emptyLibrary(), { designer: 'A', title: 'mine', analysis: solid() }, { id: 'w1', now: 1 });
  const b = lib.addWork(lib.addWork(lib.emptyLibrary(), { designer: 'A', title: 'theirs-changed', analysis: solid() }, { id: 'w1', now: 9 }), { designer: 'C', title: 'new', analysis: open() }, { id: 'w3', now: 3 });
  a = lib.mergeLibraries(a, JSON.parse(JSON.stringify(b)));
  assert.deepEqual(lib.counts(a), { designers: 2, works: 2 });
  assert.equal(a.designers.find((d) => d.id === 'a').works[0].title, 'mine');
});

test('limits: designer and work counts are capped', () => {
  let l = lib.emptyLibrary();
  for (let i = 0; i < lib.LIMITS.designers; i++) l = lib.addWork(l, { designer: `D${i}`, analysis: solid() }, { id: `w${i}` });
  assert.throws(() => lib.addWork(l, { designer: 'one more', analysis: solid() }), /up to/);
  const many = { designers: Array.from({ length: lib.LIMITS.designers + 50 }, (_, i) => ({ name: `N${i}`, works: [] })) };
  assert.ok(lib.sanitizeLibrary(many).designers.length <= lib.LIMITS.designers);
});

test('styleContext packages a designer for drawing and export, and is null for strangers', () => {
  let l = lib.emptyLibrary();
  l = lib.addWork(l, { designer: 'Solid Person', title: 'a', analysis: solid() }, { id: 'a1', now: 1 });
  l = lib.addWork(l, { designer: 'Solid Person', title: 'b', analysis: solid() }, { id: 'a2', now: 2 });
  const ctx = lib.styleContext(l, 'solid-person');
  assert.equal(ctx.name, 'Solid Person');
  assert.equal(ctx.works, 2);
  assert.ok(ctx.axes.some((x) => x.label === '2/3' && x.side === 'right'));
  assert.ok(ctx.signature.length > 2);
  assert.equal(lib.styleContext(l, 'nobody'), null);
});
