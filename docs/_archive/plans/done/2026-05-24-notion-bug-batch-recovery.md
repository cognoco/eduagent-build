# 2026-05-24 Notion Bug Batch — Recovery Brief

Session dispatched 11 parallel subagents on 41 Notion bugs. A concurrent Claude session running `/commit` executed 9 consecutive `git reset --hard HEAD` cycles between 09:52–10:37 (reflog confirmed), wiping every uncommitted edit. Only untracked files survived.

**Notion already updated:**
- 9 obsolete bugs → Done + archived to Resolved DB
- 32 wiped bugs → reverted to Not started (this doc covers them)

**Goal of this doc:** let a future session re-do the 32 reverted bugs without re-investigating. Each entry has the file paths, the fix description, and the verify command from the original subagent.

---

## Status as of 2026-05-25

All 32 bugs done. Bulk recovery commit `881961ed0` (Sun 2026-05-24 11:51) plus `3968fa0c3` (BUG-673 migration) landed 18; remaining 14 re-applied 2026-05-25 on branch `freeform` (staged in the index, uncommitted at time of writing).

**DONE (32) — do NOT re-pick:**
- Bundle A: 644, 645 (re-applied 2026-05-25)
- Bundle B: 655, 656
- Bundle C: 650, 651, 654 (re-applied 2026-05-25); 652 CANT-REPRO — Notion marked Done verified-clean
- Bundle D: 688, 689, 695 (re-applied 2026-05-25 — `.bugs-688-689-695.patch` was prose, not a real diff; obsolete, safe to delete)
- Bundle E: 731
- Bundle F: 472, 500, 634
- Bundle G: 640, 641, 643
- Bundle H: 665, 747
- Bundle I: 571 (design doc), 580, 672, 673
- Bundle J: 624, 631, 639, 642 (re-applied 2026-05-25)
- Bundle K: 696, 697, 698, 708

Bundle-by-bundle status is annotated inline below.

---

## Already Done (archived to Resolved — do NOT re-pick)

These were verified obsolete; the code is already correct upstream.

| Bug | Resolution citation |
|-----|---------------------|
| 636 | `computeAgeBracket` at `packages/schemas/src/age.ts:42-51` uses `currentYear - birthYear` with no `-1`. Test asserts `computeAgeBracket(2012, 2026)` → `'adolescent'` (age 14). |
| 646 | Already fixed in `442b5993f` (2026-05-23). `apps/api/src/routes/test-seed.ts:62-126` enforces environment allowlist (`development`/`staging`) AND HMAC-checked `X-Test-Secret`. |
| 659 | `resolveFilingResult` (filing.ts:438-549) already runs inside `db.transaction` with profileId-scoped subject lookup; cascade FK protects against concurrent delete. |
| 666 | `subjects.ts` already imports `isoDateField` from `./common.ts`. Resolved during 2026-05-18 BUG-205 hoisting. |
| 693 | Already fixed in `de73d4652` (BUG-479, 2026-05-22). `parseHomeworkSummaryResponse` emits structured `homework_summary.parse.failed` log + `captureException`. |
| 729 | Already fixed in `72a20b2ef`. `monthly-report.ts:209` uses `extractFirstJsonObject` with null guard + Sentry capture. |
| 730 | Already fixed in `72a20b2ef`. `session-completed.ts:945-955` pipes transcript through `projectAiResponseContent` + `escapeXml` before LLM interpolation. |
| 748 | `bookmarkSchema.createdAt` already uses `isoDateField`. |
| 749 | `nudgeSchema.createdAt`/`readAt` already use `isoDateField`. |

---

## To Re-Do (32 bugs, grouped by bundle)

Each bundle below is one subagent's planned scope. Files and fix descriptions are from the original (now-wiped) work — re-pick as-is.

### Bundle A — API auth/owner gating [Opus] — **STATUS: DONE (2026-05-25, branch `freeform` staged)**

Both gates added; red-green confirmed on the two break tests.

