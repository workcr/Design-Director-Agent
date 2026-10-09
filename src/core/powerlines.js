/*
 * Power lines & anchor points ("golden canon" field).
 *
 * Start from the diagonals of the canvas and of its two halves. Lines drawn
 * through their intersections sit at 1/2 and 1/3 of each axis. Repeating the
 * construction on the strip between a line and the nearest edge halves it
 * again, so each base fraction b spawns a chain 1/b, 1/2b, 1/4b … toward both
 * edges:  1/2 → 1/4 → 1/8 …   and   1/3 → 1/6 → 1/12 → 1/24 …
 *
 * Nothing here depends on aspect ratio, so the same field works for a book
 * page, a poster, a social post or a web viewport.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./math.js');
  const { snap, toUnits, EPS } = G.math;

  const BASES = [2, 3, 5];
  const TOL = 1e-9;
  const eq = (a, b) => Math.abs(a - b) < TOL;

  /** Fractions of one axis, mirrored about the centre, strongest (lowest level) first. */
  function fractionSeries(bases, depth) {
    const found = new Map();
    const add = (num, den, level) => {
      const key = `${num}/${den}`;
      if (!found.has(key)) found.set(key, { num, den, label: key, value: num / den, level });
    };
    bases.forEach((b) => {
      for (let k = 0; k < depth; k++) {
        const den = b * 2 ** k;
        add(1, den, k);
        add(den - 1, den, k);
      }
    });
    return [...found.values()].sort((a, b) => a.level - b.level || a.den - b.den || a.value - b.value);
  }

  /** Places fractions on an axis: drops lines too close to an edge, snaps, de-duplicates. */
  function placeAxis(length, series, cfg) {
    const u = cfg.unit;
    const minEdge = cfg.powerMargin * u;
    const taken = new Set();
    const lines = [];
    series.forEach((f) => {
      const ideal = f.value * length;
      if (Math.min(ideal, length - ideal) < minEdge - EPS) return;
      // snap the distance from the nearest edge, exactly as the canon snaps its margins,
      // so a line and the canon edge it coincides with always agree (and the field mirrors)
      let pos = ideal;
      if (cfg.powerSnap) pos = f.value <= 0.5 ? snap(ideal, u, 'nearest') : length - snap(length - ideal, u, 'nearest');
      if (pos <= EPS || pos >= length - EPS) return;
      const key = Math.round(pos * 1000);
      if (taken.has(key)) return;
      taken.add(key);
      lines.push({ ...f, ideal, pos, deviation: pos - ideal, units: toUnits(pos, u), exact: Math.abs(pos - ideal) < 1e-6 });
    });
    return lines.sort((a, b) => a.pos - b.pos);
  }

  /** True when the point (fx, fy) — as fractions of the canvas — lies on a primary diagonal. */
  function onPrimaryDiagonal(fx, fy) {
    if (eq(fy, fx) || eq(fy, 1 - fx)) return true; // canvas
    if (fx <= 0.5 + TOL && (eq(fy, 2 * fx) || eq(fy, 1 - 2 * fx))) return true; // left half
    if (fx >= 0.5 - TOL && (eq(fy, 2 * fx - 1) || eq(fy, 2 - 2 * fx))) return true; // right half
    return false;
  }

  const rectDiagonals = (x, y, w, h) => [
    { x1: x, y1: y, x2: x + w, y2: y + h },
    { x1: x, y1: y + h, x2: x + w, y2: y },
  ];

  function computePowerLines(cfg, view) {
    const { width: W, height: H } = view;
    const bases = BASES.filter((b) => cfg[`powerBase${b}`]);
    const series = fractionSeries(bases, cfg.powerDepth);
    const x = placeAxis(W, series, cfg);
    const y = placeAxis(H, series, cfg);

    const anchors = [];
    x.forEach((xl) => y.forEach((yl) => {
      const strong = onPrimaryDiagonal(xl.value, yl.value);
      if (cfg.anchorMode === 'diagonal' && !strong) return;
      anchors.push({
        x: xl.pos, y: yl.pos, fx: xl.label, fy: yl.label, label: `${xl.label} · ${yl.label}`,
        strong, level: Math.max(xl.level, yl.level),
      });
    }));

    // the diagonals drawn in the reference construction: canvas X plus both half-canvas X's
    const primary = [
      ...rectDiagonals(0, 0, W, H),
      ...rectDiagonals(0, 0, W / 2, H),
      ...rectDiagonals(W / 2, 0, W / 2, H),
    ];

    // diagonals of the edge-anchored strips that generate each line (shown on demand)
    const strips = [];
    x.filter((l) => l.ideal < W / 2 - EPS).forEach((l) => {
      strips.push(...rectDiagonals(0, 0, l.ideal, H), ...rectDiagonals(W - l.ideal, 0, l.ideal, H));
    });
    y.filter((l) => l.ideal < H / 2 - EPS).forEach((l) => {
      strips.push(...rectDiagonals(0, 0, W, l.ideal), ...rectDiagonals(0, H - l.ideal, W, l.ideal));
    });

    return { x, y, anchors, primary, strips, bases };
  }

  /** How many of the given block edges coincide with a power line (within half a pixel). */
  function canonAlignment(blocks, power) {
    const xs = new Set();
    const ys = new Set();
    blocks.forEach((b) => {
      xs.add(Math.round(b.x * 100) / 100).add(Math.round((b.x + b.w) * 100) / 100);
      ys.add(Math.round(b.y * 100) / 100).add(Math.round((b.y + b.h) * 100) / 100);
    });
    const hit = (set, lines) => [...set].filter((v) => lines.some((l) => Math.abs(l.pos - v) <= 0.5)).length;
    return { matched: hit(xs, power.x) + hit(ys, power.y), total: xs.size + ys.size };
  }

  G.powerlines = { BASES, fractionSeries, placeAxis, onPrimaryDiagonal, computePowerLines, canonAlignment };
  if (typeof module !== 'undefined') module.exports = G.powerlines;
})();
