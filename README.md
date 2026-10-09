# Grid Calculator

A modular grid, a Villard de Honnecourt / Van de Graaf canon and a baseline-locked type scale, all built on a single pixel unit (default **8px**). Change any parameter in the side panel and the grid recomputes in real time.

## Run

Open `index.html` in a browser (no build step), or:

```bash
npm start      # serves on http://localhost:5173
npm test       # core maths + layout tests (node:test, no dependencies)
```

p5.js is loaded from the cdnjs CDN. Settings persist in `localStorage`.

## How it works

1. **Unit** — everything is a multiple of `unit`. With *Snap canvas to grid* on, the canvas is rounded so each page is a whole number of units.
2. **Canon** — for division `D`, the diagonal construction gives margins `top = H/D`, `bottom = 2H/D`, `inner = Wp/D`, `outer = 2Wp/D` (`D = 9` is the classic canon). Margins are then snapped (nearest / down / up) to the unit. The pure canon is drawn dashed so you can see the shift; the panel lists **exact divisions** where no snapping is needed.
3. **Power lines & anchors** — a canon-independent field that works on any aspect ratio (book page, poster, social post, web viewport). Diagonals of the canvas and of its two halves put lines at ½ and ⅓ of each axis; repeating the construction on the strip beside the edge halves it again (½ → ¼ → ⅛ …, ⅓ → ⅙ → 1/12 → 1/24 …). Crossings of those lines that sit on a diagonal are the **anchor points** — a small, harmonic vocabulary of places to put a headline, an image corner or a focal point. Lines snap to the unit like everything else; the panel lists each line's position and how far snapping moved it. A second list shows which canon divisions land their work-area edges on power lines (e.g. D = 6, 8, 12, 24), so the two systems can be locked together.
4. **Placements** — turns the power field into concrete suggestions for a canvas shape (landscape, portrait or square): a few templates (e.g. *Split · image right*, *Full-bleed · lower third*) whose headline, body, logo, CTA and image boxes have every edge resolved to a power line, plus ranked focal points. Preview them on the canvas and pick one in the panel. If the field is too shallow for a template edge to land on a line, it is snapped to the grid instead and flagged. **Elements** make it concrete: add a headline, subhead, body copy, CTA, legal copy, caption, logo or image and give each its real value. Text is wrapped with the actual font, set on the baseline grid (leading is always a multiple of the baseline step), boxed on the unit grid and, if it overflows its area, optionally stepped down the type scale until it fits. Per text element you can set typeface (built-in or an uploaded `.woff/.woff2/.ttf/.otf`), weight, size (a type-scale step or a px override), leading, block width, alignment, spacing above/below in baseline lines, and which slot it goes in. Logos and images are measured (SVG `viewBox` or bitmap pixels) and sized in whole units with their real aspect ratio — *contain* or *cover* — and drawn in the preview. Files stay in your browser; only names and measurements are saved, so after a reload the layout is kept and you re-upload to see the artwork (re-uploading a font with the same file name relinks it automatically). Export **Placements JSON** (positions, anchors, edges, rules) or **Copy agent brief** (the same information as a compact, readable prompt) for the Design Director Agent.
5. **Modular grid** — columns, gutters and rows are whole units. Leftover width is returned to a margin (your choice of side) instead of ending up inside a column. Rows can be forced to whole lines so baselines continue across modules.
6. **Typography** — a musical-ratio type scale; every leading is a multiple of the baseline step, so body text and headings share one baseline grid. The specimen flows through the columns with each baseline sitting on a grid line.
7. **Reference layouts & style library** — click **Reference** in the top bar and upload a poster or page. The tool measures it on your computer (no upload): the vertical **axes** the type hangs on, the **baseline grid** (step, offset, how many lines sit on it), the **type sizes** with their leading and ratios, and the ink margins — and says how close each axis comes to a power line (and how unlikely a hit that close would be by chance). *Use as canvas* recreates the reference's size, unit, baseline grid and leading in the tool; *Underlay* and *Detected* overlay the photo and the findings on the canvas. It works best on type-driven layouts; photographs are not text and will confuse it, and sizes are estimated from ink (≈ ±5 %), so the ratios are more trustworthy than the absolute numbers.

   File a layout under a **designer** and the library learns: each work becomes a set of scale-free features (axis fractions, alignment mix, leading ratio, display/body ratio, baseline step as a share of page height, margins…) and a designer's profile is simply the pooled statistics of their works — mean, spread, recurring axes, a plain-language signature, and a confidence that grows with every work. Once a designer has two works, new uploads get a *closest style* hint (never filed automatically). **Apply style** turns a profile into settings (solid or open leading, baseline step scaled to your canvas, body size, line height) and draws the designer's axes on your canvas; the applied style is also written into the placements JSON and the agent brief. The library is saved in your browser, can be exported and imported as JSON (imports are validated and merged, never trusted), and is yours to commit alongside a project.

   **Optional local model.** If [Ollama](https://ollama.com) is running with a vision-capable model (the picker lists only those), *Describe with local model* transcribes the text, labels block roles, names the likely typeface family and tags the style, and saves those notes with the work. The measurements never depend on it — image analysis is more accurate than a vision model — and a designer guess from the model is only a lead for you to confirm. Layouts are only ever sent to `localhost`. Serve the app over http (`npm start`) rather than opening the file directly so Ollama accepts the request.
8. **Integrity** — the readout counts every edge in the layout and reports how many sit exactly on the grid, and by how many pixels the others miss.

Exports: PNG (1:1), SVG, CSS custom properties (including `--power-x-1-3`-style tokens), JSON (including every power line and anchor with its fraction and pixel position).

## Layout

```
index.html
src/core/      pure geometry — math, config, fonts, canon, powerlines, placement, elements, reference (analysis), styles, library, semantic, columns, typography, model, scene, exporters
src/ui/        store, schema-driven panel, elements editor, uploads, reference drawer, library, local model, readout
src/render/    p5.js renderer (consumes the scene list)
tests/         node:test suites
```

To add a control: add a rule in `src/core/config.js`, then one line in `src/ui/schema.js`.

## Versions

See [CHANGELOG.md](CHANGELOG.md). Releases are git tags (`v2.0.0`, `v2.1.0`), so any earlier version can be checked out with `git checkout v2.0.0`.

Reference for the power-line construction: [Obys — Grids: Columns & Van de Graaf](https://grids.obys.agency/columns_vandegraaf/).
