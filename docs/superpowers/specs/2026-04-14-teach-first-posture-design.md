# Teach-First Posture + Guided Curriculum Access

**Date:** 2026-04-14
**Status:** Draft
**Branch:** stabilization

---

## Problem

The LLM's default teaching posture is passive. It waits for the learner to drive the session, asking Socratic questions instead of teaching. This creates a dead-end for learners who pick a topic (e.g., "Mountains of Africa") and then get asked "What do you want to learn?" — they already told the app by picking the topic.

Root causes:
- The role identity instructs: "a mate asks the right question at the right time so the learner discovers the answer themselves"
- Session type guidance says: "Default to asking a question before explaining"
- The escalation ladder starts at Rung 1 (Socratic questions) — direct teaching only appears at Rung 5, after the learner has failed repeatedly
- Broad-path subjects (Subject → Book → Topic) skip the interview + curriculum flow entirely, giving learners no structured guidance option

## Changes

### Change 1: Teach-First Posture (System Prompt)

**Scope:** All `learning` session types, regardless of entry path. Does not affect `homework` (already has direct-explanation posture), `interleaved`, or `four_strands` (language) sessions.

**Files:** `apps/api/src/services/exchanges.ts`

#### Role Identity (line ~197-201)

Replace:

```
You are MentoMate, a personalised learning mate.
A mate does not lecture — a mate asks the right question at the right time so the learner discovers the answer themselves.
Example: instead of "The mitochondria is the powerhouse of the cell," ask "What part of the cell do you think handles energy production, and why?"
```

With:

```
You are MentoMate, a personalised learning mate.
A mate teaches clearly and checks understanding. Explain concepts using concrete examples, then ask a focused question to verify the learner understood. Draw out what the learner already knows before adding new material — but never withhold an explanation in the name of "discovery". If they get it, move to the next concept. If they don't, teach it differently — don't interrogate.
```

#### Session Type LEARNING (line ~703-710)

Replace:

```
Session type: LEARNING
Help the learner understand concepts deeply.
You may explain concepts, use examples, and teach new material — but guide first.
Default to asking a question before explaining. If the learner already has partial understanding, draw it out rather than overwriting it.
Only provide a direct explanation when the learner has clearly exhausted their own reasoning or explicitly asks "just tell me."
Balance explanation with questions to verify understanding.
```

With:

```
Session type: LEARNING
Teach the concept clearly using a concrete example, then ask one question to verify understanding.
If the learner's response shows they already know it, acknowledge and move to the next concept.
If it shows a gap, re-explain from a different angle — do not repeat the same explanation.
Never wait passively for the learner to drive — you lead the teaching, they confirm understanding.
The cycle is: explain → verify → next concept.
```

#### Escalation Ladder — Unchanged

Rungs 1-5 in `escalation.ts` stay as-is. They handle incorrect answers and scaffolding. The change is that the default entry posture is teaching, not questioning. The ladder kicks in when the learner stumbles, not as the starting point.

---

### Change 2: "Just Start Teaching" Opener

**Scope:** Learning sessions with a `topicId` or `rawInput`. Does not affect freeform sessions.

**Files:** `apps/api/src/services/exchanges.ts` (`buildSystemPrompt`)

Add a conditional section when `exchangeCount === 0` and `sessionType === 'learning'`:

**When `topicId` is present** (learner chose a specific topic from book/curriculum):

```
The learner chose this topic. Begin teaching it immediately. Do not ask what they want to learn — they already told you by choosing the topic. If prior session history exists for this topic, pick up where the previous session left off.
```

**When `topicId` is absent but `rawInput` is present** (typed intent or suggestion card):

```
The learner expressed interest in the above topic. Anchor your teaching to their stated intent and begin immediately.
```

**When neither is present** (pure freeform): No additional opener instruction. Freeform already waits for the learner's first message naturally.

**Implementation note:** `ExchangeContext` already carries `exchangeCount` (populated in `prepareExchangeContext` at `session-exchange.ts`). We pass it into `buildSystemPrompt` and gate on it.

---

### Change 3: First-Ever Session Greeting (Client-Side)

**Scope:** Client-side opening message for `sessionExperience === 0`.

**Files:** `apps/mobile/src/components/session/sessionModeConfig.ts`

#### `FIRST_SESSION.learning` (line ~62)

Replace:

```
Hey there! I'm excited to learn with you. What topic would you like to explore?
```

With:

```
Hi! I'm your learning mate. I'll teach you stuff and check if it sticks — ask me anything along the way. Ready to start?
```

#### `getOpeningMessage` — `topicName` + `sessionExperience === 0` branch (line ~123-125)

Replace:

```
Today we're exploring "{topicName}". I'll walk you through the key ideas — feel free to ask questions anytime!
```

With:

```
Today we're starting with "{topicName}". I'll explain the key ideas and check they make sense — jump in anytime if something's unclear.
```

These are client-side bubbles shown before the LLM responds. They set expectations about the teach-then-verify format.

---

### Change 4: "Prepare My Curriculum" Button on Book Detail Screen

**Scope:** Book detail screen for broad-path subjects.

**Files:** `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`

#### A) Empty State Enhancement (line ~717-737)

When `sessions.length === 0` and `topics.length > 0`, replace the current empty message with:

```
No sessions yet

Pick a topic above to dive in, or let me build
a personalised learning path for you.

[Build my learning path]   ← secondary button style (bg-surface-elevated)
```

The button navigates to:

```
/(app)/onboarding/interview?subjectId={subjectId}&bookId={bookId}&bookTitle={book.title}
```

The interview screen already accepts these params (`interview.tsx` line 20-25) and routes to curriculum review on completion.

#### B) Persistent Secondary Link in Floating Bar (line ~758-791)

Below the primary "Start learning" button, add a text link:

```
Build a learning path
```

Same navigation target. Shown only when `sessions.length < 3` — after a few sessions the learner has found their footing. Hidden in `isReadOnly` mode.

#### No New Screens

The interview screen (`onboarding/interview.tsx`) and curriculum review screen (`onboarding/curriculum-review.tsx`) already exist and handle all edge cases (missing params, expired interviews, existing curriculum).

---

### Change 5: Mid-Session Filing for Freeform Chat

**Scope:** Freeform sessions where subject classification has already run.

**Files:**
- `apps/mobile/src/app/(app)/session/index.tsx` (trigger logic + inline card)
- `apps/mobile/src/app/(app)/session/SessionFooter.tsx` or new inline component

#### Trigger Conditions (all must be true)

1. Session mode is `freeform`
2. Subject has been classified (`subjectId` is set via CFLF)
3. At least 5 user exchanges have occurred
4. Topic has NOT already been filed (no `topicId` on the session)
5. Card has not been previously dismissed in this session

#### UI

A non-blocking inline card, rendered in the chat stream (not a modal):

```
You're getting into this! Want to save this as a topic in your library?

[Save to library]   [Not now]
```

#### "Save to library" Action

Calls the existing `useFiling()` hook → `POST /filing`. This creates a `curriculumBook` + topic entry from the session's classified subject and conversation context. The session's `topicId` is updated so:
- SM-2 retention tracking activates
- The session appears in the book's session list
- Future "Continue where you left off" cards reference it

#### "Not now" Action

Dismiss the card. Do not show again for this session. The end-of-session filing prompt at "I'm Done" still works as a fallback.

#### Edge Cases

- If the learner was already auto-filed via subject classification's auto-pick path, the card never appears (topicId already set)
- If the filing API fails, show a toast error and leave the card visible for retry

---

## What We Dropped

- LLM proposing 2-3 learning paths at session start (decision fatigue — four decision points before hearing a teaching sentence)
- Pre-session bottom sheet modal (unnecessary UI layer)
- Branching logic in the system prompt based on subject structure type (`broad` vs `focused`)
- New API routes or database schema changes

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| LLM ignores teach-first instruction | Model drift / prompt too weak | LLM asks "what do you want to learn?" instead of teaching | Prompt hardening — add explicit prohibition: "do not ask what to teach, start teaching" |
| Interview route missing bookId | Param not passed | Interview opens without book context | Guard in interview.tsx already handles missing bookId gracefully (line 38-40, falls back to generic opening) |
| Curriculum already exists for book | User taps "Build learning path" twice | Existing curriculum loads on curriculum-review screen | curriculum-review.tsx already handles this — shows existing curriculum |
| First-session detection wrong | Streaks API returns stale data | Slightly warmer/cooler greeting | Low impact — cosmetic only |
| Mid-session filing fails | Network error on POST /filing | Toast: "Couldn't save — try again" | Card stays visible for retry; end-of-session filing is fallback |
| Filing card shown after kid closed subject classification banner | Race between CFLF dismiss and exchange count | Card appears without classified subject | Trigger condition checks subjectId is set — won't fire without it |

## Testing Strategy

- **Change 1-2:** Manual testing with different session entry paths (curriculum topic, book topic, freeform, rawInput). Verify LLM teaches immediately instead of asking what to learn. No unit tests for prompt text — test the behaviour in integration.
- **Change 3:** Unit test `getOpeningMessage()` with `sessionExperience=0` returns updated text.
- **Change 4:** Unit test for button visibility conditions (`sessions.length === 0`, `sessions.length < 3`). Manual test navigation to interview screen with bookId params.
- **Change 5:** Unit test filing card trigger conditions. Integration test that `POST /filing` updates session topicId. Manual test dismiss + end-of-session fallback.
