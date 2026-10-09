/*
 * Reference drawer: upload a layout, see what was measured, overlay it on the canvas, use it as the
 * canvas, add it to the style library, and (optionally) ask a local model to describe it.
 * All text is written with textContent; nothing from an image or a model is ever parsed as HTML.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};
  const { el } = G.ui;
  const { clamp, round } = G.math;

  const pct = (v) => `${Math.round(v * 100)}%`;

  function table(headers, rows) {
    return el('table', { class: 'scale' }, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h, scope: 'col' })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) => (i === 0 ? el('th', { scope: 'row', text: String(c) }) : el('td', { text: String(c) })))))),
    ]);
  }

  /** Settings that reproduce what was measured, on a canvas the size of the reference. */
  function canvasPatch(ref) {
    const a = ref.analysis;
    const patch = { layout: 'page', width: a.width, height: a.height, showReference: true, showDetected: true };
    const body = a.clusters.find((c) => c.role === 'body');
    if (a.baseline) {
      const step = Math.round(a.baseline.step);
      const fits = (d) => step % d === 0 && a.width % d === 0 && a.height % d === 0;
      const unit = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].find(fits);
      patch.unit = unit || 4;
      patch.fitCanvas = !unit;
      patch.baselineMode = 'custom';
      patch.baselineCustom = clamp(Math.round(step / patch.unit), 1, 24);
      patch.baselineOffset = clamp(Math.round(a.baseline.offset), 0, 400);
    } else {
      patch.unit = 8;
      patch.fitCanvas = true;
    }
    if (body) {
      patch.baseSize = clamp(Math.round(body.size), 6, 96);
      if (body.leadingRatio) {
        patch.lineHeight = clamp(Math.round(body.leadingRatio * 20) / 20, 1, 3);
        patch.minLeading = body.leadingRatio <= G.styles.SOLID ? 1 : 1.05;
      }
    }
    return patch;
  }

  function createReferenceDrawer({ store, library, session, say }) {
    let busy = false;
    let modelBusy = false;

    const close = el('button', { type: 'button', class: 'icon-btn', text: '×', 'aria-label': 'Close reference layouts' });
    const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/avif,.svg', hidden: true });
    const zoneText = el('span', { text: 'Drop a poster or page here, or choose a file' });
    const zone = el('button', { type: 'button', class: 'dropzone' }, [zoneText, el('small', { text: 'PNG, JPEG, WebP, GIF or SVG · measured on this computer, nothing is uploaded' })]);
    const result = el('div', { class: 'ref-result', hidden: true });
    const libraryPanel = G.ui.createLibraryPanel({ store, library, session, say });
    const modelPanel = G.ui.createModelPanel({ say });

    const root = el('aside', { class: 'drawer', id: 'drawer', role: 'dialog', 'aria-label': 'Reference layouts', hidden: true }, [
      el('header', { class: 'drawer__head' }, [el('h2', { text: 'Reference layouts' }), close]),
      el('div', { class: 'drawer__body' }, [
        el('section', { class: 'drawer__section' }, [
          el('p', { class: 'hint', text: 'Upload a layout and the tool measures its axes, baseline grid and type sizes. Best on type-driven work such as posters and editorial pages; photographs are not text and will confuse it.' }),
          zone, file, result,
        ]),
        el('section', { class: 'drawer__section' }, [el('h3', { text: 'Style library' }), libraryPanel.node]),
        el('section', { class: 'drawer__section' }, [el('h3', { text: 'Local model (optional)' }), modelPanel.node]),
      ]),
    ]);

    /* ---------- analysis ---------- */
    async function analyze(f) {
      if (busy || !f) return;
      busy = true;
      zone.disabled = true;
      zoneText.textContent = `Measuring ${f.name}…`;
      try {
        const ref = await G.ui.referenceLoader.analyzeFile(f);
        session.set(ref);
        store.patch({ showReference: true, showDetected: true });
        say(ref.analysis.blocks.length ? `Measured ${ref.analysis.blocks.length} text blocks` : 'Nothing could be measured in that image');
      } catch (err) {
        say(err.message);
      } finally {
        busy = false;
        zone.disabled = false;
        zoneText.textContent = 'Drop a poster or page here, or choose a file';
      }
    }
    zone.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { analyze(file.files[0]); file.value = ''; });
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
    zone.addEventListener('drop', (e) => analyze(e.dataTransfer.files[0]));

    /* ---------- result ---------- */
    const toggleButton = (label, key) => {
      const b = el('button', { type: 'button', class: 'btn', text: label });
      b.addEventListener('click', () => store.patch({ [key]: !store.get()[key] }));
      return { node: b, sync: (cfg) => b.setAttribute('aria-pressed', String(Boolean(cfg[key]))) };
    };
    const underlay = toggleButton('Underlay', 'showReference');
    const detected = toggleButton('Detected', 'showDetected');
    const opacity = el('input', { type: 'range', min: 0.05, max: 1, step: 0.05, 'aria-label': 'Underlay opacity' });
    opacity.addEventListener('input', () => store.patch({ referenceOpacity: Number(opacity.value) }));

    const designer = el('input', { type: 'text', list: 'designer-list', maxLength: 80, placeholder: 'Designer, e.g. Josef Müller-Brockmann', 'aria-label': 'Designer' });
    const titleInput = el('input', { type: 'text', maxLength: 120, placeholder: 'Title of the work', 'aria-label': 'Title' });
    const datalist = el('datalist', { id: 'designer-list' });
    const addBtn = el('button', { type: 'button', class: 'btn btn--primary', text: 'Add to library' });
    addBtn.addEventListener('click', () => {
      const ref = session.reference;
      if (!ref) return;
      try {
        const problem = library.add({ designer: designer.value, title: titleInput.value || ref.name.replace(/\.[^.]+$/, ''), analysis: ref.analysis, thumb: ref.thumb, semantic: ref.semantic });
        const d = library.get().designers.find((x) => x.id === G.library.slug(designer.value || 'Unassigned'));
        say(problem || `Added to ${d.name} — ${d.works.length} work${d.works.length === 1 ? ' now shapes' : 's now shape'} the profile`);
      } catch (err) {
        say(err.message);
      }
    });

    const suggestion = el('p', { class: 'hint' });
    const modelBox = el('div', { class: 'ref-model' });
    const askBtn = el('button', { type: 'button', class: 'btn', text: 'Describe with local model' });
    askBtn.addEventListener('click', async () => {
      const ref = session.reference;
      const s = G.localModel.settings();
      if (!ref || modelBusy) return;
      if (!G.assets.has(ref.assetId)) { say('Upload the image again to ask the model about it.'); return; }
      modelBusy = true;
      askBtn.disabled = true;
      askBtn.textContent = `Asking ${s.model}…`;
      try {
        const semantic = await G.localModel.describe({ endpoint: s.endpoint, model: s.model, imageBase64: G.ui.referenceLoader.modelImage(ref.assetId) });
        session.set({ ...ref, semantic });
        say('The local model described the layout');
      } catch (err) {
        say(err.message);
      } finally {
        modelBusy = false;
        askBtn.disabled = false;
        askBtn.textContent = 'Describe with local model';
      }
    });

    function renderResult() {
      const ref = session.reference;
      result.hidden = !ref;
      if (!ref) { result.replaceChildren(); return; }
      const a = ref.analysis;
      const body = a.clusters.find((c) => c.role === 'body');
      const thumb = el('img', { class: 'ref-thumb', alt: '', src: ref.thumb });

      const head = el('div', { class: 'ref-head' }, [
        thumb,
        el('div', {}, [
          el('strong', { text: ref.name }),
          el('p', { class: 'muted', text: `${a.width} × ${a.height} px${ref.scale < 1 ? ` (analysed at ${round(ref.scale * 100, 0)}% size)` : ''} · confidence ${pct(a.confidence)}` }),
        ]),
      ]);
      const warnings = a.warnings.length ? el('ul', { class: 'readout__notes' }, a.warnings.map((w) => el('li', { class: 'note note--warn', text: w }))) : null;

      const baseline = a.baseline
        ? `${a.baseline.step} px step · offset ${a.baseline.offset} px · ${a.baseline.onGrid} of ${a.baseline.lines} body lines on the grid${a.baseline.others.length ? ` · display type on it: ${a.baseline.others.reduce((s, o) => s + o.onGrid, 0)} of ${a.baseline.others.reduce((s, o) => s + o.of, 0)}` : ''}`
        : 'No repeating line spacing found.';
      const sizes = table(['role', 'size', 'leading', '× body', 'lines'], a.clusters.map((c) => [c.role, `${c.size}px`, c.leading ? `${c.leading}px (${c.leadingRatio}×)` : '—', c.ratioToBody, c.lines]));
      const axes = a.axes.length ? table(['axis', 'x px', 'of width', 'nearest line'], a.axes.map((x) => [x.side, x.x, pct(x.fraction), x.match.strength === 'none' ? `${x.match.label} (${x.match.deviation > 0 ? '+' : ''}${x.match.deviation}px, off)` : `${x.match.label} · ${x.match.strength} · ${x.match.deviation > 0 ? '+' : ''}${x.match.deviation}px`])) : el('p', { class: 'muted', text: 'No shared axes found.' });
      const ex = a.extremes;
      const margins = ex ? el('p', { class: 'muted', text: `Ink edges — left ${ex.left.x}px (${ex.left.match.label}${ex.left.match.strength === 'strong' ? ' ✓' : ''}), right ${ex.right.x}px (${ex.right.match.label}${ex.right.match.strength === 'strong' ? ' ✓' : ''}), top ${ex.top.y}px, bottom ${ex.bottom.y}px.` }) : null;

      const useCanvas = el('button', { type: 'button', class: 'btn btn--primary', text: 'Use as canvas' });
      useCanvas.addEventListener('click', () => { store.patch(canvasPatch(ref)); say('Canvas, unit and baseline set from the reference'); });

      const ranked = G.library.suggest(library.get(), G.styles.features(a));
      suggestion.textContent = ranked.best
        ? `Closest style: ${ranked.best.name} (${ranked.best.works} works, similarity ${pct(ranked.best.similarity)}). A hint only — check it before filing.`
        : 'No confident style match yet. Suggestions start once a designer has two or more works.';
      const useName = ranked.best ? el('button', { type: 'button', class: 'chip', text: `Use “${ranked.best.name}”` }) : null;
      if (useName) useName.addEventListener('click', () => { designer.value = ranked.best.name; });

      datalist.replaceChildren(...library.get().designers.map((d) => el('option', { value: d.name })));
      if (!titleInput.value) titleInput.value = ref.name.replace(/\.[^.]+$/, '');

      const sem = ref.semantic;
      modelBox.replaceChildren(...(sem ? [
        el('p', { text: sem.description || '—' }),
        el('p', { class: 'muted', text: `Typeface: ${sem.typeface.classification}${sem.typeface.candidates.length ? ` — resembles ${sem.typeface.candidates.join(', ')}` : ''} (${pct(sem.typeface.confidence)} sure)${sem.movement ? ` · ${sem.movement}` : ''}` }),
        el('div', { class: 'chips' }, sem.tags.map((t) => el('span', { class: 'chip chip--static', text: t }))),
        ...(sem.designerGuess ? [el('p', { class: 'hint', text: `The model guesses “${sem.designerGuess.name}” (${pct(sem.designerGuess.confidence)}). Models are unreliable at attribution — treat it as a lead, not a fact.` })] : []),
      ] : []));
      if (sem && sem.designerGuess) {
        const use = el('button', { type: 'button', class: 'chip', text: `Use “${sem.designerGuess.name}”` });
        use.addEventListener('click', () => { designer.value = sem.designerGuess.name; });
        modelBox.append(use);
      }

      result.replaceChildren(
        head, ...(warnings ? [warnings] : []),
        el('h4', { text: 'Baseline grid' }), el('p', { class: 'muted', text: baseline }),
        el('h4', { text: 'Type sizes' }), sizes,
        el('h4', { text: 'Axes' }), axes, ...(margins ? [margins] : []),
        ...(body ? [] : [el('p', { class: 'hint', text: 'No body-size text was identified.' })]),
        el('div', { class: 'actions' }, [useCanvas, underlay.node, detected.node]),
        el('label', { class: 'ef' }, [el('span', { text: 'Underlay opacity' }), opacity]),
        el('h4', { text: 'Add to the style library' }),
        el('div', { class: 'form' }, [designer, datalist, titleInput]),
        suggestion, ...(useName ? [useName] : []),
        el('div', { class: 'actions' }, [addBtn, askBtn]),
        modelBox,
      );
    }

    /* ---------- sync & lifecycle ---------- */
    session.onChange(renderResult);
    library.subscribe(renderResult);
    const open = () => { root.hidden = false; close.focus(); };
    const hide = () => { root.hidden = true; };
    close.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) hide(); });
    renderResult();

    return {
      node: root,
      toggle: () => (root.hidden ? open() : hide()),
      sync(cfg) {
        underlay.sync(cfg); detected.sync(cfg);
        if (document.activeElement !== opacity) opacity.value = cfg.referenceOpacity;
        libraryPanel.sync(cfg);
      },
    };
  }

  G.ui.createReferenceDrawer = createReferenceDrawer;
})();
