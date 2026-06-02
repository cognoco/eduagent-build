# Surfacing Orphaned Progress & Topic Data — Design Spec

- **Date:** 2026-06-01 (revised 2026-06-02)
- **Status:** Draft (awaiting review)
- **Author:** brainstorm session (Zuzana + Claude)

## Problem

Across the Progress, Library, and Topic surfaces, the app **computes data on every
load, ships it to the device, and then doesn't render it.** The expensive part
(computation + transport) is already paid; only the rendering is missing. Every item
below was verified against the actual screens/payloads (not a summary table — one
earlier table claim was checked and found false), with `file:line` evidence.

## Goals

Surface already-produced data with the smallest footprint:

1. Give the milestones screen an entry point on the Progress tab. *(D1)*
2. Progress-over-time chart in the monthly report. *(D2)*
3. Per-subject practice activity on the Library shelf. *(D3)*
4. The parent's child-topic view shows the AI "what you covered" excerpt. *(D6b)*
5. Session rows show a one-line recap + a "see full transcript" link, instead of just a
   date. *(D7)*

## Verified findings (ground truth)

| ID | Surface | Orphaned data | Evidence |
|----|---------|---------------|----------|
| D1 | Milestones screen built, no entry point | whole screen | `progress/milestones.tsx`; no `push('/(app)/progress/milestones')` anywhere; `useProgressMilestones` at `use-progress.ts:433` |
| D2 | `/progress/history` has no learner consumer | full time-series | `snapshot-progress.ts:48`; no `useProgressHistory` hook |
| D3 | Progress overview reads only `practiceActivityCount` | `practiceSummary.bySubject` | `progress/index.tsx:371`; payload `progress.ts:688`; row only gets that one field |
| D6b | Child topic rows show only a status dot | `TopicProgress.summaryExcerpt` (LLM) | `child/[profileId]/subjects/[subjectId].tsx:237`; excerpt populated `progress.ts:1400` |
| D7 | Session rows show only date/type/duration | `closingLine`, `purgedAt` | `TopicSessionRow.tsx` (date/type/duration only); `topicSessionSchema` = `{id,sessionType,durationSeconds,createdAt}` (`notes.ts:130`) |

## Deliveries

### D1 — Milestones entry point (free)

- **Where:** Slot A — a compact "🏆 Milestones" strip directly under the hero card in the
  self-view of `progress/index.tsx`, before `ProgressStatsChips`. Mirror the Reports
  card pattern: a few recent milestones + "See all →" → `/(app)/progress/milestones`.
- **Data:** existing `useProgressMilestones(limit)`. Self-view only; hidden when empty.

### D2 — Progress-over-time chart in the monthly report (no backend)

- **Where:** new "Progress over time" section on `progress/reports/[reportId].tsx`.
- **Metrics:** `totalSessions`, `topicsMastered`, `vocabularyTotal` (all in
  `progressDataPointSchema`).
- **Granularity/drill:** default buckets to **months**, tap → **weeks**, never days.
  Client fetches `granularity: 'weekly'` and groups into months; no `'monthly'` enum
  added.
- **New code:** `useProgressHistory(query)` hook + a chart component.
- **Open (plan):** charting approach — reuse `react-native-svg` primitives vs lightweight
  helper; no heavy dependency without confirmation.

### D3 — Practice-by-subject strip on the shelf (free)

- **Where:** header of `shelf/[subjectId]/index.tsx`, above the book list.
- **Content per subject:** **reviews** always; **quizzes** only when count > 0 (lands on
  geography/language automatically — quiz events only exist where quizzes were played, so
  no subject-type detection). Accuracy deferred.
- **Data:** existing `useOverallProgress`, select the matching subject from
  `practiceSummary.bySubject`, read `byType` (`'review'`/`'quiz'`).
- **Copy:** the summary is a **recent window**, not lifetime — word as "Recently: …".

### D6b — Parent child-topic "what you covered" excerpt (free render of LLM text)

- **Where:** `child/[profileId]/subjects/[subjectId].tsx` (today only a status dot). The
  parent has no equivalent and can't see the child's private notes, so the recap is the
  only "what happened here" content available to them. (The self-facing version, D6a, is
  rejected — see below.)
