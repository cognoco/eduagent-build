---
title: Learning Library Cleanup - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: shipped
gap_ids: [learn-3]
---

# Learning Library Cleanup - Implementation Plan

> **✅ Shipped, then hardened (2026-06-09).** The original plan (T1–T5 below)
> shipped to `main` as the `deleteSubject` service, `DELETE /v1/subjects/:id`
> route, `useDeleteSubject` hook, and a delete action in the manage-subjects
> sheet. A follow-up end-user review then tightened two over-blunt UX
> decisions, now also shipped:
>
> 1. **Archive-first gate.** Delete is no longer offered on active or paused
>    subjects — it renders only on **archived** subjects
>    (`library.tsx`, `subject.status === 'archived'`). A subject must first be
>    archived (a reversible state with a Restore action) before it can be
>    permanently deleted, so a whole subject's learning history can never be
>    destroyed in one tap from an in-use subject. Archive stays the safe,
>    indefinite, recoverable "keep it but set it aside" state; the `paused`
>    status remains the intermediate "I'll come back soon" grouping. No
>    auto-empty of the archive was added (it would silently destroy retained
>    learning history and compound with the existing 30-day auto-archive cron).
> 2. **Honest confirmation copy.** The destructive confirmation now names the
>    learner-meaningful losses — mastery progress, flashcard (spaced-repetition)
>    reviews, and streak — not just books / topics / sessions counts
>    (`en.json` → `library.manage.deleteConfirmMessage`).
>
> The "classification pending / re-triage against identity-foundation" banner
> that previously sat here is moot: the feature shipped independently and this
> hardening is a UI-gating + copy change with no identity coupling.

**Goal:** Let learners permanently delete mistakenly-created subjects, with the
same kind of explicit destructive affordance already available for books and
vocabulary.

**Approach:** Add a scoped `DELETE /v1/subjects/:id` path that performs a single
**hard delete** of the subject row and relies on the existing Postgres
`ON DELETE CASCADE` foreign keys to remove all dependent rows — exactly the
pattern the existing `deleteBook` service already uses (`apps/api/src/services/curriculum.ts:1105-1112`
does one `db.delete(...).where(...)` and lets the DB cascade). No manual
per-table deletion and no soft-delete/tombstone are introduced; the cascade is
already enforced by the schema. Then expose the action from the library
manage-subjects UI. Keep archive as the reversible "hide it for now" action;
deletion is explicit, final, and irreversible.

> **Resolved [HIGH-1, HIGH-4]:** the earlier "safe subject-level cascade or
> soft-to-hard cleanup according to existing data relationships" was an
> undecided placeholder. The data relationships are not a design choice — every
> FK to `subjects.id` is already declared `onDelete: 'cascade'` (see the
> dependency map under Tasks → T1). The implementation is a single scoped
> `db.delete(subjects).where(and(eq(subjects.id, id), eq(subjects.profileId, profileId)))`.

## Scope

In scope:
- `apps/api/src/routes/subjects.ts` (add `DELETE /subjects/:id`)
- `apps/api/src/services/subject.ts` (add `deleteSubject`)
- `packages/schemas/src/subjects.ts` (add `deleteSubjectResponseSchema`, UUID param schema)
- `apps/mobile/src/hooks/use-subjects.ts` (add `useDeleteSubject`)
- `apps/mobile/src/app/(app)/library.tsx` (delete action + confirmation)
- `apps/mobile/src/i18n/locales/en.json` (new `library.manage.delete*` keys) [MEDIUM-5]
- `apps/mobile/src/components/home/LearnerScreen.tsx` — read-only trace for T5
  resume-card verification; only edited if a stale persisted pointer is found.
- Subject/book/curriculum/vocabulary related tests.
- No DB migration (cascade FKs and the subject status enum already exist).

Out of scope:
- Deleting an entire profile or account.
- Mentor editing/deleting a child's learning content; the identity membership
  plan owns authorization for `learn-2`.
- Bulk library cleanup or duplicate-detection automation.

## Product Decisions

