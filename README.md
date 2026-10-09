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
3. **Modular grid** — columns, gutters and rows are whole units. Leftover width is returned to a margin (your choice of side) instead of ending up inside a column. Rows can be forced to whole lines so baselines continue across modules.
4. **Typography** — a musical-ratio type scale; every leading is a multiple of the baseline step, so body text and headings share one baseline grid. The specimen flows through the columns with each baseline sitting on a grid line.
5. **Integrity** — the readout counts every edge in the layout and reports how many sit exactly on the grid, and by how many pixels the others miss.

Exports: PNG (1:1), SVG, CSS custom properties, JSON.

## Layout

```
index.html
src/core/      pure geometry — math, config, canon, columns, typography, model, scene, exporters
src/ui/        store, schema-driven panel, readout
src/render/    p5.js renderer (consumes the scene list)
tests/         node:test suites
```

To add a control: add a rule in `src/core/config.js`, then one line in `src/ui/schema.js`.
