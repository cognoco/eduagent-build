# Topic Screen Redesign — Status-First Orientation

**Date:** 2026-04-23
**Revised:** 2026-04-23 (v2 — post-review refinements)
**Surface:** `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
**Status:** Design v2 approved, pending implementation plan

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
2. Remove ambiguous icons; make state explicit with section headings and differentiated dot shapes.
3. Eliminate redundant "next" indicators; a single clear signal per decision.
4. Every topic in the book stays reachable from this screen — *completed* and *unstarted* topics are one tap away (via the Done section and Later's expanded-chapter subrows, including chapters that are only partially started). *Started-but-not-finished* topics appear as flat rows (Continue now / Started) and are always reachable.
5. Never lock, block, or gate topics. All sections are advisory (per `feedback_never_lock_topics.md`).
6. Surface honest state — including started-but-not-finished topics — without framing them as guilt (no "last touched N days ago" default) and without hiding progress receipts (Done + Past conversations) behind long scrolls.
7. Voice discipline: section headings are descriptive labels of the bucket; the sticky CTA carries all action language. No mixed voice across labels.

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
| 2 | Continue now | Single row: the most-recent in-progress topic; no chip (section heading labels it) | ≥1 started-but-not-finished topic exists |
| 3 | Started | Other started-but-not-finished topics; each row shows a session-count subtitle (`3 sessions`); no chip, no days-since-touched timestamp | ≥2 started-but-not-finished topics exist |
| 4 | Up next | One row: the recommended next **new** topic (see "Up next rule" below). Rendered in a taller **hero** variant when the book has zero sessions (first-visit state) | A recommendation is available |
| 5 | Done | Completed topics, flat list with chapter name as inline subtitle | ≥1 completed topic exists |
| 6 | Later | Any chapter with remaining unstarted topics (including partially-started chapters); collapsed by default, expandable per chapter. Auto-expanded by default when the book has ≤3 Later chapters *and* ≤12 total Later topics | ≥1 unstarted topic exists in any chapter |
| 7 | Past conversations | Session list as today, kept at the bottom unchanged | ≥1 session exists |

**Why Done sits above Later (position 5):** Done is the learner's progress receipt. The problem statement called out progress burial; moving Done above the browse-future section (Later) keeps the receipt in the upper half of the screen once the learner has completed anything at all. Past conversations stays at the bottom because it is session-grained, not topic-grained, and serves a different job (revisit a specific conversation, not track topic completion).

A sticky `Continue learning` CTA (see "Sticky CTA rules") floats above content.

### Per-section details

**Continue now.** Exactly 0 or 1 row. The topic is the most recent session's topic, if that topic is not yet completed. Row shows: state dot (solid blue ring `●`), title, chapter name. **No chip** — the section heading already labels the row. Tapping resumes the topic (routes to topic detail or session start as appropriate — existing behavior).

**Started.** Zero or more rows. Topics where `hasSessions && !completed && topicId !== continueNowTopicId`, sorted by last-session-timestamp descending (newest first, internally) so the freshest re-entry sits at the top. Row shows: state dot (solid slate ring `●`), title, chapter name, and a session-count subtitle (`3 sessions`). **No chip, and no "last touched N days ago" timestamp** — session count is a positive effort signal; a days-since-touched stamp frames the list as guilt. Tapping resumes that topic. If more than 4 Started topics exist, show the first 4 + a `Show N more started` link that expands inline; this keeps the screen short without hiding the backlog.

Rationale: recency drives sort order (under the hood), but the learner only sees effort (`N sessions`). They already know they haven't touched it recently — the app telling them again is accusatory. Session count reframes the bucket from "things you abandoned" to "things you've been building on."

**Up next.** Exactly 0 or 1 row. The row shows: state dot (dashed gold ring `→`), title, chapter name, no chip. Tapping starts the topic.

**Up next — first-visit hero variant.** When the book has zero sessions (`sessions.length === 0`), Up next renders in a taller hero variant: same data and same component, but with increased vertical padding and the chapter name rendered as a subtitle below the title rather than inline. The gold dashed border stays but is slightly heavier. The hero variant is controlled by a single `variant="hero" | "default"` prop on the Up next row — no new component. Once the learner has any session history the row collapses back to the default height. Edge case: if the book has a single chapter whose name equals or mirrors the book title, the hero subtitle is suppressed to avoid redundancy.

**Done.** Flat list, one row per completed topic, sorted by completion timestamp (most recent first). Row shows: state dot (solid green check `✓`), title, chapter name as inline right-aligned subtitle. **Auto-expanded when total Done count ≤ 8**; when count > 8, show the first 8 rows and a `Show all N done` expander. The threshold is higher than v1's original 5 because Done is the progress-receipt surface — a learner who completed 8 topics deserves to see all 8 without tapping.

**Later.** One row per chapter that still has at least one unstarted topic. This **includes partially-started chapters** — if chapter "Grand Overview" has 3 completed + 1 started + 1 unstarted, it still appears in Later, and when expanded it shows *only its unstarted topic* (the completed and started ones are already surfaced above in Done / Continue now / Started, so re-rendering them would double-count).

Row shows: state dot (empty circle `○` for fully-untouched chapters, half-filled `◐` for partially-started chapters), chapter name, `M / N topics not started` subtitle (e.g. `1 / 5 topics not started`), chevron `›`. Tapping expands the chapter inline, revealing each unstarted topic as a compact subrow. Tapping a subtopic routes to the topic detail page.

**Later auto-expand:** when the book has ≤3 Later chapters *and* ≤12 total Later topics across those chapters, all Later chapters render expanded by default. The two-dimensional guard (chapter count *and* topic count) prevents a 2-chapter book with 20 topics per chapter from dumping 40 rows open.

This resolves the v1 reachability gap: every unstarted topic in the book — whether in a fresh chapter or scattered around a partially-started one — is reachable in at most one tap from this screen (tap the chapter row → tap the topic subrow).

**Past conversations.** Unchanged from today. Grouped by chapter if the book has chapters, otherwise flat. Session rows link to the session summary.

### State indicators

A single visual vocabulary replaces the flame/ambiguous icons. **There are no per-row chips** — section headings carry the labeling work. Dots and backgrounds do the within-row state distinction:

| State | Dot | Background |
|---|---|---|
| Continue now | `●` solid blue ring | pale teal, mint border |
| Started | `●` solid slate ring | pale slate, slate border |
| Up next (default) | `→` dashed gold ring | pale gold, gold dashed border |
| Up next (hero, first-visit) | `→` dashed gold ring, heavier stroke | pale gold, gold dashed border, increased padding |
| Later (fully-untouched chapter) | `○` empty thin ring | muted cream |
| Later (partially-started chapter) | `◐` half-filled ring | muted cream |
| Done | `✓` filled green | white |

**Why no chips:** in v1 we previously used `Latest` / `Paused` chips on rows inside already-labeled sections. That repeated the section heading on every row and, when we considered replacing the labels with imperative text ("Keep going"), it mixed descriptive and imperative voice on the same screen. Removing chips resolves both issues at once — the section heading labels the bucket, the dot/background differentiates state visually, and all action language is concentrated in the sticky CTA.

Removed from the screen:

- **`Study next` cards** at the top — they duplicated the list and truncated titles.
- **Flame / `RetentionSignal` badges** in the topic list — retention signals will surface on a different surface (out of scope here). Passing `topicRetention` into `CollapsibleChapter` for all topics is incorrect behavior and should stop.
- **`Next` text label inside the expanded chapter** — replaced by the Up next section above.
- **`Latest` and `Paused` chips** — superseded by section headings + the no-chip rule above.
- **`last touched N days ago` timestamps in the Started section** — replaced by `N sessions` session-count subtitle (effort signal, not elapsed-time signal).

### Sticky CTA rules

The bottom CTA adapts to state, never offers more than one action at a time:

| Condition | Button text | Action |
|---|---|---|
| Continue now exists | `▶ Continue learning` | Resume the Continue now topic |
| No Continue now, Up next exists | `▶ Start: [title]` | Start the Up next topic |
| No Continue now, no Up next, Started exists | `▶ Resume: [title]` | **Resume the newest Started topic** (most recent last-session timestamp) |
| All of the above empty (book fully done, no suggestion) | Hidden | — |

**Why newest Started, not oldest:** the oldest Started topic is the one the learner has voted against with their feet for the longest. Rescuing it shoves them into exactly the thing they bounced off. The newest Started topic is freshest in memory, has the lowest re-entry friction, and has the highest completion probability. The CTA should optimize for a successful next session, not for backlog catharsis.

If the Up next or Started title is long, truncate at ~25 chars with an ellipsis; the chapter subtitle stays visible in the row above.

## Up next rule

The "Up next" topic is determined by the following precedence. **This rule is universal** — the backend's default suggestion logic and the frontend fallback both apply it identically. The backend may still override for strong pedagogical signals (retention decay, prerequisite gaps), but the *default* precedence is the same on both sides, so learners see the same suggestion whether online or offline:

1. **Momentum (follow the learner's current chapter).** Find the chapter containing the learner's most recent session (by `startedAt`). If that chapter still has at least one uncompleted topic, pick its earliest uncompleted topic by `sortOrder`. This rule captures the strongest signal of intent — where the learner has actually been working.
2. **Highest partial completion.** If no most-recent-session chapter applies (no sessions exist, or the most recent chapter is fully complete), pick the chapter with the highest completion ratio that isn't yet 100%, and return its earliest uncompleted topic.
3. **Earliest uncompleted chapter.** If every chapter is either fully done or untouched (no partial progress anywhere), pick the earliest uncompleted topic of the earliest uncompleted chapter in curriculum order.
4. **Ties broken by curriculum order.** Two chapters tied at the same rule → earlier `sortOrder` wins.

### Why momentum leads, not completion ratio

The previous revision of this spec put completion ratio first. On reflection, that's the wrong default: recency of engagement is a stronger intent signal than how far through a chapter the learner has gotten. A learner who completed 4/5 of chapter A last week and then did one session in chapter B yesterday wants to continue chapter B, not be dragged back into A to close it out. Completion ratio still matters — it's the tiebreaker for when there's no clear current chapter — but it shouldn't override momentum.

### Backend vs. frontend responsibility

- **Backend (`suggestionsQuery`)** is the authoritative source and implements the precedence above as its default. The backend may override this default when it has a stronger signal — retention decay on a completed topic, an explicit prerequisite gap, etc. When overridden, the UI just renders what the backend returns; learners see chapter context on the row so the "unexpected" choice is at least legible.
- **Frontend fallback.** If `suggestionsQuery` returns no topic suggestion (`apiSuggestions` empty and `preGenerated` empty for type `topic`), the frontend computes the Up next rule locally using the **same precedence**. Because the rule is identical, the suggestion is stable across online/offline transitions whenever the backend is using its default path. When the backend has applied a retention/prerequisite override, the frontend fallback may diverge — this is acceptable and expected, because the frontend lacks the retention data required to reproduce the override. The row's chapter subtitle keeps the choice legible in both cases.

### Examples

- `Grand Overview 3/5` + `Green Factories 0/4`; last session in Grand Overview → Up next = next topic in Grand Overview (rule 1).
- `Grand Overview 5/5` + `Green Factories 1/4`; last session in Grand Overview (now fully complete) → rule 1 finds no uncompleted topic in that chapter → rule 2 applies → Up next = next topic in Green Factories.
- `Grand Overview 0/5` + `Green Factories 0/4`; no sessions → rule 3 applies → Up next = first topic of Grand Overview (earliest chapter).
- `Grand Overview 2/5` + `Green Factories 2/4`; last session in Grand Overview → Up next = next topic of Grand Overview (rule 1 — momentum wins even though Green Factories has a higher completion ratio).
- `Grand Overview 2/5` + `Green Factories 2/4`; last session in Green Factories → Up next = next topic of Green Factories.

## Data model

No schema changes required. All state is derived from existing tables:

- `topicStudiedIds` (already computed in `bookId.tsx:318`) → Done.
- `sessions` with their `topicId` and `completedAt` / completion flag → derive Continue now + Started (`hasSessions && !completed`).
- `topics` + `sortOrder` + chapter membership → Later chapters and subrows, chapter-completion ratios, momentum-rule evaluation.
- `suggestionsQuery.data` → Up next (backend path).
- Frontend fallback: compute the same precedence rule locally from `topics` + completed set + Continue-now/Started set + most-recent session.

One new derived set required in the screen:

```ts
const inProgressTopicIds = new Set<string>(
  sessions
    .filter(s => s.topicId && !topicStudiedIds.has(s.topicId))
    .map(s => s.topicId!)
);
```

`continueNowTopicId` = the topicId of the newest session in `inProgressTopicIds` (if any).
`startedTopicIds` = `inProgressTopicIds` minus `continueNowTopicId`, sorted by most-recent-session desc (internal sort only; UI renders `N sessions` per row, not timestamps).

For the **Started** section's per-row session count, bucket `sessions` by `topicId` and take `count` for each topic in `startedTopicIds`. This is O(sessions) total, not O(sessions × topics).

For **momentum-rule** evaluation (Up next rule 1 on the frontend fallback path), the "most recent session's chapter" is derived by: take the newest session, look up its `topicId`, then the topic's `chapterId`. If the resulting chapter has any topic where `!topicStudiedIds.has(topicId)`, that chapter wins rule 1.

## Failure modes

Every rendered section must handle its dead-ends (per `UX Resilience Rules` in `~/.claude/CLAUDE.md`):

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| No topics loaded | Topics API fails | Existing error fallback (`ErrorFallback` centered) | Retry, Go back |
| Sessions fail to load | Sessions API fails | Existing inline retry card (kept as-is) | Retry inline; sections relying on session state (Continue now, Started, Past conversations) are hidden; Up next falls back to frontend rule (momentum rule 1 is skipped because no session data is trustworthy; rule 2 or 3 applies) |
| Suggestions API returns nothing | Backend silent / empty | Frontend fallback rule provides Up next deterministically using the same precedence | None needed |
| Continue now topic was skipped or deleted | Stale session references a skipped topic | Topic filtered out of Continue now calculation; section may hide; CTA falls through to Up next | None needed |
| Sticky CTA would have no target | Book done, no suggestion, no Started | CTA hidden; body shows existing "all topics complete" celebration (preserved from current `[BUG-28]` block) | Navigate via back arrow |
| Offline | No network, cached data only | Sections render from cache; mutations (none on this screen) not applicable | Standard offline banner (existing pattern) |
| Multi-device staleness | Learner completed a topic on another device while this one was offline; cache still lists it as in-progress | Continue now may point to an already-completed topic until cache revalidates | On reconnect, React Query revalidation flips the row into Done; meanwhile tapping still opens the topic (topic detail surfaces the true completion state). No user-facing bug because the fallthrough surface is correct |
| Empty Started list when >4 threshold met | N/A | Nothing — threshold only triggers rendering change | — |
| Partially-started chapter has only one unstarted topic left | Chapter shows in Later with `1 / N topics not started` subtitle | Expanding reveals the single unstarted subrow; tapping routes to topic detail | No dead end — the reachability fix resolves this by design (no more "reachable only via topic-detail chain") |

## Visual / interaction notes

- Header paddings reduced vs. today: book emoji + title stay, but the stats row is compact (one line, secondary text). No brand hero.
- The Up next row's gold dashed border is the strongest-contrast element in the top half after the Continue now row; this is intentional — if the learner has no Continue now, Up next is the primary decision. The hero variant on first-visit amplifies this (heavier border stroke, increased padding).
- `CollapsibleChapter` is retained but its role shrinks to Later only, and its expansion rules change: it now also expands for partially-started chapters (showing their unstarted subset). The Done / Started / Continue now / Up next rows are flat topic rows with inline chapter context.
- All rows are ≥44px tall to preserve touch target guidance. The Up next hero variant lands at ~72px for visual emphasis.
- Section heading typography, dot colors, and row backgrounds use semantic tokens; no hardcoded hex (per project rule — shared components stay persona-unaware).
- Voice discipline: all section labels are **descriptive** plain language for 11+ (per `feedback_no_jargon_kid_language.md`). "Up next" not "Recommended for you". "Past conversations" not "Session history". "Started" not "Paused" (neutral, not guilt-framed). All **action** language is concentrated in the sticky CTA ("Continue learning", "Start: …", "Resume: …"), which avoids mixing imperative and descriptive voice on the same screen.

## Out of scope

- Retention-based review surface. Forgotten topics (where retention decayed below threshold) need their own surface design; not in this spec. The recommender may still prefer them under rule B, but the screen will not render a separate "Review" section in v1.
- Topic-level skip UI. Skipping remains available only from the topic detail page (unchanged behavior).
- Chapter-level progress bars within Later rows. Counts (`0 / N`) are sufficient for v1.
- Filtering / search within the screen. Long-book navigation is out of scope; all topics stay reachable via chapter expansion.
- Analytics events. A later plan can add observability on which rows the learner taps most (Continue now vs. Up next vs. Paused).

## Open questions

None blocking. The following are deferred to the implementation plan:

1. Exact session-count threshold that tips the Started section from "inline show first 4" to "show N more" — 4 is the v2 default; could validate during implementation against real account data.
2. The 44px default row height, 72px hero row height, and section-heading typography need a design-token pass against the existing theme — validation during implementation, not design.
3. Whether the Later section's `◐` half-filled dot for partially-started chapters needs a distinct semantic token or can reuse the existing Started dot treatment at reduced opacity.
4. Observability: not in v1 scope, but the implementation plan should leave a hook for tracking which rows the learner taps most (Continue now vs. Up next vs. Started vs. Later expansion) so we can validate the momentum-first rule against real behavior.

## Resolved in v2 (moved from open questions)

- ~~Done collapse threshold~~ → **resolved: 8, with auto-expand when total Done ≤ 8** (receipts deserve to be visible).
- ~~Partially-started chapter reachability~~ → **resolved: Later includes partially-started chapters, expanded view shows only their unstarted subset** (Goal 4 fully satisfied).
- ~~Chip voice (imperative vs. descriptive)~~ → **resolved: no chips** (section headings carry the labeling; action language lives in the sticky CTA).
- ~~"Paused" framing~~ → **resolved: renamed to "Started", session count replaces days-since-touched timestamp**.
- ~~Sticky CTA fallback order~~ → **resolved: newest Started, not oldest**.
- ~~Up next momentum vs. completion ratio~~ → **resolved: momentum is the default rule everywhere (backend + frontend), not a fallback-only override**.
- ~~First-visit emptiness~~ → **resolved: Up next renders as a hero variant when the book has zero sessions**.
- ~~Later expansion interaction cost on small books~~ → **resolved: auto-expand when ≤3 chapters AND ≤12 total Later topics**.
