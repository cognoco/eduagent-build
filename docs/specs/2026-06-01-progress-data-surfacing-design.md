# Surfacing Orphaned Progress & Topic Data — Design Spec

- **Date:** 2026-06-01 (revised 2026-06-02)
- **Status:** Draft (awaiting review)
- **Author:** brainstorm session (Zuzana + Claude)
- **Adversarial pass (2026-06-02):** all `file:line` citations re-verified against code
  (accurate). Findings folded in: HIGH-1 (D7 LEFT JOIN, else sessions vanish), HIGH-2 (D7
  `topicTitle` source ≠ summaries join), MEDIUM-1/2 (D2 metric aggregation rule + month-bucket
  fuzz), MEDIUM-3 (D7 negative scoping break test), MEDIUM-4 (D3 self-view scope). D6b
  "one condition change" confirmed correct (line 310 `else` is `null`, not the topic list).
- **End-user review pass (2026-06-02):** challenged from the learner/parent seat (9-agent
  journey analysis). Reshaped: D1 → plain entry-point row (preview strip parked — stale
  dates, leads with weakest rungs, English-only copy, gamified emoji); D2 gated to the 2nd
  monthly report onward (no empty-placeholder debut); D3 window relabelled (it is 90 days,
  not a short "recent" window); D7 reshaped (per-session "what was discussed" title instead
  of repeating the topic title; one tap opens a curated covered/revisit/next summary, not the
  raw chat); D6b keeps the win but adds a visual break so the un-gated recap block isn't
  confused with the topic list. None are make-or-break; D6b + D3 are highest-value, D7 is now
  better rather than just cheaper.

## Problem

Across the Progress, Library, and Topic surfaces, the app **computes data on every
load, ships it to the device, and then doesn't render it.** The expensive part
(computation + transport) is already paid; only the rendering is missing. Every item
below was verified against the actual screens/payloads (not a summary table — one
earlier table claim was checked and found false), with `file:line` evidence.

## Goals

Surface already-produced data. Most of these are render-only (the computation and transport
are already paid). **Two exceptions:** D2 is net-new UI (the app has no chart today, the
largest lift in the batch), and **D7 now includes a net-new per-session title** (sessions
have no title today — derive from `closingLine` if possible, else a small generation).

1. Progress-over-time chart in the monthly report — **net-new UI**, not a freebie; shown only
   from the **2nd monthly report onward** so it never debuts as an empty placeholder. *(D2)*
2. Per-subject practice count on the subject-progress screen, **labelled with its real
   90-day window**. *(D3)*
3. The parent's child-subject view shows the per-session LLM recap (`highlight`) even when
   the subject has topics — today rendered only in a no-topics fallback; add a visual break
   so it reads as distinct from the topic list. *(D6b)*
4. Session rows get a generated **"what was discussed" title** (≠ the topic title); one tap
   opens a **curated covered / revisit / next** summary, with the raw transcript as a
   secondary link. *(D7)*

> **D1 (milestones entry point) is CUT from this batch** — see "Rejected / do-not-rebuild".
> The milestones screen stays intentionally parked: its content isn't worth surfacing until
> it's done properly (freshness gate, significance sort, warm copy, i18n).

## Verified findings (ground truth)

| ID | Surface | Orphaned data | Evidence |
|----|---------|---------------|----------|
| D1 | Milestones screen built, no entry point | whole screen | `progress/milestones.tsx`; no `push('/(app)/progress/milestones')` anywhere; `useProgressMilestones` at `use-progress.ts:433` |
| D2 | `/progress/history` has no learner consumer | full time-series | `snapshot-progress.ts:48`; no `useProgressHistory` hook |
| D3 | Progress overview reads only `practiceActivityCount` | `practiceSummary.bySubject` | `progress/index.tsx:371`; payload `progress.ts:688`; row only gets that one field |
| D6b | Per-session LLM recap rendered **only** in the no-topics fallback | `childSession.highlight` (LLM, parent-facing) | recap block gated `topics?.length === 0` at `child/[profileId]/subjects/[subjectId].tsx:310`, renders `session.highlight` at `:356`; field already on the parent payload `childSessionSchema` (`progress.ts:848`) |
| D7 | Session rows show only date/type/duration | `closingLine`, `purgedAt` | `TopicSessionRow.tsx` (date/type/duration only); `topicSessionSchema` = `{id,sessionType,durationSeconds,createdAt}` (`notes.ts:130`) |

