# WI-2513 — Design contract: pre-commit retry idempotency for the paid calibration grader

Date: 2026-08-02 (Europe/Berlin local publication date; GitHub's UTC
timestamps may show Aug 1)
Status: **Design only.** Option C is this report's evidence-backed
recommendation — no direction has been durably ratified on the Work Item
(§9), and
**selection of the direction, acceptance of every residual risk (§7), and
explicit architecture approval of this contract are all still required before
ANY implementation** (AC-3). No production code, schema, workflow, or test
changes accompany this document.

## 1. Problem

`reviewCalibrationGrade`
(`apps/api/src/inngest/functions/review-calibration-grade.ts:476-484`) makes
one paid application-level grading invocation per calibration answer via
`evaluateRecallQuality` (line 278; the provider-level retry/fallback fan-out
behind that invocation is quantified in §7). WI-2009 closed the committed-write/lost-ack replay using the
committed `retrieval_events` row (PK `learnerMessageEventId`) as the receipt,
and explicitly deferred one window: "Two simultaneous first executions may both
miss before primary-key arbitration and both reach the paid boundary"
(`docs/evidence/WI-2009/report.md:20-23`; acknowledged in code at
`review-calibration-grade.ts:236-238`). Both overlapping executions pass
`loadCommittedGradeReceipt` (lines 239-246) and both pay. The
`claim-cooldown-slot` CAS (lines 192-211) cannot stop this: its re-entrancy
allowance (`allowLastReviewedAt: eventAt`, lines 202-206; predicate at
`apps/api/src/services/apply-retention-update.ts:50-56`) admits any execution
with the same payload-derived `eventAt` — a concurrent duplicate is
indistinguishable from a legitimate retry.

## 2. Option comparison (AC-1)

| Dimension | A — first-party encrypted receipt store | B — idempotency + pg advisory lock | **C — concurrency key, limit 1 (recommended)** |
| --- | --- | --- | --- |
| Mechanism | Encrypted claim row (`profileId+sessionId+answerEventId`) written before the paid call, same txn as the cooldown claim; second execution sees claim, waits/reuses. A bare claim is NOT enough: if the claimant dies after paying but before publishing the result, a taker-over cannot know whether payment happened — waiting strands the answer, lease-expiry/steal can overlap a slow zombie. Honest A needs a full lease + takeover + result-publication + zombie-fencing protocol, or provider-side idempotency keys | Keep existing `idempotency` (line 480) + `pg_advisory_xact_lock` on a hash of the same triple, held across the paid call | `concurrency: { key: 'event.data.sessionId + "-" + event.data.topicId', limit: 1 }`; scheduler serializes step execution per key |
| Retry semantics | Closes the two-live-executions race via DB arbitration; the pay-then-die window remains unless provider idempotency is added — same repay class as C, plus protocol failure modes of its own | Closes it only if the lock holds: xact-scoped lock means a transaction open across an LLM call, and Neon pooling makes lock/connection affinity a verification burden; a mis-hashed key fails open silently | Serializes scheduler-visible overlap; second execution then hits the WI-2009 receipt check and never pays (§4); key stable across retries (§5) |
| Retention / deletion / access | New PII table: retention cron, profile-deletion cascade, RLS scoping, DPIA treatment pre-launch | None | None |
| PII | Transiently persists rationale/misconception in a second store (C-3 tension), encryption-at-rest required | None persisted | None — key evaluates over two opaque UUIDs already in the event (`packages/schemas/src/inngest-events.ts:427-433`) |
| Cost | Migration + table + cron + DPIA sign-off, PLUS the lease/takeover/fencing protocol design and its tests; M-L | No migration; S, plus pooling verification and long-open txns | XS-S — one config field + one opts-assertion test; 15+ in-repo precedents (§6) |
| Failure residuals | Repays on pay-then-die like C (absent provider idempotency); adds claim-row leak/GC and lease-steal-vs-zombie overlap | Crash between lock and write re-pays (same as C); pooling defects void the lock with no signal | Not exactly-once: per-attempt/per-run/cross-run repayment bounds and acceptance status in §7 |

A does not fully close the zombie case with a pre-call claim alone — the
marginal coverage it can buy requires a takeover/fencing protocol or provider
idempotency on top of a new pre-launch PII surface. B's guarantee rests on
advisory-lock-under-pooling semantics. C rests on scheduler semantics the repo
already relies on in 15+ functions, with a documented prior fix of this exact
failure mode (BUG-148).

### Option D — LLM-provider request idempotency (no qualifying design found)

