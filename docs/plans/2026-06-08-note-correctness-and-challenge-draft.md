---
title: Note-Correctness Check + Challenge-Saved Note — Implementation Plan
date: 2026-06-08
profile: code
spec: docs/glossary.md §4 (Two stars / Note marks — settled 2026-06-08)
status: parked
---

# Note-Correctness Check + Challenge-Saved Note — Implementation Plan

> **PARKED 2026-06-08 — execute on the post-reset baseline, not now.** This plan is
> net-new code against today's `profiles` schema, which the identity-foundation
> **one-time baseline reset** (`MMT-ADR-0012`) renames to `person`. Building it now
> would accrue full re-home cost at the reset, and A is polish (not launch-critical).
> Design is settled and kept as-is; **execution waits until the new baseline exists**,
> so `note_correctness` and `topic_notes.source` are born on `person`. Any migration
> step here follows the 0107 posture — `db:push:dev` / author into the baseline at
> reset — **never generate a numbered migration into the pre-reset chain.** See
> `docs/canon/identity/data-model.md §1` and `docs/adr/MMT-ADR-0012`.
>
> **Boundary with freeform Ask Anything:** this plan is topic-bound. It covers
> `topic_notes` and Challenge-Round-derived notes for sessions that already have a
> real `topicId`. It does not amend `MMT-ADR-0021`: freeform Ask Anything still
> has no Challenge Round and no learner-note flow.

**Goal:** Give a `learner-note` at most one provenance mark — a **green checkmark**
when the mentor grades the learner's hand-typed note text correct (model A), or a
**MentoMate logo** when the note was saved (lightly tidied) from the learner's
`solid` Challenge-Round answers — while the **mastery star (B)** moves off the
note to the topic/book "mastered" badge.

**Approach:** Two independent arms. **Arm 1** (checkmark): a new additive
`note_correctness` table + an async Inngest grader that scores a note's text
against its session/topic context via the structured LLM envelope; the mark is
derived read-side. **Arm 2** (logo): add a `source` column to `topic_notes`
(resolving the §4 "no source column" trap), then finish wiring the already-built
`buildValidatedDraft` through the lexical guard + a "save your answers?" prompt to
`createNoteForSession({ source: 'challenge_draft' })`. Both grading and the nudge
are non-core (`safeSend`) so failure never blocks a note save.

## Scope

In scope:
- `packages/database/src/schema/note-correctness.ts` (new) + barrel `index.ts`
- `packages/database/src/schema/notes.ts` (add `source` column to `topic_notes`)
- ~~`apps/api/drizzle/0108_*.sql` (generated migration)~~ — **dropped (migration-hold, see T3):** no numbered migration pre-reset; schema folds into the post-reset baseline
- `apps/api/src/services/note-correctness.ts` (new — LLM grading + read-side signal)
- `apps/api/src/services/note-correctness-prompts.ts` (new — grading prompt)
- `apps/api/src/inngest/functions/note-correctness-grade.ts` (new Inngest fn) + registration + event-schema declaration
- `apps/api/src/services/notes.ts` (dispatch grade event on create/update; accept `source`)
- `apps/api/src/routes/notes.ts` (dispatch on POST/PATCH; extend signals endpoint)
- `apps/api/src/services/session/session-exchange.ts` (wire draft save-eligibility) and `apps/api/src/services/challenge-round/note-draft.ts` (`validateNoteDraft` lexical guard — wire + re-add guard test)
- `packages/schemas/src/notes.ts` (note `source`, `correctness` response fields)
- `apps/mobile/src/components/library/NoteDisplay.tsx` / `InlineNoteCard.tsx` (render checkmark / logo; remove concept-mastery star from note)
- `apps/mobile/src/components/session/**` (the "save your answers as your note?" prompt)
- `packages/schemas` + `en.json` (copy keys)

Out of scope (must not change):
- `assessments`, `retention_cards`, `concepts`/`concept_mastery` write logic — B is untouched
- SM-2 scheduling (`packages/retention/src/sm2.ts`)
- The mastery-star derivation itself (only its *placement* changes — star leaves the note surface)

## Tasks

### Phase A1 — Hand-typed note → green checkmark (model A)

