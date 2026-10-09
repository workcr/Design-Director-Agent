/*
 * Optional local vision model through Ollama. Only a server on this computer is ever contacted,
 * so a layout never leaves the machine. Output goes through G.semantic.sanitize before use.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const KEY = 'grid-calculator.localmodel';
  const DEFAULTS = { enabled: false, endpoint: 'http://localhost:11434', model: '' };
  const TIMEOUT_MS = 240000;

  function settings() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      return { ...DEFAULTS, enabled: Boolean(saved.enabled), endpoint: typeof saved.endpoint === 'string' ? saved.endpoint : DEFAULTS.endpoint, model: typeof saved.model === 'string' ? saved.model.slice(0, 120) : '' };
    } catch (err) {
      return { ...DEFAULTS };
    }
  }

  function save(partial) {
    const next = { ...settings(), ...partial };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch (err) {
      /* settings just will not persist */
    }
    return next;
  }

  const assertLocal = (endpoint) => {
    if (!G.semantic.isLocalEndpoint(endpoint)) throw new Error('Only a model running on this computer (localhost) can be used, so your layouts never leave it.');
  };

  const friendly = (err, endpoint) => {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return new Error('The model took too long to answer. Try a smaller model.');
    if (err instanceof TypeError) return new Error(`Could not reach ${endpoint}. Is Ollama running? If this page is not served from localhost, Ollama must allow its origin (OLLAMA_ORIGINS).`);
    return err;
  };

  async function listModels(endpoint) {
    assertLocal(endpoint);
    try {
      const res = await fetch(new URL('/api/tags', endpoint), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`The model server answered ${res.status}.`);
      const body = await res.json();
      const names = (Array.isArray(body.models) ? body.models : []).map((m) => String(m.name)).filter(Boolean).sort();
      // ask the server what each model can do, so the picker can offer only models that can read images
      return Promise.all(names.map(async (name) => {
        try {
          const r = await fetch(new URL('/api/show', endpoint), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name }), signal: AbortSignal.timeout(6000) });
          const info = await r.json();
          return { name, vision: Array.isArray(info.capabilities) ? info.capabilities.includes('vision') : null };
        } catch (err) {
          return { name, vision: null }; // unknown: leave it selectable
        }
      }));
    } catch (err) {
      throw friendly(err, endpoint);
    }
  }

  async function describe({ endpoint, model, imageBase64 }) {
    assertLocal(endpoint);
    if (!model) throw new Error('Choose a model first.');
    try {
      const res = await fetch(new URL('/api/generate', endpoint), {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({ model, prompt: G.semantic.buildPrompt(), images: [imageBase64], stream: false, format: 'json', think: false, options: { temperature: 0.1, num_predict: 900 } }),
      });
      if (res.status === 404) throw new Error(`The model "${model}" is not installed on that server.`);
      if (!res.ok) throw new Error(`The model server answered ${res.status}.`);
      const body = await res.json();
      const result = G.semantic.sanitize(G.semantic.parseModelJson(body.response), { model, at: Date.now() });
      if (!result) throw new Error('The model answer could not be understood.');
      return result;
    } catch (err) {
      throw friendly(err, endpoint);
    }
  }

  G.localModel = { settings, save, listModels, describe, assertLocal };
})();
