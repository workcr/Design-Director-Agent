/* Columns, gutters, rows and modules — all measured in whole grid units when "fit" is on. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./math.js');
  const { EPS, isOnGrid, toUnits } = G.math;

  /**
   * Splits one axis into `count` items separated by gutters.
   * fit:true  → item size is a whole number of units (and a multiple of `multiple`);
   *             the occupied span shrinks and is placed per `anchor` ('start'|'end'|'center').
   * fit:false → items share the length exactly (sizes may be fractional).
   */
  function layoutAxis({ start, length, count, gutterUnits, unit, fit, anchor = 'start', multiple = 1 }) {
    const gutter = gutterUnits * unit;
    const gutterTotal = (count - 1) * gutter;
    let itemSize;
    let spanStart = start;
    let spanSize = length;
    let leftover = 0;

    if (fit) {
      const availU = length / unit;
      const raw = (availU - (count - 1) * gutterUnits) / count;
      const itemU = Math.floor(raw / multiple + EPS) * multiple;
      if (itemU < 1) return { ok: false, items: [], gutters: [], span: { start, size: length }, leftover: 0, reason: 'too-narrow' };
      itemSize = itemU * unit;
      spanSize = count * itemSize + gutterTotal;
      leftover = length - spanSize;
      const leftU = leftover / unit;
      const centered = Number.isInteger(Math.round(leftU * 1e6) / 1e6) ? Math.floor(leftU / 2) * unit : leftover / 2;
      spanStart = start + (anchor === 'end' ? leftover : anchor === 'center' ? centered : 0);
    } else {
      itemSize = (length - gutterTotal) / count;
      if (itemSize <= 0) return { ok: false, items: [], gutters: [], span: { start, size: length }, leftover: 0, reason: 'too-narrow' };
    }

    const items = [];
    const gutters = [];
    for (let i = 0; i < count; i++) {
      items.push({ start: spanStart + i * (itemSize + gutter), size: itemSize });
      if (i < count - 1) gutters.push({ start: spanStart + i * (itemSize + gutter) + itemSize, size: gutter });
    }
    return { ok: true, items, gutters, span: { start: spanStart, size: spanSize }, leftover };
  }

  const anchorFor = (anchor, side) => {
    if (anchor === 'center' || side === 'center') return 'center';
    const innerIsStart = side === 'right';
    if (anchor === 'inner') return innerIsStart ? 'start' : 'end';
    return innerIsStart ? 'end' : 'start';
  };

  /** Columns × rows modular grid for one text block. */
  function layoutBlockGrid(block, cfg, baselineUnits) {
    const u = cfg.unit;
    const cols = layoutAxis({
      start: block.x, length: block.w, count: cfg.columns, gutterUnits: cfg.gutter, unit: u,
      fit: cfg.fitColumns, anchor: anchorFor(cfg.fitAnchor, block.side),
    });
    const rows = layoutAxis({
      start: block.y, length: block.h, count: cfg.rows, gutterUnits: cfg.rowGutter, unit: u,
      fit: cfg.fitRows, anchor: 'start', multiple: cfg.moduleSnap ? baselineUnits : 1,
    });

    const columns = cols.items.map((c, i) => ({ index: i, x: c.start, y: rows.span.start, w: c.size, h: rows.span.size }));
    const modules = [];
    rows.items.forEach((r, ri) => cols.items.forEach((c, ci) => {
      modules.push({ row: ri, col: ci, x: c.start, y: r.start, w: c.size, h: r.size });
    }));

    const warnings = [];
    if (!cols.ok) warnings.push({ level: 'error', text: `Block "${block.id}": ${cfg.columns} columns + gutters do not fit its width.` });
    if (!rows.ok) warnings.push({ level: 'error', text: `Block "${block.id}": ${cfg.rows} rows + gutters do not fit its height.` });
    if (cfg.fitRows && cfg.moduleSnap && cfg.rows > 1 && cfg.rowGutter % baselineUnits !== 0) {
      warnings.push({ level: 'warn', text: `Row gutter (${cfg.rowGutter}u) is not a multiple of the baseline step (${baselineUnits}u) — baselines drift between rows.` });
    }

    return {
      block, ok: cols.ok && rows.ok, columns, modules,
      colGutters: cols.gutters.map((g) => ({ x: g.start, y: rows.span.start, w: g.size, h: rows.span.size })),
      rowGutters: rows.gutters.map((g) => ({ x: cols.span.start, y: g.start, w: cols.span.size, h: g.size })),
      fitted: { x: cols.span.start, y: rows.span.start, w: cols.span.size, h: rows.span.size },
      columnUnits: cols.ok ? toUnits(cols.items[0].size, u) : 0,
      rowUnits: rows.ok ? toUnits(rows.items[0].size, u) : 0,
      leftover: { x: toUnits(cols.leftover, u), y: toUnits(rows.leftover, u) },
      warnings,
    };
  }

  /** Every x / y edge the grid produced, so we can score grid integrity. */
  function gridEdges(grid) {
    const xs = [];
    const ys = [];
    grid.modules.forEach((m) => { xs.push(m.x, m.x + m.w); ys.push(m.y, m.y + m.h); });
    return { xs, ys };
  }

  G.columns = { layoutAxis, layoutBlockGrid, gridEdges, anchorFor, isOnGrid };
  if (typeof module !== 'undefined') module.exports = G.columns;
})();