## Deliveries

### D1 — Milestones entry point — CUT (parked again)

Originally: a milestones strip / entry point on the Progress tab. **Cut from this batch.** The
milestones *screen* (`progress/milestones.tsx`) is built but unreachable — a real orphan — but
surfacing it now is not worth it. Milestones carry only `createdAt` with no freshness gate (a
returning user sees months-old dates), the API sorts `createdAt desc` so a new user leads with
their weakest rungs ("1 session completed"), the 🏆 framing cuts against the age-neutral
positioning, and `MilestoneCard` copy is hardcoded English (`MilestoneCard.tsx:4-60`). The
screen stays **intentionally parked** until milestones are done properly (freshness gate,
significance sort, warmer copy, i18n) — a separate project, not a data-surfacing freebie. See
"Rejected / do-not-rebuild".

### D2 — Progress-over-time chart in the monthly report (no backend)

- **Where:** new "Progress over time" section on `progress/reports/[reportId].tsx`.
- **Metrics:** `totalSessions`, `topicsMastered`, `vocabularyTotal` (all in
  `progressDataPointSchema`, `packages/schemas/src/snapshots.ts:111-123`).
- **Aggregation rule (resolves MEDIUM-1 — get this wrong and the line is meaningless):**
  `progressDataPointSchema` mixes two metric kinds. `topicsMastered` and `vocabularyTotal`
  are **cumulative-to-date snapshots** (monotonic) — when collapsing weekly points into a
  month, **take the last point in the month**. `totalSessions` (and `totalActiveMinutes`
  if charted) are **period flows** — **sum** them across the month. Do not sum a cumulative
  metric or you double-count growth.
- **When it appears (resolves the empty-placeholder problem):** render the section **only on
  the profile's 2nd monthly report and later** — never on the first. Monthly reports generate
  on the 1st regardless of join date (`monthly-report-cron.ts:118`), so the 1st report can
  cover as little as one day; by the 2nd report the profile always has ~a full prior calendar
  month of history (≥~28 days, ~4-6 weekly points), enough for a real line. This is **simpler
  than a per-day usage gate** (count the profile's prior monthly reports; sequence ≥ 2) and
  strictly subsumes the earlier "≥14 days" idea. A too-early report simply omits the section —
  no "not enough history yet" placeholder ever ships.
- **Granularity/drill:** default buckets to **months**, tap → **weeks**, never days — but in
  early reports (only a few weeks of data) default to **weeks**, since a months view would
  show one or two dots. Client fetches `granularity: 'weekly'` and groups into months; no
  `'monthly'` enum added (the `historyQuerySchema` enum is `['daily','weekly']` only,
  `snapshots.ts:125-129`). **Month buckets are approximate (MEDIUM-2):** ISO weeks straddle
  month boundaries, so a week spanning month-end is assigned to a single month. Acceptable for
  a trend line; flag it so it isn't later misread as a bug.
- **New code:** `useProgressHistory(query)` hook + a chart component + the report-sequence gate.
- **Footprint (be honest):** this is the **first chart in the app**. `react-native-svg`
  (~15.12.1, `apps/mobile/package.json:84`) ships only for splash/celebration animations;
  there is no charting library and no existing trend visualization. D2 means hand-rolled
  SVG path math, a new hook, bucketing logic, the report-sequence gate, and a single-point
  guard — the **largest lift in this batch**, not a render-the-orphan freebie.
- **Open (plan, resolve before building — it is the effort driver):** charting approach —
  reuse `react-native-svg` primitives vs lightweight helper; no heavy dependency without
  confirmation.

### D3 — Recent practice on the subject-progress screen (free)

- **Where:** `progress/[subjectId]/index.tsx`, immediately after the existing Time-spent /
  Sessions row (`:386-408`), inside the `subject` block. The screen is a clean 2×2 of
  StatCards today (Started/Not-started, Time/Sessions); a lone 5th `StatCard` renders
  full-width and reads as a broken grid. Render it instead as a **distinct full-width row**
  (its own labelled line, visually unlike the square StatCards) so it reads as a separate
  practice stat, not a stranded tile.
- **Why here, not the shelf (resolves MEDIUM-2):** this is a reflective progress stat, and
  the subject-progress screen is the subject's "how am I doing" hub — it already shows
  topics mastered, time spent, sessions, vocabulary, and retention. Recent practice
  (reviews/quizzes) is the one progress dimension that screen is missing, and it slots in
  beside the others, **reusing the screen's existing `StatCard` component** (less code than
  a bespoke shelf strip). The shelf (`/(app)/shelf/[subjectId]`) is a content-picker the
  learner reaches to choose a book — it sits *downstream* of this screen (the progress
  screen even has an "Open shelf" button, `:609-618`). Dropping progress stats onto the
  picker is a category mismatch; the progress hub is the natural home. Neither surface shows
  these counts today (verified: progress screen has StatCards for topics/time/sessions/vocab
  but none for practice; shelf header `shelf/[subjectId]/index.tsx:318-399`), so there is no
  duplication either way.
