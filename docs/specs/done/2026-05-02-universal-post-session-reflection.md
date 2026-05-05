# Universal Post-Session Reflection with XP Incentive

**Date:** 2026-05-02
**Status:** Draft
**Author:** Product conversation (Zuzana + Claude)

## Purpose

Today the session summary screen (with its "Your Words" reflection input) only appears for **learning mode** sessions. Freeform and homework sessions route to a filing prompt and then either the shelf (on success) or the summary screen (on filing failure/dismiss). This means most freeform and homework sessions end without the student ever being asked to articulate what they learned.

Additionally, the reflection is purely optional — students can skip every session with no tangible consequence. The skip-warning system (5-skip / 10-skip) only fires in Serious mode and is easily ignored.

This spec makes two changes:

1. **Every session type (learn, ask, homework) routes through the reflection step.**
2. **Submitting a reflection awards a 1.5x XP multiplier; skipping forfeits it visibly.**

The pedagogical rationale: retrieval practice (restating what you learned in your own words) is one of the strongest evidence-based learning strategies. Making it feel rewarding rather than mandatory keeps it aligned with our "quiet defaults over friction" principle.

## Goals

1. Students see the reflection prompt after every session, regardless of mode.
2. Students who write a reflection earn 50% more XP than those who skip.
3. The XP incentive is visible *before* the student decides to skip — they see what they'll miss.
4. Sentence starters adapt to the session mode (learn vs. ask vs. homework).
5. Skip is still available — we nudge, not block.

## Non-Goals

- No voice recording of reflections in this spec (future work — see Epic 17 voice-first).
- No mandatory minimum session length to trigger reflection (even a 1-exchange session gets the prompt; the student can skip quickly if it was trivial).
- No changes to the filing prompt itself — filing and reflection become sequential steps, not alternatives.
- No changes to delayed recall or mastery gating — those remain learning-mode-only features controlled by `LearningModeRules`.

## Current Flow (What Changes)

### Learning mode (today)
```
End Session → Session Summary (reflection optional) → Home
```

### Freeform / Homework (today)
```
End Session → Filing Prompt → [Accept: Shelf] or [Dismiss/Fail: Session Summary] → Home
```
Note: Filing-accept path **skips reflection entirely**.

### All modes (proposed)
```
End Session → Filing Prompt (freeform/homework only) → Session Summary (reflection + XP incentive) → Home
```

The key change: filing-accept no longer exits to the shelf. Instead, it stores the filing result and continues to the session summary. The summary screen's "Done" button navigates to the shelf if filing succeeded, or Home otherwise.

## Design

### 1. Mode-Adaptive Sentence Starters

The existing `SUMMARY_PROMPTS` array is replaced with mode-keyed variants:

| Mode | Sentence Starters |
|------|-------------------|
| **Learn** | "Today I learned that..." · "The most interesting thing was..." · "I want to learn more about..." · "Something that surprised me was..." |
| **Ask (freeform)** | "The answer I was looking for was..." · "Now I understand that..." · "I still have questions about..." · "The most useful thing I found out was..." |
| **Homework** | "The key thing I practiced was..." · "I got stuck on..." · "Next time I would..." · "I now know how to..." |

**Localization:** If the profile's `conversationLanguage` (from onboarding) is not English, sentence starters must be translated. Implementation: store starters as i18n keys, not hardcoded strings. The LLM that generates the AI feedback already knows the student's language; sentence starters follow the same language. For launch, support EN and CS (Czech) — the two active user languages. Additional languages are added to the translation file as needed.

### 2. XP Reflection Multiplier

A new constant `REFLECTION_XP_MULTIPLIER = 1.5` in `services/xp.ts`.

**Schema constraint:** `xp_ledger.topicId` is `NOT NULL`. This means sessions without a resolved topic (most freeform sessions) never have an `xp_ledger` row. For these sessions, the XP multiplier is inapplicable — the banner is hidden client-side, and no multiplier logic runs server-side. The reflection prompt still appears (pedagogical value), but the XP incentive is absent.

**Server-side flow:**
- When a session closes, base XP is calculated as today (mastery × depth) and inserted into `xp_ledger` — but only if the session has a `topicId`. No topic = no XP row = no multiplier possible.
- XP insertion happens synchronously on session close (inside `closeSession` handler), NOT via Inngest. This guarantees the row exists before the student reaches the summary screen.
- When a summary is **submitted and accepted**, the XP amount is multiplied by 1.5 (rounded). The `applyReflectionMultiplier` function is a no-op if: (a) no `xp_ledger` row exists for this session's topic, or (b) `reflectionMultiplierApplied` is already true.
- When a summary is **skipped**, the XP amount stays at base.
- A new column `reflectionMultiplierApplied` (boolean, default false) on `xp_ledger` prevents double-application.

