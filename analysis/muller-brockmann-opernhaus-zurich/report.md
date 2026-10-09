# Müller-Brockmann — Opernhaus Zürich, *Elisabeth Tudor* (1972): grid decode

> **Correction.** My first hand-measured pass mis-stated the body as 24 lines (it is **21**: blocks of 1 + 3 + 8 + 9) and under-measured the white title by about 2 px per edge (too strict a threshold for white type). The figures below come from the automated analysis now built into the tool (Reference layouts), which thresholds light and dark type symmetrically and agrees with the hand measurements everywhere else.

Source: the attached poster image, 1416 × 2000 px (ratio 1 : 1.412 ≈ 1 : √2; consistent with the Swiss F4 world format, 905 × 1280 mm, so 1 px ≈ 0.64 mm — an assumption, not measured).
Method: the Grid Calculator's reference analysis (ink mask → text lines → blocks → baseline grid → axes → nearest power lines). Re-run it any time with **Reference** in the top bar. Accuracy ≈ ±2 px; sizes assume a cap-height of 0.716 em (Akzidenz-style grotesque — a visual guess, the face is not identified).

## Horizontal structure — three vertical axes
| axis | measured | power line | off | what sits on it |
|---|---|---|---|---|
| 1/3 | ink at 481 px | 472 | +9 px (0.64 %) | left edge of *every* text block (titles + body + credit) |
| 2/3 | 944–946 px | 944 | ≤ 1 px | flush-right edge of *Zürich*, *Elisabeth*, *Tudor* |
| 11/12 | 1298 px | 1298 | 0 px | right edge of *Opernhaus* = right margin of W/12 = 118 px |

Strength of evidence: 2/3 and 11/12 are exact and unlikely by chance (with the 11-line depth-3 field the chance of both landing within 1 px is < 1 %). 1/3 is 9 px off — plausible as optical alignment of large type, but not proven. *Elisabeth* starts at 185 px only because it is right-aligned to 2/3 — its ragged left hangs 287 px past the text axis.

## Vertical structure
No power-line grid vertically (one near hit: *Elisabeth* baseline 672 px vs 1/3 = 667). Position is governed by the type itself:

| line | baseline | note |
|---|---|---|
| Opernhaus | ~180 | |
| Zürich | 354 | leading ≈ 174 |
| Elisabeth | 672 | |
| Tudor | 853 | leading ≈ 181 ≈ 5 body steps (180) |
| body, first | 945 | |
| body, last | 1774 | |
| credit (tiny) | 1983 | 17 px from the bottom edge, on the 1/3 axis |

## Typographic scale
| role | size | leading | x-height | cap height |
|---|---|---|---|---|
| title A — *Opernhaus Zürich* (black) | ≈ 179 px | ≈ 174 (set solid) | 91 | 128 |
| title B — *Elisabeth Tudor* (white) | ≈ 189 px | ≈ 180 = 5 body steps (set solid) | 97 | 135.5 |
| body (everything else) | ≈ 34–36 px (ink-based estimate ±5 %) | 36 (set solid) | 17 | 25 |

* Body baseline step is **36 px** across all **21** body lines (offset 9 px; every line within 1.5 px of the fitted grid). Paragraph breaks are exactly one blank line (72 px = 2 steps). 4 blocks: 1 + 3 + 8 + 9 lines.
* Title B is ≈ 6 % larger than title A (ascender height 135.5 vs 128 px, x-height 97 vs 91), so the poster has three sizes, roughly 1 : 5.3 : 5.6 against the body — not a modular scale, a deliberate jump.
* Body is ragged-right, mostly inside the 1/3 → 2/3 column; the longest line (*Schweizerische Erstaufführung*, 970 px) overshoots 2/3 by 26 px.
* Absolute baseline origin is not the page edge: body baselines sit at 9–10 px mod 36.

## What does not explain it
The Villard canon: only D = 12 gives the 118 px margin (as its *inner* margin) and its top margin (167 px) is nowhere near the poster's ≈ 51 px.

## Module
Only the 36 px baseline is strongly supported. A 12 px module fits several numbers (480, 36, 180, 1296, 120) but the evidence is weak. In tool terms: unit 4 px, baseline 9 u.

## Gaps this exposed in the Grid Calculator (both fixed in v2.4.0)
1. The type scale forces leading ≥ 1.05 × size, so solid setting (36/36) comes out as 36/72 and the titles as 216. A per-element leading override can reproduce it; the scale table cannot.
2. The baseline grid can only start at the canvas top or the work area — no offset, so the poster's baselines (origin ≈ 9 px) can't be matched exactly.

Fixed: *Tightest leading* now offers **Solid (1.0 × size)**, and *Baseline offset* shifts the whole baseline grid.