- [ ] **T1** (code): Add `note_correctness` in a new schema module `packages/database/src/schema/note-correctness.ts`, exported through the barrel. Shape is the decision:

  ```ts
  import {
    pgTable, uuid, text, timestamp, pgEnum, jsonb, unique, index,
  } from 'drizzle-orm/pg-core';
  import { profiles } from './profiles';
  import { topicNotes } from './notes';
  import { generateUUIDv7 } from '../utils/uuid';

  export const noteCorrectnessStatusEnum = pgEnum('note_correctness_status', [
    'correct', 'has_issues',
  ]);

  // issues: [{ quote: <span of the learner's note>, correction: <right version> }]
  export const noteCorrectness = pgTable(
    'note_correctness',
    {
      id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
      noteId: uuid('note_id').notNull()
        .references(() => topicNotes.id, { onDelete: 'cascade' }),
      profileId: uuid('profile_id').notNull()
        .references(() => profiles.id, { onDelete: 'cascade' }),
      status: noteCorrectnessStatusEnum('status').notNull(),
      issues: jsonb('issues').notNull().default([]),
      gradedContentHash: text('graded_content_hash').notNull(),
      gradedAt: timestamp('graded_at', { withTimezone: true }).notNull().defaultNow(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      unique('note_correctness_note_unique').on(t.noteId),
      index('note_correctness_profile_id_idx').on(t.profileId),
    ],
  );
  ```

  `gradedContentHash` (sha256 of the note content at grade time) lets the read
  side treat a verdict as **stale** when the note has since been edited — a
  stale verdict shows no mark until re-graded. — **done when:** `pnpm exec nx run
  database:typecheck` passes and `noteCorrectness` + the enum re-export from
  `@eduagent/database` (verified by the T4 import compiling).