- **Data:** `summaryExcerpt` already on the per-topic payload (`progress.ts:1400`).
- **LLM-text handling (required):** (1) prefer the **already-parent-facing**
  `highlight`/`narrative` fields (generated unconditionally for the parent in
  `generate-session-insights`) over the learner-facing `content`/`summaryExcerpt` slice —
  confirm field choice in the plan; (2) if using `summaryExcerpt`, truncate on a **word
  boundary**, not a raw 160/200-char slice; (3) it is LLM content about the child shown to
  the parent — low-risk within a linked family, but noted against the LLM-surfacing rule.
- **No pipeline change:** trivial sessions legitimately have no summary; the excerpt is
  simply omitted then (correct behavior, by design — see "Confirmed working as intended").

### D7 — Session-row recap + transcript link (small backend add)

Today `TopicSessionRow` shows only **date · sessionType · duration** and its props don't
even include a summary. Make each session row say what was covered.

- **Row:** **topic title · `closingLine` · date** (+ keep duration). `closingLine` is a
  purpose-built single sentence, **≤150 chars**, that "mirrors what the learner did and
  names the concept/skill" (`session-recap.ts:99-104`). The topic title is the natural
  "title" (sessions have no title of their own).
- **Tap → fuller recap:** reveal `learnerRecap` (2–4 sentences) / `narrative` (≤1500
  chars) — already produced, no generation.
- **"See full transcript":** shown only while **`purgedAt == null`** (transcript not yet
  purged — `sessions.ts:504`), linking to the **existing** learner transcript screen
  `app/session-transcript/[sessionId].tsx`, which already degrades gracefully to an
  archived-summary card if reached after purge (`session-transcript/_components/
  archived-transcript-card.tsx`). Gating on `purgedAt` (not a hardcoded "30 days") is
  drift-proof against the ~day-30 purge window + day-37 grace.
- **Backend add (the one backend touch in this spec):** the topic-sessions list endpoint
  `GET /subjects/:subjectId/topics/:topicId/sessions` and `topicSessionSchema`
  (`notes.ts:130`) currently return `{id, sessionType, durationSeconds, createdAt}`.
  Extend them to also return `closingLine`, `topicTitle`, and `purgedAt` by joining
  `session_summaries`. No migration — read-only join + schema fields with safe defaults.
