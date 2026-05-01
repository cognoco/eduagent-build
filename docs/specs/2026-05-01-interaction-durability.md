# Interaction Durability — Capture Every User Interaction

**Date:** 2026-05-01
**Status:** Design spec — pre-implementation, post-adversarial-review (2026-05-01)
**Companion to:** [`project_summary_draft_backup_deferred`](../../memory) (revives the deferred Option B/C decision; broadens scope from session-summary drafts to all exchange-style flows)
**Driver:** [SUBJECT-09 P1 bug](https://app.notion.com/p/SUBJECT-09-Interview-skip-ahead-and-save-fail-with-server-error-onboarding-blocked-3538bce91f7c813baf2ce1b18f19ff6b) — onboarding interview persistently fails because user input is silently dropped on `persistCurriculum` failure. Same architectural anti-pattern exists in live tutoring sessions ([`session-exchange.ts:1116`](../../apps/api/src/services/session/session-exchange.ts), [`session-exchange.ts:1130`](../../apps/api/src/services/session/session-exchange.ts)).

> **Reader note (2026-05-01):** an adversarial review raised 18 findings against this spec. Several of them rewrite the design. They are recorded in [Adversarial Review Amendments](#adversarial-review-amendments-2026-05-01) and referenced inline as `→ A#`. If a passage carries a `→ A#` marker, read the amendment before implementing.

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

**Storage shape (AsyncStorage, profile-scoped) → A9:**

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
3. On `done` SSE frame OR successful 200 response, **delete the entry from the outbox inline** (single write, no deferred sweep) → A10.
4. On any failure path (SSE error frame, network drop, app backgrounded mid-stream), entry stays `pending`.
5. On app launch + on manual user retry, drain the outbox: replay each pending entry in order, oldest first, single-flight per flow.
6. After **3** attempts with no confirmation, escalate to the server-side spillover endpoint `POST /support/outbox-spillover` (Layer 1 ships this; writes to `support_messages`) → A8. Mobile surfaces "We saved your messages — we'll get back to you." If spillover itself fails, fall back to the `permanently-failed` + copy-to-clipboard UX.

**Server-side requirement:** the existing handlers must accept and respect `Idempotency-Key`. Designed in [A2 — Idempotency Middleware](#a2--idempotency-middleware-design-finding-2) and shipped as a sub-step of Layer 1 (no longer Layer 2) so Layer 1's idempotency is real on day one → A1.

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
    | 'unknown_post_stream';
  // worker_timeout removed → A5 (server cannot write it; handled in mobile spillover metadata).
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

→ A6 — the original design rendered the marker as in-band text; that is a prompt-injection vector. Mid-conversation `role: 'system'` messages are also invalid: Anthropic's Messages API rejects them — `system` is a top-level parameter only. Replaced with a top-level system-parameter addendum plus a user-content sanitizer.

Orphan user turns are noted via `<server_note>` tags appended to the top-level `system` string. The chat-completion payload's `messages` array contains only `user`/`assistant` roles. A sanitizer strips any `<server_note>` tags from user-role content before the provider call, preventing injection.

```ts
// Pseudo for prepareExchangeContext / processInterviewExchange
// 1. Build orphan notes (capped at last 3 orphans)
const orphanNotes = history
  .filter((t) => t.orphan_reason)
  .slice(-3)
  .map((t) => `<server_note kind="orphan_user_turn" reason="${t.orphan_reason}"/>`)
  .join('\n');

// 2. Append to system string — NOT as a role: 'system' message
const systemWithNotes = orphanNotes
  ? `${baseSystemPrompt}\n\n${orphanNotes}`
  : baseSystemPrompt;

// 3. Sanitize user-role content to strip injected server_note tags
const sanitizedMessages = messages.map((m) =>
  m.role === 'user'
    ? { ...m, content: m.content.replace(/<server_note[^>]*\/>/g, '') }
    : m
);

// 4. Call provider with sanitized messages + annotated system
await callProvider({ system: systemWithNotes, messages: sanitizedMessages });
```

The LLM is instructed (in system prompt) to acknowledge the gap if relevant rather than pretending the earlier turn never happened.

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

Migration: additive enum values plus a `failure_code text` column on `onboarding_drafts` (constrained at the application boundary by `persistFailureCodeSchema` — not a Postgres enum, so the value set evolves in code without DDL). **Rollback:** revert any rows in `completing` or `failed` to `in_progress` (safe — caller will retry naturally). Drop enum values. Drop `failure_code` column.

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

    // → A3: signals are persisted-cached on the draft so retries are
    // truly idempotent even when extractSignals (an LLM call) is non-deterministic.
    const signals = await step.run('extract-signals', async () => {
      const db = getStepDatabase();
      const draft = await getDraftState(db, profileId, subjectId);
      if (!draft) throw new NonRetriableError('draft-disappeared');
      // Tighter check: { topics: [] } is falsy for our purposes — persisting an
      // empty curriculum leaves the user with no recovery surface. Rejects both
      // null and { topics: [] } → A3.
      const cached = draft.extractedSignals as { topics?: { name: string }[] } | null;
      if (cached?.topics && cached.topics.length > 0) return cached; // cached from prior partial run
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

    // → A7: bundle persist + status flip in db.batch() so the polling endpoint
    // never observes "curriculum exists, status still completing".
    await step.run('generate-persist-and-mark-completed', async () => {
      const db = getStepDatabase();
      const draft = await getDraftState(db, profileId, subjectId);
      // persistCurriculum becomes idempotent — see 3c.
      await persistCurriculumAndMarkComplete(
        db, profileId, subjectId, subjectName,
        { ...draft, extractedSignals: signals },
        bookId, bookTitle ?? undefined,
        draftId,
      );
    });
  },
  {
    // → A4: explicit onFailure to flip status. Without this, NonRetriableError
    // leaves the draft stuck in `completing` forever. failureCode is a typed
    // enum value — raw error.message is logged server-side only, never written
    // to DB or returned to mobile.
    onFailure: async ({ event, error }) => {
      const db = getInngestDatabase();
      const code = classifyError(error); // returns PersistFailureCode
      await updateDraft(db, event.data.profileId, event.data.draftId, {
        status: 'failed',
        failureCode: code,
      });
      logger.error('interview-persist-curriculum exhausted retries', {
        profileId: event.data.profileId,
        draftId: event.data.draftId,
        failureCode: code,
        rawError: error?.message, // server-side log only
      });
    },
  }
);
```

Each `step.run` checkpoints on success. On retry, only the failed step re-runs — extracted signals don't get re-LLM'd, partially-inserted topics don't get re-inserted.

#### 3c. Make `persistCurriculum` idempotent

Source: [`apps/api/src/services/interview.ts:773-866`](../../apps/api/src/services/interview.ts) and [`apps/api/src/services/curriculum.ts`](../../apps/api/src/services/curriculum.ts) helpers.

Required changes:

- `db.insert(curriculumTopics)` → use `onConflictDoNothing` keyed on **`(curriculumId, COALESCE(book_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(topic_name)))`** → A5. `sortOrder` is unsafe because LLM jitter on retry produces different orderings without colliding. A single non-partial index covers both with-book and without-book topics via the `COALESCE` sentinel. Migration adds the unique index ahead of Layer 3 code.
- `ensureCurriculum` and `ensureDefaultBook` are already named idempotently — verify they actually are. Add tests if not.
- For book-scoped path: short-circuit when `curriculumBooks.topicsGenerated === true` for this `bookId`. The `db.batch()` in `persistCurriculumAndMarkComplete` (→ A7) atomically sets this flag together with the topic insert and draft status flip.

Pattern is identical to `persistBookTopics`'s existing idempotency guard referenced in [`book-pre-generation.ts:33`](../../apps/api/src/inngest/functions/book-pre-generation.ts).

#### 3d. Route handlers dispatch instead of run inline

```ts
// routes/interview.ts force-complete and stream finalizer (isComplete branch)
// → A11: atomic-conditional UPDATE — only the winner dispatches.
// No check-then-act; no 409. The loser short-circuits silently with 200.
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
    // Inngest-level idempotency — duplicate sends collapse server-side.
    id: `persist-${draft.id}`,
    name: 'app/interview.ready_to_persist',
    // → A12: payload validated against zod schema in
    // packages/schemas/src/inngest-events.ts. Includes `version: 1` for
    // forward-compatibility on payload shape changes.
    data: interviewReadyToPersistEventSchema.parse({
      version: 1,
      draftId: draft.id, profileId, subjectId,
      subjectName: subject.name, bookId,
    }),
  });
}

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
| `completing` (NEW) | Replace the post-interview "Let's Go" card with a "Building your learning path…" panel. **Polling: exponential backoff 3 → 6 → 12 → 30 s capped, paused while app is backgrounded** → A13. Server emits a push notification on `mark-completed` so a backgrounded app gets the result without polling on resume. Show a confidence message at ~15 s ("Almost there — this can take up to 30 seconds") and a soft fallback at ~60 s ("Still working — you can wait or come back later"). |
| `completed` | Today's curriculum-review handoff; no change |
| `failed` (NEW) | Surface inline error with user-facing copy mapped from `failureCode` (raw error text never reaches mobile) and a primary "Try Again" button that POSTs to a new `/interview/retry-persist` endpoint, which re-dispatches the Inngest event. Secondary "Go to home" escape per `feedback_human_override_everywhere`. |
| `expired` | Today's expired flow; no change |

