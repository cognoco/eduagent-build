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
- **Verdict:** STILL_OPEN
- **File(s):** `apps/api/src/services/llm/router.ts:719-727` (config build); `apps/api/src/services/llm/providers/anthropic.ts` (no `responseFormat` usage).
- **Evidence:** `router.ts:726` passes `responseFormat: 'json'` into the config. Grep across `apps/api/src/services/llm/providers/anthropic.ts` for `responseFormat` or `response_format` returns no matches; only `gemini.ts:146` and `openai.ts:121,174` honor the flag. So calls routed to Anthropic silently ignore the JSON-mode request, matching the reported bug. No validation/assertion exists in `routeAndCall` either.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

### #519 — [CR-2026-05-21-114] `handleAddProfile` silently no-ops while subscription loads
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/profiles.tsx:100-104`
- **Evidence:** `if (!subscription) { return; }` is still the first statement of `handleAddProfile`. The comment "Query still loading — don't block with a false 'Upgrade required'" justifies the early-return but no spinner / disabled state / toast is wired — exactly the dead-button UX silent-fallback the bug describes.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

### #572 — [CR-2026-05-21-167] `bookmarks.sessionId/eventId` are raw UUIDs with no profile-side ownership guard
- **Verdict:** NEEDS_REVIEW
- **File(s):** `packages/database/src/schema/bookmarks.ts:22-24` (schema unchanged); `apps/api/src/services/bookmarks.ts:46-72` (the only production insert path).
- **Evidence:** The schema-level concern stands — `sessionId` / `eventId` are still `uuid().notNull()` with no FK and no `createScopedRepository` wrapper. However, the only production writer (`createBookmark`) already derives `sessionId` and `eventId` from a `sessionEvents` lookup that filters by `profileId` (lines 64-71) before inserting. Other `.insert(bookmarks)` sites are only in `test-seed.ts` and tests. So the concrete attack ("hostile route takes sessionId/eventId from request body") does not exist today, but the schema/repo gap means a future writer added without re-reading this code could regress.
- **Confidence:** MEDIUM
- **Notion sync action:** Investigate further — consider downgrading to a defense-in-depth task and either (a) add the proposed scoped-repo `bookmarks.insert` to forward-only ratchet, or (b) close as "not exploitable today, future-proofing only."

### #599 — [SUBJECT-16] App-language sync skips newly active profile after switch
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/hooks/use-mentor-language-sync.ts:11-27`
- **Evidence:** `lastSyncedRef` is `useRef<string | null>(null)` at line 11 (still language-only, not `(profileId, language)`). Line 20 `if (parsed.data === lastSyncedRef.current) return;` returns without checking `activeProfile.id`. The `useEffect` deps array includes `activeProfile` so it does re-run, but the early-return path means profile B with `conversationLanguage: 'en'` is skipped when `lastSyncedRef.current === 'nb'`. Exactly the reported bug.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

### #612 — [DICT-06] Dictation review timeout can be overridden by late response
- **Verdict:** STILL_OPEN
- **File(s):** `apps/mobile/src/app/(app)/dictation/complete.tsx:33-43, 62-72`
- **Evidence:** Lines 36-43: `setTimeout(() => { setReviewTimedOut(true); }, 20_000)` sets only the boolean — it does NOT set `reviewCancelledRef.current = true`. `reviewCancelledRef` is set true only on screen blur (line 69) and on user-driven Skip (line 318). A late successful response after the 20s timeout will therefore pass the `if (reviewCancelledRef.current) return;` checks at lines 203 and 212 and navigate. Matches the bug body exactly.
- **Confidence:** HIGH
- **Notion sync action:** Leave Open.

---

## Summary

| BugId | CR | Verdict | Confidence |
|---|---|---|---|
| #63 | LEARN-01/LEARN-07 | NEEDS_REVIEW | HIGH |
| #188 | M6-HIGH (jest.mock) | PARTIALLY_FIXED | HIGH |
| #388 | CR-2026-05-19-M4 | STILL_OPEN | HIGH |
| #421 | CR-2026-05-21-016 | ALREADY_FIXED | HIGH |
| #485 | CR-2026-05-21-080 | STILL_OPEN | HIGH |
| #519 | CR-2026-05-21-114 | STILL_OPEN | HIGH |
| #572 | CR-2026-05-21-167 | NEEDS_REVIEW | MEDIUM |
| #599 | SUBJECT-16 | STILL_OPEN | HIGH |
| #612 | DICT-06 | STILL_OPEN | HIGH |

**Headline:** Only **1 / 9** bugs (#421) is cleanly fixed and ready to move to Resolved. **5 / 9** are clearly still open. **#188** shows real burn-down progress (228 → 147 mocks) but remains open. **#63** and **#572** need human/runtime judgment beyond code-grep.
