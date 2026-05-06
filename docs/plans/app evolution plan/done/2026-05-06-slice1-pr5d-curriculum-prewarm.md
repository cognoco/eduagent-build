# Slice 1 PR 5d — Pre-warm Curriculum On Subject Creation

**Date:** 2026-05-06
**Status:** Draft plan, ready to implement
**Branch:** `ux/emotional-retention-language` (or sub-branch off it)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § A and Slice 1 row 5d
**Wave:** Wave 1 (parallel-safe with 5a, 5b, 5g)
**Size:** M

---

## Goal (from audit)

> When I create a subject, I want the curriculum to start materializing immediately, so the first session does not stall waiting for setup.

Acceptance criteria (verbatim from audit § "First Wave PR Candidates"):

- Subject creation triggers curriculum materialization Inngest job before interview turns begin.
- `startFirstCurriculumSession`'s 25s wait is rarely hit on the staging happy path (measure both before and after).
- No change to ownership/profile-scoping invariants — curriculum still belongs to the subject's profile.

---

## Current state (verified 2026-05-06)

The relevant code paths were re-checked this session before drafting this plan. Findings:

### Subject creation paths (`apps/api/src/services/subject.ts:144-293`)

`createSubjectWithStructure` branches three ways:

| Branch | Topics at create time | Book row at create time |
|---|---|---|
| `narrow` | persisted synchronously via `persistNarrowTopics` | one default book wraps the topics (`ensureDefaultBook`) |
| `focused_book` | **not** generated — `topicsGenerated=false` | book stub created with the focus as title |
| `broad` | **not** generated | no book row, only `bookSuggestions` rows |

So **narrow is already pre-warmed**. The gap is `focused_book` (book stub but no topics) and `broad` (suggestions only, no book yet).

### Existing post-interview path

`apps/api/src/inngest/functions/interview-persist-curriculum.ts` listens to `app/interview.ready_to_persist` and runs `services/interview.ts → persistCurriculum(...)`. For the book-scoped path (`apps/api/src/services/interview.ts:939-981`):

- Calls `generateBookTopics(bookTitle, '', learnerAge, priorKnowledge)` — uses `signals.currentKnowledge ?? summary` as personalisation hint
- Inserts topics with `onConflictDoNothing()`
- Sets `topicsGenerated=true` on the book row

This is the only place where focused_book topics get generated today.

### Pre-warm primitives that already exist

- `generateBookTopics(title, description, learnerAge)` — `apps/api/src/services/book-generation.ts`. Pure LLM call. Does not need an interview.
- `persistBookTopics(db, profileId, subjectId, bookId, topics, connections)` — `apps/api/src/services/curriculum.ts:879`. Idempotent — short-circuits if topics already exist.
- `bookPreGeneration` Inngest function — `apps/api/src/inngest/functions/book-pre-generation.ts`. Listens to `app/book.topics-generated`, generates the next 1–2 books' topics. **It only fires after the first book's topics already exist.** It does not pre-warm the first book.

### What's genuinely missing (audit § A — re-verified)

- No event is emitted from `subjects.ts` (or the `POST /subjects` route) on subject creation.
- No Inngest function listens for "first book of a focused_book subject needs topics."
- `persistCurriculum`'s book-scoped path does not check whether topics already exist before calling `generateBookTopics` — so if pre-warm runs first, the post-interview path will still issue a redundant LLM call.

### Existing-book early return (`subject.ts:182-189`)

`createSubjectWithStructure`'s focused_book branch has an early return when a book with the same focus title already exists on the subject. Today this returns `existingBook.id` without doing anything else. If a prior subject create succeeded but the interview never completed (so `topicsGenerated=false`), re-creating the same focused_book today still leaves the user stuck waiting for `startFirstCurriculumSession`. Pre-warm dispatch must cover this branch too.

### Adjacent constraint worth noting

`broad` subjects do not have a book row at subject create time. The book is created later when the learner picks one in `/(app)/pick-book/[subjectId]` (which routes through `POST /filing` → `resolveFilingResult` → `curriculumBooks` insert). Pre-warm for broad would dispatch on book-pick, not subject-create, and is a separate trigger surface.

---

## Scope of this PR

**In scope**

- `focused_book` pre-warm at subject-create time.
- Idempotent guard in `persistCurriculum` so the post-interview path does not redo work that pre-warm already completed.
- Telemetry / measurement hook for "did pre-warm finish before first-curriculum session was requested?" — the staging-baseline question in the audit acceptance criteria.