## Failure Modes

| State | Trigger | User sees | Recovery |
| --- | --- | --- | --- |
| Outbox `pending` after stream error | SSE call fails before `done` frame | Last sent message stays visible in chat with subtle "queued" indicator | Auto-replay on next send / next app launch |
| Outbox `permanently-failed` | 5 replay attempts all failed | Inline banner "We couldn't save these messages — copy them?" with copy-to-clipboard for each pending entry | Manual copy; user can paste into a fresh send. Bug filed automatically with profile-id + entry-id. |
| Server orphan turn persisted | LLM emitted unparseable response | Fallback prompt appears as today (no behavioural change for the user) | LLM acknowledges the gap on the next turn via context-builder rule (Layer 2d) |
| Draft stuck in `completing` | Inngest job started but never finished within 60 s | Mobile shows "Still working — you can wait or come back later" | Polling continues; if Inngest succeeds eventually, status flips to `completed`. If Inngest exhausts retries → `failed` (next row). |
| Draft `failed` | Inngest exhausted 3 retries | Inline error with user-facing copy mapped from `failureCode` (raw error text never reaches mobile → A4), "Try Again" + "Go to home" | "Try Again" re-dispatches event; "Go to home" leaves user on a benign screen with the draft preserved for later retry |
| Draft `failed` permanently | User abandons after multiple failures | Draft is preserved (status `failed`, exchange history intact) | New `interview-failed-cleanup` Inngest cron (separate, future) sweeps after 30 d to either auto-retry once more or notify the user |
| Idempotency-Key collision on replay | Mobile replays a message that the server actually persisted before the disconnect | Server returns 200 + cached result | No duplicate persistence; outbox deletes entry on confirm |
| `extractedSignals` half-written, then SubjectId leaked | Step 1 of Inngest succeeds, step 2 throws | Mobile sees `completing` → eventual `failed` (or recovered on retry) | Per A3, signals are persisted-cached on the draft so retry reuses them rather than re-LLM'ing. |
| Double-tap "Try Again" while job is in flight | User taps "Try Again" twice from `failed` UX, second tap arrives before status flips to `completing` | First tap wins the atomic conditional UPDATE and dispatches; second tap finds no `in_progress` row to claim, short-circuits with 200 and current status → A11 | No duplicate runs; no 409; Inngest-level `idempotency: 'event.data.draftId'` as second line of defence |
| Inngest function NonRetriableError | E.g. draft disappeared, fixture missing | Mobile sees `completing` → `failed` with typed `failureCode` | `onFailure` handler flips status → A4. User clicks "Try Again" or "Go to home". |
| Spillover endpoint itself fails | Network down for an extended period; outbox can't escalate | After 3 attempts on spillover, fall back to `permanently-failed` + copy-to-clipboard UX | Same as today's last-resort recovery; bug filed automatically with profile-id + entry-id |
| Outbox JSON file growth | Long-running active session with many turns | Confirmed entries deleted inline → A10. Outbox file size proportional to *unconfirmed* count, not total send count | No-op for happy path; bounded by network outage duration |
| `completing` draft visible to parent | Parent opens PARENT-05 child drill-down while curriculum job is in flight | Parent sees "Interview in progress (saving curriculum…)" panel; existing exchangeHistory rendered; curriculum link hidden until `completed` → A15 | Auto-resolves when status flips |

