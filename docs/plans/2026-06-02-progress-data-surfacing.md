---
title: Progress & Topic Data Surfacing — Implementation Plan
date: 2026-06-02
profile: code
spec: docs/specs/2026-06-01-progress-data-surfacing-design.md
status: draft
---

# Progress & Topic Data Surfacing — Implementation Plan

**Goal:** Surface progress/topic data the app already computes-and-ships but never renders — milestones entry, a progress-over-time chart, per-subject practice on the shelf, the parent's per-session recap, and a per-session recap line + transcript link — without regressing existing behavior.

**Approach:** Four risk-ordered phases. Phase 0 records a deliberate non-decision in code. Phases 1–2 are additive client rendering (no backend); D6b is a one-line gate change. Phase 3 makes one backward-compatible API change (a LEFT join) behind co-located + integration tests. Every user-visible string routes through `t()` with an `en.json` key in the same task.

## Scope

In scope:
- `apps/mobile/src/app/(app)/progress/index.tsx` and `progress/_components/**` (D1)
- `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx` + `progress/_components/**` (D3)
- `apps/mobile/src/components/library/**` (D7 row)
- `apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx` (D6b)
- `apps/mobile/src/app/(app)/progress/reports/[reportId].tsx` (D2 chart, D5 comment) and `progress/weekly-report/[weeklyReportId].tsx` (D5 comment)
- `apps/mobile/src/hooks/use-progress-history.ts` (new, D2), `apps/mobile/src/app/(app)/topic/[topicId].tsx` (D7 wiring)
- `packages/schemas/src/notes.ts` (D7 schema)
- the API route + service backing `GET /subjects/:subjectId/topics/:topicId/sessions` (D7)
- `apps/mobile/src/i18n/locales/en.json` (new keys)

Out of scope (MUST NOT change behavior):
- `session-completed.ts` and the summary-generation pipeline (working as intended)
- `transcript-purge.ts` / retention timing
- The self report metric set in `reports/[reportId].tsx` / `weekly-report/[weeklyReportId].tsx` beyond the chart insert + the comment (D5 is rejected)
- Any parent per-subject reviews field (D4 rejected); any self topic-screen excerpt (D6a rejected)
- `MonthlyReportData` / `WeeklyReportData` field sets (the child report depends on them)
- **`summaryExcerpt`** — the parent recap (D6b) must NOT use it; it is the student's private written reflection (`session-summary.ts:230,257`). Use the parent-facing `highlight`.

## Decisions locked here (no deferral)

- **D6b source + surface:** render the existing parent-facing LLM field `childSession.highlight`, already on the child-sessions payload (`childSessionSchema`, `progress.ts:848`). The recap block that renders `session.highlight` already exists at `child/[profileId]/subjects/[subjectId].tsx:356`; it is only gated behind `topics?.length === 0` (`:310`). The fix is to **drop that gate** so the block shows whenever `subjectSessions.length > 0`. No new component, no truncation (highlight is a short single sentence), no backend. Do **not** use `summaryExcerpt`.
- **D7 row shape:** the one-sentence `closingLine` becomes the row's **primary line** (it is effectively the session's title); date + duration move to the secondary line. No `topicTitle` is added to the payload — all sessions on the screen share the topic the screen already knows. So the schema add is **`closingLine` + `purgedAt` only**.
- **D2 charting:** build with `react-native-svg` primitives (the repo already ships SVG via `ProgressBar`); **no new charting dependency**. Fetch `granularity: 'weekly'`, range = last 26 weeks (~6 months), bucket weeks into months client-side; tapping a month expands to its weeks. Plot three series: `totalSessions`, `topicsMastered`, `vocabularyTotal`.
- **D1 strip:** reuse the existing `MilestoneCard`; show the 3 most recent via `useProgressMilestones(3)`; "See all →" pushes `/(app)/progress/milestones`.

## Surface map

