---
title: S2 — Subject Hub (Shelf + Progress + Per-Subject Surfaces Merge) — Implementation Plan
date: 2026-06-10
profile: ui
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

<!-- Synced to spec amendment 2026-06-10 (§16 voice, §3.1 cold-start tripwire → evidence gate, §2.1 chips-fill law) and amended 2026-06-13 for self-directed browse + concrete progress numbers + topic description + chapter progress. -->

# S2 — Subject Hub — Implementation Plan

**Goal:** Build the self-directed structure browse path for V2: a real **Subjects tab** that answers "show me everything" without reopening the old Library tab, plus ONE per-subject hub screen that merges today's `shelf/[subjectId]` + `progress/[subjectId]` + the scattered per-subject surfaces into a single max-depth-2 surface — a **Next-up block on top** (same continuation source as the `/now` card), compact quantified progress ("4 mastered, +2 this week", "3 reviews due"), **collapsible chapter sections on the hub itself** (not separate screens) with per-topic mastery state and a per-chapter "N / N mastered" header count, a **topic-detail sheet** slid up over the hub with the topic description under the title, and **subject-scoped notes** (one store, two origins — my-notes vs saved-from-mentor — authorship always visible, two views). The tab and hub mount in the V2 three-tab shell behind `MODE_NAV_V2_ENABLED` **and** are linkable from today's nav so they ship value even if nothing else does.

**Approach:** The hub is a NEW screen file (`subject-hub/[subjectId]/index.tsx`) composed of reusable section components, driven entirely by **data it is handed** (no client-side ownership/persona checks) so S4 can re-mount the same `<SubjectHub>` component server-masked to structural columns for supporter person-scopes. It reads today's `subject → books/chapters → topics + retention/mastery` model FIRST: book/topic data via the existing `useBookWithTopics` / `useBooks`, mastery state via the existing `useRetentionTopics` (`masteredAt` / three-state derivation already proven in `book/[bookId].tsx`), Next-up via the existing `useLearningResumeTarget` (the SAME continuation source the `/now` `unfinished_session` / `needs_deepening` cards rank from — referenced, not re-ranked). Notes get one additive `origin` discriminator on the schema contract so "my notes vs saved-from-mentor" renders from one list with two filtered views. Concept-grain capture (`concept-capture-layer`) is identity-baseline-gated and is a later non-blocking enhancement — the hub works against the current topic-grain mastery model first. Every failure mode routes through the shared `ErrorFallback`; every string goes through `t()` + `en.json` in this plan; cross-stack deep-pushes use the route catalog's full ancestor chain.

## Scope

In scope (create / change):
- `apps/mobile/src/app/(app)/subjects.tsx` (CHANGE — S1 stub becomes the V2 Subjects browse tab / "show me everything" escape hatch)
- `apps/mobile/src/components/subjects/SubjectsBrowse.tsx` (NEW — top-level subject/book/progress list with browse-first structure)
- `apps/mobile/src/hooks/use-subjects-index.ts` (NEW — composes existing subject/book/progress reads for the Subjects tab; no new endpoint)
- `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx` (NEW — the hub page; default export, Expo Router page)
- `apps/mobile/src/app/(app)/subject-hub/[subjectId]/_layout.tsx` (NEW — nested stack; `unstable_settings = { initialRouteName: 'index' }`)
- `apps/mobile/src/components/subject-hub/SubjectHub.tsx` (NEW — the persona-unaware, data-driven hub component S4 reuses masked)
- `apps/mobile/src/components/subject-hub/SubjectHubNextUp.tsx` (NEW — Next-up block)
- `apps/mobile/src/components/subject-hub/SubjectHubChapterSection.tsx` (NEW — one collapsible chapter section)
- `apps/mobile/src/components/subject-hub/SubjectHubNotes.tsx` (NEW — subject-scoped notes, two origins / two views)
- `apps/mobile/src/components/subject-hub/TopicDetailSheet.tsx` (NEW — the topic-detail bottom sheet)
- `apps/mobile/src/components/subject-hub/SubjectHubSearchFilter.tsx` (NEW — the >~10ch/~50topic search/filter line)
- `apps/mobile/src/components/subject-hub/SubjectHubProgressSummary.tsx` (NEW — compact quantified progress summary: mastered/learning/total, reviews due, weekly mastered delta, optional practice points)
- `apps/mobile/src/components/subject-hub/_view-models/subject-hub-state.ts` (NEW — pure derivation: chapter grouping + per-topic state + Next-up resolution + the search/filter threshold; mirrors `book/[bookId]/_view-models/book-derived-state.ts`)
- `apps/mobile/src/hooks/use-subject-hub.ts` (NEW — composes the existing data hooks into one hub view-model; no new endpoints)
- `apps/mobile/src/hooks/use-subject-notes.ts` (NEW — subject-scoped one-store-two-origins notes read; composes existing notes + bookmarks)
- `packages/schemas/src/notes.ts` (CHANGE — add the additive `origin` discriminator to the note response shape, default `'self'`; T9)
- `apps/mobile/src/app/(app)/_layout.tsx` (CHANGE — register the hub `Tabs.Screen` / route under the existing whitelist pattern; V2-flag-gated mount only)
- `apps/mobile/src/i18n/locales/en.json` (CHANGE — new `subjectHub.*` keys, same PR; T10)
- Linkable-from-current-nav wiring: redirect/link the existing `shelf/[subjectId]` and `progress/[subjectId]` entry points at the hub when reachable (T8) — additive, behind the flag where it changes today's behavior.
- Co-located `*.test.tsx` for every new component + view-model + hook.

Out of scope (must not change):
- **`/now` ranking** — the Next-up block reads the SAME continuation source S0 ranks (`useLearningResumeTarget` / the resume-target endpoint) but does **not** re-rank, re-weight, or re-implement the `/now` algorithm. It calls the existing resume-target read; the `/now` card and the hub Next-up are two renderings of one source (S0 plan §"Ranking algorithm" owns ordering). No edit to `apps/api/src/services/now-feed.ts`.
- **The S4 server-mask itself** — this plan only makes `<SubjectHub>` mask-*ready* (rendering driven by handed-in data, no client ownership assumptions). It does not build the masked supporter endpoint, the scope chip, person-scopes, or `child/[profileId]/*`.
- **Cross-subject browse archive** (the "everything I've saved" scannable surface) — that is S3/Journal (EU-6). This plan ships only the **subject-scoped** notes view on the hub.
- **The Mentor feed / `/now` card stack** (S1) and the bar/camera/Homework chip (S1).
- **Library tab demotion** — `library.tsx` is a strangle-target at S6; this plan does not delete it. The hub does not depend on it.
- **`MODE_NAV_V2_ENABLED` flag plumbing** (`feature-flags.ts`, `eas.json`, `ci.yml`, `use-navigation-contract.ts` V2 branch) — that is S1's deliverable (01-codebase-anchors §2). This plan **consumes** the flag and registers the hub route; it does not add the flag wiring. If S2 lands before S1, T7's flag read is the only addition needed and is called out there.
- **Retention SRS write paths** (`applyRetentionUpdate`, S0-R) — the hub reads `masteredAt` / `xpStatus` / `nextReviewAt` as-is.
- **`concept_capture` tables / concept-grain mastery** — identity-baseline-gated; designed-for in T11 as a non-blocking later enhancement, not built here.
- `subject/[subjectId].tsx` (subject settings: rename/archive/delete) and `pick-book/[subjectId].tsx` — kept, reached from the hub, not rewritten.