**Out of scope (deliberate)**

- `broad` pre-warm on book pick. That is its own dispatch site (`filing.ts` after `resolveFilingResult` materialises the book row) and warrants its own PR. Separating keeps 5d's blast radius small.
- `narrow` is already pre-warmed at subject create — no change.
- Removing or simplifying `persistCurriculum`'s book-scoped path. The personalisation it adds via `priorKnowledge` is not yet replaced by anything; the idempotency guard preserves it for the cases where pre-warm hasn't finished or hasn't run.
- Changing `firstCurriculumSessionStartSchema` or `findFirstAvailableTopicId`. That is PR 5i (audit § J).

---

## Design

### Event

New Inngest event `app/subject.curriculum-prewarm-requested` with schema in `packages/schemas/src/inngest-events.ts`:

```ts
subjectCurriculumPrewarmRequestedEventSchema = z.object({
  version: z.literal(1),
  subjectId: z.string().uuid(),
  profileId: z.string().uuid(),
  bookId:    z.string().uuid(),
});
```

Minimal payload by design — `learnerAge` is looked up inside the function (mirrors `book-pre-generation.ts:74-77`) so the event isn't a stale snapshot.

### Function

New file `apps/api/src/inngest/functions/subject-prewarm-curriculum.ts`. Listens to the new event. Three steps:

1. **`load-prewarm-context`** — load the book + profile, derive `learnerAge`, mark the run `{ status: 'already-generated' }` if `topicsGenerated=true` (the post-interview path or a prior retry already did the work). Throw `NonRetriableError` if the book/subject IDs don't pair or the book row no longer exists.
2. **`generate-and-persist-topics`** — only runs when step 1's status is `pending`. Re-check `topicsGenerated` inside the step (race guard against `interview-persist-curriculum`), call `generateBookTopics(title, description, learnerAge)`, then `persistBookTopics(...)`. Both are existing services. Errors bubble so Inngest retries (configured `retries: 2`).
3. **`emit-topics-generated`** — emit `app/book.topics-generated` whenever `topicsGenerated=true` at the end of the function, regardless of which path set it (this run, a concurrent run, or the post-interview path). The cascade is an optimization that should fire uniformly. For focused_book it is a no-op (only one book; `bookPreGeneration` short-circuits at `nextBooks=[]`, see `book-pre-generation.ts:62-69`); the emit exists so the same function can be reused on the future broad-path dispatch site without rework.

Function-level config:

- `id: 'subject-prewarm-curriculum'`
- `concurrency: { limit: 5, key: 'event.data.profileId' }` — same shape as `interview-persist-curriculum`
- `idempotency: 'event.data.bookId'` — re-emits for the same book do nothing
- `retries: 2` — best-effort; the post-interview path is the safety net

### Dispatch

Dispatch lives in the **service**, `services/subject.ts → createSubjectWithStructure`'s focused_book branch. Pre-warm is a property of "a focused_book was created or re-asserted with no topics yet," not of "the HTTP route was called" — putting it in the service ensures every caller (today's route, tomorrow's Inngest function or admin tool) gets the same behavior. The trade-off (a service that imports the Inngest client) is mitigated by spy-based testing and matches the broader engineering intent of "durable async work goes through Inngest" being a service-level concern.

A small extracted helper keeps the dispatch site clean and testable in isolation:

```ts
// in services/subject.ts (file-private)
async function dispatchCurriculumPrewarm(args: {
  subjectId: string;
  profileId: string;
  bookId: string;
}): Promise<void> {
  await inngest
    .send({
      name: 'app/subject.curriculum-prewarm-requested',
      data: { version: 1, ...args },
    })
    .catch((err) => {
      captureException(err, {
        profileId: args.profileId,
        extra: {
          subjectId: args.subjectId,
          bookId: args.bookId,
          phase: 'subject_prewarm_dispatch',
        },
      });
    });
}
```

Two dispatch sites in the focused_book branch:

1. **New book path** — after the `INSERT ... RETURNING` at `subject.ts:201-211` succeeds and `bookRow` is bound, before the `return`. This covers the common case (first time creating "Botany>tea").
2. **Existing-book-stuck path** — at the early-return at `subject.ts:182-189`, **before** returning, check `existingBook.topicsGenerated === false` and dispatch in that case. This closes the gap surfaced in §"Existing-book early return": a re-create of a subject whose prior interview never finished will fire pre-warm and unstick the user.

