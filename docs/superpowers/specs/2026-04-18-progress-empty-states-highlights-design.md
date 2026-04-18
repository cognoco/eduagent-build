# Progress Empty States & Session Highlights

**Status:** Design spec — pending review
**Author:** Product + Claude brainstorm, 2026-04-18
**Depends on:** Nothing — independent of parent visibility spec and RLS work
**Companion spec:** `2026-04-18-parent-visibility-privacy-design.md` (independent, parallel track)

## Problem

Progress screens look barren for new users — both child-facing and parent-facing. A child who has completed 3 sessions sees "Your journey is just beginning" on most progress surfaces. A parent checking on their child after the first week sees a dashboard of nothing.

The data is being written — retention cards, XP, streaks, snapshots all populate from session 1. But display thresholds are set too high, and there's no per-session narrative for the parent to read.

Root causes:
1. **Milestone thresholds start at 10** — `SESSION_THRESHOLDS = [10, 25, 50, 100, 250]`. A child completes 9 sessions and has zero milestones to celebrate.
2. **"Verified" requires delayed recall** — `topicsVerified` only increments after a second visit to the same topic. Most early users explore, they don't review. So `topicsVerified = 0` for weeks.
3. **History chart needs 2+ days** — a single snapshot point renders as nothing on a chart.
4. **No per-session narrative** — the parent session feed shows topic name + duration but not *what happened*. "Photosynthesis — 8 min" tells the parent nothing about whether the child learned.
5. **Vocabulary always empty for non-language subjects** — the vocabulary section shows "Your vocabulary will grow here" for math, science, history subjects. It will never grow there.

## Design Principles

### Honest over inflated

Empty states describe capability, not failure. "No reviews due yet" not "You haven't earned any reviews." Session highlights describe what happened, not what the system wishes had happened. If a 2-minute browse produced no learning, say so honestly: "Emma browsed Photosynthesis — 2 min."

### Progressive disclosure of progress

Show what exists from session 1. Don't gate feedback behind thresholds designed for power users. A single data point on a chart is better than an empty chart with a motivational message.

---

## Section 1: Lower Milestone Thresholds

### Current thresholds

```typescript
const SESSION_THRESHOLDS       = [10, 25, 50, 100, 250];
const TOPIC_THRESHOLDS         = [5, 10, 25, 50];
const TOPICS_EXPLORED_THRESHOLDS = [1, 3, 5, 10, 25];
const STREAK_THRESHOLDS        = [7, 14, 30, 60, 100];
const LEARNING_TIME_THRESHOLDS = [1, 5, 10, 25, 50, 100]; // hours
const VOCABULARY_THRESHOLDS    = [10, 25, 50, 100, 250, 500, 1000];
```

### New thresholds

```typescript
const SESSION_THRESHOLDS       = [1, 3, 5, 10, 25, 50, 100, 250];
const TOPIC_THRESHOLDS         = [1, 3, 5, 10, 25, 50];
const TOPICS_EXPLORED_THRESHOLDS = [1, 3, 5, 10, 25];  // unchanged — already starts at 1
const STREAK_THRESHOLDS        = [3, 7, 14, 30, 60, 100];
const LEARNING_TIME_THRESHOLDS = [1, 5, 10, 25, 50, 100]; // unchanged — 1 hour is already early
const VOCABULARY_THRESHOLDS    = [5, 10, 25, 50, 100, 250, 500, 1000];
```

**Changes:**
- `SESSION_THRESHOLDS`: add `1, 3, 5` — first session is a milestone
- `TOPIC_THRESHOLDS`: add `1, 3` — first topic mastered is a milestone
- `STREAK_THRESHOLDS`: add `3` — three days in a row is worth celebrating for a child
- `VOCABULARY_THRESHOLDS`: add `5` — first handful of words learned

### Celebration copy for new milestones

| Milestone | Threshold | Copy |
|---|---|---|
| `session_count` | 1 | "First session complete!" |
| `session_count` | 3 | "3 sessions down!" |
| `session_count` | 5 | "5 sessions and counting!" |
| `topic_mastered_count` | 1 | "First topic mastered!" |
| `topic_mastered_count` | 3 | "3 topics mastered!" |
| `streak_length` | 3 | "3-day streak!" |
| `vocabulary_count` | 5 | "5 new words learned!" |

