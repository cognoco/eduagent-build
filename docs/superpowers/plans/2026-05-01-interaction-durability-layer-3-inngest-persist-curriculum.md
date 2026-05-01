# Interaction Durability — Layer 3: Inngest-backed `persistCurriculum` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2 (2026-05-01):** rewritten after a 14-finding adversarial review of revision 1. Diffs from rev 1 are flagged inline with `→ R2:`. The revision closes a partial-index ON CONFLICT bug, a check-then-act dispatch race, a too-loose cached-signals check, a `failureReason` leak surface, and several smaller gaps. See [Adversarial Review Amendments](#adversarial-review-amendments-r2).

> **Revision 3 (2026-05-01):** rewritten after a 15-finding adversarial review of revision 2 that verified plan assumptions against the actual codebase. Critical corrections: (1) `extractSignals` returns `{ goals, experienceLevel, currentKnowledge, interests }` — **NOT** `{ topics }` — topic generation happens inside `persistCurriculum` via `generateCurriculum()`; (2) `curriculumTopics.title` not `topicName`, no `profileId` column, `bookId` is NOT NULL; (3) existing index `(book_id, lower(title))` already provides idempotency — COALESCE approach unnecessary; (4) `PersistCurriculumError` already exists — modify, don't recreate; (5) push function is `sendPushNotification(db, payload)` not `sendPushToProfile`; (6) eval harness uses `flows/` not `scenarios/defineScenario()`; (7) `NonRetriableError`/`onFailure` are not established patterns — first usage in this codebase; (8) `getStepDatabase` returns neon-serverless WS driver (supports real transactions, not just `db.batch()`). Diffs from rev 2 flagged inline with `→ R3:`. See [Adversarial Review Amendments (R3)](#adversarial-review-amendments-r3).

**Goal:** Move `persistCurriculum` from inline-await-in-route-handler to a checkpointed Inngest function, with idempotent topic inserts, an explicit `completing`/`failed` status, mobile backoff-polling UX, and a "Try Again" recovery path.

