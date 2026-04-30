---
name: Eval harness signal-distribution regression guard (Layer 1)
description: Post-envelope-migration baseline guard in apps/api/eval-llm/. Collects signal/ui_hint rates from --live runs, compares against baseline.json, fails on drift. Restored 2026-04-21 after concurrent-edit loss.
type: project
originSessionId: 5419dc3e-b1c5-438e-ad68-0ab5a636417f
---
Self-improvement Layer 1 for the eval harness. Catches envelope-signal distribution drift (e.g., prompt tweak halves `partial_progress` rate) that `expectedResponseSchema` misses. Complementary — not redundant.

## Where it lives

- `apps/api/eval-llm/runner/metrics.ts` — `extractSampleMetrics`, `aggregateFlowSamples`, `compareAgainstBaseline`, `buildBaseline`/`parseBaseline`, `formatDriftReport`
- `apps/api/eval-llm/runner/metrics.test.ts` — 18 tests
- `FlowDefinition.emitsEnvelope?: boolean` in `runner/types.ts` — opt-in per flow
- `RunSummary.envelopeMetrics` accumulated in `runHarness`
- CLI flags `--check-baseline`, `--update-baseline`, `--baseline-tolerance <fraction>` in `parseCliArgs`
- Baseline stored at `apps/api/eval-llm/baseline.json` (not yet created — seed with first `--update-baseline` run)

Flows opted in so far:
- `exchangesFlow` (`emitsEnvelope: true` + `expectedResponseSchema: llmResponseEnvelopeSchema`)

Future interview streaming flow + any new envelope-returning flow should set both flags.

## Why: catches what expectedResponseSchema does not

- `expectedResponseSchema`: per-sample Zod validation, rendered inline as "Schema violation" in each snapshot. Catches "model stopped emitting valid JSON."
- **Layer 1 metrics**: aggregate distribution across the run. Catches "envelope still valid but `partial_progress` collapsed from 20% → 2%" — the kind of regression prompt tuning silently introduces.

Without Layer 1 you can't detect drift until real users hit production.

## Tolerance rationale

Default `--baseline-tolerance 0.05` = 5pp. At the current ~30-sample harness matrix (see `docs/plans/2026-04-20-prelaunch-llm-tuning.md`), 1 sample ≈ 3.3pp, so 5pp tolerates a single LLM flake while still catching systemic shifts. Tighten to 0.03 (3pp) once the harness scales past ~50 samples/flow.

## How to apply

- **Seed baseline**: `doppler run -- pnpm eval:llm -- --live --update-baseline` — commit the resulting `baseline.json` alongside the prompt version it reflects.
- **Guard runs**: `doppler run -- pnpm eval:llm -- --live --check-baseline` — exits 1 on drift, prints a before/after table per (flow, metric).
- **After intentional prompt changes**: re-seed the baseline in the same commit as the prompt change so the diff reviewer sees both.
- **Never tighten tolerance without increasing N first** — small-N + tight tolerance = flaky CI.

## Recovery history

This layer was first built 2026-04-20, never committed, then wiped by a concurrent editor before the commit landed. Restored 2026-04-21 — same design, cleaner merge (the concurrent editor had already set `emitsEnvelope: true` on `exchangesFlow` without a matching type; restoration fixed that latent ghost-field too).

Lesson for similar in-flight work: **commit the metrics-module files the moment tests pass** rather than batching with a broader review, since purely additive harness files are low-risk and the bigger risk is losing them to a concurrent worktree.

## Non-goals

- Not semantic quality (tone warmth, pedagogy) — that's Layer 2 (judge-LLM), deferred post-launch.
- Not tier-1 prompt-hash regression — separate potential follow-up.
- Not a replacement for `expectedResponseSchema` — both run side-by-side.
