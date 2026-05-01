# Interaction Durability — Capture Every User Interaction

**Date:** 2026-05-01
**Status:** Design spec — pre-implementation
**Companion to:** [`project_summary_draft_backup_deferred`](../../memory) (revives the deferred Option B/C decision; broadens scope from session-summary drafts to all exchange-style flows)
**Driver:** [SUBJECT-09 P1 bug](https://app.notion.com/p/SUBJECT-09-Interview-skip-ahead-and-save-fail-with-server-error-onboarding-blocked-3538bce91f7c813baf2ce1b18f19ff6b) — onboarding interview persistently fails because user input is silently dropped on `persistCurriculum` failure. Same architectural anti-pattern exists in live tutoring sessions ([`session-exchange.ts:1116`](../../apps/api/src/services/session/session-exchange.ts), [`session-exchange.ts:1130`](../../apps/api/src/services/session/session-exchange.ts)).

## Purpose

Establish a single rule: **every user interaction must be durably captured by the time the request returns. The LLM rebuilds context from those captured interactions on the next turn.** Order of capture vs. processing is implementation detail; durability is not.

This spec also ships the SUBJECT-09 fix as a side effect — the durability rule, applied to interview, dissolves the silent-drop failure mode that 15+ prior patches in `interview.tsx` could not reach.

## Problem

Today's exchange persistence couples user input to LLM output:

| Surface | Where the coupling lives | What gets dropped |
| --- | --- | --- |
| Live tutoring | [`session-exchange.ts:1116-1148`](../../apps/api/src/services/session/session-exchange.ts) — `persistExchangeResult(input.message, parsed.cleanResponse, ...)` writes both at the end. Fallback branch returns *before* persist. | User's message |
| Interview SSE | [`routes/interview.ts:242-278`](../../apps/api/src/routes/interview.ts) — `updatedHistory` only written in success branch of `onComplete`. Catch on line 288 emits SSE error without persisting. | User's terminal message (the SUBJECT-09 case) |
| Interview force-complete | [`routes/interview.ts:309-369`](../../apps/api/src/routes/interview.ts) — three sequential awaits with no transaction; `persistCurriculum` failure leaves draft half-written | Draft consistency, `extractedSignals` written but `status` never flips |

Production effects already observed:

1. **Onboarding blocked** — SUBJECT-09 reproduces every time `persistCurriculum`'s LLM step fails or the Worker's 30s budget is exceeded.
2. **AI amnesia** — next session's LLM context is built from the persisted exchange table; dropped messages never enter the model's view.
3. **Parent under-reporting** — PARENT-05 child-session drill-down reads the same table, so a child's effort is invisible to the parent if the AI side hiccupped.
4. **Eval bias** — `pnpm eval:llm` corpus is biased toward exchanges that succeeded; failure-mode regressions cannot surface in CI.

## The Rule

> Every interaction the learner submits must end up in durable storage before the originating request returns. The LLM context-builder treats captured-but-orphaned user turns as first-class history and renders them with a marker so the model knows no assistant turn was generated. Whether persistence happens before, during, or after processing is an implementation detail per surface.

## Three Layers

The spec ships in three layers, stacked from cheapest to most thorough. Each layer is independently mergeable; ASAP-path is **Layer 1 + Layer 3**.

### Layer 1 — Mobile message outbox (ASAP, no schema change)

**Goal:** every chat-style send is durable on the device the moment the user presses Send. If the SSE round-trip or any server-side persistence fails, the message stays in the outbox and is replayed on next app launch / next manual send.

**Files:**
- New: [`apps/mobile/src/lib/message-outbox.ts`](../../apps/mobile/src/lib/message-outbox.ts)
- Wired into: [`apps/mobile/src/hooks/use-interview.ts`](../../apps/mobile/src/hooks/use-interview.ts), [`apps/mobile/src/components/session/use-session-actions.ts`](../../apps/mobile/src/components/session/use-session-actions.ts) (and `useStreamMessage` for live tutoring)

**Storage shape (SecureStore, profile-scoped):**

```ts
type OutboxEntry = {
  id: string;                              // ULID; doubles as idempotency key
  flow: 'session' | 'interview';
  surfaceKey: string;                       // sessionId or subjectId+bookId
  content: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: 'pending' | 'confirmed' | 'permanently-failed';
  failureReason?: string;                   // last server error, for support
};
```

Key: `outbox-${profileId}-${flow}` → `OutboxEntry[]` (array per flow per profile).

**Lifecycle:**

1. User presses Send → write entry to outbox with `status: 'pending'` BEFORE issuing the SSE call.
2. SSE call carries `Idempotency-Key: <entry.id>` in the request headers.
3. On `done` SSE frame OR successful 200 response, mark entry `confirmed`. Sweep confirmed entries on next outbox read (don't keep forever).
4. On any failure path (SSE error frame, network drop, app backgrounded mid-stream), entry stays `pending`.
5. On app launch + on manual user retry, drain the outbox: replay each pending entry in order, oldest first, single-flight per flow.
6. After 5 attempts with no confirmation, mark `permanently-failed`. Surface to user with a "send failed — copy text?" UX so the words can be recovered manually.

**Server-side requirement:** the existing handlers must accept and respect `Idempotency-Key`. Layer 2 covers this.

**Why this is the ASAP layer:** zero schema change, zero mobile UI change for the happy path, zero behavioural change for non-failing requests. Pure defence-in-depth on the device side.

### Layer 2 — Server-side input persistence on every path

**Goal:** when the AI side fails (LLM stream throws, envelope unparseable, classifier fallback, downstream persist throws), still write the user's message to history with a marker. The next LLM turn sees the orphan and acknowledges it.

#### 2a. Schema change

Add to `sessionEvents` and `onboardingDrafts.exchangeHistory[]`:

```ts
// packages/schemas/src/exchange.ts
type ExchangeEntry = {
  role: 'user' | 'assistant';
  content: string;
  /** NEW. Set on user turns when the assistant turn was lost. */
  orphan_reason?:
    | 'llm_stream_error'        // SSE threw before completion
    | 'llm_empty_or_unparseable' // BUG-941 fallback path
    | 'persist_curriculum_failed'
    | 'worker_timeout'
    | 'unknown_post_stream';
  /** NEW. ULID provided by mobile outbox; used for server-side idempotency. */
  client_id?: string;
};
```

Migration: additive only. Existing rows are valid (both new fields optional). No backfill required. **Rollback:** drop the two columns from `sessionEvents`; rewrite `onboardingDrafts.exchangeHistory` JSONB to strip orphan fields. Both reversible — no data loss.

#### 2b. Helper: `persistUserMessageOnly`

```ts
// apps/api/src/services/session/session-exchange.ts
export async function persistUserMessageOnly(
  db: Database,
  profileId: string,
  sessionId: string,
  message: string,
  options: {
    clientId?: string;
    orphanReason: ExchangeEntry['orphan_reason'];
  }
): Promise<void>;
```

Idempotent: if a row with `client_id === options.clientId` already exists for this session, no-op.

Mirror in interview path:

```ts
// apps/api/src/services/interview.ts
export async function appendOrphanInterviewTurn(
  db: Database,
  profileId: string,
  draftId: string,
  message: string,
  options: { clientId?: string; orphanReason: string }
): Promise<void>;
```

#### 2c. Wire into failure paths

| Site | Today | After |
| --- | --- | --- |
| [`session-exchange.ts:1116`](../../apps/api/src/services/session/session-exchange.ts) (fallback branch) | Returns without persisting | Calls `persistUserMessageOnly(..., { orphanReason: 'llm_empty_or_unparseable' })` then returns the fallback descriptor |
| [`session-exchange.ts:1130`](../../apps/api/src/services/session/session-exchange.ts) (stream throws) | Currently no try/catch around `streamExchange` outcome path | Wrap in try/catch; on throw, call `persistUserMessageOnly(..., { orphanReason: 'llm_stream_error' })` and rethrow |
| [`routes/interview.ts:288-303`](../../apps/api/src/routes/interview.ts) (post-stream catch) | Emits error SSE frame, no persist | Calls `appendOrphanInterviewTurn` *before* emitting the error frame |
| [`routes/interview.ts:309-369`](../../apps/api/src/routes/interview.ts) (force-complete) | Three serial awaits, partial state on failure | Wrap `persistCurriculum` call in try/catch; on failure, roll `extractedSignals` write back to its prior value (or accept the write — see open question OQ-1) and surface the error. The SUBJECT-09 root cause is fully addressed in Layer 3 below. |

#### 2d. LLM context-builder rule

Wherever conversation history is rebuilt for a model call, render orphan user turns with a system-visible note:

```text
USER: <message content>
[no assistant response was generated for the previous turn]
USER: <next message>
```

The model is instructed (in system prompt) to acknowledge the gap if relevant rather than pretending the earlier turn never happened.

Touchpoints (all under [`apps/api/src/services/`](../../apps/api/src/services)):
- `session/session-exchange.ts` → `prepareExchangeContext`
- `interview.ts` → `processInterviewExchange` and `streamInterviewExchange` history wrapping (lines 478-487 and 563-572)
- `session-recap.ts`
- Any other surface that ingests `exchangeHistory` for an LLM call

### Layer 3 — Inngest-backed `persistCurriculum`

**Goal:** fix the SUBJECT-09 root cause. `persistCurriculum` becomes durable async work, idempotent, retryable, with explicit failure UX.

**Reference implementation:** [`apps/api/src/inngest/functions/book-pre-generation.ts`](../../apps/api/src/inngest/functions/book-pre-generation.ts) — same shape, already in production, already idempotent.

#### 3a. Draft status enum

Extend [`@eduagent/schemas`](../../packages/schemas/src/draft.ts) `DraftStatus`:

```ts
type DraftStatus =
  | 'in_progress'
  | 'completing'   // NEW — Inngest job dispatched, working
  | 'completed'
  | 'failed'       // NEW — Inngest exhausted retries
  | 'expired';
```

Migration: additive enum values. **Rollback:** revert any rows in `completing` or `failed` to `in_progress` (safe — caller will retry naturally). Drop enum values.

#### 3b. New Inngest function

```ts
// apps/api/src/inngest/functions/interview-persist-curriculum.ts
export const interviewPersistCurriculum = inngest.createFunction(
  {
    id: 'interview-persist-curriculum',
    name: 'Persist curriculum after interview completion',
    retries: 3,
    concurrency: { limit: 5, key: 'event.data.profileId' },
  },
  { event: 'app/interview.ready_to_persist' },
  async ({ event, step }) => {
    const { draftId, profileId, subjectId, subjectName, bookId } =
      event.data;

    const signals = await step.run('extract-signals', async () => {
      const db = getStepDatabase();
      const draft = await getDraftState(db, profileId, subjectId);
      if (!draft) throw new NonRetriableError('draft-disappeared');
      return await extractSignals(draft.exchangeHistory);
    });

    await step.run('save-signals', async () => {
      const db = getStepDatabase();
      await updateDraft(db, profileId, draftId, { extractedSignals: signals });
    });

    const bookTitle = bookId
      ? await step.run('load-book-title', async () => {
          const db = getStepDatabase();
          return await getBookTitle(db, profileId, bookId, subjectId);
        })
      : null;

    await step.run('generate-and-persist-curriculum', async () => {
      const db = getStepDatabase();
      const draft = await getDraftState(db, profileId, subjectId);
      // persistCurriculum becomes idempotent — see 3c.
      await persistCurriculum(
        db, profileId, subjectId, subjectName,
        { ...draft, extractedSignals: signals },
        bookId, bookTitle ?? undefined,
      );
    });

    await step.run('mark-completed', async () => {
      const db = getStepDatabase();
      await updateDraft(db, profileId, draftId, { status: 'completed' });
    });
  }
);
```

Each `step.run` checkpoints on success. On retry, only the failed step re-runs — extracted signals don't get re-LLM'd, partially-inserted topics don't get re-inserted.

#### 3c. Make `persistCurriculum` idempotent

Source: [`apps/api/src/services/interview.ts:773-866`](../../apps/api/src/services/interview.ts) and [`apps/api/src/services/curriculum.ts`](../../apps/api/src/services/curriculum.ts) helpers.

Required changes:

- `db.insert(curriculumTopics)` → use `onConflictDoNothing` keyed on `(curriculumId, bookId, sortOrder)`. Add a unique index if one doesn't exist (verify schema).
- `ensureCurriculum` and `ensureDefaultBook` are already named idempotently — verify they actually are. Add tests if not.
- For book-scoped path: short-circuit when `curriculumBooks.topicsGenerated === true` for this `bookId`.

Pattern is identical to `persistBookTopics`'s existing idempotency guard referenced in [`book-pre-generation.ts:33`](../../apps/api/src/inngest/functions/book-pre-generation.ts).

#### 3d. Route handlers dispatch instead of run inline

```ts
// routes/interview.ts force-complete and stream finalizer (isComplete branch)
await updateDraft(db, profileId, draft.id, { status: 'completing' });
await inngest.send({
  name: 'app/interview.ready_to_persist',
  data: {
    draftId: draft.id, profileId, subjectId,
    subjectName: subject.name, bookId,
  },
});
return c.json({
  isComplete: true,
  status: 'completing',                  // NEW
  exchangeCount: ...,
  extractedSignals: undefined,           // populated by Inngest, polled later
});
```

#### 3e. Mobile UX for `completing` and `failed`

| Draft status | Mobile behaviour |
| --- | --- |
| `in_progress` | Today's interview screen; no change |
| `completing` (NEW) | Replace the post-interview "Let's Go" card with a "Building your learning path…" panel. Poll `GET /interview/state` every 3 s until status flips. Show a confidence message at 15 s ("Almost there — this can take up to 30 seconds") and a soft fallback at 60 s ("Still working — you can wait or come back later"). |
| `completed` | Today's curriculum-review handoff; no change |
| `failed` (NEW) | Surface inline error with the failure reason (truncated) and a primary "Try Again" button that POSTs to a new `/interview/retry-persist` endpoint, which re-dispatches the Inngest event. Secondary "Go to home" escape per `feedback_human_override_everywhere`. |
| `expired` | Today's expired flow; no change |

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Outbox `pending` after stream error | SSE call fails before `done` frame | Last sent message stays visible in chat with subtle "queued" indicator | Auto-replay on next send / next app launch |
| Outbox `permanently-failed` | 5 replay attempts all failed | Inline banner "We couldn't save these messages — copy them?" with copy-to-clipboard for each pending entry | Manual copy; user can paste into a fresh send. Bug filed automatically with profile-id + entry-id. |
| Server orphan turn persisted | LLM emitted unparseable response | Fallback prompt appears as today (no behavioural change for the user) | LLM acknowledges the gap on the next turn via context-builder rule (Layer 2d) |
| Draft stuck in `completing` | Inngest job started but never finished within 60 s | Mobile shows "Still working — you can wait or come back later" | Polling continues; if Inngest succeeds eventually, status flips to `completed`. If Inngest exhausts retries → `failed` (next row). |
| Draft `failed` | Inngest exhausted 3 retries | Inline error with reason, "Try Again" + "Go to home" | "Try Again" re-dispatches event; "Go to home" leaves user on a benign screen with the draft preserved for later retry |
| Draft `failed` permanently | User abandons after multiple failures | Draft is preserved (status `failed`, exchange history intact) | New `interview-failed-cleanup` Inngest cron (separate, future) sweeps after 30 d to either auto-retry once more or notify the user |
| Idempotency-Key collision on replay | Mobile replays a message that the server actually persisted before the disconnect | Server returns 200 + cached result | No duplicate persistence; outbox flips entry to `confirmed` |
| `extractedSignals` half-written, then SubjectId leaked | Step 2 of Inngest succeeds, step 3 throws non-retriable | Mobile sees `completing` → eventual `failed` | `extractedSignals` is harmless on its own; next retry is idempotent |

## Implementation Order

1. **Layer 1** (~ 1.5 days) — mobile outbox + `Idempotency-Key` middleware on existing endpoints. Ships protection for both interview and sessions immediately. Independently merge-able and revert-able.
2. **Layer 3** (~ 2 days) — Inngest function + idempotent `persistCurriculum` + status enum + mobile `completing`/`failed` UX. Ships the SUBJECT-09 root-cause fix.
3. **Layer 2** (~ 2 days) — schema column adds + orphan persistence + context-builder rule. Ships the broader durability rule.

**ASAP path: Layer 1 + Layer 3 first (≈ 3.5 days), Layer 2 follows in the same week.** SUBJECT-09 is fixed at end of step 2; the rule is fully enforced at end of step 3.

## Verification

Per `feedback_fix_verification_rules.md`, every layer ships with break tests:

- **Layer 1:** Maestro flow that turns off network mid-send, force-quits the app, restarts, asserts the message replays. Plus jest unit test for outbox lifecycle.
- **Layer 2:** integration test that mocks `persistCurriculum` to throw and asserts the user message lands in `onboardingDrafts.exchangeHistory` with `orphan_reason: 'persist_curriculum_failed'`. Mirror for `session-exchange.ts` paths.
- **Layer 3:** integration test that injects a transient failure on step 3 of the Inngest function and asserts: (a) step 1 result reused on retry (no second LLM call), (b) topics not double-inserted, (c) status flips `completing → completed` after retry succeeds.

Plus the SUBJECT-09 break test specifically: integration test that reproduces the exact bug repro, asserts a P0 regression if a future change re-introduces silent input drop.

## Open Questions

| ID | Question | Default |
| --- | --- | --- |
| OQ-1 | When force-complete throws after `extractedSignals` was written but before `status` flips, do we roll signals back? | No — keep the write. Inngest retry will re-do it idempotently. Simpler to roll forward than back. |
| OQ-2 | How long before an unconfirmed outbox entry shows the "queued" indicator? | 5 s after Send. Below that, normal "sending" state. |
| OQ-3 | Does the parent dashboard ever surface orphan turns? | No (default). PARENT-05 transcript filters orphan entries from the rendered view; raw record still in DB. |
| OQ-4 | Does the LLM eval harness need a new fixture for orphan turns? | Yes — add a fixture profile with one orphan user turn so context-builder behaviour is regression-tested. Tier 1 only (no live LLM). |
| OQ-5 | Should we ship Layer 2 before Layer 3 to maximise SUBJECT-09 mitigation surface area? | No — Layer 3 is the actual fix. Layer 2 is broader hygiene. Keep the recommended order. |

## Out of Scope

- Quiz answer durability, dictation correction durability, homework photo durability, recall answer durability. Each is a separate review per the spread analysis from this conversation. Likely smaller fixes; defer to a follow-up spec.
- The atomicity gap (`db.batch()` not used anywhere). Addressed opportunistically when persistCurriculum is rewritten in Layer 3 — broader sweep is a separate cleanup.
- Server-side draft mirror for long-form composition surfaces (session summary, dictation correction). The deferred `project_summary_draft_backup_deferred` decision remains deferred for now; this spec focuses on chat-style exchange surfaces.
- Replacing `[BUG-941]` fallback semantics. The fallback frame is still emitted; this spec only changes whether the user's input is also persisted alongside.

## Rollback

| Layer | Rollback procedure | Data loss? |
| --- | --- | --- |
| Layer 1 | Remove outbox writes from mobile hooks; SecureStore data is profile-local and self-clears within 7 days TTL | None — outbox is mobile-only state |
| Layer 2 | Revert `persistUserMessageOnly` calls; drop two new schema columns (`orphan_reason`, `client_id`); rewrite `exchangeHistory` JSONB to strip the new fields | None — additive change only |
| Layer 3 | Revert route changes to call `persistCurriculum` synchronously; remove Inngest function; revert any rows in `completing`/`failed` to `in_progress` so users naturally retry | Possible: drafts that completed *only* via Inngest after rollback would re-do work. Acceptable — idempotency guarantees no double-write |

All three layers are reversible without data loss. Per CLAUDE.md schema-and-deploy-safety rule.

## Cross-References

- Memory: [`project_summary_draft_backup_deferred`](../../memory) — the deferred decision this spec revives and broadens
- Memory: [`feedback_human_override_everywhere`](../../memory) — applied to `failed` UX in Layer 3
- Memory: [`feedback_spec_failure_modes`](../../memory) — every layer has a Failure Modes row
- Memory: [`feedback_fix_verification_rules`](../../memory) — every layer has a break test
- Memory: [`project_neon_transaction_facts`](../../memory) — informs why `db.batch()` is the only ACID primitive and why we use Inngest checkpointing instead
- Memory: [`project_llm_marker_antipattern`](../../memory) — the envelope contract this spec preserves
- Inngest reference: [`book-pre-generation.ts`](../../apps/api/src/inngest/functions/book-pre-generation.ts) — the working template for Layer 3
- Bug: [SUBJECT-09 in Notion](https://app.notion.com/p/SUBJECT-09-Interview-skip-ahead-and-save-fail-with-server-error-onboarding-blocked-3538bce91f7c813baf2ce1b18f19ff6b)
