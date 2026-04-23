# Topic Screen Redesign — Status-First Orientation

**Date:** 2026-04-23
**Surface:** `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
**Status:** Design approved, pending implementation plan

## Problem

The current book/topic screen fails an 11+ learner's core question: *"Where am I? What did I already study? What am I doing now? What should I do next?"*

Concrete failures:

- **Three UI patterns compete for the same job.** `Study next` cards at the top, a subtle `Next` tint inside the topic list, and the sticky `Start learning` CTA all point to (often) the same topic. Redundant, and each says it slightly differently.
- **Chapter vs. topic hierarchy is visually flat.** A chapter row (e.g., `The Grand Overview · 2/2 · ▾`) sits at the same visual weight as an individual topic row nested inside it. Learners can't tell folders from files.
- **The flame icon is meaning-opaque.** Users read it as a water drop. It sits on the two topics with the highest intent to tap — the worst possible placement for an ambiguous glyph. Today it represents `RetentionSignal`, but it appears on topics the learner hasn't started, which is semantically wrong.
- **`Study next` cards truncate mid-word** (`The Plant's Powerhouse: Chlo…`) because two cards can't fit long titles on a 360px phone.
- **Past sessions — the most concrete "proof of progress" surface — is buried** below ~3 other content sections. Returning learners want the receipt of their last activity within one screen.
- **The sticky `Start learning` CTA is ambiguous** about which topic it launches.
- **The top region is generous** (brand header, title, meta row, `Study next` cards) before any topic is visible, pushing the topic list below the fold.

## Goals

1. Answer *"done / doing / next"* within the first half-screen on a 5.8" phone (Galaxy S10e baseline — per user-device memory).
2. Remove ambiguous icons; make state explicit with labels and differentiated dot shapes.
3. Eliminate redundant "next" indicators; a single clear signal per decision.
4. Preserve full reachability: every topic in the book stays tappable from this screen in at most one tap.
5. Never lock, block, or gate topics. All sections are advisory (per `feedback_never_lock_topics.md`).
6. Surface honest state — including started-but-not-finished topics (the "paused" bucket) — without hiding the learner's commitment backlog.

## Non-goals

- Redesigning the topic *detail* screen (`/(app)/topic/[topicId]`).
- Redesigning the session screen.
- Replacing the adaptive-teaching / recommender services — we only refine the contract they fulfil.
- Redesigning past-session rendering (kept as-is at the bottom).

## Screen structure

Sections render top-to-bottom in this order. Any section with zero items is omitted.

| Order | Section | Contents | Visible when |
|---|---|---|---|
| 1 | Header | Back arrow; book title; subject name; compact stats (`N sessions`); progress bar + `N of M topics done` | Always |
| 2 | Continue now | Single row: the most-recent in-progress topic (the "Latest") with a `Latest` chip | ≥1 started-but-not-finished topic exists |
| 3 | Paused | Other started-but-not-finished topics, newest first; each with `Paused` chip + time-since-last-touched | ≥2 started-but-not-finished topics exist (shown minus the Latest) |
| 4 | Up next | One row: the recommended next **new** topic (see "Up next rule" below) | A recommendation is available |
| 5 | Later | Chapters with no started topics; collapsed by default, expandable per chapter | ≥1 untouched chapter exists |
| 6 | Done | Completed topics, flat list with chapter name as inline subtitle | ≥1 completed topic exists |
| 7 | Past conversations | Session list as today, kept at the bottom unchanged | ≥1 session exists |

A sticky `Continue learning` CTA (see "Sticky CTA rules") floats above content.

### Per-section details

**Continue now.** Exactly 0 or 1 row. The topic is the most recent session's topic, if that topic is not yet completed. Row shows: state dot (solid blue ring `●`), title, chapter name + `N sessions today / this week`, `Latest` chip. Tapping resumes the topic (routes to topic detail or session start as appropriate — existing behavior).

**Paused.** Zero or more rows. Topics where `hasSessions && !completed && topicId !== continueNowTopicId`, sorted by last-touched timestamp, newest first. Row shows: state dot (solid slate ring `●`), title, chapter name + "last touched N days ago", `Paused` chip. Tapping resumes that topic. If more than 4 paused topics exist, show the first 4 + a `Show N more paused` link that expands inline; this keeps the screen short without hiding the backlog.