## Implementation Order

→ A1: revised so each layer's safety claims hold without depending on a later layer. Layer 1 now ships its own server-side `Idempotency-Key` middleware (was originally in Layer 2). The `client_id` JSONB column is split out of Layer 2 and lands as a Layer-1 schema PR.

1. **Layer 1** (~ 2 days) — mobile outbox + server-side `Idempotency-Key` middleware (KV-backed, see A2) + `client_id` JSONB column on `sessionEvents` and `onboardingDrafts.exchangeHistory[]` + spillover endpoint (A8). Independently merge-able and revert-able. Schema migration PR lands and is deployed before the code PR per `feedback_schema_drift_pattern` → A14.
2. **Layer 3** (~ 2.5 days) — `DraftStatus` enum migration (separate PR, **deployed to production before any other Layer 3 code lands** — Postgres `ALTER TYPE ADD VALUE` must be its own committed transaction; see A19) + `failure_code` column + Inngest function + `persistCurriculumAndMarkComplete` (db.batch — topics + status flip + `topicsGenerated`) + idempotent topic insert on COALESCE-based unique key (separate migration PR, also production-gate) + onFailure handler with typed `failureCode` + mobile `completing`/`failed` UX with backoff polling + push notification in own step → A4, A5, A7, A11, A13, A18, A19.
3. **Layer 2** (~ 2 days) — `orphan_reason` column add + `persistUserMessageOnly` + role-based marker in context-builder + parent-dashboard handling for orphan turns and `completing` drafts → A6, A15. Schema migration PR lands and is deployed before the code PR.

