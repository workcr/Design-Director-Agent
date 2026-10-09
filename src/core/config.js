/* Configuration: defaults, validation, themes and musical ratios. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./math.js');
  const { clamp } = G.math;

  /** Ratios carried over from the original designSystem.musicalScales. */
  const RATIOS = {
    unison: { label: 'Unison', ratio: 1 },
    minor2nd: { label: 'Minor 2nd · 16:15', ratio: 16 / 15 },
    major2nd: { label: 'Major 2nd · 10:9', ratio: 10 / 9 },
    minor3rd: { label: 'Minor 3rd · 6:5', ratio: 6 / 5 },
    majorThird: { label: 'Major 3rd · 5:4', ratio: 5 / 4 },
    perfectFourth: { label: 'Perfect 4th · 4:3', ratio: 4 / 3 },
    aug4th: { label: 'Aug. 4th · 45:32', ratio: 45 / 32 },
    perfectFifth: { label: 'Perfect 5th · 3:2', ratio: 3 / 2 },
    minor6th: { label: 'Minor 6th · 8:5', ratio: 8 / 5 },
    golden: { label: 'Golden · 1.618', ratio: (1 + Math.sqrt(5)) / 2 },
    major6th: { label: 'Major 6th · 5:3', ratio: 5 / 3 },
    octave: { label: 'Octave · 2:1', ratio: 2 },
  };

  const THEMES = {
    drafting: {
      label: 'Drafting dark',
      cBg: '#1d1d20', cGrid: '#8fa0b3', cBaseline: '#a7f7fa', cCanon: '#ff5a36',
      cBlock: '#ffffff', cColumn: '#6ea8ff', cText: '#e9e9ec', cPower: '#ffd166',
    },
    paper: {
      label: 'Paper',
      cBg: '#f4f1ea', cGrid: '#6b7280', cBaseline: '#0e7c86', cCanon: '#d9381e',
      cBlock: '#16161a', cColumn: '#2f5fd0', cText: '#16161a', cPower: '#a85d00',
    },
    blueprint: {
      label: 'Blueprint',
      cBg: '#0f2a52', cGrid: '#9ec5ff', cBaseline: '#ffffff', cCanon: '#ffd166',
      cBlock: '#ffffff', cColumn: '#7bdff2', cText: '#eaf3ff', cPower: '#ff9ecd',
    },
  };

  const PRESETS = {
    hd: { label: 'Full HD spread · 1920×1080', layout: 'spread', width: 1920, height: 1080 },
    wide: { label: 'Wide spread · 1440×900', layout: 'spread', width: 1440, height: 900 },
    hd720: { label: 'HD spread · 1280×720', layout: 'spread', width: 1280, height: 720 },
    a4: { label: 'A4 page @96dpi · 794×1123', layout: 'page', width: 794, height: 1123 },
    a5: { label: 'A5 page @96dpi · 559×794', layout: 'page', width: 559, height: 794 },
    book: { label: 'Book page 2:3 · 640×960', layout: 'page', width: 640, height: 960 },
  };

  const DEFAULTS = {
    // foundation
    unit: 8, layout: 'spread', width: 1920, height: 1080, fitCanvas: true,
    // canon
    divisions: 9, snapMode: 'nearest', blockMode: 'pages',
    // modular grid
    columns: 3, gutter: 2, rows: 1, rowGutter: 3,
    fitColumns: true, fitRows: true, fitAnchor: 'inner', moduleSnap: true,
    // typography
    fontFamily: 'Helvetica', baseSize: 16, lineHeight: 1.5, tighten: 0.07,
    scaleRatio: 'majorThird', stepsDown: 2, stepsUp: 6, roundSizes: true,
    baselineMode: 'leading', baselineCustom: 3, baselineOrigin: 'canvas', baselineScope: 'canvas',
    // power lines & anchors
    powerDepth: 3, powerBase2: true, powerBase3: true, powerBase5: false,
    powerMargin: 5, powerSnap: true, anchorMode: 'diagonal',
    showPower: true, showAnchors: true, showPowerLabels: true,
    showPowerDiagonals: false, showStripDiagonals: false,
    // placements
    showPlacements: false, placementTemplate: 'auto', showSlots: true, elements: [],
    // display
    showPixelGrid: true, majorEvery: 8, gridOpacity: 0.35,
    showBaseline: true, showCanon: true, showLadder: true, showPages: true,
    showBlocks: true, showIdeal: true, showColumns: true, showGutters: false,
    showLabels: true, labelFormat: 'both', showSpecimen: true, showOffGrid: true,
    lineWeight: 1, theme: 'drafting', zoom: 'fit',
    ...THEMES.drafting,
  };
  delete DEFAULTS.label;

  const BUILTIN_FONTS = ['Helvetica', 'Georgia', 'Courier', 'sans-serif', 'serif', 'monospace'];
  const FONT_ID = /^gc-font-[a-z0-9-]{1,48}$/;
  const ELEMENT_ROLES = ['headline', 'subhead', 'body', 'cta', 'legal', 'caption', 'logo', 'image'];
  const ASSET_ROLES = ['logo', 'image'];
  const WEIGHTS = ['300', '400', '500', '600', '700', '800'];
  const MAX_ELEMENTS = 24;

  /** Starting values per role. Sizes are steps on the type scale (0 = body). */
  const ROLE_DEFAULTS = {
    headline: { value: 'Your headline here', weight: '700', sizeStep: 4, spaceAfter: 1 },
    subhead: { value: 'A supporting line', weight: '500', sizeStep: 2, spaceAfter: 1 },
    body: { value: 'Body copy goes here. Replace it with the real text to see how it sets on the grid.', weight: '400', sizeStep: 0, spaceAfter: 1 },
    cta: { value: 'Call to action', weight: '700', sizeStep: 1 },
    legal: { value: 'Legal copy', weight: '400', sizeStep: -2 },
    caption: { value: 'Caption', weight: '400', sizeStep: -1 },
    logo: { value: '', fit: 'contain' },
    image: { value: '', fit: 'cover' },
  };

  const ELEMENT_BASE = {
    id: 'e1', role: 'body', value: '', font: 'inherit', fontLabel: '', weight: '400', sizeStep: 0, sizePx: 0,
    leading: 0, spaceBefore: 0, spaceAfter: 0, align: 'left', widthUnits: 0, autoFit: true,
    slot: 'auto', fit: 'cover', asset: null,
  };

  /** A complete element for `role`, with optional overrides. */
  const makeElement = (role, id, patch = {}) => ({ ...ELEMENT_BASE, ...ROLE_DEFAULTS[role], ...patch, role, id });

  const int = (v, lo, hi, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  };
  const text = (v, max) => String(v === undefined || v === null ? '' : v).slice(0, max);

  function sanitizeAsset(a) {
    if (!a || typeof a !== 'object') return null;
    const width = Number(a.width);
    const height = Number(a.height);
    if (!(width > 0 && height > 0) || width > 100000 || height > 100000) return null;
    return {
      id: text(a.id, 40).replace(/[^a-z0-9-]/gi, ''), name: text(a.name, 120),
      kind: a.kind === 'svg' ? 'svg' : 'bitmap', width, height,
    };
  }

  function sanitizeElement(raw, taken) {
    if (!raw || typeof raw !== 'object' || !ELEMENT_ROLES.includes(raw.role)) return null;
    const base = makeElement(raw.role, 'e1');
    let id = typeof raw.id === 'string' && /^[a-z0-9-]{1,24}$/.test(raw.id) ? raw.id : 'e1';
    for (let n = 2; taken.has(id); n++) id = `e${n}`;
    taken.add(id);
    const pick = (list, v, d) => (list.includes(String(v)) ? String(v) : d);
    const font = String(raw.font);
    return {
      id, role: raw.role, value: text(raw.value, 4000),
      font: font === 'inherit' || BUILTIN_FONTS.includes(font) || FONT_ID.test(font) ? font : 'inherit',
      fontLabel: text(raw.fontLabel, 80), weight: pick(WEIGHTS, raw.weight, base.weight),
      sizeStep: int(raw.sizeStep, -4, 12, base.sizeStep),
      sizePx: raw.sizePx === 0 ? 0 : int(raw.sizePx, 6, 400, 0),
      leading: int(raw.leading, 0, 48, 0), spaceBefore: int(raw.spaceBefore, 0, 12, 0), spaceAfter: int(raw.spaceAfter, 0, 12, 0),
      align: pick(['left', 'center', 'right'], raw.align, 'left'), widthUnits: int(raw.widthUnits, 0, 400, 0),
      autoFit: raw.autoFit === undefined ? true : Boolean(raw.autoFit),
      slot: typeof raw.slot === 'string' && /^[a-z0-9-]{1,24}$/.test(raw.slot) ? raw.slot : 'auto',
      fit: pick(['cover', 'contain'], raw.fit, base.fit),
      asset: ASSET_ROLES.includes(raw.role) ? sanitizeAsset(raw.asset) : null,
    };
  }

  function sanitizeElements(list) {
    if (!Array.isArray(list)) return [];
    const taken = new Set();
    return list.slice(0, MAX_ELEMENTS).map((e) => sanitizeElement(e, taken)).filter(Boolean);
  }

  const oneOf = (list) => ['enum', list];
  const RULES = {
    unit: ['int', 1, 64], width: ['int', 16, 10000], height: ['int', 16, 10000],
    layout: oneOf(['spread', 'page']), fitCanvas: ['bool'],
    divisions: ['int', 4, 96], snapMode: oneOf(['nearest', 'floor', 'ceil', 'none']),
    blockMode: oneOf(['pages', 'centered']),
    columns: ['int', 1, 24], gutter: ['int', 0, 16], rows: ['int', 1, 24], rowGutter: ['int', 0, 16],
    fitColumns: ['bool'], fitRows: ['bool'], moduleSnap: ['bool'],
    fitAnchor: oneOf(['inner', 'outer', 'center']),
    fontFamily: ['font'],
    baseSize: ['num', 6, 96], lineHeight: ['num', 1, 3], tighten: ['num', 0, 0.2],
    scaleRatio: oneOf(Object.keys(RATIOS)), stepsDown: ['int', 0, 4], stepsUp: ['int', 1, 9],
    roundSizes: ['bool'], baselineMode: oneOf(['leading', 'unit', 'custom']),
    baselineCustom: ['int', 1, 24], baselineOrigin: oneOf(['canvas', 'block']),
    baselineScope: oneOf(['canvas', 'blocks']),
    powerDepth: ['int', 1, 5], powerBase2: ['bool'], powerBase3: ['bool'], powerBase5: ['bool'],
    powerMargin: ['int', 0, 24], powerSnap: ['bool'], anchorMode: oneOf(['diagonal', 'all']),
    showPlacements: ['bool'], placementTemplate: ['id'], showSlots: ['bool'], elements: ['elements'],
    showPower: ['bool'], showAnchors: ['bool'], showPowerLabels: ['bool'],
    showPowerDiagonals: ['bool'], showStripDiagonals: ['bool'],
    showPixelGrid: ['bool'], majorEvery: ['int', 2, 32], gridOpacity: ['num', 0.05, 1],
    showBaseline: ['bool'], showCanon: ['bool'], showLadder: ['bool'], showPages: ['bool'],
    showBlocks: ['bool'], showIdeal: ['bool'], showColumns: ['bool'], showGutters: ['bool'],
    showLabels: ['bool'], labelFormat: oneOf(['px', 'units', 'both']),
    showSpecimen: ['bool'], showOffGrid: ['bool'], lineWeight: ['num', 0.5, 3],
    theme: oneOf(Object.keys(THEMES)), zoom: oneOf(['fit', '1', '0.5']),
    cBg: ['color'], cGrid: ['color'], cBaseline: ['color'], cCanon: ['color'],
    cBlock: ['color'], cColumn: ['color'], cText: ['color'], cPower: ['color'],
  };

  /** Returns a complete, clamped config. Unknown / invalid values fall back to defaults. */
  function normalize(input = {}) {
    const out = {};
    for (const key of Object.keys(DEFAULTS)) {
      const rule = RULES[key];
      const raw = input[key] === undefined ? DEFAULTS[key] : input[key];
      const [kind, a, b] = rule;
      if (kind === 'int' || kind === 'num') {
        const n = Number(raw);
        out[key] = Number.isFinite(n) ? clamp(kind === 'int' ? Math.round(n) : n, a, b) : DEFAULTS[key];
      } else if (kind === 'bool') out[key] = Boolean(raw);
      else if (kind === 'elements') out[key] = sanitizeElements(raw);
      else if (kind === 'font') out[key] = BUILTIN_FONTS.includes(String(raw)) || FONT_ID.test(String(raw)) ? String(raw) : DEFAULTS[key];
      else if (kind === 'id') out[key] = /^[a-z0-9-]{1,40}$/.test(String(raw)) ? String(raw) : DEFAULTS[key];
      else if (kind === 'enum') out[key] = a.includes(String(raw)) ? String(raw) : DEFAULTS[key];
      else out[key] = /^#[0-9a-f]{6}$/i.test(raw) ? raw : DEFAULTS[key];
    }
    return out;
  }

  /** Every overlay that draws lines or boxes (the specimen text is content, not a guide). */
  const GUIDE_KEYS = [
    'showPixelGrid', 'showBaseline', 'showPages', 'showCanon', 'showLadder', 'showIdeal',
    'showBlocks', 'showColumns', 'showGutters', 'showLabels',
    'showPower', 'showAnchors', 'showPowerLabels', 'showPowerDiagonals', 'showStripDiagonals',
  ];

  const guidesVisible = (cfg) => GUIDE_KEYS.some((k) => cfg[k]);

  /**
   * Master switch. If any guide is on, turns them all off and remembers the mix;
   * if all are off, restores the remembered mix (or the defaults).
   * Returns { patch, saved }.
   */
  function toggleGuides(cfg, saved) {
    const pick = (src) => Object.fromEntries(GUIDE_KEYS.map((k) => [k, src[k]]));
    if (guidesVisible(cfg)) {
      return { patch: Object.fromEntries(GUIDE_KEYS.map((k) => [k, false])), saved: pick(cfg) };
    }
    const restore = saved && GUIDE_KEYS.some((k) => saved[k]) ? saved : pick(DEFAULTS);
    return { patch: { ...restore }, saved };
  }

  G.config = {
    DEFAULTS, RULES, RATIOS, THEMES, PRESETS, BUILTIN_FONTS, FONT_ID, ELEMENT_ROLES, ASSET_ROLES, WEIGHTS, ROLE_DEFAULTS, MAX_ELEMENTS,
    makeElement, sanitizeElements, GUIDE_KEYS, guidesVisible, toggleGuides, normalize };
  if (typeof module !== 'undefined') module.exports = G.config;
})();
