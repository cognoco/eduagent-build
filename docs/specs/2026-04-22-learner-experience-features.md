# Learner Experience Features — Session Recap, Bookmarks, Encouragement

**Date:** 2026-04-22
**Status:** Draft — awaiting review
**Scope:** Three features addressing learner engagement gaps

## Problem Statement

After using the app as a learner, three experience gaps are clear:

1. **No learning visibility.** The session summary shows mechanical stats (time, exchanges, escalation rung) but never says *what you learned* or *what's next*. The session just ends.
2. **No way to save moments.** When the AI explains something beautifully, the learner can't bookmark or save it. Messages scroll by and are only retrievable by navigating library → book → past session.
3. **No encouragement.** The prompt actively bans praise phrases and instructs the LLM to "say nothing about correctness and just continue teaching." For 11–17 year olds, getting silence after a correct answer is deflating.

---

## Feature 3: Encouragement — Specific, Earned Recognition

**Type:** Prompt-only change (no DB, no API, no UI changes)

### Root Cause

The Prohibitions block in `exchange-prompts.ts:584–594` correctly bans performative phrases ("Great job!", "Amazing!") but overcorrects by leaving no middle ground between "That's correct" and silence. The current instruction is:

> "Acknowledge progress factually and vary it: 'That's correct', 'Yes', 'You've got it', or just move on. Sometimes say nothing about correctness and just continue teaching."

This produces a tutor that *never* tells you what you did well. The fix is specific, earned recognition — not generic praise.

### Design

Replace the blanket "factual acknowledgment only" instruction with a two-tier encouragement framework matching the product's 11+ user base.

**Tier 1 — Ages 11–14 (early teens):**

```
When the learner makes a correct connection or shows understanding, name what
they got right: "You just linked respiration back to the energy cycle — that's
the key insight." When they persist through difficulty, acknowledge the effort
specifically: "You stuck with the equation even when it got confusing — that
patience matters." Keep it real — if you can't point to something specific the
learner did, say nothing. Never generic.
```

**Tier 2 — Ages 15–17 (teens):**

```
Acknowledge strong reasoning or unexpected connections briefly: "Good catch",
"That's a sharp connection", "Exactly right, and here's why that matters..."
Deliver it and move forward — don't linger on praise. Never patronize.
```

**Still banned (all ages):** "Great job!", "Amazing!", "I'm so proud of you!", "Fantastic!", "Awesome!", "Nice work!", "Excellent!", "Let's dive in!" — these remain banned because they're non-specific and performative.

**Still kept (all ages):** "Not yet" framing for incorrect answers. No "wrong"/"incorrect"/"mistake". Acknowledge partial correctness before guiding further.

### Changes

| File | Change |
|------|--------|
| `apps/api/src/services/exchange-prompts.ts` | Replace lines 584–594 (Prohibitions + factual-only block) with the tiered encouragement instructions. Keep the BANNED phrases list but add the specific-praise guidance above it, gated on `ageVoiceTier`. |

### Verification

| Check | Method |
|-------|--------|
| Prompt snapshot unchanged for non-encouragement sections | `pnpm eval:llm` (Tier 1) — compare before/after |
| LLM actually produces specific praise for correct answers | `pnpm eval:llm --live` (Tier 2) — run against all 5 fixture profiles (ages 11–17), inspect `reply` text for named-connection encouragement |
| Banned phrases never appear | Tier 2 eval — grep output for banned phrases; zero matches required |
| No regression in other prompt sections | Tier 1 snapshot diff — only Prohibitions section should change |

### Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| LLM ignores encouragement instruction | Model compliance varies | Factual-only responses (status quo) | Strengthen instruction wording; no user-facing impact |
| LLM over-praises despite instructions | Edge case in model behavior | Too-frequent encouragement | Tighten instruction: "no more than once per 3 exchanges" |
| Encouragement in voice mode exceeds 50-word limit | Voice mode brevity constraint conflict | Long spoken responses | Voice mode instruction already overrides — "under 50 words" takes precedence |

---

## Feature 2: Bookmarks — Save This Moment

**Type:** New DB table + API routes + mobile UI

### Design

Lightweight toggle on individual AI messages. No highlighting within messages, no tags, no categories, no sharing. Bookmark/unbookmark a whole AI response.

#### Database