#### BUG 644 — GET /subscription leaks billing to non-owner child profiles — **DONE**
- **File:** `apps/api/src/routes/billing.ts:137-197`
- **Bug:** GET `/subscription` has zero `isOwner` gate. Non-owner child active on the parent's account (via `X-Profile-Id`) reads the account's full tier/status/trialEndsAt/currentPeriodEnd/cancelAtPeriodEnd/monthly+dailyLimit.
- **Fix:** Add early `apiError(c, 403, ERROR_CODES.FORBIDDEN, ...)` when `c.get('profileMeta')?.isOwner !== true`. Same pattern as `billing.ts:299-307` (cancel), `:373-382` (top-up), `:582-591` (portal).
- **Break test:** `apps/api/src/routes/billing.test.ts` — `[BREAK FCR-2026-05-23-L2.M2.1]` adjacent to the `returns 401 without auth header` block.

#### BUG 645 — GET /subscription/family enumerates members to non-owner — **DONE**
- **File:** `apps/api/src/routes/billing.ts:697-722`
- **Bug:** GET `/subscription/family` has zero `isOwner` gate while sibling `family/add` (:739) and `family/remove` (:789) both gate on `profileMeta.isOwner !== true`. Non-owner can read sibling displayNames + isOwner flags + pool envelope (tier, monthlyLimit, usedThisMonth, profileCount, maxProfiles).
- **Fix:** Same early-403 pattern as `family/add`.
- **Break test:** asserts `mockListFamilyMembers` and `mockGetFamilyPoolStatus` are never called and route returns 403.

---

### Bundle B — API profileId scope guards [Opus] — **STATUS: DONE (commit 881961ed0)**

#### BUG 655 — regenerateLanguageCurriculum has no profileId param — **DONE**
- **Files:** `apps/api/src/services/language-curriculum.ts:348-368` (function), `apps/api/src/services/subject.ts:411,569` + `apps/api/src/services/curriculum.ts:1867` (callers), `apps/api/src/services/language-curriculum.test.ts` (break test).
- **Fix:** Add `profileId` as required 2nd param. Function performs ownership lookup `subjects WHERE id = subjectId AND profileId = profileId` BEFORE the cascade-delete. Throws `[BUG-655] regenerateLanguageCurriculum: subject … does not belong to profile …` on mismatch.
- **Break test:** `[BUG-655] throws and does NOT delete when subject does not belong to profile` — assert function rejects AND `db.delete`/`db.insert` are never called when ownership fails.

#### BUG 656 — getTopicProgress doesn't verify topic belongs to verified subject — **DONE** (uses `findOwnedCurriculumTopic` helper)
- **File:** `apps/api/src/services/progress.ts:263-282` + `progress.test.ts`
- **Fix:** Insert parent-chain ownership join after the existing subject ownership check. Direct `select` pattern (mirror `session-topic.ts`): `select(curriculum_topics) innerJoin curricula ON id = curriculumId WHERE curriculum_topics.id = topicId AND curricula.subjectId = subjectId LIMIT 1`. Empty join → return `null` without touching retention/assessments/sessions/summaries/xp.
- **Break test:** `[BUG-656] returns null when topicId belongs to a different subject (no leak)` — set up subject + foreign topic + downstream signals; verify null result. Refactor 9 inline `db = {…}` mocks to shared `createMockDb` (extended with `topicSubjectJoinRows`).

---

### Bundle C — API consent/log small [Sonnet] — **STATUS: DONE (2026-05-25, branch `freeform` staged)**

#### BUG 650 — clerkUserId in log entries — **DONE**
- **Files:** `apps/api/src/services/account.ts:102,133,173,263`, `apps/api/src/middleware/account.ts:43,71`, `apps/api/src/inngest/functions/billing-trial-subscription-failed.ts` + tests for both.
- **Fix:** At sites where `accountId` is already present (account.ts:102/133/263), drop `clerkUserId` as redundant. Security-audit site (account.ts:173 — reclaim attempt) and both middleware sites (43/71) where no `accountId` exists yet retain `clerkUserId` with an inline comment documenting it as the only available Clerk audit join key. Drop `clerkUserId` from `app/billing.trial_subscription_failed` Inngest event payload end-to-end (emitter + handler type + both tests).