**ASAP path: Layer 1 + Layer 3 first (≈ 4.5 days), Layer 2 follows in the same week.** SUBJECT-09 is fixed at end of step 2; the rule is fully enforced at end of step 3.

## Verification

Per `feedback_fix_verification_rules.md`, every layer ships with break tests:

- **Layer 1:** Maestro flow that turns off network mid-send, force-quits the app, restarts, asserts the message replays. Plus jest unit test for outbox lifecycle.
- **Layer 2:** integration test that mocks `persistCurriculum` to throw and asserts the user message lands in `onboardingDrafts.exchangeHistory` with `orphan_reason: 'persist_curriculum_failed'`. Mirror for `session-exchange.ts` paths.
- **Layer 3:** integration test that injects a transient failure on step 3 of the Inngest function and asserts: (a) step 1 result reused on retry (no second LLM call), (b) topics not double-inserted, (c) status flips `completing → completed` after retry succeeds.

Plus the SUBJECT-09 break test specifically (→ A16, sharpened from "exact bug repro"): integration test that asserts:
1. POST `/subjects/:subjectId/interview/complete` returns **200** with `status: 'completing'` even when the underlying LLM (`extractSignals` or `persistCurriculum` LLM step) throws.
2. `GET /interview/state` returns 200 (not 5xx) at every poll while the draft is `completing`.
3. The eventual `status: 'completed'` is reached via Inngest retry once the underlying LLM stops throwing — and the previously-cached `extractedSignals` are reused, not re-LLM'd.
4. If Inngest exhausts retries, `onFailure` flips status to `failed`; the polling endpoint surfaces that, and "Try Again" re-dispatches the event.

A future change re-introducing silent input drop (server returns 5xx with no `client_id` row written) trips a P0 regression test in the same suite.

## Adversarial Review Amendments (2026-05-01)

An adversarial review on 2026-05-01 raised 18 findings against the original draft. Resolutions below; relevant inline sections carry `→ A#` markers pointing back here.

### Structural changes

**A1 — Idempotency layering inversion (Findings 1, 16).** Layer 1 originally required `Idempotency-Key` on the wire but Layer 2 owned the server-side `client_id` column, so Layer 1's idempotency was hollow until Layer 2 shipped (~3 days later in the recommended order). **Resolution:** the `client_id` JSONB column and the `Idempotency-Key` middleware both ship as part of Layer 1. Layer 2 keeps the `orphan_reason` column and the orphan-persist helpers.

**A2 — Idempotency middleware design (Finding 2).** Original spec said "the existing handlers must accept and respect `Idempotency-Key`" without designing it. **Resolution:** add a Hono middleware `idempotencyPreflight` mounted on `/subjects/:subjectId/interview/*` and `/sessions/:sessionId/exchange`. Implementation:

- **Storage:** Cloudflare KV namespace `IDEMPOTENCY_KV`, TTL 24 h.
- **Key shape:** `idem:${profileId}:${flow}:${client_id}` — profile-scoped, no cross-profile collision possible.
- **Value shape:** presence marker `"1"` only. KV is a fast-path hint; the DB unique index on `session_events (session_id, client_id) WHERE client_id IS NOT NULL` is the AUTHORITATIVE dedupe layer.
- **Caching policy:** a separate `markPersisted` helper (called by the handler AFTER the user message is committed to the DB) writes the marker to KV. This decouples KV writes from the response lifecycle and avoids the `c.res.clone().text()` streaming-body trap.
- **Replay response:** on KV hit, middleware short-circuits with HTTP 200 `{ replayed: true, clientId, status: 'persisted' }` and `Idempotency-Replay: true` header. Mobile treats this as success and refetches the conversation to render the assistant reply.
- **Streaming routes:** do not cache response bodies. The terminal `done` frame is reconstructed by the mobile refetching the conversation after observing `Idempotency-Replay: true`.
- **Why marker-only is correct:** caching SSE response bodies via `c.res.clone().text()` does not compose with streaming responses — the body stream is single-use and consumed on first read. The DB unique index plus mobile refetch keeps correctness without the streaming-body trap.

**A3 — `extractSignals` determinism (Findings 3, 11).** Original spec leaned on `step.run` checkpointing for idempotency, but `extractSignals` is a non-deterministic LLM call. **Resolution:** persist the step-1 result onto the draft (`extractedSignals`) inside the same `step.run`. Subsequent retries (whether step-internal or full re-dispatch) read the persisted value and skip the LLM call. The cache check is `if (cached?.topics && cached.topics.length > 0) return cached` — the looser `if (draft.extractedSignals)` would return truthy for `{ topics: [] }` and persist an empty curriculum on retry, which is strictly worse than SUBJECT-09 (no recovery surface because status flips to `completed`). Inline pseudocode in 3b reflects this.

**A4 — Inngest `onFailure` handler (Finding 7).** Original spec had no path to flip status to `failed`. NonRetriableError or retry exhaustion would leave drafts stuck in `completing`. **Resolution:** add `onFailure` config that flips status to `failed` with a typed `failureCode: PersistFailureCode` (values: `extract_signals_failed`, `empty_signals`, `persist_failed`, `draft_missing`, `unknown`). Raw error text is logged server-side ONLY — never written to DB or returned to mobile, preventing raw provider error text (which may include API keys or internal IDs) from reaching user devices. Mobile maps `failureCode` values to user-facing copy. Inline pseudocode in 3b reflects this.

**A5 — Topic insert unique key (Finding 4).** Original `onConflictDoNothing` keyed on `(curriculumId, bookId, sortOrder)` does not protect against LLM jitter — retries with re-ordered topics double-insert. Initial revision proposed keying on `(curriculumId, bookId, normalisedTopicName)` with a partial-index treatment of nullable `bookId`. **Resolution:** a single non-partial unique index on `(curriculum_id, COALESCE(book_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(topic_name)))`. Reason: Drizzle's `onConflictDoNothing` API in this codebase has no `targetWhere` precedent — `ON CONFLICT` against a partial index would silently miss dedup. The `COALESCE` sentinel collapses `NULL` `book_id` to a fixed UUID so one ordinary unique index covers both cases without predicate matching. Migration adds this index ahead of Layer 3 code.

**A5b — Drop `worker_timeout` from server enum (Finding 5).** Cloudflare-killed Workers cannot run catch blocks, so the server can never write `orphan_reason: 'worker_timeout'`. **Resolution:** remove the value. The mobile spillover endpoint (A8) accepts a `clientFailureReason` field where `worker_timeout` is reported as client-observed metadata.

**A6 — Orphan marker via top-level system parameter, not mid-conversation role (Finding 6).** Original Layer 2d rendered `[no assistant response was generated for the previous turn]` as raw text, which a user could inject. First revision proposed a synthetic `role: 'system'` message between turns — but Anthropic's Messages API rejects mid-conversation `system` messages: `system` is a top-level parameter only. **Resolution:** append `<server_note kind="orphan_user_turn" reason="..."/>` tags to the top-level `system` string passed to the provider (capped at the last 3 orphan turns). A sanitizer in the LLM router strips any `<server_note>` tags from user-role content before the payload is sent, closing the prompt-injection vector. Inline pseudocode in 2d reflects this.

**A7 — `db.batch` for persist + status flip + book flag (Finding 14).** Original Layer 3 split `generate-and-persist-curriculum` from `mark-completed` into two `step.run` boundaries, exposing an intermediate state where `curriculumTopics` exist but `draft.status === 'completing'`. **Resolution:** merge into one step `generate-persist-and-mark-completed`. Inside that step, wrap all three writes — `curriculumTopics` insert, draft `status='completed'` flip, and `curriculumBooks.topicsGenerated = true` — in `db.batch([...])` per `project_neon_transaction_facts`. The polling endpoint never observes an inconsistent intermediate. The `topicsGenerated` flag was outside the batch in rev 1; including it prevents the parent dashboard from showing a book with topics but `topicsGenerated: false`.

