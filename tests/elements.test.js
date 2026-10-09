const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/fonts.js');
require('../src/core/model.js');
require('../src/core/elements.js');
require('../src/core/exporters.js');
const G = globalThis.GridCalc;
const { makeElement, sanitizeElements } = G.config;

const measure = (t, size) => t.length * size * 0.5; // deterministic stand-in for real font metrics
const LANDSCAPE = { layout: 'spread', width: 1920, height: 1080, powerDepth: 3, placementTemplate: 'landscape-split' };
const build = (elements, extra = {}) => G.model.buildModel({ ...LANDSCAPE, ...extra, elements }, measure);
const el = (role, id, patch) => makeElement(role, id, patch);
const item = (m, id) => m.elements.items.find((i) => i.id === id);
const onStep = (m, y) => Math.abs((y - m.baseline.origin) / m.baseline.step - Math.round((y - m.baseline.origin) / m.baseline.step)) < 1e-9;

test('sanitize: drops unknown roles, clamps values, de-duplicates ids, caps the list', () => {
  const list = sanitizeElements([
    { role: 'nope' }, { role: 'headline', id: 'a', sizeStep: 999, leading: -4, weight: '555', align: 'sideways', font: 'Comic Sans' },
    { role: 'body', id: 'a' }, { role: 'body' }, null,
  ]);
  assert.equal(list.length, 3);
  assert.equal(new Set(list.map((e) => e.id)).size, 3);
  const h = list[0];
  assert.equal(h.sizeStep, 12);
  assert.equal(h.leading, 0);
  assert.equal(h.weight, '700'); // invalid weight falls back to the role default
  assert.equal(h.align, 'left');
  assert.equal(h.font, 'inherit');
  assert.equal(sanitizeElements(Array.from({ length: 60 }, () => ({ role: 'body' }))).length, G.config.MAX_ELEMENTS);
  assert.deepEqual(sanitizeElements('x'), []);
});

test('sanitize: only logo and image keep asset metadata, and it must be valid', () => {
  const asset = { id: 'a-1', name: 'logo.svg', kind: 'svg', width: 400, height: 100 };
  const [logo, body, bad] = sanitizeElements([{ role: 'logo', asset }, { role: 'body', asset }, { role: 'logo', asset: { width: 0, height: 5 } }]);
  assert.equal(logo.asset.width, 400);
  assert.equal(body.asset, null);
  assert.equal(bad.asset, null);
});

test('fonts: stacks for built-in, unknown and uploaded fonts', () => {
  assert.match(G.fonts.stack('Georgia'), /Georgia/);
  assert.equal(G.fonts.stack('gc-font-missing'), 'sans-serif');
  G.fonts.register({ id: 'gc-font-test', name: 'Test.otf' });
  assert.match(G.fonts.stack('gc-font-test'), /gc-font-test/);
  assert.equal(G.fonts.idFor('GT-America Medium.otf'), 'gc-font-gt-america-medium');
  assert.equal(G.fonts.idFor('GT-America Medium.otf'), G.fonts.idFor('GT-America Medium.otf'));
  G.fonts.unregister('gc-font-test');
});

test('a headline lands in its template slot with baselines on the grid and a box on the unit grid', () => {
  const m = build([el('headline', 'h', { value: 'the family of man' })]);
  const h = item(m, 'h');
  const slot = m.placements.templates.find((t) => t.id === 'landscape-split').items.find((i) => i.role === 'headline').box;
  assert.equal(h.kind, 'text');
  assert.equal(h.box.x, slot.x);
  assert.ok(h.box.y >= slot.y && h.box.y < slot.y + m.unit * 4);
  [h.box.x, h.box.y, h.box.width, h.box.height].forEach((v) => assert.equal(v % m.unit, 0, `box value ${v}`));
  h.text.lines.forEach((l) => assert.ok(onStep(m, l.y), `baseline ${l.y}`));
  assert.equal(h.fits, true);
  assert.equal(h.text.lines.map((l) => l.text).join(' '), 'the family of man');
});

test('leading is a multiple of the baseline step, never tighter than the type size', () => {
  const m = build([el('headline', 'h', { value: 'a long headline that has to wrap over several lines to test leading' })]);
  const t = item(m, 'h').text;
  assert.equal(t.leadingUnits % m.baseline.units, 0);
  assert.ok(t.leading >= t.size * 1.05 - 1e-9);
  const ys = t.lines.map((l) => l.y);
  ys.slice(1).forEach((y, i) => assert.equal(y - ys[i], t.leading));
});

test('overflow steps the size down when auto-fit is on, and is flagged when it is off', () => {
  const long = 'word '.repeat(60).trim();
  const auto = item(build([el('headline', 'h', { value: long, sizeStep: 6 })]), 'h');
  assert.ok(auto.text.steppedDown, 'stepped down');
  assert.ok(auto.text.stepUsed < auto.text.stepRequested);
  const fixed = item(build([el('headline', 'h', { value: long, sizeStep: 6, autoFit: false })]), 'h');
  assert.equal(fixed.fits, false);
  assert.ok(fixed.overflow > 0);
  assert.equal(fixed.text.stepUsed, 6);
});