| File | Responsibility | Phase |
|------|----------------|-------|
| `progress/reports/[reportId].tsx`, `progress/weekly-report/[weeklyReportId].tsx` | add "do-not-re-add" comment (D5) | 0 |
| `progress/_components/MilestonesStrip.tsx` (new) | recent-milestones strip + "See all" | 1 |
| `progress/index.tsx` | mount `MilestonesStrip` in slot A (self-view) | 1 |
| `progress/_components/SubjectPracticeStats.tsx` (new) | per-subject recent reviews/quizzes StatCards | 1 |
| `progress/[subjectId]/index.tsx` | mount practice StatCards after the Time/Sessions row | 1 |
| `child/[profileId]/subjects/[subjectId].tsx` | un-gate the existing `highlight` recap block | 1 |
| `hooks/use-progress-history.ts` (new) | consume `GET /progress/history` | 2 |
| `progress/_components/ProgressOverTimeChart.tsx` (new) | svg chart + week→month bucketing | 2 |
| `progress/reports/[reportId].tsx` | mount chart section | 2 |
| `packages/schemas/src/notes.ts` | extend `topicSessionSchema` (`closingLine`, `purgedAt`) | 3 |
| API route + service for `GET /subjects/:id/topics/:id/sessions` | LEFT join `session_summaries` | 3 |
| `components/library/TopicSessionRow.tsx` | recap headline + transcript link | 3 |
| `topic/[topicId].tsx` | pass new fields to the row | 3 |

## Tasks

### Phase 0 — record the rejected decision in code

- [ ] **T0:** Add the comment `// Intentional — do not re-add topicsMastered/vocabularyTotal/nextSteps/subjects here. Subject progress lives on progress/[subjectId] + Progress-tab chips; self report is deliberately lean. See docs/specs/2026-06-01-progress-data-surfacing-design.md (Rejected/do-not-rebuild).` immediately above the metric-card block in both `progress/reports/[reportId].tsx` (near line 115) and `progress/weekly-report/[weeklyReportId].tsx` (near line 140). — done when: both files contain the comment; `pnpm exec nx lint mobile` passes; no rendered output changed (no JSX added/removed).

### Phase 1 — pure rendering, no backend

