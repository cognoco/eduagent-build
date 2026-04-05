# Bug Fix Plan — Legacy PR Review Findings (PRs #1-40)

> **Generated:** 2026-04-04
> **Source:** Claude Code automated review findings from PRs #1-40, cross-referenced against current codebase on branch `diverse`.
> **Methodology:** All critical/high/major findings were extracted, then each was verified against the current source code. Only findings confirmed as **still present** are listed below.
> **Live status:** This file is now being used as a working tracker. Items fixed after the initial snapshot are annotated inline with a `Status` note instead of being deleted from the audit trail.

---

## Priority 1 — Security (Must Fix Before Launch)

### S-01: JWT audience validation bypass

- **File:** `apps/api/src/middleware/jwt.ts` (~line 199)
- **Origin:** PR #33, PR #36
- **Severity:** Critical / Security
- **Description:** The guard `if (options?.audience && payload.aud !== undefined)` silently skips audience validation when a token has no `aud` claim. An attacker who strips or omits `aud` bypasses the check entirely when `CLERK_AUDIENCE` is configured. Per RFC 7519 section 4.1.3, tokens lacking `aud` must be rejected.
- **Fix:** Invert the logic — when `options.audience` is set, **reject** tokens where `payload.aud` is `undefined` instead of silently passing them.
- **Status (2026-04-04):** ✅ Fixed in current branch. `verifyJWT()` now rejects tokens that omit `aud` when audience enforcement is configured, and unit tests cover both missing and matching audience claims.

### S-02: CLERK_AUDIENCE not required in production config

- **File:** `apps/api/src/config.ts` (~line 11, lines 53-60)
- **Origin:** PR #36
- **Severity:** High / Security
- **Description:** `CLERK_AUDIENCE` is `.optional()` and not in `PRODUCTION_REQUIRED_KEYS`. If production starts without it, audience claim enforcement is silently disabled, weakening JWT binding.
- **Fix:** Add `CLERK_AUDIENCE` to the `PRODUCTION_REQUIRED_KEYS` array.
- **Status (2026-04-04):** ✅ Fixed in current branch. `CLERK_AUDIENCE` is now required by production env validation and covered by config tests.

### S-03: Missing subject ownership validation

- **File:** `apps/api/src/services/retention-data.ts` (setTeachingPreference, ~line 545)
- **File:** `apps/api/src/routes/settings.ts` (analogy-domain, native-language routes)
- **Origin:** PR #29, PR #31
- **Severity:** High / Security
- **Description:** `setTeachingPreference`, `setAnalogyDomain`, and `setNativeLanguage` accept `subjectId` from the URL without verifying it belongs to the caller's `profileId`. A user who discovers a foreign subject UUID can create preferences for it, causing cross-tenant referential drift. Route-level `subjectId` also lacks Zod UUID validation.
- **Fix:** Add ownership check (`repo.subjects.findFirst({ profileId, id: subjectId })`) before upsert. Add `z.string().uuid()` validation for `subjectId` in route handlers.
- **Status (2026-04-04):** ✅ Fixed in current branch. The preference setters now verify subject ownership before upsert, `subjectId` params are UUID-validated in retention/settings routes, and missing subjects return clean 404s.

### S-04: Evaluate reads bypass createScopedRepository

- **File:** `apps/api/src/services/evaluate-data.ts` (~lines 114, 154, 213)
- **Origin:** PR #31
- **Severity:** High / Architecture violation (security implication)
- **Description:** `advanceEvaluateRung`, `processEvaluateFailureEscalation`, and `getEvaluateSessionState` all use `db.query.retentionCards.findFirst` directly instead of `createScopedRepository(db, profileId)`, violating the mandatory profile-scoped data access rule.
- **Fix:** Replace direct DB reads with scoped repository pattern in all three functions.
- **Status (2026-04-04):** ✅ Fixed in current branch. All three EVALUATE reads now use `createScopedRepository(db, profileId)`, with regression tests asserting the scoped path.

### S-05: Stale consent metadata on re-PENDING

- **File:** `apps/api/src/services/consent.ts` (~line 148)
- **Origin:** PR #23
- **Severity:** High / Security
- **Description:** `createPendingConsentState` on conflict sets `status: 'PENDING'` and `updatedAt` but does NOT clear `respondedAt`, `parentEmail`, or `consentToken`. If a previously-CONSENTED record gets re-set to PENDING, stale approval tokens could remain valid.
- **Fix:** Clear `respondedAt: null`, `parentEmail: null`, `consentToken: null` in the `onConflictDoUpdate` set.
- **Status (2026-04-04):** ✅ Fixed in current branch. Reverting a consent row to `PENDING` now clears stale approval metadata, with a service test covering the conflict-update payload.

### S-06: No Row-Level Security (RLS) on tenant data tables

- **File:** `apps/api/drizzle/` (all migration snapshots)
- **Origin:** PR #36
- **Severity:** High / Security (defense-in-depth)
- **Description:** Every table has `isRLSEnabled: false`. No Postgres RLS policies exist for multi-tenant data (profiles, sessions, consent, billing). The application-layer profile scoping is the only barrier.
- **Fix:** Enable RLS on key tenant-data tables and create policies for `profileId`-scoped access. This is a defense-in-depth measure — not blocking launch if application-layer scoping is verified correct, but should be a near-term priority.

### S-07: Debug log level in staging

- **File:** `apps/api/wrangler.toml` (~line 112)
- **Origin:** PR #35
- **Severity:** Medium / Security-adjacent
- **Description:** `LOG_LEVEL = "debug"` in staging writes request bodies, user/profile IDs, and DB query results to Cloudflare logs (retained for days, accessible to anyone with account access).
- **Fix:** Change staging `LOG_LEVEL` to `"info"` or `"warn"`.
- **Status (2026-04-04):** ✅ Fixed in current branch. Staging `LOG_LEVEL` changed from `"debug"` to `"warn"`.

---

## Priority 2 — Data Integrity & Race Conditions

### D-01: SM-2 skipped for newly created retention cards

- **File:** `apps/api/src/services/retention-data.ts` (~lines 782-788)
- **Origin:** PR #23 (flagged twice as Critical)
- **Severity:** Critical / Correctness
- **Description:** The double-counting guard compares `card.updatedAt >= sessionTimestamp`. When `ensureRetentionCard` creates a new card, `updatedAt` defaults to `now()`. Since `now() >= sessionTimestamp` is always true for new cards, the guard fires and SM-2 recalculation is **never** performed on a card's first encounter. This breaks the spaced-repetition algorithm for every new topic.
- **Fix:** Track whether the card was newly inserted (e.g., `isNewCard` flag from `ensureRetentionCard`) and skip the guard for new cards.
- **Status (2026-04-04):** ✅ Fixed. `ensureRetentionCard` now returns `{ card, isNew }`. Double-counting guard skips new cards.

### D-02: Retention cooldown check is racy (non-atomic)

- **File:** `apps/api/src/services/retention-data.ts` (~lines 289-338)
- **Origin:** PR #34
- **Severity:** High / Data Integrity
- **Description:** The cooldown read (`effectiveCard.lastReviewedAt`) and the write (`lastReviewedAt = now()`) are separate queries. Two concurrent recall-test requests can both pass the cooldown check and both commit within the same 24-hour window, allowing double-testing.
- **Fix:** Use an atomic `UPDATE ... WHERE lastReviewedAt < cooldown_threshold` (compare-and-swap) to enforce the cooldown at the DB level.
- **Status (2026-04-05):** ✅ Fixed in current branch. Atomic `UPDATE ... WHERE` guard rejects concurrent cooldown violations; regression tests cover both rejection and first-review paths.

### D-03: Session exchange-limit enforcement is racy