`.catch` is intentional and the `inngest.send` is awaited (so the catch handler runs before `createSubjectWithStructure` returns) but `captureException` itself never throws, so the function still returns the row even when Inngest is unreachable — pre-warm is best-effort; subject create must not 500.

**Why not the route?** Dispatching from `routes/subjects.ts` would make pre-warm a property of one HTTP handler. Any future caller of `createSubjectWithStructure` (an admin endpoint, an Inngest function, a migration) would silently miss pre-warm — exactly the gap class we're already fixing in HIGH-1 for the existing-book branch.

**On the test-mock concern:** the GC1 ratchet bans new internal `jest.mock('../inngest/client', ...)` lines. The fix is to use `jest.spyOn(inngest, 'send').mockResolvedValue(...)` in the service tests — the canonical pattern shown at `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`. No `gc1-allow` exemption needed.

### Idempotency guard in the post-interview path

In `apps/api/src/services/interview.ts → persistCurriculum` book-scoped branch (around line 939), gate the LLM call on the flag, then re-check after the LLM returns to skip the insert if pre-warm committed mid-call:

```ts
const existingBook = await db.query.curriculumBooks.findFirst({
  where: and(
    eq(curriculumBooks.id, bookId),
    eq(curriculumBooks.subjectId, subjectId),
  ),
});
if (existingBook?.topicsGenerated) {
  return; // Pre-warm already populated; nothing to do.
}

const { generateBookTopics } = await import('./book-generation');
const learnerAge = await getProfileAge(db, profileId);
const priorKnowledge = signals.currentKnowledge ?? summary;
const result = await generateBookTopics(bookTitle, '', learnerAge, priorKnowledge);

// Re-check after the LLM call — pre-warm may have committed during the
// (slow) LLM round-trip. If so, skip the insert/flag-update entirely;
// the surviving topics are pre-warm's, which is the design intent.
const refreshed = await db.query.curriculumBooks.findFirst({
  where: and(
    eq(curriculumBooks.id, bookId),
    eq(curriculumBooks.subjectId, subjectId),
  ),
});
if (refreshed?.topicsGenerated) return;

// ...existing topic insert + topicsGenerated flip...
```

### Known cost leak (accepted for v1)

The pre-LLM and post-LLM `topicsGenerated` checks close the *persist* race but not the *generation* race. `generateBookTopics` runs before `persistBookTopics`'s flag flip is observable, so a fast typist who finishes the interview while pre-warm is still inside its LLM call burns **two concurrent LLM calls for the same book**. Only one set of topics is persisted (the post-LLM re-check drops the loser, and `onConflictDoNothing` is a backstop), so there is no data corruption — but the tokens of the loser are spent. Order-of-magnitude: a few cents per occurrence, bounded by how often interviews finish faster than `generateBookTopics`. Accepted for v1; documented here so it's not mistaken as fully covered by the failure-mode table. If the cost ever matters, the fix is a short-lived "generation-in-progress" claim row keyed by `bookId` that the post-interview path waits on.

### Telemetry

The acceptance criterion "25s wait is rarely hit on the staging happy path (measure both before and after)" is fundamentally a dashboard question — a free-text grep across logs is not an acceptable answer. The PR ships two artifacts:

1. **Sentry breadcrumb (queryable filter)** — at `startFirstCurriculumSession` (`apps/api/src/services/session/session-crud.ts`), emit a `Sentry.addBreadcrumb` with `category: 'curriculum.first-session'` and `data: { prewarmHit: boolean, topicAvailableMs: number, structureType: 'focused_book' | 'narrow' | 'broad' }`. Breadcrumbs surface in Sentry alongside any error in the same trace, and the data fields are filterable via Sentry's discover query — `prewarmHit:false` over a time range answers "rarely hit?" without grep.
2. **Structured log** (same call site) — `logger.info('first_curriculum_session_topic_check', { prewarmHit, topicAvailableMs, structureType })`. Cheap, surfaces in Workers tail and Cloudflare's log push if it's wired. Redundant with the breadcrumb but covers the case where someone is running staging without Sentry sampling at 100%.

The Inngest dashboard already shows per-function run timing, so step-2 latency for `subject-prewarm-curriculum` is observable for free; no extra wiring needed there.

A real Datadog/Doppler dashboard is a follow-up — the breadcrumb is sufficient to *answer* the acceptance question on demand.

---

## Files changed (summary)

