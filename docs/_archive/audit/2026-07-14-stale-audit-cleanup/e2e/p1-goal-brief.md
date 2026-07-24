# P1 Goal Brief — Playwright Web E2E to One Green Pass

**For:** `/goal` agent, fresh session
**Branch:** `consistency` (or a child branch off it)
**Prerequisite:** Phase 0 is complete. All docs bannered, runbook OS-aware, skills refactored, validator spec written.
**Parent doc:** `docs/audit/e2e/scope-proposal.md` §4 (canonical — read if you need more context on sequencing or cross-cutting rules)

## Goal statement

Drive the full Playwright web E2E suite to **two consecutive green passes** within this session. No nightly loops, no CI promotion, no merge gating — just two clean runs back-to-back.

## Baseline (measured 2026-05-14 on macOS/Apple Silicon)

| Metric | Value |
|---|---|
| Total specs | 27 (1 setup + 26 product) across 5 projects |
| Journey specs | 20 under `flows/journeys/` |
| Pass / Fail / Flaky | 15 / 13 / 3 |
| Pass rate | 48% (54% counting flaky retries) |
| Wall-clock (CI-equivalent, 1 worker) | 23m 01s |
| Baseline log | `docs/audit/e2e/runs/baseline-20260514-134028.log` |

## How to run the suite

```bash
# Full suite against deployed staging (CI-equivalent, 1 worker)
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  EXPO_PUBLIC_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm run test:e2e:web --reporter=list,json

# Smoke only (~3 min)
doppler run -c stg -- pnpm run test:e2e:web:smoke

# Single spec
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  EXPO_PUBLIC_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j04-parent-inline-learn.spec.ts --workers=1
```

**Why `PLAYWRIGHT_SKIP_LOCAL_API=1`:** The local-API path is broken-by-design — the prebuilt web bundle has `EXPO_PUBLIC_API_URL` baked in at build time pointing at staging. See `docs/audit/e2e/baseline-2026-05-14.md` § "Local-API blocker".

**Why `CI=1`:** Forces 1 worker (Cloudflare WAF rate-limit guard on shared staging), retries=1, forbidOnly=true. Matches CI behaviour.

## Failure inventory (13 failures + 3 flakes)

### Cluster A — Splash/pointer-event block (6 specs, highest leverage)

| Spec | Summary |
|---|---|
| `j04-parent-inline-learn.spec.ts` | Parent taps child card |
| `j05-parent-switch-to-child.spec.ts` | Parent opens linked child progress |
| `j06-child-switch-to-parent.spec.ts` | Parent opens child progress and returns home |
| `j07-parent-dashboard-drilldown.spec.ts` | Parent → child progress → session recap |
| `j16-parent-drilldown-back-chain.spec.ts` | Parent drill-down → topic detail → unwind |
| `j17-parent-session-recap-copy.spec.ts` | Parent opens session recap → copy prompt |

**Shared cause:** EUPW-1 — `AnimatedSplash` overlay intercepts pointer events. All time out around 34s at `locator.click()`. A partial fix landed via PR #211 (`acceptsTouches` gating in `apps/mobile/src/components/AnimatedSplash.tsx`) but is insufficient.

