/* Measurements strip under the canvas: the numbers a designer actually copies. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};
  const { round, toUnits } = G.math;

  const cell = (label, value, sub, tone) => {
    const node = document.createElement('div');
    node.className = `cell${tone ? ` cell--${tone}` : ''}`;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    node.append(dt, dd);
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      node.append(s);
    }
    return node;
  };

  function createReadout(root) {
    const grid = root.querySelector('[data-readout-grid]');
    const notes = root.querySelector('[data-readout-notes]');

    return {
      update(model) {
        const { cfg, unit: u, view, stats, margins, integrity, grids, type, baseline } = model;
        const m = margins.snapped;
        const g = grids[0];
        const pct = Math.round(integrity.ratio * 100);
        const tone = integrity.ratio === 1 ? 'ok' : integrity.ratio > 0.9 ? 'warn' : 'bad';

        grid.replaceChildren(
          cell('Canvas', `${view.width} × ${view.height}`, `${stats.canvasUnits.w} × ${stats.canvasUnits.h} u`),
          cell('Margins  T · B · I · O', `${round(m.top, 1)} · ${round(m.bottom, 1)} · ${round(m.inner, 1)} · ${round(m.outer, 1)}`,
            `${toUnits(m.top, u)} · ${toUnits(m.bottom, u)} · ${toUnits(m.inner, u)} · ${toUnits(m.outer, u)} u`),
          stats.block && cell('Work area', `${round(stats.block.w, 1)} × ${round(stats.block.h, 1)}`, `${stats.block.wu} × ${stats.block.hu} u`),
          g && g.ok && cell(`${cfg.columns} col × ${cfg.rows} row`, `${round(g.columns[0].w, 1)} px col`, `${g.columnUnits} u · gutter ${cfg.gutter} u${cfg.rows > 1 ? ` · module ${g.rowUnits} u tall` : ''}`),
          cell('Baseline', `${baseline.step} px`, `${baseline.units} u · body ${type.styles.p.size}/${type.styles.p.leading} · ${stats.linesPerColumn} lines per column`),
          cell('Snap deviation', stats.maxDeviation < 1e-6 ? 'exact' : `± ${round(stats.maxDeviation, 2)} px`, 'largest shift from the pure canon'),
          cell('Grid integrity', `${pct}%`, `${integrity.onGrid} of ${integrity.total} edges on the ${u}px grid`, tone),
        );

        const items = [...model.warnings];
        integrity.offenders.slice(0, 4).forEach((o) => items.push({ level: 'info', text: `${o.label}: ${round(o.v, 2)}px is ${o.offBy > 0 ? '+' : ''}${o.offBy}px off the grid.` }));
        notes.replaceChildren(...items.map((w) => {
          const li = document.createElement('li');
          li.className = `note note--${w.level}`;
          li.textContent = w.text;
          return li;
        }));
        notes.hidden = items.length === 0;
      },
      fail(err) {
        notes.hidden = false;
        const li = document.createElement('li');
        li.className = 'note note--error';
        li.textContent = `Could not compute layout: ${err.message}`;
        notes.replaceChildren(li);
      },
    };
  }

  G.ui.createReadout = createReadout;
})();
