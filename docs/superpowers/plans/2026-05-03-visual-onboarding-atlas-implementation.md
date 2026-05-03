# Visual Onboarding Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first useful repo-controlled Mentomate onboarding atlas: a local interactive HTML tour, structured board/node data, validation, and PNG export path.

**Architecture:** The atlas is a static docs artifact under `docs/visual-artefacts/`. `atlas.html` renders a guided tour and index from a structured data file, while CSS owns the dense systems-board visual language and JavaScript owns navigation, drawer behavior, search, and export handoff. A Node validator enforces the source-data contract so future board edits fail fast when metadata drifts.

**Tech Stack:** Static HTML/CSS/JavaScript, Node 22, Playwright for optional PNG export, existing pnpm/Nx repo.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `docs/visual-artefacts/README.md` | How PMs/POs open, use, validate, and export the atlas. |
| `docs/visual-artefacts/atlas.html` | Local entrypoint; no build step needed for interactive browsing. |
| `docs/visual-artefacts/assets/atlas.css` | Systems-board layout, lanes, nodes, legend, drawer, print/export styling. |
| `docs/visual-artefacts/assets/atlas.js` | Renders boards from data, guided-tour navigation, index, drawer, export button. |
| `docs/visual-artefacts/data/atlas-data.js` | Canonical structured source for boards, nodes, links, lanes, legends, and drawer metadata. |
| `docs/visual-artefacts/scripts/validate-atlas-data.mjs` | Contract validation for board count, node references, statuses, paths, and source coverage. |
| `docs/visual-artefacts/scripts/export-png.mjs` | Uses Playwright to export each board as high-resolution PNG. |
| `docs/visual-artefacts/exports/png/.gitkeep` | Keeps export target in repo without committing generated PNGs. |
| `docs/visual-artefacts/exports/pptx/.gitkeep` | Keeps future deck target in repo without committing generated decks. |

## Task 1: Data Contract And Validator

**Files:**
- Create: `docs/visual-artefacts/data/atlas-data.js`
- Create: `docs/visual-artefacts/scripts/validate-atlas-data.mjs`

- [ ] **Step 1: Write the failing validator**

Create `validate-atlas-data.mjs` so it imports `ATLAS_DATA`, checks for exactly 9 boards, verifies board/node/link references, enforces allowed statuses (`Current`, `Dormant`, `Deferred`, `Future`), and requires representative repo paths on key service nodes.

- [ ] **Step 2: Run validator before data exists**

Run: `node docs/visual-artefacts/scripts/validate-atlas-data.mjs`

Expected: FAIL because `data/atlas-data.js` does not exist yet.

- [ ] **Step 3: Add structured atlas data**

Create `atlas-data.js` with nine boards matching the spec: Product Narrative, Capability Map, Journey Flow, System Architecture, Cloud Service Map, Data Lifecycle, AI Orchestration, Async Reliability, and Delivery + Quality. Include real technical nouns, status labels, paths, risks, and related boards.

- [ ] **Step 4: Verify data contract passes**

Run: `node docs/visual-artefacts/scripts/validate-atlas-data.mjs`

Expected: PASS with a short summary of board, node, and link counts.

## Task 2: Interactive Atlas Shell

**Files:**
- Create: `docs/visual-artefacts/atlas.html`
- Create: `docs/visual-artefacts/assets/atlas.css`
- Create: `docs/visual-artefacts/assets/atlas.js`
- Create: `docs/visual-artefacts/README.md`

- [ ] **Step 1: Add a DOM smoke test to the validator**

Extend `validate-atlas-data.mjs` to verify `atlas.html` references `assets/atlas.css`, `data/atlas-data.js`, and `assets/atlas.js`, and that the static shell contains required landmarks: atlas app root, board stage, drawer, index panel, previous/next controls, and export control.

- [ ] **Step 2: Run validator to verify shell is missing**

Run: `node docs/visual-artefacts/scripts/validate-atlas-data.mjs`

Expected: FAIL because `atlas.html` does not exist yet.

- [ ] **Step 3: Implement the static shell and renderer**

Build `atlas.html`, `atlas.css`, and `atlas.js` so a browser can open the file locally and render the guided tour from `window.MENTOMATE_ATLAS_DATA`. Use script-loaded structured data instead of JSON fetch so `file://` opening works without a dev server.

- [ ] **Step 4: Verify shell contract passes**

Run: `node docs/visual-artefacts/scripts/validate-atlas-data.mjs`

Expected: PASS.

## Task 3: PNG Export Path

**Files:**
- Create: `docs/visual-artefacts/scripts/export-png.mjs`
- Create: `docs/visual-artefacts/exports/png/.gitkeep`
- Create: `docs/visual-artefacts/exports/pptx/.gitkeep`

- [ ] **Step 1: Add export script validation**

Extend `validate-atlas-data.mjs` to verify the export script and export directories exist.

- [ ] **Step 2: Run validator to verify export path is missing**

Run: `node docs/visual-artefacts/scripts/validate-atlas-data.mjs`

Expected: FAIL because `export-png.mjs` and export directories do not exist yet.

- [ ] **Step 3: Implement PNG export script**

Use Playwright Chromium to open `atlas.html?board=<id>&export=1`, wait for the board to render, and screenshot the `#board-stage` element into `exports/png/<board-number>-<board-id>.png` at a high viewport size.

- [ ] **Step 4: Verify export script help and validator**

Run: `node docs/visual-artefacts/scripts/validate-atlas-data.mjs`

Expected: PASS.

Run: `node docs/visual-artefacts/scripts/export-png.mjs --help`

Expected: prints usage without launching Chromium.

## Self-Review Checklist

- [ ] The nine boards correspond one-to-one with the design spec.
- [ ] Every major external service has role, status, repo touchpoint, and risk/decision note.
- [ ] Current vs dormant/deferred/future labels are visible in board data and UI.
- [ ] The atlas can open from `atlas.html` without a dev server.
- [ ] PNG export is generated from the same HTML/data source, not a manual slide file.
- [ ] No secrets or account-sensitive values are included.