#### BUG 651 — /consent/my-status empty response with no comment — **DONE**
- **File:** `apps/api/src/routes/consent.ts:260`
- **Fix:** Add inline comment at the `if (!profileId)` guard documenting the contract: caller without active profile (mid-onboarding) has no consent record; null fields mean "no consent required"; intentionally NOT an error — callers should not interpret as failure.

#### BUG 652 — process.env in Inngest helpers (G4 ban)
- **Status:** CANT-REPRO. Grep of `apps/api/src/inngest/**/*.ts` found 3 hits all benign: comment in test file, comment in `trial-expiry.ts` prose, `process.env.DATABASE_URL` in integration test `beforeAll`. No production Inngest code violates G4. **Action: mark Notion Done with "verified clean".**

#### BUG 654 — consent-web path replace removes only first occurrence — **DONE**
- **File:** `apps/api/src/routes/consent-web.ts:182,246`
- **Fix:** Two `.replace()` calls — `c.req.path.replace('/consent-page', '')` (line 182) and `c.req.path.replace('/consent-page/deny-confirm', '')` (line 246) — replace both with `.replaceAll()` so a path prefix containing the consent segment doesn't leave a stray segment in `basePath`, corrupting `confirmUrl`/`backUrl`.

---

### Bundle D — API error classification [Opus] — **STATUS: DONE (2026-05-25, branch `freeform` staged)**

`.bugs-688-689-695.patch` turned out to be prose-only (zero git-diff hunks), not an applicable patch. All three fixes re-implemented by hand. Patch file is obsolete and safe to delete.

#### BUG 688 — sendPushNotification: DB error misclassified as network_error — **DONE**
- **File:** `apps/api/src/services/notifications.ts:95-142`
- **Fix:** Split single `try {}` covering both Expo fetch (network) AND `logNotification` (DB write) into TWO try blocks. Network errors keep `network_error` classification; DB errors get new `db_error` classification with event `notification.push.db_error` and Sentry tag `reason: db_error`. Push still returns `sent: true, ticketId, reason: 'log_write_failed'` when only the log write fails.

#### BUG 689 — Invalid timezone silently falls back to UTC in billing — **DONE**
- **File:** `apps/api/src/services/billing/family.ts:162-176` (+ logger import at :25)
- **Fix:** Replace `catch {}` at line 169 with `catch (err)` that emits structured `logger.warn` with event `billing.format_date.timezone_fallback`, fields `{ requestedTimezone, locale, error }`.

#### BUG 695 — openai.ts SSE chunk catch is empty (no log) — **DONE**
- **File:** `apps/api/src/services/llm/providers/openai.ts:228-251`
- **Fix:** Replace both empty `catch {}` blocks (stream_loop ~232, flush_buffer ~248) with `catch (err)` emitting structured `logger.warn` with event `openai.sse.malformed`, fields `{ site, chunk: jsonStr.slice(0, 200), error }`. Discard behavior preserved.

---

### Bundle E — API LLM XML safety [Opus] — **STATUS: DONE (commit 881961ed0)**

#### BUG 731 — LLM-extracted interests stored without XML sanitization — **DONE**
- **Files:** `apps/api/src/services/dictation/generate.ts:8` (import + new `safeLabels()` helper at lines 56-77), `apps/api/src/services/quiz/guess-who-provider.ts:4` (import + new `safeInterestLabels()` helper at lines 151-167), `apps/api/src/services/quiz/vocabulary-provider.ts:12` (import + helper), `apps/api/src/services/quiz/guess-who-provider.test.ts` (3 break tests).
- **Fix:** Each file imports `sanitizeXmlValue` from `services/llm/sanitize.ts` and routes free-text labels through it (max 60 chars for interest labels, 120 chars for `themePreference` / library topic titles) before LLM-prompt interpolation. Sanitize at re-injection (NOT at storage) — mirrors canonical pattern in `learner-profile.ts:988/998` (`buildMemoryBlock`).
- **Break tests in `guess-who-provider.test.ts`:** (1) strips `<system>…</system>` from interest labels, (2) strips newlines from `themePreference`, (3) covers `school`-context fallback branch (`<script>alert(1)</script>` interest with `context: 'school'`).
- **Note:** 729 and 730 were obsolete (already done) — covered above in the archived table.

---

