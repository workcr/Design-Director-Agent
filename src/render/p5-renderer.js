/*
 * p5.js renderer. Pure consumer of the scene list: it knows nothing about
 * grids or canons. The same `paint` is used for the live canvas (scaled to
 * fit) and for the 1:1 PNG export.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.render = G.render || {};

  const MAX_FIT_SCALE = 1.5;
  const MIN_MINOR_CELL = 4; // device px — below this the unit grid turns to mush
  const hexCache = new Map();

  function rgba(hex, alpha = 1) {
    let rgb = hexCache.get(hex);
    if (!rgb) {
      const n = parseInt(hex.slice(1), 16);
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      hexCache.set(hex, rgb);
    }
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  /** Shared 2D context for text measurement, same font engine p5 draws with. */
  const measureCtx = document.createElement('canvas').getContext('2d');
  function measure(text, size, weight, family) {
    measureCtx.font = `${weight || 'normal'} ${size}px ${G.scene.FAMILY[family] || family}`;
    return measureCtx.measureText(text).width;
  }

  /** Paints the scene onto a p5 instance or p5.Graphics. */
  function paint(g, model, scene, scale, density) {
    const { cfg, unit } = model;
    const styles = G.scene.roleStyles(cfg);
    const ctx = g.drawingContext;
    const k = scale * density; // design px → device px
    const minWeight = 1 / scale / density;

    /** Aligns a coordinate to the device pixel centre so 1px lines stay sharp. */
    const crisp = (v, weight) => {
      const devW = Math.max(1, Math.round(weight * k));
      const frac = devW % 2 ? 0.5 : 0;
      return (Math.round(v * k - frac) + frac) / k;
    };

    g.background(cfg.cBg);
    g.push();
    g.scale(scale);
    g.noFill();

    const setStroke = (st) => {
      const weight = Math.max(st.w, minWeight);
      g.strokeWeight(weight);
      ctx.strokeStyle = rgba(st.stroke, st.alpha);
      ctx.setLineDash(st.dash ? st.dash.map((d) => d / scale) : []);
      return weight;
    };

    const placed = []; // label boxes already drawn, so crowded fractions can be skipped
    const overlaps = (b) => placed.some((q) => b.l < q.r && b.r > q.l && b.t < q.b && b.b > q.t);

    for (const p of scene) {
      const st = styles[p.role];
      if (!st) continue;

      if (p.t === 'line') {
        if (p.role === 'gridMinor' && unit * k < MIN_MINOR_CELL) continue;
        const weight = setStroke(st);
        const vertical = p.x1 === p.x2;
        const horizontal = p.y1 === p.y2;
        const x1 = vertical ? crisp(p.x1, weight) : p.x1;
        const x2 = vertical ? x1 : p.x2;
        const y1 = horizontal ? crisp(p.y1, weight) : p.y1;
        const y2 = horizontal ? y1 : p.y2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (p.t === 'rect') {
        const x0 = p.x;
        const y0 = p.y;
        if (st.fill && p.fill !== false) {
          ctx.fillStyle = rgba(st.fill, st.fillAlpha);
          ctx.fillRect(x0, y0, p.w, p.h);
        }
        if (st.stroke) {
          const weight = setStroke(st);
          const l = crisp(x0, weight);
          const t = crisp(y0, weight);
          ctx.strokeRect(l, t, crisp(x0 + p.w, weight) - l, crisp(y0 + p.h, weight) - t);
        }
      } else if (p.t === 'dot') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r / scale, 0, Math.PI * 2);
        if (st.fill) { ctx.fillStyle = rgba(st.fill, st.fillAlpha); ctx.fill(); }
        if (st.stroke) { setStroke(st); ctx.stroke(); }
      } else if (p.t === 'text') {
        const size = p.screen ? p.size / scale : p.size;
        const x = p.x + (p.dx ? p.dx / scale : 0);
        const y = p.y + (p.dy ? p.dy / scale : 0);
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = `${p.weight || 'normal'} ${size}px ${p.family || 'ui-monospace, Menlo, monospace'}`;
        ctx.textAlign = p.align || 'left';
        ctx.textBaseline = p.baselineMid ? 'middle' : 'alphabetic';
        let str = p.str;
        if (p.strs) {
          const room = p.fitWidth === undefined ? Infinity : p.fitWidth - 8 / scale;
          str = p.strs.find((c) => ctx.measureText(c).width <= room);
          if (str === undefined) { ctx.restore(); continue; }
          const w = ctx.measureText(str).width;
          const pad = 3 / scale;
          const left = p.align === 'left' ? x : x - w / 2;
          if (p.role === 'powerLabel') {
            const box = { l: left - pad, r: left + w + pad, t: y - size * 0.62 - pad, b: y + size * 0.62 + pad };
            if (overlaps(box)) { ctx.restore(); continue; }
            placed.push(box);
          }
          ctx.fillStyle = rgba(cfg.cBg, 0.78);
          ctx.fillRect(left - pad, y - size * 0.62 - pad, w + pad * 2, size * 1.24 + pad * 2);
        }
        ctx.fillStyle = rgba(st.fill, st.fillAlpha);
        ctx.fillText(str, x, y);
        ctx.restore();
      }
    }
    ctx.setLineDash([]);
    g.pop();
  }

  function createRenderer(host, viewport) {
    let model = null;
    let scene = [];
    let scale = 1;
    let p5i = null;
    let ready = false;

    const density = () => Math.min(window.devicePixelRatio || 1, 2);

    const computeScale = () => {
      if (!model) return 1;
      const z = model.cfg.zoom;
      if (z !== 'fit') return Number(z);
      const pad = 48;
      const sx = (viewport.clientWidth - pad) / model.view.width;
      const sy = (viewport.clientHeight - pad) / model.view.height;
      return Math.max(0.05, Math.min(sx, sy, MAX_FIT_SCALE));
    };

    const refresh = () => {
      if (!ready || !model) return;
      scale = computeScale();
      const w = Math.round(model.view.width * scale);
      const h = Math.round(model.view.height * scale);
      if (p5i.width !== w || p5i.height !== h) p5i.resizeCanvas(w, h, true);
      p5i.redraw();
    };

    new window.p5((p) => {
      p5i = p;
      p.setup = () => {
        p.pixelDensity(density());
        p.createCanvas(10, 10).attribute('aria-label', 'Grid preview');
        p.noLoop();
        ready = true;
        refresh();
      };
      p.draw = () => { if (model) paint(p, model, scene, scale, p.pixelDensity()); };
    }, host);

    new ResizeObserver(refresh).observe(viewport);

    return {
      measure,
      show(nextModel, nextScene) {
        model = nextModel;
        scene = nextScene;
        refresh();
      },
      get scale() { return scale; },
      /** Renders the current scene at 1:1 and resolves with a PNG blob. */
      exportPng() {
        const g = p5i.createGraphics(model.view.width, model.view.height);
        g.pixelDensity(1);
        paint(g, model, scene, 1, 1);
        return new Promise((resolve) => g.canvas.toBlob((blob) => { g.remove(); resolve(blob); }, 'image/png'));
      },
    };
  }

  G.render.createRenderer = createRenderer;
})();
