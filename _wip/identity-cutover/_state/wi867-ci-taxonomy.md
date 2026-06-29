# WI-867 post-collapse CI taxonomy — run 28396862777, commit 17c7670d4

Adjudicated by shepherd 2026-06-29 from researcher `taxonomy-867` (read-only) + cross-checked vs orchestrator ic-orch-305 independent read. **Both converge.**

## Verdict
- **a-set: NONE.** No inherited quarantine skips walling.
- **b-set: NONE.** WI-1153 quarantine = SKIPPED (not failing); E-bucket = unit job (did not fail this run).
- **c-set: ALL of it** — NEW collapse-induced. **Zero production-code changes needed** (collapse is architecturally correct; prod + unit suites are properly v2-only).
- **Unified root cause (primary-source):** `git show 17c7670d4 --stat` touched **zero `*.integration.test.ts` files**. The collapse migrated prod + unit suites but left every integration-test seed harness on v1 → v2-only prod code finds no v2 identity graph / caller context.

## Required `main` lane (flag-OFF, the BINDING gate) — 3 suites / 7 tests
`if (isIdentityV2Enabled())` seed guards skip v2 seeding in the flag-off lane:
- `tests/integration/stripe-webhook.integration.test.ts` — 5 tests (checkout 500 cascade; seedAccount guard :120)
- `tests/integration/inngest-trial-expiry.integration.test.ts` — 1 test (guards :72,136,175; short-circuit :250)
- `tests/integration/inngest-quota-reset.integration.test.ts` — 1 test (guards :43,80)

## Flag-ON lane (advisory, NOT a required check) — 10 suites / 53 tests
Seeds run but are INSUFFICIENT (missing v2 person/org/membership rows + caller context + v2 consent schema):
- consent-web (10, all 404 — v1 consent_states vs v2 consent_requests), session-exchange (4), nudge (5), session-lifecycle (4), progress-summary (4), onboarding (4), learner-profile (~17 multi-cluster), settings (2), session-exchange-ownership (6), session-exchange-pii (4)
- Signatures: `ForbiddenError` (family-bridge-v2.ts:68), `OnboardingNotFoundError: profile not found`, `TypeError callerPersonId` (identity-v2-opts.ts:38), 404 (consent-web.ts:353)

## Builder fix clusters (single builder, sequential — NO parallel; learner-profile spans clusters)
- **C1** (required gate): remove `isIdentityV2Enabled()` seed guards in the 3 cross-package suites → seed v2 graph unconditionally.
- **C2+C4**: extend co-located service-integration seeds to create the v2 identity graph (owner-person→org + parent-child membership) via the `ensureLegacyProfileAnchorForTest`/#1638 pattern; consent-web → use `apps/api/src/test-utils/consent-seed.ts` v2 seeding.
- **C3**: thread v2 caller context (`callerPersonId`) into settings + learner-profile integration request setup.
- **C5**: session-exchange — delete/adapt the dead `flag=OFF` inline-path test; seed v2 `person` rows (with `birthDate` for PII/minor tests) for ownership/PII suites.

## Merge gate (ic-orch-306)
(1) required `main` GREEN; (2) Codex review APPROVED or MUST/SHOULD_FIX resolved; (3) orchestrator confirm at flag. claude-review RED + Flag-ON RED = NOT blockers.
