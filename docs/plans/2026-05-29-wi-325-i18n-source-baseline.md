---
title: WI-325 i18n source baseline — Implementation Plan
date: 2026-05-29
profile: code
work_items: [WI-325]
spec: https://www.notion.so/3678bce91f7c81ee994de26c11c8aa07
status: in-progress
---

# WI-325 i18n source baseline — Implementation Plan

**Goal:** Make `scripts/translate-gemini.ts` diff mode retranslate existing locale keys when the English source string changes.
**Approach:** Add a generated sidecar source-hash manifest near the locale files, keyed by locale and flattened i18n key. Extract a pure diff-selection helper so the behavior is testable without Gemini, then update the CLI to refresh baseline hashes only after translation/prune output has validated and been written.

## Scope
In scope:
- `scripts/translate-gemini.ts` — source-hash baseline helpers, diff selection, CLI write flow.
- `scripts/translate-gemini.test.ts` — focused red/green tests for selection and baseline-write timing.
- `apps/mobile/src/i18n/source-baseline.json` — generated sidecar baseline manifest, if produced by a successful translation run.
- `docs/plans/2026-05-29-wi-325-i18n-source-baseline.md` — this plan.

Out of scope:
- Translation prompt text and Gemini model settings.
- Runtime locale JSON metadata.
- Live Gemini translation refresh.
- API/mobile product code.

## Tasks
- [ ] T1: Add red tests for pure diff selection — done when `pnpm exec jest --config scripts/jest.config.cjs translate-gemini.test.ts --runInBand` fails because `selectGeminiDiffKeys` is missing or key-presence-only behavior skips changed-source keys.
- [ ] T2: Implement `selectGeminiDiffKeys` and stable source hashing — done when focused tests pass for changed, added, removed, unchanged, full, missing baseline, corrupt baseline, and manual target edit preservation.
- [ ] T3: Add red tests for sidecar write timing — done when tests fail showing baseline updates would occur before validation/write success or omit prune/full refresh behavior.
- [ ] T4: Wire the CLI flow to load/write `source-baseline.json` — done when tests prove successful diff/full/prune operations update the per-locale baseline, failed validation leaves baseline unchanged, and runtime locale JSON files receive no metadata.
- [ ] T5: Run verification — done when focused script tests pass, `pnpm run check:i18n`, `pnpm check:i18n:orphans`, and `bash scripts/check-change-class.sh --run --fast` complete successfully or any environment-only blocker is documented with exact output.

## Tests
T1/T2:
- `selectGeminiDiffKeys` returns changed existing keys when the current English source hash differs from the stored baseline hash.
- It returns added source keys and removed target keys.
- It returns no translate keys for existing target translations with unchanged source hash, preserving manual target edits.
- `full: true` selects all current source keys and refreshes all current baseline hashes.
- Missing/corrupt/partial baseline selects affected existing keys conservatively.

T3/T4:
- A temp-fixture script test proves a successful prune removes stale locale keys and baseline entries.
- A temp-fixture script test proves a validation failure does not write either the locale file or baseline.
- A temp-fixture or helper-level test proves successful diff/full output writes baseline hashes after the output path has been written.
