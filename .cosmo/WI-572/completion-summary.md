## Completion Summary — WI-572 (WP-W1-authority-graph)

**What was done:**
Broke the 4-node SCC `{settings, family-access, consent, notifications}` by severing the two root edges: `family-access → consent` and `consent → notifications`. This is the structural half of F-004 + F-029 (three-layer authority model, inv-22). The semantic consent-gate enforcement (runtime `isGdprProcessingAllowed` semantics) remains in WI-576.

**What changed:**
- `apps/api/src/services/age-utils.ts` (new) — extracted `calculateAge`, `calculateAgeFromParts`, `MINIMUM_AGE` from `consent.ts` into a leaf module with zero service imports
- `apps/api/src/services/notifications/email.ts` (new) — extracted email primitives (`sendEmail`, `formatConsentRequestEmail`, `formatConsentReminderEmail`, `formatSecurityNotificationEmail`, `EmailPayload`, `EmailOptions`, `EmailResult`) into a leaf module with only `@eduagent/schemas` + `logger` + `sentry` deps
- `apps/api/src/services/consent.ts` — imports age-utils + notifications/email; re-exports both sets for backward compat
- `apps/api/src/services/family-access.ts` — imports `calculateAge` from age-utils (not consent)
- `apps/api/src/services/notifications.ts` — re-exports email primitives from notifications/email; removes ~190 lines of now-extracted code
- `apps/api/src/services/family-access.ts` + `family-access.test.ts` — stale comment references updated from `consent.ts` → `age-utils.ts`

**Verification:**
- PR #859: https://github.com/cognoco/eduagent-build/pull/859
- All 6 CI checks passed (API Quality Gate, claude-review, CodeRabbit, changes, Playwright web smoke, main)
- Pre-commit + pre-push hooks passed: lint, tsc --build, jest findRelatedTests
- 2975 tests passed across 112 suites (pre-push coverage)
- TypeCheck: `pnpm exec nx run api:typecheck` clean
- Lint: `pnpm exec nx run api:lint` clean after `nx reset`
- Post-refactor graph is acyclic: age-utils + notifications/email are leaves; consent → notifications/email only; family-access → age-utils only

**Caveats / Follow-ups:**
- The remaining `notifications → consent` edge (notifications checks `isGdprProcessingAllowed` before sending) is intentional and correct — it is the right authority direction
- F-029 semantic half (runtime consent gate enforcement) deferred to WI-576 (W2) per scope discipline
- Pre-existing TS6305 stale-build artifacts in `eval-llm/flows/` are unrelated to this change (no-op in new worktrees without prior tsc --build)
