---
title: Topic Mastery — Three-State Lifecycle (Untouched → Learning → Mastered)
date: 2026-05-30
profile: code
spec: this document (design captured inline from 2026-05-30 conversation)
status: draft
---

# Topic Mastery — Three-State Lifecycle — Implementation Plan

**Goal:** Replace the binary "X/Y topics completed" model with three explicit
topic states — **Untouched → Learning → Mastered** — so that studied-but-not-yet-mastered
work becomes visible instead of collapsing into "0", and reviews have a visible
destination. This dissolves the "0/33 + Keep it fresh" contradiction at its root.

**Approach:** Add a **sticky** mastery marker (`mastered_at`) so the Mastered
count only ever grows (honest, motivating), while the SM-2 review schedule stays
untouched (honest — failed material resurfaces fast). The API gains
`topicsMastered` + `topicsLearning` alongside the existing `topicsTotal`; every
mobile surface that renders "X/Y topics" switches to a three-segment bar + short
count line. A second phase makes the Learning→Mastered climb legible on the topic
screen (a "strong reviews" ring).

---

## Key design decisions (locked 2026-05-30)

These are the decisions the implementer must not re-litigate.

1. **State definitions.**
   - **Untouched** — no retention card AND not in the completed set. Never studied.
   - **Learning** — studied (has a `retention_cards` row OR is in the
     `completedTopics` OR-chain at `progress.ts:215-256`) but has **never** reached
     the verified bar. This is the previously-invisible middle state.
   - **Mastered** — has reached `xpStatus='verified'` **at least once** (sticky;
     see #2). Once Mastered, always Mastered.

2. **Mastered is a sticky flag (Option 1).** `xpStatus` is reversible today
   (`verified → decayed`, computed in `processRecallResult` and persisted at
   `retention-data.ts:906` **and** `review-calibration-grade.ts:111` — note the two
   write sites, see T2), so it cannot back a monotonic
   count. We add `retention_cards.mastered_at timestamp` (nullable), set **once**
   the first time a card transitions to `xpStatus='verified'`, and **never**
   cleared. `topicsMastered = count(cards WHERE mastered_at IS NOT NULL)`. The
   count only ever goes up.

3. **⚠ PRODUCT CHANGE (not a mere reinterpretation) — Mastered = *verified*, not
   the whole OR-chain.** In conversation Mastered was described as "verified XP /
   passed assessment / terminal session" (today's `topicsCompleted` OR-chain). We
   deliberately map Mastered to the **verified** bar only (sustained recall
   success), and route "studied via one terminal session / accepted summary /
   passed assessment but not yet verified" into **Learning**. Rationale: this is
   what gives the "strong reviews → Mastered" progression somewhere to live and
   makes mastery feel earned rather than granted after a single sitting.

   **This redefines what counts as the top tier, so call out the upgrade impact
   honestly:**
   - *Without mitigation*, topics that today count as `completed` (via a single
     terminal session / accepted summary / passed assessment) move from the top
     tier into Learning, so a per-user "Mastered" count would read lower than the
     old "completed" number. T1b's backfill stamps already-`verified` cards, which
     covers the genuinely-mastered case — but the OR-chain-only-not-verified topics
     still land in Learning by design.
   - *Mitigating insight:* the **filled portion of the three-segment bar never
     shrinks**. By T3's definition `topicsMastered + topicsLearning ≥` the old
     `topicsCompleted`, so the bar's total fill is preserved or larger — nothing the
     user previously saw as "progress" empties out. What changes is only that the
     *solid (Mastered) segment* is a stricter subset; the rest is still filled, as
     the lighter Learning segment. And the old UI never displayed a literal
     "Mastered: N" number to begin with (it showed `completed/total`), so there is
     no prior number visibly counting down.
   - **DECIDED (2026-05-30): verified-only Mastered**, at both topic and book level
     (see #7). The T1b backfill covers the upgrade case. The looser OR-chain
     definition is rejected — it would make a single terminal session count as
     Mastered and leave the progression ring (T11) with nothing to fill.

4. **Schedule stays honest.** `reviewDueCount` (`retention-data.ts:290-293`)
   remains independent of mastery. A Mastered topic whose card is due renders
   **"Mastered" + "1 to review"** simultaneously — a coherent "I mastered this,
   now it's time to refresh it" story. No suppression of the SM-2 reset on failure.

5. **Hidden strength signal (Option 2) — already captured, not surfaced.**
   `consecutiveSuccesses` + `failureCount` (`assessments.ts:115,131,132`) are the
   strength signal. Phase 1/2 do **not** show a number going backwards and do
   **not** add a "needs refresh" tier. We just keep recording these (already
   happening) so a future tier or review-ordering feature can reconcile
   "count that only grows" with "schedule that tells the truth."

6. **Lapse threshold (Option 4) — documented, not active in P1/P2.** Any future
   *visible* downgrade or "needs refresh" tier must require **N=2 consecutive
   failures**, not one bad recall (symmetry with the existing 3-consecutive-success
   needs-deepening resolve at `retention-data.ts:1418`). Since Mastered is sticky
   and nothing visible reverts in P1/P2, this threshold has no user-visible effect
   yet — it is recorded here so the future tier is built on it from day one.

7. **Book Mastered — strict + sticky, modeled as a SEPARATE FLAG (Phase 1.5).**
   Book mastery is **not** a fifth value of the `BookProgressStatus` enum. Mastery
   and review-due are **orthogonal** — a book can be both Mastered and have a card
   due — so a single-value status field cannot express both without hiding one. We
   mirror the topic level exactly: mastery is a separate **sticky flag**
   (`curriculum_books.mastered_at`), composed at the view alongside the schedule
   status and the review overlay. Three independent signals, never flattened into
   one field.

   - **Two axes, kept separate:**
     - *Mastery (sticky flag):* `curriculum_books.mastered_at` — null or set. Drives
       the "Mastered" badge. Book-level analogue of `retention_cards.mastered_at`.
     - *Schedule/progress (the enum):* `bookProgressStatusSchema` is reduced to
       **`{ NOT_STARTED, IN_PROGRESS, REVIEW_DUE }`**. **`COMPLETED` is retired** —
       under strict mastery it overlapped awkwardly with book-level Learning (a book
       where every topic hit the loose OR-chain but none verified is *not* Mastered;
       it is Learning/IN_PROGRESS). "Fully done" is expressed solely by `mastered_at`
       being set, never by a status value. Precedence for the single enum slot:
       `REVIEW_DUE` when the book has ≥1 due card; else `IN_PROGRESS` if any topic is
       touched; else `NOT_STARTED`. Mastery is **never** in this slot.
     - *Review-due:* `REVIEW_DUE` now means "this book has ≥1 due retention card"
       (any), composing with both Learning and Mastered — a deliberate refinement of
       today's behavior, where `REVIEW_DUE` only fired inside the all-completed
       branch (`curriculum.ts:501-507`) and so hid due reviews on partially-done
       books. Matches subject-level `reviewDueCount` (any due card) semantics.

   - **Strict definition:** a book qualifies as Mastered only when **every
     non-skipped topic** is topic-Mastered (sticky-verified per #2/#3). Stricter than
     the retired `COMPLETED`. Same upgrade dynamic as #3, covered by the **symmetric**
     T1b backfill (topics first, then books — see T1b).

   - **"Non-skipped" — precise definition:** `curriculum_topics.skipped = false`
     (`subjects.ts:189`). Already the canonical "active topic" filter throughout
     `curriculum.ts` (lines 881, 942, 1160, 1262); the book-status pipeline already
     passes only non-skipped topic IDs. The non-skipped set is resolved **at
     evaluation time** (every stamp re-evaluation and every `computeBookStatus`
     read), never cached.

   - **Sticky guarantee + the two reversion edges.** Because mastery is a write-once
     flag, both edges keep the earned badge and change only the *bar*, never the
     badge:
     - *New topic filed in later* (freeform filing / curriculum regen): book stays
       Mastered (flag already set); the new untouched topic shows as Learning inside
       the three-segment bar.
     - *A topic un-skipped after the book was stamped* (whether or not an un-skip
       path exists today — the rule holds regardless): same answer — book keeps its
       Mastered badge; the now-active, unmastered topic shows as Learning in the bar.
     Both are honest because the within-book bar still tells the truth while the
     monotonic badge honors "never take away what's earned."

   - **Stamp trigger is a WHOLE-SET re-evaluation, not a single-card transition.**
     Unlike the topic stamp (T2, which inspects one card), the book stamp must, on
     **any topic verifying**, re-evaluate the book's *entire* non-skipped sibling set
     and stamp `curriculum_books.mastered_at` only if that verify made the **last**
     remaining topic Mastered. This lives in the same verify path as T2 (see T2's
     book-stamp step). It must be expressed as a **single conditional `UPDATE … WHERE
     NOT EXISTS (an unmastered non-skipped topic)`** — never a JS
     read-all-siblings-then-write. There is no open DB transaction at the stamp point
     (`processRecallTest`'s only transaction closes at `retention-data.ts:806`, before
     the persist; the calibration path uses separate Inngest `step.run` boundaries), so
     a JS read-then-write races: two sibling topics verifying concurrently each read the
     other as still-unmastered and the book is **permanently** never stamped. The atomic
     `NOT EXISTS` statement (T2 spells it out) is immune to this. It cannot live in the
     topic's own single-card stamp.

   - **Chapters stay display-only** — `chapter` is a `text` column
     (`subjects.ts:188`), not an entity. No chapter state, **no chapter
     `mastered_at`, ever.** A derived "X of Y mastered" on a chapter section header is
     allowed **only** as a pure render-time computation against the chapter's
     *current* topic set (no sticky memory) — framed as "3 of the 4 topics here," not
     a badge the chapter earned, so a number that can drop when a topic is filed in
     never reintroduces the take-away problem. Out of scope for this plan regardless;
     this constraint binds it if/when added.

---

## Scope

In scope:
- `packages/database/src/schema/assessments.ts` — add topic `mastered_at` column
- `packages/database/src/schema/subjects.ts` — add book `mastered_at` column (1.5)
- New Drizzle migration under `packages/database/` (generated; both columns + backfill)
- `apps/api/src/services/curriculum.ts` — read book `mastered_at`; schedule status +
  book mastery counts; whole-set stamp lives in the verify path (T2) (1.5)
- `packages/schemas/src/subjects.ts` — retire `COMPLETED`; add `masteredAt` +
  mastery counts to `curriculumBookSchema` (mastery is a flag, not an enum value) (1.5)
- `apps/mobile/src/components/library/BookCard.tsx` — Mastered badge (from flag) +
  schedule label + review overlay + 3-segment book bar (1.5)
- `apps/api/src/services/retention-data.ts` — set `mastered_at` on first verify
  (via a shared stamp helper; see T2)
- `apps/api/src/inngest/functions/review-calibration-grade.ts` — **second live
  verify-entry path**; must call the same shared stamp helper as `retention-data.ts`
  (see T2). Without this, topics mastered via calibration never get stamped.
- `apps/api/src/services/progress.ts` — compute `topicsMastered` / `topicsLearning`
- `packages/schemas/src/progress.ts` — extend `subjectProgressSchema` + overview
- `apps/mobile/src/hooks/use-progress.ts` — extend `OverallProgressResponse`
- `apps/mobile/src/components/library/ShelfRow.tsx` — structured props + 3-seg bar
- `apps/mobile/src/app/(app)/library.tsx` — pass structured counts; coach card
- `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx` — 3-state label + bar
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` — 3-state text
- `apps/mobile/src/components/library/TopicHeader.tsx` (+ topic detail) — P2 ring
- i18n: `apps/mobile/src/i18n/locales/en.json` + `pnpm translate`
- Co-located test files for each of the above

Out of scope (must not change):
- `reviewDueCount` semantics / SM-2 scheduling logic (`retention-data.ts` recall path)
- The V0/V1 navigation contract and tab shapes
- `dashboard.ts` parent-facing aggregates (read the new fields only if trivial;
  otherwise leave on the existing `topicsCompleted`/`topicsVerified` fields — they
  remain populated and non-breaking)
- Any change to what flips `xpStatus` to `verified` (we only *observe* that
  transition to stamp `mastered_at`)

---

## Tasks

### Phase 1 — Three-state model (high-leverage; independently shippable)

- [ ] **T1: Add the sticky `mastered_at` column.**
  Add `masteredAt: timestamp('mastered_at', { withTimezone: true })` (nullable, no
  default) to `retentionCards` in `packages/database/src/schema/assessments.ts`
  (alongside the SM-2 columns ~line 112-160). Generate the migration via
  `pnpm run db:generate:dev` and apply to dev with `pnpm run db:push:dev`.
  **done when:** the generated migration SQL adds the nullable column,
  `pnpm run db:push:dev` applies clean, and the Drizzle row type exposes
  `masteredAt: Date | null`. See **Rollback** below.

- [ ] **T1b: Backfill `mastered_at` for already-verified cards (required for prod).**
  Append a backfill statement to the **same** committed migration file as T1:
  ```sql
  UPDATE retention_cards
     SET mastered_at = COALESCE(last_reviewed_at, updated_at)
   WHERE xp_status = 'verified'
     AND mastered_at IS NULL;
  ```
  Rationale: without this, decision #3's redefinition (OR-chain → verified-only)
  **combined with** a forward-only stamp would make existing users' Mastered count
  visibly *drop* on first load after deploy — a user who genuinely earned `verified`
  last month, whose card hasn't re-verified since, would show 0 mastered until their
  next successful review. That is the opposite of the motivating-count goal. The
  backfill stamps every currently-`verified` card with its best-known mastery time
  (`last_reviewed_at`, falling back to `updated_at`) so no earned mastery disappears
  on upgrade. (On a clean dev DB this UPDATE simply matches 0 rows — harmless.)

  **Symmetric, ordered backfill — both levels.** The book stamp must also be
  backfilled, and it **depends on the topic backfill having run first** (book mastery
  is derived from topic `mastered_at`). Append, **after** the topic UPDATE above, in
  the **same** migration file:
  ```sql
  -- Runs AFTER the retention_cards backfill above. Stamp any book whose entire
  -- non-skipped topic set is now mastered. Uses NOT EXISTS (an unmastered,
  -- non-skipped topic) so books with zero topics are NOT stamped.
  UPDATE curriculum_books b
     SET mastered_at = NOW()
   WHERE b.mastered_at IS NULL
     AND EXISTS (
       SELECT 1 FROM curriculum_topics t
        WHERE t.book_id = b.id AND t.skipped = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM curriculum_topics t
        LEFT JOIN retention_cards rc ON rc.topic_id = t.id
        WHERE t.book_id = b.id
          AND t.skipped = false
          AND (rc.mastered_at IS NULL)
     );
  ```
  Without the book backfill, every fully-mastered book would regress to Learning on
  upgrade until its topics re-verify — reintroducing exactly the regression the topic
  backfill exists to prevent.
  **done when:** an integration test seeds (a) a `verified` topic card with no
  `mastered_at`, (b) a book whose every non-skipped topic is verified, and (c) a book
  with one unverified non-skipped topic; runs the migration; and asserts the card's
  `mastered_at` is populated (= its `last_reviewed_at`), book (b)'s `mastered_at` is
  set, book (c)'s `mastered_at` stays null, and a `pending` card / zero-topic book are
  both untouched. The test must prove ordering: a book whose topics are only stamped
  by the topic UPDATE still qualifies (topic backfill ran first).

- [ ] **T2: Stamp `mastered_at` on *entry* into verified (sticky), at EVERY verify-entry
  write site. ⚠ load-bearing.**
  This task is the single point of failure for the whole feature's monotonicity
  guarantee — implement the trigger precisely, not loosely, and at **every** site that
  writes `xpStatus = 'verified'`, not just one.

  **There are TWO live verify-entry write paths — both must stamp:**
  1. `apps/api/src/services/retention-data.ts` `processRecallTest` — the SM-2 persist
     at ~line 898-924 (the `db.update(retentionCards).set({ … xpStatus … })`), with the
     xp-ledger sync gated on `result.xpChange === 'verified'` at ~line 975.
  2. `apps/api/src/inngest/functions/review-calibration-grade.ts`
     `handleReviewCalibrationGrade` — the persist at line 101-128 (same
     `xpStatus: result.newState.xpStatus` write), xp sync at 135-138. This path is
     **live in production**, dispatched from
     `apps/api/src/services/session/session-exchange.ts:1103`
     (`app/review.calibration.requested`) during normal session exchanges. A topic can
     reach `verified` entirely through this path, **never** touching `processRecallTest`
     — so instrumenting only path 1 silently undercounts Mastered and never fires the
     book stamp for those topics.

  **Extract a shared stamp helper so both sites are covered by construction.** Both call
  sites already share `processRecallResult` (from `services/retention`) but duplicate the
  `db.update(retentionCards).set({...})` block. Add one helper (e.g.
  `stampMasteryOnVerify(db, { profileId, topicId, cardId, xpChange })`) and call it from
  both, rather than copy-pasting stamp logic twice.

  - Stamp on the **transition into** verified — drive it off `result.xpChange ===
    'verified'` (the *entry* event), **not** off observing `xpStatus === 'verified'`
    on an arbitrary write.
  - The topic stamp is a **SEPARATE conditional `UPDATE`**, issued after (and independent
    of) the SM-2 persist:
    ```sql
    UPDATE retention_cards SET mastered_at = <now>
     WHERE id = :cardId AND profile_id = :profileId AND mastered_at IS NULL
    ```
    **Do NOT fold `mastered_at IS NULL` into the existing SM-2 persist's `WHERE`**
    (`retention-data.ts:912-923`, gated on `updatedAt = claimNow`). Adding the guard
    there would make every re-verify of an already-mastered card fail the predicate and
    **drop the entire SM-2 update** (ease/interval/nextReviewAt) — corrupting the
    schedule. The `mastered_at IS NULL` clause is the only thing protecting the original
    timestamp against a `verified → decayed → verified` cycle; it belongs on its own
    write.
  - Never write `mastered_at` back to null on `decayed` / failure paths.

  - **Book whole-set stamp — a single race-immune atomic statement (the book stamp lives
    here, not in T14).** Do **NOT** read all siblings in JS and then conditionally write.
    There is no open DB transaction at this point in either path
    (`processRecallTest`'s only `db.transaction(...)` closes at `retention-data.ts:806`,
    *before* the persist; the calibration path uses separate Inngest `step.run`
    boundaries), so a JS read-then-write genuinely races: the last two unmastered sibling
    topics verifying concurrently each read the other as still-unmastered (neither stamp
    committed yet) and the book ends up **permanently** never stamped. Instead, after the
    topic stamp, issue **one conditional `UPDATE`** that re-evaluates the whole non-skipped
    set inside the database:
    ```sql
    UPDATE curriculum_books b SET mastered_at = <now>
     WHERE b.id = :bookId
       AND b.mastered_at IS NULL
       AND EXISTS (SELECT 1 FROM curriculum_topics t
                    WHERE t.book_id = b.id AND t.skipped = false)
       AND NOT EXISTS (
         SELECT 1 FROM curriculum_topics t
          LEFT JOIN retention_cards rc ON rc.topic_id = t.id
          WHERE t.book_id = b.id AND t.skipped = false AND rc.mastered_at IS NULL)
    ```
    This is idempotent and immune to concurrent sibling verifies: whichever verify commits
    last sees all siblings mastered and stamps; earlier ones no-op via the `NOT EXISTS`.
    (`:bookId` = the verified topic's parent book.) It mirrors the T1b book backfill
    exactly, so the runtime stamp and the backfill share one definition of "book mastered."
  **done when:** a new test in `retention-data.test.ts` proves, for one card cycled
  `verified → decayed → verified`: (a) `mastered_at` is set (and equals the time of
  the **first** verify) on the first entry; (b) after the second entry, the stored
  `mastered_at` **value is byte-for-byte the same timestamp** as after the first
  entry (assert equality on the timestamp itself, not merely `!= null`); (c) it is
  not cleared by the intervening `decayed`/failure. Red-green: write the
  value-equality assertion, watch it pass, then remove the `IS NULL` guard and watch
  (b) fail (proving the guard, not luck, preserves the value). **Plus** a book-stamp
  test: a 2-topic book where verifying topic 1 leaves `book.mastered_at` null, and
  verifying topic 2 stamps it; and that re-verifying topic 2 later does **not**
  overwrite the book's `mastered_at` value. **Plus** a concurrency test: the last two
  unmastered sibling topics verify in two interleaved calls and the book still ends with
  `mastered_at` set (proving the atomic `NOT EXISTS` stamp, not a JS read-then-write, is
  used). **Plus** a calibration-path test: a topic driven to `verified` through
  `handleReviewCalibrationGrade` (not `processRecallTest`) gets `mastered_at` stamped.
  **Plus** a sweep gate: `grep` every `xpStatus … 'verified'` card write across
  `apps/api/src` and confirm each routes through the shared stamp helper (per CLAUDE.md
  "sweep when you fix" / "end-to-end feature tracing"); confirm challenge-round
  verification writes `assessments.mastery_challenge_verified_at` only and does **not**
  write `retention_cards.xpStatus = 'verified'`.

- [ ] **T3: Compute three-state buckets in `progress.ts`.**
  In `getSubjectProgress` (and the batch variant) at
  `apps/api/src/services/progress.ts:215-256`, after the existing `completedTopics`
  / `verifiedTopics` sets are built, derive:
  - `masteredTopics` = topics whose card has `masteredAt != null`
  - `learningTopics` = `(topics with a card OR in completedTopics) MINUS masteredTopics`
  - emit `topicsMastered = masteredTopics.size`, `topicsLearning = learningTopics.size`.
  Keep `topicsCompleted` / `topicsVerified` populated unchanged (non-breaking).
  Invariant: `topicsMastered + topicsLearning + untouched = topicsTotal` where
  `untouched = topicsTotal − topicsMastered − topicsLearning ≥ 0`.
  **done when:** `progress.test.ts` adds a suite asserting the partition invariant
  across all four OR-chain completion cases (passed assessment, terminal session,
  accepted summary, verified card) plus a never-studied subject (mastered=0,
  learning=0) and a studied-not-verified subject (mastered=0, learning>0).

- [ ] **T4: Extend the progress contract.**
  In `packages/schemas/src/progress.ts`, add `topicsMastered: z.number().int()` and
  `topicsLearning: z.number().int()` to `subjectProgressSchema` (line 236-249). Add
  `totalTopicsMastered` / `totalTopicsLearning` to `progressOverviewResponseSchema`
  (line 677-688) computed as sums in the overview service.
  **done when:** `pnpm exec nx run api:typecheck` passes and
  `routes/progress.test.ts` validates the expanded response schema green.

- [ ] **T5: Extend the mobile progress type.**
  In `apps/mobile/src/hooks/use-progress.ts`, add `topicsMastered: number` and
  `topicsLearning: number` to the per-subject shape in `OverallProgressResponse`
  (line 134-149) and the two overview totals.
  **done when:** `cd apps/mobile && pnpm exec tsc --noEmit` passes.

- [ ] **T6: ShelfRow renders three states (structured props + 3-segment bar).**
  In `apps/mobile/src/components/library/ShelfRow.tsx`:
  - Replace the `topicProgress: string` prop and the `getProgressRatio` string-split
    (lines 29-39) with structured numeric props: `topicsMastered`, `topicsLearning`,
    `topicsTotal`.
  - Render the rail (testID `shelf-row-progress-…`, lines 465-485) as a **three-segment
    stacked bar**: mastered = `tint.solid`; learning = a lighter tint of the same hue;
    remainder = the existing track. Widths = `mastered/total`, `learning/total`.
  - Subtitle (lines 202-205): when `mastered>0` → `"{{count}} books · {{mastered}} mastered · {{learning}} learning"`;
    when `mastered=0 && learning>0` → `"{{count}} books · {{learning}} learning"`;
    when both 0 → existing `shelfSubtitleUnstarted`. (Untouched count is shown by the
    bar track, not text — keeps the S10e small screen uncrowded.)
  - Leave the review badge (line 428) exactly as-is; a Mastered row with a due card
    shows the bar + "{{count}} to review" together (decision #4).
  **done when:** `ShelfRow.test.tsx` asserts: 3-segment widths for a mixed subject;
  the `mastered>0` subtitle string; the `mastered=0,learning>0` subtitle; the
  unstarted case; and that the review badge still renders alongside a mastered bar.

- [ ] **T7: Wire library.tsx to structured counts.**
  In `apps/mobile/src/app/(app)/library.tsx`, replace the
  `topicProgress = ` ${topicsCompleted}/${topicsTotal}` `` constructions (lines ~845,
  1089-1094) with the structured `topicsMastered` / `topicsLearning` / `topicsTotal`
  props. Update `isFinished` to `topicsMastered >= topicsTotal && topicsTotal > 0`.
  Update the coach card `nextLearningSubject` "in progress" predicate (lines 473-476)
  to `topicsLearning > 0 || (topicsMastered > 0 && topicsMastered < topicsTotal)`.
  **done when:** `library.test.tsx` (the existing coach-card + render suites) passes
  with the new props, including the `[coach-card]` continue/start/revisit cases.

- [ ] **T8: Subject detail screen three-state label + bar.**
  In `apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx` (lines 332-356, label
  key `library.shelf.topicProgress` + the single-segment bar), switch to the same
  three-segment bar and a `{{mastered}} mastered · {{learning}} learning` label,
  sourced from per-book `completedTopicCount` if the book payload carries mastery,
  else from the subject progress entry. Use the same lighter-tint segment as T6.
  **done when:** the screen's test (or a new render test) asserts the three-state
  label and that the bar has mastered + learning segments.

- [ ] **T9: Book screen three-state finished text.**
  In `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx` line ~1616,
  replace `"{doneTopics.length} of {activeTopics.length} topics finished"` with a
  three-state phrasing routed through i18n (e.g. `{{mastered}} mastered ·
  {{learning}} learning · {{total}} topics`), driven by the per-topic `state`
  already computed for `TopicStatusRow` (mastered vs started vs untouched).
  **done when:** the book screen test asserts the new phrasing for a book with a
  mix of mastered/learning/untouched topics.

- [ ] **T10: i18n keys + translation.**
  Add the new keys to `apps/mobile/src/i18n/locales/en.json`
  (`library.row.shelfSubtitleMastered`, `…shelfSubtitleLearningOnly`,
  `library.shelf.topicProgressThreeState`, the book-screen key, with `_one`/`_other`
  plural variants where a count leads). Run `pnpm translate`, then `pnpm check:i18n`
  and `pnpm check:i18n:orphans`.
  **done when:** all 6 non-English locales gain the keys, `check:i18n` reports
  "up to date", and `check:i18n:orphans` reports no findings (exit 0).

### Phase 1.5 — Book Mastered (strict + sticky; builds on Phase 1)

- [ ] **T12: Retire `COMPLETED`; carry mastery as a separate flag on the contract.**
  Mastery is NOT an enum value (decision #7). In `packages/schemas/src/subjects.ts`:
  - Reduce `bookProgressStatusSchema` (line 150-156) to
    **`['NOT_STARTED', 'IN_PROGRESS', 'REVIEW_DUE']`** — remove `'COMPLETED'`.
  - Add to `curriculumBookSchema` (line 158-171) and `bookWithTopicsSchema`
    (line 181-188): `masteredAt: isoDateField.nullable().optional()` (the sticky
    flag) and `masteredTopicCount: z.number().int().optional()` (drives the bar's
    mastered segment, alongside the existing `topicCount` / `completedTopicCount`).
  - **Sweep all `COMPLETED` consumers** (forward-only, per the sweep rule): the BookCard
    `STATUS_STYLES`/`STATUS_LABELS` maps (T15), `curriculum.ts` (T14), and every
    `status: 'COMPLETED'` / `'COMPLETED'` reference in `curriculum.test.ts`,
    `books.test.ts`, `subjects.test.ts`, the inngest book fixtures, and
    `test-seed.ts`. Grep `'COMPLETED'` across the repo; none may remain referencing
    book status. **Caution:** `'COMPLETED'` is also used by unrelated enums
    (learning-session / quiz status in `repository.ts` and `quiz/queries.ts`) — the
    sweep targets **only** `BookProgressStatus` consumers; do **not** remove the
    session/quiz `COMPLETED` references.
  **done when:** `subjects.test.ts` accepts the three-value enum + a `masteredAt`
  field and rejects `'COMPLETED'` and `'UNKNOWN'`; `grep -r "'COMPLETED'"` returns no
  book-status sites; `pnpm exec nx run api:typecheck` passes.

- [ ] **T13: Add the sticky `mastered_at` column to books.**
  Add `masteredAt: timestamp('mastered_at', { withTimezone: true })` (nullable) to
  `curriculumBooks` in `packages/database/src/schema/subjects.ts` (~line 130-152).
  Append it to the **same** migration file as T1/T1b (the T1b book backfill populates
  history; the runtime stamp is written by **T2's** whole-set re-evaluation, not by
  `computeBookStatus`).
  **done when:** `pnpm run db:push:dev` applies clean and the Drizzle row type
  exposes `curriculumBooks.masteredAt: Date | null`. Rollback: see **Rollback**.

- [ ] **T14: `computeBookStatus` reads the flag + emits the 3-value schedule status.**
  In `apps/api/src/services/curriculum.ts:404-511` (and the batch variant
  `computeBookStatusesBatch`). This function is now a **pure reader** — it does NOT
  stamp (stamping moved to T2):
  - **Signature change required — the function has no book identity today.**
    `computeBookStatus(db, profileId, topicIds)` (line 404-408) receives only topic IDs
    and never queries `curriculum_books`, so it cannot "pass through" `masteredAt` as-is.
    Pass `bookId` (and/or the loaded `curriculum_books.masteredAt`) into the function and
    update its caller(s). The batch variant `computeBookStatusesBatch` already has
    `bookId` via the `topicsByBook` keys (line 527), so add one `curriculum_books.masteredAt`
    select keyed by those bookIds. Without this the function has no `masteredAt` to return.
  - Add `masteredAt` to the `retentionRows` select (line 441) so the per-topic mastered
    set is available.
  - `masteredTopicCount` = count of non-skipped topics whose card has
    `masteredAt != null` → return it for the bar.
  - **Schedule status (single enum slot), precedence:** `REVIEW_DUE` if the book has
    ≥1 due retention card (`nextReviewAt <= now` across **all** its cards, not gated
    on full completion — refinement per decision #7); else `IN_PROGRESS` if any topic
    is touched (started/has a card/completed); else `NOT_STARTED`. **Never** emit a
    mastery value here.
  - Return `masteredAt` (the book's sticky flag, pass-through from the column) so the
    view composes the Mastered badge independently of the schedule status. A book with
    `masteredAt` set AND a due card returns `{ status: 'REVIEW_DUE', masteredAt: <ts> }`
    — both signals present, neither hidden.
  - "Non-skipped" = `curriculum_topics.skipped = false` (`subjects.ts:189`), resolved
    at read time.
  **done when:** `curriculum.test.ts` proves: (a) a book with `masteredAt` set returns
  it pass-through with `status` reflecting the schedule (`IN_PROGRESS`/`REVIEW_DUE`),
  never a mastery status value; (b) a book with all topics loose-completed but **not**
  verified returns `masteredAt: null` (strict — it is Learning); (c) a book with
  `masteredAt` set **and** a due card returns `status: 'REVIEW_DUE'` AND non-null
  `masteredAt` simultaneously (orthogonality preserved); (d) a partially-done book with
  a due card now returns `REVIEW_DUE` (refinement — no longer hidden).

- [ ] **T15: BookCard composes Mastered badge + schedule label + review overlay + bar.**
  In `apps/mobile/src/components/library/BookCard.tsx`:
  - Remove `COMPLETED` from `STATUS_STYLES`/`STATUS_LABELS` (lines 14-26); the maps
    now cover only `NOT_STARTED`/`IN_PROGRESS`/`REVIEW_DUE`, routed through i18n (T10).
  - Render the **Mastered badge from `book.masteredAt != null`**, independently of the
    schedule label — so a Mastered book with `status: 'REVIEW_DUE'` shows **both** the
    Mastered badge and the review overlay (the orthogonality the model is built on).
  - Render the same three-segment bar as ShelfRow (mastered solid / learning lighter /
    untouched track) from `masteredTopicCount` / `completedTopicCount` / `topicCount`.
  **done when:** a BookCard test asserts: a fully-mastered book shows the Mastered
  badge + 3-segment bar; a mastered book with a due card shows the Mastered badge AND
  the review overlay **together**; and no code path references a `COMPLETED` label.

### Phase 2 — Make the climb legible (follow-on; not required to ship P1)

- [ ] **T11: Per-topic "strong reviews" progression on the topic screen.**
  In `apps/mobile/src/components/library/TopicHeader.tsx` (near the retention pill,
  lines 77-85) render a small ring/fraction that fills
  `consecutiveSuccesses / THRESHOLD`, where `THRESHOLD` is the value
  `isTopicStable()` uses at `apps/api/src/services/retention-data.ts:1593` (surface
  the threshold via the topic-progress payload rather than hardcoding the number, so
  the UI never drifts from the server's mastery bar). Show "Mastered" (filled) once
  `masteredAt` is set; never show the number decreasing (decision #5).
  Requires extending `topicProgressSchema` (`packages/schemas/src/progress.ts:251-291`)
  with `strongReviews: number` + `strongReviewsTarget: number` + `masteredAt` and
  populating them in `getTopicProgress`.
  **done when:** a TopicHeader test renders "2/3 strong reviews" for a learning topic
  and "Mastered" for a topic with `masteredAt` set, and the topic-progress service
  test asserts the new fields.

---

## Rollback (T1 / T1b / T13 migration)

- **Reversible?** Yes. The migration **adds** two nullable columns
  (`retention_cards.mastered_at`, `curriculum_books.mastered_at`) plus a forward-only
  backfill `UPDATE` (T1b). No column is dropped, no data destroyed.
- **Recovery procedure for the book column (T13):**
  `ALTER TABLE curriculum_books DROP COLUMN mastered_at;`. Book mastery is fully
  re-derivable from topic state on the next `computeBookStatus` call, so dropping it
  only loses the *sticky* property until each book re-qualifies — acceptable.
- **Data lost on rollback?** Only the `mastered_at` stamps written since deploy.
  Re-derivation is **partial, not guaranteed**: `mastered_at` only re-stamps when a
  card *enters* `verified` again (T2). A card that is already `verified` and stable
  may never fire that transition, so a topic mastered before rollback, dropped by
  rollback, and never reviewed again stays un-mastered **indefinitely**. The
  forward backfill (T1b) is a migration-time operation and does **not** re-run on
  rollback-then-re-apply unless the migration is re-executed. Do not trust
  re-derivation to recover the count — in practice this is a dev-only rollback;
  in production, prefer fixing forward over rolling this column back.
- **Recovery procedure:** `ALTER TABLE retention_cards DROP COLUMN mastered_at;`
  (dev: regenerate via `db:generate:dev`). Production rollback must go through a
  committed down-migration + `drizzle-kit migrate`, never `push`.

---

## Validation (whole plan)

- API: `pnpm exec nx run api:typecheck && pnpm exec nx run api:test`
- Integration (T2/T3/T4 touch `apps/api/`): `pnpm exec nx test:integration api`
- Mobile: `cd apps/mobile && pnpm exec tsc --noEmit`; targeted
  `pnpm exec jest --findRelatedTests <changed files> --no-coverage`
- i18n: `pnpm check:i18n && pnpm check:i18n:orphans`
- `bash scripts/check-change-class.sh --branch` before commit (schema + i18n + API
  classes will all fire here).

## Open UX knob (the one thing genuinely yours to turn)

The three-segment **bar** is the primary encoding and is decided. The only soft
choice is the **subtitle wording** — current proposal leads with the earned state
("8 mastered · 10 learning", untouched implied by the bar). Your earlier instinct
was to spell out all three ("0 mastered · 2 learning · 31 to start"). Both are
one-line i18n changes in T6/T10; the plan ships the compact form and you can
redirect the wording without touching logic.
