## Completion Summary — 2026-06-15

**What was done:**
Audited the WP-3 consent reader/writer surface (`services/consent.ts` + consent Inngest functions) against the WP-1 enumeration and wired the one unbranched site to the existing `consent-v2` twin behind `IDENTITY_V2_ENABLED`. The routes (`routes/consent.ts`, `routes/consent-web.ts`) and the consent Inngest functions (`consent-reminders.ts`, `consent-revocation.ts`) were already fully branched (CUT-B2); the real gap was `inngest/functions/archive-cleanup.ts`, which the WP-1 §3.5 Inngest-functions table missed and which had no v2 branching at all — its three legacy consent calls would 500 post-DROP when the flag is true.

**What changed:**
- `apps/api/src/inngest/functions/archive-cleanup.ts` — added `[CUT-B2]` branching in the `hard-delete-archived-profile` step via `isIdentityV2EnabledInStep()`. V2 path: `getConsentStatus` → `resolveLatestConsentStatusAnyBasis` (org resolved via `resolveOrgIdForPerson`; consent check skipped when `orgId` is null, matching legacy null-return behavior); `getProfileForConsentRevocation` → `getPersonForConsentRevocationV2`; `deleteArchivedProfileIfStillEligible` → `deleteArchivedPersonIfStillEligibleV2`. Legacy path left intact. F-122 TOCTOU-safe atomic delete semantics preserved (eligibility folded into the v2 helper's DELETE WHERE).
- `apps/api/src/inngest/functions/archive-cleanup.test.ts` — 5 new v2-path tests (atomic delete, consent-restored, no-archivedAt, retention-window, null-orgId) gated on `IDENTITY_V2_ENABLED=true`; new v2 mocks follow the existing GC1-compliant `jest.requireActual()` + targeted-override pattern with `gc1-allow` annotations.

**Verification:**
- `pnpm exec nx run api:typecheck` — passed.
- `pnpm exec nx run api:lint` — 0 errors (2 pre-existing warnings, unrelated).
- Jest `--findRelatedTests archive-cleanup.ts` — 38 suites / 1022 tests green.
- Pre-push hook (tsc --build + surgical jest) — passed.
- PR #1184 — Gate-1 4/4 required checks green (a re-run confirmed the identity-reseed integration failure was flaky shared-DB interference, not this code); claude-review APPROVED; squash-merged to `main` at ffd0bbdc8ad6080cc1f8e026f4dc14bfd5dcfd1c (merged on UNSTABLE for the ambient run-smoke only, owned by WP-9).

**Caveats / Follow-ups:** Most consent sites were already v2-wired (CUT-B2) before this WI — the only substantive change was `archive-cleanup.ts`, which the WP-1 §3.5 Inngest-functions enumeration missed; WP-1 should be amended to list it so the enumeration is complete for any later cutover audit.