---

## Surface map (files × responsibility)

| File | Responsibility |
|---|---|
| `subjects.tsx` | V2 Subjects tab: browse-first list of all learner subjects/books with compact progress, search as a filter, and links into `subject.hub`. The "show me everything" escape hatch. |
| `components/subjects/SubjectsBrowse.tsx` | Top-level structure browse: subjects, books, due reviews, mastered/learning/total counts, create/add subject affordance. No feed ranking. |
| `hooks/use-subjects-index.ts` | Composes existing subject/book/progress reads into the top-level browse view-model. No new endpoint. |
| `subject-hub/[subjectId]/index.tsx` | Expo Router page: read params, run query/loading/error gate, render `<SubjectHub data={…} />`. Default export. |
| `subject-hub/[subjectId]/_layout.tsx` | Nested stack seeding `index` (`unstable_settings`) so cross-stack deep pushes to the hub never strand `router.back()` at Home. |
| `components/subject-hub/SubjectHub.tsx` | The persona-unaware hub composition: header (subject name + compact quantified progress) → Next-up → search/filter (conditional) → chapter sections → notes. **Driven entirely by the `SubjectHubData` prop** — no `isOwner`/`role`/`mode` reads (mask-ready for S4). Owns the topic-sheet open/close state. |
| `components/subject-hub/SubjectHubProgressSummary.tsx` | Concrete progress numbers: mastered/learning/total, due reviews, weekly mastered delta, optional recent practice points. |
| `components/subject-hub/SubjectHubNextUp.tsx` | The "Next up" block. Renders the single computed continuation (resume target / up-next topic) with one primary action; never lists topics. |
| `components/subject-hub/SubjectHubChapterSection.tsx` | One collapsible chapter section (uses existing `CollapsibleChapter`), topics inside rendered via existing `TopicStatusRow` with mastery state. Header includes derived chapter progress ("N / N mastered"). Tapping a topic opens the sheet (does not navigate). |
| `components/subject-hub/TopicDetailSheet.tsx` | Bottom sheet over the hub: topic title, topic description under the title, mastery state, notes-for-topic, study/review actions. Slides up; dismiss returns to hub with no navigation. |
| `components/subject-hub/SubjectHubNotes.tsx` | Subject-scoped notes: one list, two origin-filtered views (My notes / Saved from mentor), authorship label always visible per row. |
| `components/subject-hub/SubjectHubSearchFilter.tsx` | The search/filter line shown only past the `~10 chapters / ~50 topics` threshold. |
| `components/subject-hub/_view-models/subject-hub-state.ts` | Pure functions: `groupHubChapters()`, `deriveTopicState()`, `resolveNextUp()`, `shouldShowSearchFilter()`, `applyHubFilter()`. No React, no I/O — unit-testable. |
| `hooks/use-subject-hub.ts` | Composes `useBookWithTopics`/`useBooks` + `useRetentionTopics` + `useLearningResumeTarget` + `useSubjectNotes` into one `{ data, isLoading, isError, refetch }` view-model the page consumes. |
| `hooks/use-subject-notes.ts` | One-store-two-origins subject notes: reads existing notes (`origin: 'self'`) + bookmarks (`origin: 'mentor'`) for the subject, normalizes to a single `SubjectHubNote[]` with an explicit `origin` + `authorLabel`. |
| `packages/schemas/src/notes.ts` | Add additive `origin: noteOriginSchema` (`'self' | 'mentor'`, `.default('self')`) to `noteResponseSchema` + the DB-row shapes; export `noteOriginSchema`. |

---

## Data sources the hub reads (today's model — verified)

| Hub element | Source hook / function (existing) | Field(s) read | Anchor |
|---|---|---|---|
| Subject name + aggregate progress | `useBooks(subjectId)` | `topicCount`, `completedTopicCount`, `masteredTopicCount` per book → summed | `shelf/[subjectId]/index.tsx:205-214` |
| Concrete progress receipts | `useRetentionTopics(subjectId)` + existing progress/reward summary reads where available | due-review count from `nextReviewAt`, weekly mastered delta from recent `masteredAt`, optional recent practice points/XP receipt | `use-progress.ts`; `useXpSummary` / reward summary readers from `01-codebase-anchors.md` (preserve/re-home) |
| Chapters + topics + per-topic state | `useBookWithTopics(subjectId, bookId)` → `topics`, `completedTopicIds`; `useRetentionTopics(subjectId)` → `masteredAt`, `xpStatus`, `nextReviewAt` | `topic.title`, `topic.description`, three-state derivation (mastered/learning/untouched) | `book/[bookId].tsx:607-870` (proven derivation to lift into the view-model); `curriculum_topics.description` verified in schema and existing services |
| **Topic-mastery three-states backend** (Annex A.2 prereq) | `useRetentionTopics` reads `retention_cards.masteredAt` (the sticky mastery marker, plan `2026-05-30-topic-mastery-three-states` §2) + `xpStatus='verified'` | `masteredAt != null` ⇒ Mastered; studied-but-not-verified ⇒ Learning; else Untouched | mastery columns/API per `topic-mastery-three-states` plan T1/T3 |
| **Next-up block** | `useLearningResumeTarget({ subjectId })` — the resume-target read; **same continuation source the `/now` `unfinished_session` card uses** (S0 `session.resume` / resume-target). Fallback: `computeUpNextTopic()` when no active resume target. | `topicId`, `bookId`, resume kind | `use-progress.ts:232-251`; `lib/up-next-topic.ts`; S0 plan ranking input "unfinished_session" |
| Subject-scoped notes (my notes) | `useBookNotes` / `useAllNotes({ subjectId })` | `topicId`, `content`, `sessionId`, `updatedAt`, `origin` | `use-notes.ts:35-94` |
| Subject-scoped notes (saved-from-mentor) | `useBookmarks({ subjectId })` (the chat-saved infinite-query store) → normalized to `origin: 'mentor'` | `content`, `sessionId`, `createdAt` | `use-bookmarks.ts:22`; `bookmarks.ts:4-15`; `progress/saved.tsx` (existing subject bookmarks surface) |
| Topic detail (in sheet) | `useTopicNotes(subjectId, topicId)` + the selected topic row's already-loaded `topic.description` + already-derived state | topic description, per-topic notes + mastery | `use-notes.ts:197-222`; `curriculum_topics.description` already feeds other topic-context services |

