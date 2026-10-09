/* Persists the style library in localStorage and notifies listeners. Everything read back is re-validated. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const KEY = 'grid-calculator.library.v1';

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? G.library.sanitizeLibrary(JSON.parse(raw)) : G.library.emptyLibrary();
    } catch (err) {
      return G.library.emptyLibrary();
    }
  }

  function createLibraryStore() {
    let lib = load();
    const subscribers = new Set();

    /** Returns a message when the browser could not store the library (the session copy still works). */
    const commit = (next) => {
      lib = next;
      let problem = null;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(lib));
      } catch (err) {
        problem = 'Browser storage is full or unavailable — the library is kept for this session only. Export it to keep a copy.';
      }
      subscribers.forEach((fn) => fn(lib));
      return problem;
    };

    return {
      get: () => lib,
      add: (input) => commit(G.library.addWork(lib, input)),
      removeWork: (id) => commit(G.library.removeWork(lib, id)),
      removeDesigner: (id) => commit(G.library.removeDesigner(lib, id)),
      merge: (incoming) => commit(G.library.mergeLibraries(lib, incoming)),
      exportJson: () => JSON.stringify(lib, null, 2),
      subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    };
  }

  G.ui.createLibraryStore = createLibraryStore;
})();
