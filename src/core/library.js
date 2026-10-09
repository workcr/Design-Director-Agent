/*
 * Style library data layer: designers → works → measured analyses. Pure and immutable (every
 * function returns a new library) so it can be tested without a browser; persistence lives in the
 * UI. Anything coming from storage or an imported file is rebuilt through `sanitizeLibrary`:
 * fields are whitelisted and clamped, and features are always recomputed from the analysis.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') { require('./math.js'); require('./styles.js'); }
  const { clamp } = G.math;

  const LIMITS = { designers: 200, works: 500, name: 80, title: 120, thumb: 24000, blocks: 400, clusters: 40, axes: 80 };
  const ALIGNS = ['left', 'right', 'center', 'justified', 'ragged', 'single'];
  const ROLES = ['display', 'heading', 'body', 'caption', 'micro'];
  const SIDES = ['left', 'right', 'center'];
  const STRENGTHS = ['strong', 'near', 'none'];

  const num = (v, lo, hi, d = null) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
  const str = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  const pick = (list, v, d) => (list.includes(v) ? v : d);

  const slug = (name) => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unassigned';

  const emptyLibrary = () => ({ version: 1, designers: [] });

  const sanitizeMatch = (m) => (m && typeof m === 'object' ? {
    label: str(m.label, 12), pos: num(m.pos, -1e6, 1e6, 0), deviation: num(m.deviation, -1e6, 1e6, 0), deviationPct: num(m.deviationPct, -1000, 1000, 0),
    chance: num(m.chance, 0, 1, 1), strength: pick(STRENGTHS, m.strength, 'none'),
  } : { label: '', pos: 0, deviation: 0, deviationPct: 0, chance: 1, strength: 'none' });

  /** Whitelists and clamps an analysis. Doubles as the compaction step (fragments and baselines are dropped). */
  function sanitizeAnalysis(a) {
    if (!a || typeof a !== 'object') return null;
    const width = num(a.width, 1, 100000);
    const height = num(a.height, 1, 100000);
    if (!width || !height) return null;
    const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
    const edge = (e, key) => (e && typeof e === 'object' ? { [key]: num(e[key], -1e6, 1e6, 0), fraction: num(e.fraction, -10, 10, 0), match: sanitizeMatch(e.match) } : null);
    const ex = a.extremes && typeof a.extremes === 'object' ? { left: edge(a.extremes.left, 'x'), right: edge(a.extremes.right, 'x'), top: edge(a.extremes.top, 'y'), bottom: edge(a.extremes.bottom, 'y') } : null;
    const b = a.baseline && typeof a.baseline === 'object' ? a.baseline : null;
    return {
      version: 1, width, height, ratio: num(a.ratio, 0, 100, width / height), coverage: num(a.coverage, 0, 1, 0), confidence: num(a.confidence, 0, 1, 0),
      warnings: arr(a.warnings, 10).map((w) => str(w, 200)),
      blocks: arr(a.blocks, LIMITS.blocks).map((k, i) => ({
        id: num(k.id, 0, 1e6, i), lines: num(k.lines, 1, 1e4, 1), align: pick(ALIGNS, k.align, 'single'), size: num(k.size, 0, 1e5, 0), ascent: num(k.ascent, 0, 1e5, 0),
        xHeight: num(k.xHeight, 0, 1e5, 0), leading: num(k.leading, 0, 1e5), leadingRatio: num(k.leadingRatio, 0, 50), left: num(k.left, 0, 1e5, 0), right: num(k.right, 0, 1e5, 0),
        top: num(k.top, 0, 1e5, 0), bottom: num(k.bottom, 0, 1e5, 0), polarity: k.polarity === 'light' ? 'light' : 'dark', allCaps: Boolean(k.allCaps),
      })),
      clusters: arr(a.clusters, LIMITS.clusters).map((c, i) => ({
        id: num(c.id, 0, 1e6, i), size: num(c.size, 0, 1e5, 0), ascent: num(c.ascent, 0, 1e5, 0), xHeight: num(c.xHeight, 0, 1e5, 0),
        blocks: arr(c.blocks, LIMITS.blocks).map((x) => num(x, 0, 1e6, 0)), lines: num(c.lines, 0, 1e5, 0), leading: num(c.leading, 0, 1e5), leadingRatio: num(c.leadingRatio, 0, 50),
        ratioToBody: num(c.ratioToBody, 0, 1e4, 1), role: pick(ROLES, c.role, 'body'),
      })),
      baseline: b ? {
        step: num(b.step, 0, 1e5, 0), offset: num(b.offset, 0, 1e5, 0), lines: num(b.lines, 0, 1e5, 0), onGrid: num(b.onGrid, 0, 1e5, 0),
        confidence: num(b.confidence, 0, 1, 0), sizeRatio: num(b.sizeRatio, 0, 100, 0),
      } : null,
      axes: arr(a.axes, LIMITS.axes).map((x) => ({
        side: pick(SIDES, x.side, 'left'), x: num(x.x, -1e6, 1e6, 0), fraction: num(x.fraction, -10, 10, 0), fragments: num(x.fragments, 0, 1e5, 0),
        blocks: num(x.blocks, 0, 1e5, 0), match: sanitizeMatch(x.match),
      })),
      extremes: ex && ex.left && ex.right && ex.top && ex.bottom ? ex : null,
      micro: a.micro && typeof a.micro === 'object' ? { fragments: num(a.micro.fragments, 0, 1e5, 0), left: num(a.micro.left, 0, 1e6, 0), right: num(a.micro.right, 0, 1e6, 0), baseline: num(a.micro.baseline, 0, 1e6, 0) } : null,
    };
  }

  const sanitizeThumb = (t) => (typeof t === 'string' && t.length <= LIMITS.thumb && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t) ? t : '');

  function sanitizeSemantic(s) {
    return typeof G.semantic !== 'undefined' && G.semantic.sanitize ? G.semantic.sanitize(s) : null;
  }

  function sanitizeWork(w, idx) {
    const analysis = sanitizeAnalysis(w && w.analysis);
    if (!analysis || !analysis.clusters.length) return null;
    return {
      id: /^[a-z0-9-]{1,40}$/.test(String(w.id)) ? String(w.id) : `w-import-${idx}`, title: str(w.title, LIMITS.title) || 'Untitled',
      addedAt: num(w.addedAt, 0, 8.64e15, 0), analysis, features: G.styles.features(analysis), thumb: sanitizeThumb(w.thumb),
      semantic: w.semantic ? sanitizeSemantic(w.semantic) : null,
    };
  }

  function sanitizeLibrary(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.designers)) return emptyLibrary();
    const seen = new Set();
    const designers = [];
    raw.designers.slice(0, LIMITS.designers).forEach((d) => {
      const name = str(d && d.name, LIMITS.name).trim();
      if (!name) return;
      const id = slug(name);
      if (seen.has(id)) return;
      seen.add(id);
      const used = new Set();
      const works = (Array.isArray(d.works) ? d.works : []).slice(0, LIMITS.works).map(sanitizeWork).filter(Boolean)
        .map((w) => { let wid = w.id; for (let n = 2; used.has(wid); n++) wid = `${w.id}-${n}`; used.add(wid); return { ...w, id: wid }; });
      designers.push({ id, name, works });
    });
    return { version: 1, designers };
  }

  /**
   * Adds a work under a designer (creating the designer if new). `meta` supplies `id` and `now` so
   * tests (and imports) stay deterministic.
   */
  function addWork(lib, input, meta = {}) {
    const name = str(input.designer, LIMITS.name).trim() || 'Unassigned';
    const analysis = sanitizeAnalysis(input.analysis);
    if (!analysis || !analysis.clusters.length) throw new Error('Nothing was measured in this layout, so there is nothing to learn from it.');
    const id = slug(name);
    const existing = lib.designers.find((d) => d.id === id);
    if (!existing && lib.designers.length >= LIMITS.designers) throw new Error(`The library holds up to ${LIMITS.designers} designers.`);
    if (existing && existing.works.length >= LIMITS.works) throw new Error(`A designer can hold up to ${LIMITS.works} works.`);
    const work = {
      id: meta.id || `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: str(input.title, LIMITS.title).trim() || 'Untitled', addedAt: meta.now || Date.now(), analysis,
      features: G.styles.features(analysis), thumb: sanitizeThumb(input.thumb), semantic: input.semantic ? sanitizeSemantic(input.semantic) : null,
    };
    const designers = existing
      ? lib.designers.map((d) => (d.id === id ? { ...d, works: [...d.works, work] } : d))
      : [...lib.designers, { id, name, works: [work] }];
    return { ...lib, designers };
  }

  const removeWork = (lib, workId) => ({ ...lib, designers: lib.designers.map((d) => ({ ...d, works: d.works.filter((w) => w.id !== workId) })).filter((d) => d.works.length) });
  const removeDesigner = (lib, id) => ({ ...lib, designers: lib.designers.filter((d) => d.id !== id) });

  function profileOf(lib, designerId) {
    const d = lib.designers.find((x) => x.id === designerId);
    return d ? { designer: d, ...G.styles.buildProfile(d.works.map((w) => w.features)) } : null;
  }

  const suggest = (lib, features) => G.styles.rank(lib.designers, features);

  /** Everything the tool needs to draw and export an applied style. */
  function styleContext(lib, designerId) {
    const p = profileOf(lib, designerId);
    return p ? { id: designerId, name: p.designer.name, works: p.works, confidence: p.confidence, signature: p.signature, axes: G.styles.styleAxes(p), profile: p } : null;
  }

  /** Merges `incoming` into `lib`: designers by id, works by id (existing works win). */
  function mergeLibraries(lib, incoming) {
    const clean = sanitizeLibrary(incoming);
    let out = lib;
    clean.designers.forEach((d) => {
      d.works.forEach((w) => {
        const have = out.designers.find((x) => x.id === d.id);
        if (have && have.works.some((x) => x.id === w.id)) return;
        out = addWork(out, { designer: d.name, title: w.title, analysis: w.analysis, thumb: w.thumb, semantic: w.semantic }, { id: w.id, now: w.addedAt });
      });
    });
    return out;
  }

  const counts = (lib) => ({ designers: lib.designers.length, works: lib.designers.reduce((s, d) => s + d.works.length, 0) });

  G.library = { LIMITS, slug, emptyLibrary, sanitizeAnalysis, sanitizeLibrary, addWork, removeWork, removeDesigner, profileOf, suggest, styleContext, mergeLibraries, counts };
  if (typeof module !== 'undefined') module.exports = G.library;
})();