### Bundle F — API small targeted fixes [Opus] — **STATUS: DONE (commit 881961ed0)**

#### BUG 472 — storeMilestones round-trip-per-row — **DONE**
- **File:** `apps/api/src/services/milestone-detection.ts:202`
- **Fix:** Replace per-milestone for-loop with single bulk `db.insert(milestones).values([...]).onConflictDoNothing().returning()`. Add early-return for empty input. Preserves per-row `onConflictDoNothing` semantics.

#### BUG 500 — jwt.ts hardcodes RS256 — **DONE** (`ALG_ALLOWLIST`, `algParamsFor`, `resolveAlg` at jwt.ts:217-281)
- **File:** `apps/api/src/middleware/jwt.ts:206-313`
- **Fix:** Replace hardcoded-RS256 `importRSAPublicKey` with algorithm-aware path. Add `ALG_ALLOWLIST = {RS256, RS384, RS512, ES256, ES384, ES512, EdDSA}` (HS* intentionally omitted to block public-key-as-HMAC downgrade). Add `algParamsFor()` mapping each alg → Web Crypto import + verify params. Add `resolveAlg()` validating `header.alg` against allowlist + rejecting `none` + cross-checking against JWK.alg (downgrade signal). `importPublicKey()` imports key bound to chosen alg. `verifyJWT` decodes header, resolves alg, imports key, uses matching verify params.

#### BUG 634 — computeAggregateRetentionStatus returns 'strong' for zero cards — **DONE**
- **Files:** `apps/api/src/services/progress.ts:91-103`, `packages/schemas/src/progress.ts:227-234`
- **Fix:** Return `'unknown'` instead of `'strong'` for empty `statuses` array. Widen return type to `'strong' | 'fading' | 'weak' | 'forgotten' | 'unknown'`. Add `'unknown'` to `subjectProgressSchema.retentionStatus` enum. Mobile consumers (`['forgotten','weak'].includes(...)`, `=== 'fading'`, `=== 'strong'`) treat `'unknown'` as neutral; i18n falls through to `defaultValue`.

---

### Bundle G — API observability telemetry [Sonnet] — **STATUS: DONE (commit 881961ed0)**

#### BUG 640 — warningLevel has no topUpWarningLevel — **DONE**
- **Files:** `packages/schemas/src/billing.ts` (enum), `apps/api/src/services/metering.ts` (`resolveWarningLevel()` helper + `checkQuota` call), `apps/api/src/routes/billing.ts` (replace 2 `getWarningLevel(...)` calls), `apps/mobile/src/hooks/use-subscription.ts` (`WarningLevel` type), `apps/mobile/src/components/common/UsageMeter.tsx` (`BAR_COLORS['top-up-available'] = 'bg-warning'`), `apps/api/src/services/metering.test.ts` (update + new `resolveWarningLevel` describe), `packages/schemas/src/billing.test.ts` (extend `it.each`).
- **Fix:** Add `'top-up-available'` to `warningLevel` zod enum. `resolveWarningLevel(base, topUpCreditsRemaining)`: if `base === 'exceeded' && topUpCreditsRemaining > 0` → `'top-up-available'`, else passthrough. `'exceeded'` reserved for truly blocked.

#### BUG 641 — Relevance telemetry source wrong when all distances are max — **DONE**
- **Files:** `apps/api/src/services/memory/relevance.ts`, `apps/api/src/services/memory/relevance.test.ts`
- **Fix:** Extend `RelevanceResult.source` to include `'no-match'`. In `findRelevant`, when `topRows` candidates all have `distance >= 2.0` (the `Math.min(2, …)` ceiling), fall back to recency snapshot and return `source: 'no-match'`. Add 2 tests: (1) all-at-max → `'no-match'`, (2) at-least-one-below-max → `'relevance'`.

#### BUG 643 — Stranded-backfill timestamp uses session-creation time — **DONE**
- **Files:** `apps/api/src/inngest/functions/filing-stranded-backfill.ts` + test.
- **Fix:** Replace `timestamp: createdAt.toISOString()` (session creation) with `timestamp: new Date().toISOString()` (dispatch time) in the synthetic `filing_timed_out` event. Remove unused `createdAt` var. **Keep** `lastCreatedAt` cursor in self-reinvoke event data using `last.createdAt` (different field, correct).
- **Test:** Verify dispatched event's `timestamp` is within test execution window, NOT close to the 7-day-old session `createdAt`.

