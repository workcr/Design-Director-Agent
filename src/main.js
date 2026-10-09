/* Wires store → model → scene → renderer / panel / readout. */
(function () {
  const G = globalThis.GridCalc;
  const $ = (sel) => document.querySelector(sel);

  const store = G.ui.createStore();
  const renderer = G.render.createRenderer($('#canvas-host'), $('#viewport'));
  const readout = G.ui.createReadout($('#readout'));
  const toast = $('#toast');
  let model = null;
  let scene = [];
  let toastTimer = 0;
  let savedGuides = null;

  const say = (message) => {
    toast.textContent = message;
    toast.dataset.show = 'true';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.dataset.show = 'false'; }, 2200);
  };

  const download = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const slug = () => `grid-${model.view.width}x${model.view.height}-u${model.unit}-d${model.cfg.divisions}`;

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };

  const actions = {
    async png() { download(`${slug()}.png`, await renderer.exportPng()); say('PNG exported at 1:1'); },
    svg() { download(`${slug()}.svg`, new Blob([G.exporters.toSvg(model, scene)], { type: 'image/svg+xml' })); say('SVG exported'); },
    json() { download(`${slug()}.json`, new Blob([JSON.stringify(G.exporters.toJson(model), null, 2)], { type: 'application/json' })); say('JSON exported'); },
    async css() { say((await copyText(G.exporters.toCss(model))) ? 'CSS tokens copied' : 'Copy failed — clipboard blocked'); },
    placements() {
      const json = G.exporters.toPlacementsJson(model);
      download(`${slug()}-placements.json`, new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
      say('Placements exported');
    },
    async brief() { say((await copyText(G.exporters.toBrief(model))) ? 'Agent brief copied' : 'Copy failed — clipboard blocked'); },
    guides() {
      const result = G.config.toggleGuides(store.get(), savedGuides);
      savedGuides = result.saved;
      store.patch(result.patch);
    },
    reset() { store.reset(); say('Reset to defaults'); },
  };

  const panel = G.ui.createPanel($('#controls'), store, actions);

  let frame = 0;
  const recompute = () => {
    frame = 0;
    try {
      const cfg = store.get();
      model = G.model.buildModel(cfg, renderer.measure);
      scene = G.scene.buildScene(model);
      renderer.show(model, scene);
      panel.update(model.cfg, model);
      readout.update(model);
      $('#guides-toggle').setAttribute('aria-pressed', String(G.config.guidesVisible(model.cfg)));
      $('#canvas-meta').textContent = `${model.view.width} × ${model.view.height} px · ${model.unit}px unit · D${model.cfg.divisions}`;
    } catch (err) {
      readout.fail(err);
      window.console.error(err);
    }
  };

  store.subscribe(() => { if (!frame) frame = window.requestAnimationFrame(recompute); });
  recompute();

  $('#guides-toggle').addEventListener('click', actions.guides);
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
    if (e.key.toLowerCase() === 'g' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) actions.guides();
  });

  $('#panel-toggle').addEventListener('click', (e) => {
    const app = $('.app');
    const closed = app.dataset.panel !== 'closed';
    app.dataset.panel = closed ? 'closed' : 'open';
    e.currentTarget.setAttribute('aria-expanded', String(!closed));
  });
})();