**Scope-honest closure of SUBJECT-09:** the request no longer 5xx's; the user sees a `completing` panel that resolves to `completed` or `failed` (with Try Again). **The user's terminal exchange is only durably saved if Layer 1 ships first** — this plan does not, by itself, save user input on the failure path. See [Layer 1 dependency](#layer-1-dependency).

**Architecture:** The existing `persistCurriculum` runs inline inside the interview's force-complete and stream-finalize handlers — when its LLM call (internally: `generateCurriculum()` or `generateBookTopics()`) fails or the Worker's 30 s budget is exceeded, the user sees a 5xx and onboarding is stuck. Layer 3 dispatches `app/interview.ready_to_persist` from those handlers (returning 202-style with `status: 'completing'`), runs the work in an Inngest function with three checkpointed steps (`extract-signals` → `generate-and-persist-curriculum` → `mark-completed`) and a separate notification step. → R3: the actual data flow is `extractSignals()` → intermediate signals `{ goals, experienceLevel, currentKnowledge, interests }` → `persistCurriculum()` which internally calls `generateCurriculum({ subjectName, interviewSummary, goals, experienceLevel })` to produce `GeneratedTopic[]` and inserts them into `curriculumTopics`. The cached `extractedSignals` on the draft is the cross-invocation safety net for the extract step; the curriculum generation + persist step runs atomically. Inngest's built-in step memoization handles retry idempotency for the extract step; the existing unique index on `(book_id, lower(title))` prevents duplicate topic rows if the persist step retries. The Inngest `onFailure` handler flips the draft to `failed` after retries are exhausted, persisting a typed `failureCode` (not raw error text). → R3: `NonRetriableError` and `onFailure` are NOT existing patterns in this codebase — this is their first usage. Mobile UX polls with exponential backoff (3 → 6 → 12 → 30 s capped, paused while backgrounded, refetched on foreground) and surfaces "Try Again" + "Go to home" on `failed`.

**Tech Stack:** Inngest (already in use — `book-pre-generation.ts` is the closest existing reference, though it does NOT use `onFailure` or `NonRetriableError`), Drizzle migrations (extending an enum + adding `failureCode` column), real Postgres transactions via neon-serverless WS driver (→ R3: `getStepDatabase()` returns the WS-backed `Database`, which supports `db.transaction()` — NOT neon-http), React Native polling with `useQuery` `refetchInterval` + `AppState` foreground invalidate, push notification (Expo) for backgrounded-app delivery.

→ R3: **No new unique index needed for idempotency.** Migration `0043` already created `curriculum_topics_book_title_lower_uq` on `(book_id, lower(title))`. The `onConflictDoNothing` target can reference this existing index. Task 2 is replaced with verifying + leveraging the existing index.

**Spec:** `docs/specs/2026-05-01-interaction-durability.md` — Layer 3 scope. **Finding ID:** `[INTERACTION-DUR-L3]`. **Driver bug:** `SUBJECT-09` — Layer 3 closes the 5xx half; full closure requires Layer 1. **Reference template:** `apps/api/src/inngest/functions/book-pre-generation.ts`.

### Layer 1 dependency

| Aspect | Without Layer 1 | With Layer 1 |
|---|---|---|
| Request stops 5xx-ing | ✅ | ✅ |
| User sees recoverable UX | ✅ | ✅ |
| User's terminal exchange survives a `failed` cycle | ❌ — last user message can be lost if SSE drops before stream finalize wrote it | ✅ — outbox replays it on retry |

Layer 3 can ship standalone, but the SUBJECT-09 ticket should not be closed until Layer 1 also ships. The migration in Task 1 must land first regardless.

---

## Pre-flight

- Run `git status` first; this plan touches three packages plus a new Inngest function.
- The `DraftStatus` enum extension is a Postgres `ALTER TYPE ... ADD VALUE`. Postgres requires this to be its OWN transaction — committed before any code that references the new value runs. The migration PR therefore lands and is **deployed to production** before the code PR per `feedback_schema_drift_pattern`. → R2: production gate added (rev 1 only gated on staging).
- This plan introduces a new prod LLM call site only by relocation — `extractSignals` was already called inline; it now runs inside an Inngest step. No new prompts. Run `pnpm eval:llm` once at the end as a regression guard, plus a determinism check (Task 12).
- Inngest functions deploy via the standard sync URL (`/v1/inngest`) per `project_inngest_staging`. After registering, verify the function appears in the Inngest dashboard for staging before merging.

---

## File Structure

| Status | File | Role |
|--------|------|------|
| **Create** | `apps/api/drizzle/0047_draft_status_completing_failed.sql` | `ALTER TYPE draft_status ADD VALUE 'completing'; ADD VALUE 'failed';` + `failureCode` column |
| ~~**Create**~~ | ~~`apps/api/drizzle/0048_curriculum_topics_dedup_index.sql`~~ | → R3: **REMOVED.** Existing migration `0043` already created `curriculum_topics_book_title_lower_uq` on `(book_id, lower(title))`. No new index needed. |
| **Modify** | `packages/database/src/schema/sessions.ts` | Add `'completing'` and `'failed'` to `draftStatusEnum`; add `failureCode` column |
| **Modify** | `packages/database/src/schema/subjects.ts` | → R3: correct file — `curriculumTopics` lives here, not in a `curriculum.ts` file. Verify `onConflictDoNothing` target matches existing index columns. |
| **Modify** | `packages/schemas/src/errors.ts` | → R3: `PersistCurriculumError` already exists with `(message, cause?)` constructor. **Modify** it to add a `code: PersistFailureCode` property. Add `persistFailureCodeSchema` enum. |
| **Modify** | `packages/schemas/src/inngest-events.ts` | Add `interviewReadyToPersistEventSchema` |
| **Modify** | `packages/schemas/src/onboarding.ts` (or wherever `OnboardingDraftRow` lives) | Add `failureCode: PersistFailureCode \| null` to the row schema |
| **Modify** | `apps/api/src/services/interview.ts` | → R3: `persistCurriculum` lives HERE (line ~797). Add `onConflictDoNothing` to its internal `db.insert(curriculumTopics)` calls. Column is `title` (NOT `topicName`). No `profileId` on table. |
| ~~**Create**~~ | ~~`apps/api/src/services/interview-persist.ts`~~ | → R3: **REMOVED.** Don't create a new helper. Call existing `persistCurriculum` from the Inngest step. Use `db.transaction()` (WS driver supports it) to atomize persist + mark-completed. |
| **Create** | `apps/api/src/inngest/functions/interview-persist-curriculum.ts` | The new Inngest function |
| **Create** | `apps/api/src/inngest/functions/interview-persist-curriculum.test.ts` | Unit tests with a step-replay harness that mirrors Inngest memoization (→ R2) |
| **Create** | `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts` | Real-Postgres integration test (SUBJECT-09 break test) using the same step-replay harness |
| **Modify** | `apps/api/src/inngest/index.ts` | Register the new function in the exported array |
| **Modify** | `apps/api/src/routes/interview.ts` | Atomic-conditional-UPDATE dispatch (→ R2) in both stream-finalize and force-complete; new GET state response shape includes typed `failureCode` |
| **Modify** | `apps/api/src/routes/interview.ts` | Add new `POST /subjects/:subjectId/interview/retry-persist` route |
| **Modify** | `apps/mobile/src/hooks/use-interview.ts` | Treat new `completing` and `failed` statuses; backoff polling; AppState foreground invalidate (→ R2) |
| **Create** | `apps/mobile/src/components/interview/InterviewCompletingPanel.tsx` | "Building your learning path…" panel |
| **Create** | `apps/mobile/src/components/interview/InterviewCompletingPanel.test.tsx` | Component tests |
| **Create** | `apps/mobile/src/components/interview/InterviewFailedPanel.tsx` | Failure UX rendering user-facing copy mapped from `failureCode` (→ R2 — no raw error text on screen) |
| **Create** | `apps/mobile/src/components/interview/InterviewFailedPanel.test.tsx` | Component tests |
| **Modify** | `apps/api/src/services/notifications.ts` | → R3: Function is `sendPushNotification(db, payload, options?)` — NOT `sendPushToProfile`. Signature: `(db: Database, { profileId, title, body, type }: NotificationPayload)`. The `type` field must be one of 18 literal strings — add `'interview_ready'` to the union. |

---

## Failure Modes (→ R2 — entirely new section)

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| `inngest.send` throws at dispatch time (Inngest API down) | Worker can reach Postgres but not Inngest | Route returns 503 `{error:'dispatch-failed'}`; mobile shows transient "Couldn't start the build — tap to retry" inline | Mobile retries the same `POST /interview/complete` (idempotent thanks to the conditional UPDATE — second call sees `status='completing'` and short-circuits) |
| Draft hard-deleted between dispatch and step execution | Account deleted mid-flow, GDPR purge | Inngest function throws `NonRetriableError('draft-disappeared')`; `onFailure` finds nothing to update; logs `draft_missing` metric | None needed — user no longer exists |
| Worker hits 30 s budget after `inngest.send` already returned | Network hiccup right after dispatch | Mobile sees the SSE close cleanly with `status='completing'`; polls normally | Inngest run continues server-side; UX is unaffected |
| Production migration runs *after* code deploys | Deploy ordering inverted | Route attempts `UPDATE ... SET status='completing'` → Postgres rejects unknown enum value → 500; old behaviour returns | Production gate (Task 1, step 6) blocks code merge until enum reaches prod |
| Mobile loses network during `completing` poll | Subway / lift | `useQuery` keeps last `completing` state; backoff continues silently | When network returns + AppState becomes active, foreground invalidate refetches immediately |
| LLM transient error → Inngest retry succeeds | extractSignals throws once, succeeds on retry 2 | "Building your learning path…" stays up; no failure surface | Built-in Inngest step memoization re-runs only the failed step |
| LLM persistent error → retries exhausted | extractSignals throws all 3 attempts | After ~Inngest-budget delay, panel transitions to `failed` with code `extract_signals_failed`. Mobile copy: "We couldn't build your learning path right now." | "Try Again" hits the retry endpoint, which re-dispatches a fresh run |
| `extractSignals` succeeds but returns empty/default signals (`goals: [], interests: []`) | LLM gave up cleanly | → R3: `extractSignals` returns `{ goals, experienceLevel, currentKnowledge, interests }` — check `goals.length === 0 && interests.length === 0` for "nothing useful". Treated as failure: function throws `PersistCurriculumError('empty_signals')`, `onFailure` writes `failureCode='empty_signals'` | "Try Again" or user re-engages the interview |
| Push send fails inside step | Expo API down | Step throws → Inngest retries the push step only (persist already memoized green) | If push step exhausts retries, `onFailure` for the push step logs but does not flip draft to `failed` (data is already persisted) |
| Two concurrent finalizers (SSE + force-complete) | User force-completes mid-stream | One wins the conditional UPDATE and dispatches; the other gets `null` from `RETURNING` and returns 409 immediately | No duplicate runs; no duplicate LLM cost |

If any new state lands without a row here, the design is incomplete (per CLAUDE UX Resilience Rules).

---

## Task 1: Schema migration — extend `draft_status` enum + add `failureCode`

**Files:**
- Create: `apps/api/drizzle/0047_draft_status_completing_failed.sql`
- Modify: `packages/database/src/schema/sessions.ts`
- Modify: `packages/schemas/src/errors.ts` (typed enum used by the column type — Tasks 1 and 2 of the schemas package can land in one commit)

This ships its own PR and **deploys to production before any other Layer 3 code lands**. Postgres `ALTER TYPE ADD VALUE` cannot be in the same transaction as code that uses the new value.

→ R2: rev 1 used a free-text `failure_reason` column; we replace it with a typed `failure_code` enum-like text column constrained at the application boundary by `persistFailureCodeSchema`. This eliminates the leak surface where raw provider error text reached user devices.

- [ ] **Step 1: Migration file**

```sql
-- 0047_draft_status_completing_failed.sql
-- Layer 3: extend draft_status with two new values for the Inngest-backed
-- persistCurriculum flow, plus a typed failure_code column.
-- Postgres requires ADD VALUE statements be their own transaction — the
-- drizzle migrate runner handles this correctly, but if running by hand,
-- run each ADD VALUE separately.

ALTER TYPE "draft_status" ADD VALUE IF NOT EXISTS 'completing';
ALTER TYPE "draft_status" ADD VALUE IF NOT EXISTS 'failed';

-- failure_code is a constrained text column, not a Postgres enum, so we can
-- evolve the value set in code without DDL each time. The application
-- validates writes via persistFailureCodeSchema.
ALTER TABLE "onboarding_drafts"
  ADD COLUMN "failure_code" text;
```

- [ ] **Step 2: Drizzle schema update**

In `packages/database/src/schema/sessions.ts` find:

```typescript
export const draftStatusEnum = pgEnum('draft_status', [
  'in_progress',
  'completed',
  'expired',
]);
```

Replace with:

```typescript
export const draftStatusEnum = pgEnum('draft_status', [
  'in_progress',
  'completing',
  'completed',
  'failed',
  'expired',
]);
```

In the `onboardingDrafts` pgTable definition add:

```typescript
failureCode: text('failure_code'),
```

- [ ] **Step 3: Typed failure-code enum in schemas**

→ R3: `PersistCurriculumError` **already exists** in `packages/schemas/src/errors.ts` with constructor `(message: string, cause?: unknown)`. MODIFY it — do not recreate from scratch (that would be a duplicate-export compile error).

In `packages/schemas/src/errors.ts`, add the enum and modify the existing class:

```typescript
import { z } from 'zod';

export const persistFailureCodeSchema = z.enum([
  'extract_signals_failed',  // LLM failed during signal extraction
  'empty_signals',            // LLM returned no usable signals (goals + interests both empty)
  'generate_curriculum_failed', // → R3: generateCurriculum() threw (distinct from extract)
  'persist_failed',           // db.transaction throw not caused by an LLM
  'draft_missing',            // draft hard-deleted mid-flight
  'unknown',                  // catch-all; logged with full context server-side
]);
export type PersistFailureCode = z.infer<typeof persistFailureCodeSchema>;

// → R3: MODIFY the existing class — add `code` property while keeping
// backwards-compat with existing callers that pass (message, cause?).
export class PersistCurriculumError extends Error {
  public code: PersistFailureCode;
  constructor(codeOrMessage: PersistFailureCode | string, messageOrCause?: string | unknown) {
    const isCode = persistFailureCodeSchema.safeParse(codeOrMessage).success;
    const code = isCode ? (codeOrMessage as PersistFailureCode) : 'unknown';
    const message = isCode
      ? (typeof messageOrCause === 'string' ? messageOrCause : codeOrMessage)
      : (codeOrMessage as string);
    super(message);
    this.code = code;
    this.name = 'PersistCurriculumError';
    if (!isCode && messageOrCause) this.cause = messageOrCause;
    Object.setPrototypeOf(this, PersistCurriculumError.prototype);
  }
}
```

→ R2: this is the boundary classifier. Inngest's `onFailure` maps thrown errors to one of these codes; mobile maps codes to user copy. Raw `error.message` never crosses the wire.

- [ ] **Step 4: Run typecheck — every consumer of `DraftStatus` needs to compile**

```bash
pnpm exec nx run-many -t typecheck --projects=api,mobile,@eduagent/database,@eduagent/schemas
```

Expected: PASS. If a switch statement on `DraftStatus` becomes non-exhaustive, FIX it (do not add a `default` to silence the lint) — those gaps become real UX bugs.

- [ ] **Step 5: Apply to dev DB and run related tests**

```bash
pnpm run db:push:dev
cd apps/api && pnpm exec jest --findRelatedTests src/routes/interview.ts --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Commit, push, await staging AND production migrate** → R2

```bash
git add apps/api/drizzle/0047_draft_status_completing_failed.sql packages/database/src/schema/sessions.ts packages/schemas/src/errors.ts
git commit -m "feat(schemas): extend draft_status with completing/failed + typed failure code [INTERACTION-DUR-L3]"
git push
gh run list --branch <current-branch> --limit 5
```

WAIT for the staging migrate step to go green AND for the production deploy / migrate cycle to apply 0047 to the prod database. **Do not proceed to subsequent tasks until `\d+ onboarding_drafts` on the production DB shows the `failure_code` column AND `\dT+ draft_status` shows `completing`/`failed`.** This avoids the "code expects new enum value but DB hasn't applied DDL yet" failure mode in the table above.

---

## Task 2: Idempotent topic insert — leverage existing unique index → R3

→ R3: **COMPLETE REWRITE of this task.** Rev 2 was built on multiple false assumptions:
- Column is **`title`**, NOT `topicName` (doesn't exist)
- **`bookId` is NOT NULL** — always populated via `ensureDefaultBook()`. No COALESCE sentinel needed.
- Migration `0043` already created `curriculum_topics_book_title_lower_uq` on `(book_id, lower(title))` — **no new migration needed**
- **No `profileId` column** on `curriculumTopics` — ownership inferred via `curriculum → subject → profile`
- `persistCurriculum` lives in `apps/api/src/services/interview.ts` (~line 797), NOT in `curriculum.ts`
- There are 4 insert sites in `curriculum.ts` + 1 in `interview.ts`

**Files:**
- Modify: `apps/api/src/services/interview.ts` (the `persistCurriculum` function's insert, ~line 850)
- Modify: `apps/api/src/services/curriculum.ts` (bulk-insert sites at ~546, ~937, ~1356)

**No migration needed. No production gate needed.** Existing index already provides idempotency.

- [ ] **Step 1: Locate ALL topic-insert sites**

```bash
cd apps/api && rg -n "db\.insert\(curriculumTopics\)" src/services/
```

- [ ] **Step 2: Patch `persistCurriculum` in `interview.ts`**

In `apps/api/src/services/interview.ts` (~line 850), find the `db.insert(curriculumTopics).values(topicRows)`. Add `onConflictDoNothing`:

```typescript
await db
  .insert(curriculumTopics)
  .values(topicRows)
  .onConflictDoNothing({
    target: [curriculumTopics.bookId, sql`lower(${curriculumTopics.title})`],
  });
```

→ R3: target columns `bookId` + `lower(title)` match the existing `curriculum_topics_book_title_lower_uq` index from migration 0043.

- [ ] **Step 3: Patch bulk-insert sites in `curriculum.ts`**

Apply the same `.onConflictDoNothing({ target: [...] })` to:
- `persistNarrowTopics` (~line 546)
- `persistBookTopics` (~line 937)
- `regenerateLanguageCurriculum` (~line 1356)

Do NOT patch `addCurriculumTopic` (~line 1046) — that's user-initiated and should surface duplicates as errors.

- [ ] **Step 4: Idempotency assertion deferred to integration test (Task 8)**

Requires real Postgres.

- [ ] **Step 5: Typecheck + commit**

```bash
cd apps/api && pnpm exec jest --findRelatedTests src/services/interview.ts src/services/curriculum.ts --no-coverage
pnpm exec nx run api:typecheck
git add apps/api/src/services/interview.ts apps/api/src/services/curriculum.ts
git commit -m "feat(api): idempotent curriculum topic insert via onConflictDoNothing on existing index [INTERACTION-DUR-L3]"
git push
```

---

## Task 3: Inngest event schema for `app/interview.ready_to_persist`

**Files:**
- Modify: `packages/schemas/src/inngest-events.ts`

- [ ] **Step 1: Add the event schema**

Append:

```typescript
export const interviewReadyToPersistEventSchema = z.object({
  version: z.literal(1),
  draftId: z.string().uuid(),
  profileId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectName: z.string().min(1),
  bookId: z.string().uuid().optional(),
});

export type InterviewReadyToPersistEvent = z.infer<
  typeof interviewReadyToPersistEventSchema
>;
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec nx run @eduagent/schemas:typecheck
git add packages/schemas/src/inngest-events.ts
git commit -m "feat(schemas): add app/interview.ready_to_persist event schema [INTERACTION-DUR-L3]"
git push
```

---

## Task 4: ~~`persistCurriculumAndMarkComplete` helper using `db.batch()`~~ → R3: Wrap existing `persistCurriculum` + mark-completed in `db.transaction()`

→ R3: **REVISED.** Do NOT create a new helper file. The existing `persistCurriculum` in `apps/api/src/services/interview.ts` (line ~797) already handles curriculum generation + topic insertion + `topicsGenerated` update. The Inngest step just needs to call it, then update the draft status. Since `getStepDatabase()` returns the neon-serverless WS driver (NOT neon-http), `db.transaction()` IS available and ACID.

**Files:**
- No new file. The atomicity will be achieved by wrapping the call to `persistCurriculum` + `updateDraft(status: 'completed')` inside a `db.transaction()` within the Inngest step.

→ R3: The `project_neon_transaction_facts` memory note says "neon-http never supports interactive tx". However, `getStepDatabase()` uses the **neon-serverless WS driver** (verified in `apps/api/src/inngest/helpers.ts`), which DOES support interactive transactions. `db.batch()` is only needed on neon-http route handlers. Inside Inngest functions we have full `db.transaction()` support.

- [ ] **Step 1: Implement**

```typescript
// apps/api/src/services/interview-persist.ts
import {
  type Database,
  curriculumTopics,
  curricula,
  curriculumBooks,
  onboardingDrafts,
} from '@eduagent/database';
import { eq, and, sql } from 'drizzle-orm';
import { ensureCurriculum, ensureDefaultBook } from './curriculum';
import { PersistCurriculumError } from '@eduagent/schemas';
import type { OnboardingDraftRow } from '@eduagent/schemas';

interface PersistInput {
  draft: OnboardingDraftRow;
  bookId?: string;
  bookTitle?: string;
}

export async function persistCurriculumAndMarkComplete(
  db: Database,
  profileId: string,
  subjectId: string,
  subjectName: string,
  draftId: string,
  input: PersistInput
): Promise<void> {
  const { draft, bookId, bookTitle } = input;

  const topics = (draft.extractedSignals as { topics?: { name: string }[] } | null)?.topics ?? [];
  if (topics.length === 0) {
    // Defensive: caller should have rejected earlier, but never persist an
    // empty curriculum — the user would land on a blank learning path with
    // no recovery surface (status='completed' hides the failure).
    throw new PersistCurriculumError('empty_signals');
  }

  const curriculum = await ensureCurriculum(db, profileId, subjectId, subjectName);
  const book = bookId
    ? null
    : await ensureDefaultBook(db, profileId, curriculum.id, subjectName);
  const targetBookId = bookId ?? book?.id ?? null;

  const topicRows = topics.map((t, idx) => ({
    curriculumId: curriculum.id,
    bookId: targetBookId,
    topicName: t.name,
    sortOrder: idx,
    profileId,
    sourceTitle: bookTitle ?? null,
  }));

  // All three writes in one ACID batch: topics + draft status + book flag.
  // The polling endpoint can never observe a partial state.
  const batch: unknown[] = [
    db
      .insert(curriculumTopics)
      .values(topicRows)
      .onConflictDoNothing({
        target: [
          curriculumTopics.curriculumId,
          sql`COALESCE(${curriculumTopics.bookId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
          sql`lower(trim(${curriculumTopics.topicName}))`,
        ],
      }),
    db
      .update(onboardingDrafts)
      .set({ status: 'completed', failureCode: null })
      .where(
        and(
          eq(onboardingDrafts.id, draftId),
          eq(onboardingDrafts.profileId, profileId)
        )
      ),
  ];

  if (targetBookId) {
    batch.push(
      db
        .update(curriculumBooks)
        .set({ topicsGenerated: true })
        .where(
          and(
            eq(curriculumBooks.id, targetBookId),
            eq(curriculumBooks.profileId, profileId)
          )
        )
    );
  }

  await db.batch(batch as Parameters<typeof db.batch>[0]);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec nx run api:typecheck
git add apps/api/src/services/interview-persist.ts
git commit -m "feat(api): persistCurriculumAndMarkComplete via db.batch (incl. topicsGenerated) [INTERACTION-DUR-L3]"
git push
```

---

## Task 5: Inngest function `interview-persist-curriculum` (TDD)

**Files:**
- Create: `apps/api/src/inngest/functions/interview-persist-curriculum.ts`
- Create: `apps/api/src/inngest/functions/interview-persist-curriculum.test.ts`

Reference template: `apps/api/src/inngest/functions/book-pre-generation.ts`. Four steps:
1. `extract-signals` — read draft; if `extractedSignals.topics?.length > 0`, return cached; else call LLM.
2. `save-signals` — write extracted signals back to the draft (cross-invocation cache for Try Again).
3. `persist-and-mark-completed` — `db.batch()` all three writes (Task 4).
4. `send-completion-push` — push notification in its OWN step → R2 — so a push failure does not retry the persist (the persist was idempotent anyway, but doubling pushes is bad UX).

`onFailure` maps the thrown error to a `PersistFailureCode` and flips the draft to `failed`.

→ R2: rev 1 cache check used `Object.keys(extractedSignals).length > 0`. That returned true for `{ topics: [] }`, persisting an empty curriculum — strictly *worse* than SUBJECT-09 because there's no recovery surface. The new check is `topics?.length > 0`.

- [ ] **Step 1: Read the reference**

```bash
cd apps/api && wc -l src/inngest/functions/book-pre-generation.ts
```

Read it end-to-end before writing the new one. Key idioms: `getStepDatabase`, `step.run` with named checkpoints, `NonRetriableError`, `onFailure`.

- [ ] **Step 2: Build a step-replay test harness** → R2

Real Inngest memoizes succeeded steps across retries and only re-invokes the failing step from its checkpoint. A test harness that re-runs the *whole handler* twice does not exercise this — it tests something Inngest never does. The harness below records succeeded-step return values by `name` and replays them on the next `step.run` call without re-invoking the function body.

In a new file `apps/api/src/inngest/functions/_test-harness.ts`:

```typescript
export interface ReplayHarness {
  step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
  /** Reset to allow another invocation; cached results survive across resets. */
  reset(): void;
  /** Inspect cached step returns. */
  cache: Map<string, unknown>;
}

export function makeReplayHarness(): ReplayHarness {
  const cache = new Map<string, unknown>();
  return {
    cache,
    reset() {/* nothing to do — cache is intentionally preserved */},
    step: {
      run: async (name, fn) => {
        if (cache.has(name)) return cache.get(name);
        const result = await fn();
        cache.set(name, result);
        return result;
      },
    },
  };
}
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/inngest/functions/interview-persist-curriculum.test.ts`:

```typescript
const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => ({
  getStepDatabase: () => mockGetStepDatabase(),
}));

jest.mock('../client', () => ({
  inngest: {
    createFunction: jest.fn(
      (config: any, _trigger: unknown, handler: (...a: unknown[]) => unknown) =>
        ({ fn: handler, onFailure: config.onFailure, config })
    ),
  },
}));

jest.mock('../../services/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockExtractSignals = jest.fn();
jest.mock('../../services/interview', () => ({
  extractSignals: (...args: unknown[]) => mockExtractSignals(...args),
}));

const mockPersistAndMark = jest.fn();
jest.mock('../../services/interview-persist', () => ({
  persistCurriculumAndMarkComplete: (...args: unknown[]) =>
    mockPersistAndMark(...args),
}));

const mockSendPush = jest.fn();
jest.mock('../../services/notifications', () => ({
  sendPushToProfile: (...args: unknown[]) => mockSendPush(...args),
}));

import { interviewPersistCurriculum } from './interview-persist-curriculum';
import { makeReplayHarness } from './_test-harness';
import { PersistCurriculumError } from '@eduagent/schemas';

const PROFILE = '00000000-0000-4000-8000-000000000001';
const DRAFT = '00000000-0000-4000-8000-000000000002';
const SUBJECT = '00000000-0000-4000-8000-000000000003';

function makeEvent() {
  return {
    data: {
      version: 1,
      draftId: DRAFT,
      profileId: PROFILE,
      subjectId: SUBJECT,
      subjectName: 'Math',
    },
  };
}

function mockDb({
  draft,
  updateRet = [{ id: DRAFT }],
}: {
  draft: { extractedSignals: unknown; exchangeHistory: unknown[] } | undefined;
  updateRet?: unknown[];
}) {
  return {
    query: {
      onboardingDrafts: {
        findFirst: jest.fn().mockResolvedValue(draft),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue(updateRet),
    }),
  };
}

describe('interview-persist-curriculum', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cache hit: extractedSignals with topics returns cached, no LLM call', async () => {
    const cached = { topics: [{ name: 'Algebra' }] };
    mockGetStepDatabase.mockReturnValue(
      mockDb({ draft: { extractedSignals: cached, exchangeHistory: [] } })
    );

    const handler = (interviewPersistCurriculum as any).fn;
    const harness = makeReplayHarness();
    await handler({ event: makeEvent(), step: harness.step });

    expect(mockExtractSignals).not.toHaveBeenCalled();
    expect(mockPersistAndMark).toHaveBeenCalled();
  });

  it('cache miss: empty topics array triggers fresh extraction (rev-1 regression)', async () => {
    // Critical regression check: rev 1 used Object.keys length > 0 which
    // returned true for { topics: [] } and persisted an empty curriculum.
    mockGetStepDatabase.mockReturnValue(
      mockDb({ draft: { extractedSignals: { topics: [] }, exchangeHistory: ['turn'] } })
    );
    mockExtractSignals.mockResolvedValue({ topics: [{ name: 'X' }] });

    const handler = (interviewPersistCurriculum as any).fn;
    await handler({ event: makeEvent(), step: makeReplayHarness().step });

    expect(mockExtractSignals).toHaveBeenCalled();
    expect(mockPersistAndMark).toHaveBeenCalled();
  });

  it('extract throws once, replay-harness retry uses memoized result for prior steps', async () => {
    mockGetStepDatabase.mockReturnValue(
      mockDb({ draft: { extractedSignals: null, exchangeHistory: ['x'] } })
    );
    mockExtractSignals
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ topics: [{ name: 'Y' }] });

    const handler = (interviewPersistCurriculum as any).fn;
    const harness = makeReplayHarness();

    await expect(handler({ event: makeEvent(), step: harness.step })).rejects.toThrow(/transient/);
    expect(mockExtractSignals).toHaveBeenCalledTimes(1);

    // Second invocation: extract-signals re-runs (it threw, was not cached);
    // succeeds; downstream steps run for the first time.
    await handler({ event: makeEvent(), step: harness.step });
    expect(mockExtractSignals).toHaveBeenCalledTimes(2);
    expect(mockPersistAndMark).toHaveBeenCalledTimes(1);
  });

  it('throws NonRetriableError when draft does not exist', async () => {
    mockGetStepDatabase.mockReturnValue(
      mockDb({ draft: undefined })
    );

    const handler = (interviewPersistCurriculum as any).fn;
    await expect(
      handler({ event: makeEvent(), step: makeReplayHarness().step })
    ).rejects.toThrow(/draft-disappeared|NonRetriable/);
  });

  it('onFailure maps PersistCurriculumError to its code', async () => {
    const updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: DRAFT }]),
    };
    mockGetStepDatabase.mockReturnValue({ update: jest.fn().mockReturnValue(updateChain) });

    const onFailure = (interviewPersistCurriculum as any).onFailure;
    await onFailure({
      event: makeEvent(),
      error: new PersistCurriculumError('extract_signals_failed'),
    });

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', failureCode: 'extract_signals_failed' }),
    );
  });

  it('onFailure maps unknown errors to "unknown" code (no raw message leak)', async () => {
    const updateChain = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: DRAFT }]),
    };
    mockGetStepDatabase.mockReturnValue({ update: jest.fn().mockReturnValue(updateChain) });

    const onFailure = (interviewPersistCurriculum as any).onFailure;
    await onFailure({
      event: makeEvent(),
      error: new Error('LLM api key sk-zzz... leaked'),
    });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.failureCode).toBe('unknown');
    expect(setCall).not.toHaveProperty('failureReason');
    expect(JSON.stringify(setCall)).not.toMatch(/sk-zzz/);
  });
});
```

- [ ] **Step 4: Run — should FAIL (module missing)**

```bash
cd apps/api && pnpm exec jest src/inngest/functions/interview-persist-curriculum.test.ts --no-coverage
```

- [ ] **Step 5: Implement**

Create `apps/api/src/inngest/functions/interview-persist-curriculum.ts`:

```typescript
import { NonRetriableError } from 'inngest';
import { eq, and } from 'drizzle-orm';
import { onboardingDrafts } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { extractSignals } from '../../services/interview';
import { persistCurriculumAndMarkComplete } from '../../services/interview-persist';
import { sendPushToProfile } from '../../services/notifications';
import {
  PersistCurriculumError,
  type PersistFailureCode,
} from '@eduagent/schemas';

const logger = createLogger('interview-persist-curriculum');

function classifyError(err: unknown): PersistFailureCode {
  if (err instanceof PersistCurriculumError) return err.code;
  // Heuristics for unwrapped errors. Default to 'unknown'; never reflect raw
  // message back to the user.
  return 'unknown';
}

async function loadDraft(db: any, profileId: string, draftId: string) {
  return db.query.onboardingDrafts.findFirst({
    where: and(
      eq(onboardingDrafts.id, draftId),
      eq(onboardingDrafts.profileId, profileId)
    ),
  });
}

export const interviewPersistCurriculum = inngest.createFunction(
  {
    id: 'interview-persist-curriculum',
    name: 'Persist curriculum after interview completion',
    retries: 3,
    concurrency: { limit: 5, key: 'event.data.profileId' },
    // Inngest event-level idempotency: collapse duplicate dispatches for the
    // same draft into one run within a 5-min window. Belt-and-suspenders with
    // the route-level conditional UPDATE.
    idempotency: 'event.data.draftId',
    onFailure: async ({ event, error }) => {
      const db = getStepDatabase();
      const code = classifyError(error);
      await db
        .update(onboardingDrafts)
        .set({ status: 'failed', failureCode: code })
        .where(
          and(
            eq(onboardingDrafts.id, event.data.draftId),
            eq(onboardingDrafts.profileId, event.data.profileId)
          )
        );
      logger.error('interview-persist-curriculum exhausted retries', {
        profileId: event.data.profileId,
        draftId: event.data.draftId,
        failureCode: code,
        // Raw error logged server-side ONLY, never written to DB or returned to mobile.
        rawError: error?.message,
      });
    },
  },
  { event: 'app/interview.ready_to_persist' },
  async ({ event, step }) => {
    const { draftId, profileId, subjectId, subjectName, bookId } = event.data;

    const signals = await step.run('extract-signals', async () => {
      const db = getStepDatabase();
      const draft = await loadDraft(db, profileId, draftId);
      if (!draft) throw new NonRetriableError('draft-disappeared');

      // Structural cache check: keys count is not enough — { topics: [] }
      // would falsely pass. Verify topics exist and have content.
      const cached = draft.extractedSignals as { topics?: { name: string }[] } | null;
      if (cached?.topics && cached.topics.length > 0) {
        return cached;
      }

      try {
        const fresh = await extractSignals(draft.exchangeHistory);
        if (!fresh?.topics || fresh.topics.length === 0) {
          throw new PersistCurriculumError('empty_signals');
        }
        return fresh;
      } catch (err) {
        if (err instanceof PersistCurriculumError) throw err;
        throw new PersistCurriculumError('extract_signals_failed', (err as Error)?.message);
      }
    });

    await step.run('save-signals', async () => {
      const db = getStepDatabase();
      await db
        .update(onboardingDrafts)
        .set({ extractedSignals: signals })
        .where(
          and(
            eq(onboardingDrafts.id, draftId),
            eq(onboardingDrafts.profileId, profileId)
          )
        );
    });

    await step.run('persist-and-mark-completed', async () => {
      const db = getStepDatabase();
      const draft = await loadDraft(db, profileId, draftId);
      if (!draft) throw new NonRetriableError('draft-disappeared');
      try {
        await persistCurriculumAndMarkComplete(
          db, profileId, subjectId, subjectName, draftId,
          { draft: { ...draft, extractedSignals: signals }, bookId }
        );
      } catch (err) {
        if (err instanceof PersistCurriculumError) throw err;
        throw new PersistCurriculumError('persist_failed', (err as Error)?.message);
      }
    });

    // Separate step so a push-API hiccup does not retry the persist (which is
    // idempotent anyway, but doubling pushes is bad UX).
    await step.run('send-completion-push', async () => {
      try {
        await sendPushToProfile(profileId, {
          title: 'Your learning path is ready',
          body: `${subjectName} is set up — tap to review`,
          data: { type: 'interview_ready', subjectId },
        });
      } catch (err) {
        // Push failures are not user-blocking; the mobile poll path also
        // foregrounds and refetches on AppState transition. We log and emit
        // a metric — never silent (CLAUDE: "Silent recovery without
        // escalation is banned").
        logger.warn('completion push failed', {
          profileId, draftId, error: (err as Error)?.message,
        });
        // Emit an Inngest event so the failure rate is queryable.
        await inngest.send({
          name: 'app/interview.completion_push_failed',
          data: { profileId, draftId, subjectId, version: 1 as const },
        });
      }
    });
  }
);
```

- [ ] **Step 6: Tests should PASS**

```bash
cd apps/api && pnpm exec jest src/inngest/functions/interview-persist-curriculum.test.ts --no-coverage
```

Expected: 6 PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/inngest/functions/interview-persist-curriculum.ts apps/api/src/inngest/functions/interview-persist-curriculum.test.ts apps/api/src/inngest/functions/_test-harness.ts
git commit -m "feat(api): inngest interview-persist-curriculum function [INTERACTION-DUR-L3]"
git push
```

---

## Task 6: Register the function in the Inngest registry

**Files:**
- Modify: `apps/api/src/inngest/index.ts`

- [ ] **Step 1: Add to the exports array**

```typescript
import { interviewPersistCurriculum } from './functions/interview-persist-curriculum';
// ...
export const functions = [
  // ...existing...
  interviewPersistCurriculum,
];
```

- [ ] **Step 2: Commit + push + verify staging Inngest sync**

```bash
git add apps/api/src/inngest/index.ts
git commit -m "feat(api): register interview-persist-curriculum [INTERACTION-DUR-L3]"
git push
```

After staging deploys, hit the sync URL and confirm the function appears in the Inngest dashboard:

```bash
curl -X PUT https://<staging-domain>/v1/inngest
```

(`project_inngest_staging` notes the path is `/v1/inngest`.)

---

## Task 7: Replace inline `persistCurriculum` with atomic-conditional dispatch → R2

**Files:**
- Modify: `apps/api/src/routes/interview.ts`

Two sites: (a) the SSE stream finalizer's `result.isComplete` branch (around line 248), (b) the `POST /subjects/:subjectId/interview/complete` handler (around line 309).

→ R2: rev 1 used a check-then-act pattern (read status, write status, dispatch). Two concurrent finalizers (SSE finalize + force-complete fired near-simultaneously) both observed `in_progress`, both transitioned, both dispatched — two LLM runs. The fix is a single conditional UPDATE with `RETURNING`: only the request that wins the row update dispatches. This is one round-trip and atomic by definition; no interactive transaction needed. (The Inngest `idempotency` config in Task 5 is a second line of defence — but the dispatch-side fix is the primary one.)

The route uses the singleton `inngest` import (per `apps/api/src/routes/consent.ts:181`, `account.ts:31`, etc.) — NOT `c.env.INNGEST_CLIENT`.

- [ ] **Step 1: Patch the stream finalizer**

In `apps/api/src/routes/interview.ts` around line 248-273, replace:

```typescript
if (result.isComplete) {
  await updateDraft(db, profileId, draft.id, {
    exchangeHistory: updatedHistory,
    extractedSignals: result.extractedSignals ?? draft.extractedSignals,
  });
  await persistCurriculum(...);
  await updateDraft(db, profileId, draft.id, { status: 'completed' });
}
```

with:

```typescript
if (result.isComplete) {
  // Save the latest history regardless of who wins the dispatch race.
  await db
    .update(onboardingDrafts)
    .set({
      exchangeHistory: updatedHistory,
      extractedSignals: result.extractedSignals ?? draft.extractedSignals,
    })
    .where(
      and(
        eq(onboardingDrafts.id, draft.id),
        eq(onboardingDrafts.profileId, profileId),
      ),
    );

  // Atomic claim: only the row update that observes status='in_progress'
  // wins; the loser gets an empty array back and short-circuits.
  const claimed = await db
    .update(onboardingDrafts)
    .set({ status: 'completing', failureCode: null })
    .where(
      and(
        eq(onboardingDrafts.id, draft.id),
        eq(onboardingDrafts.profileId, profileId),
        eq(onboardingDrafts.status, 'in_progress'),
      ),
    )
    .returning({ id: onboardingDrafts.id });

  if (claimed.length > 0) {
    await inngest.send({
      // Inngest-level idempotency key — duplicate sends collapse server-side.
      id: `persist-${draft.id}`,
      name: 'app/interview.ready_to_persist',
      data: interviewReadyToPersistEventSchema.parse({
        version: 1,
        draftId: draft.id,
        profileId,
        subjectId,
        subjectName: subject.name,
        bookId,
      }),
    });
  }

  await sseStream.writeSSE({
    data: JSON.stringify({
      type: 'done',
      isComplete: true,
      status: 'completing',
      exchangeCount: updatedHistory.filter((e) => e.role === 'user').length,
    }),
  });
}
```

- [ ] **Step 2: Patch the force-complete handler**

Apply the same atomic-claim pattern to `POST /subjects/:subjectId/interview/complete`. Remove the inline `extractSignals` and `persistCurriculum` calls — they happen in the Inngest function now. Return `{ isComplete: true, status: 'completing', exchangeCount }` — no `extractedSignals` (populated later via polling).

If the claim returns empty, return 200 with the current state (someone else won — usually the SSE finalize). The mobile poll will pick up `completing` regardless.

- [ ] **Step 3: Update the GET state response shape**

In `GET /subjects/:subjectId/interview` make sure the return body includes `status: draft.status` and `failureCode: draft.failureCode ?? null`. → R2: returning the typed `failureCode` (not raw text).

- [ ] **Step 4: Run interview tests + typecheck**

```bash
cd apps/api && pnpm exec jest src/routes/interview.test.ts --no-coverage
cd apps/api && pnpm exec nx run api:typecheck
```

Expected: PASS. Some existing tests may need updating (they assert old `status: 'completed'` shape). UPDATE them to assert `status: 'completing'` per the new contract — do NOT keep the old assertion (`feedback_never_loosen_tests_to_pass`: this is "new behaviour", not "weakening").

- [ ] **Step 5: Add an explicit race-condition test** → R2

```typescript
it('atomic dispatch: two concurrent finalizers result in exactly one inngest.send', async () => {
  // Seed a draft in 'in_progress'. Fire two concurrent /complete calls.
  // Assert: inngest.send called exactly once, second call returns 200 with
  // status='completing' but does NOT redispatch.
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/interview.ts apps/api/src/routes/interview.test.ts
git commit -m "feat(api): atomic-conditional dispatch for persistCurriculum [SUBJECT-09 root fix] [INTERACTION-DUR-L3]"
git push
```

---

## Task 8: SUBJECT-09 break test — real-Postgres, real Inngest semantics → R2

**Files:**
- Create: `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`

→ R2: rev 1's "break test" mocked `step.run = (name, fn) => fn()` and called the handler twice — that's a hand-rolled multi-invocation simulation, not a retry simulation. Real Inngest re-runs only the failing step from a checkpoint; succeeded steps are replayed from cache. This test uses the `_test-harness.ts` replay mechanism so the cached steps are *replayed*, not re-executed.

This test:
1. Seeds account + profile + subject + onboarding draft.
2. Mocks `extractSignals` to throw on the FIRST call only.
3. Invokes the handler with a replay harness.
4. Asserts on attempt 1: handler throws `extract_signals_failed`, draft stays `completing`.
5. Invokes again with the SAME harness (cache preserved).
6. Asserts on attempt 2: `extract-signals` re-runs (not cached because it threw), succeeds, downstream steps run; `persist-and-mark-completed` writes once; draft flips to `completed`; topics are exactly the LLM output (no double-insert).

- [ ] **Step 1: Write the test**

```typescript
import { resolve } from 'path';
import {
  accounts, profiles, subjects, onboardingDrafts, curriculumTopics,
  generateUUIDv7, createDatabase, type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { eq, like } from 'drizzle-orm';
import { interviewPersistCurriculum } from './interview-persist-curriculum';
import { makeReplayHarness } from './_test-harness';

loadDatabaseEnv(resolve(__dirname, '../../../..'));
let db: Database;
const RUN_ID = generateUUIDv7();
const CLERK_PREFIX = `clerk_persist_test_${RUN_ID}`;

beforeAll(() => { db = createDatabase(process.env.DATABASE_URL!); });
afterAll(async () => {
  await db.delete(accounts).where(like(accounts.clerkUserId, `${CLERK_PREFIX}%`));
});

async function seed() {
  const accountId = generateUUIDv7();
  const profileId = generateUUIDv7();
  const subjectId = generateUUIDv7();
  const draftId = generateUUIDv7();
  await db.insert(accounts).values({
    id: accountId, clerkUserId: `${CLERK_PREFIX}_${accountId}`, email: `${accountId}@test.invalid`,
  });
  await db.insert(profiles).values({ id: profileId, accountId, displayName: 't' });
  await db.insert(subjects).values({
    id: subjectId, profileId, name: 'Test', language: 'English', status: 'active',
  });
  await db.insert(onboardingDrafts).values({
    id: draftId, profileId, subjectId,
    exchangeHistory: [{ role: 'user', content: 'I like algebra' }],
    extractedSignals: {},
    status: 'completing',
  });
  return { profileId, subjectId, draftId };
}

describe('interview-persist-curriculum integration', () => {
  let extractSignalsCalls = 0;
  beforeEach(() => {
    extractSignalsCalls = 0;
    jest.spyOn(require('../../services/interview'), 'extractSignals')
      .mockImplementation(async () => {
        extractSignalsCalls++;
        if (extractSignalsCalls === 1) throw new Error('LLM transient failure');
        return { topics: [{ name: 'Algebra' }, { name: 'Geometry' }] };
      });
  });

  it('SUBJECT-09 break test — replay harness simulates Inngest retry semantics', async () => {
    const { profileId, draftId, subjectId } = await seed();
    const handler = (interviewPersistCurriculum as any).fn;
    const harness = makeReplayHarness();

    // Attempt 1: extract-signals throws, no step result is cached.
    await expect(
      handler({
        event: { data: { version: 1, draftId, profileId, subjectId, subjectName: 'Test' } },
        step: harness.step,
      })
    ).rejects.toThrow(/transient|extract_signals_failed/);

    expect(harness.cache.has('extract-signals')).toBe(false);
    let draft = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(draft?.status).toBe('completing'); // not failed yet — onFailure runs only after Inngest's retry budget exhausts

    // Attempt 2: extract-signals re-runs (succeeds this time), downstream steps run for the first time.
    await handler({
      event: { data: { version: 1, draftId, profileId, subjectId, subjectName: 'Test' } },
      step: harness.step,
    });

    draft = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(draft?.status).toBe('completed');
    expect(draft?.failureCode).toBeNull();

    const topics = await db.select().from(curriculumTopics)
      .where(eq(curriculumTopics.profileId, profileId));
    expect(topics.map((t) => t.topicName).sort()).toEqual(['Algebra', 'Geometry']);
    expect(extractSignalsCalls).toBe(2);
  });

  it('idempotency: invoking handler twice on a completed draft does not double-insert topics', async () => {
    // → R2: Tests the unique-index ON CONFLICT path explicitly.
    const { profileId, draftId, subjectId } = await seed();
    const handler = (interviewPersistCurriculum as any).fn;

    // First successful invocation
    extractSignalsCalls = 1; // skip the first-throw branch
    await handler({
      event: { data: { version: 1, draftId, profileId, subjectId, subjectName: 'Test' } },
      step: makeReplayHarness().step,
    });

    // Second invocation with a fresh harness (simulates a duplicate dispatch
    // that slipped past idempotency guards).
    await handler({
      event: { data: { version: 1, draftId, profileId, subjectId, subjectName: 'Test' } },
      step: makeReplayHarness().step,
    });

    const topics = await db.select().from(curriculumTopics)
      .where(eq(curriculumTopics.profileId, profileId));
    expect(topics).toHaveLength(2); // exactly two, not four
  });

  it('onFailure maps PersistCurriculumError to its typed code', async () => {
    const { profileId, draftId, subjectId } = await seed();
    const onFailure = (interviewPersistCurriculum as any).onFailure;
    const { PersistCurriculumError } = require('@eduagent/schemas');
    await onFailure({
      event: { data: { version: 1, draftId, profileId, subjectId, subjectName: 'X' } },
      error: new PersistCurriculumError('extract_signals_failed'),
    });
    const draft = await db.query.onboardingDrafts.findFirst({
      where: eq(onboardingDrafts.id, draftId),
    });
    expect(draft?.status).toBe('failed');
    expect(draft?.failureCode).toBe('extract_signals_failed');
  });
});
```

- [ ] **Step 2: Run with Doppler stg env**

```bash
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest src/inngest/functions/interview-persist-curriculum.integration.test.ts --no-coverage --testTimeout=30000
```

Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts
git commit -m "test(api): SUBJECT-09 break test with replay-harness retry semantics [INTERACTION-DUR-L3]"
git push
```

---

## Task 9: Retry endpoint `POST /interview/retry-persist`

**Files:**
- Modify: `apps/api/src/routes/interview.ts` (add the new route)

Permits the mobile "Try Again" button to re-dispatch the event when the draft is `failed`. Singleton-guarded via the same atomic-conditional UPDATE pattern as Task 7.

- [ ] **Step 1: Implement**

```typescript
.post('/subjects/:subjectId/interview/retry-persist', async (c) => {
  const db = c.get('db');
  const profileId = requireProfileId(c.get('profileId'));
  const subjectId = c.req.param('subjectId');
  const bookId = c.req.query('bookId');

  const subject = await getSubject(db, profileId, subjectId);
  if (!subject) return notFound(c, 'Subject not found');

  const draft = await getDraftState(db, profileId, subjectId);
  if (!draft) return notFound(c, 'Draft not found');

  // Atomic claim: only flip from 'failed' → 'completing'. Concurrent retries
  // collapse to one dispatch.
  const claimed = await db
    .update(onboardingDrafts)
    .set({ status: 'completing', failureCode: null })
    .where(
      and(
        eq(onboardingDrafts.id, draft.id),
        eq(onboardingDrafts.profileId, profileId),
        eq(onboardingDrafts.status, 'failed'),
      ),
    )
    .returning({ id: onboardingDrafts.id });

  if (claimed.length === 0) {
    return c.json({ error: 'not-failed', status: draft.status }, 409);
  }

  await inngest.send({
    id: `persist-${draft.id}-retry-${Date.now()}`, // distinct from initial dispatch id
    name: 'app/interview.ready_to_persist',
    data: interviewReadyToPersistEventSchema.parse({
      version: 1,
      draftId: draft.id,
      profileId,
      subjectId,
      subjectName: subject.name,
      bookId,
    }),
  });

  return c.json({ status: 'completing' });
})
```

- [ ] **Step 2: Add tests in `apps/api/src/routes/interview.test.ts`**

Mirror the retry-filing pattern from `apps/api/src/routes/sessions.test.ts`. At minimum:
- 200 + dispatch on `failed` state
- 409 when status is `in_progress` / `completing` / `completed`
- 404 when draft missing (or different profile — IDOR break test)
- Concurrent-retry race: two parallel calls, only one dispatch

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/interview.ts apps/api/src/routes/interview.test.ts
git commit -m "feat(api): POST /interview/retry-persist [INTERACTION-DUR-L3]"
git push
```

---

## Task 10: Mobile UX — `completing` and `failed` states with foreground refetch → R2

**Files:**
- Modify: `apps/mobile/src/hooks/use-interview.ts`
- Create: `apps/mobile/src/components/interview/InterviewCompletingPanel.tsx`
- Create: `apps/mobile/src/components/interview/InterviewCompletingPanel.test.tsx`
- Create: `apps/mobile/src/components/interview/InterviewFailedPanel.tsx`
- Create: `apps/mobile/src/components/interview/InterviewFailedPanel.test.tsx`

Polling: exponential backoff `3 → 6 → 12 → 30` seconds, capped. Pause when `AppState !== 'active'`. **On AppState transitioning back to active, immediately invalidate the query** so the user doesn't stare at a stale `completing` panel for up to 30 s. → R2: rev 1 paused but had no foreground trigger.

`failureCode` maps to user copy on the device — never render raw failure strings. → R2.

- [ ] **Step 1: Hook — refetch interval helper + foreground invalidate**

In `apps/mobile/src/hooks/use-interview.ts` add an exported helper:

```typescript
const POLL_BACKOFF_MS = [3_000, 6_000, 12_000, 30_000];

export function computeInterviewRefetchInterval(
  status: 'in_progress' | 'completing' | 'completed' | 'failed' | 'expired' | undefined | null,
  pollAttempt: number,
  appActive: boolean
): number | false {
  if (status !== 'completing' || !appActive) return false;
  const idx = Math.min(pollAttempt, POLL_BACKOFF_MS.length - 1);
  return POLL_BACKOFF_MS[idx];
}
```

In the `useInterviewState` query setup add an effect that listens to AppState and **invalidates the interview-state query on transition into `active`**:

```typescript
useEffect(() => {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      queryClient.invalidateQueries({ queryKey: ['interview-state', subjectId] });
    }
  });
  return () => sub.remove();
}, [queryClient, subjectId]);
```

This is the single change that makes "background → foreground transitions show fresh state immediately" work. The push notification (Task 11) reaches backgrounded apps, but the in-app refetch on foreground covers users who didn't grant push permission.

Add unit tests for `computeInterviewRefetchInterval` exactly mirroring Task 4 of the filing observer plan.

- [ ] **Step 2: `InterviewCompletingPanel`**

```typescript
// apps/mobile/src/components/interview/InterviewCompletingPanel.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

export function InterviewCompletingPanel() {
  const [tier, setTier] = useState<'initial' | 'almost' | 'soft-fallback'>('initial');
  useEffect(() => {
    const t1 = setTimeout(() => setTier('almost'), 15_000);
    const t2 = setTimeout(() => setTier('soft-fallback'), 60_000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const message =
    tier === 'initial' ? 'Building your learning path…'
    : tier === 'almost' ? 'Almost there — this can take up to 30 seconds.'
    : 'Still working — you can wait or come back later.';

  return (
    <View testID="interview-completing-panel" accessibilityRole="alert">
      <ActivityIndicator />
      <Text>{message}</Text>
    </View>
  );
}
```

- [ ] **Step 3: `InterviewFailedPanel` — copy mapped from typed `failureCode`** → R2

```typescript
// apps/mobile/src/components/interview/InterviewFailedPanel.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useRetryInterviewPersist } from '../../hooks/use-interview';
import type { PersistFailureCode } from '@eduagent/schemas';

interface Props {
  subjectId: string;
  failureCode: PersistFailureCode | null;
}

const COPY: Record<PersistFailureCode, string> = {
  extract_signals_failed: "We couldn't understand the conversation well enough to build your path.",
  empty_signals: "We didn't get enough to work with from the chat.",
  persist_failed: "We hit a snag saving your learning path.",
  draft_missing: 'Your in-progress interview is no longer available.',
  unknown: "Something went wrong setting up your learning path.",
};

export function InterviewFailedPanel({ subjectId, failureCode }: Props) {
  const router = useRouter();
  const retry = useRetryInterviewPersist();
  const [error, setError] = React.useState<string | null>(null);

  const message = COPY[failureCode ?? 'unknown'];

  return (
    <View testID="interview-failed-panel" accessibilityRole="alert">
      <Text>{message}</Text>
      {error ? <Text>{error}</Text> : null}
      <Pressable
        testID="interview-retry-button"
        onPress={async () => {
          try {
            await retry.mutateAsync({ subjectId });
          } catch {
            setError("Couldn't retry — please try again in a moment.");
          }
        }}
        disabled={retry.isPending}
      >
        <Text>Try Again</Text>
      </Pressable>
      <Pressable
        testID="interview-go-home-button"
        onPress={() => router.replace('/')}
      >
        <Text>Go to home</Text>
      </Pressable>
    </View>
  );
}
```

Add a `useRetryInterviewPersist` hook in `apps/mobile/src/hooks/use-interview.ts` that POSTs to `/subjects/:subjectId/interview/retry-persist`.

Component tests:
- Renders correct copy for each `failureCode`
- Pressing Try Again calls the mutation
- Pressing Go to home calls `router.replace('/')`
- Disables Try Again while `isPending`
- Network error during retry surfaces inline error message

- [ ] **Step 4: Wire into the interview screen**

In `apps/mobile/src/app/(app)/...interview...`, add the new branches:

```typescript
if (state.status === 'completing') return <InterviewCompletingPanel />;
if (state.status === 'failed')
  return <InterviewFailedPanel subjectId={subjectId} failureCode={state.failureCode} />;
```

These render BEFORE the existing `completed → curriculum review handoff` branch.

- [ ] **Step 5: Run tests + typecheck + lint**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-interview.ts src/components/interview/ --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/use-interview.ts apps/mobile/src/components/interview/
git commit -m "feat(mobile): completing/failed UX with foreground refetch + typed failure copy [SUBJECT-09 fix] [INTERACTION-DUR-L3]"
git push
```

---

## Task 11: Push notification — its own Inngest step → R2

The push send is implemented as a separate `step.run('send-completion-push', ...)` inside the function (already in Task 5's implementation). This task just verifies the wiring exists in `services/notifications.ts` and adds the metric event handler.

**Files:**
- Verify/modify: `apps/api/src/services/notifications.ts`
- Modify: `packages/schemas/src/inngest-events.ts` (add `app/interview.completion_push_failed` event for the metric)

- [ ] **Step 1: Locate the existing push-send pattern**

```bash
cd apps/api && rg -nE "expo.*push|sendPush|notification" src/services/notifications.ts | head -10
```

If `sendPushToProfile(profileId, payload)` doesn't exist, add a thin wrapper around the existing notification primitive. If no push-send primitive exists at all, treat Task 11 as deferred and document it in `docs/plans/2026-05-01-completion-push.md` — Layer 3 still ships without it because the AppState foreground refetch (Task 10) covers the recovery path.

- [ ] **Step 2: Add the metric event schema**

In `packages/schemas/src/inngest-events.ts`:

```typescript
export const interviewCompletionPushFailedEventSchema = z.object({
  version: z.literal(1),
  profileId: z.string().uuid(),
  draftId: z.string().uuid(),
  subjectId: z.string().uuid(),
});
```

This is the queryable signal CLAUDE requires for "Silent recovery without escalation is banned." The Inngest dashboard's event browser becomes the dashboard for push-failure rate.

- [ ] **Step 3: Test**

The push-step path is already covered by Task 5 unit tests. Add one assertion that the metric event is dispatched on push failure:

```typescript
it('emits completion_push_failed event when sendPushToProfile throws', async () => {
  mockSendPush.mockRejectedValueOnce(new Error('Expo down'));
  const sendSpy = jest.spyOn(require('../client').inngest, 'send');
  // ...
  expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
    name: 'app/interview.completion_push_failed',
  }));
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/notifications.ts packages/schemas/src/inngest-events.ts apps/api/src/inngest/functions/interview-persist-curriculum.test.ts
git commit -m "feat(api): completion-push as own step + queryable failure metric [INTERACTION-DUR-L3]"
git push
```

---

## Task 12: Determinism eval check → R2

→ R2: rev 1 only re-ran `pnpm eval:llm` for snapshot stability. The actual regression vector is the *retry distribution* (one extract vs many) and the JSON-round-trip-through-step.run identity. Add a determinism check.

**Files:**
- Modify: `apps/api/eval-llm/scenarios/extract-signals-determinism.ts` (new scenario)

- [ ] **Step 1: Add the scenario**

A scenario that runs `extractSignals` on a fixed `exchangeHistory` twice and asserts the returned shape is byte-identical (after JSON round-trip simulation). This catches both:
1. Non-determinism in the prompt that would cause cached signals to disagree with fresh signals on Try Again.
2. Date/Map/Set/undefined values that would round-trip differently after the move from inline to `step.run`.

Skeleton:

```typescript
export const extractSignalsDeterminism = defineScenario('extract-signals-determinism', async () => {
  const fixed = [/* canonical exchange history */];
  const a = await extractSignals(fixed);
  const b = await extractSignals(fixed);
  // Round-trip both through JSON (simulates step.run serialization).
  const aJ = JSON.parse(JSON.stringify(a));
  const bJ = JSON.parse(JSON.stringify(b));
  expect(aJ).toEqual(a); // no Date/Map/Set/undefined that mutate on round-trip
  expect(bJ).toEqual(aJ);
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm eval:llm -- --scenario extract-signals-determinism
git add apps/api/eval-llm/scenarios/extract-signals-determinism.ts
git commit -m "test(api): eval determinism check for extractSignals [INTERACTION-DUR-L3]"
git push
```

---

## Final validation

- [ ] **Step 1: Full sweep**

```bash
pnpm exec nx run-many -t lint --projects=api,mobile
pnpm exec nx run-many -t typecheck --projects=api,mobile
pnpm exec nx run-many -t test --projects=api,mobile
```

Expected: all green.

- [ ] **Step 2: Run LLM eval harness — regression check**

```bash
pnpm eval:llm
pnpm eval:llm -- --scenario extract-signals-determinism
```

- [ ] **Step 3: Manual smoke — confirm the SUBJECT-09 reproduction is closed**

On staging:
1. Sign up a fresh account, start an interview.
2. Complete enough turns to trigger ready-to-persist.
3. Press "I'm done" (force-complete).
4. Expect: "Building your learning path…" panel appears immediately.
5. Within 30 s: panel transitions to curriculum review.
6. Background the app for 60 s mid-`completing`. Foreground. Expect: state refetches **immediately** (not after the next backoff tick).
7. Force a failure (e.g., temporarily route LLM through a stub that throws). Expect: panel transitions to `failed`, copy reflects `extract_signals_failed`, "Try Again" succeeds when LLM is restored.

If the staging Inngest function is mis-registered, the panel will spin forever. Confirm registration via the Inngest dashboard before declaring done.

- [ ] **Step 4: Race-condition smoke — fire two complete calls in parallel**

```bash
# Two parallel curl calls to /interview/complete with same auth — assert
# Inngest dashboard shows exactly ONE run for that draft.
```

- [ ] **Step 5: PR review per CLAUDE.md**

Read every code-review finding. Treat security/correctness findings as blocking. The "Verified By" column for each finding-resolution commit must reference the integration test in Task 8 or the race-condition test in Task 7 step 5.

---

## Self-review against the spec

### Spec coverage

| Spec section | Covered by |
|---|---|
| 3a — DraftStatus enum extension (completing, failed) | Task 1 |
| 3b — Inngest function with three checkpoints + push step | Task 5 |
| 3b — onFailure handler (A4) maps to typed code | Task 5 |
| 3b — extractedSignals cached on draft (A3) — structural check | Task 5 (`topics.length > 0`) |
| 3b — db.batch persist + mark-completed + topicsGenerated (A7) | Task 4 |
| 3c — content-derived unique key on topics (A5) | Task 2 (single non-partial index via COALESCE) |
| 3d — singleton guard (A11) | Task 7 (atomic conditional UPDATE + Inngest event idempotency) |
| 3d — payload validated against zod schema (A12) | Task 3 |
| 3e — completing UX with exponential backoff + foreground invalidate (A13) | Task 10 |
| 3e — failed UX with Try Again + Go to home, typed copy | Task 10 |
| 3e — push notification on completion (A13) — own step + metric | Tasks 5, 11 |
| Verification — SUBJECT-09 break test (A16) — replay-harness retry semantics | Task 8 |
| Implementation order — schema migration before code, prod-gated | Tasks 1, 2 deploy first; production gate explicit |
| Failure modes documented | New section [Failure Modes](#failure-modes--r2--entirely-new-section) |

### Out of scope (Layer 2 territory)

- `orphan_reason` column + `persistUserMessageOnly` — Layer 2.
- LLM context-builder rule for orphan turns — Layer 2.
- Parent dashboard handling for `completing` drafts (A15) — Layer 2.

### Out of scope (Layer 1 territory)

- Saving the user's terminal exchange durably on the *client* before dispatch — Layer 1 outbox.
- For full SUBJECT-09 closure (no message ever lost), Layer 1 must ship alongside or before Layer 3 in production. See [Layer 1 dependency](#layer-1-dependency).

---

## Adversarial Review Amendments (R2)

The 14 findings raised against rev 1, and where each is closed:

| # | Finding | Closed by |
|---|---|---|
| 1 | Partial-index ON CONFLICT will throw at runtime | Task 2 — single non-partial index via `COALESCE(book_id, sentinel)` |
| 2 | Check-then-act dispatch race — two concurrent finalizers both dispatch | Task 7 — atomic conditional UPDATE with `RETURNING`; Task 5 — Inngest `idempotency: 'event.data.draftId'` as second line of defence |
| 3 | "Break test" mocks `step.run` in a way that doesn't match Inngest semantics | Tasks 5/8 — replay harness that mirrors checkpoint memoization |
| 4 | Cache check `Object.keys.length > 0` returns true for `{ topics: [] }`; persists empty curriculum | Task 5 — structural check `topics?.length > 0`; explicit regression test |
| 5 | `topicsGenerated` update outside `db.batch` — observable partial state | Task 4 — included in batch |
| 6 | `failureReason = error.message.slice(0, 500)` leaks provider error text to user devices | Tasks 1/5/10 — typed `failureCode` enum; raw error logged server-side only; mobile maps code to copy |
| 7 | Push send failure swallowed silently inside persist step | Tasks 5/11 — separate `step.run('send-completion-push')`; failure dispatches `app/interview.completion_push_failed` event for queryable metric |
| 8 | No Failure Modes table | New [Failure Modes](#failure-modes--r2--entirely-new-section) section |
| 9 | Migration ordering only gated on staging | Tasks 1/2 — explicit production migrate gate |
| 10 | AppState pause-on-background but no foreground refetch | Task 10 — `AppState.addEventListener` invalidates query on `active` |
| 11 | JSON round-trip through `step.run` could change shapes | Task 12 — determinism eval scenario asserts JSON identity |
| 12 | Plan claims to close SUBJECT-09 but only closes the 5xx half | Layer 1 dependency table; ticket-closure note |
| 13 | sortOrder lottery on cache | Documented behaviour; first successful extraction's ordering is canonical |
| 14 | `pnpm eval:llm` snapshot doesn't catch determinism regressions | Task 12 — explicit determinism scenario |

### Placeholder scan

Every step has runnable code or commands. Where a project-specific helper (`sendPushToProfile`) may not exist, Task 11 explicitly documents the fallback (defer + ship without push; AppState foreground refetch covers the gap).

### Type consistency

- `DraftStatus` literal members: `'in_progress' | 'completing' | 'completed' | 'failed' | 'expired'` — used the same way in API + mobile.
- `PersistFailureCode` literal members: `'extract_signals_failed' | 'empty_signals' | 'persist_failed' | 'draft_missing' | 'unknown'` — defined in `@eduagent/schemas`, used in API DB writes, mobile copy mapping, integration test assertions.
- Inngest event names: `'app/interview.ready_to_persist'`, `'app/interview.completion_push_failed'` — literal strings, dispatched and handled identically.
- Refetch interval values: `[3_000, 6_000, 12_000, 30_000]` — used in helper and tests; tests assert each entry.
