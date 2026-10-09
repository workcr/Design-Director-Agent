# Changelog

## 2.3.0
- **Elements**: add headline, subhead, body, CTA, legal, caption, logo and image elements with real values to the selected placement template.
- Text is measured with the real font, set on the baseline grid, boxed on the unit grid, stacked within shared slots (subheads under headlines, legal copy hanging from the bottom margin) and can step down the type scale to fit. Per-element typeface, weight, size (scale step or px), leading, block width, alignment, spacing and slot.
- **Font upload** (`.woff`, `.woff2`, `.ttf`, `.otf`) through the FontFace API; fonts also appear in the global Typeface menu. Re-uploading a file with the same name relinks elements after a reload.
- **Logo / image upload** (SVG, PNG, JPEG, WebP, GIF): measured from the SVG viewBox or bitmap pixels, sized in whole units keeping the real aspect ratio (contain / cover), drawn in the preview and embedded in SVG export. Files stay in the browser; measurements persist.
- Placements JSON and the agent brief now carry the measured content (value, line count, font, size/leading, box, fit/overflow, asset measurements).
- Slot frames can be hidden separately from the elements.
- 26 new tests (83 total), including a randomized check that all text lands on baselines and unit-grid boxes.

## 2.2.0
- **Anchor placement export**: role-based placement templates per canvas shape (landscape / portrait / square) resolved onto the live power lines, with ranked focal points.
- Canvas preview of the selected template (role boxes + focal markers) and a template picker in the new Placements section.
- Exports: **Placements JSON** (canvas, baseline, margins, lines, anchors, focal points, templates with anchor points and per-edge line labels, rules) and **Copy agent brief** (readable markdown for an agent prompt).
- Edges that cannot land on a power line at the current depth snap to the grid and are flagged, with a hint to raise the depth.
- `snapPosition` shared between power lines and placements.

## 2.1.0
- **Power lines & anchors**: harmonic field of lines at ½, ⅓ and their halvings toward the edges, with anchor points where lines meet the canvas / half-canvas diagonals. Aspect-ratio independent.
- Controls: depth, ½ / ⅓ / ⅕ series, anchor mode (on diagonals / every crossing), stop-near-edge margin, snap to grid, labels, primary and strip diagonals, colour.
- Panel list of every line with its snapped position and deviation; list of canon divisions whose edges land on power lines.
- Readout: power-line counts and canon-on-power-line alignment; power lines count toward grid integrity.
- Exports: power lines and anchors in JSON, `--power-x-*` / `--power-y-*` CSS tokens, anchor dots in SVG.
- Guides toggle now covers the new layers.
- Power lines snap by distance from the nearest edge (same rule as the canon margins), so they mirror and agree with canon edges.

## 2.0.0
- Rebuilt as a standalone app: closed-form Villard canon, whole-unit modular grid, baseline-locked type scale, live control panel, grid-integrity readout, PNG / SVG / CSS / JSON export, master Guides toggle.