- **Why it's worth the backend touch:** this is the app's *teaching voice* ("Mate tells
  you what you covered") — auto-generated on every substantive session and currently
  shown to the learner **nowhere**. Highest-value surfacing in the batch.

## Rejected / do-not-rebuild (so this isn't re-proposed in a few months)

These were considered and **deliberately cut**. Implementation note: add a short
`// Intentional — do not re-add (see 2026-06-02 progress-data-surfacing spec)` comment at
each cited site so a future audit reads "by design," not "orphan."

- **D5a / D5b — self weekly/monthly report symmetry. CUT (intentional, not an orphan).**
  The self report omits `topicsMastered` / `vocabularyTotal` / `nextSteps` / `subjects`
  that the *child* report shows. This is **by design**: subject progress moved to the
  subject-overview screen `progress/[subjectId]/index.tsx` (stat cards, progress bar,
  resume/continue target, language progress), and the headline totals already appear on
  the Progress-tab hero/chips. Re-adding them to the self report would duplicate. The
  fields cannot be removed from the payload — the child report renders them.
  - Mark intentional at: `progress/reports/[reportId].tsx`,
    `progress/weekly-report/[weeklyReportId].tsx`.
  - The only field with no learner home is `nextSteps[]` (parent-only), and it overlaps
    the existing resume/continue target — **left parked on purpose**.
- **D4 — per-subject reviews on the parent's subject rows. CUT.** Was the only schema/
  backend change; dropped to keep scope lean. The parent already gets rich per-subject
  progress (`SubjectProgressRow`); reviews-per-subject is not worth a backend field here.
- **D6a — self topic-screen "what you learned" excerpt. CUT.** Redundant with the student
  notes feature already on `topic/[topicId].tsx` (`useTopicNotes`, line 317). The student
  already records what they learned in their own words there.

## Confirmed working as intended (do not "fix")

- **Summary generation is auto, on session completion — not gated on notes/"I'm done".**
  `session-completed.ts` always creates a summary row (`createPendingSessionSummary`,
  :917) and generates the LLM narrative/recap. The `pending→accepted` status tracks
  student *review*, not content existence.
- **Short/trivial sessions intentionally get no narrative** (`exchangeCount >= 3` gate;
  `generateAndStoreLlmSummary` may return null). This is a **feature** — do not force
  summaries onto trivial sessions. D6b/D7 simply omit the recap when absent.
- **30-day transcript→summary retention** (`transcript-purge.ts`): raw transcript is
  deleted after ~30 days (day-37 grace) but the summary row is preserved. D7's transcript
  link respects this via `purgedAt`.

## Deferred to a follow-on (verified free, but other surfaces)

- **Home quiz-discovery card** (`LearnerScreen.tsx:452`): renders only `title`; the
  server-written `body` rationale + `missedItemCount` are discarded. Verified free
  (`baseCoachingCardFields.body`, `progress.ts:429`). Home surface — out of scope.
- **Practice hub** (`practice/index.tsx`): `bestConsecutive` never rendered. Verified
  free (`quiz.ts:247`). Practice-hub surface — out of scope.

## Failure Modes

| Delivery | Trigger | User sees | Recovery |
|----------|---------|-----------|----------|
| D1 | milestones query error/empty | strip hidden (no broken card) | "See all" screen has its own retry |
| D2 | history error | inline "couldn't load your trend" + retry; rest intact | retry refetches history only |
| D2 | empty / single point | "Not enough history yet" placeholder | resolves as data accrues |
| D3 | overall-progress error / subject absent | strip hidden; book list intact | reappears on next load |
| D3 | 0 reviews & 0 quizzes | strip hidden for that subject | normal |
| D6b | `summaryExcerpt` null / not accepted | excerpt omitted (no empty label) | appears once a summary exists |
| D7 | `closingLine` null (trivial session) | row shows topic title + date only | normal — by design |
| D7 | `purgedAt` set | "See full transcript" hidden; recap still shown | summary is the surviving record |
| D7 | transcript fetch fails post-tap | existing transcript screen's own error/archived state | n/a — reuses existing screen |

## Test plan

- **D1:** `progress/index` test — strip renders in self-view, hidden when empty/error;
  "See all" pushes `/(app)/progress/milestones`.
- **D2:** `useProgressHistory` hook test (success/error); chart test for month-bucketing,
  weekly drill, empty/single-point placeholder.
- **D3:** shelf test — reviews render; quizzes only when > 0; hidden on error/zero;
  "Recently" copy present.
- **D6b:** child-subject-topics test — excerpt renders when present, omitted when null;
  truncation on word boundary.
- **D7:**
  - schema test — `topicSessionSchema` parses old payloads (without the new fields,
    defaulted) and new payloads with `closingLine`/`topicTitle`/`purgedAt`.
  - integration test — `GET /subjects/:id/topics/:id/sessions` returns the joined summary
    fields matching seeded data; ownership/scoping preserved (parent-chain).
  - `TopicSessionRow` test — renders title + closingLine + date; "See full transcript"
    shown when `purgedAt == null`, hidden when set; omits closingLine when null.
- Run `pnpm exec nx test:integration api` for D7 (touches an API route + DB join).

## Phasing

- **Phase 1 — pure rendering, no backend:** D1, D3, D6b.
- **Phase 2 — new component, no backend:** D2 (history hook + chart).
- **Phase 3 — one small backend add:** D7 (extend topic-sessions endpoint, then row +
  transcript link).

No hard ordering dependency; phases reflect risk/effort.

## Open questions (for the plan, not blockers)

1. D2 charting approach — SVG primitive vs lightweight helper; no heavy dep.
2. D6b field choice — parent-facing `highlight`/`narrative` vs `summaryExcerpt` slice.
3. D3 accuracy on the shelf strip — counts only for v1 (lean).
