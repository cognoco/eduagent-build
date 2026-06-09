'use strict';

// Flaky-test quarantine registry loader (WI-536).
//
// Single source of truth = quarantine.json. This module is consumed by:
//   - every gating Jest config (preset + standalone) via `jestIgnorePatterns()`,
//     which feeds testPathIgnorePatterns so quarantined files DON'T gate the PR;
//   - apps/mobile/playwright.config.ts via `playwrightIgnore()` for the web e2e gate;
//   - tools/quarantine/report.cjs (the non-gating lane) and validate.cjs.
//
// QUARANTINE_MODE=report flips the meaning: the helpers return EMPTY ignore sets
// so the quarantined files are NOT skipped — that is how the report lane runs the
// exact set that the gate skips, without duplicating any path logic.

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'quarantine.json');
const REPORT_MODE = process.env.QUARANTINE_MODE === 'report';

function loadRegistry() {
  let raw;
  try {
    raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`quarantine: cannot read ${REGISTRY_PATH}: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`quarantine: ${REGISTRY_PATH} is not valid JSON: ${err.message}`);
  }
  return Array.isArray(data.entries) ? data.entries : [];
}

function entriesFor(runner) {
  return loadRegistry().filter((e) => e && e.runner === runner && e.path);
}

// Repo-relative test path -> cross-platform testPathIgnorePatterns regex source.
// Mirrors the repo's existing `[/\\]` separator convention so it works on
// Windows CI as well as macOS/Linux.
function pathToPattern(relPath) {
  const escaped = String(relPath)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex metachars
    .replace(/\//g, '[/\\\\]'); // path separator: '/' or '\'
  return `${escaped}$`;
}

// Jest: testPathIgnorePatterns contributed by quarantine. Empty in report mode.
function jestIgnorePatterns() {
  if (REPORT_MODE) return [];
  return entriesFor('jest').map((e) => pathToPattern(e.path));
}

// NOTE: Playwright's testIgnore is built inline in apps/mobile/playwright.config.ts
// (that config loads in ESM mode and cannot cleanly require this CommonJS module);
// it mirrors pathToPattern. The Jest configs share jestIgnorePatterns() below.

module.exports = {
  REGISTRY_PATH,
  REPORT_MODE,
  loadRegistry,
  entriesFor,
  pathToPattern,
  jestIgnorePatterns,
};