- [ ] **T1:** Create `progress/_components/MilestonesStrip.tsx` — calls `useProgressMilestones(3)`, renders up to 3 `MilestoneCard`s in a card titled `t('progress.milestones.stripTitle')` with a "See all" `Pressable` (`t('progress.milestones.seeAll')`, testID `progress-milestones-see-all`) that `router.push('/(app)/progress/milestones')`. Returns `null` while loading, on error, or when the list is empty. Add the two i18n keys to `en.json`. — done when: test `T1` (see Tests) passes.
- [ ] **T2:** Mount `<MilestonesStrip />` in `progress/index.tsx` in the self-view branch, **after** the hero card (`~line 572`) and **before** `<ProgressStatsChips />` (`~line 574`); gate on `isViewingSelf`. — done when: test `T2` passes; viewing a linked child does NOT render the strip.
- [ ] **T3:** Create `progress/_components/SubjectPracticeStats.tsx` taking `subjectId` — calls `useOverallProgress()`, finds the matching subject in `practiceSummary.bySubject`, reads its `byType` entries. Renders a small "Recent practice" caption (`t('progress.subject.recentPracticeLabel')`) above a `flex-row gap-3` row of StatCard-style cards (same `bg-surface rounded-card p-4 flex-1` styling as the screen's existing `StatCard`): a **Reviews** card always (label `t('progress.subject.statRecentReviews')`, value = review count, default 0); a **Quizzes** card only when its count `>0` (label `t('progress.subject.statRecentQuizzes')`). Returns `null` on error, missing subject, or when reviews and quizzes are both 0. Add i18n keys. — done when: test `T3` passes.
- [ ] **T4:** Mount `<SubjectPracticeStats subjectId={subject.subjectId} />` in `progress/[subjectId]/index.tsx` inside the `subject` block, immediately after the Time-spent / Sessions StatCard row (`~line 408`). — done when: test `T4` passes; the existing Topics/Time/Sessions/Vocabulary/retention sections are unchanged when the component renders `null`.
- [ ] **T5 (D6b):** In `child/[profileId]/subjects/[subjectId].tsx`, change the recent-sessions block gate at line 310 from `!isLoading && topics?.length === 0 && subjectSessions.length > 0` to `!isLoading && subjectSessions.length > 0`, so the existing `session.highlight` recap cards (`:356`) render whenever sessions exist — not only as a no-topics fallback. Do not touch the rendering body, the `session.highlight` null-guard, or the per-session `router.push` to `/(app)/child/[profileId]/session/[sessionId]`. Do **not** introduce `summaryExcerpt` or any truncation. — done when: test `T5` passes (recap block renders with topics present + sessions having `highlight`; a null-`highlight` session omits its recap line; empty `subjectSessions` hides the block).

### Phase 2 — new component, no backend (largest lift — see spec D2 "Footprint")

- [ ] **T6:** Create `hooks/use-progress-history.ts` exporting `useProgressHistory()` — `useApiQuery` against `client.progress.history.$get({ query: { granularity: 'weekly', from: <26 weeks ago ISO date>, to: <today ISO date> } })`, returns `ProgressHistory` (`dataPoints`). Gate `enabled` on an active profile. — done when: test `T6` passes (success returns dataPoints; error surfaces `isError`).
- [ ] **T7:** Create `progress/_components/ProgressOverTimeChart.tsx` — pure presentation given `dataPoints: ProgressDataPoint[]`. Exports a `bucketWeeksIntoMonths(dataPoints)` helper (sums `totalSessions`, takes period-end `topicsMastered`/`vocabularyTotal`). Renders an SVG (`react-native-svg`) line/area for the three series at month granularity; tapping a month expands to its constituent weekly points. Renders `t('progress.overTime.empty')` when `dataPoints.length < 2`. Title `t('progress.overTime.title')`. No new dependency. Add i18n keys. — done when: test `T7` passes (bucketing math; empty/single-point placeholder; month→week expand toggles rendered point count).
- [ ] **T8:** Mount the chart in `progress/reports/[reportId].tsx` — a new section after `<PracticeActivitySummaryCard>` (~line 151), fed by `useProgressHistory()`; on the hook's `isError`, render an inline retry (`t('progress.overTime.errorRetry')`) without affecting the rest of the report. — done when: test `T8` passes (chart section present with data; inline error path renders and the report's other cards still render).

### Phase 3 — one small, backward-compatible backend add (D7)

- [ ] **T9:** Extend `topicSessionSchema` in `packages/schemas/src/notes.ts` (line ~130) with `closingLine: z.string().nullable().default(null)` and `purgedAt: isoDateField.nullable().default(null)`. Defaults keep older API payloads (and older OTA clients reading new server output) parseable. — done when: test `T9` passes (parses a legacy payload lacking both fields → both `null`; parses a full payload).
- [ ] **T10:** In the service backing `GET /subjects/:subjectId/topics/:topicId/sessions` (locate the `.topics[':topicId'].sessions` handler under `apps/api/src/routes/` and its service in `apps/api/src/services/`), add a **LEFT JOIN** on `session_summaries` (`ss.session_id = ls.id AND ss.profile_id = <scoped profileId>`) selecting `ss.closing_line AS closingLine` and `ss.purged_at AS purgedAt`. Sessions without a summary still return (LEFT join → nulls). Preserve the existing `profileId` scoping/ownership predicate exactly; do not change ordering or existing fields. Business logic stays in the service, not the route handler. — done when: test `T10` (integration) passes.
- [ ] **T11:** Update `components/library/TopicSessionRow.tsx` — add optional props `closingLine?: string | null` and `purgedAt?: string | null`. When `closingLine` is present, make it the **primary line** (replacing the date headline) with date+duration on the secondary line; when null, keep today's date-primary layout (no regression). When `purgedAt == null`, render a "See full transcript" `Pressable` (`t('topic.session.seeTranscript')`, testID `session-transcript-link-${sessionId}`) that pushes `/session-transcript/[sessionId]`; hide it when `purgedAt` is set. Add the i18n key. — done when: test `T11` passes.
- [ ] **T12:** In `topic/[topicId].tsx`, pass the new `closingLine` and `purgedAt` from each `useTopicSessions` item into `<TopicSessionRow>`. — done when: test `T12` passes (row receives and renders the recap for a session that has one); existing tap-to-open behavior unchanged.