New table `bookmarks`:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (UUIDv7) | PK |
| `profileId` | uuid | FK → profiles, indexed |
| `sessionId` | uuid | FK → learning_sessions |
| `eventId` | uuid | FK → session_events (the AI response event) |
| `subjectId` | uuid | FK → subjects (denormalized for query efficiency) |
| `topicId` | uuid (nullable) | FK → curriculum_topics (nullable for freeform sessions) |
| `createdAt` | timestamp | Default now() |

**Unique constraint:** `(profileId, eventId)` — can't bookmark the same message twice.

**Pattern note:** The existing feedback system records `user_feedback` events in `session_events` (via `handleMessageFeedback` in `use-session-actions.ts:501`). Bookmarks use a separate table because they outlive session context — a learner revisits bookmarks across sessions and subjects, which requires its own query path with efficient joins. Session events are session-scoped and don't support cross-session listing efficiently.

#### API Routes

New route group in `apps/api/src/routes/bookmarks.ts`:

| Method | Path | Body/Query | Response |
|--------|------|------------|----------|
| POST | `/bookmarks` | `{ eventId }` | `{ bookmark }` (201) |
| DELETE | `/bookmarks/:id` | — | 204 |
| GET | `/bookmarks` | `?cursor=&limit=20&subjectId=` | `{ bookmarks[], nextCursor }` |

- POST resolves `sessionId`, `subjectId`, `topicId` from the `session_events` row server-side (learner only sends `eventId`)
- GET returns bookmarks joined with `session_events.content` for display, ordered by `createdAt DESC`
- All endpoints scoped by `profileId` from auth context
- Pagination via cursor (UUIDv7 is naturally time-ordered)

#### Schemas Package

New `bookmarkSchema` in `packages/schemas/src/bookmarks.ts`:

```typescript
export const bookmarkSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  subjectName: z.string(), // joined
  topicTitle: z.string().nullable(), // joined
  content: z.string(), // the AI message text from session_events
  createdAt: z.string().datetime(),
});

export const createBookmarkSchema = z.object({
  eventId: z.string().uuid(),
});
```

#### Mobile UI

**Bookmark button placement:**

The existing `SessionMessageActions` renders feedback pills (Helpful / Not helpful / Incorrect) in a `flex-row flex-wrap gap-2` layout. On a 5.8" Galaxy S10e, adding a 4th text pill is crowded.

**Solution:** Render the bookmark as an **icon-only button** (Ionicons `bookmark-outline` / `bookmark`) positioned to the **right of the feedback row**, visually separated. This avoids crowding the text pills while keeping the bookmark discoverable. The icon toggles between outline (unsaved) and filled (saved) states.

```
[Helpful] [Not helpful] [That's incorrect]    [🔖]
```

- Haptic feedback on toggle (`Haptics.impactAsync(ImpactFeedbackStyle.Light)`)
- Optimistic UI: toggle immediately, revert on API failure + show toast "Couldn't save bookmark. Check your connection."
- Track bookmark state per-message in a local `Record<string, string | null>` (eventId → bookmarkId or null)
- On session load, fetch bookmarks for the current session to pre-populate filled states

**Saved screen:** New route `/(app)/progress/saved.tsx`

- Natural sibling to milestones (`/(app)/progress/milestones.tsx`) and vocabulary (`/(app)/progress/vocabulary.tsx`)
- Entry point: new row in the progress index screen, between milestones and "Keep learning"
- FlatList with cursor pagination
- Each row: AI message content (3-line truncation), subject name, topic title, relative date
- Tap → expand to show full exchange (user question + AI response)
- Swipe-to-delete with confirmation

**Empty state:** "Nothing saved yet. Tap the bookmark icon on any response during a session to save it here."

#### Offline Behavior

| Scenario | Behavior |
|----------|----------|
| Bookmark tap while offline | Optimistic toggle to filled state; mutation queued; on reconnect retry |
| Retry fails after reconnect | Revert to outline state + toast "Couldn't save bookmark" |
| Delete tap while offline | Optimistic remove from list; mutation queued; on reconnect retry |
| Loading saved screen offline | Show cached data from React Query; stale indicator |

### Changes

