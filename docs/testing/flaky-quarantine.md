# Flaky-test quarantine (WI-536)

> **Determinism precondition** (canonical: `ZDX-ADR-0005`, nexus repo; repo gate model: `docs/specs/2026-05-26-commit-pr-pipeline-gates.md`):
> *a flaky or nondeterministic check gates nothing. Fix or quarantine flakiness;
> never relocate it.* This is the **quarantine** half of that rule — the mechanism
> that lets a known-flaky test stop gating `main` **without** going silently dark.

## What it does

A flaky test in the PR gate is worse than no test: it fails builds at random,
trains everyone to hit "re-run", and eventually gets deleted or `.skip`-ed in
the dark. Quarantine gives it a tracked middle state:

- the test is **skipped from the gating run** (it can't block `main`), **and**
- it is **still executed** in a separate **non-gating report lane**, so the
  flakiness stays measured, **and**
- the entry **carries an owner + a Cosmo `WI-NN`**, so it is a tracked piece of
  work to fix — not a silent skip that rots.

Scope: the **PR-gating** test surface — **Jest** (`nx run-many -t test` +
`api:test:integration`, all configs) and **Playwright web e2e** (`e2e-web.yml`).
Maestro mobile e2e (`e2e-ci.yml`) is nightly/non-gating, so it is covered
opportunistically but is not the point. **LLM eval passes are out of scope** —
they are not part of the `main` gate, and their nondeterminism is threshold-
scored, which is a different mechanism.

## The registry

Single source of truth: [`tools/quarantine/quarantine.json`](../../tools/quarantine/quarantine.json).

```jsonc
{
  "version": 1,
  "entries": [
    {
      "id": "short-stable-handle",          // your label for the entry
      "runner": "jest",                       // "jest" | "playwright"
      "path": "apps/api/src/x/foo.test.ts",  // repo-relative test FILE path
      "owner": "jorn",                        // who owns getting it un-flaked
      "wi": "WI-1234",                         // Cosmo tracking item (capture one)
      "reason": "races on the shared Neon quota counter under parallel workers",
      "added": "2026-06-09"
    }
  ]
}
```

Granularity is **file-level** (the whole test file is quarantined). That keeps
the mechanism simple and matches how flakes are usually triaged. Finer
(per-`it`) granularity is a future extension if a file mixes stable and flaky
tests.

## How to quarantine a flaky test

1. **Capture a Cosmo work item** for the flake (`/cosmo:capture`) — this is the
   `wi` the entry points at. The quarantine is not the fix; it is a holding
   state with a tracked path to the fix.
2. **Add an entry** to `tools/quarantine/quarantine.json` with `runner`, `path`,
   `owner`, `wi`, `reason`, `added`.
3. **Validate:** `node tools/quarantine/validate.cjs` — fails on a missing
   `owner`/`wi`, a stale `path`, or a duplicate. This runs in CI too (it gates).
4. Open the PR. The gate now skips the file; the report lane keeps running it.

## How to un-quarantine (the goal state)

When the flake is fixed: **delete the entry** and close its `WI`. The validator
also forces this hand — if the test file is renamed or removed, the stale-path
check fails CI until the entry is removed.

## How it works (for maintainers)

- **Jest gate** — each Jest config (the shared `jest.preset.js` plus the
  standalone `apps/api`, `apps/mobile`, `tests/integration`, `packages/test-utils`,
  `scripts` configs) appends `jestIgnorePatterns()` from
  [`tools/quarantine/registry.cjs`](../../tools/quarantine/registry.cjs) to its
  `testPathIgnorePatterns`.
- **Playwright gate** — `apps/mobile/playwright.config.ts` sets `testIgnore`
  from the registry (inlined there because that config loads in ESM mode and
  cannot cleanly `require` the CommonJS helper; it mirrors `pathToPattern`).
- **Report lane** — [`.github/workflows/quarantine-report.yml`](../../.github/workflows/quarantine-report.yml)
  runs [`tools/quarantine/report.cjs`](../../tools/quarantine/report.cjs) with
  `QUARANTINE_MODE=report`. In that mode the helpers return an **empty** ignore
  set, so the exact files the gate skips are the files the lane runs. The
  workflow is a **separate, non-gating** workflow (never a required check) and
  the run step is `continue-on-error`. Jest quarantines run fully; Playwright
  quarantines are **listed** by default (executing web e2e needs the full
  browser + web-server + staging-secret harness — set `QUARANTINE_E2E=1` once
  that harness is wired, a WI-452 / CI-restructure concern).
- **Validator** — `tools/quarantine/validate.cjs` is deterministic and gates in
  `ci.yml` (the *registry* being well-formed is not flaky; the *tests* never gate).

## Current contents — empty by design

The registry ships **empty**. A sweep of the repo at delivery (2026-06-09) found
**no currently-known, PR-gating flaky test** to seed: no `*.skip` left for
flakiness, no flaky-tagged tests (the `flaky` hits are a retry-test variable and
design comments), and the e2e audit ledgers name only *nightly Maestro* flakes
(out of the PR-gating scope) and an emulator driver crash. Seeding from a
month-old audit would risk quarantining since-fixed tests and silently dropping
real coverage. The first real entries should come from an **observed** CI flake,
following "How to quarantine" above.
