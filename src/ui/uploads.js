/*
 * File uploads, all handled locally in the browser — nothing is sent anywhere.
 *  - logos / images: measured (SVG viewBox or bitmap pixels) and kept for this session
 *  - fonts: loaded through the FontFace API and registered so text can be measured with them
 * Measurements survive a reload (they live in the settings); the files themselves do not.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const MAX_IMAGE = 12 * 1024 * 1024;
  const MAX_FONT = 8 * 1024 * 1024;

  const assets = new Map();
  const faces = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  let counter = 0;
  const newId = () => `a-${Date.now().toString(36)}${(counter++).toString(36)}`;

  const readAs = (file, method) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader[method](file);
  });

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = src;
  });

  const px = (attr) => (/%$/.test(attr || '') ? NaN : parseFloat(attr));

  /** Reads an SVG's intrinsic size from its viewBox (or width/height) without ever inserting it into the page. */
  async function readSvg(file) {
    const doc = new DOMParser().parseFromString(await readAs(file, 'readAsText'), 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('That SVG could not be parsed.');
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const w = px(root.getAttribute('width'));
    const h = px(root.getAttribute('height'));
    let width;
    let height;
    if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
      [width, height] = [vb[2], vb[3]];
      if (!(w > 0 && h > 0)) { root.setAttribute('width', width); root.setAttribute('height', height); } // browsers need an intrinsic size
    } else if (w > 0 && h > 0) {
      [width, height] = [w, h];
    } else {
      throw new Error('That SVG has no viewBox or size, so it cannot be measured.');
    }
    const xml = new XMLSerializer().serializeToString(root);
    return { width, height, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}` };
  }

  async function loadAssetFile(file) {
    if (file.size > MAX_IMAGE) throw new Error('That image is larger than 12 MB.');
    const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    if (!svg && !/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.type)) throw new Error('Use an SVG, PNG, JPEG, WebP or GIF file.');
    let width;
    let height;
    let dataUrl;
    if (svg) {
      ({ width, height, dataUrl } = await readSvg(file));
    } else {
      dataUrl = await readAs(file, 'readAsDataURL');
    }
    const img = await loadImage(dataUrl);
    if (!svg) [width, height] = [img.naturalWidth, img.naturalHeight];
    const id = newId();
    assets.set(id, { id, name: file.name, kind: svg ? 'svg' : 'bitmap', width, height, dataUrl, img });
    notify();
    return { id, name: file.name, kind: svg ? 'svg' : 'bitmap', width, height };
  }

  async function loadFontFile(file) {
    if (!/\.(woff2?|ttf|otf)$/i.test(file.name)) throw new Error('Use a .woff, .woff2, .ttf or .otf file.');
    if (file.size > MAX_FONT) throw new Error('That font file is larger than 8 MB.');
    const id = G.fonts.idFor(file.name);
    const face = new FontFace(id, await file.arrayBuffer());
    try {
      await face.load();
    } catch (err) {
      throw new Error('That file could not be read as a font.');
    }
    if (faces.has(id)) document.fonts.delete(faces.get(id));
    document.fonts.add(face);
    faces.set(id, face);
    G.fonts.register({ id, name: file.name });
    return { id, name: file.name };
  }

  function removeFont(id) {
    if (faces.has(id)) document.fonts.delete(faces.get(id));
    faces.delete(id);
    G.fonts.unregister(id);
  }

  G.assets = {
    get: (id) => assets.get(id),
    has: (id) => assets.has(id),
    image: (id) => (assets.get(id) || {}).img,
    dataUrl: (id) => (assets.get(id) || {}).dataUrl,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  G.uploads = { loadAssetFile, loadFontFile, removeFont };
})();