- **File:** `apps/api/src/services/session.ts` (~lines 451-464, 852, 908)
- **Origin:** PR #34
- **Severity:** High / Data Integrity
- **Description:** `checkExchangeLimit` reads `exchangeCount` as a snapshot before the LLM call. Concurrent requests can both read `exchangeCount = 49`, both pass the `< 50` check, both complete LLM work, and both increment — exceeding the cap.
- **Fix:** Use an atomic conditional update: `UPDATE sessions SET exchangeCount = exchangeCount + 1 WHERE exchangeCount < limit RETURNING exchangeCount`.
- **Status (2026-04-05):** ✅ Fixed in current branch. `persistExchangeResult` uses atomic `SET exchangeCount = exchangeCount + 1 WHERE exchangeCount < MAX` with regression tests.

### D-04: Parking lot TOCTOU race

- **File:** `apps/api/src/services/parking-lot-data.ts` (~lines 63-98)
- **Origin:** PR #2
- **Severity:** Medium / Data Integrity
- **Description:** The count check (`existing.length >= MAX_ITEMS_PER_TOPIC`) and insert are separate queries with no transaction. Concurrent POSTs can exceed the per-session limit.
- **Fix:** Wrap in a transaction or use a DB-level constraint.
- **Status (2026-04-05):** ✅ Fixed in current branch. `addParkingLotItem` wraps count check + insert in `db.transaction()`; regression tests verify transactional behavior.

### D-05: No DB-level CHECK constraints for numeric fields

- **File:** `packages/database/src/schema/billing.ts`, `assessments.ts`
- **Origin:** PR #36
- **Severity:** Medium / Data Integrity
- **Description:** `top_up_credits.remaining` can go negative, `quota_pools.usedThisMonth` can go negative, `retention_cards.intervalDays` can be 0 or negative. No CHECK constraints exist anywhere in the schema.
- **Fix:** Add CHECK constraints: `remaining BETWEEN 0 AND amount`, `usedThisMonth >= 0`, `intervalDays >= 1`, etc.

### D-06: family_links missing integrity constraints

- **File:** `packages/database/src/schema/profiles.ts` (~lines 75-94)
- **Origin:** PR #33
- **Severity:** Medium / Data Integrity
- **Description:** No unique constraint on `(parent_profile_id, child_profile_id)` to prevent duplicates. No CHECK constraint to prevent self-links (`parent != child`). Can create inconsistent relationship graphs.
- **Fix:** Add unique composite index and self-link check constraint.

### D-07: Test-seed `external_id_prefix` is not a valid Clerk API parameter

- **File:** `apps/api/src/services/test-seed.ts` (~line 233)
- **Origin:** PR #30
- **Severity:** High / Correctness
- **Description:** `GET /v1/users?external_id_prefix=...` is not a valid Clerk Backend API parameter. Clerk silently ignores unknown params and returns up to 100 **unfiltered** users. The `/__test/reset` endpoint could delete the wrong users in a shared tenant.
- **Fix:** Use a valid Clerk filter (e.g., list all users and filter client-side by `externalId` prefix), or use `external_id` for exact match per user.

---

## Priority 3 — Correctness & Logic Bugs

### C-01: consecutiveFailures always returns 0 to clients

- **File:** `apps/api/src/services/evaluate-data.ts` (~line 224)
- **Origin:** PR #31
- **Severity:** High / Correctness
- **Description:** `getEvaluateSessionState` always returns `consecutiveFailures: 0` with a comment "tracked in session context." Clients consuming this response cannot render escalation state. The three-strike escalation UX is invisible to the frontend.
- **Fix:** Compute and return the actual `consecutiveFailures` count from session events, or remove the field from the response to avoid a misleading API contract.
- **Status (2026-04-04):** ✅ Fixed. Queries `evaluate_challenge` session events and counts consecutive failures from most recent.

### C-02: New subjects archived too early

- **File:** `apps/api/src/services/subject.ts` (~lines 234-260)
- **Origin:** PR #25
- **Severity:** High / Correctness
- **Description:** `archiveInactiveSubjects` archives subjects with no sessions after the cutoff date. A newly created subject with zero sessions will be immediately eligible for archival — the function has no guard for subjects with no sessions at all or subjects created recently.
- **Fix:** Add a condition to exclude subjects created after the cutoff date or subjects with zero total sessions.
- **Status (2026-04-04):** ✅ Fixed. Added `createdAt <= cutoffDate` condition to archival query.

### C-03: Teach-back assessment regex is key-order dependent

- **File:** `apps/api/src/services/teach-back.ts` (~line 77)
- **Origin:** PR #25
- **Severity:** Medium / Correctness
- **Description:** The regex `/\{[\s\S]*?"completeness"[\s\S]*?"accuracy"[\s\S]*?\}/` requires `"completeness"` before `"accuracy"` in JSON output. If the LLM returns keys in a different order, parsing returns `null` — a false negative that silently fails the assessment.
- **Fix:** Parse with `JSON.parse()` instead of regex, or use a key-order-independent regex pattern.
- **Status (2026-04-04):** ✅ Fixed in current branch. Regex replaced with key-order-independent pattern; explicit check that both `completeness` and `accuracy` fields exist before proceeding.

### C-04: Duplicate EvaluateEligibility type definition

- **File:** `apps/api/src/services/evaluate-data.ts` (~lines 25-33)
- **File:** `packages/schemas/src/assessments.ts` (~line 243)
- **Origin:** PR #31
- **Severity:** Low / Architecture
- **Description:** `EvaluateEligibility` is defined as a local interface in evaluate-data.ts AND also exported from `@eduagent/schemas`. The two definitions can drift.
- **Fix:** Delete the local definition and import from `@eduagent/schemas`.
- **Status (2026-04-04):** ✅ Fixed in current branch. Local interface deleted; `EvaluateEligibility` is now imported from `@eduagent/schemas` and re-exported for existing consumers.

### C-05: Unsafe verificationType type cast

- **File:** `apps/api/src/inngest/functions/session-completed.ts` (~lines 170, 525)
- **Origin:** PR #31
- **Severity:** Medium / Type Safety
- **Description:** `verificationType as string | null | undefined` casts on raw Inngest event data without runtime validation. If a new verification type is added, the downstream `if/else` silently skips it.
- **Fix:** Add `verificationType` to the Inngest event schema definition and use Zod runtime validation.
- **Status (2026-04-05):** ✅ Fixed in current branch. Replaced `as` cast with `verificationTypeSchema.safeParse()` from `@eduagent/schemas`; unknown types log a warning instead of silently skipping. Tests cover unknown and null cases.

### C-06: Missing Zod validation on topicId path parameter

- **File:** `apps/api/src/routes/retention.ts` (~lines 45, 144)
- **Origin:** PR #31
- **Severity:** Medium / Input Validation
- **Description:** `:topicId` path parameter is passed raw to service functions with no UUID format validation. Invalid UUIDs reach the DB and fail with opaque Drizzle errors instead of a clean 400.
- **Fix:** Add `z.string().uuid()` validation at the route handler level.
- **Status (2026-04-04):** ✅ Fixed in current branch. Retention topic routes now validate `topicId` as UUID and return 400 before any DB access.

### C-07: ENV_VALIDATION_ERROR not in shared error-code schema

- **File:** `packages/schemas/src/errors.ts`
- **File:** `apps/api/src/middleware/env-validation.ts` (~line 35)
- **Origin:** PR #25
- **Severity:** Low / Architecture
- **Description:** `envValidationMiddleware` emits `code: 'ENV_VALIDATION_ERROR'` as a string literal, but this code is not in the shared `ERROR_CODES` enum. Client-facing contract mismatch.
- **Fix:** Add `ENV_VALIDATION_ERROR` to the shared error codes enum.
- **Status (2026-04-04):** ✅ Fixed in current branch. `ENV_VALIDATION_ERROR` added to `ERROR_CODES` in `packages/schemas/src/errors.ts`.

