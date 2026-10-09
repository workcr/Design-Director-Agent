/*
 * Elements editor: add real content (text, logo, image) to the placement template and
 * see it measured on the grid. Cards are reconciled by id so typing never loses focus.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};
  const { el } = G.ui;

  const LABELS = { headline: 'Headline', subhead: 'Subhead', body: 'Body copy', cta: 'Call to action', legal: 'Legal copy', caption: 'Caption', logo: 'Logo', image: 'Image' };
  const WEIGHTS = [['300', 'Light 300'], ['400', 'Regular 400'], ['500', 'Medium 500'], ['600', 'Semibold 600'], ['700', 'Bold 700'], ['800', 'Extra bold 800']];
  const ALIGNS = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];
  const say = (msg) => { if (G.ui.say) G.ui.say(msg); };

  const unique = (pairs) => {
    const seen = new Set();
    return pairs.filter(([v]) => (seen.has(v) ? false : seen.add(v)));
  };

  function createElementsEditor(f, store) {
    const cards = new Map();
    const list = el('ol', { class: 'elements__list' });
    const empty = el('p', { class: 'hint', text: 'No elements yet. Add a headline, a logo or an image to see real content set on the grid.' });
    const fonts = el('div', { class: 'chips elements__fonts' });

    const update = (id, patch) => store.patch({ elements: store.get().elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    const nextId = () => {
      const used = new Set(store.get().elements.map((e) => e.id));
      let n = 1;
      while (used.has(`e${n}`)) n++;
      return `e${n}`;
    };

    /* ---- header: add element + upload font ---- */
    const add = el('select', { 'aria-label': 'Add element' }, [
      el('option', { value: '', text: 'Add element…' }),
      ...G.config.ELEMENT_ROLES.map((r) => el('option', { value: r, text: LABELS[r] })),
    ]);
    add.addEventListener('change', () => {
      if (!add.value) return;
      const cfg = store.get();
      if (cfg.elements.length >= G.config.MAX_ELEMENTS) say(`Up to ${G.config.MAX_ELEMENTS} elements.`);
      else store.patch({ elements: [...cfg.elements, G.config.makeElement(add.value, nextId())], showPlacements: true });
      add.value = '';
    });

    const fontInput = el('input', { type: 'file', accept: '.woff,.woff2,.ttf,.otf', multiple: true, hidden: true });
    fontInput.addEventListener('change', async () => {
      for (const file of fontInput.files) {
        try {
          const font = await G.uploads.loadFontFile(file);
          say(`Font loaded: ${font.name}`);
        } catch (err) {
          say(err.message);
        }
      }
      fontInput.value = '';
      store.patch({});
    });
    const fontBtn = el('button', { type: 'button', class: 'btn', text: 'Upload font' });
    fontBtn.addEventListener('click', () => fontInput.click());

    const bar = el('div', { class: 'elements__bar' }, [add, fontBtn, fontInput]);

    /* ---- one element card ---- */
    function buildCard(initial) {
      const id = initial.id;
      const kindAsset = G.config.ASSET_ROLES.includes(initial.role);
      const syncs = [];
      const uid = (k) => `el-${id}-${k}`;

      const field = (label, control, cls = '') => el('div', { class: `ef ${cls}` }, [el('label', { for: control.id, text: label }), control]);

      const numberField = (key, label, min, max, hint) => {
        const input = el('input', { type: 'number', id: uid(key), min, max, step: 1, inputMode: 'numeric', title: hint || '' });
        input.addEventListener('input', () => {
          const v = Number(input.value);
          if (input.value !== '' && Number.isFinite(v)) update(id, { [key]: v });
        });
        syncs.push((e) => { if (document.activeElement !== input) input.value = e[key]; });
        return field(label, input);
      };

      const selectField = (key, label, optionsFor, onPick) => {
        const select = el('select', { id: uid(key) });
        let signature = '';
        select.addEventListener('change', () => update(id, onPick ? onPick(select.value) : { [key]: select.value }));
        syncs.push((e, item, model) => {
          const options = optionsFor(e, model);
          const next = JSON.stringify(options);
          if (next !== signature) {
            signature = next;
            select.replaceChildren(...options.map(([value, text]) => el('option', { value, text })));
          }
          select.value = String(e[key]);
        });
        return field(label, select);
      };

      /* header */
      const title = el('span', { class: 'card__title', text: LABELS[initial.role] });
      const status = el('span', { class: 'card__status' });
      const move = (dir) => {
        const arr = [...store.get().elements];
        const i = arr.findIndex((e) => e.id === id);
        const j = i + dir;
        if (j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        store.patch({ elements: arr });
      };
      const iconBtn = (text, label, fn) => {
        const b = el('button', { type: 'button', class: 'icon-btn', text, 'aria-label': `${label} ${LABELS[initial.role]}` });
        b.addEventListener('click', fn);
        return b;
      };
      const header = el('div', { class: 'card__head' }, [
        title, status,
        iconBtn('↑', 'Move up', () => move(-1)), iconBtn('↓', 'Move down', () => move(1)),
        iconBtn('×', 'Remove', () => store.patch({ elements: store.get().elements.filter((e) => e.id !== id) })),
      ]);

      const slotOptions = (e, model) => {
        const chosen = model.placements.templates.find((t) => t.id === model.placements.selected.id);
        const roles = unique([...chosen.items.map((i) => [i.role, i.role]), ...Object.keys(G.elements.DEFAULT_SLOTS).map((r) => [r, r])]);
        return [['auto', 'Auto'], ...roles];
      };

      const body = el('div', { class: 'card__body' });
      const info = el('p', { class: 'card__info' });
      const result = el('p', { class: 'card__result' });

      if (!kindAsset) {
        const ta = el('textarea', { id: uid('value'), rows: 3, spellcheck: true, 'aria-label': `${LABELS[initial.role]} text` });
        ta.addEventListener('input', () => update(id, { value: ta.value }));
        syncs.push((e) => { if (document.activeElement !== ta) ta.value = e.value; });
        body.append(
          ta,
          el('div', { class: 'card__grid' }, [
            selectField('font', 'Typeface', (e) => {
              const loaded = G.fonts.list().map((x) => [x.id, x.name]);
              const stale = e.font.startsWith('gc-font-') && !G.fonts.has(e.font) ? [[e.font, `${e.fontLabel || e.font} (not loaded)`]] : [];
              return [['inherit', 'Match page'], ...G.fonts.BUILTIN_OPTIONS, ...loaded, ...stale];
            }, (v) => ({ font: v, fontLabel: v.startsWith('gc-font-') ? G.fonts.label(v) : '' })),
            selectField('weight', 'Weight', () => WEIGHTS),
            selectField('sizeStep', 'Size', (e, model) => [...model.type.scale].reverse().map((s) => [String(s.step), `${s.name} · ${s.size}px`]), (v) => ({ sizeStep: Number(v) })),
            numberField('sizePx', 'Size px', 0, 400, '0 = use the type scale'),
            numberField('leading', 'Leading u', 0, 48, '0 = automatic; rounded up to the baseline step'),
            numberField('widthUnits', 'Width u', 0, 400, '0 = full slot width'),
            numberField('spaceBefore', 'Space above', 0, 12, 'in baseline lines'),
            numberField('spaceAfter', 'Space below', 0, 12, 'in baseline lines'),
            selectField('align', 'Align', () => ALIGNS),
            selectField('slot', 'Slot', slotOptions),
          ]),
        );
        const fit = el('input', { type: 'checkbox', id: uid('autoFit') });
        fit.addEventListener('change', () => update(id, { autoFit: fit.checked }));
        syncs.push((e) => { fit.checked = e.autoFit; });
        body.append(el('label', { class: 'card__check', for: fit.id }, [fit, el('span', { text: 'Step the size down until it fits' })]));
      } else {
        const file = el('input', { type: 'file', accept: '.svg,image/svg+xml,image/png,image/jpeg,image/webp,image/gif', hidden: true });
        file.addEventListener('change', async () => {
          const chosen = file.files[0];
          file.value = '';
          if (!chosen) return;
          try {
            const asset = await G.uploads.loadAssetFile(chosen);
            update(id, { asset });
            say(`${asset.name}: ${asset.width} × ${asset.height}`);
          } catch (err) {
            say(err.message);
          }
        });
        const pick = el('button', { type: 'button', class: 'btn', text: 'Choose file…' });
        pick.addEventListener('click', () => file.click());
        syncs.push((e) => { pick.textContent = e.asset ? 'Replace file…' : 'Choose file…'; });
        body.append(
          el('div', { class: 'card__file' }, [pick, file, info]),
          el('div', { class: 'card__grid' }, [
            selectField('fit', 'Fit', () => [['contain', 'Contain'], ['cover', 'Cover']]),
            numberField('widthUnits', 'Width u', 0, 400, '0 = fill the slot (contain only)'),
            selectField('align', 'Align', () => ALIGNS),
            selectField('slot', 'Slot', slotOptions),
          ]),
        );
        syncs.push((e) => {
          info.textContent = e.asset
            ? `${e.asset.name} · ${e.asset.width}×${e.asset.height} ${e.asset.kind === 'svg' ? 'vector' : 'px'}${G.assets.has(e.asset.id) ? '' : ' · file not loaded — re-upload to preview (measurements kept)'}`
            : 'SVG, PNG, JPEG, WebP or GIF — stays in your browser.';
        });
      }

      body.append(result);
      const node = el('li', { class: 'card', 'data-role': initial.role }, [header, body]);

      return {
        node,
        sync(e, item, model) {
          syncs.forEach((fn) => fn(e, item, model));
          if (!item) return;
          let text = '';
          if (item.kind === 'asset') {
            const a = item.asset;
            text = a.missing ? 'Waiting for a file.' : `${a.width}×${a.height} → ${item.box.width}×${item.box.height}px at (${item.box.x}, ${item.box.y})${a.mode === 'cover' ? ` · ${Math.round(a.cropped * 100)}% cropped` : a.aspectError > 0.001 ? ` · proportions ${Math.round(a.aspectError * 1000) / 10}% off` : ''}`;
          } else if (item.empty) {
            text = 'Empty — type some text.';
          } else {
            const t = item.text;
            text = `${t.lineCount} line${t.lineCount === 1 ? '' : 's'} · ${t.size}/${t.leading}px${t.steppedDown ? ' · stepped down' : ''} · box ${item.box.width}×${item.box.height} at (${item.box.x}, ${item.box.y})`;
          }
          result.textContent = item.fits ? text : `${text} · overflows by ${Math.round(item.overflow)}px`;
          node.classList.toggle('is-over', !item.fits);
          status.textContent = item.fits ? '' : 'overflow';
        },
      };
    }

    const node = el('div', { class: 'field field--custom elements' }, [
      el('span', { class: 'label', text: f.label }), bar, fonts, empty, list,
      el('p', { class: 'hint', text: 'Text is measured with the real font and set on the baseline grid. Files stay in your browser; only their names and measurements are saved and exported.' }),
    ]);

    return {
      node,
      sync(cfg, model) {
        const seen = new Set();
        cfg.elements.forEach((e, i) => {
          let card = cards.get(e.id);
          if (!card) { card = buildCard(e); cards.set(e.id, card); }
          card.sync(e, model.elements.items[i], model);
          if (list.children[i] !== card.node) list.insertBefore(card.node, list.children[i] || null);
          seen.add(e.id);
        });
        [...cards.keys()].filter((id) => !seen.has(id)).forEach((id) => { cards.get(id).node.remove(); cards.delete(id); });
        empty.hidden = cfg.elements.length > 0;

        fonts.replaceChildren(...G.fonts.list().map((font) => {
          const chip = el('span', { class: 'chip chip--font' }, [el('span', { text: font.name })]);
          const x = el('button', { type: 'button', class: 'chip__x', text: '×', 'aria-label': `Remove font ${font.name}` });
          x.addEventListener('click', () => { G.uploads.removeFont(font.id); store.patch({}); });
          chip.append(x);
          return chip;
        }));
        fonts.hidden = !G.fonts.list().length;
      },
    };
  }

  G.ui.createElementsEditor = createElementsEditor;
})();
