/* Type scale snapped to the baseline grid, plus a specimen text flow. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') { require('./math.js'); require('./config.js'); }
  const { clamp, round, EPS } = G.math;
  const { RATIOS } = G.config;

  // Same tag names the original designSystem.typography used.
  const STEP_NAMES = { '-2': 'ps', '-1': 'pt', 0: 'p', 1: 'h6', 2: 'h5', 3: 'h4', 4: 'h3', 5: 'h2', 6: 'h1', 7: 'xl', 8: 'xxl', 9: 'xxxl' };

  const CAP_HEIGHT = 0.75; // approximate ascent used to place the first baseline
  const DESCENT = 0.25;

  /** Leading in units: a multiple of the baseline step, never tighter than 1.05×size. */
  function snapLeading(rawUnits, step, sizeUnits) {
    let units = Math.max(1, Math.round(rawUnits / step)) * step;
    while (units < sizeUnits * 1.05 - EPS) units += step;
    return units;
  }

  function resolveType(cfg) {
    const u = cfg.unit;
    const ratio = RATIOS[cfg.scaleRatio].ratio;
    const bodyUnits = Math.max(1, Math.round((cfg.baseSize * cfg.lineHeight) / u));
    const baselineUnits = cfg.baselineMode === 'leading' ? bodyUnits : cfg.baselineMode === 'custom' ? cfg.baselineCustom : 1;

    const scale = [];
    for (let step = -cfg.stepsDown; step <= cfg.stepsUp; step++) {
      const raw = cfg.baseSize * ratio ** step;
      const size = cfg.roundSizes ? Math.max(1, Math.round(raw)) : round(raw, 2);
      const lh = clamp(cfg.lineHeight - cfg.tighten * Math.max(step, 0), 1, 3);
      const leadingUnits = snapLeading((size * lh) / u, baselineUnits, size / u);
      scale.push({
        step, name: STEP_NAMES[step] || `s${step}`, size, leadingUnits, leading: leadingUnits * u,
        lineHeight: round((leadingUnits * u) / size, 3), weight: step > 0 ? 'bold' : 'normal',
      });
    }
    const styles = Object.fromEntries(scale.map((s) => [s.name, s]));
    const body = styles.p;
    return { scale, styles, baselineUnits, baselineStep: baselineUnits * u, bodyLeadingUnits: body.leadingUnits };
  }

  const SPECIMEN = [
    { step: 2, text: 'One unit holds the whole page together' },
    { step: 0, text: 'The diagonals of the spread and of the page meet at points that fix the text block. Margins fall out of the canon, then every edge is snapped to the grid unit so columns, gutters and baselines share a single lattice.' },
    { step: 1, text: 'Columns and gutters' },
    { step: 0, text: 'Columns are a whole number of units wide. Gutters are whole units too. Whatever the canon leaves over is returned to the margin, never hidden inside a column, so no edge ever lands between two grid lines.' },
    { step: 0, text: 'Leading is a multiple of the baseline step. Headings take two, three or four steps of leading, which keeps every line of body text on the same baseline across columns and across pages.' },
    { step: 1, text: 'Real-time parameters' },
    { step: 0, text: 'Change the unit, the division, the column count or the type scale and watch the margins, modules and baselines recompute. Where a setting cannot land exactly on the grid the panel says by how many pixels.' },
    { step: 0, text: 'Exact divisions are those where all four margins fall on the grid without any rounding. They are listed in the canon section — choose one for a mathematically pure canon.' },
  ];

  const MAX_CYCLES = 8;

  /**
   * Flows SPECIMEN through the given areas (cycling it, minus the title, until they are full).
   * Every baseline sits on a baseline-grid line. measure(text, size, weight) → width in px.
   */
  function flowText({ areas, scale, unit, gridOrigin, gridStep, measure, content = SPECIMEN }) {
    const lines = [];
    const byStep = (step) => scale[clamp(step - scale[0].step, 0, scale.length - 1)];
    const body = byStep(0);
    const stepUnits = gridStep / unit; // baseline step expressed in grid units
    const kOf = (leadingUnits) => Math.max(1, Math.round(leadingUnits / stepUnits));
    const bodyLeadK = kOf(body.leadingUnits);
    const gapAfterHeading = (st) => Math.max(bodyLeadK, Math.ceil((DESCENT * st.size + CAP_HEIGHT * body.size) / gridStep - EPS));

    let ai = 0;
    let k = null;
    const fits = (a, kk, size) => gridOrigin + kk * gridStep + DESCENT * size <= a.y + a.h + EPS;
    const startK = (a, size) => Math.ceil((a.y + CAP_HEIGHT * size - gridOrigin) / gridStep - EPS);

    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      const before = lines.length;
      for (const item of cycle === 0 ? content : content.slice(1)) {
        const st = byStep(item.step);
        const leadK = kOf(st.leadingUnits);
        const isHeading = st.step > 0;
        const words = item.text.split(/\s+/);

        // keep a heading with at least two lines of the text that follows
        if (isHeading && ai < areas.length) {
          const a = areas[ai];
          const first = k === null ? startK(a, st.size) : k;
          if (!fits(a, first + gapAfterHeading(st) + bodyLeadK, body.size)) { ai++; k = null; }
        }

        let w = 0;
        while (w < words.length) {
          if (ai >= areas.length) return lines;
          const a = areas[ai];
          if (k === null) k = startK(a, st.size);
          if (!fits(a, k, st.size)) { ai++; k = null; continue; }

          let text = words[w++];
          while (w < words.length && measure(`${text} ${words[w]}`, st.size, st.weight) <= a.w + EPS) text += ` ${words[w++]}`;
          lines.push({ x: a.x, y: gridOrigin + k * gridStep, text, size: st.size, weight: st.weight, style: st.name, area: ai });
          if (w < words.length) k += leadK;
        }
        if (k !== null) k += isHeading ? gapAfterHeading(st) : leadK + bodyLeadK;
      }
      if (lines.length === before) break; // nothing fits — avoid spinning
    }
    return lines;
  }

  G.typography = { CAP_HEIGHT, DESCENT, STEP_NAMES, SPECIMEN, snapLeading, resolveType, flowText };
  if (typeof module !== 'undefined') module.exports = G.typography;
})();