- Archive stays reversible and remains the default low-risk declutter action.
- Delete is available from the manage-subjects surface and requires a
  destructive confirmation that **names the subject and states the scope of what
  is destroyed** (number of books, started topics, and sessions with learning
  history). This mirrors `deleteBook`'s started-topics confirmation gate
  (`apps/api/src/services/curriculum.ts:1094-1103`), which is the existing bar
  for destroying learning history. A subject delete is strictly more
  destructive than a book delete, so it must not have weaker friction. [HIGH-3]
- Delete reuses the existing `canWrite` gate already applied to pause/archive/
  restore in the manage UI (`apps/mobile/src/app/(app)/library.tsx:1178,1195,1210,1227,1241`).
  The `learn-3` personas are owners and self-registered minors (P1/P2/P4/P5);
  P3 non-owner children are already write-blocked server-side by
  `assertNotProxyMode` and need no separate UI gate. [MEDIUM-6]
- Deleting a subject removes only rows owned by that subject for the active
  profile, enforced by the scoped `WHERE subjects.id = :id AND subjects.profileId = :profileId`
  clause plus the FK cascade. It must never delete another profile's rows.
- The delete is **irreversible**. No migration is required (no schema change —
  the cascade FKs and the `subjectStatusSchema` enum already exist), but the
  operation permanently destroys the subject and all dependent learning data
  with no recovery path. [LOW-1]
- Sessions cascade-delete with the subject (`sessions.ts:98,136,195` are
  `onDelete: 'cascade'`), so no orphaned session row survives. The only possible
  dangling reference is a **client-side / persisted resume pointer**, addressed
  concretely in T5. [MEDIUM-1]

## Tasks

- [ ] **T1: Verify (not design) the subject deletion dependency map.** [HIGH-1]
  The cascade is already enforced by the schema, so this task **confirms** the FK
  graph rather than choosing a per-table strategy. Done when the table below is
  re-verified against the schema files at implementation time (FKs can drift) and
  any new `subjects`-referencing table is added to it.

  **Subject FK dependency map (verified 2026-05-31):**

  | Table (file) | Column | `onDelete` | Effect of subject delete |
  |---|---|---|---|
  | `learning_sessions` ×2, `session_summaries` (`sessions.ts:98,136,195`) | `subjectId` | `cascade` | rows deleted |
  | `curriculum`, `curriculum_books`, `skipped_topics`, `book_suggestions` (`subjects.ts:100,128,312,350`) | `subjectId` | `cascade` | rows deleted |
  | `curriculum_topics`, `topic_connections`, `topic_suggestions` (`subjects.ts:188,241,244,379`) | via `bookId` | `cascade` | deleted transitively through books |
  | `mastery_assessments`, `needs_deepening_topics`, `learning_preferences` (`assessments.ts:65,174,229`) | `subjectId` | `cascade` | rows deleted |
  | `retention_cards` / SRS (`assessments.ts:120-123`) | via `topicId` | `cascade` | deleted transitively through topics |
  | `bookmarks` (`bookmarks.ts:27`) | `subjectId` | `cascade` | rows deleted |
  | `vocabulary` (`language.ts:32`) | `subjectId` | `cascade` | rows deleted |
  | `xp_events` (`progress.ts:63`) | `subjectId` | `cascade` | rows deleted |
  | `milestone_snapshots` (`snapshots.ts:89`) | `subjectId` | `cascade` | rows deleted |
  | `practice_activities` (`practice-activity.ts:36-37`) | `subjectId` | **`set null`** | row retained, `subjectId → NULL` (analytics orphan, intended) |
  | `quiz` activities (`quiz.ts:37-38`) | `subjectId` | **`set null`** | row retained, `subjectId → NULL` (analytics orphan, intended) |
  | `learning_sessions.nextTopicId` (`sessions.ts:260-261`) | `nextTopicId` | **`set null`** | sibling-subject session's "next topic" pointer nulled if it pointed into a deleted topic (cross-subject case; verify in T5) |

  The three `set null` edges are deliberate: they preserve aggregate analytics/
  history rows while detaching them from the deleted subject. The implementation
  must NOT try to delete or "clean up" these rows.