- **Window honesty (corrects the spec's own assumption):** `practiceSummary` is **not a short
  "recent" window — it is a fixed 90-day window** (`PROGRESS_OVERVIEW_PRACTICE_WINDOW_DAYS = 90`,
  `progress.ts:49`, applied `progress.ts:496-502`, computed live). Sitting an unlabelled count
  next to the **lifetime** "Sessions" StatCard directly above invites "Sessions: 47 / Recent
  practice: 6 — where did 41 go?" Label the row with its real window, e.g. **"Practice · last
  90 days"**, not a bare "Recent practice". Note the coaching card already shows "N sessions
  completed" (`[subjectId]/index.tsx:371`), so this is the *third* session-flavoured number on
  the screen — the explicit window label is what keeps it legible.
- **Content per subject:** **reviews** always; **quizzes** only when count > 0 (lands on
  geography/language automatically — quiz events only exist where quizzes were played, so
  no subject-type detection). Accuracy deferred.
- **View scope (resolves MEDIUM-4 — mirror D1):** self-view only. `practiceSummary` is the
  viewer's own data; the sibling overview gates it `isViewingSelf` (`progress/index.tsx:370`).
  If `progress/[subjectId]` is ever reached in a parent-viewing-child context, the row must
  **hide** (no zeros) — already covered by the "subject absent" failure mode.
- **Data:** existing `useOverallProgress`, select the matching subject from
  `practiceSummary.bySubject` (`practiceSummary` lands on the payload at
  `packages/schemas/src/progress.ts:689`; the `bySubject`/`byType` shape is
  `reportPracticeSummarySchema` in `snapshots.ts:299-310`), read `byType`
  (`'review'`/`'quiz'`).

### D6b — Parent sees the per-session LLM recap even when topics exist (free, un-gate)

The parent's child-subject screen already renders a "Recent {subject} sessions" block that
shows each session's **`highlight`** (the LLM-generated, parent-facing one-line recap) —
see `child/[profileId]/subjects/[subjectId].tsx:356`. But the whole block is gated behind
`topics?.length === 0` (`:310`), so it appears **only when the subject has no topics**. In
the normal case (topics exist), the parent sees topic rows with a status dot and **no
recap at all** — which is why this recap was never seen in testing.

- **Fix:** drop `topics?.length === 0` from the gate so the recent-sessions recap block
  renders whenever `subjectSessions.length > 0` — i.e., alongside the topic rows, not only
  as a no-topics fallback. One condition change; the rendering code already exists.
- **Visual break (so it isn't confused with the topic list):** today the recap cards use the
  *same* `bg-surface rounded-card p-4 mt-3` styling as the topic cards, and each recap card's
  title is literally `session.topicTitle` (`[subjectId].tsx:348`) — so a parent with several
  sessions on one topic sees that title repeated up to ~4× across two near-identical lists,
  separated only by a weak `text-h3` header. When un-gating, give the recap block a clear
  separator (distinct surface/accent or a stronger section header) and **stop rendering the
  raw `sessionType` jargon** ("exchange"/"homework", right column `:362`) to parents — it is
  noise, not signal.
- **Data:** `childSession.highlight` is **already on the parent payload**
  (`childSessionSchema`, `progress.ts:848`) and already rendered by this block. **No
  backend change.**
- **Correct field — this corrects an earlier error in this spec.** Use `highlight` (LLM,
  generated *for the parent*), **not** `summaryExcerpt`. `summaryExcerpt` is a slice of
  `sessionSummaries.content`, and `content` is the **student's own written reflection** —
  `submitSummary` writes `content: input.content` (`session-summary.ts:230,257`) and copies
  it verbatim into the learner's private topic note (`:276-281`). Surfacing it to the
  parent would expose the child's private writing; `highlight`/`narrative` are the fields
  authored for parent consumption. No truncation needed — `highlight` is already a short
  single sentence.
- **No pipeline change:** trivial sessions legitimately have no summary, so `highlight` is
  null and that session's recap line is simply omitted (the existing `:356` null-guard
  already does this — correct behavior, by design; see "Confirmed working as intended").
- **Resolves the review fork (HIGH-2):** the "free-but-exposes-student-content vs
  safe-but-needs-backend" dilemma only existed if the recap were forced onto the per-topic
  `TopicProgress` payload (which carries only `summaryExcerpt`). Surfacing via the
  **child-sessions** payload — which already carries the safe `highlight` — is both free
  **and** safe.

### D7 — Session "what was discussed" title + curated one-tap summary (small backend add)

Today `TopicSessionRow` shows only **date · sessionType · duration** (`TopicSessionRow.tsx`),
each row is ~72px, and a single tap already navigates to the session summary
(`session-detail-navigation.ts`). Two problems: (a) a row says nothing about *what that
session was about*, and (b) the "recall what we did" need is poorly served — the destination
mixes system metrics with a raw transcript dump.

**Row (keep today's compact size): generated title · date · duration.**
- The row gets a short, generated **"what was discussed" title** — the sub-topic the session
  actually covered, e.g. *"How does a plant get fed?"* under the topic **Photosynthesis**.
  This is the Claude-style "rename the chat" idea: a 2-second scan of what each session was
  about. It is **NOT** the topic title (the learner is already on that topic's screen — the
  title is the 22px page header, `TopicHeader.tsx:68` — so repeating it per row is noise).
- **This is net-new generation, not an orphan render.** Sessions have no title today, so a
  short title must be produced per session. **Before adding a dedicated micro-generation,
  check whether it can be seeded cheaply from a field we already generate** — `closingLine`
  already "names the concept/skill they worked through" (`session-recap.ts:99-104`), so a
  derived/truncated title may avoid a new LLM call. The risk is *title quality*: generic
  ("Learning session") or wrong auto-titles are noise. Resolve the source in the plan (this is
  the effort driver for D7).
- **No recap sentence in the row, no extra row height** (per review): the row stays compact;
  the recap lives behind the tap.

**One tap → curated "covered / revisit / next" summary (not the raw chat).**
- The single tap opens a **curated summary**: *what you covered* (concepts / topic chips),
  *what to pick up next*, and the short recap — so the learner never has to read an 80-bubble
  chat to remember a session.
- **This content already exists** as the **archived-transcript card** (`narrative`, topic
  chips, `reEntryRecommendation` "pick up from where we left off", `learnerRecap` —
  `archived-transcript-card.tsx`), but today it only renders *after* the raw transcript is
  purged (~day 30). **Promote it to always-on** (pre-purge too) as the primary one-tap
  destination.
- **Positive-framing rule:** label the "what to pick up" section **"Pick up here" / "Worth
  revisiting"**, never "where you got stuck" — "struggle/stuck/weak" copy is banned and
  CI-enforced (`scripts/check-no-clinical-copy.ts`). Source field is `reEntryRecommendation`,
  which is already learner-appropriate (it renders to the learner in the archived card).
- **Raw transcript = secondary link.** A "See the full conversation" link is shown only while
  **`purgedAt == null`** (`sessions.ts:504`), pointing at the existing transcript screen
  `app/session-transcript/[sessionId].tsx` (which already degrades to the archived-summary
  card after purge). Gating on `purgedAt` (not a hardcoded "30 days") is drift-proof against
  the ~day-30 purge window + day-37 grace.

**Backend add (the one backend touch in this spec):** the topic-sessions list endpoint
`GET /subjects/:subjectId/topics/:topicId/sessions` (handler `notes.ts:232-246`, service
`getTopicSessions` in `session-topic.ts`) and `topicSessionSchema` (`notes.ts:130`) currently
return `{id, sessionType, durationSeconds, createdAt}`.
- **List payload** adds the new **session title** and **`purgedAt`** (the latter decides
  whether the secondary "full conversation" link is offered). It no longer needs `closingLine`
  in the list — that moves into the one-tap detail.
- **`purgedAt`** comes from a **LEFT JOIN** to `session_summaries` (**HIGH-1 — must be LEFT,
  not INNER**). `getTopicSessions` today returns *every* `completed`/`auto_closed` session
  with `exchangeCount >= 1`; an INNER JOIN silently **drops** any session lacking a
  `session_summaries` row (legacy data predating always-create, or a failed
  `createPendingSessionSummary`) — a completed session would vanish from the list. LEFT JOIN
  keeps the row (title falls back, no "full conversation" link).
- **The curated one-tap detail** reuses the existing session-detail fetch (by `sessionId`);
  promote the archived-card fields (`narrative` / `reEntryRecommendation` / topic chips /
  `learnerRecap`) so they render pre-purge. No new list-row data needed for the detail.
- **Scoping preserved:** the existing parent-chain scope (`subjects.profileId = profileId`)
  is unchanged; any new join keys on `session_summaries.sessionId` within the already-scoped
  session set, so no cross-profile rows can leak in.
- No migration — read-only joins + schema fields with safe defaults (plus wherever the session
  title is stored/derived, resolved in the plan).
- **Why it's worth the backend touch:** the curated summary re-surfaces the app's *teaching
  voice* where the learner actually needs it (reviewing for a test, picking a topic back up) —
  covered/revisit/next in two seconds, instead of a chronological chat wall with no search.
  Today this content is shown **only once, at session end** (`session-summary/[sessionId].tsx:905-912`
  + `:1044-1052`) and is **not re-accessible from the topic's session history** — the surface
  D7 adds. A genuinely new surface, not a duplicate of the one-time completion screen.

## Rejected / do-not-rebuild (so this isn't re-proposed in a few months)

These were considered and **deliberately cut**. Implementation note: add a short
`// Intentional — do not re-add (see 2026-06-02 progress-data-surfacing spec)` comment at
each cited site so a future audit reads "by design," not "orphan."

- **D1 — milestones entry point / preview strip. PARKED (again).** The milestones screen
  exists but is intentionally left unreachable for now. Stale `createdAt`-only dates, a
  `createdAt desc` sort that leads with the weakest rungs, the gamified 🏆 framing, and
  hardcoded-English `MilestoneCard` copy (`MilestoneCard.tsx:4-60`) mean any entry point would
  surface demotivating, English-only, stale content. A proper motivational milestones surface
  (freshness gate, significance sort, warm copy, i18n) is a separate future project. Mark
  intentional at `progress/milestones.tsx` (orphaned-by-design) and the Progress self-view
  where an entry point would otherwise sit.
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
| D2 | history error | inline "couldn't load your trend" + retry; rest intact | retry refetches history only |
| D2 | 1st monthly report (sequence < 2) | section omitted entirely (no placeholder) | appears automatically on the 2nd report |
| D2 | single weekly point (active only one week) | section omitted / single-point guard | resolves as data accrues |
| D3 | overall-progress error / subject absent | practice row hidden; rest of subject-progress screen intact | reappears on next load |
| D3 | 0 reviews & 0 quizzes | practice row hidden for that subject | normal |
| D6b | `highlight` null (trivial session) | that session's recap line omitted (existing `:356` null-guard) | appears once a summary exists |
| D6b | `subjectSessions` empty | recap block hidden (today's behavior preserved) | appears once sessions exist |
| D7 | session title unavailable (no source field / generation failed) | row shows date + duration only (no title line) | normal — title is additive |
| D7 | no `session_summaries` row at all (legacy / failed create) | row still appears (LEFT JOIN keeps it — HIGH-1); one-tap shows minimal detail, no "full conversation" link | session is never dropped from history |
| D7 | `purgedAt` set | "See the full conversation" link hidden; curated covered/revisit/next summary still shown | summary is the surviving record |
| D7 | curated detail sparse (trivial session, no narrative) | detail shows what exists (e.g. concepts only); empty sections omitted | normal — by design |
| D7 | transcript fetch fails post-tap | existing transcript screen's own error/archived state | n/a — reuses existing screen |

## Test plan

- **D2:** `useProgressHistory` hook test (success/error); report-sequence gate test (section
  omitted on the 1st monthly report, present on the 2nd+); chart test for month-bucketing,
  weekly drill, single-point guard.
- **D3:** subject-progress-screen test — practice row renders reviews always, quizzes only
  when > 0; hidden on error / missing subject / both-zero / parent-viewing-child; the
  **window label** (e.g. "last 90 days") is present so it can't be misread as lifetime; the
  existing Topics/Time/Sessions StatCards still render.
- **D6b:** child-subject test — with topics present **and** sessions with `highlight`, the
  recent-sessions recap block renders (regression-proofs the un-gate); a session with null
  `highlight` omits its recap line; empty `subjectSessions` hides the block.
- **D7:**
  - schema test — `topicSessionSchema` parses old payloads (without the new fields,
    defaulted) and new payloads with the session `title`/`purgedAt`.
  - integration test — `GET /subjects/:id/topics/:id/sessions` returns the session title +
    `purgedAt` matching seeded data; ownership/scoping preserved (parent-chain).
  - integration test (negative / break test — MEDIUM-3) — a profile that does **not** own the
    session cannot retrieve it (or its curated summary) through this endpoint / the detail
    fetch. The cross-table join is exactly where a scoping regression would hide; assert the
    other-profile request returns no rows (or 404).
  - integration test (LEFT-JOIN guard — HIGH-1) — seed a completed session **with no**
    `session_summaries` row and assert it still appears in the list (title fallback, no "full
    conversation" link), proving an INNER JOIN didn't sneak in.
  - `TopicSessionRow` test — renders generated title + date + duration at today's row size; no
    topic-title repetition; tapping opens the curated summary.
  - curated-detail test — renders covered/revisit/next from seeded summary fields; "Pick up
    here"/"Worth revisiting" copy (never "stuck"); "See the full conversation" link shown when
    `purgedAt == null`, hidden when set; sparse session omits empty sections.
- Run `pnpm exec nx test:integration api` for D7 (touches an API route + DB join).

## Phasing

- **Phase 1 — pure rendering, no backend:** D3 (labelled practice row), D6b (un-gate + visual
  break).
- **Phase 2 — new component, no backend:** D2 (history hook + chart + report-sequence gate).
- **Phase 3 — backend + new surface:** D7 (session-title source [derive vs generate], extend
  topic-sessions endpoint, promote the curated summary to pre-purge, row + curated detail). D7
  is no longer a pure render — the session title is net-new, so it carries the most
  uncertainty.

No hard ordering dependency; phases reflect risk/effort. D7's title-source decision is the
gating unknown for that phase. (D1 is cut — see Rejected.)

## Open questions (for the plan, not blockers)

1. D2 charting approach — SVG primitive vs lightweight helper; no heavy dep. **(Effort
   driver — resolve before building D2.)**
2. **D7 session-title source (effort driver) — derive from `closingLine` vs a dedicated
   micro-generation.** Resolve before building D7; it determines whether D7 adds an LLM call.
3. ~~D6b field choice~~ — **resolved**: use the parent-facing LLM `highlight` already on the
   child-sessions payload (not `summaryExcerpt`, which is the student's private content).
4. ~~D2 sparse-data debut~~ — **resolved**: gate to the 2nd monthly report onward; no
   placeholder ever ships.
5. ~~D1 milestones~~ — **resolved**: cut from this batch; screen stays intentionally parked.
6. D3 — counts only for v1; accuracy deferred.