test('a px size override is respected and leading still snaps to the baseline step', () => {
  const m = build([el('body', 'b', { value: 'Some body copy', sizePx: 21 })]);
  const t = item(m, 'b').text;
  assert.equal(t.size, 21);
  assert.equal(t.leadingUnits % m.baseline.units, 0);
});

test('an explicit leading override is rounded up to a whole number of baseline steps', () => {
  const m = build([el('body', 'b', { value: 'one two three four five six seven eight nine ten eleven twelve', leading: 4 })]);
  assert.equal(item(m, 'b').text.leadingUnits % m.baseline.units, 0);
  assert.ok(item(m, 'b').text.leadingUnits >= 4);
});

test('a subhead stacks under the headline in the same column', () => {
  const m = build([el('headline', 'h', { value: 'the family of man' }), el('subhead', 's', { value: 'Photographs from the exhibition' })]);
  const h = item(m, 'h');
  const s = item(m, 's');
  assert.equal(s.box.x, h.box.x);
  assert.ok(s.box.y >= h.box.y + h.box.height - 1e-9, 'below the headline');
  s.text.lines.forEach((l) => assert.ok(onStep(m, l.y)));
});

test('space before pushes an element down by whole baseline steps', () => {
  const a = item(build([el('headline', 'h', { value: 'x' }), el('subhead', 's', { value: 'y', spaceBefore: 0 })]), 's');
  const b = item(build([el('headline', 'h', { value: 'x' }), el('subhead', 's', { value: 'y', spaceBefore: 2 })]), 's');
  const m = build([]);
  assert.equal(b.text.lines[0].y - a.text.lines[0].y, 2 * m.baseline.step);
});

test('two body elements stack in the body slot', () => {
  const m = build([el('body', 'b1', { value: 'First paragraph.' }), el('body', 'b2', { value: 'Second paragraph.' })]);
  assert.ok(item(m, 'b2').box.y > item(m, 'b1').box.y);
  assert.equal(item(m, 'b2').box.x, item(m, 'b1').box.x);
});

test('legal copy hangs from the bottom margin with its last baseline on the grid', () => {
  const m = build([el('legal', 'l', { value: 'Terms and conditions apply to every offer shown here and may change without notice.' })]);
  const l = item(m, 'l');
  const far = m.placements.margin.yFar.pos;
  const last = l.text.lines[l.text.lines.length - 1].y;
  assert.ok(last <= far + 1e-9);
  assert.ok(far - last < m.baseline.step + m.unit * 2, 'sits close to the margin');
  l.text.lines.forEach((ln) => assert.ok(onStep(m, ln.y)));
});

test('a text slot override moves the element to that slot', () => {
  const m = build([el('headline', 'h', { value: 'Moved', slot: 'cta' })]);
  const cta = m.placements.templates.find((t) => t.id === 'landscape-split').items.find((i) => i.role === 'cta').box;
  assert.equal(item(m, 'h').box.x, cta.x);
  assert.ok(item(m, 'h').box.y >= cta.y);
  assert.equal(item(m, 'h').slot, 'cta');
});

test('text alignment anchors lines left, centre or right of the block', () => {
  const left = item(build([el('headline', 'h', { value: 'Hi', align: 'left' })]), 'h');
  const centre = item(build([el('headline', 'h', { value: 'Hi', align: 'center' })]), 'h');
  const right = item(build([el('headline', 'h', { value: 'Hi', align: 'right' })]), 'h');
  assert.equal(left.text.lines[0].x, left.box.x);
  assert.equal(centre.text.lines[0].x, centre.box.x + centre.box.width / 2);
  assert.equal(right.text.lines[0].x, right.box.x + right.box.width);
});

test('a narrower block width keeps the box on the grid and wraps sooner', () => {
  const wide = item(build([el('body', 'b', { value: 'one two three four five six seven eight nine ten' })]), 'b');
  const narrow = item(build([el('body', 'b', { value: 'one two three four five six seven eight nine ten', widthUnits: 12 })]), 'b');
  assert.equal(narrow.box.width, 12 * 8);
  assert.ok(narrow.text.lines.length > wide.text.lines.length);
});

test('hard line breaks in the value are kept', () => {
  const t = item(build([el('headline', 'h', { value: 'one\ntwo' })]), 'h').text;
  assert.deepEqual(t.lines.map((l) => l.text), ['one', 'two']);
});

test('empty text is skipped without breaking the stack', () => {
  const m = build([el('headline', 'h', { value: '   ' }), el('subhead', 's', { value: 'Still placed' })]);
  assert.equal(item(m, 'h').empty, true);
  assert.equal(item(m, 's').text.lines.length, 1);
});