- [ ] **T2: Add a server-side `deleteSubject` service.** [HIGH-1, MEDIUM-2, MEDIUM-4]
  Done when:
  - It verifies active-profile ownership first via the existing scoped pattern
    (`createScopedRepository(db, profileId).subjects.findFirst(eq(subjects.id, subjectId))`),
    throwing `SubjectNotFoundError` when the row is absent or owned by another
    profile — mirroring `deleteBook` (`curriculum.ts:1068-1072`).
  - It performs a **single** scoped delete:
    `db.delete(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)))`.
    No manual per-table deletes and no transaction wrapper are needed — a single
    statement plus FK cascade is atomic. (Match `deleteBook`, which is not wrapped
    in a transaction either.)
  - **Not-found semantics:** first successful delete returns the success
    envelope; a repeat delete of an already-gone subject throws
    `SubjectNotFoundError` → 404. "Idempotent" here means no partial state and no
    500 on a repeat, NOT a 200-on-repeat. [MEDIUM-2]
  - Tests: (a) success deletes the subject and its dependent rows
    (assert at least one cascaded child table is emptied, e.g. `curriculum_books`
    and `learning_sessions`); (b) **break test** [MEDIUM-4] — a delete targeting
    another profile's subject ID throws `SubjectNotFoundError` and the victim
    subject + its children remain intact (red-green: write the test, confirm the
    scoped `WHERE` is what blocks it by temporarily removing the `profileId`
    predicate and watching it fail, then restore); (c) repeat-delete returns
    not-found, not 500.

- [ ] **T3: Add `DELETE /v1/subjects/:id`.** [HIGH-2, MEDIUM-3]
  Done when:
  - The handler calls `assertNotProxyMode(c)` **before** any work, matching every
    other subject write (`subjects.ts:67,81,97,116,142,171`) and the book-delete
    route (`books.ts:118`). Without this a proxy-mode parent could delete a
    child's subject. [HIGH-2]
  - It validates the UUID path param via `zValidator('param', …)` (reuse/define a
    `subjectIdParamSchema` with `z.string().uuid()`), calls only the service
    layer (no `drizzle-orm` import in the route — G1/G5 lint), and returns a typed
    `deleteSubjectResponseSchema` envelope.
  - **Envelope [MEDIUM-3]:** add `deleteSubjectResponseSchema` to
    `packages/schemas/src/subjects.ts`, mirroring `deleteBookResponseSchema`
    (`subjects.ts:860-867`), e.g.
    `{ deleted: z.literal(true), subjectId: z.string().uuid() }` plus optional
    destroyed-scope counts if T2 returns them.
  - It catches `SubjectNotFoundError` → `notFound(c, …)` (404); all other errors
    propagate to the global `onError` handler (Sentry), consistent with the rest
    of `subjects.ts`.
  - Route tests: success, malformed UUID → 400, not-found → 404, proxy-mode →
    403 `PROXY_MODE` (assert the guard fires). Covers the API half of `learn-3`.

- [ ] **T4: Add mobile destructive UI.** [HIGH-3, MEDIUM-5, MEDIUM-6, LOW-3]
  Done when:
  - `library.tsx` shows delete as a distinct action alongside archive/restore in
    the manage-subjects sheet, gated by the existing `canWrite` /
    `isSavingAnySubject` disable pattern (`library.tsx:1178` et al.). [MEDIUM-6]
  - A `useDeleteSubject` mutation is added to `use-subjects.ts` calling
    `client.subjects[':id'].$delete({ param: { id } })`, with
    `onSuccess` invalidating `['subjects']`, `['curriculum']`, and `['progress']`
    (the same keys `useUpdateSubject` invalidates, `use-subjects.ts:157-164`).
  - The mutation follows the **existing non-optimistic pattern** (`pendingSubjectId`
    disables the row during the call; success invalidates; error surfaces a toast
    and the row simply remains). There is no optimistic-removal/rollback because
    the existing manage UI is non-optimistic — do not invent one. [LOW-3]
  - The confirmation **names the subject and states what will be destroyed**
    (books / started topics / sessions count), per [HIGH-3].
  - All new copy routes through `t('library.manage.delete')` /
    `t('library.manage.deleteConfirm…')` etc., with keys added to `en.json` in
    the same PR (no hardcoded JSX literals). Reuse the existing
    `library.manage.*` namespace. [MEDIUM-5]
  - Tests cover: confirmation shown with subject name, cancel (no call), success
    (invalidates + row disappears after refetch), error (toast + row retained).