---

## Priority 4 — Reliability & Resilience

### R-01: Circuit breaker HALF_OPEN allows multiple simultaneous probes

- **File:** `apps/api/src/services/llm/router.ts` (~lines 120-133)
- **Origin:** PR #34
- **Severity:** Medium / Reliability
- **Description:** `canAttempt` returns `true` for every request in HALF_OPEN state. A recovering provider gets hammered with many trial requests simultaneously instead of one controlled probe.
- **Fix:** Use a flag or atomic counter to allow only one probe request at a time in HALF_OPEN state.
- **Status (2026-04-04):** ✅ Fixed. Added `probeInFlight` flag; only one probe allowed in HALF_OPEN.

### R-02: Circuit failure counting is too broad

- **File:** `apps/api/src/services/llm/router.ts` (~lines 220, 275)
- **Origin:** PR #34
- **Severity:** Medium / Reliability
- **Description:** All error types (including non-transient 4xx errors like bad requests) increment the circuit failure counter. A burst of user-caused bad requests can incorrectly open the circuit for a healthy provider.
- **Fix:** Differentiate transient (5xx, timeout, network) from non-transient (4xx) errors. Only count transient errors toward circuit trips.
- **Status (2026-04-04):** ✅ Fixed. Added `isTransientError()` check; 4xx (except 429) no longer trip the circuit.

### R-03: N+1 query pattern in getChildrenForParent

- **File:** `apps/api/src/services/dashboard.ts` (~line 240)
- **Origin:** PR #2
- **Severity:** Medium / Performance
- **Description:** While subject N+1 was fixed, the `for (const link of links)` loop still fires individual DB queries per child for: `profiles.findFirst`, `getOverallProgress`, `learningSessions.findMany`, `countGuidedMetrics`. For a parent with N children, this is O(N*M) round-trips.
- **Fix:** Batch child profile lookups and aggregate queries.

---

## Priority 5 — Mobile Client Issues

### M-01: Silent error swallowing in COPPA consent resend

- **File:** `apps/mobile/src/app/consent.tsx` (~lines 119-135)
- **Origin:** PR #31
- **Severity:** High / UX + Compliance
- **Description:** The `onResendEmail` callback has a bare `catch {}` with comment "Silently ignore resend errors." When resend fails (rate-limit, network, Clerk outage), the parent sees the spinner then nothing — no indication it failed. The parent never receives the approval email and the child is blocked indefinitely.
- **Fix:** Show an error toast/alert when resend fails.
- **Status (2026-04-04):** ✅ Fixed in current branch. Added `resendError` state and inline error text below the resend button; errors are formatted via `formatApiError()`.

### M-02: childProfileId non-null assertion without runtime guard

- **File:** `apps/mobile/src/hooks/use-consent.ts` (~lines 114, 145, 198)
- **Origin:** PR #23
- **Severity:** Medium / Runtime Safety
- **Description:** `childProfileId!` is used in mutation functions without a runtime guard. The query hook has `enabled: !!childProfileId` but the mutation hooks (`useRevokeConsent`, `useRestoreConsent`) do not guard — calling with `undefined` will crash at runtime.
- **Fix:** Add `if (!childProfileId) throw new Error(...)` guard at the start of each mutationFn.
- **Status (2026-04-04):** ✅ Fixed in current branch. Runtime guards added to `useRevokeConsent`, `useRestoreConsent`, and `useChildConsentStatus` queryFn; non-null assertions removed.

### M-03: copyToCache failure leaves hook in broken state

- **File:** `apps/mobile/src/hooks/use-homework-ocr.ts` (~lines 170-175)
- **Origin:** PR #2
- **Severity:** Medium / Runtime Safety
- **Description:** `await copyToCache(uri)` is called outside the try/catch inside `runOcr`. If `FileSystem.copyAsync` fails (permission denied, disk full), the exception propagates unhandled — `status` never transitions to `'error'`, and the UI has no way to react.
- **Fix:** Wrap the `copyToCache` call in a try/catch that sets error state.
- **Status (2026-04-04):** ✅ Fixed. `copyToCache` wrapped in try/catch with error state transition.

### M-04: hono bundled into mobile app

- **File:** `apps/mobile/package.json` (~line 45)
- **Origin:** PR #2
- **Severity:** Medium / Build Size
- **Description:** `hono` is in `dependencies` instead of `devDependencies`. It's only needed for RPC type inference but ships in the Metro bundle to device.
- **Fix:** Move `hono` to `devDependencies`.
- **Status (2026-04-04):** ✅ Fixed in current branch. `hono` moved from `dependencies` to `devDependencies` in `apps/mobile/package.json`.

### M-05: Teen dark textInverse fails WCAG AA contrast

- **File:** `apps/mobile/src/lib/design-tokens.ts` (~line 86)
- **Origin:** PR #37
- **Severity:** Medium / Accessibility
- **Description:** White text (`#ffffff`) on teal primary (`#2dd4bf`) yields ~1.6:1 contrast ratio, well below the 4.5:1 AA threshold. If `textInverse` is used on primary-colored buttons, this is an accessibility violation.
- **Fix:** Darken the primary color or use a darker text color for `textInverse` to achieve 4.5:1 ratio.
- **Status (2026-04-04):** ✅ Fixed (via BM-06). Dark theme `muted` changed from `#525252` to `#94a3b8`.

---

## Priority 6 — CI, Build & Testing

### CI-01: Missing pre-commit fail-fast (set -e)

- **File:** `.husky/pre-commit`
- **Origin:** PR #28
- **Severity:** Medium / CI
- **Description:** No `set -e` at the top. If `pnpm exec lint-staged` fails, execution continues to `tsc` and `pre-commit-tests.sh`. A lint failure can be masked if the subsequent steps pass.
- **Fix:** Add `set -e` at the top of the script, or add `|| exit 1` after lint-staged.
- **Status (2026-04-04):** ✅ Fixed in current branch. `set -e` added at the top of `.husky/pre-commit`.

### CI-02: pre-commit-tests.sh fallback uses wrong diff base

- **File:** `scripts/pre-commit-tests.sh` (~line 28)
- **Origin:** PR #24, PR #25
- **Severity:** Medium / CI
- **Description:** The bulk fallback for >20 staged files uses `nx affected --base=HEAD~1`, which diffs against the last commit rather than staged changes. Can test unrelated projects or miss staged-only changes.
- **Fix:** Use `--base=HEAD` (diff against current HEAD) or compare against the staged index directly.

### CI-03: Gradle cache key missing Android build files

- **File:** `.github/workflows/e2e-ci.yml` (~line 289)
- **Origin:** PR #35
- **Severity:** Medium / CI
- **Description:** Cache key hashes `gradle-wrapper.properties` and `package.json` but not `build.gradle` or `settings.gradle`. Native dependency changes won't invalidate the cache.
- **Fix:** Include `**/build.gradle*` and `**/settings.gradle*` in the cache key hash.

### CI-04: packager: npm conflicts with pnpm monorepo

- **File:** `.github/workflows/deploy.yml` (~line 210)
- **Origin:** PR #35
- **Severity:** Medium / CI
- **Description:** `expo/expo-github-action@v8` is configured with `packager: npm` while the project uses pnpm. EAS may use npm for lifecycle hooks and workspace resolution, diverging from `pnpm-lock.yaml`.
- **Fix:** Change to `packager: pnpm` or remove the setting if the action auto-detects.
- **Status (2026-04-05):** ⚠️ NOT FIXED — `deploy.yml` line 216 still uses `packager: npm`. Previous status was incorrect.

