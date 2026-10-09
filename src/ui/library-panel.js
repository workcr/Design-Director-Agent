/* Style library list (designers → works → profile) and the local-model settings block. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};
  const { el } = G.ui;

  const pct = (v) => `${Math.round(v * 100)}%`;
  const safeImg = (src) => (typeof src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(src) ? el('img', { class: 'work__thumb', alt: '', src }) : el('span', { class: 'work__thumb work__thumb--empty' }));

  function downloadText(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function createLibraryPanel({ store, library, say }) {
    const summary = el('p', { class: 'muted' });
    const list = el('div', { class: 'designers' });
    const importInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    const exportBtn = el('button', { type: 'button', class: 'btn', text: 'Export library' });
    const importBtn = el('button', { type: 'button', class: 'btn', text: 'Import…' });
    const opened = new Set(); // designers the user has expanded, kept across re-renders

    exportBtn.addEventListener('click', () => {
      downloadText('style-library.json', library.exportJson(), 'application/json');
      say('Library exported');
    });
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const f = importInput.files[0];
      importInput.value = '';
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { say('That file is larger than 5 MB.'); return; }
      try {
        const before = G.library.counts(library.get());
        const problem = library.merge(JSON.parse(await f.text()));
        const after = G.library.counts(library.get());
        say(problem || `Imported ${after.works - before.works} new work${after.works - before.works === 1 ? '' : 's'}`);
      } catch (err) {
        say('That file is not a valid style library.');
      }
    });

    function applyStyle(d, profile) {
      const cfg = store.get();
      store.patch({ ...G.styles.styleToPatch(profile, { width: cfg.width, height: cfg.height, unit: cfg.unit }), styleId: d.id, showStyleAxes: true });
      say(`Applied the ${d.name} style`);
    }

    function render(cfg = store.get()) {
      const lib = library.get();
      const c = G.library.counts(lib);
      summary.textContent = c.works ? `${c.designers} designer${c.designers === 1 ? '' : 's'} · ${c.works} work${c.works === 1 ? '' : 's'}. Every work you add sharpens its designer's profile.` : 'Empty. Analyse a layout and add it under a designer to start learning their style.';
      list.replaceChildren(...lib.designers.map((d) => {
        const p = G.library.profileOf(lib, d.id);
        const active = cfg.styleId === d.id;
        const meter = el('span', { class: 'meter', title: `Profile confidence ${pct(p.confidence)}` }, [el('span')]);
        meter.firstChild.style.width = pct(p.confidence);
        const apply = el('button', { type: 'button', class: 'btn btn--primary', text: active ? 'Applied ✓' : 'Apply style' });
        apply.addEventListener('click', () => (active ? store.patch({ styleId: '' }) : applyStyle(d, p)));
        const removeD = el('button', { type: 'button', class: 'btn btn--danger', text: 'Remove designer' });
        removeD.addEventListener('click', () => {
          if (window.confirm(`Remove ${d.name} and their ${d.works.length} work${d.works.length === 1 ? '' : 's'} from the library?`)) { library.removeDesigner(d.id); if (store.get().styleId === d.id) store.patch({ styleId: '' }); }
        });
        const works = el('ul', { class: 'works' }, d.works.map((w) => {
          const x = el('button', { type: 'button', class: 'icon-btn', text: '×', 'aria-label': `Remove ${w.title}` });
          x.addEventListener('click', () => library.removeWork(w.id));
          return el('li', { class: 'work' }, [safeImg(w.thumb), el('div', {}, [el('strong', { text: w.title }), el('small', { text: `${w.analysis.width}×${w.analysis.height} · confidence ${pct(w.analysis.confidence)}${w.semantic && w.semantic.typeface.classification !== 'unknown' ? ` · ${w.semantic.typeface.classification}` : ''}` })]), x]);
        }));
        const details = el('details', { class: 'designer', open: active || opened.has(d.id) }, [
          el('summary', {}, [el('span', { text: d.name }), el('small', { text: `${d.works.length} work${d.works.length === 1 ? '' : 's'}` }), meter]),
          el('div', { class: 'designer__body' }, [
            el('ul', { class: 'signature' }, p.signature.map((s) => el('li', { text: s }))),
            ...(p.axes.length ? [el('div', { class: 'chips' }, p.axes.map((x) => el('span', { class: 'chip chip--static', text: `${x.label || pct(x.fraction)} ${x.side}` })))] : []),
            works, el('div', { class: 'actions' }, [apply, removeD]),
          ]),
        ]);
        details.addEventListener('toggle', () => { if (details.open) opened.add(d.id); else opened.delete(d.id); });
        return details;
      }));
    }

    library.subscribe(() => render());
    render();

    return {
      node: el('div', {}, [summary, list, el('div', { class: 'actions' }, [exportBtn, importBtn, importInput])]),
      sync: render,
    };
  }

  function createModelPanel({ say }) {
    const s0 = G.localModel.settings();
    const enable = el('input', { type: 'checkbox', id: 'lm-enable' });
    const endpoint = el('input', { type: 'text', value: s0.endpoint, 'aria-label': 'Model server address', spellcheck: false });
    const select = el('select', { 'aria-label': 'Model' });
    const refresh = el('button', { type: 'button', class: 'btn', text: 'Find models' });
    const status = el('p', { class: 'hint' });
    enable.checked = s0.enabled;

    async function load() {
      const cur = G.localModel.settings();
      try {
        G.localModel.assertLocal(cur.endpoint);
        status.textContent = 'Looking for models…';
        const all = await G.localModel.listModels(cur.endpoint);
        const usable = all.filter((m) => m.vision !== false); // hide models the server says cannot read images
        const names = usable.map((m) => m.name);
        select.replaceChildren(el('option', { value: '', text: usable.length ? 'Choose a vision model…' : 'No vision models installed' }), ...usable.map((m) => el('option', { value: m.name, text: m.vision ? `${m.name} · vision` : `${m.name} (unverified)` })));
        select.value = names.includes(cur.model) ? cur.model : '';
        const hidden = all.length - usable.length;
        status.textContent = usable.length
          ? `${usable.length} vision model${usable.length === 1 ? '' : 's'} found${hidden ? ` (${hidden} text-only model${hidden === 1 ? '' : 's'} hidden)` : ''}.`
          : all.length ? 'This server has models, but none can read images. Install a vision model, for example with “ollama pull qwen2.5vl”.' : 'The server answered but has no models.';
      } catch (err) {
        select.replaceChildren(el('option', { value: '', text: '—' }));
        status.textContent = err.message;
      }
    }

    enable.addEventListener('change', () => { G.localModel.save({ enabled: enable.checked }); if (enable.checked) load(); else status.textContent = 'Off. Measurements never need a model.'; });
    endpoint.addEventListener('change', () => { G.localModel.save({ endpoint: endpoint.value.trim() }); if (enable.checked) load(); });
    select.addEventListener('change', () => { G.localModel.save({ model: select.value }); say(select.value ? `Using ${select.value}` : 'No model selected'); });
    refresh.addEventListener('click', () => { enable.checked = true; G.localModel.save({ enabled: true, endpoint: endpoint.value.trim() }); load(); });
    if (s0.enabled) load(); else status.textContent = 'Off. Measurements never need a model.';

    return {
      node: el('div', { class: 'model' }, [
        el('p', { class: 'hint', text: 'A local vision model (through Ollama) can transcribe the text, label its roles and name the likely typeface family. It adds notes only — the measurements always come from the image analysis. Layouts are only ever sent to localhost.' }),
        el('label', { class: 'card__check', for: 'lm-enable' }, [enable, el('span', { text: 'Use a local model' })]),
        el('div', { class: 'form' }, [endpoint, select, refresh]), status,
      ]),
    };
  }

  G.ui.createLibraryPanel = createLibraryPanel;
  G.ui.createModelPanel = createModelPanel;
})();