test('a logo is contained in its slot at whole-unit size, keeping its aspect ratio', () => {
  const asset = { id: 'a-1', name: 'mark.svg', kind: 'svg', width: 400, height: 100 };
  const m = build([el('logo', 'lg', { asset })]);
  const lg = item(m, 'lg');
  [lg.box.x, lg.box.y, lg.box.width, lg.box.height].forEach((v) => assert.equal(v % m.unit, 0));
  assert.ok(lg.asset.aspectError < 0.05, `aspect error ${lg.asset.aspectError}`);
  assert.equal(lg.asset.mode, 'contain');
  const slot = m.placements.templates.find((t) => t.id === 'landscape-split').items.find((i) => i.role === 'logo').box;
  assert.ok(lg.box.width <= slot.width && lg.box.height <= slot.height);
});

test('logo width in units overrides the automatic size', () => {
  const asset = { id: 'a-1', name: 'mark.svg', kind: 'svg', width: 300, height: 100 };
  const lg = item(build([el('logo', 'lg', { asset, widthUnits: 12 })]), 'lg');
  assert.equal(lg.box.width, 12 * 8);
  assert.equal(lg.box.height, 32);
});

test('an image covers its slot exactly', () => {
  const asset = { id: 'a-2', name: 'photo.jpg', kind: 'bitmap', width: 3000, height: 2000 };
  const m = build([el('image', 'im', { asset })]);
  const slot = m.placements.templates.find((t) => t.id === 'landscape-split').items.find((i) => i.role === 'image').box;
  const im = item(m, 'im');
  assert.deepEqual([im.box.x, im.box.y, im.box.width, im.box.height], [slot.x, slot.y, slot.width, slot.height]);
  assert.equal(im.asset.mode, 'cover');
  assert.ok(im.asset.cropped > 0);
});

test('an asset without a loaded file keeps its measurements and is marked missing', () => {
  const m = build([el('logo', 'lg', { asset: null })]);
  assert.equal(item(m, 'lg').asset.missing, true);
});

test('missing uploaded fonts warn and fall back', () => {
  const m = build([el('headline', 'h', { value: 'Hi', font: 'gc-font-nowhere', fontLabel: 'Nowhere.otf' })]);
  assert.ok(m.warnings.some((w) => /Nowhere\.otf/.test(w.text)));
  assert.equal(item(m, 'h').text.missingFont, true);
});

test('no elements → no items and no warnings from the solver', () => {
  const m = build([]);
  assert.equal(m.elements.items.length, 0);
});

test('property: random content always lands on baselines and unit boxes inside the canvas', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const roles = ['headline', 'subhead', 'body', 'cta', 'legal', 'caption'];
  const words = 'the family of man photographs exhibition museum modern art 1955 new york'.split(' ');
  for (let i = 0; i < 120; i++) {
    const canvas = pick([{ layout: 'spread', width: 1920, height: 1080 }, { layout: 'page', width: 794, height: 1123 }, { layout: 'page', width: 1080, height: 1080 }]);
    const elements = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => {
      const role = pick(roles);
      const value = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => pick(words)).join(' ');
      return el(role, `e${k + 1}`, { value, sizeStep: Math.floor(rnd() * 8) - 2, align: pick(['left', 'center', 'right']), spaceBefore: Math.floor(rnd() * 3), spaceAfter: Math.floor(rnd() * 3) });
    });
    const m = G.model.buildModel({ ...canvas, powerDepth: 3, unit: pick([4, 8, 8, 12]), elements }, measure);
    m.elements.items.forEach((it) => {
      if (it.empty || it.kind !== 'text') return;
      it.text.lines.forEach((l) => assert.ok(onStep(m, l.y), `${JSON.stringify(canvas)} baseline ${l.y}`));
      [it.box.x, it.box.y, it.box.width, it.box.height].forEach((v) => assert.equal(v % m.unit, 0, `${it.role} ${v}`));
    });
  }
});

test('JSON export and the agent brief carry the real content and measurements', () => {
  const m = build([el('headline', 'h', { value: 'the family of man' }), el('logo', 'lg', { asset: { id: 'a-1', name: 'mark.svg', kind: 'svg', width: 400, height: 100 } })]);
  const json = G.exporters.toPlacementsJson(m);
  const h = json.elements.find((e) => e.id === 'h');
  assert.equal(h.value, 'the family of man');
  assert.equal(h.text.lineCount, 1);
  assert.ok(h.text.size > 0 && h.text.leading > 0 && h.box.width > 0);
  assert.equal(json.elements.find((e) => e.id === 'lg').asset.name, 'mark.svg');
  const brief = G.exporters.toBrief(m);
  assert.match(brief, /the family of man/);
  assert.match(brief, /mark\.svg/);
  assert.match(brief, /Content/);
});

test('scene draws element text and assets only while previewing placements', () => {
  const els = [el('headline', 'h', { value: 'the family of man' }), el('logo', 'lg', { asset: { id: 'a-1', name: 'mark.svg', kind: 'svg', width: 400, height: 100 } })];
  const off = G.scene.buildScene(build(els));
  assert.ok(!off.some((p) => p.t === 'image'));
  const on = G.scene.buildScene(build(els, { showPlacements: true }));
  assert.ok(on.some((p) => p.t === 'text' && p.str === 'the family of man'));
  assert.ok(on.some((p) => p.t === 'image' && p.assetId === 'a-1'));
});