---

### Bundle H — Packages BUG-205 isoDateField sweep [Sonnet] — **STATUS: DONE (commit 881961ed0)**

#### BUG 665 / 747 — z.string().datetime() sweep (same fix) — **DONE**
- **Files:** `packages/schemas/src/consent.ts` (`childConsentStatusSchema.respondedAt`), `packages/schemas/src/library-search.ts` (notes `createdAt` + sessions `occurredAt`), `packages/schemas/src/llm-summary.ts` (`archivedTranscriptResponseSchema.archivedAt`), `packages/schemas/src/sessions.ts` (`sessionSummarySchema.purgedAt`).
- **Fix:** Replace `z.string().datetime()` with `isoDateField` on the 5 response-side fields. Add `import { isoDateField } from './common.ts'` to the 3 files that lack it.
- **DO NOT change:** `inngest-events.ts` event timestamps (app-authored ISO strings, not Drizzle Dates) and `challengeRoundSessionStateSchema.startedAt` (JSON metadata field).
- **Verify:** `cd packages/schemas && pnpm exec jest --no-coverage` — 25 suites, 1015 tests should pass.

---

### Bundle I — Packages observability + drizzle + cron [Opus] — **STATUS: DONE (commits 881961ed0 + 3968fa0c3)**

#### BUG 580 — Classification observability events all-optional payload — **DONE**
- **Files:** `packages/schemas/src/inngest-events.ts`, `apps/api/src/inngest/functions/ask-classification-observe.test.ts`
- **Fix:** Make required on `classificationCompletedEventSchema` (sessionId, exchangeCount, subjectId, subjectName, confidence) and `classificationSkippedEventSchema` (sessionId, exchangeCount, reason, topConfidence) — verified senders always supply these (see `apps/api/src/inngest/functions/ask-silent-classify.ts:69-218`). For `classificationFailedEventSchema`, make `error` required (`z.string().min(1).max(2000)`); keep sessionId/exchangeCount optional (the malformed-input branch at ask-silent-classify.ts:69-78 may send undefined). Update tests to 3 break-tests asserting each schema rejects empty payloads with `status: 'skipped', reason: 'invalid_payload'`. Add inline comment explaining asymmetric requirement for the failure path.

#### BUG 672 — webhook_idempotency_keys unbounded — **DONE** (cron registered at `inngest/index.ts:5,115,193`)
- **Files:** `apps/api/src/inngest/functions/webhook-idempotency-purge.ts` (**file survives untracked — re-use**), `apps/api/src/inngest/index.ts` (wiring lost).
- **Fix:** The cron file exists on disk. Re-wire registration in both `export {}` and `export const functions = []` blocks of `apps/api/src/inngest/index.ts`. Cron: `'0 3 * * *'` (03:00 UTC), `retries: 1`, `concurrency: { limit: 1 }`. Purges `webhook_idempotency_keys` rows older than 30 days.

#### BUG 673 — notificationLog missing type in index — **DONE** (commit 3968fa0c3)
- **Files:** `packages/database/src/schema/progress.ts:163-166` (schema source — wiped, needs re-do), `apps/api/drizzle/0092_bug673_notification_log_profile_type_sent_idx.sql` + `.rollback.md` (**survive untracked — re-use**), `apps/api/drizzle/meta/*` (re-generate).
- **Fix:** Replace existing `(profile_id, sent_at)` index with `(profile_id, type, sent_at)`. 5 callers benefit: `apps/api/src/services/settings.ts:508-599` (3 sites), `apps/api/src/inngest/functions/daily-reminder-scan.ts:90-94`, `review-due-scan.ts:93-97`, `recall-nudge.ts:105-109`. After schema edit, run `pnpm --filter @eduagent/database exec drizzle-kit generate --name bug673_notification_log_profile_type_sent_idx` — but the existing `0092_…sql` already has the correct content; either reuse or regenerate.

