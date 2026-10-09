/*
 * Font registry. Built-in stacks plus fonts the user uploads (registered by the UI
 * once the FontFace has loaded). Core code only ever asks for `stack(id)`, so it
 * stays free of DOM dependencies and can be tested in Node.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./config.js');
  const { BUILTIN_FONTS, FONT_ID } = G.config;

  const STACKS = {
    Helvetica: 'Helvetica, Arial, sans-serif',
    Georgia: 'Georgia, serif',
    Courier: '"Courier New", Courier, monospace',
    'sans-serif': 'sans-serif',
    serif: 'serif',
    monospace: 'monospace',
  };
  const BUILTIN_OPTIONS = [['Helvetica', 'Helvetica / Arial'], ['Georgia', 'Georgia'], ['Courier', 'Courier'], ['sans-serif', 'System sans'], ['serif', 'System serif'], ['monospace', 'System mono']];

  const custom = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  const slug = (name) => String(name).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'font';
  /** Same file name → same id, so elements re-link automatically after a reload and re-upload. */
  const idFor = (name) => `gc-font-${slug(name)}`;

  const isBuiltin = (id) => BUILTIN_FONTS.includes(id);
  const isFontId = (id) => isBuiltin(id) || FONT_ID.test(String(id));
  const has = (id) => isBuiltin(id) || custom.has(id);

  const stack = (id) => (isBuiltin(id) ? STACKS[id] : custom.has(id) ? `"${id}", sans-serif` : STACKS['sans-serif']);

  G.fonts = {
    STACKS, BUILTIN_OPTIONS, slug, idFor, isBuiltin, isFontId, has, stack,
    register(font) { custom.set(font.id, { id: font.id, name: font.name }); notify(); },
    unregister(id) { custom.delete(id); notify(); },
    list: () => [...custom.values()],
    label: (id) => (custom.has(id) ? custom.get(id).name : id),
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  if (typeof module !== 'undefined') module.exports = G.fonts;
})();
