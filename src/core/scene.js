/*
 * Scene: turns a model into a flat, ordered list of drawing primitives.
 * The p5 renderer and the SVG exporter both consume this list, so what you
 * see on screen is exactly what you export.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') { require('./math.js'); require('./fonts.js'); }
  const { isOnGrid, round, toUnits } = G.math;

  const OFFGRID = '#ff3b30';
  const REF_COLOUR = '#ff2db9';
  const REF_BASELINE = '#ffd60a';
  const STYLE_COLOUR = '#5cf08a';

  /** role → visual style. `w` is a multiplier of cfg.lineWeight. */
  function roleStyles(cfg) {
    const lw = cfg.lineWeight;
    return {
      gridMinor: { stroke: cfg.cGrid, alpha: cfg.gridOpacity * 0.45, w: 0.5 * lw },
      gridMajor: { stroke: cfg.cGrid, alpha: cfg.gridOpacity, w: lw },
      baseline: { stroke: cfg.cBaseline, alpha: 0.5, w: 0.75 * lw },
      page: { stroke: cfg.cText, alpha: 0.35, w: lw },
      spine: { stroke: cfg.cText, alpha: 0.35, w: lw },
      diagonal: { stroke: cfg.cCanon, alpha: 0.9, w: lw },
      ladder: { stroke: cfg.cCanon, alpha: 0.6, w: 0.75 * lw },
      ideal: { stroke: cfg.cCanon, alpha: 0.95, w: lw, dash: [6, 4] },
      block: { stroke: cfg.cBlock, alpha: 0.95, w: 1.25 * lw },
      column: { stroke: cfg.cColumn, alpha: 0.8, w: lw, fill: cfg.cColumn, fillAlpha: 0.1 },
      gutter: { fill: cfg.cColumn, fillAlpha: 0.05 },
      offgrid: { stroke: OFFGRID, alpha: 1, w: 1.5 * lw, fill: OFFGRID, fillAlpha: 0.12 },
      power0: { stroke: cfg.cPower, alpha: 0.95, w: lw, dash: [6, 3] },
      power1: { stroke: cfg.cPower, alpha: 0.7, w: 0.85 * lw, dash: [6, 3] },
      power2: { stroke: cfg.cPower, alpha: 0.5, w: 0.7 * lw, dash: [6, 3] },
      powerMain: { stroke: cfg.cPower, alpha: 0.55, w: lw },
      powerStrip: { stroke: cfg.cPower, alpha: 0.22, w: 0.6 * lw },
      anchorStrong: { fill: cfg.cPower, fillAlpha: 1, stroke: cfg.cBg, alpha: 0.9, w: 1.25 * lw },
      anchor: { stroke: cfg.cPower, alpha: 0.9, w: 1.25 * lw },
      powerLabel: { fill: cfg.cPower, fillAlpha: 1 },
      refAxis: { stroke: REF_COLOUR, alpha: 0.95, w: 1.25 * lw, dash: [6, 3] },
      refBaseline: { stroke: REF_BASELINE, alpha: 0.8, w: 0.75 * lw },
      refBlock: { stroke: REF_COLOUR, alpha: 0.8, w: lw },
      refLabel: { fill: REF_COLOUR, fillAlpha: 1 },
      styleAxis: { stroke: STYLE_COLOUR, alpha: 0.95, w: 1.25 * lw, dash: [2, 4] },
      styleLabel: { fill: STYLE_COLOUR, fillAlpha: 1 },
      reference: { stroke: cfg.cText, alpha: 0.5, w: lw, fill: cfg.cText, fillAlpha: 0.06 },
      element: { stroke: cfg.cText, alpha: 0.45, w: 0.75 * lw, dash: [3, 3] },
      asset: { stroke: cfg.cText, alpha: 0.5, w: lw, fill: cfg.cText, fillAlpha: 0.06 },
      placement: { stroke: cfg.cPower, alpha: 0.95, w: 1.25 * lw, fill: cfg.cPower, fillAlpha: 0.1 },
      placementLabel: { fill: cfg.cPower, fillAlpha: 1 },
      focal: { stroke: cfg.cPower, alpha: 1, w: 1.75 * lw },
      label: { fill: cfg.cText, fillAlpha: 0.75 },
      text: { fill: cfg.cText, fillAlpha: 1 },
    };
  }

  const FAMILY = { Helvetica: 'Helvetica, Arial, sans-serif', Georgia: 'Georgia, serif', Courier: '"Courier New", Courier, monospace', 'sans-serif': 'sans-serif', serif: 'serif', monospace: 'monospace' };

  function buildScene(model) {
    const { cfg, view, unit: u, grids, baseline } = model;
    const out = [];
    const line = (role, x1, y1, x2, y2) => out.push({ t: 'line', role, x1, y1, x2, y2 });
    const rect = (role, x, y, w, h, extra) => out.push({ t: 'rect', role, x, y, w, h, ...extra });
    const label = (strs, x, y, extra) => out.push({ t: 'text', role: 'label', strs, x, y, size: 10.5, screen: true, align: 'center', ...extra });

    // reference image underneath everything
    const { reference, style } = model;
    if (cfg.showReference && reference && reference.assetId) {
      out.push({ t: 'image', role: 'reference', assetId: reference.assetId, x: 0, y: 0, w: view.width, h: view.height, fit: 'cover', alpha: cfg.referenceOpacity, name: reference.name || 'reference', nat: { w: reference.analysis.width, h: reference.analysis.height }, missing: false });
    }

    // pixel grid
    if (cfg.showPixelGrid) {
      const major = cfg.majorEvery;
      for (let i = 0, x = 0; x <= view.width + 1e-6; i++, x = i * u) line(i % major === 0 ? 'gridMajor' : 'gridMinor', x, 0, x, view.height);
      for (let i = 0, y = 0; y <= view.height + 1e-6; i++, y = i * u) line(i % major === 0 ? 'gridMajor' : 'gridMinor', 0, y, view.width, y);
    }

    // baseline grid
    if (cfg.showBaseline) {
      const spans = cfg.baselineScope === 'blocks' ? grids.map((g) => [g.block.x, g.block.x + g.block.w, g.block.y, g.block.y + g.block.h]) : [[0, view.width, 0, view.height]];
      spans.forEach(([x0, x1, y0, y1]) => baseline.ys.filter((y) => y >= y0 - 1e-6 && y <= y1 + 1e-6).forEach((y) => line('baseline', x0, y, x1, y)));
    }

    // pages
    if (cfg.showPages) {
      if (cfg.layout === 'spread') {
        rect('page', 0, 0, view.width / 2, view.height);
        rect('page', view.width / 2, 0, view.width / 2, view.height);
      } else {
        rect('page', 0, 0, view.width, view.height);
      }
    }

    // power lines: construction diagonals, then the lines themselves
    const { power } = model;
    if (cfg.showStripDiagonals) power.strips.forEach((s) => line('powerStrip', s.x1, s.y1, s.x2, s.y2));
    if (cfg.showPowerDiagonals) power.primary.forEach((s) => line('powerMain', s.x1, s.y1, s.x2, s.y2));
    if (cfg.showPower) {
      power.x.forEach((l) => line(`power${Math.min(l.level, 2)}`, l.pos, 0, l.pos, view.height));
      power.y.forEach((l) => line(`power${Math.min(l.level, 2)}`, 0, l.pos, view.width, l.pos));
    }

    // canon construction
    if (cfg.showCanon) {
      model.construction.filter((s) => s.role === 'diagonal' || cfg.showLadder).forEach((s) => line(s.role, s.x1, s.y1, s.x2, s.y2));
    }

    // ideal (unsnapped) canon boxes
    if (cfg.showIdeal && cfg.snapMode !== 'none') {
      model.blocks.forEach((b) => {
        const moved = Object.values(b.deviation).some((d) => Math.abs(d) > 1e-6);
        if (moved) rect('ideal', b.ideal.x, b.ideal.y, b.ideal.w, b.ideal.h);
      });
    }

    // columns / modules / gutters
    grids.forEach((g) => {
      if (!g.ok) return;
      if (cfg.showGutters) [...g.colGutters, ...g.rowGutters].forEach((r) => rect('gutter', r.x, r.y, r.w, r.h));
      if (cfg.showColumns) {
        const cells = cfg.rows > 1 ? g.modules : g.columns;
        cells.forEach((m) => {
          const on = [m.x, m.y, m.w, m.h].every((v) => isOnGrid(v, u));
          rect(!on && cfg.showOffGrid ? 'offgrid' : 'column', m.x, m.y, m.w, m.h);
        });
      }
    });

    // text blocks (canon boxes)
    if (cfg.showBlocks) {
      grids.forEach((g) => {
        const b = g.block;
        const on = [b.x, b.y, b.w, b.h].every((v) => isOnGrid(v, u));
        rect(!on && cfg.showOffGrid ? 'offgrid' : 'block', b.x, b.y, b.w, b.h, { fill: false });
      });
    }

    // what the analysis found in the reference: axes, baseline grid, text blocks (scaled to this canvas)
    if (cfg.showDetected && reference && reference.analysis) {
      const a = reference.analysis;
      const sx = view.width / a.width;
      const sy = view.height / a.height;
      a.blocks.forEach((b) => rect('refBlock', b.left * sx, b.top * sy, (b.right - b.left) * sx, (b.bottom - b.top) * sy, { fill: false }));
      if (a.baseline) {
        const body = a.clusters.find((c) => c.role === 'body');
        const mine = a.blocks.filter((b) => body && body.blocks.includes(b.id));
        if (mine.length) {
          const x0 = Math.min(...mine.map((b) => b.left)) * sx;
          const x1 = Math.max(...mine.map((b) => b.right)) * sx;
          const lo = Math.min(...mine.map((b) => b.top));
          const hi = Math.max(...mine.map((b) => b.bottom));
          const k0 = Math.ceil((lo - a.baseline.offset) / a.baseline.step);
          for (let y = a.baseline.offset + k0 * a.baseline.step; y <= hi; y += a.baseline.step) line('refBaseline', x0, y * sy, x1, y * sy);
        }
      }
      a.axes.forEach((x) => {
        line('refAxis', x.x * sx, 0, x.x * sx, view.height);
        out.push({ t: 'text', role: 'refLabel', strs: [`${x.match.strength !== 'none' ? `${x.match.label} · ` : ''}${Math.round(x.x * sx)}`], x: x.x * sx, y: 0, size: 10.5, screen: true, align: 'left', dx: 5, dy: 14 });
      });
    }

    // axes of the applied designer style
    if (cfg.showStyleAxes && style) {
      style.axes.forEach((x) => {
        line('styleAxis', x.fraction * view.width, 0, x.fraction * view.width, view.height);
        out.push({ t: 'text', role: 'styleLabel', strs: [x.label || `${Math.round(x.fraction * 100)}%`], x: x.fraction * view.width, y: view.height, size: 10.5, screen: true, align: 'left', dx: 5, dy: -8 });
      });
      if (style.axes.length) out.push({ t: 'text', role: 'styleLabel', strs: [`Style: ${style.name}`], x: 0, y: view.height, size: 10.5, screen: true, align: 'left', dx: 6, dy: -24 });
    }

    // placement preview: the selected template's boxes and the focal points
    if (cfg.showPlacements) {
      const chosen = model.placements.templates.find((t) => t.id === model.placements.selected.id);
      if (cfg.showSlots) chosen.items.forEach((it) => {
        const b = it.box;
        rect('placement', b.x, b.y, b.width, b.height);
        out.push({ t: 'text', role: 'placementLabel', strs: [it.role], x: b.x, y: b.y, size: 11, screen: true, align: 'left', dx: 6, dy: 15, fitWidth: b.width });
      });
      model.elements.items.filter((it) => !it.empty).forEach((it) => {
        const b = it.box;
        if (it.kind === 'asset') {
          const src = cfg.elements.find((e) => e.id === it.id);
          out.push({ t: 'image', role: 'asset', assetId: src && src.asset ? src.asset.id : '', name: it.asset.name || it.role, x: b.x, y: b.y, w: b.width, h: b.height, fit: it.asset.mode, nat: { w: it.asset.width || 0, h: it.asset.height || 0 }, missing: it.asset.missing });
          rect('element', b.x, b.y, b.width, b.height, { fill: false });
          return;
        }
        rect(it.fits ? 'element' : 'offgrid', b.x, b.y, b.width, b.height, { fill: false });
        const t = it.text;
        t.lines.forEach((l) => out.push({ t: 'text', role: 'text', str: l.text, x: l.x, y: l.y, size: t.size, weight: t.weight, family: G.fonts.stack(t.family), align: t.align }));
      });
      model.placements.focalPoints.forEach((f) => {
        out.push({ t: 'dot', role: 'focal', x: f.x, y: f.y, r: 9 });
        out.push({ t: 'dot', role: 'anchorStrong', x: f.x, y: f.y, r: 3 });
        out.push({ t: 'text', role: 'placementLabel', strs: [`F${f.rank}`], x: f.x, y: f.y, size: 10, screen: true, align: 'left', dx: 12, dy: -8 });
      });
    }

    // anchor points
    if (cfg.showAnchors) {
      power.anchors.forEach((a) => out.push({ t: 'dot', role: a.strong ? 'anchorStrong' : 'anchor', x: a.x, y: a.y, r: Math.max(2.5, 4.5 - a.level * 0.6) }));
    }

    // specimen
    model.text.forEach((l) => out.push({ t: 'text', role: 'text', str: l.text, x: l.x, y: l.y, size: l.size, weight: l.weight, family: G.fonts.stack(cfg.fontFamily), align: 'left' }));

    if (cfg.showPower && cfg.showPowerLabels) {
      const tag = (strs, x, y, extra) => out.push({ t: 'text', role: 'powerLabel', strs, x, y, size: 10, screen: true, align: 'center', ...extra });
      power.x.forEach((l) => tag([l.label], l.pos, 0, { dy: 13 }));
      power.y.forEach((l) => tag([l.label], 0, l.pos, { align: 'left', dx: 5, dy: -6 }));
    }

    // labels — each carries candidate strings, longest first; the renderer picks the first that fits
    if (cfg.showLabels) {
      const as = {
        px: (v) => `${round(v, 1)}`,
        units: (v) => `${toUnits(v, u)}u`,
        both: (v) => `${round(v, 1)} · ${toUnits(v, u)}u`,
      };
      const order = { px: ['px'], units: ['units'], both: ['both', 'units', 'px'] }[cfg.labelFormat];
      const cands = (px) => order.map((f) => as[f](px));
      const size2 = (w, h) => order.map((f) => `${as[f](w)} × ${as[f](h)}`);
      grids.forEach((g) => {
        const b = g.block;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const left = b.x - b.page.x0;
        const right = b.page.x1 - b.x - b.w;
        label(cands(b.y), cx, b.y / 2, { baselineMid: true });
        label(cands(view.height - b.y - b.h), cx, (b.y + b.h + view.height) / 2, { baselineMid: true });
        label(cands(left), (b.page.x0 + b.x) / 2, cy, { baselineMid: true, fitWidth: left });
        label(cands(right), (b.x + b.w + b.page.x1) / 2, cy, { baselineMid: true, fitWidth: right });
        label(size2(b.w, b.h), b.x, b.y + b.h, { align: 'left', dy: 14, fitWidth: b.w });
      });
    }
    return out;
  }

  G.scene = { roleStyles, buildScene, FAMILY, OFFGRID };
  if (typeof module !== 'undefined') module.exports = G.scene;
})();
