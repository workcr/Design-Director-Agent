/*
 * Anchor placement: turns the power-line field into concrete, role-based
 * suggestions — where a headline, body copy, logo, call to action, image
 * frame or focal point can go on this canvas.
 *
 * Every box edge is a *fraction token* ("1/3", "m", "11/12"…) that is resolved
 * against the live power lines, so placements always land on a line when the
 * field is deep enough, and on the unit grid either way. Edges that cannot
 * land on a power line (too little depth) are flagged `onPowerLine: false`.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') { require('./math.js'); require('./powerlines.js'); }
  const { toUnits, EPS } = G.math;
  const { snapPosition, onPrimaryDiagonal } = G.powerlines;

  const MARGIN_TARGET = 1 / 12; // "m" = the available line nearest 1/12 (but never past 1/4)
  const MARGIN_MAX = 0.25;

  const orientationOf = ({ width, height }) => {
    const r = width / height;
    return r >= 1.15 ? 'landscape' : r <= 0.87 ? 'portrait' : 'square';
  };

  const T = (id, orientation, name, note, items) => ({ id, orientation, name, note, items });
  const I = (role, box, note, anchor = 'top-left') => ({ role, box, note, anchor });

  /** Boxes are [left, top, right, bottom] fraction tokens. "m" / "M" are the near / far margin lines. */
  const TEMPLATES = [
    T('landscape-split', 'landscape', 'Split · image right', 'Text column on the left third, full-height image on the right half.', [
      I('image', ['1/2', '0', '1', '1'], 'Full-height image filling the right half.'),
      I('logo', ['m', 'm', '1/4', '1/6'], 'Brand mark at the top-left margin intersection.'),
      I('headline', ['m', '1/4', '1/3', '1/2'], 'Starts on the 1/4 line at the left margin.'),
      I('body', ['m', '1/2', '1/3', '3/4'], 'Body copy under the headline, same left edge.'),
      I('cta', ['m', '5/6', '1/3', 'M'], 'Call to action on the 5/6 line.'),
    ]),
    T('landscape-overlay', 'landscape', 'Hero overlay', 'Full-bleed image with the headline in the lower-left two thirds.', [
      I('image', ['0', '0', '1', '1'], 'Full-bleed background image.'),
      I('logo', ['m', 'm', '1/4', '1/6'], 'Brand mark at the top-left margin intersection.'),
      I('headline', ['m', '1/2', '2/3', '3/4'], 'Large headline from the horizontal centre line down.'),
      I('cta', ['m', '5/6', '1/3', 'M'], 'Call to action on the 5/6 line.'),
      I('caption', ['2/3', '5/6', 'M', 'M'], 'Credit or caption at the bottom right.', 'bottom-right'),
    ]),
    T('landscape-thirds', 'landscape', 'Editorial thirds', 'Three columns: a wide headline over two text columns, image top right.', [
      I('logo', ['m', 'm', '1/3', '1/6'], 'Brand mark at the top-left margin intersection.'),
      I('headline', ['m', '1/6', '2/3', '1/2'], 'Spans the first two thirds.'),
      I('image', ['2/3', 'm', 'M', '3/4'], 'Image in the last third, hanging from the top margin.'),
      I('body', ['m', '1/2', '1/3', 'M'], 'First text column.'),
      I('body-2', ['1/3', '1/2', '2/3', 'M'], 'Second text column.'),
      I('caption', ['2/3', '3/4', 'M', 'M'], 'Caption under the image.'),
    ]),
    T('portrait-stack-top', 'portrait', 'Stack · image on top', 'Image over the top half, headline on the 2/3 line, body and CTA below.', [
      I('image', ['0', '0', '1', '1/2'], 'Image across the top half.'),
      I('logo', ['m', 'm', '1/3', '1/6'], 'Brand mark over the image, top-left margin.'),
      I('headline', ['m', '2/3', 'M', '5/6'], 'Headline on the 2/3 line.'),
      I('body', ['m', '5/6', '2/3', 'M'], 'Body copy under the headline.'),
      I('cta', ['2/3', '5/6', 'M', 'M'], 'Call to action at the bottom-right anchor.', 'bottom-right'),
    ]),
    T('portrait-overlay', 'portrait', 'Full-bleed · lower third', 'Full-bleed image with headline and CTA in the lower third.', [
      I('image', ['0', '0', '1', '1'], 'Full-bleed background image.'),
      I('logo', ['m', 'm', '1/3', '1/6'], 'Brand mark at the top-left margin intersection.'),
      I('headline', ['m', '2/3', 'M', '5/6'], 'Headline on the 2/3 line.'),
      I('cta', ['m', '5/6', '1/2', 'M'], 'Call to action under the headline.'),
    ]),
    T('portrait-framed', 'portrait', 'Framed image', 'Image inside the margins, headline and body beneath.', [
      I('image', ['m', 'm', 'M', '2/3'], 'Image inside the margin box.'),
      I('headline', ['m', '2/3', 'M', '5/6'], 'Headline on the 2/3 line.'),
      I('body', ['m', '5/6', 'M', 'M'], 'Body copy at the foot of the page.'),
    ]),
    T('square-focus', 'square', 'Centred focus', 'Full-bleed image; headline top-left, call to action bottom-left.', [
      I('image', ['0', '0', '1', '1'], 'Full-bleed background image.'),
      I('headline', ['m', 'm', '2/3', '1/3'], 'Headline from the top-left margin intersection.'),
      I('cta', ['m', '5/6', '1/2', 'M'], 'Call to action on the 5/6 line.'),
    ]),
    T('square-halves', 'square', 'Half and half', 'Image on the left half, text stacked on the right.', [
      I('image', ['0', '0', '1/2', '1'], 'Full-height image on the left half.'),
      I('logo', ['2/3', 'm', 'M', '1/6'], 'Brand mark at the top of the text half.'),
      I('headline', ['1/2', '1/4', 'M', '1/2'], 'Starts on the 1/4 line.'),
      I('body', ['1/2', '1/2', 'M', '3/4'], 'Body copy under the headline.'),
      I('cta', ['1/2', '5/6', 'M', 'M'], 'Call to action on the 5/6 line.'),
    ]),
  ];

  const FOCAL = {
    landscape: [['2/3', '1/3', 'Subject right of centre, text on the left.'], ['1/3', '1/3', 'Mirror option: subject left, text right.'], ['2/3', '2/3', 'Lower right for a grounded subject.'], ['1/3', '2/3', 'Lower left.']],
    portrait: [['1/2', '1/3', 'Centred subject on the upper third.'], ['1/3', '1/3', 'Upper left third.'], ['2/3', '1/3', 'Upper right third.'], ['1/2', '2/3', 'Lower centre for a grounded subject.']],
    square: [['1/2', '1/2', 'Centred subject.'], ['1/3', '1/3', 'Upper left third.'], ['2/3', '1/3', 'Upper right third.'], ['2/3', '2/3', 'Lower right third.']],
  };

  function parseFraction(token) {
    const [a, b] = token.split('/').map(Number);
    const den = b || 1;
    return { num: a, den, value: a / den, label: b ? token : token === '0' ? 'edge' : token === '1' ? 'edge' : token };
  }

  /** Resolves fraction tokens to pixel positions on the live power lines. */
  function makeResolver(power, view, cfg) {
    const axes = { x: { lines: power.x, length: view.width }, y: { lines: power.y, length: view.height } };

    const onLine = (lines, value) => lines.find((l) => Math.abs(l.value - value) < EPS);
    const near = (axis) => {
      const cands = axes[axis].lines.filter((l) => l.value <= MARGIN_MAX + EPS);
      return cands.sort((a, b) => Math.abs(a.value - MARGIN_TARGET) - Math.abs(b.value - MARGIN_TARGET))[0];
    };

    function resolve(axis, token) {
      const { lines, length } = axes[axis];
      if (token === '0') return { fraction: 'edge', pos: 0, onPowerLine: true };
      if (token === '1') return { fraction: 'edge', pos: length, onPowerLine: true };
      if (token === 'm' || token === 'M') {
        const m = near(axis);
        if (!m) return { fraction: token === 'm' ? '1/12' : '11/12', pos: snapPosition(token === 'm' ? MARGIN_TARGET : 1 - MARGIN_TARGET, length, cfg), onPowerLine: false };
        if (token === 'm') return { fraction: m.label, pos: m.pos, onPowerLine: true };
        const far = onLine(lines, 1 - m.value);
        return far ? { fraction: far.label, pos: far.pos, onPowerLine: true } : { fraction: `${m.den - m.num}/${m.den}`, pos: length - m.pos, onPowerLine: false };
      }
      const f = parseFraction(token);
      const line = onLine(lines, f.value);
      return line
        ? { fraction: line.label, pos: line.pos, onPowerLine: true }
        : { fraction: token, pos: snapPosition(f.value, length, cfg), onPowerLine: false };
    }
    return { resolve };
  }

  const anchorPoint = (anchor, b) => ({
    x: anchor.endsWith('right') ? b.x + b.width : anchor === 'center' ? b.x + b.width / 2 : b.x,
    y: anchor.startsWith('bottom') ? b.y + b.height : anchor === 'center' ? b.y + b.height / 2 : b.y,
  });

  function resolveTemplate(template, resolver, unit) {
    const items = template.items.map((item) => {
      const [l, t, r, b] = item.box;
      const edges = { left: resolver.resolve('x', l), top: resolver.resolve('y', t), right: resolver.resolve('x', r), bottom: resolver.resolve('y', b) };
      const box = { x: edges.left.pos, y: edges.top.pos, width: edges.right.pos - edges.left.pos, height: edges.bottom.pos - edges.top.pos };
      box.units = { x: toUnits(box.x, unit), y: toUnits(box.y, unit), width: toUnits(box.width, unit), height: toUnits(box.height, unit) };
      return { role: item.role, anchor: item.anchor, anchorPoint: anchorPoint(item.anchor, box), box, edges, note: item.note };
    });
    return { id: template.id, name: template.name, orientation: template.orientation, note: template.note, items };
  }

  function buildPlacements(power, view, cfg) {
    const orientation = orientationOf(view);
    const resolver = makeResolver(power, view, cfg);
    const ofOrientation = TEMPLATES.filter((t) => t.orientation === orientation);
    const templates = ofOrientation.map((t) => resolveTemplate(t, resolver, cfg.unit));
    const selected = templates.find((t) => t.id === cfg.placementTemplate) || templates[0];

    const mark = (axis, token) => {
      const r = resolver.resolve(axis, token);
      return { label: r.fraction, pos: r.pos, units: toUnits(r.pos, cfg.unit), onPowerLine: r.onPowerLine };
    };

    const focalPoints = FOCAL[orientation].map(([fx, fy, note], i) => {
      const x = resolver.resolve('x', fx);
      const y = resolver.resolve('y', fy);
      return {
        rank: i + 1, label: `${x.fraction} · ${y.fraction}`, x: x.pos, y: y.pos, note,
        onDiagonal: onPrimaryDiagonal(parseFraction(fx).value, parseFraction(fy).value),
        onPowerLine: x.onPowerLine && y.onPowerLine,
      };
    });

    const offLines = templates.reduce((n, t) => n + t.items.reduce((m, it) => m + Object.values(it.edges).filter((e) => !e.onPowerLine).length, 0), 0);

    return {
      orientation, ratio: Math.round((view.width / view.height) * 1000) / 1000,
      margin: { x: mark('x', 'm'), xFar: mark('x', 'M'), y: mark('y', 'm'), yFar: mark('y', 'M') },
      focalPoints, templates,
      available: templates.map(({ id, name }) => ({ id, name })),
      selected: { id: selected.id, name: selected.name },
      offLines,
    };
  }

  G.placement = { TEMPLATES, FOCAL, orientationOf, makeResolver, resolveTemplate, buildPlacements };
  if (typeof module !== 'undefined') module.exports = G.placement;
})();
