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

### 2. XP Reflection Multiplier

A new constant `REFLECTION_XP_MULTIPLIER = 1.5` in `services/xp.ts`.

**Server-side flow:**
- When a session closes, base XP is calculated as today (mastery × depth).
- Base XP is inserted into `xp_ledger` with status `pending` or `verified` per learning mode rules.
- When a summary is **submitted and accepted**, the XP amount is multiplied by 1.5 (rounded).
- When a summary is **skipped**, the XP amount stays at base.
- A new column `reflectionMultiplierApplied` (boolean, default false) on `xp_ledger` prevents double-application.

**Client-side display:**
- The session summary screen shows a banner above the reflection input:
  ```
  ┌─────────────────────────────────────────┐
  │  ✦  Write a reflection to earn 1.5x XP  │
  │     Base: 120 XP → With reflection: 180 XP │
  └─────────────────────────────────────────┘
  ```
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
  - If `filedSubjectId` + `filedBookId` present → navigate to `/(app)/shelf/[subjectId]/book/[bookId]`
  - Otherwise → `goBackOrReplace('/(app)/home')`
- New URL param: `sessionType` already exists (`'learning' | 'homework'`). Extend to include `'freeform'`.

### 4. Skip-Nudging (Strengthened)

Current thresholds only apply in Serious mode. Proposed changes:

| Consecutive Skips | Current Behavior | Proposed Behavior |
|-------------------|-----------------|-------------------|
| 1–2 | Nothing | Nothing |
| 3 | Nothing | Subtle copy change: "Reflecting helps you remember — give it a try?" |
| 5 | Warning (Serious only) | Warning (all modes): "Students who reflect remember 2x more" |
| 10 | Casual-switch prompt (Serious only) | Removed — we no longer prompt mode switches based on skipping |

The `mandatorySummaries` flag in `LearningModeRules` becomes irrelevant for skip tracking — all modes now track skips and nudge. The flag can be deprecated or repurposed.

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

The existing `status` enum (`pending`, `submitted`, `accepted`, `skipped`, `auto_closed`) and `content` column are sufficient.

## API Changes

### `POST /sessions/:sessionId/summary/submit`

Existing endpoint. Add server-side effect: when summary status transitions to `accepted`, apply the reflection multiplier to the session's `xp_ledger` entry if `reflectionMultiplierApplied` is false.

### `POST /sessions/:sessionId/summary/skip`

Existing endpoint. No XP multiplier applied. Increment `consecutiveSummarySkips` as today.

### `GET /sessions/:sessionId/summary`

Extend response to include `baseXp` and `reflectionBonusXp` fields so the client can display the incentive banner without a separate call.

## Failure Modes

| State | Trigger | User Sees | Recovery |
|-------|---------|-----------|----------|
| XP multiplier double-applied | Race between submit + Inngest processing | N/A — `reflectionMultiplierApplied` boolean prevents this | Idempotent guard |
| Filing succeeds but summary screen fails to load | Network error after filing | Filing is persisted; summary can be revisited from session history | "Your session was saved" toast + navigate home |
| Summary submit fails | Network error on submit | Error banner with retry button | Retry; draft is persisted locally via SecureStore |
| AI feedback times out | LLM latency | Summary accepted without AI feedback; feedback backfilled when available | 15s timeout → accept without feedback |
| Session has no XP entry (freeform with no topic) | Freeform session didn't produce a topic | Reflection prompt still shown (pedagogical value); XP banner hidden | No XP banner when `baseXp` is null/0 |

## Test Plan

### Unit Tests
- [ ] `services/xp.ts`: `applyReflectionMultiplier` — base XP × 1.5, rounded, idempotent
- [ ] `services/xp.ts`: reflection multiplier not applied when `reflectionMultiplierApplied` is already true
- [ ] `services/settings.ts`: skip tracking works for all modes, not just serious
- [ ] Mode-adaptive sentence starters return correct set per session type

### Integration Tests
- [ ] Submit summary → `xp_ledger.amount` updated with multiplier, `reflectionMultiplierApplied` = true
- [ ] Skip summary → `xp_ledger.amount` unchanged, `reflectionMultiplierApplied` = false
- [ ] Freeform session end → filing prompt → session summary (not shelf)
- [ ] Homework session end → filing prompt → session summary (not shelf)

### Mobile Tests
- [ ] Session summary screen renders for sessionType `freeform` with correct starters
- [ ] Session summary screen renders for sessionType `homework` with correct starters
- [ ] XP incentive banner shows correct base and bonus amounts
- [ ] XP incentive banner hidden when session has no XP (no topic)
- [ ] "Done" navigates to filed book when `filedSubjectId`/`filedBookId` present
- [ ] "Done" navigates to home when no filing params
- [ ] Skip nudge copy appears at 3 consecutive skips
- [ ] Skip warning appears at 5 consecutive skips (all modes)

### E2E
- [ ] Learn → End → Reflect → submit → verify XP bonus in progress screen
- [ ] Ask → End → Filing → Reflect → skip → verify base XP only
- [ ] Homework → End → Filing → Reflect → submit → verify XP bonus + navigate to filed book

## Implementation Order

1. **Migration:** Add `reflection_multiplier_applied` column to `xp_ledger`.
2. **API:** `applyReflectionMultiplier()` in `services/xp.ts` + wire into summary submit endpoint.
3. **API:** Extend summary response with `baseXp` / `reflectionBonusXp`.
4. **Mobile:** Mode-adaptive sentence starters.
5. **Mobile:** XP incentive banner on session summary screen.
6. **Mobile:** Navigation change — filing always routes to summary, pass filed IDs.
7. **Mobile:** Skip-nudge thresholds — remove mode gate, add 3-skip copy.
8. **API + Mobile:** Remove `mandatorySummaries` coupling (deprecate flag or repurpose).
9. **Tests:** Full suite per test plan above.
