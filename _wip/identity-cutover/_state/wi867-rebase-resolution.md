# WI-867 Rebase Resolution — wi867-final salvage

**Date:** 2026-06-30
**Branch:** `wi867-final`
**HEAD:** `820975059`
**Base:** `660f784d0` (origin/main at salvage time)

## Salvage summary

Two commits cherry-picked clean onto `660f784d0` with zero conflicts:

1. `b0934f5c1` — `refactor(api): collapse IDENTITY_V2_ENABLED flag branch to v2-only; migrate unit suites [WI-867]` (125 files)
2. `820975059` — `fix(integration): seed v2 identity graph in all flag-OFF integration suites [WI-867]` (12 files: 9 API co-located + 3 cross-package)

## Overlap prod files — combined state

Files that appear in both the collapse change-set and the #1644 / prior-main additive edits:

| File | Collapse changes (diff lines vs origin/main) | #1644 / main additive edits | Status |
|---|---|---|---|
| `apps/api/src/inngest/functions/session-completed.ts` | 199 — removes `isIdentityV2EnabledInStep()` branches, `profiles`/legacy query arms | `isGdprProcessingAllowed` import reordered (cosmetic) | PRESERVED — no #1644 content in this file; collapse-only |
| `apps/api/src/inngest/functions/weekly-progress-push.ts` | 303 — removes flag branches, legacy `accounts`/`familyLinks`/`profiles` arms, v0 `listEligibleSelfReportProfileIds` | Email-dedup gate (`dedup_24h`, `recentEmailCount`, `BUG-699-FOLLOWUP`) present at lines 725-878 | PRESERVED — email-dedup gate verified by grep |
| `apps/api/src/inngest/functions/billing-alias-merge.ts` | 0 — identical to origin/main | N/A (not in #1644 change set) | PRESERVED |
| `apps/api/src/services/billing/alias-merge.ts` | 0 — identical to origin/main | `updateQuotaPoolLimit` + `survivorQuota` sync (`BUG-783`) at lines 53, 262-285 | PRESERVED — quotaPool sync verified by grep |
| `apps/api/src/inngest/functions/archive-cleanup.ts` | 84 — flag collapse | No #1644 changes | PRESERVED |
| `apps/api/src/inngest/functions/trial-expiry.ts` | 170 — flag collapse | No #1644 changes | PRESERVED |
| `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts` | 22 — flag collapse | No #1644 changes | PRESERVED |
| `apps/api/src/inngest/functions/notifications.ts` | 0 — identical to origin/main | No #1644 changes | PRESERVED |
| `apps/api/src/routes/session-crud.ts` | 0 — identical to origin/main | No #1644 changes | PRESERVED |
| `apps/api/src/inngest/functions/coaching-cards.ts` | 0 — identical to origin/main | No #1644 changes | PRESERVED |
| `apps/api/src/services/billing/billing-v2/account-deletion.ts` | 0 — identical to origin/main | No #1644 changes | PRESERVED |
| `apps/api/src/services/freeform-filing.ts` | 0 — identical to origin/main | No #1644 changes | PRESERVED |

## #1644 preservation verdict

- `apps/api/src/services/billing/alias-merge.ts`: **PRESERVED** — diff vs origin/main is empty; `updateQuotaPoolLimit`/`survivorQuota` code present at expected lines.
- `apps/api/src/inngest/functions/weekly-progress-push.ts`: **PRESERVED** — collapse removes ~175 legacy lines; `BUG-699-FOLLOWUP` email-dedup gate (`recentEmailCount`, `dedup_24h`) intact at lines 725-878.
- `apps/api/src/inngest/functions/session-completed.ts`: **PRESERVED** — no #1644 content in this file (the team-lead brief listed it; #1644 did not modify it).

## tsc result

`pnpm exec nx run api:typecheck` — **CLEAN** (zero errors). All dependent packages (`@eduagent/schemas`, `@eduagent/database`, `@eduagent/retention`, `@eduagent/test-utils`) typecheck clean first.

## Integration suite result

Flag-off run (`env -u IDENTITY_V2_ENABLED`) of the 3 binding cross-package suites:

- `tests/integration/stripe-webhook.integration.test.ts` — **FAILED** (pre-existing)
- `tests/integration/inngest-trial-expiry.integration.test.ts` — **FAILED** (pre-existing)
- `tests/integration/inngest-quota-reset.integration.test.ts` — **FAILED** (pre-existing)

Root cause: `error: relation "accounts" does not exist` on the Neon test DB loaded from Doppler. **Confirmed pre-existing on origin/main** — same 3 failures, same error, identical pass/fail count (4 passed / 7 failed / 3 suites). Not a regression introduced by wi867-final.

Note: `[integration-setup] Using Neon HTTP driver` confirms these tests target the remote Neon stg DB, not local postgres. The local DB at localhost:5432 is accepting connections (verified) but is not used by this test harness.

## Conclusion

The `wi867-final` tree is clean: tsc passes, all prod files either collapse the flag branch correctly or are identical to origin/main, and all additive #1644 edits (quotaPool sync + email-dedup gate) coexist cleanly with the collapse. The 3 cross-package integration failures are environmental / pre-existing, not regressions.
