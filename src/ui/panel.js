/* Builds the control panel from the schema and keeps it in sync with the store. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') node.setAttribute(k, v);
      else node[k] = v;
    });
    [].concat(children).filter(Boolean).forEach((c) => node.append(c));
    return node;
  };

  const fmt = (v, step) => (step && step < 1 ? Number(v).toFixed(String(step).split('.')[1].length) : String(v));

  /* ---------- individual controls: each returns { node, sync(cfg, model) } ---------- */

  function rangeControl(f, store) {
    const id = `ctl-${f.key}`;
    const num = el('input', { type: 'number', id, min: f.min, max: f.max, step: f.step, inputMode: 'decimal' });
    const range = el('input', { type: 'range', min: f.min, max: f.max, step: f.step, 'aria-label': `${f.label} slider` });
    const onInput = (src) => () => {
      const v = Number(src.value);
      if (Number.isFinite(v)) store.patch({ [f.key]: v });
    };
    range.addEventListener('input', onInput(range));
    num.addEventListener('input', onInput(num));
    num.addEventListener('change', () => num.value = fmt(store.get()[f.key], f.step));
    const node = el('div', { class: 'field field--range' }, [
      el('label', { for: id, text: f.label }),
      el('span', { class: 'num' }, [num, f.suffix && el('span', { class: 'suffix', text: f.suffix })]),
      range,
      f.hint && el('p', { class: 'hint', text: f.hint }),
    ]);
    return {
      node,
      sync(cfg) {
        range.value = cfg[f.key];
        if (document.activeElement !== num) num.value = fmt(cfg[f.key], f.step);
      },
    };
  }

  function numberControl(f, store) {
    const id = `ctl-${f.key}`;
    const num = el('input', { type: 'number', id, min: f.min, max: f.max, step: f.step, inputMode: 'numeric' });
    num.addEventListener('change', () => {
      const v = Number(num.value);
      if (Number.isFinite(v)) store.patch({ [f.key]: v });
      num.value = store.get()[f.key];
    });
    const node = el('div', { class: 'field field--number' }, [
      el('label', { for: id, text: f.label }),
      el('span', { class: 'num' }, [num, f.suffix && el('span', { class: 'suffix', text: f.suffix })]),
    ]);
    return { node, sync(cfg) { if (document.activeElement !== num) num.value = cfg[f.key]; } };
  }

  function segmentedControl(f, store) {
    const name = `seg-${f.key}`;
    const inputs = f.options.map(([value, text]) => {
      const input = el('input', { type: 'radio', name, value });
      input.addEventListener('change', () => input.checked && store.patch({ [f.key]: value }));
      return { input, label: el('label', { class: 'seg' }, [input, el('span', { text })]) };
    });
    const node = el('div', { class: 'field field--segmented' }, [
      el('span', { class: 'label', id: `lbl-${f.key}`, text: f.label }),
      el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': `lbl-${f.key}` }, inputs.map((i) => i.label)),
      f.hint && el('p', { class: 'hint', text: f.hint }),
    ]);
    return { node, sync(cfg) { inputs.forEach(({ input }) => { input.checked = input.value === String(cfg[f.key]); }); } };
  }

  function selectControl(f, store) {
    const id = `ctl-${f.key}`;
    const select = el('select', { id }, f.options.map(([value, text]) => el('option', { value, text })));
    select.addEventListener('change', () => {
      const extra = f.patchFrom ? f.patchFrom(select.value, store.get()) : {};
      store.patch(f.virtual ? extra : { [f.key]: select.value, ...extra });
    });
    const node = el('div', { class: 'field field--select' }, [el('label', { for: id, text: f.label }), select]);
    return { node, sync(cfg) { select.value = f.valueFrom ? f.valueFrom(cfg) : cfg[f.key]; } };
  }

  function toggleControl(f, store) {
    const id = `ctl-${f.key}`;
    const input = el('input', { type: 'checkbox', id, role: 'switch' });
    input.addEventListener('change', () => store.patch({ [f.key]: input.checked }));
    const node = el('div', { class: 'field field--toggle' }, [
      el('label', { for: id }, [el('span', { text: f.label }), input, el('span', { class: 'track', 'aria-hidden': 'true' })]),
      f.hint && el('p', { class: 'hint', text: f.hint }),
    ]);
    return { node, sync(cfg) { input.checked = Boolean(cfg[f.key]); } };
  }

  function chipControl(f, store) {
    const btn = el('button', { type: 'button', class: 'chip', text: f.label });
    btn.addEventListener('click', () => store.patch({ [f.key]: !store.get()[f.key] }));
    return { node: btn, sync(cfg) { btn.setAttribute('aria-pressed', String(Boolean(cfg[f.key]))); } };
  }

  function colorControl(f, store) {
    const id = `ctl-${f.key}`;
    const input = el('input', { type: 'color', id });
    const hex = el('code', { class: 'hex' });
    input.addEventListener('input', () => store.patch({ [f.key]: input.value }));
    const node = el('div', { class: 'field field--color' }, [el('label', { for: id, text: f.label }), hex, input]);
    return { node, sync(cfg) { input.value = cfg[f.key]; hex.textContent = cfg[f.key].toUpperCase(); } };
  }

  function buttonControl(f, actions) {
    const btn = el('button', { type: 'button', class: `btn${f.variant ? ` btn--${f.variant}` : ''}`, text: f.label });
    btn.addEventListener('click', () => actions[f.action] && actions[f.action]());
    return { node: btn, sync() {} };
  }

  /* ---------- custom read-outs rendered from the model ---------- */

  function divisionChips(source, emptyText) {
    return function control(f, store) {
    const list = el('div', { class: 'chips', role: 'group', 'aria-label': f.label });
    const node = el('div', { class: 'field field--custom' }, [el('span', { class: 'label', text: f.label }), list, f.hint && el('p', { class: 'hint', text: f.hint })]);
    return {
      node,
      sync(cfg, model) {
        list.replaceChildren();
        const divisions = model[source];
        if (!divisions.length) {
          list.append(el('span', { class: 'muted', text: emptyText }));
          return;
        }
        divisions.forEach((d) => {
          const b = el('button', { type: 'button', class: 'chip chip--mono', text: String(d) });
          b.setAttribute('aria-pressed', String(cfg.divisions === d));
          b.addEventListener('click', () => store.patch({ divisions: d }));
          list.append(b);
        });
      },
    };
    };
  }

  const perfectControl = divisionChips('perfect', 'None for this canvas and unit — snapping applies.');
  const alignedControl = divisionChips('alignedDivisions', 'None with the current power-line settings.');

  function typeScaleControl(f) {
    const body = el('tbody');
    const table = el('table', { class: 'scale' }, [
      el('thead', {}, [el('tr', {}, ['', 'size', 'leading', 'units'].map((t) => el('th', { text: t, scope: 'col' })))]),
      body,
    ]);
    const node = el('div', { class: 'field field--custom' }, [el('span', { class: 'label', text: f.label }), table]);
    return {
      node,
      sync(cfg, model) {
        body.replaceChildren(...[...model.type.scale].reverse().map((s) => el('tr', { class: s.step === 0 ? 'is-body' : '' }, [
          el('th', { scope: 'row', text: s.name }),
          el('td', { text: `${s.size}px` }),
          el('td', { text: `${s.leading}px` }),
          el('td', { text: `${s.leadingUnits}u` }),
        ])));
      },
    };
  }

  function powerTableControl(f) {
    const body = el('tbody');
    const table = el('table', { class: 'scale' }, [
      el('thead', {}, [el('tr', {}, ['line', 'x px', 'y px'].map((t) => el('th', { text: t, scope: 'col' })))]),
      body,
    ]);
    const legend = el('p', { class: 'hint', text: 'Amber = snapped off its pure fraction; hover for the shift.' });
    const node = el('div', { class: 'field field--custom' }, [el('span', { class: 'label', text: f.label }), table, legend]);
    const cellFor = (l) => {
      if (!l) return el('td', { text: '·' });
      const td = el('td', { text: `${Math.round(l.pos * 100) / 100}` });
      if (!l.exact) {
        td.className = 'off';
        td.title = `pure ${Math.round(l.ideal * 100) / 100}px · shifted ${l.deviation > 0 ? '+' : ''}${Math.round(l.deviation * 100) / 100}px`;
      }
      return td;
    };
    return {
      node,
      sync(cfg, model) {
        const rows = new Map();
        model.power.x.forEach((l) => rows.set(l.label, { value: l.value, x: l }));
        model.power.y.forEach((l) => rows.set(l.label, { ...(rows.get(l.label) || { value: l.value }), y: l }));
        const sorted = [...rows.entries()].sort((a, b) => a[1].value - b[1].value);
        body.replaceChildren(...sorted.map(([label, r]) => el('tr', {}, [el('th', { scope: 'row', text: label }), cellFor(r.x), cellFor(r.y)])));
        node.hidden = sorted.length === 0;
      },
    };
  }

  function placementPickerControl(f, store) {
    const id = 'ctl-placementTemplate';
    const select = el('select', { id });
    select.addEventListener('change', () => store.patch({ placementTemplate: select.value, showPlacements: true }));
    const note = el('p', { class: 'hint' });
    const body = el('tbody');
    const table = el('table', { class: 'scale' }, [
      el('thead', {}, [el('tr', {}, ['role', 'anchor px', 'size'].map((t) => el('th', { text: t, scope: 'col' })))]),
      body,
    ]);
    const meta = el('p', { class: 'hint' });
    const node = el('div', { class: 'field field--custom' }, [
      el('label', { for: id, text: f.label }), select, note, table, meta, f.hint && el('p', { class: 'hint', text: f.hint }),
    ]);
    return {
      node,
      sync(cfg, model) {
        const p = model.placements;
        select.replaceChildren(...p.available.map((t) => el('option', { value: t.id, text: t.name })));
        select.value = p.selected.id;
        const chosen = p.templates.find((t) => t.id === p.selected.id);
        note.textContent = chosen.note;
        body.replaceChildren(...chosen.items.map((it) => el('tr', {}, [
          el('th', { scope: 'row', text: it.role }),
          el('td', { text: `${it.anchorPoint.x}, ${it.anchorPoint.y}` }),
          el('td', { text: `${it.box.width}×${it.box.height}` }),
        ])));
        meta.textContent = `${p.orientation} · ratio ${p.ratio}${p.offLines ? ` · ${p.offLines} edges off the lines at this depth` : ' · every edge on a power line'}`;
      },
    };
  }

  const BUILDERS = {
    range: rangeControl, number: numberControl, segmented: segmentedControl, select: selectControl,
    toggle: toggleControl, chip: chipControl, color: colorControl,
  };
  const CUSTOM = { perfect: perfectControl, aligned: alignedControl, typescale: typeScaleControl, powerTable: powerTableControl, placementPicker: placementPickerControl };

  function createPanel(root, store, actions) {
    const controls = [];
    G.ui.SECTIONS.forEach((section) => {
      const body = el('div', { class: 'section__body' });
      const details = el('details', { class: 'section', open: section.open }, [
        el('summary', {}, [el('span', { text: section.title }), el('span', { class: 'chevron', 'aria-hidden': 'true' })]),
        body,
      ]);
      let chipRow = null;
      section.fields.forEach((f) => {
        const ctl = f.type === 'button' ? buttonControl(f, actions) : f.type === 'custom' ? CUSTOM[f.key](f, store) : BUILDERS[f.type](f, store);
        if (f.type === 'chip') {
          if (!chipRow) { chipRow = el('div', { class: 'chips chips--grid' }); body.append(chipRow); }
          chipRow.append(ctl.node);
        } else {
          chipRow = null;
          if (f.type === 'button') {
            let row = body.lastElementChild;
            if (!row || !row.classList.contains('actions')) { row = el('div', { class: 'actions' }); body.append(row); }
            row.append(ctl.node);
          } else body.append(ctl.node);
        }
        controls.push({ f, ctl });
      });
      root.append(details);
    });

    return {
      update(cfg, model) {
        controls.forEach(({ f, ctl }) => {
          ctl.node.hidden = f.show ? !f.show(cfg) : false;
          ctl.sync(cfg, model);
        });
      },
    };
  }

  G.ui.createPanel = createPanel;
})();