#### BUG 571 — pendingNotices.type pgEnum migration (design only) — **DONE** (doc committed; migration itself still deferred)
- **File:** `docs/plans/2026-05-24-pending-notices-type-pgenum-migration.md` (**survives untracked — commit as-is**).
- **Status:** Design doc only. Schema change is breaking (ALTER COLUMN TYPE with USING cast fails on out-of-enum legacy rows). Doc captures: proposed Drizzle code, exact migration SQL with pre-flight row scan, rollback section, acceptance criteria. Schedule a dedicated PR for the actual migration.

---

### Bundle J — Mobile small fixes [Sonnet] — **STATUS: DONE (2026-05-25, branch `freeform` staged)**

#### BUG 624 — use-mentor-language-sync test mocks lib/profile without gc1-allow — **DONE**
- **File:** `apps/mobile/src/hooks/use-mentor-language-sync.test.ts`
- **Current state:** The mock already uses `jest.requireActual('../lib/profile')` pattern at lines 21-22 — that's the proper escape and arguably doesn't need a `gc1-allow` comment. Verify whether the bug is still real by reading the file in context; if the override is comprehensive, mark obsolete. Otherwise add `// gc1-allow: <real reason>` or remove the mock.

#### BUG 631 — CollapsibleChapter local Topic interface — **DONE**
- **File:** `apps/mobile/src/components/library/CollapsibleChapter.tsx:6`
- **Fix:** Replace local `interface Topic { ... }` with import from `@eduagent/schemas` (likely `CurriculumTopic`). If only a subset is needed, use `Pick<CurriculumTopic, 'id' | 'title' | …>`.

#### BUG 639 — Inconsistent hour-to-period mapping in greeting helpers — **DONE**
- **File:** `apps/mobile/src/lib/greeting.ts` (`getTimeOfDay`, `getGreeting`)
- **Fix:** Grep for any other `getGreeting`/`morning|afternoon|evening` mappers in mobile. Consolidate to one — `apps/mobile/src/lib/greeting.ts` is dominant.

#### BUG 642 — color-opacity helper has no hex validation — **DONE**
- **File:** `apps/mobile/src/lib/color-opacity.ts` (`withOpacity`)
- **Fix:** Current code checks `hex.length === 3/6/8` but doesn't validate hex digits — `#xyz` produces `#xyzxyz<alpha>` (invalid CSS). Add regex `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$` validation. On invalid input, log a warning and return the input unchanged (UI safety — match existing graceful fallbacks like the `oklch/hsl/named` path).

---

### Bundle K — CI/Config package.json hygiene [Sonnet] — **STATUS: DONE**

#### BUG 696 — dotenv in root prod deps — **DONE**
- **File:** `package.json`
- **Fix:** Move `dotenv: ^16.4.7` from root `dependencies` to `devDependencies`. The `dependencies` block becomes empty (delete it).

#### BUG 697 — dotenv in packages/test-utils prod deps — **DONE**
- **File:** `packages/test-utils/package.json`
- **Fix:** Move `dotenv` to `devDependencies`. Verified all consumers of `@eduagent/test-utils` are test files only.

#### BUG 698 — jest-expo specifier drift — **DONE**
- **File:** `package.json` (root)
- **Fix:** Bump root `jest-expo` from `~54.0.13` to `~54.0.16` to match `apps/mobile/package.json`.

#### BUG 708 — @cloudflare/workers-types duplicated — **DONE**
- **File:** `package.json` (root)
- **Fix:** Remove `@cloudflare/workers-types` from root `devDependencies`. Keep in `apps/api/package.json` (the sole consumer).

**Post-edit:** Run `pnpm install --ignore-scripts` (avoid the husky prepare side-effect). Verify with `node scripts/check-no-mobile-deps-at-root.cjs` and `pnpm exec tsc --build`.

---

## Re-dispatch advice

- **Don't dispatch in parallel with another `/commit`-active session** — every `/commit` stash cycle wipes uncommitted edits across the whole tree. Confirm only one Claude session has commit authority on `usage-guard` before starting.
- **Don't commit unless the user asks.** The `fix-notion-bugs` skill says "Do NOT commit. Work locally only. Coordinator commits via /commit when the user asks." Honor that default.
- **For each re-dispatched bundle:** mark the bug In progress in Notion just before dispatch (the page IDs are in `C:\tools\tmp\notion-bug-map.tsv`). Notion was reverted to Not started for all 32 — they're free to claim.

