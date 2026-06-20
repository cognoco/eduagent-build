# Octo Mate Animation Extraction

Source of truth: `octo-mate.svg` and `octo-mate.png`.

Do not use `octopus_3d_animation_rig.svg` as a style reference. It is a hand-redrawn approximation and changes the mascot's silhouette, lighting, expression, and tentacle language.

## Extracted Files

- `octo-mate-animation-source.svg` - cleaned transparent SVG extracted from `octo-mate.svg`.
- `octo-mate-animation-map.json` - machine-readable dimensions, palette, path indices, and suggested pivots.

## Source Findings

- Canvas/viewBox: `0 0 1042 1068`.
- `octo-mate.svg` has `1587` paths after the lower-arm tip repair.
- `octo-mate.svg` includes the gray/white checkerboard as real SVG paths.
- `octo-mate-animation-source.svg` keeps `105` colored/dark mascot paths, adds `2` lower-arm tip repair paths, and removes the checkerboard paths.
- Mascot occupied bounds from `octo-mate.png` plus the repair overlay: `x=32..1021`, `y=12..1060`, about `990x1048`.

## Visual Invariants

- Asymmetric eight-tentacle silhouette.
- Tall viewer-right raised tentacle reaching near the top edge.
- Viewer-left raised tentacle is shorter and curls inward.
- Sleepy half-lidded eyes, not round alert eyes.
- Small calm smile centered below the eyes.
- Dark teal outline with flat vector coloring, not glossy 3D shading.
- Purple ribbed beanie with wide lavender brim.
- Suckers are small attached ovals, mostly pale green with darker inner marks.

## Palette

- Body main: `#40A094`, `#41A094`.
- Body secondary/shadow: `#3F968B`, `#3E988D`, `#419F94`, `#439B90`, `#45948C`, `#46958E`, `#429D91`.
- Dark outline/face: `#1D5559`, `#1E5558`, `#1E565A`, `#1D565A`, `#1F5155`, `#1C5455`, `#19585A`.
- Suckers: `#A1CEB9`, `#A5D2BA`, `#4D8273`.
- Eyes: `#D1E6B8`, `#2B3B54`.
- Hat: `#4A2C76`, `#784CBA`, `#784CB8`, `#784CBB`, `#AF80EC`, `#323D69`, `#54919B`.

## Key Source Path Indices

Indices are zero-based in `octo-mate.svg`.

- Body core: `0`.
- Face: `174`, `175`, `176`, `177`, `178`, `733`, `734`, `735`, `736`.
- Beanie/brim: `179`, `442`, `945`, `1274`, `1275`, `1276`, `1277`, `1278`, `1279`.
- Main dark tentacle outline masses: `1`, `172`, `173`, `647`.
- Top-right raised tentacle: `264`, `432`, `433`, `525`, `536`, `543`, `791`, `1011`.
- Top-left raised tentacle: `173`, `645`, `648`, `699`, `701`, `1116`, `1117`.

## Animation Guidance

Start from `octo-mate-animation-source.svg`, not a redraw. If individual tentacles need independent motion, use masks/clips or duplicate source regions into animation layers; avoid replacing them with new tube shapes.

Suggested motion:

- Body: subtle sway around `(536, 575)`, no large scaling.
- Beanie: small delayed bob around `(538, 260)`.
- Eyes: blink by compressing the existing half-lidded eye shapes; keep the sleepy expression.
- Top-right tentacle: slow arc around `(704, 522)`, preserving the high hooked silhouette.
- Top-left tentacle: smaller arc around `(386, 548)`.
- Side tentacles: low-amplitude wave from their base pivots.
- Lower limbs: slower counter-sway; preserve tapered, irregular tips.

Avoid:

- Dark/glowing backgrounds baked into the asset.
- Glossy 3D beads or floating spheres.
- Symmetric tentacle layouts.
- Round open eyes or a different facial expression.
- Purple-blue neon gradients that overpower the flat mascot palette.