**A8 — Spillover endpoint replaces "copy text" dead-end (Finding 9).** Original "5 attempts then copy-to-clipboard" violated `feedback_human_override_everywhere` for onboarding-blocked users. **Resolution:** add `POST /support/outbox-spillover` (lands in Layer 1) that accepts the full pending payload + profile metadata and writes to a new `support_messages` table for ops review. Mobile escalates after **3** attempts, not 5. Copy-text remains as last-resort fallback only when spillover itself fails.

**A9 — AsyncStorage replaces SecureStore (Finding 10).** SecureStore (iOS keychain) has ~4 KB practical per-key limit and slow writes, which a chatty session would saturate. Messages aren't secrets. **Resolution:** outbox lives in `AsyncStorage`. Profile-scoped key remains. SecureStore is reserved for actual secrets.

**A10 — Inline confirmed-entry deletion (Finding 13).** Original spec said "sweep on next outbox read", causing unbounded growth during active sessions and quadratic write cost. **Resolution:** delete the entry from the outbox synchronously the moment confirmation lands (single write, no deferred sweep).

**A11 — Atomic-conditional dispatch guard (Finding 16).** Original spec used a check-then-act pattern (read status, conditionally return 409, else write status and dispatch). Two concurrent finalizers (SSE finalize + force-complete fired near-simultaneously) both observe `in_progress`, both transition, both dispatch — two LLM runs. **Resolution:** a single atomic conditional UPDATE with `RETURNING`: `UPDATE onboarding_drafts SET status='completing' WHERE id=? AND profile_id=? AND status='in_progress' RETURNING id`. Only the request that wins the row update dispatches. The loser gets an empty `RETURNING` array and short-circuits with 200 (current state — no 409). This is one round-trip and atomic by definition; no interactive transaction needed. Inngest-level `idempotency: 'event.data.draftId'` is a second line of defence. The 409 path is removed from both the route and the mobile UX. Inline pseudocode in 3d reflects this.

**A12 — Inngest event payload schema (Findings 17, 18).** Original spec had no schema for `app/interview.ready_to_persist`. **Resolution:** add `interviewReadyToPersistEventSchema` in `packages/schemas/src/inngest-events.ts` with a `version: 1` field for forward-compatibility. Route handler validates with `.parse()` before sending; Inngest function validates with `.parse()` on receive.

**A13 — Polling backoff + push notification (Finding 8).** Original 3 s polling was battery-hostile and quota-hostile and had no backoff. **Resolution:** exponential backoff 3 → 6 → 12 → 30 s capped, paused while app is backgrounded. Server emits a push notification on `mark-completed` so backgrounded apps don't poll-on-resume. Inline change in 3e reflects this.

**A14 — Migration sequencing made explicit (Finding 14).** Original spec said "additive only" but didn't sequence migration PRs ahead of code PRs. **Resolution:** Implementation Order now names each layer's migration PR explicitly. Per `feedback_schema_drift_pattern`, schema PR lands and is deployed before the code that reads new columns.

**A15 — Parent dashboard handles `completing` and orphan turns (Finding 12).** Original spec listed parent under-reporting as motivation but didn't specify how `completing` interacts with PARENT-05. **Resolution:** parent drill-down treats `completing` drafts as "Interview in progress (saving curriculum…)", renders existing exchangeHistory, hides the curriculum link until `completed`. Orphan turns are filtered from the rendered transcript by default (raw rows still in DB; toggleable via internal-only debug flag).

**A16 — Sharpened SUBJECT-09 break test (Finding 15).** Original test description said "reproduces the exact bug repro" without naming the assertions. **Resolution:** explicit four-point assertion in Verification (200 on POST, 200 on poll throughout, eventual `completed` reusing cached signals, `failed` recoverable via "Try Again").

**A17 — SSE error-frame contract for orphan paths (Finding 18).** Original 2c said "wrap in try/catch" but didn't name who emits the SSE error frame. **Resolution:** the route handler owns SSE framing. The service layer (`persistUserMessageOnly`) writes the orphan row, then **rethrows**. The route's existing catch emits the SSE error frame. No double-emit; the orphan write is invisible to the client except via a `client_id` collision on a future replay (handled by A2).

