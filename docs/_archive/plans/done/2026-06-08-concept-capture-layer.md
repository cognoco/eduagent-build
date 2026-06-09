---
title: Concept-Capture Layer — Implementation Plan
date: 2026-06-08
profile: code
spec: docs/specs/2026-06-08-concept-capture-layer-design.md
adr: docs/adr/MMT-ADR-0017-concept-capture-additive-layer.md
branch: conceptgrain
status: parked
---

# Concept-Capture Layer — Implementation Plan

> **PARKED 2026-06-08 — hold until the identity-foundation baseline reset.** The
> core code is built and committed on `conceptgrain`, but migration `0107`
> (`concepts` / `concept_mastery`) is now **reference-only** — its FKs target
> `profiles`, which the **one-time baseline reset** (`MMT-ADR-0012`) renames to
> `person`, and the reset rebuilds the schema create-from-empty, discarding the
> numbered chain. Decision (2026-06-08): **do not apply `0107` anywhere, do not
> finish to dev/live now.** Re-home `concepts` / `concept_mastery` into the new
> baseline at reset time, FKs targeting `person`. The note-correctness nudge
> (this plan's T11–T13) is **superseded** by
> `2026-06-08-note-correctness-and-challenge-draft.md` (also parked). See
> `docs/canon/identity/data-model.md §1`, `docs/adr/MMT-ADR-0012`, and the
> `0107` reference-only header.

**Goal:** Add an additive concept-grain mastery layer that durably records **every** per-concept Challenge-Round verdict (solid *and* weak), and derives a read-time note "star," a neutral topic-level tutor-addition affordance, concept-focused review, and a note-correctness nudge — without re-keying the topic-grained spine.

**Approach:** Two new per-profile tables (`concepts` identity + `concept_mastery` state) written side-by-side with the unchanged `needs_deepening_topics` write at Challenge-Round finalize, captured from the **enriched evaluation list** (not `MasteryDecision`, which drops `missing`). All reads are derived; `topic_notes`/`retention_cards`/`assessments` are untouched. Capture and the new notification are non-core (`safeWrite`/`safeSend`) so a failure never breaks Challenge-Round completion or the note save.

## Scope

In scope:
- `packages/database/src/schema/concept-mastery.ts` (new) + barrel `packages/database/src/schema/index.ts`
- `apps/api/drizzle/0107_*.sql` (generated migration) + `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/services/concept-capture.ts` (new — capture write)
- `apps/api/src/services/concept-mastery.ts` (new — read-side derivation)
- `apps/api/src/services/session/session-exchange.ts` (wire capture into `finalizeChallengeRoundIfReady`)
- `apps/api/src/services/session/session-summary.ts` (note-correctness nudge hook)
- `apps/api/src/inngest/functions/note-correctness-send.ts` (new Inngest fn) + Inngest registration + event-schema declaration
- `apps/api/src/routes/notes.ts` (new `GET /notes/concept-mastery` endpoint)
- `packages/schemas/src/concept-mastery.ts` (new response schema) + `packages/schemas/src/index.ts` barrel
- `apps/mobile/src/...` library note surfaces (star indicator + neutral tutor-addition disclosure) + a `useConceptMasterySignals` query hook
- `docs/architecture.md` "Knowledge Retention" amendment (lockstep with MMT-ADR-0017)

Out of scope (must not change):
- `packages/database/src/schema/notes.ts`, `assessments.ts` (`retention_cards`, `assessments`, `topic_notes` columns) — **no schema changes**
- `decideMasteryAndReview()` / `persistChallengeRoundReviewTargets()` / `needs_deepening_topics` write logic
- `packages/retention/src/sm2.ts` (review scheduling is reused, not changed)
- Deferred slices: relevance/connection nudge, cross-subject graph, two-axis confidence, per-concept trajectory log, note-text grading, archive tier

## Tasks

### Phase 0 — De-risk the supersession assumption (build blocker)

- [x] **T1** (design): Confirm a Challenge Round re-decomposes a topic's **full** current concept set each time, not an arbitrary subset. Read the challenge-round prompt builder and the evaluation construction that fills `challengeRound.evaluations` in `session-exchange.ts`; trace where the LLM's `challenge_round_evaluation` array is sized/capped (`llm-envelope.ts:265` caps at 10). — **decision (b), recorded 2026-06-08:** partial subsets are possible in the current conversational Challenge Round shape. The active prompt asks one deeper question at a time and caps the round; it does not prove every topic concept is re-evaluated. T6 must therefore use an **explicit per-round marker**: stamp `lastEvaluatedAt` for this capture round and only supersede rows whose `lastEvaluatedAt` is strictly older than the current round *and* whose concept is not in the evaluated set. Offered, declined, ignored, timed-out, or aborted rounds are not evidence and must not write or supersede concept mastery. Record the same decision in `concept-capture.ts`'s header comment.

### Phase 1 — Data model + migration

- [x] **T2** (code): Add the two tables and enum in a new schema module `packages/database/src/schema/concept-mastery.ts`, exported through the barrel. Shape is the decision — implement exactly:

  ```ts
  import {
    pgTable, uuid, text, timestamp, pgEnum, unique, index,
  } from 'drizzle-orm/pg-core';
  import { profiles } from './profiles';
  import { subjects, curriculumTopics } from './subjects';
  import { learningSessions } from './sessions';
  import { generateUUIDv7 } from '../utils/uuid';

  export const conceptMasteryStatusEnum = pgEnum('concept_mastery_status', [
    'solid', 'partial', 'missing', 'misconception',
  ]);

  export const concepts = pgTable(
    'concepts',
    {
      id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
      profileId: uuid('profile_id').notNull()
        .references(() => profiles.id, { onDelete: 'cascade' }),
      subjectId: uuid('subject_id').notNull()
        .references(() => subjects.id, { onDelete: 'cascade' }),
      topicId: uuid('topic_id').notNull()
        .references(() => curriculumTopics.id, { onDelete: 'cascade' }),
      label: text('label').notNull(),
      normalizedLabel: text('normalized_label').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      unique('concepts_profile_topic_label_unique').on(t.profileId, t.topicId, t.normalizedLabel),
      index('concepts_profile_topic_idx').on(t.profileId, t.topicId),
      index('concepts_profile_id_idx').on(t.profileId),
    ],
  );

  export const conceptMastery = pgTable(
    'concept_mastery',
    {
      id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
      conceptId: uuid('concept_id').notNull()
        .references(() => concepts.id, { onDelete: 'cascade' }),
      profileId: uuid('profile_id').notNull()
        .references(() => profiles.id, { onDelete: 'cascade' }),
      status: conceptMasteryStatusEnum('status').notNull(),
      verifiedAt: timestamp('verified_at', { withTimezone: true }),
      lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }).notNull(),
      supersededAt: timestamp('superseded_at', { withTimezone: true }),
      sourceSessionId: uuid('source_session_id')
        .references(() => learningSessions.id, { onDelete: 'set null' }),
      learnerQuote: text('learner_quote'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      unique('concept_mastery_concept_unique').on(t.conceptId),
      index('concept_mastery_profile_id_idx').on(t.profileId),
    ],
  );
  ```

  — **done when:** `pnpm exec nx run database:typecheck` passes and `concepts` + `conceptMastery` + `conceptMasteryStatusEnum` are re-exported from `@eduagent/database` (verified by an import in T3 compiling). Note the standalone `concepts_profile_id_idx` mirrors the BUG-393/migration-0086 house pattern.

- [ ] **T3** (change): Generate the forward migration from the schema. Run `pnpm run db:generate:dev` to emit `apps/api/drizzle/0107_<name>.sql` and append its journal entry. — **done when:** the generated SQL contains exactly `CREATE TYPE "public"."concept_mastery_status"`, `CREATE TABLE "concepts"`, `CREATE TABLE "concept_mastery"`, their two unique constraints, the three indexes, and the FK constraints — **and contains no `DROP` / `ALTER ... DROP` against any existing table** (grep the file: zero `DROP` lines). `pnpm run db:migrate:dev` applies cleanly against the dev DB and re-running `db:generate:dev` produces no further diff (round-trip clean). **Rollback:** drop `concept_mastery`, then `concepts`, then the enum — safe, pre-launch the data is test-only and no shipped surface depends on these tables (star/correction degrade to neutral, review unaffected); no production data loss. Record this Rollback note verbatim in the migration plan/commit per Schema-And-Deploy-Safety rules. — **status 2026-06-08:** generated `0107_gorgeous_cardiac.sql`; zero `DROP` matches; `db:generate:dev` round-trip reports no schema changes. `db:migrate:dev` is still blocked by unrelated dev DB drift on `learning_profiles.recently_resolved_topics` already existing, so this stays unchecked until the drift is reconciled through the normal dev migration path.

### Phase 2 — Capture (write side)

- [x] **T4** (code): New module `apps/api/src/services/concept-capture.ts` exporting `captureConceptMastery(db, profileId, session, topicId, evals, now)`. Iterate the **enriched `evals: ChallengeRoundEvaluationItem[]`** (the same array passed into `decideMasteryAndReview`, carrying real `learnerQuote` for all four statuses) — never `MasteryDecision`. For **every** item (solid, partial, missing, misconception):
  1. Compute `normalizedLabel = label.toLowerCase().replace(/\s+/g, ' ').trim()`.
  2. Upsert `concepts` on conflict `(profileId, topicId, normalizedLabel)` (`onConflictDoUpdate` setting `label`, `updatedAt`), `.returning({ id })`.
  3. Upsert `concept_mastery` on conflict `(conceptId)` with: `status = item.result`; `lastEvaluatedAt = now` (always); `supersededAt = null` (always — re-eval un-supersedes); `sourceSessionId = session.id`; `learnerQuote = item.learnerQuote`; and `verifiedAt = item.result === 'solid' ? now : <keep prior>` — in `onConflictDoUpdate.set`, only assign `verifiedAt: now` when solid, otherwise omit the key so the existing value is untouched (insert path sets `verifiedAt = item.result === 'solid' ? now : null`).
  4. Enforce `profileId` on every insert/upsert (parent-chain ownership rule). `session.subjectId` is guaranteed non-null at this call site (see T7); pass it to `concepts.subjectId`.

  — **done when:** the capture-integration test in `## Tests → T4/T6` passes (real DB, mixed-verdict round writes one `concepts` + one `concept_mastery` per evaluated concept; solid sets `verifiedAt`, weak leaves it null). No internal mocks (GC1/GC6) — use the real DB and real evaluation path.

- [x] **T5** (code): `missing`-verdict guard. Add the dedicated capture test asserting a round whose evaluated set includes a `missing` concept writes a `concept_mastery` row with `status = 'missing'`. — **done when:** `apps/api/src/services/concept-capture.integration.test.ts` includes this case and it passes; it fails if capture is ever refactored to read `MasteryDecision` (which omits `missing`). This is the red-green guard for the headline signal-loss fix.

- [x] **T6** (code): Supersession sweep inside `captureConceptMastery`, **after** upserting this round's concepts and per the T1 decision. Implement **decision (b)** only: in one scoped statement, set `supersededAt = now` on every `concept_mastery` row joined to `concepts` under `(profileId, topicId)` whose `conceptId` is **not** in this round's evaluated `conceptId` set, whose `supersededAt IS NULL`, and whose `lastEvaluatedAt < now` (strictly older round). Never sweep across topics. Never run this sweep for offered, declined, ignored, timed-out, or aborted rounds; capture is completion-gated on validated Challenge-Round evaluations only. — **done when:** the supersession/star-recovery test (`## Tests → T4/T6`) passes: round 1 emits weak concept "X"; round 2 re-decomposes without "X", all-solid → the round-1 row gets `supersededAt` set and is excluded from the star gate.

- [ ] **T7** (code): Wire capture into `finalizeChallengeRoundIfReady` (`apps/api/src/services/session/session-exchange.ts:791`). After the existing `if (decision.markMasteryVerified) {…} else {…}` block (both branches), call capture **unconditionally** so solid-only rounds are also recorded, wrapped non-core:
  ```ts
  if (session.subjectId) {
    await safeWrite(
      () => captureConceptMastery(db, profileId, session, topicId, evaluations, now),
      'challenge-round.concept-capture',
      { profileId, sessionId: session.id, topicId },
    );
  }
  ```
  Import `safeWrite` from `../safe-non-core` and `captureConceptMastery` from `../concept-capture`. The existing `needs_deepening_topics` write is unchanged. — **done when:** the capture-resilience test passes (a simulated capture-write failure — e.g. forcing `captureConceptMastery` to reject — does **not** throw out of Challenge-Round completion; the note/mastery/review outcomes are unaffected). Confirm here that `evaluations` at this call site is the enriched array (real `learnerQuote`): if it is the pre-validation array, route capture off the same validated list `decideMasteryAndReview` consumes and note the source in the function header.

### Phase 3 — Read side: star + tutor-addition signal

- [x] **T8** (code): New schema `packages/database/src/schema`-consuming service `apps/api/src/services/concept-mastery.ts` exporting `getConceptMasterySignalsForTopics(db, profileId, topicIds): Promise<Map<string, ConceptMasterySignal>>` where `ConceptMasterySignal = { verified: boolean; hasTutorAddition: boolean; tutorAdditions: string[] }`. Logic per topic:
  - Load `concept_mastery` joined to `concepts` for `(profileId, topicId)` **where `superseded_at IS NULL`** (live set), scoped to `profileId`.
  - `verified` = at least one live concept exists **and** all live concepts are `solid`.
  - `hasTutorAddition` = any live concept is non-`solid`.
  - `tutorAdditions` = distinct `needs_deepening_topics.correction` strings for `(profileId, topicId)` with status in `('active','pending_review')` and non-null `correction` (reuses existing data; topic-level, neutral — **never** attributed to the note). Empty array when none.
  - Topics with no captured concepts return no map entry (caller treats as neutral: no star, no addition). Use `createScopedRepository(profileId)` or an explicit `profileId` WHERE on every table touched.
  — **done when:** the star-derivation test passes: all-solid topic → `verified:true, hasTutorAddition:false`; mixed → `verified:false, hasTutorAddition:true` with corrections populated; a stale superseded weak concept does **not** block `verified`. **Break test:** a read with another profile's `profileId` returns no entry for the first profile's topics (scoped-read negative path).

- [x] **T9** (code): Response schema + endpoint. Add `packages/schemas/src/concept-mastery.ts` with `conceptMasterySignalSchema` (`{ verified: z.boolean(), hasTutorAddition: z.boolean(), tutorAdditions: z.array(z.string()) }`) and `conceptMasterySignalsResponseSchema = z.object({ signals: z.record(z.string().uuid(), conceptMasterySignalSchema) })`, exported via the schemas barrel. Add `GET /notes/concept-mastery` to `apps/api/src/routes/notes.ts` (sibling of `/notes/topic-ids`): accept `topicIds` as a comma-separated query (validate each as uuid, cap at 100), call `getConceptMasterySignalsForTopics`, return `conceptMasterySignalsResponseSchema.parse({ signals })`. Use `requireProfileId`; read-only so no `assertNotProxyMode`. — **done when:** `apps/api/src/routes/notes.test.ts` covers the endpoint (returns signals for owned topics; empty `{}` for topics with no capture) and passes; `pnpm exec nx run api:typecheck` passes.

- [x] **T10** (ui): Mobile star + neutral tutor-addition disclosure. Add a TanStack-Query hook `useConceptMasterySignals(topicIds: string[])` (in the library data-hooks dir) hitting `GET /notes/concept-mastery` via the typed RPC client. In the topic-note surfaces (`apps/mobile/src/components/library/NoteDisplay.tsx` and/or `InlineNoteCard.tsx`) render: a **star** icon when `signals[topicId]?.verified` (accessible label "verified — your words held up"); and when `hasTutorAddition`, a collapsed, neutral affordance ("The tutor has more on this topic") that, opened by choice, shows `tutorAdditions` **layered beside** the note — never merged, never framed as a correction *of* the note. Absence of the star is neutral (no "wrong" mark) per the no-struggle copy rule. Route all copy through `t('…')` with new `en.json` keys. — **done when:** component tests for the star-present / star-absent / addition-disclosure states pass (`pnpm exec jest --findRelatedTests <changed files> --no-coverage`), and the new i18n keys exist in `en.json` (no forward orphans).

### Phase 4 — Concept-targeted review focus

- [ ] **T11** (code): When a due topic's recall is assembled and it has `needs_deepening_topics` rows with status `active`/`pending_review`, focus the recall prompt on those concepts rather than the whole topic. This leans on **existing** `needs_deepening_topics` data only — `concept_mastery` is not required and `retention_cards` stays topic-grained (no new timer). Locate the recall/review prompt-assembly path that reads a due topic and inject the open weak-concept labels into its concept-focus input. — **done when:** a unit test on that assembly function asserts that, given a topic with two `active` weak concepts, the produced recall focus includes those concept labels (and is unchanged when there are none). If no single assembly seam exists, record the chosen injection point in the plan before implementing — do not scatter the logic.

### Phase 5 — Note-correctness notification + sooner review

- [ ] **T12** (code): New non-core Inngest function `apps/api/src/inngest/functions/note-correctness-send.ts` on a new event `app/notes.note-correctness-due` (declare the event in the Inngest event-schema map and register the function in the functions index, mirroring `review-due-send.ts`). It sends one push inviting the learner to **compare** their note with the tutor's version — copy strictly neutral ("compare with the tutor's note," never "you got it wrong"), within the no-struggle rule. Reuse the notification/rate-limit infrastructure (`sendPushNotification`, `checkAndLogRateLimitInternal`) and the fail-closed-on-DB-error pattern from `review-due-send.ts`. — **done when:** an Inngest function test (same style as the review-due tests) asserts a `note-correctness-due` event produces exactly one push for an eligible profile and is idempotent on `event.id`; `pnpm exec nx run api:typecheck` passes.

- [ ] **T13** (code): Hook the nudge into the note-finalize path in `apps/api/src/services/session/session-summary.ts` (the `createNoteForSession` block, ~line 274). After the note is created, check the topic's **live** (`superseded_at IS NULL`) `concept_mastery` via `getConceptMasterySignalsForTopics`:
  - If any live concept is non-`solid` → dispatch `app/notes.note-correctness-due` through `safeSend()` (`services/safe-non-core.ts`) so a dispatch failure is captured in Sentry but never breaks the note save.
  - **Dedup:** suppress this nudge if a `review_reminder` (review-due) notification for the same `(profileId, topicId)` was sent — or is scheduled — within a 24h window (reuse the rate-limit/notification-log lookup the review path uses, keyed on the topic). The review-due nudge already carries the learner back to the topic.
  - **"Review due soon" is implicit, not a new scheduler:** a non-`solid` Challenge-Round verdict already drives a low SM-2 quality that shortens `retention_cards.nextReviewAt` to ~1 day. This task only surfaces that — it does **not** add a second timer or touch `sm2.ts`.
  - All-`solid` → no nudge (the note earns its star).
  — **done when:** the note-correctness integration test passes: finalizing a note whose topic has a non-`solid` live concept enqueues exactly one nudge **and** `nextReviewAt` is within ~1 day; an all-`solid` topic enqueues none; if a review-due nudge for the same topic was sent within 24h the note-correctness nudge is suppressed; a simulated dispatch failure does not block the note save (non-core break test).

### Phase 6 — Canon lockstep + validation

- [x] **T14** (change): Amend `docs/architecture.md` "Knowledge Retention" section (lockstep with MMT-ADR-0017) to record that mastery is now **captured** at concept grain additively while the **scheduled** spine (`retention_cards`, `assessments`, progress) stays topic-keyed. Ships in this change-set with the implementation. — **done when:** the architecture.md amendment text exists and `scripts/check-decision-adr-link.ts` (decision-adr-link job) passes for any decision block this introduces (MMT-ADR-0017 already linked).

- [ ] **T15** (change): Full validation gate before declaring done. — **done when:** all pass: `pnpm exec nx run api:lint`, `pnpm exec nx run api:typecheck`, `pnpm exec nx run api:test`, **`pnpm exec nx test:integration api`** (required for any `apps/api/` change — hooks skip `.integration.test.`), `pnpm exec nx lint mobile`, and `cd apps/mobile && pnpm exec tsc --noEmit`. The i18n checks (`scripts/check-i18n-orphan-keys.ts`) pass for the new mobile copy. No `eslint-disable`, no new internal `jest.mock('./…')` (GC1).

## Tests

### T4/T6 — `apps/api/src/services/concept-capture.integration.test.ts` (real DB, no internal mocks)

Seed a profile, subject, book, topic, and a learning session bound to the subject. Build enriched `ChallengeRoundEvaluationItem[]` with real `answerEventId`s and `learnerQuote`s.

- **mixed-verdict capture:** evals = `[solid A, partial B, missing C, misconception D]` → after `captureConceptMastery`: 4 `concepts` rows under `(profileId, topicId)`, 4 `concept_mastery` rows; A has `verifiedAt` set, B/C/D have `verifiedAt = null`; every row's `status` matches its `result`; `learnerQuote` populated for all four; `supersededAt = null` on all.
- **`missing` guard (T5):** the `C` row above has `status = 'missing'` — assert explicitly (guards against capturing from `MasteryDecision`).
- **dedup:** two evals emitting the same `normalizedLabel` (e.g. "ATP" and "ATP ") under one `(profileId, topicId)` → a single `concepts` row.
- **supersession / star recovery (T6):** round 1 evals = `[partial X]`; then round 2 evals = `[solid Y, solid Z]` (re-decomposition without X) → the X `concept_mastery` row now has `supersededAt` set; `getConceptMasterySignalsForTopics` returns `verified:true` for the topic (X no longer suppresses the star).
- **re-eval un-supersedes:** after the round-2 supersession, a round 3 that re-emits `partial X` clears X's `supersededAt` back to null and sets `status='partial'`.
- **resilience (T7):** with capture forced to throw, `finalizeChallengeRoundIfReady` still returns its normal outcome and the `assessments`/`needs_deepening_topics`/note writes are intact.

### T8 — `getConceptMasterySignalsForTopics` (real DB)

- all-solid topic → `{ verified:true, hasTutorAddition:false, tutorAdditions:[] }`.
- mixed topic with a `needs_deepening_topics` correction → `{ verified:false, hasTutorAddition:true, tutorAdditions:[<correction>] }`.
- topic with a superseded weak concept but all live concepts solid → `verified:true`.
- topic with no captured concepts → no map entry.
- **scoped-read break test:** calling with a different `profileId` returns no entry for the first profile's topics.

## Open Items (carried from spec; resolve during build)

- **T1 resolved:** current Challenge Rounds are not proven full-set decompositions. T6 uses explicit-marker supersession (`lastEvaluatedAt < now`) and capture stays completion-gated.
- Confirm `evaluations` at `finalizeChallengeRoundIfReady` is the enriched (real-`learnerQuote`) array (T7); if not, source capture from the validated list `decideMasteryAndReview` consumes.
- `architecture.md` "Knowledge Retention" amendment text is authored in T14 (lockstep, ships with implementation).