- [ ] **T5: Verify resume/session cleanup against a concrete source.** [MEDIUM-1]
  Sessions cascade-delete with the subject, so no orphaned DB session survives.
  Done when:
  - The home/learner resume affordance source is identified (trace the "Continue
    with X" / resume card in `apps/mobile/src/components/home/LearnerScreen.tsx`
    and any persisted last-session pointer it reads — confirm at implementation
    time whether the resume target is derived live from the `useSubjects` query
    or cached client-side).
  - If the resume target is derived live from the subjects/sessions query, a
    deleted subject simply drops out after invalidation — assert this with a
    focused test and record "no extra cleanup needed" here.
  - If a client-side/persisted pointer exists (AsyncStorage/SecureStore or a
    cached query that survives), the delete flow must clear or expire it in the
    same change, with a focused test for the stale-pointer case.
  - Also note the cross-subject `nextTopicId` `set null` edge from T1: confirm a
    sibling subject's session whose `nextTopicId` pointed into a deleted topic
    degrades gracefully (null next-topic → no crash), or document it as
    not-applicable.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| User taps delete accidentally | Destructive action selected | Confirmation naming the subject + scope of what's destroyed (books/topics/sessions) | Cancel keeps subject unchanged |
| Subject has started topics / learning history | Delete confirmed | Confirmation states the count of started topics and sessions that will be destroyed | Cancel keeps subject unchanged; confirm proceeds (irreversible) |
| Subject has active/recent session | Delete confirmed | Resume card drops the subject after query invalidation (sessions cascade-delete) | Start a new subject/session |
| Proxy-mode parent attempts delete | Proxy session issues DELETE | 403 `PROXY_MODE` (blocked by `assertNotProxyMode`) | Switch to own profile to manage own subjects |
| Delete fails mid-statement | DB error | Error toast/banner; row retained | Retry; single-statement delete + FK cascade is atomic, so no partial state |
| Cross-profile subject ID | Tampered request | 404 `NOT_FOUND` (scoped `WHERE profileId` returns no row) | No data exposed |
| Repeat delete of already-gone subject | Double-tap / retry after success | 404 `NOT_FOUND` | No error state; subject already gone |
| Offline/mobile network failure | Delete mutation fails | Subject remains visible (non-optimistic) | Retry after connection returns |

## Verification

Focused checks:

```powershell
# API: subject route + service unit tests (schemas live in @eduagent/schemas)
pnpm exec nx run api:test --testPathPattern=subjects

# Mobile: quote the paths — the (app) segment contains parens that PowerShell
# would otherwise treat as a grouping expression.
Push-Location apps/mobile
pnpm exec jest --findRelatedTests "src/app/(app)/library.tsx" "src/hooks/use-subjects.ts" --no-coverage
pnpm exec tsc --noEmit
Pop-Location
```

Because this touches API writes and scoped deletion (DB cascade + auth-scoping),
run the integration suite — the pre-commit/pre-push hooks intentionally skip
`.integration.test.` files:

```powershell
pnpm exec nx test:integration api
```

The integration run is the layer that actually exercises the FK cascade against
a real DB (unit tests mock neither the DB nor the cascade). Confirm a subject
delete leaves zero rows in `curriculum_books`, `learning_sessions`,
`mastery_assessments`, and `xp_events` for that subject, and that
`practice_activities`/`quiz` rows survive with `subject_id = NULL`.