**Up next.** Exactly 0 or 1 row. The row shows: state dot (dashed gold ring `→`), title, chapter name, no chip. Tapping starts the topic.

**Later.** One row per chapter with no started topics (where `chapter.startedCount === 0`). Row shows: state dot (empty circle `○`), chapter name, `0 / N topics` subtitle, chevron `›`. Tapping expands the chapter inline, revealing each topic as a compact subrow. Tapping a subtopic routes to the topic detail page.

Chapters that are partially started — i.e., they already contain a Continue now, Paused, Up next, or Done topic — do not appear as a `Later` row at all; their remaining unstarted topics are reachable via the Paused/Done chapter-subtitle context and by tapping the chapter name in any row (future enhancement; not required for v1). For v1, a partially-started chapter's remaining unstarted topics are only directly reachable through the topic detail page once the learner has completed earlier topics in that chapter, which mirrors current behavior.

**Done.** Flat list, one row per completed topic, sorted by completion timestamp (most recent first). Row shows: state dot (solid green check `✓`), title, chapter name as inline right-aligned subtitle. If the Done count exceeds 5, show the first 5 rows and a `Show all N done` expander.

**Past conversations.** Unchanged from today. Grouped by chapter if the book has chapters, otherwise flat. Session rows link to the session summary.

### State indicators

A single visual vocabulary replaces the flame/ambiguous icons:

| State | Dot | Chip | Background |
|---|---|---|---|
| Continue now (Latest) | `●` solid blue ring | `Latest` (mint) | pale teal, mint border |
| Paused | `●` solid slate ring | `Paused` (slate) | pale slate, slate border |
| Up next | `→` dashed gold ring | — | pale gold, gold dashed border |
| Later (chapter) | `○` empty thin ring | — | muted cream |
| Done | `✓` filled green | — | white |

Removed from the screen:

- **`Study next` cards** at the top — they duplicated the list and truncated titles.
- **Flame / `RetentionSignal` badges** in the topic list — retention signals will surface on a different surface (out of scope here). Passing `topicRetention` into `CollapsibleChapter` for all topics is incorrect behavior and should stop.
- **`Next` text label inside the expanded chapter** — replaced by the Up next section above.

### Sticky CTA rules

The bottom CTA adapts to state, never offers more than one action at a time:

| Condition | Button text | Action |
|---|---|---|
| Continue now exists | `▶ Continue learning` | Resume the Continue now topic |
| No Continue now, Up next exists | `▶ Start: [title]` | Start the Up next topic |
| No Continue now, no Up next, Paused exists | `▶ Resume: [title]` | Resume the oldest Paused topic |
| All of the above empty (book fully done, no suggestion) | Hidden | — |

If the Up next title is long, truncate at ~25 chars with an ellipsis; the chapter subtitle stays visible in the Up next row above.

## Up next rule

The "Up next" topic is determined by the following precedence (rule B — default rule, backend may override for retention or pedagogy reasons):

1. **Prefer the chapter with the highest completion ratio that isn't yet 100%.** Pick its earliest uncompleted topic by `sortOrder`.
2. **If no chapter is partially complete** (every chapter is either untouched or fully done), pick the earliest uncompleted topic of the earliest uncompleted chapter in curriculum order.
3. **Ties broken by curriculum order.** Two chapters tied on completion ratio → choose the earlier chapter by `sortOrder`.

### Backend vs. frontend responsibility

- **Backend (`suggestionsQuery`)** is the authoritative source. The suggestions service should implement the precedence above as its default. The backend is free to override this default when it has a stronger signal — retention decay on a completed topic, an explicit prerequisite gap, etc. When overridden, the UI just renders what the backend returns; learners see chapter context on the row so the "unexpected" choice is at least legible.
- **Frontend fallback.** If `suggestionsQuery` returns no topic suggestion (`apiSuggestions` empty and `preGenerated` empty for type `topic`), the frontend computes the Up next rule locally using the same precedence. This keeps the "what next?" signal present even when the API is silent or fails.
- Both paths must use the same precedence rule so learners never see contradictory "next" suggestions when the API toggles from silent to available.

### Examples