These feed into the existing `celebrations` table and render via the existing celebration UI. No new celebration mechanism needed.

### File changes

**File:** `apps/api/src/services/milestone-detection.ts`

Change the threshold constant arrays. The `detectMilestones` function and `crossed()` helper need no changes — they already work with any threshold values.

---

## Section 2: Session Highlights

### Concept

Every completed session gets a one-line highlight visible to parents in the session feed. Two tiers:

| Condition | Highlight type | Example | LLM call? |
|---|---|---|---|
| 3+ exchanges | **LLM-generated** | "Practiced light reactions in photosynthesis — got it right on second try" | Yes |
| < 3 exchanges | **Template-based** | "Emma browsed Photosynthesis and Cell Division — 2 min" | No |

### LLM-generated highlights

**New Inngest step** in `session-completed.ts`: `generate-session-highlight`

Runs after the existing `write-coaching-card` step (which already has the session summary). Gate: `exchangeCount >= 3`.

**Model:** Route through `services/llm/router.ts`. Use the cheapest/fastest model available (Haiku-class). This is a single-sentence generation, not reasoning.

**Prompt guardrails:**

```
You are summarizing a learning session for a parent.

Rules:
- One sentence, max 120 characters
- Past tense ("Practiced...", "Learned about...", "Worked through...")
- Focus on what the child learned or practiced, not what the AI did
- Never fabricate — only describe what actually happened in the transcript
- Never mention classmate names, personal details, or off-topic conversations
- If the session was mostly off-topic or unclear, say "Explored [topic]"
- No emojis, no exclamation marks, no superlatives
```

**Input:** Session transcript (the `session_events` content — same data the coaching card and homework summary steps already read). The LLM reads the transcript to generate the highlight but the highlight itself is what the parent sees, not the transcript.

**Output:** A single string stored in `session_summaries.highlight` (new nullable column) or a new `session_highlights` table. Prefer adding a column to `session_summaries` — simpler, same lifecycle.

**Schema change:**

```sql
ALTER TABLE session_summaries ADD COLUMN highlight text;
```

**Cost estimate:** At ~200 input tokens (transcript excerpt) + ~30 output tokens per call, using Haiku-class pricing (~$0.25/M input, $1.25/M output):
- Per highlight: ~$0.000088
- 100 sessions/day: ~$0.009/day = ~$0.27/month
- 1000 sessions/day: ~$0.088/day = ~$2.64/month

Negligible. No budget cap needed.

### Template-based highlights (< 3 exchanges)

No LLM call. Constructed from session metadata:

```typescript
function buildBrowseHighlight(
  childDisplayName: string,
  topics: string[],          // from session + interleaved topics
  durationSeconds: number
): string {
  const topicList = topics.slice(0, 3).join(', ');
  const suffix = topics.length > 3 ? ` and ${topics.length - 3} more` : '';
  const mins = Math.max(1, Math.round(durationSeconds / 60));
  return `${childDisplayName} browsed ${topicList}${suffix} — ${mins} min`;
}
```

Stored in the same `highlight` column. The template runs synchronously in the `generate-session-highlight` step — no LLM call, just string formatting.

### Surfacing highlights

**API:** Add `highlight` to the `ChildSession` interface returned by `getChildSessions`. Already joins `session_summaries` — just add the column to the select.

**Mobile (parent):** Show the highlight as a subtitle under each session in the session feed on `/(app)/child/[profileId]/index.tsx` and the sessions list.

**Mobile (child):** Highlights are parent-facing. No change to child-facing screens.

### Privacy boundary

The LLM reads the session transcript to generate the highlight — same pipeline as the existing coaching card and homework summary steps. This is within the existing DPA scope (the LLM already processes child transcripts for coaching, summarization, and profile inference). The highlight is a derivative summary, not a new data category.

---

## Section 3: Empty-State Copy Improvements

### Progress overview (child-facing)

| Current | New | Condition |
|---|---|---|
| "Your journey is just beginning" | "You've completed {N} session{s}. Keep going!" | `totalSessions >= 1` |
| "Your journey is just beginning" | "Start your first session to see your progress here" | `totalSessions === 0` |
| "No milestones yet" | "Complete your first session to earn your first milestone" | `milestones.length === 0` |
| "Your vocabulary will grow here" | *(hide section entirely)* | Non-language subject — vocabulary section is structurally empty |