### CI-05: Hardcoded TEST_SEED_SECRET in e2e-ci.yml

- **File:** `.github/workflows/e2e-ci.yml` (~line 254)
- **Origin:** PR #33, PR #35
- **Severity:** Low / Security Hygiene
- **Description:** `TEST_SEED_SECRET=test-secret` is hardcoded in plaintext. While it only gates test-seed routes in `NODE_ENV=test`, good hygiene says test credentials should come from GitHub Secrets.
- **Fix:** Move to GitHub Actions secrets: `TEST_SEED_SECRET=${{ secrets.TEST_SEED_SECRET }}`.

### CI-06: Timing-attack-vulnerable secret comparison in test-seed

- **File:** `apps/api/src/routes/test-seed.ts` (~line 81)
- **Origin:** PR #33
- **Severity:** Low / Security Hygiene
- **Description:** `if (headerSecret !== secret)` uses direct string equality instead of `timingSafeEqual`. Severity is low since this only protects test-seed routes in non-production.
- **Fix:** Use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.
- **Status (2026-04-05):** ✅ Fixed in current branch. Replaced direct `!==` with HMAC-SHA256 constant-time comparison (matching BS-01 approach).

### CI-07: Maestro hardcoded machine-specific paths

- **File:** `scripts/maestro-env.sh` (~lines 8-13)
- **Origin:** PR #35
- **Severity:** Low / CI Portability
- **Description:** Hardcoded paths to one developer's Windows machine (`C:\AndroidSdk`, specific JDK version, `C:\tools\maestro`). Other contributors and CI get silent path errors.
- **Fix:** Use environment variable fallbacks with auto-detection, or document required env vars.

### CI-08: E2E flows with overly optional assertions

- **File:** `apps/mobile/e2e/flows/homework/camera-ocr.yaml`
- **File:** `apps/mobile/e2e/flows/retention/failed-recall.yaml`
- **File:** `apps/mobile/e2e/flows/learning/core-learning.yaml`
- **Origin:** PR #36
- **Severity:** Medium / Test Quality
- **Description:** Critical UI assertions (camera capture, remediation buttons, session summary) are marked `optional: true`. The flows acknowledge this in comments ("per E2E integrity rules — optional on mandatory UI is prohibited") but still have the markers. Flows can pass while core features are broken.
- **Fix:** Remove `optional: true` from mandatory UI assertions. For hardware-dependent flows (camera), split into separate flows or skip the entire flow on CI.

### CI-09: Time-sensitive DOB in consent E2E flow

- **File:** `apps/mobile/e2e/flows/consent/profile-creation-consent.yaml`
- **Origin:** PR #36
- **Severity:** Medium / Test Reliability
- **Description:** Hardcoded DOB `2010-01-01` is now age 16 (as of 2026-04-04). The under-16 GDPR consent trigger no longer fires. All consent-specific steps are `optional: true` as a workaround, making the test a no-op.
- **Fix:** Use a dynamically computed DOB (e.g., `today - 10 years`) or update to a more recent year.

### CI-10: CORS blocked-origin assertion too weak

- **File:** `tests/integration/health-cors.integration.test.ts` (~line 123)
- **Origin:** PR #29
- **Severity:** Low / Test Quality
- **Description:** `expect(header).not.toBe(origin)` passes even if the server returns `*` for blocked origins. Should assert the header is `null`.
- **Fix:** Change to `expect(header).toBeNull()`.
- **Status (2026-04-04):** ✅ Fixed in current branch. Assertion changed to `toBeNull()` to catch wildcard `*` responses.

### CI-11: Consent-reminders uses raw SQL instead of service function

- **File:** `apps/api/src/inngest/functions/consent-reminders.ts` (~lines 96-103)
- **Origin:** PR #34
- **Severity:** Low / Architecture
- **Description:** The auto-delete step uses raw `db.execute(sql\`DELETE FROM profiles...\`)` instead of a service function, bypassing audit logging and cascade logic (Clerk user deletion, Inngest events).
- **Fix:** Extract into a `deleteProfileIfNoConsent` service function.
- **Status (2026-04-05):** ✅ Fixed in current branch. Extracted `deleteProfileIfNoConsent()` into `services/deletion.ts`; consent-reminders now calls the service function. 4 unit tests cover deletion, retention, already-deleted, and edge cases.

---

## Priority 7 — Documentation Mismatches

### DOC-01: EVALUATE scoring rules conflict within PRD

- **File:** `docs/PRD.md` (~lines 1396, 1406)
- **Origin:** PR #24
- **Description:** FR132 prose says "EVALUATE failure maps to quality 2-3 (not 0-1)" as the floor, but the scoring table maps "I don't know" to quality 1, which is below that floor. Internal contradiction.
- **Fix:** Normalize — either raise "I don't know" to quality 2, or lower the prose floor to include quality 1.

### DOC-02: EVALUATE difficulty rung scale mismatch (1-4 vs 1-5)

- **File:** `docs/PRD.md` (~line 1395) vs `docs/ux-design-specification.md` (~line 2688)
- **Origin:** PR #24
- **Description:** PRD defines `evaluateDifficultyRung` as 1-4. UX spec says 1-5 ("1 = obvious flaw, 5 = subtle flaw"). Code must pick one canonical range.
- **Fix:** Align both docs to the same scale (check what the code actually implements and match).

### DOC-03: Skip action deletes prerequisite edges

- **File:** `docs/ux-design-specification.md` (~line 2363)
- **Origin:** PR #24
- **Description:** The PrerequisiteSkipWarning dialog spec says "Skip Anyway" deletes prerequisite edges. This mutates curriculum structure irreversibly and loses prerequisite history.
- **Fix:** Preserve edges and store the skip decision in audit metadata instead.

---

## Priority 8 — Low Priority / Deferred

### LP-01: Missing pgvector extension in initial migration

- **File:** `apps/api/drizzle/0000_lush_psylocke.sql`
- **Origin:** PR #33, PR #36
- **Description:** Migration uses `vector(1024)` but never runs `CREATE EXTENSION IF NOT EXISTS vector;`. Fails on fresh databases without pgvector pre-installed. Neon provides it by default, so this works in practice but the migration is not self-contained.
- **Fix:** Add `CREATE EXTENSION IF NOT EXISTS vector;` at the top of the migration.

### LP-02: KV namespace IDs committed to source control

- **File:** `apps/api/wrangler.toml`
- **Origin:** PR #35
- **Description:** Real Cloudflare KV namespace IDs are committed. These are resource identifiers (not credentials) but expose infrastructure details.
- **Fix:** Consider moving to environment variables or Doppler if desired.

---

## Summary

| Priority | Count | Category |
|----------|-------|----------|
| P1 | 7 + 10 | Security |
| P2 | 7 + 10 | Data Integrity / Race Conditions |
| P3 | 7 + 8 | Correctness / Logic Bugs |
| P4 | 3 + 1 | Reliability / Resilience |
| P5 | 5 + 8 | Mobile Client |
| P6 | 11 + 1 | CI, Build & Testing |
| P7 | 3 | Documentation Mismatches |
| P8 | 2 + 2 | Low Priority / Deferred |
| **Total** | **45 + 40 = 85** | |

### Recommended Execution Order

1. **S-01 + S-02** (JWT audience) — Quick fix, high security impact
2. **D-01** (SM-2 new cards) — Breaks core learning algorithm for every new topic
3. **S-03 + S-04 + C-06** (ownership + scoping + validation) — Authorization hardening batch
4. **D-02 + D-03** (race conditions) — Concurrency safety for retention + sessions
5. **C-01 + C-02 + C-03** (correctness) — Logic bugs affecting learning quality
6. **M-01** (COPPA resend) — Compliance-adjacent UX issue
7. **CI-01 through CI-04** (CI reliability) — Batch CI fixes
8. Everything else by priority order