### Summary of design changes (deletions and additions)

- **Removed:** `worker_timeout` enum value (A5b); 5-attempt cap with copy-text dead-end (A8); deferred outbox sweep (A10); separate `mark-completed` step (A7); in-band orphan text marker (A6); SecureStore as outbox storage (A9).
- **Added:** `idempotencyPreflight` middleware + `markPersisted` helper (A2); `onFailure` handler (A4); `persistCurriculumAndMarkComplete` (A7); `interviewReadyToPersistEventSchema` (A12); `POST /support/outbox-spillover` endpoint + `support_messages` table (A8); push notification on `mark-completed` in its own `step.run` (A13, A18); atomic-conditional-UPDATE dispatch (A11).
- **Reshaped:** Implementation Order so each layer is internally consistent and doesn't depend on a future layer for its safety claims (A1).

## Plan-Driven Amendments (2026-05-01)

The following amendments were raised during plan-writing adversarial review of the three implementation plans. Each plan survived its own adversarial pass; the deviations below close real bugs the spec missed. The spec is updated to match plan reality.

### Structural changes

**A18 — Push notification in a separate Inngest step (Layer 3 plan, Task 5).** Original spec did not separate the push notification from the persist step. **Resolution:** the Inngest function has a 4th `step.run('send-completion-push', ...)`. Separating it means a push-API hiccup (Expo API down) only retries the push step — not the persist step. The persist is idempotent anyway, but retrying it doubles pushes (bad UX). Push failure inside the step catches, logs server-side, and emits `app/interview.completion_push_failed` so the failure rate is queryable (per CLAUDE.md "silent recovery without escalation is banned"). It does NOT flip the draft to `failed` — the curriculum data is already persisted; the user gets the result via the polling path regardless.

**A19 — Production-migrate gate for Task 1 (Layer 3 plan, Task 1 Step 6).** Original spec invoked the schema-first rule but did not explicitly state that the `DraftStatus` enum migration (`ALTER TYPE ADD VALUE`) must be **deployed to production** before any code that references the new values lands. **Resolution:** the Implementation Order for Layer 3 now makes this explicit. Postgres requires `ADD VALUE` to be its own committed transaction before code references the new value — unlike column adds, this DDL cannot be batched with the code change. The plan adds a production-migrate gate: do not proceed to subsequent tasks until `\dT+ draft_status` on the production DB shows `completing`/`failed`. A deploy that inverts this order causes 500s as the route attempts `UPDATE ... SET status='completing'` against a Postgres enum that doesn't know the value yet.

**A20 — Typed error hierarchy + classifier for orphan classification (Layer 2 plan, Task 2).** Original spec did not specify how failure paths classify between orphan reasons. **Resolution:** `packages/schemas/src/errors.ts` gets three new error classes — `LlmStreamError`, `LlmEnvelopeError`, `PersistCurriculumError` — extending the existing hierarchy. A `classifyOrphanError(err: unknown): OrphanReason` function switches on `instanceof` — never regex on `err.message`. This is required by CLAUDE.md "Classify errors before formatting": classification happens on the raw error object; the formatter is never the input to the classifier. The `classifyOrphanError` function and classes live in `@eduagent/schemas/errors` so all consumers import from one place.

**A21 — Orphan-persist-failed observability via Inngest event (Layer 2 plan, Task 6/7).** Original spec did not require an observability surface for orphan-persist failures. Sentry alone is insufficient because it is not queryable as a metric (CLAUDE.md: "Silent recovery without escalation is banned — if you can't query how many times the fallback fired in the last 24 hours, the 'recovery' is invisible"). **Resolution:** a small Inngest function `orphan.persist.failed` (event-counter only, no side effects) is registered so ops can query orphan-persist failure rates in the Inngest dashboard without a Sentry dive. Catches in the orphan-persist helpers (Tasks 6/7 of the L2 plan) emit `app/orphan.persist.failed` with `{ profileId, sessionId?, draftId?, reason }` when the orphan write itself throws — after the rethrow, so the route's SSE error frame is still emitted normally.

## Open Questions

