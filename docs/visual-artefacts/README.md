# Mentomate Visual Onboarding Atlas

This directory is the canonical source for the internal onboarding atlas.
Interactive HTML and structured data are the source of truth; PNG exports and
future slide decks are generated views.

## Open Locally

Open `docs/visual-artefacts/atlas.html` in a browser. The atlas uses classic
script files so it works from `file://` without a dev server.

## Source Files

- `atlas.html` is the local entrypoint.
- `assets/atlas.css` owns the dense systems-board presentation.
- `assets/atlas.js` renders navigation, index, node cards, and the detail drawer.
- `data/atlas-data.js` is the structured board/node/link source.

## Validate

```bash
node docs/visual-artefacts/scripts/validate-atlas-data.mjs
```

The validator checks the nine-board contract, node/link references, status
labels, service repo paths, risk notes, and local shell wiring.

## Export PNGs

After the export script is present, run:

```bash
node docs/visual-artefacts/scripts/export-png.mjs
```

To export one board:

```bash
node docs/visual-artefacts/scripts/export-png.mjs --board ai-orchestration
```

Generated files go under `docs/visual-artefacts/exports/png/` and should be
treated as build artifacts unless a release process explicitly asks to commit
them.