**Approach:** Complete the splash fix (not from scratch — build on PR #211's `acceptsTouches` gating). Verify all 6 specs pass after the fix. This single fix likely unblocks 6/13 failures.

### Cluster B — Confirmed spec drift (2 specs, fix the spec not the app)

| Spec | Problem | Fix |
|---|---|---|
| `j08-ask-freeform-session-summary.spec.ts` | References stale testID `intent-ask` | Update to `home-ask-anything` (current source) |
| `w05-tab-routes-render-correct-screen.spec.ts` | Expects "Profile" button on More tab | Update to current UI: "Account / Privacy & data / Help & feedback" |

### Cluster C — Open-question failures (5 specs, investigate from first principles)

| Spec | Prior-audit claim | What to actually do |
|---|---|---|
| `j01-ux-pass.spec.ts` | Long screenshot crawl, new failure since May 8 | Fresh root-cause. Don't trust May 8 ledger. |
| `j09-learn-create-subject-onboarding.spec.ts` | May 8 says spec drift on empty-home testID | Verify against current onboarding code. May be correct now. |
| `j10-practice-quiz-cycle.spec.ts` | May 8 said missing `usage_events` table — table now exists (`packages/database/src/schema/billing.ts:94`) | Different cause, undiagnosed. Investigate fresh. |
| `j12-pre-profile-create-profile.spec.ts` | Pre-profile gate vs generic onboarding | Verify which is the intended current behaviour. |
| `j13-consent-pending-parent-approval.spec.ts` | May 8 says consent-gate bypass; May 11 says intentional external-approval landing | The two audits disagree. First-principles diagnosis required. |

### Flakes (3 specs — passed on retry)

| Spec | Notes |
|---|---|
| `[setup] auth.setup.ts` | Seed parent-multi-child + capture storage state |
| `j11-library-to-book-session.spec.ts` | Library shelf-to-book contract |
| `j15-parent-solo-add-first-child.spec.ts` | May 11 claims product moved to "solo adult takes student path" — verify before rewriting |

Stabilise so they pass without retry (retries=0).

## UX bug to fold in

**EUPW-2:** Duplicate parent home onboarding notices — "You're a parent now too" and "This is your home" both rendering simultaneously. Check `ParentHomeScreen.tsx` and gating around `orientationCueTitle`. Surfaced during May 11 audit, not verified against current code. PR #211 was for splash, not these notices.

## New specs to write (≥6)

Cover flows that have no Playwright spec today:

1. **Dictation flow** — learner starts dictation, receives text, reviews
2. **Parent→child detail drill-down** — parent taps child card, sees progress detail
3. **Multi-child switching** — parent switches between children in dashboard
4. **Session recap/transcript** — learner completes session, views recap
5. **Vocabulary/topic recall** — learner reviews vocabulary or topic recall
6. **Subscription upgrade UX** — free user sees paywall, taps upgrade

These are journey specs under `apps/mobile/e2e-web/flows/journeys/`. Each needs a seed scenario (check `SeedScenario` type in `apps/api/src/services/test-seed.ts` for available ones).

## Doppler fail-closed implementation

Add to `apps/mobile/playwright.config.ts` (or a shared setup file):

When `TEST_SEED_SECRET` is missing at Playwright project setup, terminate immediately with:

```
TEST_SEED_SECRET not found. Wrap your command with:
  doppler run --project mentomate --config stg -- <your command>
```

Verify: running `pnpm run test:e2e:web` WITHOUT `doppler run` wrapper must fail at config load with this message.

## README

Write `apps/mobile/e2e-web/README.md` covering:
- Prerequisites (Node, pnpm, Doppler, Playwright browsers)
- How to run (smoke, full, single spec) — with the `doppler run -c stg` wrapper
- Seed endpoint behaviour (`POST /v1/__test/seed`, `TEST_SEED_SECRET` header)
- Available seed scenarios (link to `SeedScenario` type)
- Local-API caveat (broken-by-design, `EXPO_PUBLIC_API_URL` baked at build time)
- Troubleshooting (WAF rate limits, seed 403, Clerk sign-in flakes)

## Classification rule (non-negotiable)

For **every** failure, classify before fixing:

| Classification | Action |
|---|---|
| **App bug** | Fix the app code. The spec was correct. |
| **Spec drift** | Fix the spec to match current product. Preserve the original assertion as a regression test where possible. |
| **Undiagnosed** | Investigate from first principles against current code. Do NOT trust audit-doc claims without verification. |

The May 8 ledger (`docs/audit/2026-05-08-web-e2e-full-suite-bug-ledger.md`) and May 11 pass (`docs/audit/2026-05-11-end-user-playwright-bug-pass.md`) are **COMPANION** docs — point-in-time triage signals, not authoritative. Three entries are already verified-stale (J-10 SQL error, J-19 paywall, W-01/W-04 practice intent).

## Cross-cutting rules

- **App is source of truth.** Never weaken an assertion to make a failing test pass.
- **No silent swallows.** No `.catch(() => null)` or `try/catch` that turns a critical wait into a pass.
- **GC1/GC6.** No new internal `jest.mock()`. Pre-commit hook enforces.
- **Subagents never commit.** Only the `/commit` skill commits.
- **15-min hard limit on infra debugging.** If an infra issue (Cloudflare WAF, seed endpoint, Clerk) isn't resolved in 15 minutes, document it and move on.

## Exit criteria (all must hold)

- [ ] Full Playwright suite passes twice consecutively without intervention between runs
- [ ] Journey spec count ≥ 26 (`ls apps/mobile/e2e-web/flows/journeys/*.spec.ts | wc -l`)
- [ ] Running `pnpm run test:e2e:web` without `doppler run` fails with "TEST_SEED_SECRET not found"
- [ ] `apps/mobile/e2e-web/README.md` exists, covers prerequisites + Doppler + scenarios + local-API caveat
- [ ] No `.catch(() => null)` silent swallows in spec files (`rg "\.catch\(\(\)" apps/mobile/e2e-web/` returns zero)

## Key files

| Path | What |
|---|---|
| `apps/mobile/e2e-web/flows/` | All Playwright specs |
| `apps/mobile/e2e-web/helpers/` | Shared test helpers, page objects |
| `apps/mobile/playwright.config.ts` | Playwright config (projects, timeouts, webServer) |
| `apps/mobile/src/components/AnimatedSplash.tsx` | Splash overlay — Cluster A root cause |
| `apps/mobile/src/screens/ParentHomeScreen.tsx` | EUPW-2 duplicate notices |
| `apps/api/src/services/test-seed.ts` | Seed scenarios (`SeedScenario` type) |
| `apps/api/src/routes/test-seed.ts` | Seed endpoint handler |
| `docs/audit/e2e/baseline-2026-05-14.md` | Measured baseline |
| `docs/audit/2026-05-08-web-e2e-full-suite-bug-ledger.md` | COMPANION — May 8 triage (3 entries stale) |
| `docs/audit/2026-05-11-end-user-playwright-bug-pass.md` | COMPANION — May 11 root-cause analysis |

## Suggested order of work

1. **Cluster A first** (splash fix) — highest leverage, unblocks 6 specs
2. **Cluster B** (spec drift) — quick wins, 2 specs
3. **Cluster C** (open questions) — investigate each from first principles
4. **Flakes** — stabilise the 3 flaky specs
5. **EUPW-2** — duplicate notices UX bug
6. **New specs** (≥6) — write after existing failures are resolved
7. **Doppler fail-closed** — implement in playwright.config.ts
8. **README** — write after everything else is stable
9. **Two green passes** — run full suite twice, both must pass