| File | Change |
|------|--------|
| `packages/database/src/schema/bookmarks.ts` | New file — `bookmarks` table definition |
| `packages/database/src/schema/index.ts` | Export new table |
| `packages/schemas/src/bookmarks.ts` | New file — bookmark schemas |
| `packages/schemas/src/index.ts` | Export new schemas |
| `apps/api/src/routes/bookmarks.ts` | New file — 3 endpoints |
| `apps/api/src/routes/index.ts` | Register bookmark routes |
| `apps/mobile/src/hooks/use-bookmarks.ts` | New file — `useCreateBookmark`, `useDeleteBookmark`, `useBookmarks`, `useSessionBookmarks` |
| `apps/mobile/src/components/session/SessionMessageActions.tsx` | Add bookmark icon button |
| `apps/mobile/src/app/(app)/progress/saved.tsx` | New file — Saved screen |
| `apps/mobile/src/app/(app)/progress/index.tsx` | Add "Saved" row linking to saved screen |
| Migration SQL | New `bookmarks` table |

### Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Bookmark fails (network) | API unreachable | Toast "Couldn't save bookmark" + icon reverts | Retry on next tap |
| Session deleted with bookmarks | Session cleanup/TTL | Bookmarks for deleted sessions show "[Session no longer available]" | Swipe to remove stale bookmark |
| Duplicate bookmark race | Double-tap before response | Unique constraint rejects second; first succeeds | No user-facing issue (optimistic UI already shows filled) |
| eventId not found | Invalid/orphaned event reference | 404 from API | Toast "This message is no longer available" |

---

## Feature 1: Session Recap — What You Covered & What's Next

**Type:** Inngest pipeline extension + new DB columns + mobile UI

### Design

Add a **learner-facing recap** to the `session.completed` Inngest pipeline. The parent-facing pipeline already generates `highlight`, `narrative`, `conversationPrompt`, and `engagementSignal` — we add a parallel learner-facing step.

#### What the Learner Sees

Two new cards on the session summary screen (`/session-summary/[sessionId].tsx`):

**1. "What you explored" card** (between "What happened" and milestones):
- 2–4 bullet points extracted from the transcript: concepts covered, questions answered, connections made
- Written in second person, age-appropriate voice
- Example: "You figured out how the Calvin cycle uses CO₂ to build glucose"
- NOT a transcript summary — these are *learning takeaways*

**2. "Up next" card** (below milestones, above "Your Words"):
- Only shown for curriculum-attached sessions (has a `topicId`)
- Shows the next unstarted topic in the same book: title + one-sentence connection to what was just covered
- "Continue learning" CTA → navigates to start a session on that topic
- **Not shown for freeform sessions** — freeform sessions have no curriculum position, and a shaky LLM-generated suggestion would feel dishonest

#### Minimum Threshold

Both cards require `exchangeCount >= 3`. A 1–2 exchange session doesn't have enough material for meaningful takeaways. Below the threshold, neither card appears — the summary screen shows the existing "What happened" stats card only (status quo).

#### Database

New columns on `session_summaries` (following the existing pattern of plain text columns):

| Column | Type | Notes |
|--------|------|-------|
| `learnerRecap` | text (nullable) | Markdown bullet list: `- You explored...\n- You connected...` |
| `nextTopicId` | uuid (nullable) | FK → curriculum_topics |
| `nextTopicReason` | text (nullable) | One sentence: "This builds on the photosynthesis process you just studied" |

**Why text, not jsonb:** Every existing insight column on `session_summaries` is plain text (`highlight`, `narrative`, `conversationPrompt`, `engagementSignal`). Introducing jsonb would break the established pattern. The mobile client parses `learnerRecap` by splitting on `\n- ` — simple and consistent.

#### Inngest Pipeline

New step in `session-completed.ts`, added after the existing `generateSessionInsights` step:

```
Step: "generate-learner-recap"
Guard: exchangeCount >= 3 (topicId may be null for freeform — recap still generated, but nextTopic fields stay null)
Input: session transcript (already loaded by prior step)
LLM call: Haiku-tier, fast (<3s)
Output: { learnerRecap: string, nextTopicId: string | null, nextTopicReason: string | null }
```

**Recap generation prompt** (Haiku-tier):

```
You are reviewing a tutoring session transcript. Extract 2–4 learning takeaways.

Rules:
- Write in second person ("You explored...", "You connected...", "You figured out...")
- Each takeaway must name a specific concept or skill, not generic ("learned stuff")
- Format as a markdown bullet list (- prefix)
- Adapt language complexity to the learner's age: [ageVoiceTier]
- Max 200 characters per bullet
- No praise, no filler — just what was covered
```

