/*
 * Style learning. Every analysed layout becomes a vector of scale-free features (axis fractions,
 * alignment mix, leading ratios, size ratios, margins…). A designer's profile is simply the pooled
 * statistics of their works, so each new work sharpens it — mean, spread and a confidence that
 * grows with the number of works. Nothing is trained and nothing is hidden: the profile can be
 * read, exported, and applied back to the layout tool.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./math.js');
  const { round, clamp } = G.math;

  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

  const NUMERIC = [
    'aspect', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'baselineStepRatio', 'bodyLeadingRatio',
    'displayLeadingRatio', 'sizeCount', 'displayBodyRatio', 'bodySizeRatio', 'inkCoverage',
    'alignLeft', 'alignRight', 'alignCenter', 'alignJustified',
  ];
  /** Smallest spread worth caring about per feature — keeps a one-work profile from being infinitely strict. */
  const FLOOR = {
    aspect: 0.05, marginLeft: 0.04, marginRight: 0.04, marginTop: 0.04, marginBottom: 0.04, baselineStepRatio: 0.003,
    bodyLeadingRatio: 0.08, displayLeadingRatio: 0.08, sizeCount: 1, displayBodyRatio: 0.8, bodySizeRatio: 0.004,
    inkCoverage: 0.05, alignLeft: 0.25, alignRight: 0.25, alignCenter: 0.25, alignJustified: 0.25,
  };
  const SOLID = 1.08; // leading ≤ 1.08 × size reads as "set solid" given ±5 % size estimates

  /** Scale-free description of one analysed layout. */
  function features(a) {
    const body = a.clusters.find((c) => c.role === 'body') || null;
    const display = a.clusters.find((c) => (c.role === 'display' || c.role === 'heading') && body && c.size > body.size) || null;
    const multi = a.blocks.filter((b) => b.lines >= 2);
    const lines = multi.reduce((s, b) => s + b.lines, 0);
    const share = (al) => (lines ? multi.filter((b) => b.align === al).reduce((s, b) => s + b.lines, 0) / lines : null);
    const ex = a.extremes;
    return {
      aspect: a.ratio,
      marginLeft: ex ? ex.left.fraction : null,
      marginRight: ex ? round(1 - ex.right.fraction, 4) : null,
      marginTop: ex ? ex.top.fraction : null,
      marginBottom: ex ? round(1 - ex.bottom.fraction, 4) : null,
      baselineStepRatio: a.baseline ? round(a.baseline.step / a.height, 5) : null,
      bodyLeadingRatio: body && body.leadingRatio ? body.leadingRatio : null,
      displayLeadingRatio: display && display.leadingRatio ? display.leadingRatio : null,
      sizeCount: a.clusters.filter((c) => c.role !== 'micro').length,
      displayBodyRatio: display && body ? round(display.size / body.size, 2) : null,
      bodySizeRatio: body ? round(body.size / a.height, 5) : null,
      inkCoverage: a.coverage,
      alignLeft: share('left'), alignRight: share('right'), alignCenter: share('center'), alignJustified: share('justified'),
      axes: a.axes.map((x) => ({ side: x.side, fraction: x.fraction, label: x.match.strength === 'none' ? null : x.match.label, fragments: x.fragments })),
    };
  }

  /** Axes that recur across works, with how often. */
  function pooledAxes(featureList) {
    const items = featureList.flatMap((f, w) => f.axes.map((x) => ({ ...x, work: w })));
    const out = [];
    ['left', 'right', 'center'].forEach((side) => {
      const sorted = items.filter((i) => i.side === side).sort((p, q) => p.fraction - q.fraction);
      const groups = [];
      sorted.forEach((i) => {
        const g = groups[groups.length - 1];
        if (g && i.fraction - g.items[g.items.length - 1].fraction <= 0.012) g.items.push(i); else groups.push({ items: [i] });
      });
      groups.forEach((g) => {
        const works = new Set(g.items.map((i) => i.work)).size;
        const labels = g.items.map((i) => i.label).filter(Boolean);
        const label = labels.length ? labels.sort((a, b) => labels.filter((l) => l === b).length - labels.filter((l) => l === a).length)[0] : null;
        out.push({ side, fraction: round(mean(g.items.map((i) => i.fraction)), 4), label, works, frequency: round(works / featureList.length, 2) });
      });
    });
    return out.filter((x) => x.frequency >= 0.5).sort((a, b) => b.frequency - a.frequency || a.fraction - b.fraction);
  }

  const pct = (v) => `${Math.round(v * 100)}%`;

  function signature(stats, axes, n) {
    const out = [];
    const axisText = axes.map((x) => `${x.label || pct(x.fraction)} (${x.side}${n > 1 ? `, ${pct(x.frequency)} of works` : ''})`);
    if (axisText.length) out.push(`Hangs type on vertical axes at ${axisText.join(', ')}.`);
    const al = [['flush-left', 'alignLeft'], ['flush-right', 'alignRight'], ['centred', 'alignCenter'], ['justified', 'alignJustified']]
      .map(([name, key]) => [name, stats[key] ? stats[key].mean : 0]).filter(([, v]) => v >= 0.1).sort((a, b) => b[1] - a[1]);
    if (al.length) out.push(`Alignment: ${al.map(([name, v]) => `${name} ${pct(v)}`).join(', ')} of multi-line text.`);
    if (stats.bodyLeadingRatio) {
      const r = stats.bodyLeadingRatio.mean;
      out.push(r <= SOLID ? `Sets body text solid — leading about ${round(r, 2)}× the type size.` : `Open leading — body set at about ${round(r, 2)}× the type size.`);
    }
    if (stats.displayBodyRatio) out.push(`${round(stats.sizeCount ? stats.sizeCount.mean : 0, 1)} sizes on average; display type about ${round(stats.displayBodyRatio.mean, 1)}× the body size.`);
    else if (stats.sizeCount) out.push(`${round(stats.sizeCount.mean, 1)} type size${stats.sizeCount.mean > 1.5 ? 's' : ''} on average.`);
    if (stats.baselineStepRatio) out.push(`Baseline step about ${round(stats.baselineStepRatio.mean * 100, 2)}% of the page height.`);
    if (stats.marginLeft && stats.marginRight) out.push(`Ink margins: left ${pct(stats.marginLeft.mean)}, right ${pct(stats.marginRight.mean)} of the width.`);
    if (stats.inkCoverage) out.push(`Ink covers about ${pct(stats.inkCoverage.mean)} of the page.`);
    return out;
  }

  /** Pooled statistics for a list of feature vectors. */
  function buildProfile(featureList) {
    const n = featureList.length;
    const stats = {};
    NUMERIC.forEach((key) => {
      const vals = featureList.map((f) => f[key]).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
      if (vals.length) stats[key] = { mean: round(mean(vals), 5), sd: round(sd(vals), 5), n: vals.length };
    });
    const axes = pooledAxes(featureList);
    const lead = featureList.map((f) => f.bodyLeadingRatio).filter((v) => v);
    return {
      works: n, confidence: round(n / (n + 2), 2), stats, axes,
      solidShare: lead.length ? round(lead.filter((v) => v <= SOLID).length / lead.length, 2) : null,
      signature: n ? signature(stats, axes, n) : [],
    };
  }

  /** How far a feature vector is from a profile (0 = identical) — z-distance plus axis disagreement. */
  function distance(f, profile) {
    let sum = 0; let k = 0;
    NUMERIC.forEach((key) => {
      const s = profile.stats[key];
      if (!s || f[key] === null || f[key] === undefined) return;
      const z = (f[key] - s.mean) / Math.max(s.sd, FLOOR[key]);
      sum += z * z; k++;
    });
    const mine = new Set(f.axes.filter((x) => x.label).map((x) => `${x.side}:${x.label}`));
    const theirs = new Set(profile.axes.filter((x) => x.label).map((x) => `${x.side}:${x.label}`));
    const union = new Set([...mine, ...theirs]);
    const jaccard = union.size ? [...mine].filter((x) => theirs.has(x)).length / union.size : 1;
    return k ? Math.sqrt(sum / k) + (1 - jaccard) : Infinity;
  }

  const similarity = (d) => (Number.isFinite(d) ? Math.exp(-(d * d) / 2) : 0);

  /**
   * Ranks designers by closeness. A suggestion is only made from profiles with at least two works,
   * and only when the best is clearly ahead — a hint for the user to confirm, never an automatic label.
   */
  function rank(designers, f) {
    const list = designers
      .filter((d) => d.works.length >= 2)
      .map((d) => {
        const profile = buildProfile(d.works.map((w) => w.features));
        const dist = distance(f, profile);
        return { designerId: d.id, name: d.name, works: d.works.length, distance: round(dist, 3), similarity: round(similarity(dist), 3) };
      })
      .sort((a, b) => b.similarity - a.similarity);
    const best = list[0];
    const second = list[1];
    const confident = Boolean(best && best.similarity >= 0.25 && (!second || best.similarity >= 1.25 * second.similarity));
    return { ranking: list, best: confident ? best : null };
  }

  /** Config values that reproduce the profile's typographic habits on a canvas of the given height. */
  function styleToPatch(profile, canvas) {
    const patch = {};
    const s = profile.stats;
    if (profile.solidShare !== null) patch.minLeading = profile.solidShare >= 0.5 ? 1 : 1.05;
    if (s.baselineStepRatio) {
      patch.baselineMode = 'custom';
      patch.baselineCustom = clamp(Math.round((s.baselineStepRatio.mean * canvas.height) / canvas.unit), 1, 24);
    }
    if (s.bodySizeRatio) patch.baseSize = clamp(Math.round(s.bodySizeRatio.mean * canvas.height), 6, 96);
    if (s.bodyLeadingRatio) patch.lineHeight = clamp(Math.round(s.bodyLeadingRatio.mean * 20) / 20, 1, 3);
    return patch;
  }

  /** Axes to draw on the canvas for a profile. */
  const styleAxes = (profile) => profile.axes.map((x) => ({ side: x.side, fraction: x.fraction, label: x.label }));

  G.styles = { NUMERIC, SOLID, features, pooledAxes, buildProfile, distance, similarity, rank, styleToPatch, styleAxes };
  if (typeof module !== 'undefined') module.exports = G.styles;
})();