- [ ] **T2** (change): Add a `source` column to `topic_notes` in
  `packages/database/src/schema/notes.ts`:
  ```ts
  export const topicNoteSourceEnum = pgEnum('topic_note_source', [
    'manual', 'reflection', 'challenge_draft',
  ]);
  // inside topicNotes:
  source: topicNoteSourceEnum('source').notNull().default('manual'),
  ```
  This resolves the glossary §4 trap ("`topic_notes` written by 3 flows, no
  `source` column"). Existing rows default to `'manual'`. — **done when:**
  `database:typecheck` passes; the column is `NOT NULL DEFAULT 'manual'` so the
  migration backfills existing rows without a separate UPDATE.

- [ ] **T3** (change): **Migration-hold posture (parked-plan amendment 2026-06-08).**
  Do **NOT** generate a numbered `0108` migration into the pre-reset chain — the
  identity-foundation baseline reset (`MMT-ADR-0012`) discards it and renames the
  `profiles` FK target to `person`. Instead: when this plan executes post-reset,
  author `note_correctness` + `topic_notes.source` + both enums **into the new
  `person`-based baseline** (or the first append-only migration after it), FKs
  targeting `person`. For any pre-reset dev iteration, materialize via
  `db:push:dev` only. — **done when:** the schema TS (`note-correctness.ts`,
  `notes.ts`) typechecks and `db:push:dev` applies clean against the dev DB;
  **no `apps/api/drizzle/0108_*.sql` is committed.** (See the PARKED banner above
  and the `0107` reference-only header for the precedent.)

- [ ] **T4** (code): New `apps/api/src/services/note-correctness.ts` exporting
  `gradeNoteCorrectness(db, profileId, noteId): Promise<void>`. Logic:
  1. Load the note (scoped to `profileId`); if absent, return (note deleted).
  2. Build grading context: the note's `sessionId` session summary
     (`session_summaries.llmSummary` / `narrative`) when present, else the topic
     title + subject name (via the parent-chain join, `subjects.profileId` in
     WHERE). Never another profile's data.
  3. Call the mentor via `routeAndCall` with `resolveExchangeLlmRouting(...)` and
     the prompt from `note-correctness-prompts.ts`, parsing the reply with
     `parseEnvelope()` into the structured signal
     `note_correctness_evaluation: { status: 'correct'|'has_issues', issues: [{ quote, correction }] }`
     (add this signal to `llmResponseEnvelopeSchema` in `@eduagent/schemas`).
     **Hard cap:** exactly one LLM call; on parse failure or LLM error, write **no**
     row (note stays neutral) and return — never throw.
  4. `issues` MUST be filtered to spans that are a lexical substring of the note
     (reuse the overlap check from `note-draft.ts`) so a correction can't quote
     text the learner never wrote.
  5. Upsert `note_correctness` on conflict `(noteId)` with `status`, `issues`,
     `gradedContentHash = sha256(note.content)`, `gradedAt = now`. Enforce
     `profileId` on the write.
  — **done when:** the grading integration test (`## Tests → T4`) passes: a
  correct note → one row `status:'correct', issues:[]`; a note with a planted
  error → `status:'has_issues'` with one issue whose `quote` is a substring of the
  note. Mock only the LLM boundary (`routeAndCall`), never the DB.

- [ ] **T5** (code): New non-core Inngest fn
  `apps/api/src/inngest/functions/note-correctness-grade.ts` on event
  `app/notes.correctness-grade-due` (`{ profileId, noteId }`). Declare the event
  in the Inngest event-schema map and register the fn in the functions index. The
  fn calls `gradeNoteCorrectness`; idempotent on `event.id`; fail-closed on DB
  error (mirror `review-due-send.ts`). — **done when:** an Inngest fn test asserts
  one `correctness-grade-due` event grades exactly once and is idempotent;
  `api:typecheck` passes.

- [ ] **T6** (code): Dispatch the grade event from the note write paths. In
  `apps/api/src/routes/notes.ts` POST (`createNote`) and PATCH (`updateNote`)
  handlers, after a successful write, `safeSend('app/notes.correctness-grade-due',
  { profileId, noteId })` (import from `services/safe-non-core`). Only for
  `source === 'manual'` notes — challenge-saved notes get the logo, not the
  checkmark, so they are **not** graded. — **done when:** `notes.test.ts` asserts
  a manual create/update enqueues exactly one grade event and a
  `challenge_draft` note enqueues none; a simulated `safeSend` failure does not
  fail the note write (non-core break test).

- [ ] **T7** (code): Read-side signal. Extend the note response in
  `packages/schemas/src/notes.ts` with `correctness: z.enum(['correct',
  'has_issues']).nullable()` (null = ungraded **or** stale-hash) and `source:
  topicNoteSourceSchema`. In `services/notes.ts`, the note-list/read queries
  left-join `note_correctness` on `noteId` and return `correctness = (row exists
  && gradedContentHash === sha256(content)) ? row.status : null`. — **done when:**
  the read test asserts a freshly-graded correct note returns
  `correctness:'correct'`; an edited-since-grading note returns
  `correctness:null`; a `challenge_draft` note returns `source:'challenge_draft'`.

- [ ] **T8** (ui): Mobile marks. In `NoteDisplay.tsx` / `InlineNoteCard.tsx`:
  render the **green checkmark** when `note.correctness === 'correct'` (a11y
  "verified — your note is correct"); render the **`MentomateLogo`** when
  `note.source === 'challenge_draft'` (a11y "saved from your challenge answers");
  render neither otherwise (neutral). When `correctness === 'has_issues'`, show
  the neutral "the tutor has a note on this" affordance (the `issues[].correction`
  layered beside, never a red ✗). **Remove the concept-mastery star from the note
  surface** (the B/T10 star) — it relocates to the book/topic mastered badge.
  Route copy through `t('…')`. — **done when:** component tests cover
  checkmark-present / logo-present / has-issues / neutral states and pass; no
  forward i18n orphans; a test asserts the note surface no longer renders the
  concept-mastery star.

### Phase A2 — Challenge-saved note → MentoMate logo (lightly tidied)

- [ ] **T9** (code): Wire the lexical hallucination guard. In
  `apps/api/src/services/challenge-round/note-draft.ts`, ensure `validateNoteDraft`
  is applied to the `buildValidatedDraft` output before the draft is shown/saved
  (it sources only `solidAnswerQuotes`; reject/trim spans failing lexical
  overlap). Re-add `note-draft.guard.test.ts`. — **done when:** the guard test
  passes: a draft containing a span absent from the learner's solid answers is
  rejected/stripped; a faithful tidy passes. (Resolves the `notes.ts:237` UNWIRED
  note.)

- [ ] **T10** (code): Save path. Add a `source` param to `createNoteForSession`
  (`services/notes.ts`) threaded into `insertNoteWithCap`. Add a route on
  `notes.ts` — `POST /notes/from-challenge-draft` `{ sessionId }` — that loads the
  validated draft for the session, runs `validateNoteDraft`, and calls
  `createNoteForSession({ ..., source: 'challenge_draft' })`. `requireProfileId`;
  ownership via the existing session→topic check. — **done when:** `notes.test.ts`
  asserts the endpoint creates a `topic_notes` row with `source:'challenge_draft'`
  for an owned session, rejects an unowned session, and does **not** enqueue a
  correctness-grade event (T6 gates on `manual`).

- [ ] **T11** (ui): The save prompt. After a Challenge Round completes and a
  validated draft exists, surface a session-screen prompt "Save your answers as
  your note?" (Save / Edit / Skip). Save → `POST /notes/from-challenge-draft`;
  Edit opens the draft in the note editor pre-filled (saved still as
  `challenge_draft`); Skip dismisses. Copy via `t('…')`. — **done when:**
  component tests cover Save (calls the endpoint), Edit (opens editor pre-filled),
  Skip (no write) and pass; no forward i18n orphans.

### Phase A3 — Note-correctness nudge (reconcile with B's deferred T12/T13)

- [ ] **T12** (code): One note-correctness nudge, keyed on **A's verdict**, not on
  concept mastery — this **supersedes** the concept-capture plan's deferred T12/T13
  (do not build those). New non-core Inngest fn `note-correctness-nudge.ts` on
  `app/notes.correctness-nudge-due`, dispatched via `safeSend` from
  `note-correctness-grade.ts` **only when** the fresh verdict is `has_issues`. Copy
  strictly neutral ("compare your note with the tutor's version" — never "you got
  it wrong"). Dedup: suppress if a `review_reminder` for the same
  `(profileId, topicId)` was sent within 24h (reuse the review-path rate-limit
  lookup). — **done when:** the nudge test asserts exactly one push for a
  `has_issues` note, none for `correct`, idempotent on `event.id`, and suppressed
  inside the 24h review-dedup window.

### Phase A4 — Validation

- [ ] **T13** (change): Full gate. — **done when:** all pass: `pnpm exec nx run
  api:lint`, `api:typecheck`, `api:test`, **`pnpm exec nx test:integration api`**,
  `pnpm exec nx lint mobile`, `cd apps/mobile && pnpm exec tsc --noEmit`, and
  `scripts/check-i18n-orphan-keys.ts`. No `eslint-disable`; no new internal
  `jest.mock('./…')` (GC1); the structured signal goes through the envelope
  (`parseEnvelope`), never a `[MARKER]` or raw-JSON blob.

## Tests

### T4 — `apps/api/src/services/note-correctness.integration.test.ts` (real DB, LLM boundary mocked)
Seed profile → subject → book → topic → session + summary; insert a manual note.
- **correct note:** `routeAndCall` returns an envelope with
  `note_correctness_evaluation { status:'correct', issues:[] }` → one
  `note_correctness` row, `status:'correct'`, `issues:[]`, `gradedContentHash` =
  sha256(content).
- **note with a planted error:** envelope returns `has_issues` with an issue whose
  `quote` is a substring of the note → row `status:'has_issues'`, one issue.
- **hallucinated correction guard:** an issue whose `quote` is NOT in the note is
  dropped by the lexical filter (T4.4).
- **LLM failure:** `routeAndCall` throws → no row written, function returns
  without throwing.
- **scoped-write break test:** grading with a foreign `profileId` writes nothing
  for the first profile's note.

## Open Items
- B's note-surface star (concept-capture T10) is **relocated** by T8 — confirm the
  book/topic "mastered" badge already consumes the same `verified` signal; if not,
  add that read in T8 (the badge, not the note, is mastery's home).
- Confirm the draft produced at `session-exchange.ts:842` is retrievable by
  `sessionId` for T10's `from-challenge-draft` load; if the draft lives only in
  challenge state, read it from there (do not rebuild).