**Next topic resolution** (no LLM — pure DB query):

```sql
SELECT ct.id, ct.title
FROM curriculum_topics ct
WHERE ct.book_id = :currentBookId
  AND ct.sort_order > :currentSortOrder
  AND ct.skipped = false
  AND ct.id NOT IN (SELECT topic_id FROM retention_cards WHERE profile_id = :profileId)
ORDER BY ct.sort_order ASC
LIMIT 1
```

If no next topic in the current book → check next book in subject. If curriculum complete → `nextTopicId` stays null (card not shown).

**Next topic reason** generation (Haiku-tier, appended to recap call):

```
Also suggest why the next topic "[nextTopicTitle]" connects to what was just covered.
One sentence, max 120 characters. Example: "This builds on the energy cycle you just explored."
```

#### Mobile UI — Real-Time Loading Pattern

**Challenge:** The session summary screen navigates via `router.replace` with data passed as URL params. The `useSessionSummary` hook exists but is used for re-entry to past sessions. For the initial post-session flow, the Inngest job hasn't completed yet.

**Solution:** Poll with `refetchInterval` until the recap fields are populated:

```typescript
const summary = useSessionSummary(sessionId, {
  // Poll every 2s until learnerRecap arrives (Inngest job takes 3-8s)
  refetchInterval: (data) =>
    !isAlreadyPersisted && !data?.learnerRecap ? 2000 : false,
});
```

- On first render: "What you explored" and "Up next" cards show shimmer skeletons
- When `summary.data?.learnerRecap` becomes non-null: replace skeletons with content
- After 15 seconds with no data: stop polling, hide the skeleton cards (graceful degradation — the learner still sees the existing summary content)
- For re-entry to past sessions: data loads immediately from the persisted row (no polling needed)

#### Changes

| File | Change |
|------|--------|
| `packages/database/src/schema/sessions.ts` | Add `learnerRecap`, `nextTopicId`, `nextTopicReason` columns to `sessionSummaries` |
| `packages/schemas/src/sessions.ts` | Extend `sessionSummarySchema` with new fields |
| `apps/api/src/inngest/functions/session-completed.ts` | Add `generate-learner-recap` step |
| `apps/api/src/services/session-recap.ts` | New file — recap generation + next-topic resolution logic |
| `apps/api/src/routes/sessions.ts` | Extend `GET /sessions/:id/summary` to return new fields |
| `apps/mobile/src/app/session-summary/[sessionId].tsx` | Add "What you explored" and "Up next" cards with polling/shimmer |
| `apps/mobile/src/hooks/use-sessions.ts` | Add `refetchInterval` support to `useSessionSummary` |
| Migration SQL | Add 3 columns to `session_summaries` |

### Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Inngest job fails | LLM error, DB error | Skeleton cards disappear after 15s timeout | Existing summary content still shows (graceful degradation) |
| LLM returns <2 bullets | Sparse transcript | Fewer bullets displayed (1 is OK) | No recovery needed — partial data is better than none |
| LLM returns irrelevant bullets | Hallucination | Inaccurate takeaways | Content is non-authoritative; learner can ignore. No structured action depends on it. |
| Next topic doesn't exist | Curriculum complete | "Up next" card not shown | "Keep learning" CTA on progress screen handles this |
| Polling timeout (15s) | Inngest queue delay | Cards never appear for this session | Data persists — visible on re-entry to the session later |
| Session has < 3 exchanges | Short/abandoned session | Neither card shown | Status quo — existing summary stats are sufficient |
| Freeform session (no topicId) | User started freeform chat | "Up next" card not shown; recap still shown if exchanges >= 3 | By design — freeform has no curriculum position |

---

## Implementation Order

1. **Feature 3 (Encouragement)** — smallest scope, prompt-only, no migrations. Deliver first for immediate impact.
2. **Feature 2 (Bookmarks)** — clean CRUD, independent of other features. Can be built in parallel with Feature 1.
3. **Feature 1 (Session Recap)** — largest scope, depends on Inngest pipeline understanding. Deliver last.

---

## Out of Scope

- Bookmark sharing or export
- Bookmark tags/categories/folders
- Highlighting within messages (sub-message selection)
- Session recap for interleaved sessions (these span multiple topics — recap design is different)
- "Up next" for freeform sessions
- Notification when recap is ready (polling is sufficient)
- Adult (18+) encouragement tier (no adult users in product)