---

## Appendix A — PR #109 Review Findings (Claude Code Review + CodeRabbit)

> **Added:** 2026-04-04
> **Source:** Claude Code Review and CodeRabbit automated reviews on PR #109 (`diverse` branch — adaptive home screen, language pedagogy, code review fixes).
> **Status:** Critical/High findings only. Items already fixed in commit `1739af2` are marked ✅.

### Resolved in commit `1739af2`

The following Critical/High findings were addressed and merged:

- ✅ **Critical: `drizzle-kit push --force` in deploy.yml** — Already fixed in prior commit (uses `drizzle-kit migrate`)
- ✅ **High: HTTP 502 instead of 500** — `apps/api/src/routes/subjects.ts` — Fixed to 500
- ✅ **High: Staging APP_URL points to API not frontend** — `apps/api/wrangler.toml` — Fixed to `app.mentomate.com`
- ✅ **High: `markCelebrationsSeen` hardcoded `viewer: 'child'`** — `apps/mobile/src/app/(learner)/home.tsx` — Now uses dynamic `isOwner ? 'parent' : 'child'`
- ✅ **High: Stale `recoveryMarker` not cleared on profile switch** — `apps/mobile/src/app/(learner)/learn-new.tsx` — Now explicitly sets `null` when marker missing/stale
- ✅ **High: Non-atomic streak + XP in session-completed** — `apps/api/src/inngest/functions/session-completed.ts` — Wrapped in `db.transaction()`
- ✅ **High: Non-atomic retention + XP in assessments route** — `apps/api/src/routes/assessments.ts` — Already had transaction (pre-existing fix)
- ✅ **High: `loadTopicTitle` IDOR (no ownership check)** — `apps/api/src/services/assessments.ts` — Already had profileId ownership join
- ✅ **High (Refactor): `LearnerScreen` / `ParentGateway` read profile state directly** — Refactored to receive profile data via props (persona-unaware)

### Still Outstanding

#### PR109-01: Shared DATABASE_URL between staging and production

