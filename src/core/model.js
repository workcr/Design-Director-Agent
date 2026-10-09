/* Assembles canon + modular grid + typography into one immutable model. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') {
    ['./math.js', './config.js', './canon.js', './columns.js', './powerlines.js', './typography.js'].forEach(require);
  }
  const { isOnGrid, toUnits, round, EPS } = G.math;

  const estimateWidth = (text, size) => text.length * size * 0.5;

  /** Scores how many edges of the finished layout sit exactly on the unit grid. */
  function scoreIntegrity(model) {
    const { unit: u, view, grids } = model;
    const edges = [{ axis: 'x', label: 'canvas width', v: view.width }, { axis: 'y', label: 'canvas height', v: view.height }];
    grids.forEach((g) => {
      const b = g.block;
      const tag = `${b.id} block`;
      edges.push({ axis: 'x', label: `${tag} left`, v: b.x }, { axis: 'x', label: `${tag} right`, v: b.x + b.w });
      edges.push({ axis: 'y', label: `${tag} top`, v: b.y }, { axis: 'y', label: `${tag} bottom`, v: b.y + b.h });
      g.modules.forEach((m) => {
        edges.push({ axis: 'x', label: `${tag} column edge`, v: m.x }, { axis: 'x', label: `${tag} column edge`, v: m.x + m.w });
        edges.push({ axis: 'y', label: `${tag} row edge`, v: m.y }, { axis: 'y', label: `${tag} row edge`, v: m.y + m.h });
      });
    });
    if (model.cfg.showPower || model.cfg.showAnchors) {
      model.power.x.forEach((l) => edges.push({ axis: 'x', label: `power line ${l.label}`, v: l.pos }));
      model.power.y.forEach((l) => edges.push({ axis: 'y', label: `power line ${l.label}`, v: l.pos }));
    }
    const seen = new Set();
    const unique = edges.filter((e) => {
      const key = `${e.axis}:${round(e.v, 4)}:${e.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const offenders = unique
      .filter((e) => !isOnGrid(e.v, u))
      .map((e) => ({ ...e, offBy: round(e.v - Math.round(e.v / u) * u, 2) }));
    return { total: unique.length, onGrid: unique.length - offenders.length, ratio: unique.length ? (unique.length - offenders.length) / unique.length : 1, offenders };
  }

  function baselineLines(cfg, view, origin, step) {
    const ys = [];
    const first = origin - Math.floor(origin / step + EPS) * step;
    for (let y = first; y <= view.height + EPS; y += step) ys.push(round(y, 4));
    return ys;
  }

  /** Canon divisions whose work-area edges (at least four) land on a power line. */
  function alignedDivisions(cfg, power) {
    const out = [];
    for (let d = 4; d <= 36; d++) {
      const canon = G.canon.computeCanon({ ...cfg, divisions: d });
      if (G.powerlines.canonAlignment(canon.blocks, power).matched >= 4) out.push(d);
    }
    return out;
  }

  function buildModel(rawCfg, measure) {
    const { normalize } = G.config;
    const cfg = normalize(rawCfg);
    const canon = G.canon.computeCanon(cfg);
    const type = G.typography.resolveType(cfg);
    const power = G.powerlines.computePowerLines(cfg, canon.view);
    const grids = canon.blocks.map((b) => G.columns.layoutBlockGrid(b, cfg, type.baselineUnits));
    const origin = cfg.baselineOrigin === 'block' && canon.blocks.length ? canon.blocks[0].y : 0;
    const baseline = {
      units: type.baselineUnits, step: type.baselineStep, origin,
      ys: baselineLines(cfg, canon.view, origin, type.baselineStep),
    };

    const areas = grids.flatMap((g) => (cfg.rows > 1 ? g.modules : g.columns));
    const measureFn = measure || estimateWidth;
    const usable = grids.every((g) => g.ok);
    const text = cfg.showSpecimen && usable
      ? G.typography.flowText({
        areas, scale: type.scale, unit: cfg.unit, gridOrigin: origin, gridStep: type.baselineStep,
        measure: (t, size, weight) => measureFn(t, size, weight, cfg.fontFamily),
      })
      : [];

    const model = { cfg, unit: cfg.unit, canvas: canon.canvas, view: canon.view, margins: canon.margins, blocks: canon.blocks, construction: canon.construction, perfect: canon.perfect, power, grids, type, baseline, text };
    model.integrity = scoreIntegrity(model);
    model.alignedDivisions = alignedDivisions(cfg, power);

    const first = grids[0];
    const b0 = canon.blocks[0];
    model.stats = {
      canvasUnits: { w: toUnits(canon.view.width, cfg.unit), h: toUnits(canon.view.height, cfg.unit) },
      block: b0 ? { w: b0.w, h: b0.h, wu: toUnits(b0.w, cfg.unit), hu: toUnits(b0.h, cfg.unit) } : null,
      columnUnits: first ? first.columnUnits : 0,
      rowUnits: first ? first.rowUnits : 0,
      linesPerColumn: first && first.ok ? Math.floor(first.columns[0].h / type.baselineStep + EPS) : 0,
      canonOnPower: G.powerlines.canonAlignment(canon.blocks, power),
      maxDeviation: Math.max(0, ...canon.blocks.flatMap((b) => Object.values(b.deviation).map(Math.abs))),
    };

    model.warnings = [...canon.warnings, ...grids.flatMap((g) => g.warnings)];
    if (cfg.snapMode === 'none' && model.integrity.offenders.length) {
      model.warnings.push({ level: 'info', text: 'Snapping is off — the exact canon is shown, so some edges sit between grid lines.' });
    }
    return model;
  }

  G.model = { buildModel, scoreIntegrity };
  if (typeof module !== 'undefined') module.exports = G.model;
})();