**One-store-two-origins note (the §5.4 "one store, two origins" requirement).** Today notes (`noteResponseSchema`) and bookmarks (`bookmarkSchema`) are two physically separate stores: notes = learner-authored, bookmarks = saved-from-chat (the mentor-origin proxy). The spec's "one store" is a **presentation contract**, not a DB merge: `use-subject-notes.ts` reads both and emits a single normalized `SubjectHubNote[]` where each row carries an explicit `origin: 'self' | 'mentor'` and a human `authorLabel`. The additive `origin` field on `noteResponseSchema` (T9) makes a learner-authored note self-describe its origin so the UI never infers authorship from which store a row came out of — authorship is **carried by the data**, satisfying both "authorship always visible" and the mask-ready rule (S4 hands the same normalized shape; the component never guesses). A future DB unification (folding bookmarks into notes with `origin`) is out of scope and unnecessary for this contract.

---

## Tasks

- [ ] **T1: Pure hub view-model — chapter grouping, per-topic state, Next-up, search/filter threshold.**
  Create `components/subject-hub/_view-models/subject-hub-state.ts` with five pure functions, lifting the proven derivation out of `book/[bookId].tsx` (do not import from the book screen — copy the logic into the shared view-model so the hub owns it and the book screen is untouched). Signatures (final — implementer must match exactly):
  ```ts
  export type HubTopicState = 'continue-now' | 'started' | 'up-next' | 'done' | 'mastered' | 'later';

  export interface HubTopic {
    topic: CurriculumTopic;
    state: HubTopicState;
    sessionCount: number;
  }
  export interface HubChapter {
    chapter: string;          // 'Other' when topic.chapter is null (mirrors groupTopicsByChapter)
    topics: HubTopic[];
  }

  // Groups active topics by chapter, annotates each with its state, sorts by
  // the same state priority the book screen uses. Mastered is a NEW terminal
  // state above 'done' (done = studied/verified-once-not-sticky; mastered =
  // masteredAt != null). nextUpTopicId is null when a continue target exists.
  export function groupHubChapters(input: {
    activeTopics: CurriculumTopic[];
    masteredTopicIds: ReadonlySet<string>;   // retention masteredAt != null
    studiedTopicIds: ReadonlySet<string>;    // completed / verified-once
    inProgressTopicIds: ReadonlySet<string>;
    continueTopicId: string | null;
    nextUpTopicId: string | null;
    sessionCountByTopicId: ReadonlyMap<string, number>;
  }): HubChapter[];

  export interface HubNextUp {
    kind: 'resume' | 'up-next' | 'review-due' | 'none';
    topicId: string | null;
    bookId: string | null;
    topicTitle: string | null;
  }
  // Resolves the single Next-up entry from the resume target + up-next fallback.
  // Mirrors the /now continuation source: resume target wins, else up-next topic,
  // else the most-overdue review topic, else 'none'. NEVER returns a list.
  export function resolveNextUp(input: {
    resumeTopicId: string | null;
    resumeBookId: string | null;
    upNextTopic: CurriculumTopic | null;
    mostOverdueReviewTopicId: string | null;
    topicById: ReadonlyMap<string, CurriculumTopic>;
  }): HubNextUp;

  export const HUB_SEARCH_CHAPTER_THRESHOLD = 10;
  export const HUB_SEARCH_TOPIC_THRESHOLD = 50;
  // True when the subject grew past ~10 chapters OR ~50 topics (§5.5).
  export function shouldShowSearchFilter(chapters: HubChapter[]): boolean;

  // Case-insensitive filter over chapter name + topic title; returns the
  // subset of chapters with matching topics (empty chapters dropped).
  export function applyHubFilter(chapters: HubChapter[], query: string): HubChapter[];
  ```
  **done when:** `subject-hub-state.test.ts` (T1a) asserts: `groupHubChapters` puts a `masteredAt`-stamped topic in `state: 'mastered'`, a studied-not-mastered topic in `'done'`, an untouched topic in `'later'`, and orders sections' topics continue→started→up-next→later→done→mastered; `resolveNextUp` returns `kind:'resume'` when a resume target exists, falls back to `'up-next'` then `'review-due'` then `'none'`, and never returns more than one topic; `shouldShowSearchFilter` is false at 9 chapters/49 topics and true at 10 chapters or 50 topics; `applyHubFilter('mol')` returns only chapters containing a matching topic. Pure-function tests, no mocks. `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T2: `<SubjectHub>` — the persona-unaware, mask-ready composition.**
  Create `components/subject-hub/SubjectHub.tsx` and `SubjectHubProgressSummary.tsx`. `<SubjectHub>` takes ONE prop `data: SubjectHubData` (the shape `use-subject-hub.ts` produces — see T6) plus callbacks; it renders header (subject name + `<SubjectHubProgressSummary>`: mastered/learning/total, reviews due, weekly mastered delta, optional recent practice points), then `<SubjectHubNextUp>`, then `<SubjectHubSearchFilter>` (only when `data.showSearchFilter`), then the chapter sections, then `<SubjectHubNotes>`. The progress summary lifts the two-segment pattern at `shelf/[subjectId]/index.tsx:341-381`, adds the mastered segment per `book/[bookId].tsx:1612-1656`, and keeps numbers compact rather than rebuilding the old stats dashboard. It owns `openTopicId` state and renders `<TopicDetailSheet>`.
  **Voice input on `<SubjectHubSearchFilter>` (§16):** the search/filter text input must carry a mic button (spec §16: voice input everywhere). Compliance invariant: transcription-only — never tone or emotion analysis (AI Act Art 5(1)(f) posture). Reuse the same mic/STT affordance as the bar.
  **Hard rule (mask-ready): no `isOwner`, `role`, `mode`, `useProfile`, `useNavigationContract`, or persona/ageBracket read anywhere in this file or its children.** Visibility of every element is driven by fields on `data` (e.g. `data.canStudy`, `data.notes`, `data.nextUp.kind`). This is what lets S4 hand the same component a server-masked `SubjectHubData` (structural columns only, `notes: []`, `canStudy: false`) for a supporter person-scope without a client-side branch. Add a top-of-file comment block stating this rule and citing spec §6.3 ("same hub component, server-masked to structural columns").
  Use semantic tokens only (`bg-surface`, `text-text-primary`, `text-h2`, `useSubjectTint` for the subject accent) — no hardcoded hex.
  **done when:** `SubjectHub.test.tsx` (T2a) renders with a hand-built `SubjectHubData` fixture and asserts: the subject name + `subjectHub.progress.threeState` line render; a concrete progress line renders mastered count, learning count, total topics, due-review count, and weekly delta when present; Next-up, the chapter sections, and the notes section all render; when `data.showSearchFilter` is true the `<SubjectHubSearchFilter>` renders a mic button (assert `testID="search-mic"` or equivalent) and the mic is transcription-only (assert against the STT call — no tone/emotion-analysis flag); with `data.canStudy: false` + `data.notes: []` (the masked shape) the component still renders structure (chapters + mastery) and renders NO notes section and NO study action — proving mask-readiness without a client ownership check. `SubjectHubProgressSummary.test.tsx` asserts optional practice-points copy renders only when provided and uses no-variable fallback copy otherwise. A grep assertion in the test file's companion guard (T2b, see Tests) confirms `SubjectHub.tsx` contains none of `isOwner|useProfile|useNavigationContract|computeAgeBracket`. `pnpm exec jest --findRelatedTests src/components/subject-hub/SubjectHub.tsx src/components/subject-hub/SubjectHubProgressSummary.tsx --no-coverage` passes.

