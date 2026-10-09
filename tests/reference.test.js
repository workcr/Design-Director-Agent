const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/reference.js');
const G = globalThis.GridCalc;
const { analyzeImage, matchLine } = G.reference;

/**
 * Paints a synthetic "typeset" raster: each line is a run of glyph rectangles with x-height bodies,
 * ascender and descender glyphs and word spaces — enough structure for the analyser to behave as it
 * does on real type, while every true measurement is known exactly.
 */
function render({ W, H, bg = () => 160, lines }) {
  const luma = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) luma[y * W + x] = bg(x, y);
  const fill = (x0, x1, y0, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1 && x < W; x++) luma[y * W + x] = v; };
  lines.forEach((l) => {
    const gw = Math.max(2, Math.round(l.xh * 0.3)); // real strokes are thin: ~20–25 % ink overall
    const space = Math.max(4, Math.round(l.asc * 0.3));
    let x = l.x;
    let end = x;
    for (let k = 0; k < l.n; k++) {
      const top = k % 3 === 0 ? l.baseline - l.asc + 1 : l.baseline - l.xh + 1;
      const bottom = k % 5 === 2 ? l.baseline + l.desc : l.baseline;
      fill(x, x + gw - 1, top, bottom, l.ink ?? 25);
      end = x + gw - 1;
      x += gw + Math.max(2, Math.round(gw * 0.8));
      if (k % 5 === 4) x += space;
    }
    l.right = end; // exposed for assertions: the true ink edge
  });
  return { width: W, height: H, luma };
}