- **File:** `.github/workflows/deploy.yml` (~line 152)
- **Origin:** Claude Code Review (PR #109, all 3 review passes)
- **Severity:** High / Deploy Safety
- **Description:** `DEPLOY_ENV` is computed from `github.event_name` but is never used to select a different `DATABASE_URL` secret. Both staging and production deployments use the same `${{ secrets.DATABASE_URL }}`. A staging deploy that runs migrations will modify the production database.
- **Fix:** Add separate Doppler/GitHub secrets (`DATABASE_URL_STAGING`, `DATABASE_URL_PRODUCTION`) and select based on `DEPLOY_ENV`:
  ```yaml
  DATABASE_URL: ${{ github.event_name == 'push' && secrets.DATABASE_URL_STAGING || secrets.DATABASE_URL_PRODUCTION }}
  ```
- **Status (2026-04-05):** ⚠️ NOT FIXED — `deploy.yml` lines 152/158 still use generic `${{ secrets.DATABASE_URL }}` for both staging and production. Previous status was incorrect.

#### PR109-02: CLAUDE.md stripped of engineering guidance

- **File:** `CLAUDE.md`
- **Origin:** CodeRabbit (PR #109)
- **Severity:** High / Process
- **Description:** CLAUDE.md was reduced to 6 lines (mobile screen count only). All engineering rules, planning prerequisites, mandatory validation steps (`tsc`, `lint`, `findRelatedTests`), and architecture guidance were removed. AI agents and contributors using CLAUDE.md as their project entry point receive no operational context.
- **Fix:** Restore the engineering/process guidance sections. The global `~/.claude/CLAUDE.md` still has the PR protocol, but project-specific rules (schema migration policy, profile-scoping mandate, test requirements) need to live in the repo CLAUDE.md.
- **Status (2026-04-04):** ✅ Fixed in current branch. `CLAUDE.md` now restores repo-specific engineering guardrails, migration policy, and validation commands.

#### PR109-03: ParentGateway unreachable (dead code)

- **File:** `apps/mobile/src/app/(learner)/_layout.tsx` (~line 682)
- **File:** `apps/mobile/src/app/(learner)/home.tsx`
- **File:** `apps/mobile/src/components/home/ParentGateway.tsx`
- **Origin:** Claude Code Review + CodeRabbit (PR #109)
- **Severity:** High / Architecture
- **Description:** The `_layout.tsx` parent redirect (line 682-687) sends ALL parent accounts (owners with linked children) to `/(parent)/dashboard` before any route renders. This makes the `ParentGateway` component in `home.tsx` dead code — parents can never reach the home screen to see it. The adaptive home screen was designed to show parents a gateway view with "Check child's progress" and "Learn something" options, but the layout redirect bypasses it entirely.
- **Fix:** Either:
  1. **Scope the redirect** — exclude `/(learner)/home` from the redirect so parents see ParentGateway, while still redirecting direct access to library/session/topic routes.
  2. **Remove ParentGateway** — accept that parents always go to the dashboard and delete the dead component + related test code.
- **Status (2026-04-04):** ✅ Fixed in current branch. The layout-level redirect was removed so linked-parent profiles now land in the adaptive learner home flow and can reach `ParentGateway`; a new learner-layout regression test covers this case.

---

## Appendix B — PRs #63-96 Review Findings (Still Relevant)

> **Added:** 2026-04-04
> **Source:** Claude Code Review and CodeRabbit automated findings from PRs #63-96, cross-referenced against current codebase on branch `diverse`.
> **Methodology:** ~180 findings extracted, each verified against current source. Only confirmed still-present findings listed below.

---

### B-P1: Security (PRs 63-96)

#### BS-01: Timing-attack length leak in RevenueCat webhook secret comparison

- **File:** `apps/api/src/routes/revenuecat-webhook.ts` (~line 38)
- **Origin:** PR #63 (CRIT-01), PR #65
- **Severity:** Critical / Security
- **Description:** The `timingSafeEqual` helper was added (fixing the original `===` comparison), but it still does an early-return on `a.length !== b.length`. This leaks the byte-length of `REVENUECAT_WEBHOOK_SECRET` via timing side-channel. An attacker can determine the secret length by submitting tokens of increasing lengths.
- **Fix:** Pad both inputs to equal length before XOR comparison, or hash both values with HMAC before comparing.
- **Status (2026-04-05):** ✅ Fixed in current branch. Replaced XOR-fold with HMAC-SHA256 constant-time comparison using SubtleCrypto; input length no longer leaks. 2 tests added.

#### BS-02: Top-up credit idempotency race (check-then-insert, no unique constraint)

- **File:** `apps/api/src/services/billing.ts` (~lines 958, 977)
- **File:** `packages/database/src/schema/billing.ts` (~line 95)
- **Origin:** PR #63
- **Severity:** Critical / Security + Data Integrity
- **Description:** `isTopUpAlreadyGranted` (SELECT) and `purchaseTopUpCredits` (INSERT) are separate steps with no transaction and no DB unique constraint on `revenuecatTransactionId`. Concurrent webhook retries can pass the check simultaneously and double-grant credits.
- **Fix:** Add a `UNIQUE` constraint on `revenuecatTransactionId` and use `INSERT ... ON CONFLICT DO NOTHING`.
- **Status (2026-04-05):** ✅ Fixed in current branch. Added `uniqueIndex` on `revenuecatTransactionId` in billing schema; `purchaseTopUpCredits` uses `.onConflictDoNothing()` and returns `null` for duplicates. Removed separate `isTopUpAlreadyGranted` check-then-insert pattern.

#### BS-03: Over-broad auth/consent bypass for `/v1/revenuecat/*`

- **File:** `apps/api/src/middleware/auth.ts` (~line 34)
- **File:** `apps/api/src/middleware/consent.ts` (~line 33)
- **Origin:** PR #63
- **Severity:** High / Security
- **Description:** `PUBLIC_PATHS` and `EXEMPT_PREFIXES` exempt all `/v1/revenuecat/*` routes from auth and consent checks. Only `/v1/revenuecat/webhook` should be exempt. Adding any new route under this prefix would unintentionally skip auth.
- **Fix:** Narrow to `/v1/revenuecat/webhook` specifically.
- **Status (2026-04-04):** ✅ Fixed. Both `PUBLIC_PATHS` and `EXEMPT_PREFIXES` narrowed to `/v1/revenuecat/webhook`.

#### BS-04: Unscoped topicId in startSession

- **File:** `apps/api/src/services/session.ts` (~line 383)
- **Origin:** PR #68
- **Severity:** High / Security
- **Description:** `startSession()` accepts `input.topicId` and stores it without verifying the topic belongs to the verified subject's curriculum. It checks subject ownership but not that the topic belongs to that subject. A user with a valid subjectId who guesses a topicId from another subject could start a session with it.
- **Fix:** Verify `topicId` exists in the subject's curriculum before proceeding.
- **Status (2026-04-05):** ✅ Fixed in current branch. `startSession` verifies `topicId` belongs to the subject's curriculum via inner join before proceeding; regression tests cover mismatched and valid topic-subject pairs.

#### BS-05: [NEEDS_DEEPENING] marker leaked in streamed responses

- **File:** `apps/api/src/services/exchanges.ts` (~lines 482-508)
- **Origin:** PR #67
- **Severity:** High / Security (information leak)
- **Description:** `streamExchange()` returns the LLM stream directly without stripping `[NEEDS_DEEPENING]` and `[PARTIAL_PROGRESS]` markers. Unlike `processExchange()` which strips these (lines 453-459), the streaming path leaks internal control tokens to the learner.
- **Fix:** Add marker stripping to the streaming transform.
- **Status (2026-04-04):** ✅ Fixed. Added `stripMarkersFromStream()` async generator with chunk-boundary buffering.

#### BS-06: Sentry `beforeSend` doesn't block native crash reports (COPPA)

- **File:** `apps/mobile/src/lib/sentry.ts` (~line 41)
- **Origin:** PR #79
- **Severity:** Critical / Compliance
- **Description:** `beforeSend` only intercepts JS-layer events. `@sentry/react-native` native SDK writes crash envelopes directly to disk and flushes on next launch, bypassing `beforeSend`. For under-13 users without CONSENTED status, device identifiers and stack traces can still reach Sentry.
- **Fix:** Use `Sentry.getClient()?.close()` to shut down the native transport entirely for underage users, or use `beforeEnvelope` hook.

#### BS-07: `disableSentry()` doesn't clear full scope (COPPA/GDPR)

- **File:** `apps/mobile/src/lib/sentry.ts` (~lines 57-61)
- **Origin:** PR #79
- **Severity:** High / Compliance
- **Description:** `disableSentry()` only calls `Sentry.setUser(null)`. Breadcrumbs, tags, and extras from the prior session remain. If a native crash bypasses `beforeSend` (BS-06), this residual data is attached.
- **Fix:** Call `Sentry.getCurrentScope().clear()` in `disableSentry()`.
- **Status (2026-04-04):** ✅ Fixed. `disableSentry()` now clears the full scope before nulling user.

#### BS-08: Staging URL as production fallback

- **File:** `apps/mobile/src/lib/api.ts` (~line 32)
- **Origin:** PR #84
- **Severity:** High / Security
- **Description:** When `EXPO_PUBLIC_API_URL` is absent in a non-`__DEV__` build, the fallback is `'https://api-stg.mentomate.com'` — a staging URL. A production build missing this env var routes real user traffic and auth tokens to staging.
- **Fix:** Change fallback to `'https://api.mentomate.com'` or throw an error if the env var is missing.
- **Status (2026-04-04):** ✅ Fixed. Non-dev builds now throw if `EXPO_PUBLIC_API_URL` is missing.

#### BS-09: `.passthrough()` enables client-controlled metadata injection

- **File:** `packages/schemas/src/sessions.ts` (~lines 114, 135)
- **Origin:** PR #89
- **Severity:** Critical / Security (OWASP A08)
- **Description:** Both `homeworkSessionMetadataSchema` and `sessionMetadataSchema` use `.passthrough()`. A client can inject arbitrary fields (including `homeworkSummary`) that survive Zod validation and get persisted, overwriting server-generated data.
- **Fix:** Replace `.passthrough()` with `.strip()`.
- **Status (2026-04-04):** ✅ Fixed. Both `homeworkSessionMetadataSchema` and `sessionMetadataSchema` now use `.strip()`.

#### BS-10: Prompt injection surface in subject classification

- **File:** `apps/api/src/services/subject-classify.ts` (~line 72)
- **Origin:** PR #84
- **Severity:** Medium / Security
- **Description:** Raw user text is interpolated directly into the LLM prompt without sanitization or length limiting. A crafted input could attempt to override system prompt instructions.
- **Fix:** Add input sanitization (strip control characters, limit length) before interpolation.
- **Status (2026-04-04):** ✅ Fixed. Raw input sanitized (control chars stripped, 500-char limit) before LLM interpolation.

---

### B-P2: Data Integrity & Race Conditions (PRs 63-96)

#### BD-01: Last-event-wins idempotency — older webhook retries slip through

- **File:** `apps/api/src/services/billing.ts` (~lines 1486-1496)
- **Origin:** PR #63
- **Severity:** High / Data Integrity
- **Description:** `lastRevenuecatEventId` stores only the most recent event ID. If RevenueCat retries event A after events B and C have been processed, A's check returns `false` and A is re-processed, potentially overwriting current subscription state with stale data.
- **Fix:** Store a set of processed event IDs (or use event timestamps for ordering), not just the last one.

#### BD-02: trialEndsAt not cleared on non-trial re-activation

- **File:** `apps/api/src/services/billing.ts` (~line 1630)
- **Origin:** PR #63
- **Severity:** High / Data Integrity
- **Description:** When a user re-activates after a trial, the update path only sets `trialEndsAt` when truthy. If `isTrial` is false, `trialEndsAt` is never cleared — the old trial date persists, potentially triggering trial-expiry logic for a paid subscription.
- **Fix:** Explicitly set `trialEndsAt: null` when `isTrial` is false in the update path.
- **Status (2026-04-04):** ✅ Fixed. `trialEndsAt` unconditionally set; `null` when `isTrial` is false.

#### BD-03: No runtime enforcement of trialEndsAt when isTrial=true

- **File:** `apps/api/src/services/billing.ts` (~line 1572)
- **Origin:** PR #63
- **Severity:** Medium / Data Integrity
- **Description:** When `isTrial` is true, the function sets `status: 'trial'` but doesn't validate that `trialEndsAt` is present. A trial subscription without an expiry date breaks lifecycle jobs.
- **Fix:** Add runtime validation: `if (isTrial && !trialEndsAt) throw new Error(...)`.
- **Status (2026-04-04):** ✅ Fixed. Guard throws before DB writes when `isTrial` lacks `trialEndsAt`.

#### BD-04: Stale homework metadata returned (dedup permanently broken)

- **File:** `apps/api/src/services/session.ts` (~line 1605)
- **Origin:** PR #89
- **Severity:** Critical / Correctness
- **Description:** `syncHomeworkState` returns `{ metadata: input.metadata }` (the raw client input) instead of `nextHomeworkMetadata` (with accumulated tracking IDs). Every subsequent sync re-emits all events as duplicates because the client never receives the updated dedup state.
- **Fix:** Return `{ metadata: nextHomeworkMetadata }`.
- **Status (2026-04-04):** ✅ Fixed. `syncHomeworkState` now returns `nextHomeworkMetadata`.

#### BD-05: Stale session close — no compare-and-swap

- **File:** `apps/api/src/services/session.ts` (~lines 1085, 1241)
- **Origin:** PR #90
- **Severity:** High / Data Integrity
- **Description:** `closeAutoCloseSessions` reads active sessions, then loops and calls `closeSession` per session. Between the read and write, the learner could resume. The `closeSession` update doesn't re-check `status = 'active'` and `lastActivityAt < cutoff` atomically.
- **Fix:** Add `WHERE status = 'active' AND lastActivityAt < cutoff` to the close update.

#### BD-06: birthDate/birthYear inconsistency allowed

- **File:** `apps/api/src/services/profile.ts` (~line 151)
- **Origin:** PR #92
- **Severity:** Medium / Data Integrity
- **Description:** If both `birthDate` and `birthYear` are sent and disagree, consent/persona are computed from `birthYear` but `birthDate` is persisted as-is. Can be created under one age and read back under another.
- **Fix:** Validate consistency or derive `birthYear` from `birthDate` exclusively when both are present.

#### BD-07: `dont_remember` uses up the retest window

- **File:** `apps/api/src/services/retention-data.ts` (~line 336)
- **Origin:** PR #89
- **Severity:** High / UX + Correctness
- **Description:** A "don't remember" tap writes `lastReviewedAt = now()` with quality 0, starting the 24-hour cooldown. The learner can't retry with a hint within the cooldown window, breaking the hinted-retry UX flow.
- **Fix:** Don't write `lastReviewedAt` for `dont_remember` responses, or use a separate field for cooldown tracking.
- **Status (2026-04-04):** ✅ Fixed. `lastReviewedAt` skipped for `dont_remember`; SM-2 state still recorded.

#### BD-08: sortOrder allocation not atomic for curriculum topics

- **File:** `apps/api/src/services/curriculum.ts` (~lines 680-698)
- **Origin:** PR #89
- **Severity:** Medium / Data Integrity
- **Description:** Read-then-write pattern: reads max `sortOrder`, computes `max + 1`, inserts. Concurrent add-topic calls get the same max and insert duplicate sort orders.
- **Fix:** Use `INSERT ... SELECT MAX(sortOrder) + 1` or wrap in a transaction with `SELECT FOR UPDATE`.

#### BD-09: Inngest send failure silently drops session-completed pipeline

- **File:** `apps/api/src/routes/sessions.ts` (~lines 491-501)
- **Origin:** PR #74
- **Severity:** High / Data Integrity
- **Description:** `inngest.send()` failure is caught, logged to Sentry, then swallowed. The client gets a success response. Retention updates, celebrations, XP, streaks, and embeddings are permanently lost with no retry mechanism.
- **Fix:** Return an error status to the client, or implement a dead-letter queue / retry mechanism.

#### BD-10: Billing reads bypass scoped repository

- **File:** `apps/api/src/services/billing.ts` (31+ locations)
- **Origin:** PR #63
- **Severity:** Medium / Architecture (security implication)
- **Description:** Billing service uses `db.query.*` directly in 31+ locations instead of scoped repository. Billing operates at account level (not profile), so the practical risk is lower, but the pattern is inconsistent with the project's data access rules.
- **Fix:** Evaluate which queries need profile scoping and migrate the rest to scoped repository or document the exception.

---

### B-P3: Correctness & Logic Bugs (PRs 63-96)

#### BC-01: customerInfo query cache not scoped by userId

- **File:** `apps/mobile/src/hooks/use-revenuecat.ts` (~line 129)
- **Origin:** PR #63
- **Severity:** High / Correctness
- **Description:** `queryKey: ['revenuecat', 'customerInfo']` has no userId in the key. If user A signs out and user B signs in, cached entitlement data from user A could be served to user B until the query is invalidated. Entitlement leakage between accounts.
- **Fix:** Include `userId` in the query key: `['revenuecat', 'customerInfo', userId]`.
- **Status (2026-04-04):** ✅ Fixed. `userId` from `useAuth()` added to query key.

#### BC-02: Direct SDK call bypasses usePurchase() hook

- **File:** `apps/mobile/src/app/(learner)/subscription.tsx` (~line 609)
- **Origin:** PR #63
- **Severity:** Medium / Correctness
- **Description:** `Purchases.purchasePackage(topUpPkg)` is called directly, bypassing `usePurchase()`. No TanStack Query loading/error state for the top-up, no automatic `customerInfo` invalidation on success, and the SDK import leaks into the screen layer.
- **Fix:** Use `purchase.mutateAsync(topUpPkg)` via the `usePurchase()` hook.

#### BC-03: `computeAgeBracket()` off by up to one year

- **File:** `packages/schemas/src/age.ts`
- **Origin:** PR #92
- **Severity:** Medium / Correctness
- **Description:** Uses only `currentYear - birthYear`, so a child born in December computes as one year older than they actually are before their birthday. This drives persona inference and consent gating — could classify still-underage users as adults months early.
- **Fix:** Accept month/day when available, or document the accepted ±1 year tolerance.

#### BC-04: Zod `.default('LEARNER')` makes age-based persona inference dead code

- **File:** `packages/schemas/src/profiles.ts` (~line 24)
- **Origin:** PR #92
- **Severity:** Medium / Correctness
- **Description:** `personaType: personaTypeSchema.default('LEARNER')` means Zod materializes the default during parsing. The service-level `input.personaType ?? inferLegacyPersonaType(birthYear)` fallback never fires because `personaType` is always present.
- **Fix:** Remove the `.default('LEARNER')` from the schema and let the service handle the fallback.

#### BC-05: Stale homework metadata return breaks dedup permanently

- **File:** `apps/api/src/services/session.ts` (~line 1605)
- **Origin:** PR #89
- **Severity:** Critical / Correctness
- **Description:** (Same as BD-04.) `syncHomeworkState` returns raw client metadata instead of enriched `nextHomeworkMetadata`. Listed here as it is both a data integrity AND correctness issue.
- **Fix:** Return `{ metadata: nextHomeworkMetadata }`.

#### BC-06: Whitespace-only strings pass subject name validation

- **File:** `packages/schemas/src/subjects.ts` (~line 27)
- **Origin:** PR #89
- **Severity:** Low / Correctness
- **Description:** `z.string().min(1).max(200)` accepts `"   "` (spaces only). The service trims before insert, so whitespace-only subjects persist as empty strings.
- **Fix:** Change to `z.string().trim().min(1).max(200)`.
- **Status (2026-04-04):** ✅ Fixed in current branch. Both `subjectCreateSchema` and `subjectUpdateSchema` now use `.trim()` before `.min(1)`, rejecting whitespace-only names.

#### BC-07: Unsafe JSON.parse cast for SSE StreamEvent

- **File:** `apps/mobile/src/lib/sse.ts` (~lines 69-75)
- **Origin:** PR #74
- **Severity:** Medium / Type Safety
- **Description:** `JSON.parse(data)` is cast as `StreamEvent` with only a minimal `typeof === 'object'` check. No validation that required fields (`content`, `exchangeCount`, `escalationRung`) exist. A malformed SSE message passes the guard and silently corrupts accumulated text.
- **Fix:** Add runtime validation for expected fields before casting.
- **Status (2026-04-05):** ✅ Fixed in current branch. Runtime field validation added after `JSON.parse`; malformed events are skipped. 6 tests cover missing fields, wrong types, unknown event types.

#### BC-08: Missing profileId scope on subjects query in homework-summary

- **File:** `apps/api/src/services/homework-summary.ts` (~lines 148-152)
- **Origin:** PR #89
- **Severity:** Low / Defense-in-depth
- **Description:** Subject is fetched by `id` alone without `profileId` filter. The session itself is already scoped, so practical risk is low, but the defense-in-depth gap exists.
- **Fix:** Add `profileId` filter to the subjects query.
- **Status (2026-04-05):** ✅ Fixed in current branch. Added `eq(subjects.profileId, profileId)` to the WHERE clause; tests verify profileId scoping and graceful fallback.

---

### B-P4: Reliability (PRs 63-96)

#### BR-01: Reanimated animation cleanup missing on unmount

- **File:** `apps/mobile/src/components/common/ShimmerSkeleton.tsx`
- **File:** `apps/mobile/src/components/common/BookPageFlipAnimation.tsx`
- **Origin:** PR #64, PR #72
- **Severity:** Medium / Reliability
- **Description:** Both components start `withRepeat` animations but have no cleanup function in their `useEffect`. Shared values keep animating on the Reanimated UI thread after unmount, wasting resources and potentially causing state-update-on-unmounted warnings.
- **Fix:** Return `() => { cancelAnimation(sharedValue); }` from the effect.
- **Status (2026-04-05):** ✅ Fixed in current branch. Both components return `cancelAnimation()` cleanup from their animation effects; tests verify cleanup on unmount.

---

### B-P5: Mobile Client Issues (PRs 63-96)

#### BM-01: SVG gradient ID collision in ShimmerSkeleton

- **File:** `apps/mobile/src/components/common/ShimmerSkeleton.tsx` (~line 103)
- **Origin:** PR #64
- **Severity:** High / UX
- **Description:** Hardcoded `id="shimmerGrad"`. When multiple `ShimmerSkeleton` instances render simultaneously (the skeleton-screen use case), SVG resolves the gradient to the first matching element — all subsequent instances lose the shimmer effect.
- **Fix:** Use `React.useId()` or a counter for unique gradient IDs.
- **Status (2026-04-04):** ✅ Fixed. `useId()` generates unique gradient IDs per instance.

#### BM-02: BookPageFlipAnimation `transformOrigin` string crash

- **File:** `apps/mobile/src/components/common/BookPageFlipAnimation.tsx` (~lines 84, 89, 94)
- **Origin:** PR #72
- **Severity:** Critical / Runtime crash
- **Description:** `transformOrigin: 'left center'` string syntax crashes in Reanimated 3.x+ / New Architecture. Throws `HostFunction` error.
- **Fix:** Use array syntax: `transformOrigin: ['0%', '50%', 0]`.
- **Status (2026-04-05):** ✅ Fixed in current branch. All `transformOrigin` values use array syntax; test verifies no string-based values exist.

#### BM-03: No QueryClient clear on auth expiration (data leakage)

- **File:** `apps/mobile/src/app/_layout.tsx` (~lines 156-161)
- **Origin:** PR #86
- **Severity:** Critical / Security
- **Description:** Auth expiration handler only calls `signOut()`. Cached data from the previous user remains in the QueryClient, which persists at module scope. The next user who signs in could see stale data from the previous session.
- **Fix:** Call `queryClient.clear()` in the auth expiration handler.
- **Status (2026-04-05):** ✅ Fixed in current branch. `queryClient.clear()` called before `signOut()` in auth expiration handler.

#### BM-04: QueryGuard uses `isLoading` instead of `isPending`

- **File:** `apps/mobile/src/components/common/QueryGuard.tsx` (~line 47)
- **Origin:** PR #86
- **Severity:** High / Runtime crash
- **Description:** In TanStack Query v5, `isLoading = isPending && isFetching`. For disabled queries (`enabled: false`), `isLoading` is false but `data` is undefined. The guard falls through to `children(data as T)` with `undefined`, causing crashes.
- **Fix:** Use `isPending` instead of `isLoading`.
- **Status (2026-04-05):** ✅ Fixed in current branch. Guard uses `isPending` instead of `isLoading`; 4 tests cover disabled query scenario and custom render props.

#### BM-05: `switchProfile` throws without all call sites protected

- **File:** `apps/mobile/src/lib/profile.ts` (~line 113)
- **Origin:** PR #86
- **Severity:** High / Runtime crash
- **Description:** `switchProfile` throws on non-OK response. Some callers (e.g., props passed to `ProfileSwitcher`) may not wrap in try/catch. Unhandled throws crash the component tree.
- **Fix:** Add try/catch at all call sites, or make `switchProfile` return an error result instead of throwing.

#### BM-06: WCAG AA contrast regression in dark theme (muted text)

- **File:** `apps/mobile/src/lib/design-tokens.ts`
- **Origin:** PR #85
- **Severity:** High / Accessibility
- **Description:** `muted: '#525252'` on dark backgrounds (`#1a1a3e`) yields ~2.3:1 contrast — well below WCAG AA 4.5:1 for normal text. Affects learner, teen, and parent dark themes.
- **Fix:** Use a lighter muted color (e.g., `#94a3b8` ~7.9:1, the previous value).
- **Status (2026-04-04):** ✅ Fixed. All three dark themes updated from `#525252` to `#94a3b8`.

#### BM-07: SecureStore key migration race condition

- **File:** `apps/mobile/src/app/(learner)/subscription.tsx` (~lines 286-306)
- **Origin:** PR #93
- **Severity:** Medium / Data Integrity
- **Description:** Migration and restore effects both depend on `[profileId]` and fire concurrently. Migration is fire-and-forget (`void`). The restore effect can read the new key before migration finishes writing it, finding nothing. Migrated value is lost on first launch after upgrade.
- **Fix:** Await migration before restore, or chain them in a single effect.

#### BM-08: Stale accent state race on profile switch

- **File:** `apps/mobile/src/app/_layout.tsx`
- **Origin:** PR #67, PR #68
- **Severity:** Low / UX
- **Description:** On profile switch, the previous profile's `accentPresetId` stays live until SecureStore resolves. An uncancelled slower lookup for profile A can overwrite profile B's selection.
- **Fix:** Reset accent state to default immediately on profile switch, before async load.

---

### B-P6: CI, Build & Testing (PRs 63-96)

#### BCI-01: `setup-env.js` failed Doppler download exits with code 0

- **File:** `scripts/setup-env.js` (~lines 312-319)
- **Origin:** PR #82
- **Severity:** Low / CI
- **Description:** When Doppler download fails during `postinstall`, `process.exit(0)` is called, making `pnpm install` report success while no secrets were synced. (Exits 1 for manual `pnpm env:sync`; only the postinstall path is affected.)
- **Fix:** Consider exiting non-zero even in postinstall, or at minimum print a visible warning.

---

### B-P8: Low Priority / Deferred (PRs 63-96)

#### BLP-01: `preview_id` equals `id` in dev KV bindings

- **File:** `apps/api/wrangler.toml` (~lines 86-92)
- **Origin:** PR #82
- **Severity:** Low / Dev Safety
- **Description:** Dev-environment KV `preview_id` is identical to `id`. In `wrangler dev --remote`, preview traffic mutates the same dev KV data. Low risk since these are dev namespaces, not production.
- **Fix:** Create separate preview KV namespaces or accept the shared-dev-namespace pattern.

#### BLP-02: COPPA assertions in consent E2E flows have justified `optional: true`

- **File:** `apps/mobile/e2e/flows/consent/consent-coppa-under13.yaml`
- **Origin:** PR #78
- **Severity:** Low / Test Quality
- **Description:** Two supplementary text assertions are `optional: true` with documented Android rendering justification. Critical consent flow steps are mandatory. Very low risk.
- **Fix:** No action needed unless Android rendering issues are resolved.