| File | Change | Notes |
|---|---|---|
| `packages/schemas/src/inngest-events.ts` | Add `subjectCurriculumPrewarmRequestedEventSchema` + type | Re-exported via existing `export *` in `packages/schemas/src/index.ts`; no separate index edit needed |
| `apps/api/src/inngest/functions/subject-prewarm-curriculum.ts` | New file | The Inngest function |
| `apps/api/src/inngest/functions/subject-prewarm-curriculum.test.ts` | New file | Unit test using `jest.requireActual` + targeted spies (no internal `jest.mock`), mirroring `interview-persist-curriculum.integration.test.ts` |
| `apps/api/src/inngest/index.ts` | Import + add to `functions[]` array | Same shape as the existing 50+ entries |
| `apps/api/src/services/subject.ts` | Import `inngest` + `captureException`; add file-private `dispatchCurriculumPrewarm` helper; call it (a) after the focused_book `INSERT ... RETURNING` and (b) at the existing-book early return when `existingBook.topicsGenerated === false` | Service-level dispatch so every caller gets pre-warm, not just the route |
| `apps/api/src/services/subject.test.ts` | Use `jest.spyOn(inngest, 'send')` (NOT `jest.mock`) to assert: (i) new-book happy path fires the event, (ii) existing-book with `topicsGenerated=false` fires the event, (iii) existing-book with `topicsGenerated=true` does NOT fire, (iv) `inngest.send` rejection is caught and the row is still returned | `jest.spyOn` avoids the GC1 internal-mock ratchet — no `gc1-allow` exemption needed |
| `apps/api/src/services/interview.ts` | Pre-LLM and post-LLM `topicsGenerated` re-check guard around `persistCurriculum`'s book-scoped LLM call | ~12-line addition |
| `apps/api/src/services/interview.test.ts` | New test: book-scoped `persistCurriculum` skips LLM when `topicsGenerated=true` (pre-LLM gate); new test: post-LLM re-check skips insert when flag flipped during the call | Existing test infra in this file |
| `apps/api/src/services/session/session-crud.ts` | Sentry breadcrumb + structured log (`prewarmHit`, `topicAvailableMs`, `structureType`) in `startFirstCurriculumSession` | Two-line addition near the polling success branch |

Estimated diff: ~300 lines added, ~5 lines modified.

---

## Failure Modes

Per CLAUDE.md "Spec failure modes before coding":

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Pre-warm dispatch fails | Inngest unreachable from worker | Subject create succeeds normally; 25s wall behaves exactly as today | None needed — `.catch` handler logs + Sentry. Post-interview path is the safety net |
| Pre-warm function fails after retries | LLM persistent outage during pre-warm window | Subject create fine; interview proceeds; `interview-persist-curriculum` runs as today and generates topics | None needed — exactly today's behavior |
| Pre-warm finishes before interview ends | Happy path | First-curriculum session starts immediately after interview ends; no 25s wait | N/A — this is the intended behavior |
| Interview ends before pre-warm finishes | Fast typer + slow LLM | `interview-persist-curriculum` runs first, generates topics; pre-warm step 2's `topicsGenerated` re-check skips LLM call when it later runs | Idempotency guard (already in plan); no user impact |
| Both pre-warm and post-interview generation race (data) | Concurrent step.run windows | First persist wins; second's post-LLM re-check returns early; `onConflictDoNothing` + unique indexes are the backstop | Data-safe — no duplicates, no corruption |
| Both pre-warm and post-interview generation race (cost) | Fast typist finishes interview while pre-warm is still inside its LLM call | Two concurrent LLM calls for the same book; loser's tokens are wasted | **Accepted cost leak for v1** — bounded by interview-finish vs LLM-latency distribution. Not a bug, but called out so it isn't read as fully covered by the data-race row above. Future fix: short-lived "generation-in-progress" claim row keyed by `bookId` |
| Empty topic generation | LLM returns `{ topics: [], connections: [] }` for a thin or unusual book title | Today: `persistBookTopics` no-ops on the topic insert but **does still flip `topicsGenerated=true`** (the flag flip is unconditional inside the transaction). Pre-warm marks the book "done" with zero topics; post-interview path's pre-LLM guard sees `topicsGenerated=true` and returns; the user reaches `startFirstCurriculumSession` and `findFirstAvailableTopicId` finds nothing. | Bug exists today; not introduced by 5d but made more visible (pre-warm is a second path that can hit it). **Mitigation in this PR:** in `subject-prewarm-curriculum` step 2, treat `topics.length === 0` as a non-retriable failure that does NOT call `persistBookTopics` (so the flag stays false) and emits a Sentry exception with `extra: { phase: 'prewarm_empty_topics', bookTitle, learnerAge }`. Post-interview path then runs as today. Tracked as a follow-up to fix `persistBookTopics` itself in a separate PR (see Out of scope). |
| Stale event payload (book/subject mismatch) | Event replayed against deleted book | Function throws `NonRetriableError('book-not-found' or 'book-subject-mismatch')`; dashboard surfaces | None — function exits cleanly, not retried |
| Profile deleted between dispatch and execution | Profile delete happens during the prewarm window | Function throws on the `getProfileAge` lookup or returns default age 12; persist fails ownership check | Ownership check inside `persistBookTopics → createScopedRepository` rejects the insert; logged |
| `book-pre-generation` cascade re-fires for already-prewarmed book | Step 3 emits `app/book.topics-generated` and bookPreGeneration runs | bookPreGeneration looks for `nextBooks` with `topicsGenerated=false, sortOrder > current` — for a focused_book subject there's only one book, so `nextBooks=[]` and it short-circuits on `'no unbuilt books remaining'` | None — already idempotent |

