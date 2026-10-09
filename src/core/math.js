/* Grid maths — pure helpers shared by every other module. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  const EPS = 1e-6;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** True when `v` is a whole multiple of `u` (tolerant to float noise). */
  const isOnGrid = (v, u) => u > 0 && Math.abs(v / u - Math.round(v / u)) < EPS;

  /**
   * Snaps `v` to a multiple of `u`.
   * mode: 'nearest' | 'floor' | 'ceil' | 'none'
   */
  function snap(v, u, mode = 'nearest') {
    if (mode === 'none' || !(u > 0)) return v;
    const q = v / u;
    const r = Math.abs(q - Math.round(q)) < EPS ? Math.round(q) : q;
    if (mode === 'floor') return Math.floor(r) * u;
    if (mode === 'ceil') return Math.ceil(r) * u;
    return Math.round(r) * u;
  }

  const round = (v, places = 2) => {
    const k = 10 ** places;
    return Math.round(v * k) / k;
  };

  const toUnits = (v, u) => round(v / u, 3);

  /**
   * Canon divisions D for which top, bottom, inner and outer margins
   * (H/D, 2H/D, Wp/D, 2Wp/D) all land exactly on the unit grid.
   */
  function perfectDivisions({ pageWidth, height, unit, min = 4, max = 96 }) {
    const out = [];
    if (!isOnGrid(pageWidth, unit) || !isOnGrid(height, unit)) return out;
    for (let d = min; d <= max; d++) {
      const ok = [height / d, pageWidth / d].every((m) => isOnGrid(m, unit));
      if (ok) out.push(d);
    }
    return out;
  }

  /** Liang–Barsky clip of a segment to a rectangle. Returns null when outside. */
  function clipSegment(s, rect) {
    const { x1, y1, x2, y2 } = s;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rect.x, rect.x + rect.w - x1, y1 - rect.y, rect.y + rect.h - y1];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
        continue;
      }
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return { ...s, x1: x1 + t0 * dx, y1: y1 + t0 * dy, x2: x1 + t1 * dx, y2: y1 + t1 * dy };
  }

  G.math = { EPS, clamp, isOnGrid, snap, round, toUnits, perfectDivisions, clipSegment };
  if (typeof module !== 'undefined') module.exports = G.math;
})();