### Cross-cutting verification

- [ ] **T13:** Full local validation. — done when: `cd apps/mobile && pnpm exec tsc --noEmit` clean; `pnpm exec nx lint mobile` and `pnpm exec nx run api:lint` clean; `pnpm exec nx run api:typecheck` clean; related mobile jest for every touched screen/component green; `pnpm exec nx test:integration api` green (covers T10); `scripts/check-i18n-orphan-keys.ts` passes (all new keys present, no orphans).

## Tests

Co-located, no internal mocks (mock only true external boundaries). Component/screen tests use the repo's `screen-render` test utils.

- **T1** (`MilestonesStrip.test.tsx`): renders 3 cards from a seeded `useProgressMilestones` result; renders nothing for empty/loading/error; "See all" press calls `router.push('/(app)/progress/milestones')`.
- **T2** (extend `progress/index` test): strip present in self-view with milestones; **absent** when viewing a linked child.
- **T3** (`SubjectPracticeStats.test.tsx`): seeded `bySubject` with reviews>0 & quizzes=0 → only the Reviews card + "Recent practice" label; quizzes>0 → both cards; both 0 / missing subject / error → `null`.
- **T4** (extend `progress/[subjectId]` test): the recent-practice row renders after the Time/Sessions row with data; the Topics/Time/Sessions/Vocabulary StatCards still render when the component is `null`.
- **T5** (extend `child/.../subjects/[subjectId]` test): with `topics` non-empty **and** sessions carrying `highlight`, the `subject-recent-sessions` block renders (the un-gate — this is the regression guard); a session with null `highlight` omits its recap line while still rendering the card; empty `subjectSessions` → block absent. Assert no `summaryExcerpt` usage.
- **T6** (`use-progress-history.test.ts`): success maps to `dataPoints`; error → `isError` (mock only the HTTP boundary).
- **T7** (`ProgressOverTimeChart.test.tsx`): `bucketWeeksIntoMonths` sums sessions and takes period-end mastered/vocab; `<2` points → empty placeholder; tapping a month increases rendered point count to its weeks.
- **T8** (extend report test): chart section renders with seeded history; on hook error the inline retry renders and the sessions/minutes/practice cards still render.
- **T9** (`notes` schema test): legacy `{id,sessionType,durationSeconds,createdAt}` parses with `closingLine`/`purgedAt` defaulting to `null`; full payload parses.
- **T10** (`*.integration.test.ts` for the topic-sessions route, run via `pnpm exec nx test:integration api`): seed a topic with one session that HAS a summary and one that does NOT → response returns both rows; the summarized one carries `closingLine` + `purgedAt`, the other carries `null`s. **Break test:** a request scoped to a different profile must not receive these sessions (ownership predicate intact).
- **T11** (`TopicSessionRow.test.tsx`): with `closingLine` → recap is the primary line, date/duration secondary; without → date-primary layout (regression guard); `purgedAt == null` → transcript link present and pushes `/session-transcript/[id]`; `purgedAt` set → link absent.
- **T12** (extend `topic/[topicId]` test): a session with a summary renders its recap via the row; tap-to-open session still works.

## Risks / backward-compatibility notes

- **D6b is the lowest-risk delivery:** a single boolean condition change on a block whose rendering code already exists and already ships. The only behavior change is that the recap now also shows when topics are present.
- **OTA skew (T9–T10):** older app bundles will receive the two new fields and ignore them (additive, safe); newer bundles reading an older server get `null` via schema defaults (safe). The LEFT join guarantees no session disappears from the list.
- **D7 is the only DB-touching change** and is read-only (no migration). All other phases are client-only and self-hide when data is absent, so a failure renders nothing rather than breaking a screen.