**Quality gate:** The multiplier requires AI acceptance, not just submission. The existing 10-character minimum prevents single-character gaming. The AI evaluation rejects content that shows no genuine retrieval effort (e.g., "asdfasdf", repeated characters, copy-pasted prompt text). A reflection that merely restates the sentence starter without adding content is rejected. The quality bar is low — we want to reward effort, not perfect prose — but it exists.

**Client-side display:**
- The session summary screen shows a banner above the reflection input:
  ```
  ┌─────────────────────────────────────────┐
  │  ✦  Write a reflection to earn 1.5x XP  │
  │     Base: 120 XP → With reflection: 180 XP │
  └─────────────────────────────────────────┘
  ```
- Banner is **hidden** when the session has no XP entry (no topic resolved). The reflection input still appears — just without the XP incentive copy.
- After submission, the banner updates to show the earned bonus.
- After skipping, the completion card shows greyed-out text: "You missed +60 XP".

### 3. Navigation Changes

#### `use-session-actions.ts` — `handleEndSession`

Current freeform/homework branch:
```ts
if (effectiveMode === 'freeform' || effectiveMode === 'homework') {
  setShowFilingPrompt(true);
} else {
  navigateToSummary(...);
}
```

Proposed: Filing prompt is now an intermediate step. After filing completes (accept or dismiss), navigation continues to the summary screen:

```ts
if (effectiveMode === 'freeform' || effectiveMode === 'homework') {
  setShowFilingPrompt(true);
  // Filing callbacks (accept/dismiss) now call navigateToSummary()
  // instead of navigating to shelf or home directly.
} else {
  navigateToSummary(...);
}
```

#### `SessionFooter.tsx` — `StandardFilingPrompt`

- **"Yes, add it" button:** Calls `filing.mutateAsync()`, stores result in a ref, then calls `navigateToSessionSummary()` (instead of `router.replace` to shelf).
- **"No thanks" button:** Already calls `navigateToSessionSummary()` — no change needed.
- The filed shelf/book IDs are passed as URL params to the summary screen so the "Done" button can deep-link to the filed book.

#### `session-summary/[sessionId].tsx`

- New optional URL params: `filedSubjectId`, `filedBookId` (set when filing succeeded).
- "Done" button logic:
  - If `filedSubjectId` + `filedBookId` present → navigate to the filed book. **Per CLAUDE.md cross-tab navigation rule**, push the full ancestor chain to avoid a 1-deep dead-end stack:
    1. `router.replace('/(app)/library')` — land on Library tab
    2. Then `router.push('/(app)/shelf/[subjectId]/book/[bookId]')` — push book onto the Library stack
    This gives the student a working back button (Book → Library) instead of a dead-end where `router.back()` falls through to Home.
  - Otherwise → `goBackOrReplace('/(app)/home')`
- New URL param: `sessionType` already exists (`'learning' | 'homework'`). Extend to include `'freeform'`.

### 4. Skip-Nudging (Strengthened)

Current thresholds only apply in Serious mode. Proposed changes:

| Consecutive Skips | Current Behavior | Proposed Behavior |
|-------------------|-----------------|-------------------|
| 1–2 | Nothing | Nothing |
| 3 | Nothing | Subtle copy change: "Reflecting helps you remember — give it a try?" |
| 5 | Warning (Serious only) | Warning (all modes): "Students who reflect remember 2x more" |
| 10 | Casual-switch prompt (Serious only) | Removed entirely |

**Server-side changes:**

The current API (`GET /sessions/:sessionId/summary` response or settings endpoint) returns two booleans: `shouldPromptCasualSwitch` and `shouldWarnSummarySkip`. Replace these with the raw `consecutiveSummarySkips` count in the summary response. The client computes thresholds locally:

```ts
// New constants in a shared location (e.g., @eduagent/schemas or client-side constants)
export const SKIP_NUDGE_THRESHOLD = 3;    // replaces nothing (new)
export const SKIP_WARNING_THRESHOLD = 5;  // same value, now mode-agnostic
```

The client renders nudge copy based on the count. No new server endpoints needed — just expose the raw count instead of pre-computed booleans.

