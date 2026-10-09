/*
 * Villard de Honnecourt / Van de Graaf canon — closed form.
 *
 * Working in spread coordinates (width W = 2·Wp, height H), the ladder of
 * diagonals from (W/2, H/d) to p3 = (2W/3, 0) meets the short diagonal at
 * height H/(d+3). A text block with canon division D therefore has margins
 *
 *   top    = H/D     bottom = 2H/D
 *   inner  = Wp/D    outer  = 2Wp/D
 *
 * (D = 9 is the classic 1:2 margin canon). No line-intersection library is
 * needed and nothing depends on float modulo.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./math.js');
  const { snap, isOnGrid, clipSegment, perfectDivisions, toUnits } = G.math;

  /** Resolves the real canvas size, optionally forcing it onto the unit grid. */
  function resolveCanvas({ layout, width, height, unit, fitCanvas }) {
    const spread = layout === 'spread';
    let h = height;
    let pw = spread ? width / 2 : width;
    if (fitCanvas) {
      h = Math.max(unit * 4, Math.round(height / unit) * unit);
      pw = Math.max(unit * 2, Math.round(pw / unit) * unit);
    }
    return {
      requested: { width, height },
      width: spread ? pw * 2 : pw,
      height: h,
      pageWidth: pw,
      aligned: isOnGrid(h, unit) && isOnGrid(pw, unit),
    };
  }

  /** Ideal (unsnapped) margins for a page of width Wp and height H. */
  const idealMargins = (Wp, H, D) => ({ top: H / D, bottom: (2 * H) / D, inner: Wp / D, outer: (2 * Wp) / D });

  /** Construction lines in spread coordinates. */
  function constructionSegments(Wp, H, D) {
    const W = 2 * Wp;
    const cx = W / 2;
    const p3 = (2 * W) / 3;
    const p3m = W / 3;
    const segs = [];
    const add = (role, x1, y1, x2, y2) => segs.push({ role, x1, y1, x2, y2 });

    add('diagonal', cx, 0, W, H); // l1 short diagonal
    add('diagonal', 0, H, W, 0); // l2 long diagonal
    add('diagonal', cx, 0, 0, H); // l3 mirrored short
    add('diagonal', W, H, 0, 0); // l4 mirrored long
    add('diagonal', p3, H / 3, p3, 0); // l5 (p1 → p3)
    add('diagonal', p3m, H / 3, p3m, 0); // mirrored l5

    for (let d = D - 3; d >= 1; d -= 3) {
      const y = H / d;
      add('ladder', cx, y, cx * (1 + 1 / d), y);
      add('ladder', cx, y, p3, 0);
      add('ladder', cx, y, cx * (1 - 1 / d), y);
      add('ladder', cx, y, p3m, 0);
    }
    return segs;
  }

  function computeCanon(cfg) {
    const { unit: u, divisions: D, snapMode, layout, blockMode } = cfg;
    const canvas = resolveCanvas(cfg);
    const Wp = canvas.pageWidth;
    const H = canvas.height;
    const W = 2 * Wp;
    const single = layout === 'page';
    const offsetX = single ? Wp : 0;

    const ideal = idealMargins(Wp, H, D);
    const snapped = {};
    for (const k of Object.keys(ideal)) snapped[k] = snap(ideal[k], u, snapMode);

    const blockH = H - snapped.top - snapped.bottom;
    const idealH = H - ideal.top - ideal.bottom;
    const makeBlock = (id, side, x, w, ix, iw, page) => ({
      id, side, x: x - offsetX, y: snapped.top, w, h: blockH,
      page: { x0: page[0] - offsetX, x1: page[1] - offsetX },
      ideal: { x: ix - offsetX, y: ideal.top, w: iw, h: idealH },
    });

    const pageW = Wp - snapped.inner - snapped.outer;
    const idealPageW = Wp - ideal.inner - ideal.outer;
    let blocks;
    if (single) {
      blocks = [makeBlock('page', 'right', Wp + snapped.inner, pageW, Wp + ideal.inner, idealPageW, [Wp, W])];
    } else if (blockMode === 'centered') {
      blocks = [makeBlock('spread', 'center', snapped.outer, W - 2 * snapped.outer, ideal.outer, W - 2 * ideal.outer, [0, W])];
    } else {
      blocks = [
        makeBlock('left', 'left', snapped.outer, pageW, ideal.outer, idealPageW, [0, Wp]),
        makeBlock('right', 'right', Wp + snapped.inner, pageW, Wp + ideal.inner, idealPageW, [Wp, W]),
      ];
    }

    for (const b of blocks) {
      b.deviation = {
        left: b.x - b.ideal.x,
        top: b.y - b.ideal.y,
        right: b.x + b.w - (b.ideal.x + b.ideal.w),
        bottom: b.y + b.h - (b.ideal.y + b.ideal.h),
      };
      b.units = { x: toUnits(b.x, u), y: toUnits(b.y, u), w: toUnits(b.w, u), h: toUnits(b.h, u) };
    }

    const view = { width: single ? Wp : W, height: H, offsetX };
    const clipRect = { x: 0, y: 0, w: view.width, h: view.height };
    const construction = constructionSegments(Wp, H, D)
      .map((s) => ({ ...s, x1: s.x1 - offsetX, x2: s.x2 - offsetX }))
      .map((s) => clipSegment(s, clipRect))
      .filter(Boolean);

    const warnings = [];
    if (!canvas.aligned) warnings.push({ level: 'warn', text: 'Canvas size is not a whole number of grid units.' });
    if (blocks.some((b) => b.w < u || b.h < u)) {
      warnings.push({ level: 'error', text: 'Margins leave no room for a text block — lower the division or raise the canvas size.' });
    }

    return {
      canvas, view, margins: { ideal, snapped }, blocks, construction, warnings,
      perfect: perfectDivisions({ pageWidth: Wp, height: H, unit: u }),
    };
  }

  G.canon = { resolveCanvas, idealMargins, constructionSegments, computeCanon };
  if (typeof module !== 'undefined') module.exports = G.canon;
})();
