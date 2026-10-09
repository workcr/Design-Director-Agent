/*
 * Declarative description of the control panel. Adding a parameter to the
 * tool = one line here (plus a rule in config.js).
 *
 * field.type: range | number | segmented | select | toggle | chip | color | custom | button
 * field.show(cfg) hides a field; field.patchFrom(value, cfg) returns extra patch keys.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const { RATIOS, THEMES, PRESETS } = G.config;
  const opts = (obj) => Object.entries(obj).map(([value, v]) => [value, v.label]);

  const chip = (key, label) => ({ key, label, type: 'chip' });
  const color = (key, label) => ({ key, label, type: 'color' });

  const SECTIONS = [
    {
      id: 'foundation', title: 'Foundation', open: true,
      fields: [
        { key: 'unit', label: 'Grid unit', type: 'range', min: 1, max: 32, step: 1, suffix: 'px', hint: 'Every edge in the system snaps to a multiple of this.' },
        { key: 'layout', label: 'Layout', type: 'segmented', options: [['spread', 'Spread'], ['page', 'Single page']] },
        {
          key: 'preset', label: 'Preset', type: 'select', virtual: true,
          options: [...opts(PRESETS), ['custom', 'Custom size']],
          valueFrom: (c) => Object.entries(PRESETS).find(([, p]) => p.layout === c.layout && p.width === c.width && p.height === c.height)?.[0] || 'custom',
          patchFrom: (v) => (PRESETS[v] ? { layout: PRESETS[v].layout, width: PRESETS[v].width, height: PRESETS[v].height } : {}),
        },
        { key: 'width', label: 'Width', type: 'number', min: 16, max: 10000, step: 8, suffix: 'px' },
        { key: 'height', label: 'Height', type: 'number', min: 16, max: 10000, step: 8, suffix: 'px' },
        { key: 'fitCanvas', label: 'Snap canvas to grid', type: 'toggle', hint: 'Rounds the canvas so pages are a whole number of units.' },
      ],
    },
    {
      id: 'canon', title: 'Villard canon', open: true,
      fields: [
        { key: 'divisions', label: 'Canon division', type: 'range', min: 4, max: 36, step: 1, hint: 'Top margin = height ÷ D, inner = page width ÷ D. D = 9 is the classic canon.' },
        { key: 'perfect', label: 'Exact divisions', type: 'custom', hint: 'Divisions where every margin lands on the grid with no rounding.' },
        { key: 'aligned', label: 'On power lines', type: 'custom', hint: 'Divisions whose work-area edges coincide with a power line — the two systems then agree.' },
        { key: 'snapMode', label: 'Snap margins', type: 'segmented', options: [['nearest', 'Nearest'], ['floor', 'Down'], ['ceil', 'Up'], ['none', 'Off']] },
        { key: 'blockMode', label: 'Work area', type: 'segmented', options: [['pages', 'Per page'], ['centered', 'Centered']], show: (c) => c.layout === 'spread' },
      ],
    },
    {
      id: 'power', title: 'Power lines & anchors', open: true,
      fields: [
        chip('showPower', 'Power lines'), chip('showAnchors', 'Anchors'), chip('showPowerLabels', 'Fractions'),
        chip('showPowerDiagonals', 'Diagonals'), chip('showStripDiagonals', 'Strips'),
        { key: 'powerDepth', label: 'Depth', type: 'range', min: 1, max: 5, step: 1, hint: 'Each step halves the strip next to the edge: 1 → ½ ⅓ · 2 → ¼ ⅙ · 3 → ⅛ 1/12 · 4 → 1/16 1/24.' },
        chip('powerBase2', '½ series'), chip('powerBase3', '⅓ series'), chip('powerBase5', '⅕ series'),
        { key: 'anchorMode', label: 'Anchor points', type: 'segmented', options: [['diagonal', 'On diagonals'], ['all', 'Every crossing']], hint: 'Diagonal anchors sit where a power line meets a canvas or half-canvas diagonal.' },
        { key: 'powerMargin', label: 'Stop near the edge', type: 'range', min: 0, max: 24, step: 1, suffix: 'u', hint: 'Lines closer than this to an edge are dropped (the reference stops at 40–100px).' },
        { key: 'powerSnap', label: 'Snap lines to grid', type: 'toggle' },
        { key: 'powerTable', label: 'Lines', type: 'custom' },
      ],
    },
    {
      id: 'placement', title: 'Placements', open: true,
      fields: [
        chip('showPlacements', 'Preview on canvas'), chip('showSlots', 'Slot frames'),
        { key: 'placementPicker', label: 'Template', type: 'custom', hint: 'Roles snapped to power lines for this canvas shape. Export the data or a plain-language brief from the Export section.' },
        { key: 'elements', label: 'Elements', type: 'custom' },
      ],
    },
    {
      id: 'grid', title: 'Modular grid', open: true,
      fields: [
        { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 12, step: 1 },
        { key: 'gutter', label: 'Column gutter', type: 'range', min: 0, max: 8, step: 1, suffix: 'u' },
        { key: 'rows', label: 'Rows', type: 'range', min: 1, max: 12, step: 1 },
        { key: 'rowGutter', label: 'Row gutter', type: 'range', min: 0, max: 8, step: 1, suffix: 'u', show: (c) => c.rows > 1 },
        { key: 'fitColumns', label: 'Whole-unit columns', type: 'toggle', hint: 'Leftover width goes back to the margin, never into a column.' },
        { key: 'fitRows', label: 'Whole-unit rows', type: 'toggle', show: (c) => c.rows > 1 },
        { key: 'moduleSnap', label: 'Rows in whole lines', type: 'toggle', show: (c) => c.rows > 1 && c.fitRows, hint: 'Module height is a multiple of the baseline step.' },
        { key: 'fitAnchor', label: 'Leftover goes to', type: 'segmented', options: [['inner', 'Outer margin'], ['outer', 'Inner margin'], ['center', 'Both sides']], show: (c) => c.fitColumns, hint: 'Where the unused width lands.' },
      ],
    },
    {
      id: 'type', title: 'Typography', open: false,
      fields: [
        { key: 'fontFamily', label: 'Typeface', type: 'select', options: () => [...G.fonts.BUILTIN_OPTIONS, ...G.fonts.list().map((f) => [f.id, f.name])], hint: 'Upload fonts under Placements → Elements.' },
        { key: 'baseSize', label: 'Body size', type: 'range', min: 8, max: 32, step: 1, suffix: 'px' },
        { key: 'lineHeight', label: 'Body line height', type: 'range', min: 1, max: 2, step: 0.05 },
        { key: 'tighten', label: 'Heading tightening', type: 'range', min: 0, max: 0.15, step: 0.01, hint: 'Line height lost per scale step.' },
        { key: 'scaleRatio', label: 'Scale ratio', type: 'select', options: opts(RATIOS) },
        { key: 'stepsDown', label: 'Steps below body', type: 'range', min: 0, max: 4, step: 1 },
        { key: 'stepsUp', label: 'Steps above body', type: 'range', min: 1, max: 9, step: 1 },
        { key: 'roundSizes', label: 'Whole-pixel font sizes', type: 'toggle' },
        { key: 'baselineMode', label: 'Baseline step', type: 'segmented', options: [['leading', 'Body leading'], ['unit', 'Grid unit'], ['custom', 'Custom']] },
        { key: 'baselineCustom', label: 'Custom step', type: 'range', min: 1, max: 12, step: 1, suffix: 'u', show: (c) => c.baselineMode === 'custom' },
        { key: 'baselineOrigin', label: 'Baseline starts at', type: 'segmented', options: [['canvas', 'Canvas top'], ['block', 'Work area']] },
        { key: 'baselineScope', label: 'Baseline lines', type: 'segmented', options: [['canvas', 'Whole canvas'], ['blocks', 'Work areas']] },
        { key: 'typescale', label: 'Type scale', type: 'custom' },
      ],
    },
    {
      id: 'display', title: 'Display', open: false,
      fields: [
        chip('showPixelGrid', 'Unit grid'), chip('showBaseline', 'Baselines'), chip('showPages', 'Pages'),
        chip('showCanon', 'Canon lines'), chip('showLadder', 'Ladder'), chip('showIdeal', 'Ideal box'),
        chip('showBlocks', 'Work areas'), chip('showColumns', 'Columns'), chip('showGutters', 'Gutters'),
        chip('showLabels', 'Measures'), chip('showSpecimen', 'Specimen'), chip('showOffGrid', 'Flag off-grid'),
        { key: 'majorEvery', label: 'Major line every', type: 'range', min: 2, max: 32, step: 1, suffix: 'u' },
        { key: 'gridOpacity', label: 'Grid opacity', type: 'range', min: 0.05, max: 1, step: 0.05 },
        { key: 'lineWeight', label: 'Line weight', type: 'range', min: 0.5, max: 3, step: 0.25, suffix: 'px' },
        { key: 'labelFormat', label: 'Measures in', type: 'segmented', options: [['px', 'px'], ['units', 'Units'], ['both', 'Both']], show: (c) => c.showLabels },
        { key: 'zoom', label: 'Zoom', type: 'segmented', options: [['fit', 'Fit'], ['1', '100%'], ['0.5', '50%']] },
      ],
    },
    {
      id: 'colour', title: 'Colour', open: false,
      fields: [
        { key: 'theme', label: 'Theme', type: 'select', options: opts(THEMES), patchFrom: (v) => ({ ...THEMES[v], label: undefined }) },
        color('cBg', 'Background'), color('cGrid', 'Unit grid'), color('cBaseline', 'Baseline'),
        color('cCanon', 'Canon'), color('cPower', 'Power lines'), color('cBlock', 'Work area'), color('cColumn', 'Columns'), color('cText', 'Text'),
      ],
    },
    {
      id: 'export', title: 'Export', open: false,
      fields: [
        { key: 'exportPng', label: 'PNG at 1:1', type: 'button', action: 'png' },
        { key: 'exportSvg', label: 'SVG', type: 'button', action: 'svg' },
        { key: 'exportCss', label: 'Copy CSS tokens', type: 'button', action: 'css' },
        { key: 'exportJson', label: 'Download JSON', type: 'button', action: 'json' },
        { key: 'exportPlacements', label: 'Placements JSON', type: 'button', action: 'placements' },
        { key: 'exportBrief', label: 'Copy agent brief', type: 'button', action: 'brief' },
        { key: 'reset', label: 'Reset all', type: 'button', action: 'reset', variant: 'danger' },
      ],
    },
  ];

  G.ui.SECTIONS = SECTIONS;
})();