---

## Notion page-ID map (32 reverted bugs)

For quick re-dispatch. Full TSV at `C:\tools\tmp\notion-bug-map.tsv`.

| Bug | Page ID |
|-----|---------|
| 472 | `3678bce9-1f7c-8174-ab6a-dfb8490eecfc` |
| 500 | `3678bce9-1f7c-81aa-af95-c6aad63aec75` |
| 571 | `3678bce9-1f7c-8186-ab5d-f48534724695` |
| 580 | `3678bce9-1f7c-81ee-a642-c8b673f484b0` |
| 624 | `3698bce9-1f7c-81a5-93b7-cc4753ed92f4` |
| 631 | `3698bce9-1f7c-8125-a588-ceb8bcaa305d` |
| 634 | `3698bce9-1f7c-81f7-bd78-c23e7640f010` |
| 639 | `3698bce9-1f7c-8186-8415-d8ebfa77bf1b` |
| 640 | `3698bce9-1f7c-81db-a75e-d5cc938e9009` |
| 641 | `3698bce9-1f7c-81cb-ad03-fbbf4c44868e` |
| 642 | `3698bce9-1f7c-8190-b22a-edd75ffe6147` |
| 643 | `3698bce9-1f7c-8194-81a5-f269f92ac777` |
| 644 | `3698bce9-1f7c-8107-a111-ef26e446b0b4` |
| 645 | `3698bce9-1f7c-8109-a2b4-edfc4d2c9100` |
| 650 | `3698bce9-1f7c-8180-9d96-e854cddc6711` |
| 651 | `3698bce9-1f7c-811b-9cb9-dfe51429edbe` |
| 652 | `3698bce9-1f7c-812e-96fb-e20267c912cb` |
| 654 | `3698bce9-1f7c-8176-9906-f3c642823f97` |
| 655 | `3698bce9-1f7c-81f9-9949-fcad0e2e2b85` |
| 656 | `3698bce9-1f7c-813a-a382-dc50c9b78b02` |
| 665 | `3698bce9-1f7c-818c-938c-c8069d383d69` |
| 672 | `3698bce9-1f7c-819f-be54-cdfb632010f4` |
| 673 | `3698bce9-1f7c-8114-941f-e1e9bdc532cf` |
| 688 | `3698bce9-1f7c-8196-a502-fa710af52526` |
| 689 | `3698bce9-1f7c-81ef-9f52-c11812e1a550` |
| 695 | `3698bce9-1f7c-81bd-b184-dbf28aea3e51` |
| 696 | `3698bce9-1f7c-8126-9bdf-fc403e5984a9` |
| 697 | `3698bce9-1f7c-8114-a0a0-e91c6a045497` |
| 698 | `3698bce9-1f7c-8144-a0cc-f104e7da3b99` |
| 708 | `3698bce9-1f7c-816e-9e04-f2e3abe5a09b` |
| 731 | `3698bce9-1f7c-81cf-b8d1-d679f848aa2b` |
| 747 | `3698bce9-1f7c-8130-97ce-e828a89a3d73` |

---

## Surviving untracked artifacts

These files weren't deleted by the wipe cycles (untracked survives `git reset --hard HEAD`). The next session can re-use them instead of re-implementing:

- `.bugs-688-689-695.patch` — Bundle D's full diffs for BUG 688, 689, 695. Apply via `git apply .bugs-688-689-695.patch`.
- `apps/api/src/inngest/functions/webhook-idempotency-purge.ts` — Bundle I BUG 672 cron implementation (re-wire registration in `inngest/index.ts`).
- `apps/api/drizzle/0092_bug673_notification_log_profile_type_sent_idx.sql` + `.rollback.md` — Bundle I BUG 673 migration (still need to re-edit `packages/database/src/schema/progress.ts` and re-generate `drizzle/meta`).
- `docs/plans/2026-05-24-pending-notices-type-pgenum-migration.md` — Bundle I BUG 571 design doc (commit as-is).