**Code to delete:**
- `shouldPromptCasualSwitch()` in `services/settings.ts` — no longer used
- `shouldWarnSummarySkip()` in `services/settings.ts` — replaced by client-side threshold check on raw count
- `getSkipWarningFlags()` in `services/settings.ts` — combined helper for the two above, also deleted
- `CASUAL_SWITCH_PROMPT_THRESHOLD` constant — no longer needed
- Client-side casual-switch modal/prompt (wherever it's rendered based on `shouldPromptCasualSwitch`)
- The mode gate (`mode === 'serious'`) in skip tracking — `incrementSummarySkips` and `resetSummarySkips` already work for all modes; only the warning/prompt functions checked mode

**Keep:**
- `incrementSummarySkips()` — still needed, now used for all modes
- `resetSummarySkips()` — still needed
- `getConsecutiveSummarySkips()` — still needed, now exposed in summary response
- `SKIP_WARNING_THRESHOLD` — value stays at 5 but moves to shared constants
- `mandatorySummaries` flag in `LearningModeRules` — set to `false` for both modes (effectively dead). Remove in a follow-up cleanup PR, not in this spec's implementation.

### 5. Summary Screen — Session Type Awareness

The summary screen already receives `sessionType` as a URL param. Changes:

- Use `sessionType` to select the correct sentence starters (section 1 above).
- For homework sessions, the AI recap section header changes from "What you explored" to "What you practiced".
- For freeform sessions, the header changes to "What you asked about".
- The reflection input placeholder adapts: "In my own words..." (learn), "What I found out..." (ask), "What I practiced..." (homework).

## Database Changes

### `xp_ledger` table — new column

```sql
ALTER TABLE xp_ledger
  ADD COLUMN reflection_multiplier_applied boolean NOT NULL DEFAULT false;
```

No migration risk — additive column with a default. Safe to deploy before code.

### `session_summaries` table — no changes

The existing `status` enum (`pending`, `submitted`, `accepted`, `skipped`, `auto_closed`) and `content` column are sufficient. The `content` column continues to store the reflection text for XP/skip tracking purposes. The same text is also persisted as a `topic_notes` entry (see Library Integration below).

## API Changes

### `POST /sessions/:sessionId/summary/submit`

Existing endpoint. On successful submission, two things happen server-side:

1. **XP multiplier:** When summary status transitions to `accepted`, apply the reflection multiplier to the session's `xp_ledger` entry if `reflectionMultiplierApplied` is false.
2. **Library note creation:** Call `POST /subjects/:subjectId/topics/:topicId/notes` internally with `{ content, sessionId }` to create a session-tied note in `topic_notes`. This makes the reflection visible in the Library (Book screen → "Your notes", Topic screen → notes section). If the session has no `topicId` (e.g. a freeform session that didn't produce a topic), skip note creation — the reflection is still stored in `session_summaries.content` for the student's session history.

### `POST /sessions/:sessionId/summary/skip`

Existing endpoint. No XP multiplier applied. No note created. Increment `consecutiveSummarySkips` as today.

### `GET /sessions/:sessionId/summary`

Extend response to include `baseXp` and `reflectionBonusXp` fields so the client can display the incentive banner without a separate call.

## Library Integration (contract with `2026-05-03-library-v3-redesign.md`)

The Library v3 spec redesigns the notes model to support multiple notes per topic with optional `sessionId` links. This reflection spec is the primary creator of session-tied notes.

**Ownership boundary:**
- This spec owns: the UI prompt, timing, sentence starters, XP incentive, skip nudging.
- Library v3 owns: the note creation API (`POST .../notes`), note storage schema (`topic_notes` table), and note display (Book/Topic screens).

**Contract:**
- On reflection submit, this spec calls the Library v3 note creation API with `{ content, sessionId }`.
- The server-side submit handler resolves `subjectId` and `topicId` from the `learning_sessions` row (both are columns on that table). The note API requires both in the route path (`POST /subjects/:subjectId/topics/:topicId/notes`). If either is null on the session, note creation is skipped.
- The note appears in the Library immediately — no separate "save as note" step needed.
- If the session has no resolved `topicId`, note creation is skipped (graceful degradation). The reflection still lives in `session_summaries.content` and is visible in session history.
- If note creation fails (network, server error), the reflection is still accepted for XP purposes. A background retry (Inngest) attempts note creation again. The student is never blocked or penalized by a note-save failure.

**Sequencing:** This spec ships after the Library v3 notes API exists. If for any reason this spec is implemented first, the note creation call is behind a feature check: if the `POST .../notes` endpoint doesn't exist yet, skip note creation silently (no retry, no error). The reflection still works for XP purposes without it.

**What the student experiences:** They write one reflection, earn their XP bonus, and the same text shows up as a note in their Library. One action, two rewards.

## Failure Modes

| State | Trigger | User Sees | Recovery |
|-------|---------|-----------|----------|
| XP multiplier double-applied | Race between submit + Inngest processing | N/A — `reflectionMultiplierApplied` boolean prevents this | Idempotent guard |
| Filing succeeds but summary screen fails to load | Network error after filing | Filing is persisted; student can still submit reflection later | "Your session was saved" toast + navigate home. The session summary screen is accessible from session history (Library → Book → Past conversations → tap session). If the summary status is still `pending`, the reflection input appears with the XP incentive — the student can submit retroactively. No time limit on retroactive submission. |
| Summary submit fails | Network error on submit | Error banner with retry button | Retry; draft is persisted locally via SecureStore |
| AI feedback times out | LLM latency | Summary accepted without AI feedback; feedback backfilled when available | 15s timeout → accept without feedback |
| Session has no XP entry (freeform with no topic) | Freeform session didn't produce a topic | Reflection prompt still shown (pedagogical value); XP banner hidden | No XP banner when `baseXp` is null/0 |
| Library note creation fails | Network error or API error on `POST .../notes` | Reflection still accepted for XP. Student not informed of note failure | Background Inngest retry creates the note later. If retry exhausts, note is lost but reflection remains in `session_summaries.content` |
| Session has no topicId | Freeform session with no resolved topic | No note created. Reflection stored in `session_summaries` only | N/A — graceful skip. Note appears if topic is resolved later (future: backfill job) |

## Test Plan

### Unit Tests
- [ ] `services/xp.ts`: `applyReflectionMultiplier` — base XP × 1.5, rounded, idempotent
- [ ] `services/xp.ts`: reflection multiplier not applied when `reflectionMultiplierApplied` is already true
- [ ] `services/settings.ts`: skip tracking works for all modes, not just serious
- [ ] Mode-adaptive sentence starters return correct set per session type

### Integration Tests
- [ ] Submit summary → `xp_ledger.amount` updated with multiplier, `reflectionMultiplierApplied` = true
- [ ] Skip summary → `xp_ledger.amount` unchanged, `reflectionMultiplierApplied` = false
- [ ] Submit summary with topicId → `topic_notes` entry created with matching `sessionId`
- [ ] Submit summary without topicId → no `topic_notes` entry, `session_summaries.content` still populated
- [ ] Note creation failure → XP still applied, summary status still `accepted`
- [ ] Freeform session end → filing prompt → session summary (not shelf)
- [ ] Homework session end → filing prompt → session summary (not shelf)

### Mobile Tests
- [ ] Session summary screen renders for sessionType `freeform` with correct starters
- [ ] Session summary screen renders for sessionType `homework` with correct starters
- [ ] Sentence starters render in profile's `conversationLanguage` (test with CS locale)
- [ ] XP incentive banner shows correct base and bonus amounts
- [ ] XP incentive banner hidden when session has no XP (no topic)
- [ ] Reflection input still shown when no XP (just without the banner)
- [ ] "Done" navigates to Library → filed book (2-step push, not direct) when `filedSubjectId`/`filedBookId` present
- [ ] Back button from filed book goes to Library (not dead-end)
- [ ] "Done" navigates to home when no filing params
- [ ] Skip nudge copy appears at 3 consecutive skips
- [ ] Skip warning appears at 5 consecutive skips (all modes)
- [ ] Revisiting a `pending` summary from session history shows reflection input with XP incentive (retroactive submission)

### E2E
- [ ] Learn → End → Reflect → submit → verify XP bonus in progress screen
- [ ] Ask → End → Filing → Reflect → skip → verify base XP only
- [ ] Homework → End → Filing → Reflect → submit → verify XP bonus + navigate to filed book

## Implementation Order

1. **Migration:** Add `reflection_multiplier_applied` column to `xp_ledger`.
2. **API:** `applyReflectionMultiplier()` in `services/xp.ts` — no-op when no xp_ledger row exists. Wire into summary submit endpoint.
3. **API:** Extend summary response with `baseXp`, `reflectionBonusXp`, and `consecutiveSummarySkips`.
4. **API:** Wire note creation into summary submit (behind feature check for Library v3 API availability).
5. **API cleanup:** Delete `shouldPromptCasualSwitch()`, `shouldWarnSummarySkip()`, `getSkipWarningFlags()`, `CASUAL_SWITCH_PROMPT_THRESHOLD`. Remove mode gate from skip tracking.
6. **Mobile:** Mode-adaptive sentence starters with i18n keys (EN + CS).
7. **Mobile:** XP incentive banner on session summary screen (hidden when no XP row).
8. **Mobile:** Navigation change — filing always routes to summary, pass filed IDs. "Done" uses 2-step push (Library → Book) per cross-tab rule.
9. **Mobile:** Skip-nudge thresholds — client-side check on raw count (3 = nudge, 5 = warning). Delete casual-switch modal.
10. **Mobile:** Retroactive submission — session summary screen shows reflection input when revisited with `status: 'pending'`.
11. **Tests:** Full suite per test plan above.