- [ ] **T3: Next-up block — single continuation, same source as the `/now` card.**
  Create `components/subject-hub/SubjectHubNextUp.tsx`. Renders `data.nextUp` (the `HubNextUp` from T1, resolved in T6 from `useLearningResumeTarget` — the SAME resume-target read the `/now` `unfinished_session` card uses, per the S0 plan ranking input table). One card, one primary action labeled by `kind` (`subjectHub.nextUp.resume` / `.upNext` / `.review` / for `kind:'none'` an empty-state `subjectHub.nextUp.allCaughtUp`). The action navigates via the cross-stack-safe push to the session/topic (T8 deep-link rule). **Never lists topics** (spec §5.1 + §5: "the Mentor-feed card never lists topics; twenty physics topics never float anywhere" — the hub Next-up holds the same discipline). When `data.canStudy === false` (masked supporter view) the action is omitted and the block renders the structural "where they are" sentence only.
  **done when:** `SubjectHubNextUp.test.tsx` (T3a) asserts: `kind:'resume'` renders the resume label + a single pressable; `kind:'none'` renders the caught-up empty state with no broken action; exactly one topic/action is rendered for any non-`none` kind (no list); with `canStudy:false` no pressable action renders. `pnpm exec jest --findRelatedTests src/components/subject-hub/SubjectHubNextUp.tsx --no-coverage` passes.

- [ ] **T4: Collapsible chapter sections on the hub (NOT separate screens) + topic rows with mastery.**
  Create `components/subject-hub/SubjectHubChapterSection.tsx`. Reuse the existing `components/library/CollapsibleChapter.tsx` as the collapse container and the existing `components/library/TopicStatusRow.tsx` for each topic. Extend `TopicStatusRow`'s state union usage to render the `'mastered'` state (a filled/✓-distinct glyph + `subjectHub.topic.mastered` label) — if `TopicStatusRow` cannot express `'mastered'` without a source change, render the mastered glyph in the section wrapper rather than editing the shared row (keep `TopicStatusRow` source untouched unless a co-located test is added; prefer wrapping). The chapter header also renders `subjectHub.chapter.progress` derived from the already-present `HubChapter.topics` (`masteredCount = topics where state === 'mastered'`, `totalCount = topics.length`), e.g. "4 / 7 mastered"; choose this text count, not a mini progress bar, for S2. Max depth 2 holds: chapter section → topic row; tapping a topic row calls `onOpenTopic(topicId)` (opens the sheet, T5) — it does **not** push a route. Default first chapter expanded, rest collapsed (or all expanded when `chapters.length === 1`).
  **done when:** `SubjectHubChapterSection.test.tsx` (T4a) asserts: a collapsed section hides its topic rows and an expanded section shows them; the header renders the chapter progress count (`mastered / total mastered`) derived from topic states; a `state:'mastered'` topic renders the mastered indicator distinct from `'done'`; tapping a topic row fires `onOpenTopic` with the topic id and does NOT call any router push (assert via a passed spy callback, no router mock). `pnpm exec jest --findRelatedTests src/components/subject-hub/SubjectHubChapterSection.tsx --no-coverage` passes.

- [ ] **T5: Topic-detail sheet slid up over the hub.**
  Create `components/subject-hub/TopicDetailSheet.tsx` — a bottom sheet (use the same sheet primitive `TopicPickerSheet.tsx` uses; if that is a custom modal, mirror it — do not introduce a new sheet dependency). Renders: topic title, `subjectHub.sheet.about` heading, the topic description under the title and above the mastery line, mastery state line, the topic's notes (from `useTopicNotes(subjectId, topicId)`, both origins), and the study/review actions (study, review-if-due) — actions omitted when `data.canStudy === false`. The description comes from the selected `HubTopic.topic.description` already loaded for the hub; do **not** add a new query and do **not** send the learner to the legacy page just to understand the topic. If a legacy row has an empty/null description, omit the description block rather than fabricating an LLM summary in the client. Dismiss (backdrop tap / swipe down / close button) returns to the hub with the hub scroll position intact and **no navigation** (the sheet is state on the hub, not a route — spec §5.3). The sheet is the topic-detail surface that replaces navigating to `topic/[topicId]`; a "see full topic page" affordance may still deep-link to `topic/[topicId]` via the cross-stack-safe push for the heavy/legacy view, but the default interaction is the sheet.
  **done when:** `TopicDetailSheet.test.tsx` (T5a) asserts: given an open topic id the sheet renders the topic title + topic description + mastery line + notes, with the description placed above the mastery line; the close action fires `onClose` and renders nothing when `topicId` is null; with an empty/null description the description block is omitted cleanly; with `canStudy:false` no study/review action renders. `pnpm exec jest --findRelatedTests src/components/subject-hub/TopicDetailSheet.tsx --no-coverage` passes.

