# Library Wiring Fixes & Session Debugging Plan

**Date:** 2026-04-22
**Status:** In progress — library fixes applied locally (Part 1, 2); progress ghost-session fix committed + pushed (Part 2b, `2e901ac3`); streaming root cause identified but not yet fixed (Part 3)
**Branch:** `testing`

---

## Context

User testing on staging (Galaxy S10e, real phone) revealed that the library screens feel disconnected from actual learning. Tapping topics, books, and shelves didn't produce the expected navigation or content. Inngest dashboard investigation revealed all 18 sessions today were `auto_closed` by the stale-cleanup cron after ~2 exchanges.

---

## Part 1: Library Wiring Fixes (DONE — local only, not deployed)

### Findings

| # | Problem | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Book screen blank — no topic list | `CollapsibleChapter` component existed but was never wired into the Book screen | Added `CollapsibleChapter` per chapter group with retention signals, note icons, and topic press → Topic Detail |
| 2 | Topics tab jumped directly into a session | `library.tsx:openTopic()` pushed to `/(app)/session` instead of `/(app)/topic/[topicId]` | Changed to navigate to Topic Detail first; the detail screen decides what session mode to use |
| 3 | Back arrows → home page | `topic/[topicId].tsx` and `relearn.tsx` used `goBackOrReplace(router, '/(app)/home')` | Changed fallback to `/(app)/library` |
| 4 | Tapping a shelf did nothing (single-book auto-skip) | Shelf screen auto-redirected to Book screen for single-book subjects via `router.replace()`, making navigation feel broken | Removed auto-skip entirely; shelf always renders (spec flagged this for user testing) |
| 5 | Book screen back button inconsistent | Single-book shelves → library, multi-book → shelf (two different behaviors) | Simplified: always go back to shelf |
| 6 | Note icon on chapter list was a dead-end tap | `onNotePress` prop not passed to `CollapsibleChapter` | Added handler — tapping note icon navigates to Topic Detail (which shows the note) |
| 7 | "Retention: Weak" on not-started topics | Retention cards pre-created with `repetitions: 0`; `deriveRetentionStatus` mapped this to `'weak'` | Hide retention card entirely when `completionStatus === 'not_started'` |
| 8 | Empty parking lot shown on untouched topics | Parking lot card always rendered, even when empty | Only render when `parkedQuestions.length > 0` |
| 9 | Stale BUG-342 comment | Comment referenced old session-mode derivation logic that was removed | Removed |

### Files changed (mobile)

- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` — CollapsibleChapter, retention, topic navigation, simplified back
- `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx` — removed auto-skip
- `apps/mobile/src/app/(app)/library.tsx` — openTopic → Topic Detail
- `apps/mobile/src/app/(app)/topic/[topicId].tsx` — back fallback, hide retention/parking lot for not-started
- `apps/mobile/src/app/(app)/topic/relearn.tsx` — back fallback
- Test files updated for all above

### Verification

- TypeScript: clean (`tsc --noEmit` — 0 errors)
- Tests: 110/110 pass across 6 test suites

---

## Part 2: Session Visibility Fix (DONE — local only, not deployed)

### Finding

`getBookSessions()` in `apps/api/src/services/session/session-book.ts` filtered by `status = 'completed'`. Auto-closed sessions (killed by stale-cleanup cron) have `status = 'auto_closed'`, making them invisible to the Book screen — even when they have valid `topicId` and `exchangeCount > 0`.

### Fix applied

```diff
- eq(learningSessions.status, 'completed'),
+ inArray(learningSessions.status, ['completed', 'auto_closed']),
```

Also lowered the exchange threshold from `(exchangeCount >= 3 OR durationSeconds >= 60)` to `exchangeCount >= 1` — any session where the child said at least one thing now appears.

### Verification

- TypeScript: clean
- No dedicated unit tests for `session-book.ts` (tested via integration tests)

---

## Part 2b: Progress Screen Ghost-Session Fix (DONE — committed `2e901ac3`) [PROG-GHOST]

### Finding

`getTopicProgress` and `getTopicProgressBatch` in `apps/api/src/services/progress.ts` counted **every** session row when computing `completionStatus`, with no `exchangeCount` filter. A "ghost session" — created when the user tapped a topic then abandoned before sending a message (`exchangeCount = 0`, `status = 'active'`) — was enough to flip the topic to `'in_progress'`.

Meanwhile `dashboard.ts:856` (parent child-view) and `curriculum.ts:248` (book status) already filtered `gte(exchangeCount, 1)`. Same topic, same profile, three different answers to "is it started?":

| Surface | Before fix |
|---|---|
| Progress screen | "In progress" (ghost session counted) |
| Dashboard (parent view) | "0 sessions" (topic filtered out entirely) |
| Library / Book view | Book status NOT_STARTED (ghost session not counted) |

The smoking gun was inside `progress.ts` itself: `getSubjectProgress` at line 138-143 already had the `gte(exchangeCount, 1)` filter with the comment *"only sessions with real activity"*, but the fix was never propagated to the per-topic queries 80 lines down.

### Fix applied

```diff
- const topicSessions = await repo.sessions.findMany(
-   eq(learningSessions.topicId, topicId)
- );
+ const topicSessions = await repo.sessions.findMany(
+   and(
+     eq(learningSessions.topicId, topicId),
+     gte(learningSessions.exchangeCount, 1)
+   )
+ );
```

Applied to both `getTopicProgress` (single-topic, `progress.ts:220`) and `getTopicProgressBatch` (list-payload hot path, `progress.ts:520`).

### Verification

- **Behavioral test:** `progress.test.ts` [PROG-GHOST] — ghost-only topic returns `completionStatus = 'not_started'` and `totalSessions = 0`.
- **Structural break test:** inspects the mock's filter argument and asserts it contains `exchange_count`. A future refactor that strips the filter will fail this test.
- **Full suite:** 437 tests across 25 related test suites pass (`jest --findRelatedTests src/services/progress.ts`), including `dashboard.integration.test.ts` (real DB).
- **Typecheck:** clean.

### Relationship to the architecture observation (lines 135-145)

This fix addresses another concrete instance of the "contradictory derived state" pattern the plan flagged. Where the plan called out *"topic shows Not started but has retention signal"*, this was the opposite direction: *"topic shows started but dashboard shows 0 sessions."* Same root cause — progress is computed at read time from session counts without a shared definition of which sessions count.

---

## Part 3: Session Auto-Close — Root Cause (NOT YET FIXED)

### The actual problem

All 18 sessions today on staging were `auto_closed` by the stale-cleanup cron. The cron runs every 10 minutes and kills sessions where `lastActivityAt` is more than 30 minutes old.

### Evidence from Inngest

- **18 session-completed runs** — all with `summaryStatus: "auto_closed"`
- **re-read-session step** on one run shows `exchangeCount: 2, topicId: <valid UUID>` — so sessions ARE linked to topics and DO have exchanges, but are dying after ~2 exchanges
- `lastActivityAt` IS updated per exchange (`session-exchange.ts:913`), so the cron should NOT kill active sessions

### What this means

The user reports "chats cut off after a few messages." The data confirms: sessions start, 1-2 exchanges happen, then the conversation stops (from the server's perspective). The session sits idle for 30+ minutes, and the cron kills it.

**The streaming connection is dying silently on the client side.** The user may see the AI's last response but can't send more messages. No error is shown. The session goes stale.

### Impact chain

```
Streaming breaks after ~2 exchanges
  → Client can't send more messages (no error shown)
  → User gives up / tries a new session
  → Original session sits idle for 30 minutes
  → Stale-cleanup cron kills it (status: auto_closed)
  → Book screen filters for status = 'completed' → invisible
  → Topic progress finds 0 completed sessions → "Not started"
  → User sees blank library with no history