- `Grand Overview 3/5` + `Green Factories 0/4` → Up next = next topic in Grand Overview.
- `Grand Overview 5/5` + `Green Factories 1/4` → Up next = next topic in Green Factories.
- `Grand Overview 0/5` + `Green Factories 0/4` → Up next = first topic of Grand Overview (earliest chapter).
- `Grand Overview 2/5` + `Green Factories 2/4` → Up next = next topic of Green Factories (50% > 40%).

## Data model

No schema changes required. All state is derived from existing tables:

- `topicStudiedIds` (already computed in `bookId.tsx:318`) → Done.
- `sessions` with their `topicId` and `completedAt` / completion flag → derive In progress + Paused (`hasSessions && !completed`).
- `topics` + `sortOrder` + chapter membership → Later, chapter-completion ratios.
- `suggestionsQuery.data` → Up next (backend path).
- Frontend fallback: compute precedence rule from `topics` + completed set + Continue-now/Paused set.

One new derived set required in the screen:

```ts
const inProgressTopicIds = new Set<string>(
  sessions
    .filter(s => s.topicId && !topicStudiedIds.has(s.topicId))
    .map(s => s.topicId!)
);
```

`continueNowTopicId` = the topicId of the newest session in `inProgressTopicIds` (if any).
`pausedTopicIds` = `inProgressTopicIds` minus `continueNowTopicId`, sorted by most-recent-session desc.

## Failure modes

Every rendered section must handle its dead-ends (per `UX Resilience Rules` in `~/.claude/CLAUDE.md`):

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| No topics loaded | Topics API fails | Existing error fallback (`ErrorFallback` centered) | Retry, Go back |
| Sessions fail to load | Sessions API fails | Existing inline retry card (kept as-is) | Retry inline; sections relying on session state (Continue now, Paused, Past conversations) are hidden; Up next falls back to frontend rule |
| Suggestions API returns nothing | Backend silent / empty | Frontend fallback rule provides Up next deterministically | None needed |
| Continue now topic was skipped or deleted | Stale session references a skipped topic | Topic filtered out of Continue now calculation; section may hide; CTA falls through to Up next | None needed |
| Sticky CTA would have no target | Book done, no suggestion, no paused | CTA hidden; body shows existing "all topics complete" celebration (preserved from current `[BUG-28]` block) | Navigate via back arrow |
| Offline | No network, cached data only | Sections render from cache; mutations (none on this screen) not applicable | Standard offline banner (existing pattern) |
| Empty Paused list when >4 threshold met | N/A | Nothing — threshold only triggers rendering change | — |

## Visual / interaction notes

- Header paddings reduced vs. today: book emoji + title stay, but the stats row is compact (one line, secondary text). No brand hero.
- The Up next row's gold dashed border is the strongest-contrast element in the top half after the Continue now row; this is intentional — if the learner has no Continue now, Up next is the primary decision.
- `CollapsibleChapter` is retained but its role shrinks to Later only. The Done/Paused/Continue now/Up next rows are flat topic rows with inline chapter context.
- All rows are ≥44px tall to preserve touch target guidance.
- Chip colors use semantic tokens; no hardcoded hex (per project rule — shared components stay persona-unaware).
- Voice: all section labels are plain language for 11+ (per `feedback_no_jargon_kid_language.md`). "Up next" not "Recommended for you". "Past conversations" not "Session history".

## Out of scope

- Retention-based review surface. Forgotten topics (where retention decayed below threshold) need their own surface design; not in this spec. The recommender may still prefer them under rule B, but the screen will not render a separate "Review" section in v1.
- Topic-level skip UI. Skipping remains available only from the topic detail page (unchanged behavior).
- Chapter-level progress bars within Later rows. Counts (`0 / N`) are sufficient for v1.
- Filtering / search within the screen. Long-book navigation is out of scope; all topics stay reachable via chapter expansion.
- Analytics events. A later plan can add observability on which rows the learner taps most (Continue now vs. Up next vs. Paused).

## Open questions

None blocking. The following are deferred to the implementation plan:

1. Exact threshold for collapsing Done beyond 5 items (5 vs. 6 vs. 8) — trivial, pick during implementation.
2. The 44px row height and chip typography need a design-token pass against the existing theme — validation during implementation, not design.
3. Whether "partially started chapter's unstarted topics" need direct reachability in v1 (currently the learner reaches them via topic completion flow). If the product team wants these reachable immediately, a `Continue chapter` expander can be added in v2.