### Progress history chart (child + parent)

| Current | New | Condition |
|---|---|---|
| Empty chart | Single-point chart with "Day 1" label | Exactly 1 snapshot exists |
| Empty chart | "Start a session to see your progress over time" | Zero snapshots |

### Parent dashboard — child detail

| Current | New | Condition |
|---|---|---|
| No streak/XP shown | "3-day streak | 45 XP" stat row | Data exists (covered in companion privacy spec) |
| Generic empty session list | "No sessions yet. When [Name] starts learning, you'll see what they work on here." | Zero sessions |

### Vocabulary section visibility

Hide the vocabulary section entirely for non-language subjects (`pedagogyMode !== 'four_strands'`). It will never populate, so showing an empty state is misleading.

**API change:** Add `pedagogyMode` to the subject data returned in progress/inventory endpoints (if not already present) so the mobile app can make the visibility decision.

**Mobile change:** Conditionally render the vocabulary section based on `pedagogyMode === 'four_strands'`.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| LLM highlight generation fails | Model timeout, API error, rate limit | Template fallback: "[Name] practiced [topic] — [duration]" | Automatic — the `generate-session-highlight` step catches errors and falls back to template. Logs a warning for monitoring. |
| LLM returns empty or nonsensical highlight | Garbled transcript, edge-case prompt failure | Template fallback (same as above) | Step validates output: must be 1-120 chars, must not be empty. If validation fails, fall back to template. |
| Transcript is empty (zero events) | Session created but no exchanges recorded | No highlight generated | `exchangeCount === 0` sessions are already filtered from the parent session feed (`exchangeCount >= 1` filter in `getChildSessions`) |
| Highlight column migration not applied | Deploy code before migration | `highlight` is `undefined` in response | Column is nullable. Code handles `null` gracefully — shows session without subtitle. |
| Cost spike from unexpectedly high session volume | Viral growth or bot traffic | N/A (backend concern) | Monitor Inngest step execution count. At 10,000 sessions/day (~$0.88/day), still negligible. Alert threshold at 50,000/day. |
| Lower milestones cause celebration fatigue | Child gets 4 milestones in first session | Multiple celebration toasts stack | Existing celebration UI already queues — shows one at a time. Consider: max 2 celebrations per session (defer others to next session). |
| `pedagogyMode` not available in progress response | Missing from API response | Vocabulary section shown for all subjects (current behavior) | Graceful degradation — the worst case is the current behavior. Fix by adding the field. |
| Parent sees "browsed" highlight for a substantive session | Session had exactly 2 exchanges but was meaningful | Parent reads a dismissive-sounding summary | Acceptable trade-off. 2-exchange sessions are genuinely brief. The threshold of 3 is conservative enough. |

---

## Out of Scope

- **Parent visibility / privacy policy** — see companion spec `2026-04-18-parent-visibility-privacy-design.md`
- **Transcript access changes** — see companion spec
- **RLS policies** — see companion spec + existing Phase 2-4 plan
- **Push notification expansion** — weekly + monthly is sufficient
- **XP system redesign** — current XP ledger is adequate for display purposes
- **Streak gamification** — no loss-aversion mechanics per design principles

---

## Test Plan

### Milestone thresholds

1. New profile completes 1 session → `session_count` milestone at threshold 1 fires
2. New profile masters 1 topic → `topic_mastered_count` milestone at threshold 1 fires
3. Existing profile with 8 sessions completes session 9 → no duplicate milestone for threshold 1 (idempotent insert)
4. Celebration queue does not exceed 2 per session

### Session highlights

1. Session with 5 exchanges → LLM highlight generated, stored in `session_summaries.highlight`
2. Session with 1 exchange → template highlight generated ("browsed...")
3. Session with 0 exchanges → no highlight (session filtered from feed)
4. LLM failure → template fallback used, warning logged
5. Highlight > 120 chars → truncated or template fallback
6. Highlight returned in `ChildSession` response for parent dashboard
7. Highlight not surfaced on child-facing progress screens

### Empty states

1. Zero-session profile → "Start your first session..." copy shown
2. Single-snapshot profile → chart renders one data point
3. Non-language subject → vocabulary section hidden
4. `pedagogyMode` field present in progress/inventory API response