- [ ] **T6: `use-subject-hub.ts` — compose existing hooks into one `SubjectHubData`.**
  Create `hooks/use-subject-hub.ts`. It calls (all existing, no new endpoints): `useBooks(subjectId)`, `useBookWithTopics` per book (or the aggregate the hub needs — if topics-per-book requires N calls, prefer the existing book-with-topics for the active/visible book and lazy-load others on chapter expand; ship the simplest correct version: load all books' topics for subjects under the search threshold, lazy beyond it), `useRetentionTopics(subjectId)`, `useLearningResumeTarget({ subjectId })`, and `useSubjectNotes(subjectId)` (T7). It runs the T1 pure functions to produce:
  ```ts
  export interface SubjectHubData {
    subjectId: string;
    subjectName: string;
    aggregate: {
      mastered: number;
      learning: number;
      total: number;
      dueReviews: number;
      weeklyMasteredDelta: number;
      recentPracticePoints: number | null;
    };
    nextUp: HubNextUp;
    chapters: HubChapter[];
    showSearchFilter: boolean;
    notes: SubjectHubNote[];     // [] when masked (S4) or genuinely empty
    canStudy: boolean;           // true for a learner Me-scope; S4 masks false
  }
  ```
  `canStudy` in S2 is always `true` (this is the learner Me-scope hub); the field exists so S4 can set it false server-side. The hook exposes `{ data: SubjectHubData | null, isLoading, isError, refetch }`. All reads enforce `profileId` through the existing hooks' `activeProfile` scoping — the hub adds no new query path that could leak another profile's data.
  **done when:** `use-subject-hub.test.tsx` (T6a) — using the real hooks against a seeded TanStack QueryClient with the API client mocked **only at the network boundary** (the established `useApiQuery`/Hono-client fetch boundary, the one external seam — NOT an internal `jest.mock` of the hooks) — asserts the composed `SubjectHubData` has the expected aggregate counts, due-review count, weekly mastered delta, optional recent practice points when supplied by the reward summary, a resolved `nextUp`, chapters grouped with mastery state, topic descriptions preserved on `HubTopic.topic.description`, and `canStudy: true`. If wiring the full network boundary is disproportionate, split: assert the composition logic by exercising the T1 view-model with the hook's intermediate values (no mock) and cover the network path in T8a's integration-style render. `pnpm exec jest --findRelatedTests src/hooks/use-subject-hub.ts --no-coverage` passes.

- [ ] **T7: `use-subject-notes.ts` + `<SubjectHubNotes>` — one store, two origins, authorship visible, two views.**
  Create `hooks/use-subject-notes.ts`: read learner notes for the subject (`useAllNotes({ subjectId })` or `useBookNotes` aggregated) and chat-saved bookmarks for the subject (`useBookmarks({ subjectId })` — note the infinite-query shape; flatten `data.pages[].bookmarks`), normalize both into one array:
  ```ts
  export interface SubjectHubNote {
    id: string;
    topicId: string | null;
    content: string;
    origin: 'self' | 'mentor';           // self = learner-authored note; mentor = saved-from-chat
    authorLabel: string;                  // t('subjectHub.notes.authorSelf') | t('subjectHub.notes.authorMentor')
    updatedAt: string;
    sessionId: string | null;
  }
  ```
  Create `components/subject-hub/SubjectHubNotes.tsx`: renders the normalized list with a two-view toggle (segmented control: `subjectHub.notes.viewMine` / `subjectHub.notes.viewSaved`) filtering by `origin`, and **every row shows its `authorLabel`** (never inferred from position). Reuse `components/library/InlineNoteCard.tsx` / `NoteDisplay.tsx` for the row, adding the authorship label. Notes are subject-scoped here; the cross-subject "everything I've saved" browse view is S3/Journal (out of scope).
  **Voice input (§16):** the add-note text input in the notes section must carry a mic button (spec §16: voice input everywhere). Compliance invariant: the mic triggers speech-to-text transcription only — never tone or emotion analysis (AI Act Art 5(1)(f) posture). Reuse whatever mic/STT affordance the bar uses in S1; do not introduce a new STT dependency. The mic is omitted when `canStudy === false` (the masked supporter view has no note input to attach it to).
  **done when:** `SubjectHubNotes.test.tsx` (T7a) asserts: a mixed list renders both a `self` row and a `mentor` row each with its distinct author label; the "Saved from mentor" view shows only `origin:'mentor'` rows and "My notes" shows only `origin:'self'`; an empty list renders the `subjectHub.notes.empty` state (not a dead end — includes an add-note affordance when `canStudy`); when `canStudy` is true the add-note input renders a mic button (assert `testID="notes-mic"` or equivalent); with `canStudy:false` no mic renders; the mic button does NOT trigger tone/emotion analysis (assert by inspecting the STT call: transcription-only flag or equivalent, per the existing S1 STT integration pattern). `use-subject-notes.test.tsx` (T7b) asserts a learner note normalizes to `origin:'self'` and a bookmark normalizes to `origin:'mentor'` with the correct `authorLabel`. `pnpm exec jest --findRelatedTests src/components/subject-hub/SubjectHubNotes.tsx src/hooks/use-subject-notes.ts --no-coverage` passes.

- [ ] **T8: The hub page + nested layout + linkable-from-current-nav wiring + cross-stack deep links.**
  Create `subject-hub/[subjectId]/index.tsx` (default export; reads `subjectId` param, runs the loading/error gate via `use-subject-hub.ts`, renders `<SubjectHub data={…} />`). Create `subject-hub/[subjectId]/_layout.tsx` exporting `unstable_settings = { initialRouteName: 'index' }` (the repo guardrail for any nested layout with an index + deeper dynamic child, mirroring `shelf/[subjectId]/_layout.tsx:8-10`). All in-hub navigations (Next-up action, "see full topic page", review-due) push the **full ancestor chain** via the route-catalog keys (`subject.hub` → `subject.topic` / `retention.review` / `challenge.start`, chain `['subject.hub']` per S0 plan T8) so `router.back()` from a deep target lands on the hub, never Home.
  **Linkable from the current nav (the "also linkable from today's nav" requirement):** wire the hub as the destination from today's per-subject entry points so it delivers value even with the V2 shell off — when `MODE_NAV_V2_ENABLED` is on, `shelf/[subjectId]` and `progress/[subjectId]` route to the hub (additive redirect or an "Open subject hub" entry), and the hub's own `router.push` to a subject uses the hub route. **Honor §7 / the V0 no-regress floor:** when the flag is OFF, today's `shelf` and `progress/[subjectId]` screens render exactly as now — the redirect is flag-gated, never unconditional. Add a `subjectHub.linkLabel` entry point on the existing `progress/[subjectId]` and `shelf` headers (flag-gated) so the hub is reachable from the live app for the S1+S2 evidence gate.
  **done when:** `subject-hub/[subjectId]/index.test.tsx` (T8a) asserts: a valid `subjectId` renders the hub (loading → content), a missing `subjectId` renders an `ErrorFallback` with a working secondary action (not a dead end), and the Next-up primary action pushes a route whose params include the full chain (`subjectId` present, and for a topic target `bookId`+`topicId`) — assert the pushed `Href` shape via a router spy (Expo Router test util, no internal mock). The `_layout.tsx` exports `unstable_settings.initialRouteName === 'index'` (assert by import). `pnpm exec jest --findRelatedTests "src/app/(app)/subject-hub/[subjectId]/index.tsx" --no-coverage` passes.

- [ ] **T9: Additive `origin` discriminator on the notes contract.**
  In `packages/schemas/src/notes.ts`, add `export const noteOriginSchema = z.enum(['self', 'mentor']);` and add `origin: noteOriginSchema.default('self')` to `noteResponseSchema`, `_noteDbRowSchema`, and `allNoteSchema` (additive, defaulted — every existing producer/consumer keeps working; a learner note absent the field parses as `'self'`). Do **not** change `bookmarkSchema` (bookmarks remain the `'mentor'`-origin store; the normalization in T7 stamps `origin:'mentor'` on bookmark-derived rows). This is the only schema change; no migration is required because `origin` is defaulted at the schema boundary and the existing DB notes are all learner-authored (`'self'`). Update `notes.test.ts` to assert the new field defaults to `'self'`.
  **done when:** `packages/schemas/src/notes.test.ts` (T9a) asserts `noteResponseSchema.parse({…without origin})` yields `origin: 'self'`, `noteOriginSchema.options` deep-equals `['self','mentor']`, and a row with `origin:'mentor'` round-trips. `pnpm exec nx run schemas:typecheck` and `pnpm exec nx run schemas:test` pass for `notes.test.ts`.

- [ ] **T10: i18n keys — every hub string through `t()` + `en.json`, same PR.**
  Add all `subjectHub.*` keys to `apps/mobile/src/i18n/locales/en.json` in this PR (the orphan-key + JSX-literal ratchets fail CI otherwise). Required keys (final list — implementer adds exactly these, no hardcoded JSX literals in any new component):
  ```
  subjectHub.title, subjectHub.linkLabel,
  subjectHub.progress.threeState ("{{mastered}} mastered · {{learning}} learning · {{total}} topics"),
  subjectHub.progress.reviewsDue ("{{count}} reviews due"), subjectHub.progress.noReviewsDue,
  subjectHub.progress.weeklyDelta ("+{{count}} this week"), subjectHub.progress.noWeeklyDelta,
  subjectHub.progress.practicePoints ("{{points}} practice points"), subjectHub.progress.noPracticePoints,
  subjectHub.nextUp.heading, subjectHub.nextUp.resume, subjectHub.nextUp.upNext,
  subjectHub.nextUp.review, subjectHub.nextUp.allCaughtUp, subjectHub.nextUp.structuralOnly,
  subjectHub.search.placeholder, subjectHub.search.noResults,
  subjectHub.search.micLabel ("Search by voice"),
  subjectHub.chapter.progress ("{{mastered}} / {{total}} mastered"),
  subjectHub.topic.mastered, subjectHub.topic.done, subjectHub.topic.continueNow,
  subjectHub.topic.started, subjectHub.topic.upNext, subjectHub.topic.later,
  subjectHub.notes.heading, subjectHub.notes.viewMine, subjectHub.notes.viewSaved,
  subjectHub.notes.authorSelf, subjectHub.notes.authorMentor,
  subjectHub.notes.empty, subjectHub.notes.addNote,
  subjectHub.notes.micLabel ("Add note by voice"),
  subjectHub.sheet.about ("About this topic"), subjectHub.sheet.masteryLine, subjectHub.sheet.study, subjectHub.sheet.review,
  subjectHub.sheet.seeFullTopic, subjectHub.sheet.close,
  subjectHub.error.title, subjectHub.error.message, subjectHub.error.missingParam,
  subjectHub.loading.title,
  subjectsBrowse.title, subjectsBrowse.showEverything, subjectsBrowse.searchPlaceholder,
  subjectsBrowse.emptyTitle, subjectsBrowse.emptyMessage, subjectsBrowse.createSubject,
  subjectsBrowse.subjectProgress ("{{mastered}} mastered · {{learning}} learning · {{total}} topics"),
  subjectsBrowse.reviewsDue ("{{count}} due"), subjectsBrowse.openSubject
  ```
  Run `pnpm translate` after adding (so the 7 UI locales get entries) and ensure `scripts/check-i18n-orphan-keys.ts` + `scripts/check-i18n-jsx-literals.ts` pass.
  **done when:** every `subjectHub.*` key referenced by a `t()` call in the new components exists in `en.json` (no forward orphan), no new JSX literal is added to the baseline, and `pnpm check:i18n` (orphan-keys + jsx-literals) passes. Manual: visually confirm no English string is hardcoded in JSX across the new components.

- [ ] **T11: Concept-grain readiness note (non-blocking, design-only).**
  Add a short `## Concept-grain forward-compat` doc block to this plan (below) — **no code** — recording how the hub absorbs the identity-baseline-gated `concept-capture-layer` later without a rework: the `SubjectHubData.chapters[].topics[]` shape is the seam; when concept-grain lands, a topic gains a `concepts: ConceptMastery[]` field and `TopicDetailSheet` renders a concept sub-list, but the chapter→topic max-depth-2 structure and the mastery roll-up are unchanged. This task is satisfied by the documentation block; it gates nothing.
  **done when:** the `## Concept-grain forward-compat` block exists in this plan, names the `SubjectHubData` seam, and states concept-grain is additive (no topic-grain rework). No code, no test.

- [ ] **T12: Fill the V2 Subjects tab — the "show me everything" structure browse escape hatch.**
  Replace the S1 `subjects.tsx` stub with a browse-first Subjects tab. Create `components/subjects/SubjectsBrowse.tsx` and `hooks/use-subjects-index.ts`. The tab lists every active subject with compact progress (`mastered`, `learning`, `total`, `dueReviews`) and each subject row links to `subject.hub`; expanding a subject may show its books/chapters summary, but the page remains a browse list, not a feed. Search/filter is an add-on above the visible list; the full list is visible before typing. It includes a clear `subjectsBrowse.showEverything` affordance/heading so a self-directed learner understands this is the escape hatch from the ≤3-card Mentor feed. Empty state offers create/add subject. No ranking, no hidden "only what the feed says" behavior.
  **done when:** `apps/mobile/src/app/(app)/subjects.test.tsx`, `components/subjects/SubjectsBrowse.test.tsx`, and `hooks/use-subjects-index.test.tsx` assert: the full subject list renders before search; rows show concrete progress numbers and due-review counts; tapping a subject pushes the `subject.hub` route with `subjectId`; search filters and clearing search restores the full list; empty state offers create subject; and the component imports no `/now` ranking or Mentor feed symbols. `pnpm exec jest --findRelatedTests src/app/(app)/subjects.tsx src/components/subjects/SubjectsBrowse.tsx src/hooks/use-subjects-index.ts --no-coverage` passes.

---

## Failure modes (every Recovery uses the shared `ErrorFallback`)

Per spec §14 and the UX-resilience rules — classify at the API-client boundary, render through the reusable `ErrorFallback` (`components/common/ErrorFallback.tsx`, `variant:'card'|'centered'`, primary/secondary actions). The hub must never dead-end.

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Missing `subjectId` param | malformed deep link | `ErrorFallback` (centered): `subjectHub.error.missingParam` | Secondary → back to Subjects/library (working exit, mirrors `shelf:166-187`) |
| Hub data load error | `use-subject-hub` query error | `ErrorFallback`: `subjectHub.error.title` / `.message`; classify raw error first (`classifyApiError` → `recoveryActions`) | Primary retry (`refetch`); secondary back |
| Subject gone (deleted/archived) | books query returns empty + subject not found | `subjectHub.notes.empty`-style honest "this subject is gone" card with a back action (mirrors `progress/[subjectId]:643-669` dead-end fix) | Back to Subjects |
| Notes section load error | notes/bookmarks query error | the notes section renders an inline retry (not a whole-screen failure — the hub structure still renders) | Inline retry on the notes section only |
| Topic sheet data error | `useTopicNotes` error inside the sheet | sheet shows inline error + retry; hub underneath unaffected | Retry in sheet; close returns to hub |
| Masked supporter view (S4 forward) | `canStudy:false` + `notes:[]` handed in | structure (chapters/mastery/next-up sentence) renders; no study actions, no notes section — by design, not an error | n/a (designed state) |
| Empty subject (no books yet) | new subject, zero books | honest empty state with a "pick a book" affordance (mirrors `shelf:446-515`), never a passive "check back" dead end | Pick-a-book action |

---

## Concept-grain forward-compat

The hub is built against today's `subject → books/chapters → topics + retention/mastery` model. The identity-baseline-gated `concept-capture-layer` (Annex A.3 prerequisite, MMT-ADR-0017) is an **additive later enhancement**, not a blocker:

- **Seam:** `SubjectHubData.chapters[].topics[]` (`HubTopic`). When concept-grain lands, `HubTopic` gains an optional `concepts?: ConceptMastery[]`; nothing existing changes type.
- **Render:** `TopicDetailSheet` (T5) is the single place a concept sub-list appears — the sheet already owns "topic detail," so concept rows slot under the topic mastery line with zero change to the chapter→topic max-depth-2 structure or the aggregate roll-up.
- **Mastery roll-up:** the chapter/subject mastery counts stay topic-grain; if/when concept-grain becomes the source of truth, `deriveTopicState` (T1) gains a concept-aware branch behind the same function signature — callers are untouched.
- **No rework:** because mastery is read through `use-subject-hub` (one composition point) and rendered through the data-driven `<SubjectHub>`, concept adoption is a hook + sheet change, not a screen rewrite. This is why S2 ships now without waiting on the baseline reset.

---

## Tests

All co-located (`*.test.tsx` next to source, no `__tests__/`). No internal `jest.mock('./…')` / `jest.mock('../…')` (GC1) — exercise real components/hooks; the only mocked seam is the network boundary (the Hono/`useApiQuery` fetch) where a hook genuinely cannot run offline, using the established external-boundary pattern, never an internal-module mock. Honor `persona-fossil-guard.test.ts` (the hub introduces no persona reads).

- **T1a** `_view-models/subject-hub-state.test.ts` — chapter grouping, mastered/done/later state assignment + ordering; `resolveNextUp` precedence (resume→up-next→review→none) and single-result guarantee; `shouldShowSearchFilter` threshold boundaries (9/49 false, 10/50 true); `applyHubFilter` matching.
- **T2a/T2b** `SubjectHub.test.tsx` — full render from fixture; masked-shape render (`canStudy:false`, `notes:[]`) still shows structure, hides notes + study; **mask-ready guard**: assert the source file contains none of `isOwner|useProfile|useNavigationContract|computeAgeBracket`.
- **T3a** `SubjectHubNextUp.test.tsx` — resume label + single action; caught-up empty state; single-topic (no list); no action when `canStudy:false`.
- **T4a** `SubjectHubChapterSection.test.tsx` — collapse hides rows / expand shows; chapter header renders mastered/total progress count; mastered indicator distinct from done; topic tap fires `onOpenTopic`, no router push.
- **T5a** `TopicDetailSheet.test.tsx` — open renders title + description + mastery + notes; null topicId renders nothing; empty description omits description block; close fires `onClose`; no study/review when `canStudy:false`.
- **T6a** `use-subject-hub.test.tsx` — composed `SubjectHubData` (aggregate counts, resolved nextUp, mastery-stamped chapters, topic descriptions preserved, `canStudy:true`) at the network boundary only.
- **T7a** `SubjectHubNotes.test.tsx` — two-origin render with distinct author labels; per-view filtering; empty state with add affordance. **T7b** `use-subject-notes.test.tsx` — note→`self`, bookmark→`mentor` normalization + `authorLabel`.
- **T8a** `subject-hub/[subjectId]/index.test.tsx` — valid → renders; missing param → `ErrorFallback` with working secondary; Next-up push carries the full ancestor chain; `_layout` `unstable_settings.initialRouteName === 'index'`.
- **T9a** `packages/schemas/src/notes.test.ts` (extend) — `origin` defaults `'self'`; enum members; `'mentor'` round-trip.

**Run gates:** `cd apps/mobile && pnpm exec tsc --noEmit`; `pnpm exec nx lint mobile`; `cd apps/mobile && pnpm exec jest --findRelatedTests <each new file> --no-coverage`; `pnpm exec nx run schemas:test` (for T9); `pnpm check:i18n` (orphan-keys + jsx-literals, T10). No integration suite is required — S2 is read-side UI against existing endpoints; the new schema field is additive and unit-covered. (If T8's linkable-from-nav redirect touches `_layout.tsx` tab registration, run the existing `_layout` test to confirm no V0/V1 tab regression.)

---

## Evidence gate — S1+S2 ship-and-measure (S2 → S3)

S2 is the second half of the validation bet: S1+S2 ship behind `MODE_NAV_V2_ENABLED` and are **observed** before S3+ proceeds (spec §11/§13.6). S3–S6 proceed only if the observed cohort shows the feed + hub are doing real work.

**Primary bar (discovery/engagement):** 3–5 friendly families with a 13+ teen. Pass = (a) the teen returns unprompted at least twice in week one and engages a feed/Subject action that is not only the camera, and (b) the parent can answer "what did my kid work on this week?" from the app alone in under one minute. Owner: product (per §13.6); formal PASS/FAIL recorded in the Bet Sheet / decision log before S3 starts.

**Cold-start activation tripwire — named metric for the evidence gate (spec §3.1):**
The §3.1 pre-committed tripwire measures the learner cold-start card built in S1 (surface: S1's cold-start anchor slot — input bar + three example chips). This tripwire is **measured during the S1+S2 ship-and-measure window** and feeds the S2→S3 gate decision.

- **Metric:** time-to-first-action + freeze-bounce rate (opened the app, took no action, closed).
- **Threshold:** if 13-year-olds stall at the blank box (elevated freeze-bounce), the correction is pre-agreed and **limited to an emphasis flip**: chips become the visual lead, typing stays the escape — not a redesign. (This is the §3.1 ruling; do not re-open it.)
- **S2's role:** carry the measurement/reporting obligation for this tripwire alongside the hub engagement metric in the gate report — the cold-start card itself is S1 (§3.1), but the evidence gate is shared.

**Chips-fill law (spec §2.1):** the subject hub does not currently render suggestion chips near a text input. If any near-input suggestion chips are added to the hub (e.g. autocomplete chips on the search/filter bar or the add-note input), they must **fill the input** (type their words into the box, let the user send) rather than fire as direct actions — per the permanent "chips fill, cards fire" interaction law (§2.1 / §15.15). Proposal cards (Next-up, study action) remain one-tap direct actions and are unaffected by this rule.

---

## Self-review

**Spec coverage** (each §5 / §11 requirement → task):
- §2.2 / §5 self-directed discoverability — feed guides without confining; "show me everything" escape hatch survives without restoring Library tab → T12 (`SubjectsBrowse` browse-first tab; full list visible before search; no `/now` ranking import) + T8 links into `subject.hub`.
- §2.2 quantified progress survives without restoring the full stats wall → T2 (`SubjectHubProgressSummary`) + T6 aggregate fields (`dueReviews`, `weeklyMasteredDelta`, optional `recentPracticePoints`) + T10 i18n keys.
- §5 merge shelf + `progress/[subjectId]` + scattered per-subject surfaces into one hub → T2 (`<SubjectHub>`) + T8 (page) + T8 linkable-from-nav redirect of both source screens.
- §5.1 Next-up block on top, **same source as `/now` card**, never reads the tree → T3 + T6 (`useLearningResumeTarget` = the resume-target/`unfinished_session` source S0 ranks; not re-ranked). Out-of-scope line forbids re-implementing `/now` ranking.
- §5.2 collapsible chapter sections **on the hub screen, not separate screens**, topics inside with mastery and a per-chapter mastered/total count → T4 (`CollapsibleChapter` + `TopicStatusRow`, in-hub, header progress, no route push).
- §5.3 topic detail = **sheet** over the hub with topic description → T5 (`TopicDetailSheet`, description under title, dismiss = state, no navigation).
- §5.4 subject-scoped notes, **one store, two origins (my notes vs saved-from-mentor), authorship always visible, two views** → T7 (`use-subject-notes` normalizes notes+bookmarks to one `origin`-tagged list, `authorLabel` per row, segmented two-view) + T9 (additive `origin` field so authorship is carried by data). Cross-subject browse explicitly deferred to S3/Journal.
- §5.5 search/filter line only past ~10 chapters / ~50 topics; max depth 2 → T1 (`shouldShowSearchFilter`, `HUB_SEARCH_*_THRESHOLD = 10/50`) + T8 (`SubjectHubSearchFilter` conditional). Max depth 2 enforced by chapter→topic + sheet (no third route level).
- §5 "Mentor-feed card never lists topics" discipline applied to Next-up → T3 (single action, never a list).
- §6.3 mask-ready: same hub component, server-masked to structural columns for supporter person-scopes → T2 hard rule (no client ownership reads; `data`-driven) + `canStudy`/`notes` masked-shape test (T2a) + T6 `canStudy` field. S4 server-mask itself out of scope.
- Annex A.2 prereq `topic-mastery-three-states` backend read → data-sources table + T1 (`masteredAt`-driven `'mastered'` state) + T4 render.
- Annex A.3 `concept-capture-layer` baseline-gated, design hub against today's model first, concept-grain later non-blocking → T11 + `## Concept-grain forward-compat`.
- §11 S2 also linkable from current nav + "kills the worst redundancy cluster" + feeds S2→S3 evidence gate → T8 flag-gated redirect + `subjectHub.linkLabel` live entry point + T12 real Subjects tab.
- §11 / §3.1 S2→S3 evidence gate + cold-start activation tripwire → `## Evidence gate` section above (cold-start card is S1/§3.1; S2 carries the measurement obligation for the shared gate, including the pre-agreed emphasis-flip correction).
- §16 voice input on hub text inputs (notes + search/filter) → T2 (`SubjectHubSearchFilter` mic, transcription-only done-when) + T7 (`SubjectHubNotes` add-note mic, transcription-only done-when) + T10 (`subjectHub.search.micLabel`, `subjectHub.notes.micLabel` keys added).
- §2.1 / §15.15 "chips fill, cards fire" interaction law → `## Evidence gate` section above (hub has no current near-input chips; law applies if any are added; proposal cards stay one-tap direct).
- §7 / V0 no-regress floor → T8 (redirect flag-gated; flag-off renders today's screens unchanged).
- Failure modes via `ErrorFallback` → Failure-modes table + T8a (missing-param working exit).
- i18n via `t()` + `en.json` same PR → T10 (exhaustive key list incl. `subjectHub.progress.*` and `subjectsBrowse.*`, ratchets enforced).

**Name consistency:** `SubjectsBrowse` / `use-subjects-index`; `SubjectHub` / `SubjectHubProgressSummary` / `SubjectHubData` / `SubjectHubNote` / `HubTopic` / `HubChapter` / `HubNextUp` / `HubTopicState`; functions `groupHubChapters`, `resolveNextUp`, `shouldShowSearchFilter`, `applyHubFilter`, `deriveTopicState`; hooks `use-subject-hub`, `use-subject-notes`; constants `HUB_SEARCH_CHAPTER_THRESHOLD=10`, `HUB_SEARCH_TOPIC_THRESHOLD=50`; schema `noteOriginSchema`, `origin`; route key `subject.hub` (matches S0 catalog). Used identically across tasks, the data-sources table, failure modes, and tests.

**Deferred-decision scan:** thresholds are concrete (10 chapters / 50 topics); the `'mastered'` vs `'done'` boundary is defined (masteredAt sticky = mastered, studied-not-verified = done, matching `topic-mastery-three-states` §1); concrete progress fields are named (`dueReviews`, `weeklyMasteredDelta`, `recentPracticePoints`); chapter-level progress is the text count "N / N mastered" (not a mini bar) for S2; Next-up precedence is ordered (resume→up-next→review→none); the Subjects tab browse behavior is decided (full list first, search as filter, no `/now` ranking); the one-store-two-origins mechanism is decided (presentation-layer normalization of notes+bookmarks, additive `origin` field, no DB merge); `canStudy` default (`true` in S2) and its S4 purpose are stated; the topic-sheet-vs-`topic/[topicId]` relationship is decided (sheet default, optional deep-link to the legacy page); the topic description source is decided (`HubTopic.topic.description`, no new query, no client LLM fallback); the linkable-from-nav redirect is flag-gated (no V0 regression). No "TBD"/"handle appropriately" remain.