The provider-supported design AC-1 names would thread a client-generated
idempotency key (the natural choice: `learnerMessageEventId`) on the paid
provider request so the provider dedupes retries server-side. **Finding: no
qualifying provider-supported idempotency design exists on the current call
path** — none of the routed providers documents or implements such a contract
(evidence below), so this option is HYPOTHETICAL and is described here for
AC-1 completeness, not offered as coverage. If AC-1 is read as literally
requiring a selectable provider-supported design, that requirement needs an
explicit architecture ruling or waiver (§9). **Retry semantics (REQUIRED, not
observed):** to qualify, a future provider contract would have to guarantee
server-side dedupe that returns the original completion without a second
charge — these are requirements any qualifying design must document, not
semantics any routed provider is claimed to have; no concrete contract
exists to cite. **Retention/deletion/access/PII:** the
dedupe cache lives with the provider; the prompt already crosses that boundary
today, so no new PII *class*, but provider-side retention of the cached
completion would need DPA/retention verification per vendor. **Cost:** zero
storage; requires route-wide provider support or pinning the grader to a
single provider that offers such a contract — an external-contract/routing
change either way. **Why it cannot be selected today:** the paid boundary is
`evaluateRecallQuality` → `routeAndCall(messages, 1)`
(`apps/api/src/services/retention-data.ts:366`, `:392`), which may route and
fall back across Cerebras, Gemini, OpenAI, Mistral, and Anthropic raw-`fetch()`
adapters (`apps/api/src/services/llm/providers/`). The shared abstraction
carries no idempotency key to thread — neither `LLMProvider.chat` nor
`ModelConfig` (`apps/api/src/services/llm/types.ts:174`, `:12`) has such a
field — and no current adapter sends one. The providers `routeAndCall` may
actually select first for rung 1 — Cerebras under the V2 matrix, Gemini under
the legacy path — document no idempotency mechanism in their official request
references: the Cerebras Chat Completions reference
(<https://inference-docs.cerebras.ai/api-reference/chat-completions>) and the
Gemini `generateContent` request schema
(<https://ai.google.dev/api/generate-content>) list no idempotency
field/header. For the remaining routed vendors the claim is narrowed to what
was verified: the OpenAI, Anthropic, and Mistral adapters send no idempotency
parameter (in-repo verification of `apps/api/src/services/llm/providers/`),
and the Anthropic API overview page
(<https://docs.anthropic.com/en/api/overview>) documents a *response*
`request-id` header with no request-idempotency mechanism on that page; no
official-reference claim is made for OpenAI or Mistral. Conclusion: no
qualifying design is implemented on the current route. **Residual:** not
selectable today without an external contract/routing change (route-wide
support or provider pinning); revisit if the routed providers ship request
idempotency.

## 3. Recommended contract (AC-2)

The complete change is two deliverables: (a) the config field below, and
(b) a BUG-148-style regression test asserting the declared opts on
`reviewCalibrationGrade` — expected assertion:
`concurrency: { key: 'event.data.sessionId + "-" + event.data.topicId', limit: 1 }`
(model: `memory-facts-backfill.test.ts`, §6). Nothing else.

```ts
export const reviewCalibrationGrade = inngest.createFunction(
  {
    id: 'review-calibration-grade',
    retries: 2,
    idempotency: 'event.data.sessionId + "-" + event.data.topicId',
    concurrency: {
      key: 'event.data.sessionId + "-" + event.data.topicId',
      limit: 1,
    },
  },
  { event: 'app/review.calibration.requested' },
  handleReviewCalibrationGrade,
);
```

- **Key:** identical CEL expression to the existing `idempotency` key
  (line 480) — the granularity intentionally matches the dedupe key. Normal
  dispatch emits at most ONE calibration event per session:
  `maybeDispatchReviewCalibration`
  (`apps/api/src/services/session/session-exchange.ts:2002`) locks the
  `learning_sessions` row (`FOR UPDATE`, lines 2032-2041), returns null when
  `reviewCalibrationFiredAt` is already set (line 2046), and stamps it before
  sending (line 2076); both callers (lines 4632, 5158) go through it. So a
  *distinct* `learnerMessageEventId` sharing this key is not produced by the
  production dispatcher; a manually fabricated/re-fired one is suppressed by
  idempotency within 24h, and outside 24h it runs serialized and may
  legitimately pay as a distinct operation (distinct receipt). Under normal
  one-event-per-session dispatch and same-receipt duplicate execution, the
  cost of the shared queue is per-key latency only; the concurrency queue
  itself never deduplicates — the 24h suppression of a fabricated distinct
  receipt comes from the pre-existing `idempotency` config, unchanged by this
  design. Changing this granularity is itself an architecture-approval
  question (§9). Both fields are required UUIDs on the event schema
  (`inngest-events.ts:427-433`).
- **Limit/scope:** `1`, `fn` scope (Inngest default) — queue private to this
  function.
- **Step boundary — no restructuring.** The critical section is already the
  single `rehydrate-grade-and-record` step closure (lines 228-378): receipt
  check (239-246) → paid call (278-284) → durable `recordRetrievalEvent`
  commit (fallback 294-307, graded 341-357), returning only after the insert
  resolves. The design **forbids** splitting check, paid call, or write into
  separate steps: the proof below depends on their co-location in one step
  execution.

## 4. Serialization proof

Inngest concurrency with a key creates a virtual queue per unique evaluated
key and limits **steps executing at a single time** to `limit`; with
`limit: 1`, at most one step of any run sharing the key executes at any moment
([concurrency guide](https://www.inngest.com/docs/guides/concurrency) — key
expressions are CEL over the triggering event, `fn` scope default).

Because normal dispatch emits one calibration event per session (§3), any two
executions E1, E2 evaluating to the same key are, in practice, executions of
the SAME event/receipt (`learnerMessageEventId`) — a re-fire past the 24h
dedupe window, a replay, or a retry racing a concluded prior attempt. The
guarantee this proof establishes is narrower than "one call per receipt": it
covers only executions that begin AFTER a prior attempt successfully
committed the receipt row. Serialization does not prevent sequential
repayment when every prior attempt failed after payment and before commit —
those bounds are §7's. A fabricated distinct receipt is a distinct paid
operation (§3). For same-receipt E1, E2:

1. Their `rehydrate-grade-and-record` step instances cannot overlap; one —
   say E1's — finishes first (or terminates abnormally, §7).
2. A normal finish means `recordRetrievalEvent` committed the row under
   deterministic PK `learnerMessageEventId` before the step returned
   (`apps/api/src/services/retrieval-events.ts:113-118`,
   `onConflictDoNothing`).
3. E2's step instance then starts with `loadCommittedGradeReceipt`
   (lines 239-246), finds the committed row, validates context invariants
   (lines 94-99), and returns the structured decision — control never reaches
   `evaluateRecallQuality` at line 278. Symmetric if E2 ran first. Any
   serialized execution starting after a successful receipt commit pays
   nothing; when no attempt has yet committed, each new attempt may pay,
   within the §7 bounds.

Concurrency alone does not dedupe — it converts the *concurrent pre-commit*
race into the *sequential post-commit* shape WI-2009 already covers and
RED→GREEN-verified (`docs/evidence/WI-2009/report.md`). The pairing is established in-repo:
`ask-silent-classify.ts:30-40` (BUG-845) documents idempotency-dedupes /
concurrency-serializes and keeps `limit: 1` as defence-in-depth. The
cooldown-claim re-entrancy hole (§1) becomes harmless: a same-payload
duplicate proceeds to the serialized grade step and is stopped by the receipt
check; a different-timestamp duplicate is rejected by the cooldown CAS itself
(returns `cooldown_claim_lost`, lines 213-215).

## 5. Stable retry behavior

Retries re-execute against the same immutable event, so every attempt
evaluates to the same key and lands in the same virtual queue. A payload
missing the key fields fails `safeParse` and exits before any step
(lines 144-147). Step memoization is unchanged: a retry holding the grade-step
checkpoint never re-enters the closure; one that lost it re-executes and
resolves via the receipt path (WI-2009 behavior, untouched). Inngest's
FIFO-except-retries caveat is immaterial — the proof needs mutual exclusion,
not ordering.

## 6. Precedents

`concurrency: { key, limit: 1 }` serializing a per-entity critical section:
`ask-silent-classify.ts:40`, `auto-file-session.ts:237`,
`archive-cleanup.ts:22`, `account-deletion.ts:34`, `consent-revocation.ts:62`
(all under `apps/api/src/inngest/functions/`); prior fix of this exact
double-execution mode: `memory-facts-backfill.test.ts:4` ("[BUG-148] …
concurrency:1"), the model for the opts-assertion test that is deliverable
(b) of the contract (§3).

## 7. Failure residuals (not exactly-once)

This design makes duplicate-payment exposure explicit at each level: it
bounds a single attempt and a single run, but not aggregate cross-run
exposure. Stated at each level:

- **Per grade-step attempt:** one application-level grading invocation —
  `evaluateRecallQuality` → `routeAndCall` has a single call site inside the
  step closure (line 278) — but that invocation fans out at the provider
  level: up to (1 initial + 3 primary retries) + (1 initial + 3 fallback
  retries) = **8 provider HTTP requests** per attempt (`MAX_RETRIES = 3`,
  "Up to 4 total attempts", `apps/api/src/services/llm/router.ts:1644`; retry
  loop `:1677`; primary `withRetry` `:1812-1817`; one fallback config via
  `getFallbackConfig` `:1144`, retried in `attemptProvider` `:1979-1984`). A
  request whose response is lost after the provider executed may still have
  been charged — failed requests cannot be assumed unpaid. An attempt that
  begins after a prior successful receipt commit issues **no** provider
  requests (§4).
- **Per Inngest run:** (1 initial attempt + 2 retries) × 8 = up to **24
  provider requests** per run (`retries: 2`, line 479), reached when every
  attempt fails between the paid invocation (line 278) and the commit
  (lines 294-307 / 341-357).
- **Cross-run:** **no finite global bound.** A re-fire past the 24h
  idempotency window, a replay, or a new distinct operation starts a fresh
  run with its own per-run bound; if no attempt has ever committed the
  receipt, each such run can pay again. (A same-receipt re-fire after any
  successful commit resolves from the committed row and pays nothing.)
- **Written-off zombie:** a slow paid call pushed past the attempt's
  write-off frees the concurrency slot while the worker still runs; a retry
  may then overlap the zombie pre-commit and both may pay — scheduler-level
  serialization cannot arbitrate an executor the scheduler no longer tracks.

**Acceptance status (AC-3):** no residual acceptance is durably recorded on
the Work Item. Every residual above is OPEN and listed in §9 with its
decision owner.

Row-level invariant in every case above: the deterministic
`learnerMessageEventId` PK with `onConflictDoNothing` ensures at most one
`retrieval_events` row per receipt, and a lost conflict reloads the canonical
row (lines 308-320, 358-370). No broader corruption-prevention claim is made
for other fields, write paths, or external calls. Closing the
zombie/pay-then-die windows would require a qualifying provider-side
idempotency contract (Option D, §2 — none found) or Option A's full
lease/takeover/fencing protocol (§2 records its cost). Not residuals:
in-window duplicates (idempotency), executions after a successful receipt
commit (WI-2009 receipt path), insert-conflict divergence (conflict reload).

## 8. C-3 / RR-9 preservation and external effects (AC-2, AC-3)

- **C-3:** the contract adds a scheduler config field keyed on two opaque
  UUIDs already in the event payload. No grader free text enters Inngest
  event/state; the step-return discipline (lines 128-134), PII-egress closure
  comment (lines 217-227), and payload posture
  (`inngest-events.ts:419-426`) are untouched.
- **RR-9:** `rubricRationale`/`misconception`/routing rung continue to be
  written only onto the committed `retrieval_events` row (lines 354-356;
  `retrieval-events.ts:102-105`) — no second home for grader content.
- **Schema migration: zero.** No table/column/index/enum change, no
  `apps/api/drizzle/` entry.
- **External contracts: zero.** No event-payload, `@eduagent/schemas`, API, or
  mobile-visible change; the delta is Inngest function configuration,
  registered at the next worker sync.
- **Latency:** none across distinct session+topic keys (distinct queues).
  Per-key queueing delays a same-key execution only while another is
  executing — in practice duplicate executions of the same receipt, since the
  dispatcher emits one calibration event per session (§3). Within that normal
  dispatch scope the cost is wait time, not a dropped grade; a fabricated
  distinct receipt inside 24h is dropped by the pre-existing `idempotency`
  config, not by this design.

## 9. OPEN — pending ruling (approval gate)

Provenance note: no selection, acceptance, or waiver asserted anywhere in
this report carries a durable Work Item record. The Work Item body's
first-pass refinement leans Option B pending architect ratification, and
Option C is challenger-proposed there (WI-2513 body, "Design options" block);
Option C is this report's evidence-backed recommendation on the analysis
above. Everything below is OPEN, with its decision owner:

1. **Contract selection and approval** (owner: architecture): adopt Option C
   as specified in §3 — both deliverables, the config field and the
   BUG-148-style opts-assertion test. Implementation must not begin before
   this ruling.
2. **AC-1 provider-supported-design requirement** (owner: architecture):
   accept the Option D no-qualifying-design finding as satisfying AC-1's
   comparison requirement, or issue a waiver (§2).
3. **Residual-risk acceptance** (owner: operator): every §7 residual —
   narrow pre-commit crash repayment, zombie-overlap double payment,
   per-attempt provider fan-out (up to 8 requests), per-run accumulation (up
   to 24 requests), and the unbounded cross-run aggregate — none is recorded
   as accepted in any durable source.