| ID | Question | Default |
| --- | --- | --- |
| OQ-1 | When force-complete throws after `extractedSignals` was written but before `status` flips, do we roll signals back? | No — keep the write. Inngest retry reads the persisted-cached signals (A3) and skips the LLM call. |
| OQ-2 | How long before an unconfirmed outbox entry shows the "queued" indicator? | 5 s after Send. Below that, normal "sending" state. |
| OQ-3 | Does the parent dashboard ever surface orphan turns? | No (default). PARENT-05 transcript filters orphan entries from the rendered view; raw record still in DB. Toggleable via internal-only debug flag. (A15) |
| OQ-4 | Does the LLM eval harness need a new fixture for orphan turns? | Yes — add a fixture profile with one orphan user turn so context-builder behaviour is regression-tested. Tier 1 only (no live LLM). |
| OQ-5 | Should we ship Layer 2 before Layer 3 to maximise SUBJECT-09 mitigation surface area? | No — Layer 3 is the actual fix. Layer 2 is broader hygiene. Keep the recommended order (A1). |
| OQ-6 | Should `extractSignals` itself be made deterministic (`temperature: 0`, `seed: hash(draftId)`) in addition to the persisted-cache pattern in A3? | Open. Persisted-cache is sufficient for retry idempotency. Determinism would also stabilise eval-harness regressions. Decide as part of Layer 3 implementation. |
| OQ-7 | Outbox storage: `AsyncStorage` (string blob, atomic) vs `expo-file-system` (JSONL, append-able)? | Default to `AsyncStorage` for simplicity. Revisit if a single profile's pending count exceeds ~200 entries (~50 KB). (A9) |
| OQ-8 | Spillover endpoint: rate-limit per profile? | Yes — 10 spillover writes per profile per hour. Past that, return 429; mobile falls back to `permanently-failed` + copy-to-clipboard. (A8) |
| OQ-9 | Should the topic-insert unique index migration backfill normalise existing `topic_name` rows? | Yes — one-shot UPDATE during migration to apply `lower(trim(...))` to existing rows so the `(curriculum_id, COALESCE(book_id, sentinel), lower(trim(topic_name)))` unique index can be created. Verify no existing duplicates under the normalised key first; if duplicates exist, fail loud and require ops to dedupe. (A5) |
| OQ-10 | Should the push notification on `mark-completed` (A13) reuse existing `expo-notifications` plumbing or schedule a local notification client-side from the polling response? | Default: server-side push via existing plumbing — works for backgrounded apps. Local notification is a fallback when push permissions are denied. |
| OQ-11 | KV TTL for the idempotency cache (A2): 24 h is the default. Should it be longer for interview drafts (which can be paused for days)? | Open. Risk of longer TTL is stale 4xx replays hiding a real change in user input. Default to 24 h; revisit if outbox replay across multi-day pauses becomes a real failure mode. |

## Out of Scope

- Quiz answer durability, dictation correction durability, homework photo durability, recall answer durability. Each is a separate review per the spread analysis from this conversation. Likely smaller fixes; defer to a follow-up spec.
- The atomicity gap (`db.batch()` not used anywhere). Addressed opportunistically when persistCurriculum is rewritten in Layer 3 — broader sweep is a separate cleanup.
- Server-side draft mirror for long-form composition surfaces (session summary, dictation correction). The deferred `project_summary_draft_backup_deferred` decision remains deferred for now; this spec focuses on chat-style exchange surfaces.
- Replacing `[BUG-941]` fallback semantics. The fallback frame is still emitted; this spec only changes whether the user's input is also persisted alongside.

## Rollback

| Layer | Rollback procedure | Data loss? |
| --- | --- | --- |
| Layer 1 | Remove outbox writes from mobile hooks; AsyncStorage data is profile-local and self-clears on next app launch (per A9). Roll back the `client_id` JSONB column add and `idempotencyPreflight` middleware (per A1, A2). KV cache entries expire naturally within 24 h. | None — outbox is mobile-only state; KV cache is replaceable |
| Layer 2 | Revert `persistUserMessageOnly` calls; drop two new schema columns (`orphan_reason`, `client_id`); rewrite `exchangeHistory` JSONB to strip the new fields | None — additive change only |
| Layer 3 | Revert route changes to call `persistCurriculum` synchronously; remove Inngest function; revert any rows in `completing`/`failed` to `in_progress` so users naturally retry; drop `failure_code` column from `onboarding_drafts`; revert `draftStatusEnum` (drop `completing`/`failed` values) | Possible: drafts that completed *only* via Inngest after rollback would re-do work. Acceptable — idempotency guarantees no double-write |

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
