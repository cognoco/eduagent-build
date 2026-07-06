# WI-1405 — Review evidence (claude-code:reviewer-ws44)

WI-1405 — Billing v2 live-path + child-facing + top-up test coverage gaps (WS-44 Coverage Debt)
Reviewed: 2026-07-06 · Reviewer: claude-code:reviewer-ws44 · Producer: codex:builder:WI-1405 (independent — gate OK)

## Disposition: DONE

## Landing verification
- PR #1940 MERGED at 2026-07-06T09:54:07Z, base `main`.
- Fixed In `093dffc2893a4040429effd0005903762affce14` = PR merge commit = origin/main tip; `git merge-base --is-ancestor` → OK.
- PR checks: 14 passed / 0 failed (`gh pr checks 1940`). PR-head check-runs all `success` (incl. `API Quality Gate`, `Flag-ON integration (IDENTITY_V2_ENABLED)`, `maestro-validator`, `claude-review`, `Playwright web smoke`). Merge-commit check-runs: success/skipped only, no failures.

## Mechanical DoD
`review.ts --check WI-1405` → mechanicalOk: true, 0 mechanical gaps (completion summary sectioned, Fixed In, dates, AC present).

## Local re-verification (run NOW, this session, at 093dffc)
- API integration (real Neon DB, Neon HTTP driver): `jest --config apps/api/jest.integration.config.cjs --runTestsByPath` on the 3 new suites → **3 suites / 13 tests passed** (metering.integration, family-v2.integration, quota-provision-v2.integration).
- API seed unit: test-seed.test.ts → **1 suite / 145 passed** (includes new `child-quota-exceeded` scenario registration).
- Mobile focused: session/index.test.tsx + subscription.test.tsx + QuotaExceededCard.test.tsx → **3 suites / 127 passed**.
- Mobile `tsc --noEmit -p apps/mobile/tsconfig.json` → exit 0.
- Maestro static validator → **7/7 checks passed** (C3 testID refs, C4 seed scenario, C7 tags all cover the new flow).

## AC-by-AC
- **AC1** quota-provision-v2.integration.test.ts: role from membership roles (owner/child); absent-row provisioning with tier limits + `lazy_provisioned` Inngest event; stale-limit update preserving usage (7/2 kept); missing/cross-org/archived → null, no row written. Real DB, real service; only `inngest.send` spied (external dispatch boundary). ✓
- **AC2** metering.integration.test.ts: real `meteringMiddleware` via Hono `app.request`; absent child row lazy-provisioned and decremented exactly once (usedThisMonth/usedToday = 1) with shared pool untouched (0/0) — pins per-profile vs shared-pool; child 402 body `topUpCreditsRemaining: 0` while owner's 500-credit top-up exists and remains unconsumed. Adversarial fixture `profileMeta.isOwner: true` with child profileId (annotated in-file L205) pins DB-derived role over profileMeta — the red/green property AC1/AC2 demand. ✓
- **AC3** family-v2.integration.test.ts: list (archived excluded), pool status, add-validate same-org existing profile for family+pro; free/plus add rejected; over-cap + cross-org add rejected; remove archives person + revokes guardianship edges + drops from list/count; owner/cross-org removal rejected; cross-account throws ProfileRemovalNotImplementedErrorV2. Real DB, zero mocks. ✓
- **AC4** session/index.test.tsx: child profile (sessionIsOwner=false) + structured QuotaExceededError 402 → quota-exceeded-card, input-disabled-banner, quota-notify-parent-btn, quota-go-home-btn, no "Upgrade plan". QuotaExceededCard.test.tsx: child view hides quota-upgrade-btn AND quota-topup-btn even with topUpCreditsRemaining=500. Maestro `child-in-chat-quota-exceeded.yaml`: asserts quota-exceeded-card, quota-notify-parent-btn, quota-go-home-btn, assertNotVisible quota-upgrade-btn; backed by new real `child-quota-exceeded` seed (guardianship, consent, exhausted per-profile child quota, active session). Device assertions honestly marked deferred (flow header comment + completion-summary caveat) — no faked device evidence. ✓
- **AC5** subscription.test.tsx: purchase → polling UI (`top-up-polling-cancel`); first post-purchase poll returns unchanged baseline (25) → no confirm (pins strict `>` over `>=`); second poll 525 → success alert + polling state cleared; usage refetch counted per poll. Real polling logic over routed mock fetch; only RevenueCat SDK hooks mocked (external boundary). ✓
- **AC6** No live-purchase claims made; flow uses seeded confirmed state; RevenueCat sandbox/live purchase remains verify-at-e2e-run per caveat. ✓

## Lane invariant (tests exercise real behavior)
- No new internal mocks anywhere in the diff. API integration suites hit the real DB + real services/middleware; only `jest.spyOn(inngest, 'send')` (durable-dispatch boundary).
- Mobile suites use pre-existing annotated external/native/transport boundary mocks (react-i18next, expo-router, safe-area, theme, routed-fetch api-client transport, RevenueCat).
- No weakened assertions; fixtures are adversarial where it matters (isOwner:true vs DB child role; owner top-up present but hidden from child 402).

## Advisory review triage (Claude Code Review — newest head comment 09:39 = CHANGES_REQUESTED, 0 blocking, 1 SHOULD_FIX)
- Finding: "GC6 escape misused" — gc1-allow annotation added to pre-existing `jest.mock('../../../lib/feature-flags')` in session/index.test.tsx.
- Triage verdict: **not blocking; premise already satisfied.** The mock body has been the canonical GC6 pattern (`...jest.requireActual('../../../lib/feature-flags')` + a single targeted `FEATURE_FLAGS` override) since before this PR — the PR's only change on that line is the annotation comment. The bot's suggested fix (a) "convert to requireActual with targeted overrides" is already the state of the code. FEATURE_FLAGS is a build-time env-resolved constant; a mutable override is the only way tests can vary flags. Real module exports otherwise run real. The annotation is redundant belt-and-braces, not a coverage weakening.
- Earlier 08:08 CHANGES_REQUESTED (metering isOwner fixture ambiguity) was addressed in commit 3 (in-file intent comment at metering.integration.test.ts:205).
- CodeRabbit: rate-limited, did not run (advisory, non-required).

## Scope notes (FYI, not gaps — outside AC1–AC6)
WI body enumerates broader audit findings not contracted by the ACs: ChildPaywall 24h notify-cooldown untested; no billing e2e for cancellation/downgrade/purchase-failure/past-due; use-purchase-confirmation-poll onSlowPoll half. These remain open surface for future WS-44 items.

## Policy overrides applied
- WS-44 kickoff waiver: WP-child formality waived (direct Item slice) — no WP linkage required. No other DoD relaxation applied. Landing branch main (default) — matched.