---

## Test plan

### Unit tests (new)

`apps/api/src/inngest/functions/subject-prewarm-curriculum.test.ts`:

1. **Already-generated short-circuit:** book has `topicsGenerated=true` at step 1 → step 2 does not run → step 3 emits `app/book.topics-generated` (cascade fires uniformly).
2. **Mismatched IDs:** `book-subject-mismatch` `NonRetriableError` when subjectId on event doesn't match book row.
3. **Deleted book:** `book-not-found` `NonRetriableError` when book row is gone.
4. **Happy path:** book + profile loaded → `generateBookTopics` called with derived `learnerAge` → `persistBookTopics` called with right shape → `app/book.topics-generated` emitted.
5. **Race guard inside step 2:** book flips to `topicsGenerated=true` between step 1 and step 2 → step 2 skips LLM + persist → step 3 still emits.
6. **Empty topics from LLM:** `generateBookTopics` returns `{ topics: [] }` → step 2 throws (NOT caught) without calling `persistBookTopics` → flag remains `false` → Sentry exception captured with `phase: 'prewarm_empty_topics'` → post-interview path is left to retry the generation.

### Unit test additions

`apps/api/src/services/subject.test.ts` — all four cases use `jest.spyOn(inngest, 'send')`, not `jest.mock`:

- New focused_book: `inngest.send` called once with `'app/subject.curriculum-prewarm-requested'` and `{ version: 1, subjectId, profileId, bookId }`.
- Existing-book-stuck path: subject + book already exist, book has `topicsGenerated=false` → `inngest.send` called with the existing book's id.
- Existing-book-already-generated: existing book with `topicsGenerated=true` → `inngest.send` NOT called (the early return is fully no-op).
- Dispatch failure isolation: spy resolves to a rejected promise → service still returns the row; `captureException` is called once.

`apps/api/src/services/interview.test.ts`:

- Pre-LLM guard: book-scoped `persistCurriculum` with `topicsGenerated=true` returns without calling `generateBookTopics` (spy on the dynamic import).
- Post-LLM guard: `topicsGenerated` flips between pre-check and the LLM `await` → no insert is issued; existing rows untouched.

### Integration test (one)

`apps/api/src/inngest/functions/subject-prewarm-curriculum.integration.test.ts` — mirrors the canonical pattern in `interview-persist-curriculum.integration.test.ts`:

- Real DB; mocked LLM via `routeAndCall` (external boundary).
- Create a focused_book subject, dispatch the event, run the function, assert curriculum topics + `topicsGenerated=true`.
- Then run `interview-persist-curriculum` against the same subject and assert it does **not** re-generate (no second LLM call captured).

### Break test (per CLAUDE.md "Fix Development Rules")

5d does not patch a security or data-integrity finding so a break test isn't strictly required. The race-guard test (#5 above) covers the equivalent "guard works" verification.

### Manual verification on staging

1. Create three focused_book subjects of varying complexity.
2. Open Inngest dashboard, confirm `subject-prewarm-curriculum` runs for each.
3. Confirm topics exist in `curriculum_topics` before the user finishes the interview screen.
4. Capture 7 days of `topicAvailableMs` log lines and confirm P50 drops vs. a pre-merge sample on the same staging account.

---

## Rollout

