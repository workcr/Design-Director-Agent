/* Tiny immutable store with localStorage persistence. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const STORAGE_KEY = 'grid-calculator.v2';

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function createStore() {
    const { normalize, DEFAULTS } = G.config;
    let state = normalize(load());
    let saveTimer = 0;
    const subscribers = new Set();

    const persist = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
          /* storage unavailable (private mode) — the tool still works */
        }
      }, 250);
    };

    const commit = (next) => {
      state = normalize(next);
      subscribers.forEach((fn) => fn(state));
      persist();
    };

    return {
      get: () => state,
      patch: (partial) => commit({ ...state, ...partial }),
      reset: () => commit({ ...DEFAULTS }),
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    };
  }

  G.ui.createStore = createStore;
})();
