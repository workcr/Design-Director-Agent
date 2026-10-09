/*
 * Reference-layout analysis: finds text lines in a raster and reports the axes they hang on,
 * the baseline grid, and the type sizes. Pure maths on a luminance array — no DOM, no model —
 * so it is deterministic, testable and fast. Works best on type-driven layouts (posters,
 * editorial pages); photographs and heavy textures are not text and will confuse it.
 *
 * Sizes assume a cap height of 0.716 em (Helvetica / Akzidenz-like grotesques); the ratios
 * between sizes do not depend on that assumption.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') { require('./math.js'); require('./powerlines.js'); }
  const { round, clamp } = G.math;

  const CAP_RATIO = 0.716;
  const ASC_OVER_CAP = 1.0; // ascenders and caps are within a few % in grotesques
  const LUMA_BINS = 16;

  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
  const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
  /** Most frequent value, counting neighbours within ±tol. */
  const densest = (vals, tol = 1) => vals.reduce((best, v) => {
    const n = vals.reduce((c, w) => c + (Math.abs(w - v) <= tol ? 1 : 0), 0);
    return n > best.n ? { v, n } : best;
  }, { v: vals[0], n: 0 }).v;

  /* ---------- 1. ink mask ---------- */

  /**
   * Dominant-luminance background on a coarse grid. Each cell looks at individual pixels in a window
   * around it and takes the most common luminance band. (Averaging blocks first would let dense,
   * solid-set text drag the "background" towards the ink colour.)
   */
  function backgroundField(luma, w, h) {
    const f = Math.max(4, Math.round(Math.min(w, h) / 160));
    const gw = Math.ceil(w / f);
    const gh = Math.ceil(h / f);
    const R = 5 * f; // window radius in px
    const stride = Math.max(1, Math.round(f / 3));
    const out = new Float32Array(gw * gh);
    const counts = new Uint16Array(LUMA_BINS);
    const sums = new Float32Array(LUMA_BINS);
    const bin = 256 / LUMA_BINS;
    for (let gy = 0; gy < gh; gy++) {
      const cy = Math.min(h - 1, Math.round((gy + 0.5) * f));
      for (let gx = 0; gx < gw; gx++) {
        const cx = Math.min(w - 1, Math.round((gx + 0.5) * f));
        counts.fill(0); sums.fill(0);
        for (let y = Math.max(0, cy - R); y <= Math.min(h - 1, cy + R); y += stride) {
          const row = y * w;
          for (let x = Math.max(0, cx - R); x <= Math.min(w - 1, cx + R); x += stride) {
            const v = luma[row + x];
            const b = Math.min(LUMA_BINS - 1, Math.floor(v / bin));
            counts[b]++; sums[b] += v;
          }
        }
        let best = 0;
        for (let b = 1; b < LUMA_BINS; b++) if (counts[b] > counts[best]) best = b;
        out[gy * gw + gx] = sums[best] / counts[best];
      }
    }
    return { out, gw, gh, f };
  }

  function bgAt(field, x, y) {
    const { out, gw, gh, f } = field;
    const fx = clamp(x / f - 0.5, 0, gw - 1);
    const fy = clamp(y / f - 0.5, 0, gh - 1);
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const x1 = Math.min(gw - 1, x0 + 1); const y1 = Math.min(gh - 1, y0 + 1);
    const tx = fx - x0; const ty = fy - y0;
    const a = out[y0 * gw + x0] * (1 - tx) + out[y0 * gw + x1] * tx;
    const b = out[y1 * gw + x0] * (1 - tx) + out[y1 * gw + x1] * tx;
    return a * (1 - ty) + b * ty;
  }

  function inkMask(luma, w, h) {
    const field = backgroundField(luma, w, h);
    const delta = new Int16Array(w * h);
    const hist = new Uint32Array(256);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.round(luma[y * w + x] - bgAt(field, x, y));
        delta[y * w + x] = d;
        hist[Math.min(255, Math.abs(d))]++;
      }
    }
    let acc = 0; let p99 = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= 0.01 * w * h) { p99 = v; break; } }

    // light and dark ink are thresholded at half of their *own* contrast, so both polarities
    // get edges at the same place (one shared threshold would fatten one and thin the other)
    const CANDIDATE = 25;
    const half = (sign) => {
      const bins = new Uint32Array(256);
      let n = 0;
      for (let i = 0; i < delta.length; i++) { const d = delta[i] * sign; if (d > CANDIDATE) { bins[Math.min(255, d)]++; n++; } }
      if (n < 40) return 255; // this polarity is not used
      let seen = 0;
      for (let v = 255; v >= 0; v--) { seen += bins[v]; if (seen >= 0.1 * n) return clamp(Math.round(0.5 * v), 20, 120); }
      return 255;
    };
    const tLight = half(1);
    const tDark = half(-1);
    const mask = new Uint8Array(w * h);
    let ink = 0;
    for (let i = 0; i < mask.length; i++) {
      const d = delta[i];
      if (d > tLight || -d > tDark) { mask[i] = 1; ink++; }
    }
    return { mask, delta, threshold: Math.min(tLight, tDark), thresholds: { light: tLight, dark: tDark }, p99, coverage: ink / (w * h) };
  }

  /* ---------- 2. line fragments ---------- */

  function runs(flags, gap, minLen) {
    const out = [];
    let start = -1;
    for (let i = 0; i <= flags.length; i++) {
      const on = i < flags.length && flags[i];
      if (on && start < 0) start = i;
      if (!on && start >= 0) { out.push([start, i - 1]); start = -1; }
    }
    const merged = [];
    out.forEach(([s, e]) => {
      if (merged.length && s - merged[merged.length - 1][1] <= gap) merged[merged.length - 1][1] = e;
      else merged.push([s, e]);
    });
    return merged.filter(([s, e]) => e - s + 1 >= minLen);
  }

  function measureFragment(ink, w, y0, y1, x0, x1) {
    const { mask, delta } = ink;
    const tops = []; const bottoms = []; const cols = [];
    let light = 0; let dark = 0; let px = 0;
    for (let x = x0; x <= x1; x++) {
      let top = -1; let bottom = -1;
      for (let y = y0; y <= y1; y++) {
        if (mask[y * w + x]) { if (top < 0) top = y; bottom = y; px++; if (delta[y * w + x] > 0) light++; else dark++; }
      }
      if (top >= 0) { tops.push(top); bottoms.push(bottom); cols.push(x); }
    }
    if (cols.length < 2) return null;
    const baseline = densest(bottoms, 1);
    const sortedTops = [...tops].sort((a, b) => a - b);
    const sortedBottoms = [...bottoms].sort((a, b) => a - b);
    const ascTop = sortedTops[Math.min(2, Math.floor(0.005 * sortedTops.length))]; // skip at most two stray tall columns
    const descBottom = percentile(sortedBottoms, 0.98);
    const lower = tops.filter((t) => t > ascTop + 0.2 * (baseline - ascTop));
    const xTop = lower.length >= 2 ? densest(lower, 1) : ascTop;
    const firstCols = Math.max(3, Math.floor(0.035 * cols.length));
    const firstTop = Math.min(...tops.slice(0, firstCols));
    const ascent = baseline - ascTop + 1;
    const capKnown = Math.abs(firstTop - ascTop) <= Math.max(2, 0.04 * ascent);
    const capHeight = capKnown ? baseline - firstTop + 1 : null;
    const xHeight = baseline - xTop + 1;
    const size = ascent / (ASC_OVER_CAP * CAP_RATIO); // one estimator everywhere keeps size ratios honest
    return {
      x0: cols[0], x1: cols[cols.length - 1], baseline, ascTop, descBottom, xTop, ascent, capHeight, xHeight,
      allCaps: xHeight >= 0.9 * ascent, size, polarity: light >= dark ? 'light' : 'dark', ink: px,
    };
  }

  function findFragments(ink, w, h) {
    const rowInk = new Uint8Array(h);
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let x = 0; x < w && n < 2; x++) if (ink.mask[y * w + x]) n++;
      rowInk[y] = n >= 2 ? 1 : 0;
    }
    const fragments = [];
    // Merge only contiguous rows: solid-set type leaves just a few empty rows between one line's
    // descenders and the next line's ascenders. Stray dots (i, ü) are folded into their neighbour.
    const bands = runs(rowInk, 0, 1);
    for (let i = 0; i < bands.length; i++) {
      const [s, e] = bands[i];
      const hgt = e - s + 1;
      const nb = [i - 1, i + 1].filter((k) => k >= 0 && k < bands.length).map((k) => ({ k, h: bands[k][1] - bands[k][0] + 1, gap: k < i ? s - bands[k][1] - 1 : bands[k][0] - e - 1 }));
      const host = nb.filter((n) => hgt <= 0.2 * n.h && n.gap <= 0.25 * n.h).sort((a, b) => a.gap - b.gap)[0];
      if (host) {
        const [hs, he] = bands[host.k];
        bands[host.k] = [Math.min(hs, s), Math.max(he, e)];
        bands.splice(i, 1);
        i = -1; // restart: merged heights changed
      }
    }
    bands.filter(([s, e]) => e - s + 1 >= 3).forEach(([y0, y1]) => {
      const colInk = new Uint8Array(w);
      for (let x = 0; x < w; x++) for (let y = y0; y <= y1; y++) if (ink.mask[y * w + x]) { colInk[x] = 1; break; }
      const split = Math.max(10, y1 - y0 + 1); // a gap wider than the line is a separate column, not a word space
      runs(colInk, split, 3).forEach(([x0, x1]) => {
        const f = measureFragment(ink, w, y0, y1, x0, x1);
        if (f && f.ink > 12) fragments.push(f);
      });
    });
    return fragments.sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);
  }

  /* ---------- 3. blocks ---------- */

  const overlapX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.2 * Math.min(a.x1 - a.x0, b.x1 - b.x0);

  function groupBlocks(fragments, W) {
    const blocks = [];
    fragments.forEach((f, i) => {
      let target = null;
      let best = Infinity;
      blocks.forEach((b) => {
        const last = fragments[b.members[b.members.length - 1]];
        const gap = f.ascTop - last.descBottom;
        const limit = 0.5 * (last.ascent / ASC_OVER_CAP / CAP_RATIO);
        const similar = Math.abs(Math.log(f.ascent / last.ascent)) < 0.12;
        if (similar && gap <= limit && overlapX(f, last) && gap < best) { target = b; best = gap; }
      });
      if (target) target.members.push(i); else blocks.push({ members: [i] });
    });

    const tol = Math.max(3, 0.004 * W);
    return blocks.map((b, id) => {
      const fr = b.members.map((i) => fragments[i]);
      const spread = (key) => Math.max(...fr.map(key)) - Math.min(...fr.map(key));
      const sL = spread((f) => f.x0);
      const sR = spread((f) => f.x1);
      const sC = spread((f) => (f.x0 + f.x1) / 2);
      let align = 'single';
      if (fr.length > 1) {
        if (sL <= tol && sR <= tol) align = 'justified';
        else if (sL <= tol) align = 'left';
        else if (sR <= tol) align = 'right';
        else if (sC <= tol) align = 'center';
        else align = 'ragged';
      }
      const baselines = fr.map((f) => f.baseline);
      const diffs = baselines.slice(1).map((v, k) => v - baselines[k]);
      const size = median(fr.map((f) => f.size));
      const light = fr.filter((f) => f.polarity === 'light').length;
      return {
        id, members: b.members, lines: fr.length, align, size, ascent: median(fr.map((f) => f.ascent)), xHeight: median(fr.map((f) => f.xHeight)),
        leading: diffs.length ? median(diffs) : null, left: median(fr.map((f) => f.x0)), right: median(fr.map((f) => f.x1)),
        top: Math.min(...fr.map((f) => f.ascTop)), bottom: Math.max(...fr.map((f) => f.descBottom)),
        baselines, polarity: light * 2 >= fr.length ? 'light' : 'dark', allCaps: fr.every((f) => f.allCaps),
      };
    });
  }

  /* ---------- 4. sizes, roles, baseline grid ---------- */

  function clusterSizes(blocks) {
    const sorted = [...blocks].sort((a, b) => a.size - b.size);
    const clusters = [];
    sorted.forEach((b) => {
      const c = clusters[clusters.length - 1];
      const tol = c ? Math.max(0.03, 1.8 / c.ascent) : 0;
      if (c && Math.abs(b.size - c.size) / c.size <= tol) {
        c.blocks.push(b);
        const w = c.blocks.reduce((s, x) => s + x.lines, 0);
        c.size = c.blocks.reduce((s, x) => s + x.size * x.lines, 0) / w;
        c.ascent = c.blocks.reduce((s, x) => s + x.ascent * x.lines, 0) / w;
      } else clusters.push({ blocks: [b], size: b.size, ascent: b.ascent });
    });
    return clusters.reverse().map((c, id) => {
      const leads = c.blocks.filter((b) => b.leading).map((b) => b.leading);
      const leading = leads.length ? median(leads) : null;
      return {
        id, size: round(c.size, 1), ascent: round(c.ascent, 1), xHeight: round(median(c.blocks.map((b) => b.xHeight)), 1),
        blocks: c.blocks.map((b) => b.id), lines: c.blocks.reduce((s, b) => s + b.lines, 0),
        leading: leading ? round(leading, 1) : null, leadingRatio: leading ? round(leading / c.size, 3) : null,
      };
    });
  }

  function assignRoles(clusters) {
    if (!clusters.length) return;
    const body = clusters.filter((c) => c.ascent >= 8).reduce((best, c) => (!best || c.lines > best.lines || (c.lines === best.lines && c.size < best.size) ? c : best), null) || clusters[0];
    clusters.forEach((c) => {
      const r = c.size / body.size;
      c.ratioToBody = round(r, 3);
      c.role = c === body ? 'body' : c.ascent < 8 || r < 0.4 ? 'micro' : r < 0.85 ? 'caption' : r >= 2.5 ? 'display' : r > 1.15 ? 'heading' : 'body';
    });
  }

  /** Fits baseline = origin + step·k to the body lines. */
  function detectBaselineGrid(fragments, blocks, clusters) {
    const body = clusters.find((c) => c.role === 'body');
    if (!body) return null;
    const bodyBlocks = blocks.filter((b) => body.blocks.includes(b.id));
    const leads = bodyBlocks.filter((b) => b.leading).flatMap((b) => b.baselines.slice(1).map((v, k) => v - b.baselines[k]));
    if (!leads.length) return null;
    const mode = densest(leads, 1.2);
    const step0 = median(leads.filter((d) => Math.abs(d - mode) <= 1.5));
    const bl = bodyBlocks.flatMap((b) => b.baselines).sort((a, b) => a - b);
    if (bl.length < 3 || step0 < 4) return null;
    const ks = bl.map((v) => Math.round((v - bl[0]) / step0));
    const n = bl.length;
    const mk = ks.reduce((s, k) => s + k, 0) / n;
    const mb = bl.reduce((s, v) => s + v, 0) / n;
    const num = ks.reduce((s, k, i) => s + (k - mk) * (bl[i] - mb), 0);
    const den = ks.reduce((s, k) => s + (k - mk) ** 2, 0);
    const step = den ? num / den : step0;
    const origin = mb - step * mk;
    const phase = ((origin % step) + step) % step;
    const resid = (v) => { const k = Math.round((v - phase) / step); return Math.abs(v - (phase + k * step)); };
    const onGrid = bl.filter((v) => resid(v) <= 1.5).length;
    const others = clusters.filter((c) => c.role !== 'body' && c.role !== 'micro').map((c) => {
      const vals = blocks.filter((b) => c.blocks.includes(b.id)).flatMap((b) => b.baselines);
      return { cluster: c.id, role: c.role, onGrid: vals.filter((v) => resid(v) <= 2.5).length, of: vals.length };
    });
    return {
      step: round(step, 2), offset: round(phase, 1), lines: n, onGrid, confidence: round(onGrid / n, 3),
      sizeRatio: round(step / body.size, 3), cluster: body.id, others,
    };
  }

  /* ---------- 5. axes & matching ---------- */

  function lineSet(length) {
    const lines = G.powerlines.fractionSeries([2, 3], 4).map((f) => ({ label: f.label, pos: f.value * length }));
    return lines.sort((a, b) => a.pos - b.pos);
  }

  /** Nearest power line to `pos`, with how unlikely a hit that close would be by chance. */
  function matchLine(pos, length) {
    const lines = lineSet(length);
    let k = 0;
    lines.forEach((l, i) => { if (Math.abs(l.pos - pos) < Math.abs(lines[k].pos - pos)) k = i; });
    const near = lines[k];
    const below = k > 0 ? near.pos - lines[k - 1].pos : near.pos;
    const above = k < lines.length - 1 ? lines[k + 1].pos - near.pos : length - near.pos;
    const deviation = pos - near.pos;
    const pct = deviation / length;
    const chance = clamp((2 * Math.abs(deviation) + 1) / ((below + above) / 2), 0, 1);
    const strength = Math.abs(pct) <= 0.0035 && chance <= 0.3 ? 'strong' : Math.abs(pct) <= 0.008 ? 'near' : 'none';
    return { label: near.label, pos: round(near.pos, 1), deviation: round(deviation, 1), deviationPct: round(pct * 100, 2), chance: round(chance, 3), strength };
  }

  function clusterEdges(items, tol) {
    const sorted = [...items].sort((a, b) => a.x - b.x);
    const groups = [];
    sorted.forEach((it) => {
      const g = groups[groups.length - 1];
      if (g && it.x - g.items[g.items.length - 1].x <= tol) g.items.push(it); else groups.push({ items: [it] });
    });
    return groups.map((g) => ({ x: round(median(g.items.map((i) => i.x)), 1), count: g.items.length, blocks: new Set(g.items.map((i) => i.block)).size, weight: g.items.reduce((s, i) => s + i.w, 0) }));
  }

  function findAxes(fragments, blocks, clusters, W) {
    const tol = Math.max(3, 0.004 * W);
    const body = clusters.find((c) => c.role === 'body');
    const bigBlocks = new Set(blocks.filter((b) => body && b.size >= 1.8 * body.size).map((b) => b.id));
    const fragBlock = new Map();
    blocks.forEach((b) => b.members.forEach((i) => fragBlock.set(i, b)));

    const left = []; const right = []; const center = [];
    fragments.forEach((f, i) => {
      const b = fragBlock.get(i);
      left.push({ x: f.x0, block: b.id, w: 1 });
      if (b.align === 'right' || b.align === 'justified' || bigBlocks.has(b.id)) right.push({ x: f.x1, block: b.id, w: 1 });
      if (b.align === 'center') center.push({ x: (f.x0 + f.x1) / 2, block: b.id, w: 1 });
    });
    const axes = [];
    const add = (side, groups, minCount) => groups.filter((g) => g.count >= minCount).forEach((g) => axes.push({ side, x: g.x, fraction: round(g.x / W, 4), fragments: g.count, blocks: g.blocks, match: matchLine(g.x, W) }));
    add('left', clusterEdges(left, tol), 2);
    add('right', clusterEdges(right, tol), 2);
    add('center', clusterEdges(center, tol), 2);
    return axes.sort((a, b) => b.fragments - a.fragments || a.x - b.x);
  }

  /* ---------- driver ---------- */

  /**
   * @param {{width:number, height:number, luma:ArrayLike<number>}} image luminance 0–255
   */
  function analyzeImage({ width: W, height: H, luma }) {
    const ink = inkMask(luma, W, H);
    const warnings = [];
    if (ink.p99 < 25) warnings.push('Almost no contrast was found — nothing to measure.');
    const all = ink.p99 < 25 ? [] : findFragments(ink, W, H);
    const MICRO = 6; // px of ascent — below this it is a credit line or noise, not layout type
    const fragments = all.filter((f) => f.ascent >= MICRO);
    const micro = all.filter((f) => f.ascent < MICRO);
    if (ink.coverage > 0.35) warnings.push('Over a third of the image is ink — it looks more like an image than a typographic layout, so the measurements are unreliable.');
    if (fragments.length < 3) warnings.push('Fewer than three text lines were found.');

    const blocks = fragments.length ? groupBlocks(fragments, W) : [];
    const clusters = clusterSizes(blocks);
    assignRoles(clusters);
    const baseline = detectBaselineGrid(fragments, blocks, clusters);
    if (!baseline && fragments.length >= 3) warnings.push('No repeating line spacing was found, so there is no baseline grid to report.');
    else if (baseline && baseline.confidence < 0.8) warnings.push('The body lines only loosely follow a baseline grid.');
    const axes = fragments.length ? findAxes(fragments, blocks, clusters, W) : [];

    const extremes = fragments.length ? (() => {
      const left = Math.min(...fragments.map((f) => f.x0));
      const right = Math.max(...fragments.map((f) => f.x1));
      const top = Math.min(...fragments.map((f) => f.ascTop));
      const bottom = Math.max(...fragments.map((f) => f.baseline));
      return {
        left: { x: left, fraction: round(left / W, 4), match: matchLine(left, W) },
        right: { x: right, fraction: round(right / W, 4), match: matchLine(right, W) },
        top: { y: top, fraction: round(top / H, 4), match: matchLine(top, H) },
        bottom: { y: bottom, fraction: round(bottom / H, 4), match: matchLine(bottom, H) },
      };
    })() : null;

    const roleCount = clusters.length;
    let confidence = 1;
    if (ink.coverage > 0.35) confidence *= 0.4;
    if (fragments.length < 3) confidence *= 0.3;
    if (!baseline) confidence *= 0.7; else confidence *= 0.6 + 0.4 * baseline.confidence;

    return {
      version: 1, width: W, height: H, ratio: round(W / H, 4), threshold: ink.threshold, coverage: round(ink.coverage, 4),
      confidence: round(confidence, 2), warnings,
      fragments: fragments.map((f) => [f.x0, f.x1, f.baseline, f.ascTop, f.descBottom, round(f.size, 1)]),
      blocks: blocks.map((b) => ({
        id: b.id, lines: b.lines, align: b.align, size: round(b.size, 1), ascent: round(b.ascent, 1), xHeight: round(b.xHeight, 1),
        leading: b.leading ? round(b.leading, 1) : null, leadingRatio: b.leading ? round(b.leading / b.size, 3) : null,
        left: b.left, right: b.right, top: b.top, bottom: b.bottom, baselines: b.baselines, polarity: b.polarity, allCaps: b.allCaps,
      })),
      micro: micro.length ? { fragments: micro.length, left: Math.min(...micro.map((f) => f.x0)), right: Math.max(...micro.map((f) => f.x1)), baseline: round(median(micro.map((f) => f.baseline)), 1) } : null,
      clusters, roleCount, baseline, axes, extremes,
    };
  }

  G.reference = { CAP_RATIO, inkMask, findFragments, groupBlocks, clusterSizes, detectBaselineGrid, matchLine, analyzeImage };
  if (typeof module !== 'undefined') module.exports = G.reference;
})();