- No migration. New event + function only. Existing flows are unchanged when the dispatch is removed (delete the two `dispatchCurriculumPrewarm(...)` call sites in `services/subject.ts`).
- No feature flag needed. The dispatch is harmless if the function is missing (Inngest will log "no listeners"); the function is harmless if no event is sent.
- Ship sequence:
  1. Open PR.
  2. Land schema + function + register (no dispatch yet — function exists but never fires).
  3. CI green.
  4. Land dispatch + idempotency guard.
  5. Land telemetry log.

A single PR is fine — the staged sequence above is just the suggested commit order for clarity, not separate PRs.

## Rollback

- **Possible:** yes, fully.
- **Data loss:** none — pre-warm only adds rows that the existing post-interview path would have added later.
- **Procedure:** revert the PR. Existing focused_book subjects with prewarm-generated topics are valid curriculum rows; they remain usable. `interview-persist-curriculum`'s book-scoped path's idempotency guard is no longer needed but is safe to leave in place.

---

## Verification checklist

- [ ] `pnpm exec nx run api:typecheck` clean
- [ ] `pnpm exec nx run api:test` clean (unit + integration in changed paths)
- [ ] `pnpm exec nx run schemas:test` clean
- [ ] `pnpm exec nx run api:lint` clean (no new eslint-disable, no `process.env`, no GC1 violations without `// gc1-allow`)
- [ ] Inngest dashboard on staging shows `subject-prewarm-curriculum` registered
- [ ] Manual staging run: focused_book subject create → topics present in `curriculum_topics` within ~5–10s
- [ ] Manual staging run: `firstCurriculumSession` polling exits on first poll (no 25s wait) for the same subject
- [ ] Audit doc Slice 1 row 5d updated to "shipped" (this is a separate doc edit, not part of the PR)

---

## Out of scope / explicit follow-ups

1. **Broad-path pre-warm.** Dispatch on `/filing` after the broad path's book row is materialised. Separate PR. Same function can be reused; the dispatch site, ownership-chain verification, and tests are different. **Estimated S** (revised from XS — the book-row commit timing and `profileId` re-verification in `filing.ts` make this non-trivial once tests are accounted for).
2. **Backfill for existing focused_book subjects with `topicsGenerated=false`.** Out of scope for 5d. After deploy, only newly-created (or re-asserted via existing-book branch) focused_book subjects benefit. A one-shot Inngest scan that emits prewarm events for `topicsGenerated=false` rows on focused_book subjects is straightforward as a follow-up if staging shows a meaningful population of stuck rows.
3. **`persistBookTopics` empty-topics flag bug.** Today, `persistBookTopics` flips `topicsGenerated=true` even when `topics.length === 0`, which marks the book "done" with zero topics. This is a pre-existing bug, not introduced by 5d. The 5d pre-warm function explicitly sidesteps it by treating empty-topics as a non-retriable failure that does not call `persistBookTopics`. The proper fix lives in `services/curriculum.ts` and is tracked separately.
4. **Schema for `app/book.topics-generated`.** The existing event has no zod schema in `inngest-events.ts` (verified). 5d adds rigorous schema for the new event but the existing one remains untyped. Add as a follow-up so both events have validated payloads.
5. **Topic-grain matching (PR 5i).** Audit § J. Depends on this PR (matcher needs materialized topics to score against). Tracked separately in the audit's Slice 1 table.
6. **Deletion of preference screens (PR 5h).** Independent of 5d.
7. **Replacing `priorKnowledge` personalisation in `persistCurriculum`.** With pre-warm in place, the post-interview personalisation is bypassed when pre-warm wins the race. If product later wants the personalisation back without losing pre-warm speed, the right design is a "re-rank topics with interview signals" pass after pre-warm — not within 5d.

---

## Resolved questions

1. **Pre-warm passes no `priorKnowledge`.** Decided: option (a). The pre-warm topics are a structural scaffold, not a personalised lesson plan. If the interview later produces signals worth re-ordering against, the right design is a "re-rank topics with interview signals" pass *after* pre-warm — not bundling personalisation into the pre-warm call. That re-rank is already named in §"Out of scope" item 4.
2. **Broad-path follow-up is a separate PR.** Decided: separate. Sizing **bumped from XS → S**: broad subjects don't have a book row at subject-create time — the book materialises later in `filing.ts` after the learner picks from `bookSuggestions`. The dispatch site needs to verify the book row is fully committed (and `profileId`-scoped) before sending the event, the test plan covers a different ownership chain, and the failure-mode table is different. The same pre-warm function can be reused unchanged, but the dispatch surface area is non-trivial.
