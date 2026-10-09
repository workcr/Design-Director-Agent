/*
 * Elements: real content placed into the selected placement template.
 *
 * Text is wrapped with real font metrics, set on the baseline grid with leading
 * that is a multiple of the baseline step, and boxed on the unit grid. Logos and
 * images keep their true aspect ratio and are sized in whole units. Everything
 * is measured, not guessed, so the numbers can be handed to the agent as-is.
 *
 * Elements that share a slot stack top-down (a subhead flows under its headline);
 * legal copy and captions hang upward from the bottom margin.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') {
    ['./math.js', './config.js', './fonts.js', './typography.js', './placement.js'].forEach(require);
  }
  const { EPS, clamp, toUnits, round } = G.math;
  const { CAP_HEIGHT: CAP, DESCENT: DESC, snapLeading } = G.typography;
  const { ASSET_ROLES } = G.config;

  const floorU = (v, u) => Math.floor(v / u + EPS) * u;
  const ceilU = (v, u) => Math.ceil(v / u - EPS) * u;
  const roundU = (v, u) => Math.round(v / u) * u;

  /** Slots used when the selected template has none for a role. */
  const DEFAULT_SLOTS = {
    logo: ['m', 'm', '1/4', '1/6'], headline: ['m', '1/4', '2/3', '1/2'], body: ['m', '1/2', '2/3', '3/4'],
    cta: ['m', '5/6', '1/3', 'M'], image: ['m', 'm', 'M', '2/3'], caption: ['2/3', '5/6', 'M', 'M'],
  };

  const BOTTOM = 'legal*'; // pseudo-slot: hangs upward from the bottom margin

  function slotMap(template, resolver, unit) {
    const defaults = G.placement.resolveTemplate({
      id: 'defaults', orientation: '', name: '', note: '',
      items: Object.entries(DEFAULT_SLOTS).map(([role, box]) => ({ role, box, anchor: 'top-left', note: '' })),
    }, resolver, unit);
    const map = {};
    defaults.items.forEach((it) => { map[it.role] = it.box; });
    template.items.forEach((it) => { map[it.role] = it.box; });
    return map;
  }

  /** Room a text slot may use: its own box, extended down to the next slot below it. */
  function regionFor(role, slots, farBottom) {
    const s = slots[role];
    const bottom = s.y + s.height;
    const below = Object.entries(slots)
      .filter(([r, b]) => r !== role && b.y >= bottom - EPS && b.x < s.x + s.width - EPS && b.x + b.width > s.x + EPS)
      .map(([, b]) => b.y);
    return { x: s.x, y: s.y, w: s.width, bottom: Math.max(below.length ? Math.min(...below) : farBottom, bottom) };
  }

  function regionKey(el, slots) {
    if (el.slot !== 'auto' && slots[el.slot]) return el.slot;
    switch (el.role) {
      case 'headline': case 'subhead': return 'headline';
      case 'legal': return BOTTOM;
      case 'caption': return slots.caption ? 'caption' : BOTTOM;
      default: return el.role;
    }
  }

  function wrap(value, width, size, weight, family, measure) {
    const lines = [];
    value.split('\n').forEach((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      let current = words[0];
      for (let i = 1; i < words.length; i++) {
        const next = `${current} ${words[i]}`;
        if (measure(next, size, weight, family) <= width + EPS) current = next;
        else { lines.push(current); current = words[i]; }
      }
      lines.push(current);
    });
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    while (lines.length && lines[0] === '') lines.shift();
    return lines;
  }

  /** Size candidates, largest first. Auto-fit walks down the type scale until the text fits. */
  function candidates(el, ctx) {
    const { scale, cfg, baseline } = ctx;
    const byStep = (s) => scale[clamp(s - scale[0].step, 0, scale.length - 1)];
    const lead = (units) => (el.leading > 0 ? Math.ceil(el.leading / baseline.units) * baseline.units : units);
    if (el.sizePx > 0) {
      const units = snapLeading((el.sizePx * cfg.lineHeight) / cfg.unit, baseline.units, el.sizePx / cfg.unit);
      return [{ size: el.sizePx, leadingUnits: lead(units), step: null }];
    }
    const start = clamp(el.sizeStep, scale[0].step, scale[scale.length - 1].step);
    const list = [];
    for (let s = start; s >= scale[0].step; s--) {
      const e = byStep(s);
      list.push({ size: e.size, leadingUnits: lead(e.leadingUnits), step: e.step });
    }
    return el.autoFit ? list : [list[0]];
  }

  const familyOf = (el, cfg) => (el.font === 'inherit' ? cfg.fontFamily : el.font);

  function blockOf(el, R, u) {
    const width = el.widthUnits > 0 ? Math.min(el.widthUnits * u, R.w) : R.w;
    const x = el.align === 'center' && width < R.w ? R.x + floorU((R.w - width) / 2, u) : el.align === 'right' ? R.x + R.w - width : R.x;
    return { x, width };
  }

  function textItem(el, ctx, R, family, picked, lines, firstBaseline, block, fits, overflow, warnings) {
    const { cfg, baseline } = ctx;
    const u = cfg.unit;
    const { size, leadingUnits } = picked;
    const leading = leadingUnits * u;
    const last = firstBaseline + (lines.length - 1) * leading;
    const top = floorU(firstBaseline - CAP * size, u);
    const bottom = ceilU(last + DESC * size, u);
    const anchorX = el.align === 'center' ? block.x + block.width / 2 : el.align === 'right' ? block.x + block.width : block.x;
    const box = { x: block.x, y: top, width: block.width, height: bottom - top };
    box.units = { x: toUnits(box.x, u), y: toUnits(box.y, u), width: toUnits(box.width, u), height: toUnits(box.height, u) };
    const missingFont = !G.fonts.isBuiltin(family) && !G.fonts.has(family);
    if (missingFont) warnings.push({ level: 'warn', text: `${el.role} "${el.id}" needs the font ${el.fontLabel || family} — upload it again; a fallback is used meanwhile.` });
    if (!fits) warnings.push({ level: 'warn', text: `${el.role} "${el.id}" overflows its area by ${round(overflow, 1)}px.` });
    return {
      id: el.id, role: el.role, kind: 'text', slot: null, box, fits, overflow, empty: false,
      text: {
        lines: lines.map((t, i) => ({ text: t, x: anchorX, y: firstBaseline + i * leading })),
        family, familyLabel: G.fonts.label(family), weight: el.weight, size, leading, leadingUnits, align: el.align,
        lineCount: lines.length, stepRequested: el.sizePx > 0 ? null : el.sizeStep, stepUsed: picked.step,
        steppedDown: picked.step !== null && picked.step < el.sizeStep, missingFont, baselineStep: baseline.step,
      },
    };
  }

  const emptyItem = (el, R, cursor, u, warnings) => {
    warnings.push({ level: 'info', text: `${el.role} "${el.id}" has no text yet.` });
    return { id: el.id, role: el.role, kind: 'text', slot: null, empty: true, fits: true, overflow: 0, box: { x: R.x, y: floorU(cursor, u), width: R.w, height: 0, units: { x: toUnits(R.x, u), y: toUnits(floorU(cursor, u), u), width: toUnits(R.w, u), height: 0 } }, text: { lines: [], lineCount: 0 } };
  };

  /** Top-down layout inside a slot region. Returns the item and where the next element may start. */
  function layoutDown(el, R, cursor, ctx, warnings) {
    const { cfg, baseline, measure } = ctx;
    const u = cfg.unit;
    const step = baseline.step;
    const family = familyOf(el, cfg);
    const block = blockOf(el, R, u);
    if (!el.value.trim()) return { item: emptyItem(el, R, cursor, u, warnings), cursor };
    let result = null;
    for (const picked of candidates(el, ctx)) {
      const lines = wrap(el.value, block.width, picked.size, el.weight, family, (t, s, w, f) => measure(t, s, w, f));
      const leading = picked.leadingUnits * u;
      const k = Math.ceil((cursor + CAP * picked.size - baseline.origin) / step - EPS) + el.spaceBefore;
      const first = baseline.origin + k * step;
      const last = first + (lines.length - 1) * leading;
      const bottom = last + DESC * picked.size;
      const fits = bottom <= R.bottom + EPS;
      result = { picked, lines, first, bottom, fits, overflow: Math.max(0, bottom - R.bottom) };
      if (fits) break;
    }
    const item = textItem(el, ctx, R, family, result.picked, result.lines, result.first, block, result.fits, result.overflow, warnings);
    return { item, cursor: result.bottom + el.spaceAfter * step };
  }

  /** Bottom-up layout: the last baseline hangs just above `cursorBottom`. */
  function layoutUp(el, R, cursorBottom, ctx, warnings) {
    const { cfg, baseline, measure } = ctx;
    const u = cfg.unit;
    const step = baseline.step;
    const family = familyOf(el, cfg);
    const block = blockOf(el, R, u);
    if (!el.value.trim()) return { item: emptyItem(el, R, cursorBottom, u, warnings), cursor: cursorBottom };
    let result = null;
    for (const picked of candidates(el, ctx)) {
      const lines = wrap(el.value, block.width, picked.size, el.weight, family, (t, s, w, f) => measure(t, s, w, f));
      const leading = picked.leadingUnits * u;
      const lastK = Math.floor((cursorBottom - DESC * picked.size - baseline.origin) / step + EPS) - el.spaceAfter;
      const last = baseline.origin + lastK * step;
      const first = last - (lines.length - 1) * leading;
      const top = first - CAP * picked.size;
      const fits = top >= R.top - EPS;
      result = { picked, lines, first, top, fits, overflow: Math.max(0, R.top - top) };
      if (fits) break;
    }
    const item = textItem(el, ctx, R, family, result.picked, result.lines, result.first, block, result.fits, result.overflow, warnings);
    return { item, cursor: result.top - el.spaceBefore * step };
  }

  function layoutAsset(el, S, ctx, warnings) {
    const u = ctx.cfg.unit;
    const a = el.asset;
    const units = (b) => ({ x: toUnits(b.x, u), y: toUnits(b.y, u), width: toUnits(b.width, u), height: toUnits(b.height, u) });
    const slotBox = { x: S.x, y: S.y, width: S.width, height: S.height };
    const base = { id: el.id, role: el.role, kind: 'asset', slot: null, fits: true, overflow: 0 };
    if (!a) {
      warnings.push({ level: 'info', text: `${el.role} "${el.id}" has no file yet.` });
      return { ...base, box: { ...slotBox, units: units(slotBox) }, asset: { name: '', mode: el.fit, missing: true } };
    }
    const aspect = a.width / a.height;
    let box = slotBox;
    let aspectError = 0;
    let cropped = 0;
    if (el.fit === 'cover') {
      const s = Math.max(S.width / a.width, S.height / a.height);
      cropped = Math.max(0, 1 - (S.width * S.height) / (a.width * s * a.height * s));
    } else {
      const maxW = el.widthUnits > 0 ? Math.min(el.widthUnits * u, S.width) : S.width;
      let w = Math.max(u, floorU(Math.min(maxW, S.height * aspect), u));
      let h = Math.max(u, roundU(w / aspect, u));
      if (h > S.height) { h = Math.max(u, floorU(S.height, u)); w = Math.max(u, floorU(h * aspect, u)); }
      const x = el.align === 'center' ? S.x + floorU((S.width - w) / 2, u) : el.align === 'right' ? S.x + S.width - w : S.x;
      box = { x, y: S.y, width: w, height: h };
      aspectError = Math.abs(w / h / aspect - 1);
      if (aspectError > 0.05) warnings.push({ level: 'info', text: `${el.role} "${el.id}": snapping to whole units changes its proportions by ${round(aspectError * 100, 1)}% — try another width or use cover.` });
    }
    return {
      ...base, box: { ...box, units: units(box) },
      asset: { name: a.name, kind: a.kind, width: a.width, height: a.height, mode: el.fit, aspectError, cropped, missing: false },
    };
  }

  function solveElements({ cfg, template, resolver, scale, baseline, view, measure }) {
    const warnings = [];
    const items = new Array(cfg.elements.length);
    if (!cfg.elements.length) return { items: [], warnings };

    const slots = slotMap(template, resolver, cfg.unit);
    const farBottom = resolver.resolve('y', 'M').pos;
    const nearTop = resolver.resolve('y', 'm').pos;
    const ctx = { cfg, scale, baseline, view, measure };

    const groups = new Map();
    cfg.elements.forEach((el, i) => {
      const key = regionKey(el, slots);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });

    groups.forEach((indexes, key) => {
      if (key === BOTTOM) {
        const ref = slots.body || slots.cta || slots.headline;
        const R = { x: ref.x, w: ref.width, top: nearTop };
        let cursor = farBottom;
        [...indexes].reverse().forEach((i) => {
          const r = layoutUp(cfg.elements[i], R, cursor, ctx, warnings);
          items[i] = { ...r.item, slot: 'bottom' };
          cursor = r.cursor;
        });
        return;
      }
      const first = cfg.elements[indexes[0]];
      if (ASSET_ROLES.includes(first.role) && indexes.every((i) => ASSET_ROLES.includes(cfg.elements[i].role))) {
        indexes.forEach((i, n) => {
          items[i] = { ...layoutAsset(cfg.elements[i], slots[key], ctx, warnings), slot: key };
          if (n > 0) warnings.push({ level: 'info', text: `${cfg.elements[i].role} "${cfg.elements[i].id}" shares the ${key} slot with another element and will overlap it.` });
        });
        return;
      }
      const R = regionFor(key, slots, farBottom);
      let cursor = R.y;
      indexes.forEach((i) => {
        const el = cfg.elements[i];
        if (ASSET_ROLES.includes(el.role)) { items[i] = { ...layoutAsset(el, slots[key], ctx, warnings), slot: key }; return; }
        const r = layoutDown(el, R, cursor, ctx, warnings);
        items[i] = { ...r.item, slot: key };
        cursor = r.cursor;
      });
    });

    return { items, warnings };
  }

  G.elements = { DEFAULT_SLOTS, slotMap, regionFor, wrap, solveElements };
  if (typeof module !== 'undefined') module.exports = G.elements;
})();
