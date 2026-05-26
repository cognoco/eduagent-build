# Batch 1 — Notion Bug Verification Report

Branch: `codex/h1-progress-contract-migration` (current, NOT `codex/h1-isowner-navigation-contract-sweep` as briefed — coordinator note)
HEAD: `343b0502f`

---

### #63 — [LEARN-01/LEARN-07] Ask freeform chat fails before session summary
- **Verdict:** NEEDS_REVIEW
- **File(s):** runtime Playwright flow — no static code site cited in Notion body
- **Evidence:** Notion `resolution` field on the row already says "needs playwright repro on test-coverage-hardening and a targeted ChatShell/session-end fix" — the bug was reopened from "Resolved" because no commit since `1391d7490` matches the symptom. Verifying requires running `pnpm run test:e2e:web` against the J-08 flow, which is out of scope for read-only verification.
- **Confidence:** HIGH (that this can't be resolved from code-grep alone)
- **Notion sync action:** Leave Open

### #188 — [M6-HIGH] 228 unannotated internal `jest.mock` across 83 test files
- **Verdict:** PARTIALLY_FIXED
- **File(s):** `apps/mobile/**/*.test.{ts,tsx}` (sweep target)
- **Evidence:** Current count on this branch is **147 internal-mock lines across 64 files** (down from 228 / 83 reported on 2026-05-18). Top offenders reported by Notion (`book/[bookId].test.tsx`, `session-summary/[sessionId].test.tsx`, `shelf/[subjectId]/index.test.tsx`, `mentor-memory.test.tsx`, `(app)/_layout.test.tsx`) all still exist as files; many still carry internal mocks. GC6 sweep is progressing on edit-touched files but the backlog is large.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open — refresh body with new count (147 / 64) and reflect ongoing GC6 burn-down rather than closing.

### #388 — [CR-2026-05-19-M4] UX dead-ends without recovery in 9+ sites
- **Verdict:** STILL_OPEN (with one site partially mitigated)
- **File(s):**
  - `apps/api/src/routes/dashboard.ts:70-85` — empty `children` returned with no discriminant.
  - `apps/api/src/middleware/metering.ts:533-548, 559-571` — daily-exhausted message still says "Come back tomorrow"; `upgradeOptions` is in `details` but the user-visible `message` has no upgrade CTA.
  - `apps/api/src/services/billing/tier.ts:147-153` — `getUpgradePrompt` only fires at 100% (`usedThisMonth >= monthlyLimit`); no 80%/95% soft warning.
  - `apps/mobile/src/components/progress/RecentSessionsList.tsx:131-141` — empty state text-only, no "Start a session" CTA.
  - `apps/mobile/src/components/session/FilingFailedBanner.tsx:94-122` — Retry button disabled at `MAX_RETRIES` with no secondary action.
  - `apps/mobile/src/app/(app)/session/_layout.tsx:9` — silent `<Redirect href="/(app)/home" />` for parent-proxy users, no explanation.
  - `apps/mobile/src/app/(app)/onboarding/index.tsx:4` — unconditional `<Redirect href="/(app)/onboarding/pronouns" />`.
  - `apps/mobile/src/app/(app)/practice/assessment/index.tsx:273-277` — `createAssessment` failure path animates `formatApiError(err)` into the chat with no ErrorFallback / recovery affordance.
- **Evidence:** All 8 sites verified above still carry the reported pattern. No reusable `<ErrorFallback>` / `<EmptyState>` component landed. `sse.ts:263` and `formatApiError`/classification gap could not be re-located at the exact cited line — current `sse.ts` does richer 400-class handling at readyState 2 but the "unknown/retry" race window remains plausible. Sweep is incomplete.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open — possibly split per-site for tractable burn-down.

### #421 — [CR-2026-05-21-016] recall-bridge reads `curriculum_topics` unscoped
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/api/src/services/recall-bridge.ts:48-68`
- **Evidence:** Current code now joins `curriculumTopics → curriculumBooks → subjects` and filters `eq(subjects.profileId, profileId)`. Comment at lines 48-52 explicitly cites this as "Defense-in-depth: ... a bug in session creation can never silently leak a foreign topic into the LLM prompt." The unscoped `db.query.curriculumTopics.findFirst` pattern the bug describes is gone.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved (current code on `codex/h1-progress-contract-migration`).

### #485 — [CR-2026-05-21-080] `routeAndCall` does not wire `responseFormat:'json'` into Anthropic provider
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/api/src/services/llm/providers/anthropic.ts:82-151, 189-205`; `apps/api/src/services/llm/providers/anthropic.test.ts:73-159`
- **Evidence:** `toAnthropicFormat(messages, responseFormat)` now appends a JSON-only directive when `responseFormat === 'json'`, and both `chat()` and `chatStream()` pass `config.responseFormat` through that formatter before issuing the Anthropic request. The provider test suite asserts both directive injection and fetch-payload wiring, covering the exact gap this bug reported.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved.

### #519 — [CR-2026-05-21-114] `handleAddProfile` silently no-ops while subscription loads
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/mobile/src/app/profiles.tsx:100-102`; `apps/mobile/src/app/profiles.test.tsx`
- **Evidence:** `handleAddProfile` now unconditionally calls `router.push('/create-profile')`; the subscription-loading early return is gone. The profiles test suite now covers family tier, free tier, and the explicit `subscription.data === null` loading case so the add button cannot regress back into a dead tap while billing state hydrates.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved.

### #572 — [CR-2026-05-21-167] `bookmarks.sessionId/eventId` are raw UUIDs with no profile-side ownership guard
- **Verdict:** NEEDS_REVIEW
- **File(s):** `packages/database/src/schema/bookmarks.ts:22-24` (schema unchanged); `apps/api/src/services/bookmarks.ts:46-72` (the only production insert path).
- **Evidence:** The schema-level concern stands — `sessionId` / `eventId` are still `uuid().notNull()` with no FK and no `createScopedRepository` wrapper. However, the only production writer (`createBookmark`) already derives `sessionId` and `eventId` from a `sessionEvents` lookup that filters by `profileId` (lines 64-71) before inserting. Other `.insert(bookmarks)` sites are only in `test-seed.ts` and tests. So the concrete attack ("hostile route takes sessionId/eventId from request body") does not exist today, but the schema/repo gap means a future writer added without re-reading this code could regress.
- **Confidence:** MEDIUM
- **Notion sync action:** Investigate further — consider downgrading to a defense-in-depth task and either (a) add the proposed scoped-repo `bookmarks.insert` to forward-only ratchet, or (b) close as "not exploitable today, future-proofing only."

### #599 — [SUBJECT-16] App-language sync skips newly active profile after switch
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/mobile/src/hooks/use-mentor-language-sync.ts:7-38`; `apps/mobile/src/hooks/use-mentor-language-sync.test.ts:114-127`
- **Evidence:** `lastSyncedRef` is now keyed by `{ profileId, language }`, and the guard only suppresses a sync when both match the current active profile. The dedicated `[B-599]` test switches from profile A to profile B without changing app language and asserts that the second sync still fires.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved.

### #612 — [DICT-06] Dictation review timeout can be overridden by late response
- **Verdict:** ALREADY_FIXED
- **File(s):** `apps/mobile/src/app/(app)/dictation/complete.tsx:33-49, 69-76, 211-245`; `apps/mobile/src/app/(app)/dictation/complete.test.tsx:432-517`
- **Evidence:** The 20-second timeout callback now sets `reviewCancelledRef.current = true`, increments `latestReviewAttemptRef`, and only then flips `reviewTimedOut`, so any late response is rejected by the post-await guards before navigation or alert UI can fire. The `[BUG-612]` regression tests cover both the timeout banner and the late-success suppression path.
- **Confidence:** HIGH
- **Notion sync action:** Move to Resolved.

---

## Summary

| BugId | CR | Verdict | Confidence |
|---|---|---|---|
| #63 | LEARN-01/LEARN-07 | NEEDS_REVIEW | HIGH |
| #188 | M6-HIGH (jest.mock) | PARTIALLY_FIXED | HIGH |
| #388 | CR-2026-05-19-M4 | STILL_OPEN | HIGH |
| #421 | CR-2026-05-21-016 | ALREADY_FIXED | HIGH |
| #485 | CR-2026-05-21-080 | ALREADY_FIXED | HIGH |
| #519 | CR-2026-05-21-114 | ALREADY_FIXED | HIGH |
| #572 | CR-2026-05-21-167 | NEEDS_REVIEW | MEDIUM |
| #599 | SUBJECT-16 | ALREADY_FIXED | HIGH |
| #612 | DICT-06 | ALREADY_FIXED | HIGH |

**Headline:** **5 / 9** bugs (#421, #485, #519, #599, #612) are cleanly fixed and ready to move to Resolved. **#388** is clearly still open. **#188** shows real burn-down progress (228 → 147 mocks) but remains open. **#63** and **#572** still need human/runtime judgment beyond code-grep.