```

### Investigation plan for streaming disconnect

1. **Check the streaming endpoint** (`POST /sessions/:id/messages`) — does it return errors after 2 exchanges?
2. **Check client-side error handling** in `use-session-streaming.ts` — is there a silent catch that swallows errors?
3. **Check SSE/streaming connection** — does the mobile app properly handle connection drops and reconnect?
4. **Check if there's an exchange limit** being hit — any server-side cap at 2 exchanges?
5. **Check staging API logs** (Cloudflare Workers) — are there 500 errors on the message endpoint?
6. **Check if it's device-specific** — Galaxy S10e has limited RAM, could the app be crashing silently?

### Separate Inngest issue found

60 failures on the `review-due-scan` function: `NeonDbError: syntax error at or near "SELECT"`. This is a broken SQL query in a cron job, unrelated to sessions but should be fixed. Runs every 2 hours.

---

## Deployment plan

### Step 1: Deploy library fixes + session visibility fix + progress ghost-session fix
- Commit all Part 1 + Part 2 changes (still local per this plan)
- Part 2b already committed + pushed: `2e901ac3` [PROG-GHOST]
- Deploy API to staging (Cloudflare Workers)
- OTA update mobile (if JS-only changes) or EAS build
- Verify:
  - Book screen shows topics, sessions appear, navigation works (Part 1 + 2)
  - Topics without any real exchanges no longer appear "In progress" on the progress screen (Part 2b)

### Step 2: Debug streaming disconnect (Part 3)
- Requires staging API logs or local reproduction
- May need client-side logging added to the streaming hook
- Separate branch or continuation of `testing`

### Step 3: Fix review-due-scan SQL error
- Check `apps/api/src/inngest/functions/` or the service it calls
- Likely a Drizzle query with a syntax issue
- Fix + deploy to staging

---

## Architecture observation

The library's "Claude Projects" mental model (book = project, topics = docs, sessions = conversations) requires tight binding between sessions and topics. Currently the binding is fragile:

- Topics are created by curriculum generation (independent of sessions)
- Sessions are created by the chat system (topicId is nullable)
- Retention cards are pre-created for all topics (independent of sessions)
- Filing is the only bridge between freeform sessions and topics (async, can fail)
- Progress is computed at read time from session counts (not stored)

This creates contradictory states (topic shows "Not started" but has retention signal; session exists but library can't find it). The Part 1 and Part 2 fixes address the symptoms. The streaming disconnect (Part 3) is the root cause of most visible issues today.