const bodyLines = (n, { x = 120, first = 200, step = 30, xh = 14, asc = 21, desc = 6 } = {}) =>
  Array.from({ length: n }, (_, i) => ({ x, baseline: first + i * step, xh, asc, desc, n: 28 + (i % 4) * 5 }));

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} !≈ ${b} (±${eps})`);

test('recovers the baseline grid: step, offset and how many lines sit on it', () => {
  const a = analyzeImage(render({ W: 800, H: 700, lines: bodyLines(12, { first: 211, step: 30 }) }));
  assert.ok(a.baseline, 'a grid was found');
  near(a.baseline.step, 30, 0.3);
  near(a.baseline.offset, 211 % 30, 1);
  assert.equal(a.baseline.onGrid, a.baseline.lines);
  assert.equal(a.baseline.confidence, 1);
});

test('solid-set lines (a few empty rows between descenders and the next ascenders) stay separate lines', () => {
  // leading 30, asc 21 + desc 6 → only 3 empty rows between lines
  const a = analyzeImage(render({ W: 800, H: 500, lines: bodyLines(8, { step: 30 }) }));
  assert.equal(a.fragments.length, 8);
  assert.equal(a.blocks.length, 1);
  assert.equal(a.blocks[0].lines, 8);
  near(a.blocks[0].leading, 30, 0.5);
});

test('finds the left axis shared by the text and reports its fraction', () => {
  const a = analyzeImage(render({ W: 800, H: 600, lines: bodyLines(9) }));
  const left = a.axes.find((x) => x.side === 'left');
  assert.ok(left, 'left axis');
  near(left.x, 120, 1);
  near(left.fraction, 0.15, 0.002);
  assert.ok(left.fragments >= 9);
});

test('a flush-right display block is classified right and yields a right axis', () => {
  const lines = [
    { x: 150, baseline: 160, xh: 60, asc: 85, desc: 20, n: 7 },
    { x: 330, baseline: 270, xh: 60, asc: 85, desc: 20, n: 5 },
  ];
  const img = render({ W: 900, H: 600, lines: [...lines, ...bodyLines(8, { x: 300, first: 380 })] });
  // pull the second display line so both end on the same edge
  const shift = lines[0].right - lines[1].right;
  lines[1].x += shift;
  const a = analyzeImage(render({ W: 900, H: 600, lines: [...lines, ...bodyLines(8, { x: 300, first: 380 })] }));
  const block = a.blocks.find((b) => b.size > 100);
  assert.equal(block.align, 'right');
  const right = a.axes.find((x) => x.side === 'right');
  assert.ok(right, 'right axis');
  near(right.x, lines[0].right, 2);
  assert.ok(img.width > 0);
});

test('size clusters: body and display, with a sensible ratio and roles', () => {
  const lines = [{ x: 120, baseline: 150, xh: 50, asc: 70, desc: 16, n: 9 }, ...bodyLines(10, { first: 300 })];
  const a = analyzeImage(render({ W: 900, H: 700, lines }));
  const roles = a.clusters.map((c) => c.role);
  assert.ok(roles.includes('body') && roles.includes('display'));
  const display = a.clusters.find((c) => c.role === 'display');
  near(display.ratioToBody, 70 / 21, 0.4);
  assert.equal(a.clusters.find((c) => c.role === 'body').lines, 10);
});

test('light type on a dark gradient is found just like dark type on light', () => {
  const dark = analyzeImage(render({ W: 800, H: 500, bg: (x) => 30 + Math.round(x * 0.04), lines: bodyLines(8).map((l) => ({ ...l, ink: 235 })) }));
  assert.equal(dark.blocks.length, 1);
  assert.equal(dark.blocks[0].polarity, 'light');
  near(dark.baseline.step, 30, 0.3);
});

test('light and dark type on the same page both get symmetric edges', () => {
  const lines = [...bodyLines(6, { first: 120 }).map((l) => ({ ...l, ink: 20 })), ...bodyLines(6, { first: 360 }).map((l) => ({ ...l, ink: 240 }))];
  const a = analyzeImage(render({ W: 800, H: 600, lines }));
  assert.equal(a.blocks.length, 2);
  const [first, second] = [...a.blocks].sort((p, q) => p.top - q.top);
  near(first.ascent, second.ascent, 1);
  assert.notEqual(first.polarity, second.polarity);
});

test('marks smaller than 6px are reported as micro text, not analysed as layout', () => {
  const lines = [...bodyLines(8), { x: 120, baseline: 580, xh: 2, asc: 4, desc: 1, n: 30 }];
  const a = analyzeImage(render({ W: 800, H: 620, lines }));
  assert.ok(a.micro && a.micro.fragments >= 1);
  assert.equal(a.clusters.length, 1);
});

test('a blank image yields no measurements and a warning, never a crash', () => {
  const a = analyzeImage({ width: 200, height: 200, luma: new Uint8Array(200 * 200).fill(180) });
  assert.equal(a.blocks.length, 0);
  assert.equal(a.baseline, null);
  assert.ok(a.warnings.length > 0);
  assert.ok(a.confidence < 0.5);
});

test('a mostly solid image is flagged as not typographic', () => {
  const luma = new Uint8Array(300 * 300);
  for (let i = 0; i < luma.length; i++) luma[i] = i % 300 < 130 ? 20 : 200;
  const a = analyzeImage({ width: 300, height: 300, luma });
  assert.ok(a.warnings.some((w) => /image than a typographic layout|Fewer than three/.test(w)));
});

test('matchLine: exact thirds are strong hits, far positions are not', () => {
  const exact = matchLine(1000 / 3, 1000);
  assert.equal(exact.label, '1/3');
  assert.equal(exact.strength, 'strong');
  assert.ok(Math.abs(exact.deviation) < 0.2);
  assert.equal(matchLine(1000 * 0.29, 1000).strength, 'none');
  const close = matchLine(1000 / 3 + 6, 1000); // 0.6 % off
  assert.equal(close.strength, 'near');
});

test('analysis is deterministic', () => {
  const img = render({ W: 700, H: 500, lines: bodyLines(9) });
  assert.equal(JSON.stringify(analyzeImage(img)), JSON.stringify(analyzeImage(img)));
});
