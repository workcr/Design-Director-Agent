/* Turns an uploaded image into a luminance raster, runs the analysis and makes a small thumbnail. */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  G.ui = G.ui || {};

  const MAX_SIDE = 2400; // larger images are analysed at this size (results are in analysed pixels)
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

  function rasterOf(img) {
    const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * s));
    const height = Math.max(1, Math.round(img.naturalHeight * s));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; // transparent regions count as white paper
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const px = ctx.getImageData(0, 0, width, height).data;
    const luma = new Uint8ClampedArray(width * height);
    for (let i = 0; i < luma.length; i++) luma[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    return { width, height, luma, scale: s };
  }

  function jpeg(img, side, quality) {
    const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function analyzeFile(file) {
    const asset = await G.uploads.loadAssetFile(file);
    const img = G.assets.image(asset.id);
    await frame(); // let the "analysing…" state paint before the main thread is busy
    const raster = rasterOf(img);
    await frame();
    const analysis = G.reference.analyzeImage(raster);
    return { assetId: asset.id, name: asset.name, analysis, scale: raster.scale, thumb: jpeg(img, 120, 0.6), semantic: null };
  }

  /** Base64 (no data: prefix) of a downsized JPEG, for the local model. */
  const modelImage = (assetId) => jpeg(G.assets.image(assetId), 1024, 0.82).replace(/^data:image\/jpeg;base64,/, '');

  G.ui.referenceLoader = { analyzeFile, modelImage };
})();
