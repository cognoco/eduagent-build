# Empty-Reply Stream Guard — Freeform Chat Empty-Bubble Fix

**Date:** 2026-04-23 (revised after code-grounded challenge)
**Branch:** TBD — see Prereq 2. **Not** to be committed onto `proxy-parent-fix`.
**Related:** User-reported bug — "Ask anything" freeform chat renders AI bubble with feedback chips but zero text content, instantly, after ~2–3 exchanges.
**Framing:** Boundary defense. The root cause lives in LLM prompt/envelope adherence and is tracked as a concrete follow-up ticket in §8 — not a "we'll look later."

---

## 1. Problem Statement

The LLM occasionally returns one of four shapes that all produce an empty visible bubble:

1. **Empty-reply envelope:** `{"reply":"","signals":{...}}`
2. **Malformed envelope** that fails `parseEnvelope` — `parseExchangeEnvelope` falls back to `cleanResponse: response.trim()` (`exchanges.ts:408-416`), which is then regex-stripped client-side
3. **Marker-only payload** e.g. `{"notePrompt":true}` — no `"reply"` key, so `teeEnvelopeStream` (`stream-envelope.ts:110`) yields zero characters to the mobile stream; the raw marker is stripped client-side (`use-session-streaming.ts:581-593`), leaving `content === ''`
4. **Stream aborted mid-flight** — network loss or upstream abort; mobile finalizes with whatever it has (possibly empty)

`SessionMessageActions.tsx:56-78` renders feedback chips on *any* finalized assistant message that isn't `streaming` or `isSystemPrompt`, producing an **empty bubble + chips dead-end** with no actionable escape.

Server-side evidence: `logger.warn('exchange.envelope_parse_failed')` fires at `exchanges.ts:402`. **Which of the four shapes triggered the reported bug is not yet known** — Prereq 1 answers that.

---

## 2. Prerequisites (BLOCKING)

These must complete before Layer 1/2 code is written. Per `feedback_thorough_investigation` and `feedback_verify_before_declaring_done`: evidence before assertions.

### Prereq 1 — Pull the failing row from the DB

From Neon (staging or prod — whichever the user reported against), fetch the `sessionEvents` row(s) for the reported session, ordered by `createdAt DESC`. Answer:

- What is the raw LLM response on the empty-bubble turn? Empty-reply, malformed, marker-only, or stream-abort?
- Is the preceding assistant turn's `content` already polluted (stripped regex residue, prior fallback string)?
- Is the `exchangeHistory` assembled from these rows itself empty or malformed?

**Why this must come first:** we may be fixing the wrong shape. If the raw is non-empty and non-marker (e.g. a stream-abort or a mobile finalizer bug), the Layer 1 design below is misaimed.

### Prereq 2 — Confirm branch

Current branch is `proxy-parent-fix` (unrelated to this work). Before any code: ask the user whether to land on a dedicated branch (recommended) or on `main`. Per `feedback_never_switch_branch`, no silent switching.

### Prereq 3 — Caller enumeration (COMPLETED during plan revision)

Grep results confirm **two** SSE-emitting callers of the envelope parser, with distinct onComplete shapes:

| Entry point | Streamer | onComplete location | SSE-emitting route |
|---|---|---|---|
| Freeform / session-exchange (ask, homework) | `streamExchange` → `teeEnvelopeStream` | `services/session/session-exchange.ts:1065-1111` (`streamMessage.onComplete`) | `routes/sessions.ts:225-267` |
| Interview | `streamInterviewExchange` → `teeEnvelopeStream` | `services/interview.ts:406-429` (inline `onComplete`) | `routes/interview.ts:~155` |

There is **no third SSE streamer**; homework-check and generic session-exchange share the `streamMessage` path. This changes §4.1's layering (see below): Layer 1 splits across **two** files, not one.

---

## 3. Failure Modes Table

| State | Trigger | User sees today | User sees after fix | Recovery |
|---|---|---|---|---|
| Envelope with empty `reply` | LLM safety short-circuit, context saturation, prompt drift | Empty bubble + feedback chips | Reconnect-prompt bubble with Reconnect affordance | Tap Reconnect → `handleReconnect` already resends (verified §4.3) |
| Malformed envelope | `parseEnvelope` fails, not marker-shaped | Empty bubble + feedback chips | Reconnect-prompt bubble | Same |
| Marker-only payload (e.g. `{"notePrompt":true}`) | LLM emits a signal without an envelope | Empty bubble + feedback chips | Widget dispatch (intended), or reconnect-prompt fallback if no handler | Widget interaction or Reconnect — see §4.4 |
| Stream aborted mid-flight | Network loss, unmount, upstream abort | Empty bubble + feedback chips | Reconnect-prompt bubble | Reconnect → resend |
| **Watchdog vs. finalizer race** | 45s SSE freeze watchdog fires *and* Layer 2 finalizer fires on the same streamId | — | Single reconnect-prompt bubble (idempotent) | Single Reconnect affordance — see §4.2 |
| Post-fix Layer 1 + Layer 2 both fire | Any combination | — | Single reconnect-prompt bubble (Layer 2 is idempotent by `kind` check) | Single Reconnect affordance |

---

## 4. Fix Design

### 4.1 Layer 1 — Server-side structured fallback (corrected location)

**Key correction from prior draft:** `streamExchange` in `services/exchanges.ts:325` does **not** emit SSE and has no `onComplete` wrapper. SSE is written by the route handlers. The guard decision must therefore live at the **boundary where the route has both the raw response and the SSE writer in scope**.

Split into two edits:

#### 4.1a — Detection in `onComplete` returns a signal

**File:** `apps/api/src/services/session/session-exchange.ts` (inside `streamMessage.onComplete`, around line 1070 where `parseExchangeEnvelope(rawResponse, ...)` currently runs).

**File:** `apps/api/src/services/interview.ts` (inside the inline `onComplete` at line 406).

**Change:** After `parseExchangeEnvelope` (or `interpretInterviewResponse`) runs, classify the outcome. Add a discriminated `fallback` field to the returned result object:

```ts
type FallbackReason = 'empty_reply' | 'malformed_envelope' | 'orphan_marker';

interface StreamMessageResult {
  // ...existing fields
  fallback?: {
    reason: FallbackReason;
    fallbackText: string; // "I didn't have a reply — tap to try again."
  };
}
```

Populate `fallback` when:

- `parsed.cleanResponse.trim() === ''` AND envelope parsed ok → `'empty_reply'`
- `parsed.cleanResponse.trim() === ''` AND envelope parse failed (marker-only produces this today; see §4.4) AND raw is **not** a recognized marker → `'malformed_envelope'`
- Raw is a recognized marker **but** no handler dispatch path applies for this flow → `'orphan_marker'`

If marker is recognized AND a handler applies, **do not** populate `fallback` — let the existing marker path run (see §4.4).

#### 4.1b — SSE emission in the route

**File:** `apps/api/src/routes/sessions.ts` (around line 235 where `onComplete()` is awaited before the `done` event).

**File:** `apps/api/src/routes/interview.ts` (around line 155).

**Change:** After awaiting `onComplete()` but **before** writing the `done` event, inspect `result.fallback`. If set, write a dedicated SSE event:

```ts
if (result.fallback) {
  await sseStream.writeSSE({
    data: JSON.stringify({
      type: 'fallback',
      reason: result.fallback.reason,
      fallbackText: result.fallback.fallbackText,
    }),
  });
}
await sseStream.writeSSE({
  data: JSON.stringify({ type: 'done', ...existingFields }),
});
```

**Emit order is load-bearing:** `fallback` must precede `done` so the mobile finalizer observes the fallback flag before marking the stream finished. If `done` arrives first, Layer 2's fallback branch never fires and only the zero-chunk fallback branch runs — defeating the compose-not-collide design.

**Why this shape (not a content chunk):** if Layer 1 emits a plain `chunk`, Layer 2's empty-check never fires and mobile shows a plain text bubble with feedback chips and no Reconnect affordance — the dead-end persists one layer deeper. A distinct event type lets mobile route to `kind: 'reconnect_prompt'` deterministically.

**Persistence rule (break-tested):** when `fallback` is set, `persistExchangeResult` (session-exchange.ts:1081) must **not** persist `parsed.cleanResponse` as the assistant turn. Either skip the persist entirely or write a sentinel that's filtered out of `exchangeHistory` builds. This prevents the LLM seeing its own fallback string on turn N+1 and mimicking it. The exact write-path change is the subject of the unit test in §6 — we prefer a unit test on the write site over a DB round-trip integration test for speed/stability.

### 4.2 Layer 2 — Mobile finalizer converts to reconnect prompt (idempotent)

**File:** `apps/mobile/src/components/session/use-session-streaming.ts` (inside the `onComplete` handler around line 561).

**Change:** Pass through a `fallback` SSE event from the stream consumer into the finalizer. Finalizer converts a message to `kind: 'reconnect_prompt'` if **any** of:

1. A `fallback` SSE event arrived during the stream (Layer 1 fired)
2. `content.trim().length === 0` at finalize time (zero-chunk stream, abort before Layer 1 could emit)

**Idempotency guard (new):**

```ts
setMessages((prev) =>
  prev.map((m) => {
    if (m.id !== streamId) return m;
    if (m.kind === 'reconnect_prompt') return m; // watchdog already converted — do nothing
    return {
      ...m,
      content: fallbackText ?? "I didn't have a reply — tap to try again.",
      streaming: false,
      kind: 'reconnect_prompt' as const,
      eventId: result.aiEventId,
    };
  })
);
```

The existing 45s SSE watchdog at `use-session-streaming.ts:504-532` already sets `kind: 'reconnect_prompt'`. The idempotency guard above prevents the finalizer from double-writing when the watchdog has already rewritten the message.

### 4.3 Try Again resend — **already implemented**

Verified by code inspection:

- `handleReconnect` at `use-session-streaming.ts:800-838` uses `lastRetryPayloadRef.current` and calls `continueWithMessage(retryPayload.text, retryPayload.options)`.
- It also removes both the error AI message **and** the preceding user message before replaying, preventing transcript duplication.
- Guards on `isStreaming`, `sessionExpired`, `quotaError` are in place.

**No change required in the handler.** Verification in §6 is a test asserting that tapping Reconnect on a `reconnect_prompt` produced by Layer 1 ends up in `continueWithMessage` with the correct payload — i.e. that `lastRetryPayloadRef` is populated at the right moment.

### 4.4 Marker-only payloads — single canonical detector

Today, marker-only payloads like `{"notePrompt":true}` are handled in **three** different places:

1. Server: `parseExchangeEnvelope` (`exchanges.ts:396-417`) falls through with `cleanResponse: rawTrimmed` on parse failure
2. Server: downstream consumers treat the raw JSON as visible text
3. Mobile: regex strip at `use-session-streaming.ts:581-593` removes the JSON residue

This plan **consolidates detection on the server**:

- Add `isRecognizedMarker(raw)` in `services/llm/envelope.ts` (colocated with `parseEnvelope`).
- In `session-exchange.ts:streamMessage.onComplete` and `interview.ts:onComplete`, classify raw as `marker | envelope | unknown` before `parseExchangeEnvelope`.
- If `marker` and a dispatch handler exists for this flow: set the marker's effect (e.g. `notePrompt: true`) on the result and **skip** persisting the raw JSON as assistant content. Do not populate `fallback`.
- If `marker` and no handler: set `fallback.reason = 'orphan_marker'`.
- If `envelope` or `unknown`: existing `parseExchangeEnvelope` flow.

**Delete the mobile regex-strip at `use-session-streaming.ts:581-593` in the same commit as the server change.** Two sources of truth about what a marker looks like is exactly the adversarial-review antipattern. If the server no longer persists marker JSON as visible text, the mobile strip is dead code.

### 4.5 `isSystemPrompt` cleanup (expanded)

Previously scoped to just the chip-gate. Actual usage is wider:

| Site | Current use |
|---|---|
| `SessionMessageActions.tsx:56-59` | Chip-gate condition — if `isSystemPrompt`, skip chip rendering |
| `use-session-streaming.ts:525` (45s watchdog) | Sets `isSystemPrompt: true` when converting to `reconnect_prompt` |

**Change:** chip-gate in `SessionMessageActions.tsx` gates on `kind !== 'reconnect_prompt'` (and `kind !== 'quota_exceeded'` already present) — no longer reads `isSystemPrompt` for this purpose. **Also** remove `isSystemPrompt: true` from the watchdog site in `use-session-streaming.ts:525`. Both reconnect-prompt producers (watchdog, Layer 2 finalizer) now emit the same shape.

Audit other `isSystemPrompt` consumers before deleting. If `isSystemPrompt` has no other meaningful consumer after this change, remove the field entirely per `feedback_adversarial_review_patterns` "clean up all artifacts when removing a feature."

---

## 5. Cross-Flow Impact (decided, not speculative)

Based on Prereq 3's executed enumeration:

| Flow | Guard applies? | Fallback copy | Counts against caps? | Open question / decision |
|---|---|---|---|---|
| Freeform `/ask` (session-exchange) | Yes | "I didn't have a reply — tap to try again." | **No** — guard fires inside `onComplete`; decrement `persistExchangeResult` quota bump by short-circuiting that call when `fallback` is set. Also refund route-level quota already handled by `incrementQuota` in the `catch` block (`sessions.ts:258`) — **reuse that refund path** by making the onComplete throw a typed `FallbackOnlyResult` when caller needs to refund | — |
| Homework (verify-mode, help-mode) — same route as freeform | Yes | "I didn't have a reply — tap to try again." | No | **Product decision needed before merge:** is Reconnect a resend of the same answer, or should the button copy differ ("Ask me again")? Default: same copy, same resend behavior (which is what `handleReconnect` already does). If product wants different copy, add a `fallbackText` override per flow at the onComplete site. |
| Interview | Yes, separate wiring in `interview.ts:onComplete` | "I didn't catch that — tap to try again." | **No** — `currentExchangeCount` must be read from the pre-fallback value. Concretely: the guard fires *before* the completion check at interview.ts:416-417 would otherwise advance the count. Verify this in a test: empty-reply on exchange 5 must not advance to exchange 6. |
| Session-exchange (generic, non-interview) | Same as freeform | Same | No | — |

**Decision gate closed.** All four flows use the guard. No flows deferred.

---

## 6. Verified By Table

Every row must resolve before the fix is declared done (per `feedback_fix_verification_rules`).

| Fix | Verification |
|---|---|
| Layer 1 sets `fallback.reason='empty_reply'` on empty envelope | test: `session-exchange.test.ts:"onComplete returns fallback on empty envelope reply"` |
| Layer 1 sets `fallback.reason='malformed_envelope'` on parse failure (non-marker) | test: `session-exchange.test.ts:"onComplete returns fallback on malformed envelope"` |
| Layer 1 sets `fallback.reason='orphan_marker'` on marker with no handler | test: `session-exchange.test.ts:"onComplete returns fallback on orphan marker"` |
| Layer 1 does **not** set fallback when marker has a handler | test: `session-exchange.test.ts:"onComplete dispatches recognized marker without fallback"` |
| Interview onComplete: fallback does not advance `exchangeCount` | test: `interview.test.ts:"empty-reply fallback does not advance interview exchange count"` |
| `persistExchangeResult` not called when fallback is set (unit test — no DB round-trip) | test: `session-exchange.test.ts:"fallback short-circuits persistExchangeResult"` |
| Route emits `fallback` SSE event **before** `done` | test: `routes/sessions.test.ts:"emits fallback SSE event before done on empty reply"` |
| Route does not emit fallback on normal reply | test: `routes/sessions.test.ts:"no fallback SSE on normal reply"` |
| Route refunds quota when fallback fires | test: `routes/sessions.test.ts:"refunds quota on fallback"` |
| Fallback text never appears in next exchange history | test: `session-exchange.test.ts:"excludes fallback turns from exchangeHistory"` |
| Layer 2 converts on explicit `fallback` event | test: `use-session-streaming.test.ts:"converts message to reconnect_prompt on fallback SSE event"` |
| Layer 2 converts on zero-chunk finalize | test: `use-session-streaming.test.ts:"converts empty-content finalized message to reconnect_prompt"` |
| Layer 2 is idempotent when watchdog already converted | test: `use-session-streaming.test.ts:"finalizer does not overwrite watchdog-produced reconnect_prompt"` |
| Reconnect tap after fallback calls `continueWithMessage` with retry payload | test: `use-session-streaming.test.ts:"reconnect after Layer 1 fallback replays last user message"` |
| Chip-gate on `kind === 'reconnect_prompt'` without `isSystemPrompt` | test: `SessionMessageActions.test.tsx:"does not render feedback chips on reconnect_prompt kind"` |
| Watchdog no longer sets `isSystemPrompt: true` | test: `use-session-streaming.test.ts:"watchdog reconnect_prompt does not set isSystemPrompt"` |
| Mobile regex-strip for marker JSON deleted and no regression on now-unreachable shape | test: `use-session-streaming.test.ts` — existing marker-shape test should be **removed** alongside the strip; verify no other test references it |
| Integration: real SSE path, stubbed LLM empty-reply, mobile sees reconnect-prompt end-to-end | test: `integration-tests/sessions-stream.test.ts:"empty LLM reply produces fallback event end-to-end"` |
| Single observability pipe (Inngest) fires on every fallback | test: `session-exchange.test.ts:"emits inngest event on fallback"` |
| No regression on normal reply path | existing `sessions.test.ts`, `interview.test.ts`, `use-session-streaming.test.ts` pass |

---

## 7. Observability (single pipe)

Previous draft had Sentry at 1% sample + Inngest at 100%. That's two sources of truth for the same fact. Picking one:

- **Inngest event `exchange.empty_reply_fallback`**, 100% of occurrences, with payload:
  - `reason: 'empty_reply' | 'malformed_envelope' | 'orphan_marker'`
  - `sessionId`, `profileId`, `flow` (`'streamMessage' | 'streamInterviewExchange'`)
  - `exchangeCount` if available at the site (confirmed in scope inside `session-exchange.ts:streamMessage.onComplete` via `persisted.exchangeCount` — but persist is skipped when fallback fires, so plumb the pre-persist exchange count explicitly)
  - First 200 chars of raw response

Inngest wins because it's queryable, not sampled, and already the canonical durable-metric path per the repo rule "silent recovery without escalation is banned." Sentry remains for **uncaught errors only** — the existing `captureException` call in `routes/sessions.ts:255` is unchanged; we are not routing the fallback signal through it.

Three distinct `reason` values mean triage can separate "LLM format drift" (`malformed_envelope`) from "widget-trigger-without-handler" (`orphan_marker`) from "LLM refused to answer" (`empty_reply`) without parsing event names.

---

## 8. Root-Cause Follow-Up (dated, not deferred)

Layer 1 is boundary defense. The real fix is the LLM emitting malformed envelopes less often.

**Concrete commitment:**

- File GitHub issue **before merging this PR**: "Tune envelope adherence for freeform chat" — linked in the PR description.
- Owner: assigned at filing time (whoever is on LLM tuning rotation; if unassigned, Zuzana).
- Review date: **2026-05-07** (14 calendar days post-merge assuming 2026-04-23 merge — adjust at PR time). Calendar invite on that day.
- Trigger condition for reprioritization: if any `reason` bucket exceeds **2% of exchanges in any 24-hour window**, escalate to P1 regardless of calendar date.
- Deliverable from the follow-up: either (a) a prompt-tuning PR backed by `pnpm eval:llm` regression fixtures, or (b) a written "no-action" memo explaining why current rates are acceptable.

If the follow-up issue is not filed before merge, the plan is not done. This replaces the prior "review after 7 days of data" soft commitment.

---

## 9. Rollback

Both layers are additive and revertible independently:

- Layer 1 (server): adds a `fallback` field on onComplete result + a conditional SSE event. Reverting restores pre-fix behavior (empty bubble + chips) — no data written that won't be written in normal flow.
- Layer 2 (mobile): adds a conditional branch in the finalizer + changes chip-gate condition + removes `isSystemPrompt` from watchdog. Reverting does not corrupt any persisted state.

No DB migration, no schema change, no exchange-history shape change. Deploy order: server first (old clients continue to show empty bubble + chips), then mobile OTA. `git revert` safe on either half alone.

---

## 10. Commit Plan

Three commits (not two — the marker consolidation warrants its own atomic change):

1. `fix(api): return fallback signal from streamMessage.onComplete on empty/malformed envelope [EMPTY-REPLY-GUARD-1]` — Layer 1a (detection + quota refund + persist short-circuit) in `session-exchange.ts` and `interview.ts` + unit tests + Inngest emit
2. `fix(api): emit fallback SSE event from session/interview routes [EMPTY-REPLY-GUARD-2]` — Layer 1b (SSE wiring in `routes/sessions.ts` and `routes/interview.ts`) + route tests + integration test
3. `fix(mobile): convert empty/fallback stream completion to reconnect prompt + drop mobile marker regex [EMPTY-REPLY-GUARD-3]` — Layer 2 (finalizer branch, idempotency, chip-gate, watchdog `isSystemPrompt` removal, mobile regex deletion) + mobile tests

Single PR for all three commits. Rationale: server-only change has no end-to-end benefit (old clients still show empty bubble); mobile-only change has no backend to trigger the new path. Land together, revert independently.

---

## 11. Out of Scope (tracked separately)

- **LLM prompt tuning** — see §8, concrete issue filed at PR time.
- **Exchange-history wrapping audit** — interview path double-wraps (`interview.ts:318-331`); non-interview path does not (`exchanges.ts:334-337`). Unrelated unless Prereq 1 shows evidence they interact.
- **`MAX_EXCHANGES_PER_SESSION = 50` removal** — per "no cap on anything else but interview." File after this bug resolves.
- **`isSystemPrompt` field deletion** — §4.5 removes the two live usages; a follow-up sweep deletes the field from `ChatMessage` type if no other consumers remain. Bundled into commit 3 only if the sweep is trivial; otherwise filed separately.

---

## 12. Changes from Prior Draft

1. ✅ **Layer 1 location corrected.** `streamExchange` does not emit SSE. Guard now lives in `session-exchange.ts:streamMessage.onComplete` + `interview.ts:onComplete` (detection) and `routes/sessions.ts` + `routes/interview.ts` (SSE emit). Split as §4.1a / §4.1b.
2. ✅ **Prereq 3 executed.** Caller enumeration is in §2 as a closed table, not a gate.
3. ✅ **§4.3 closed.** `handleReconnect` at `use-session-streaming.ts:800-838` already resends via `continueWithMessage`; verification is now a test row, not an open item.
4. ✅ **§4.5 expanded.** Covers both chip-gate and watchdog `isSystemPrompt` usage; watchdog site at line 525 included.
5. ✅ **Watchdog-vs-finalizer race addressed.** §3 adds the row; §4.2 adds the idempotency guard.
6. ✅ **SSE emit order specified.** `fallback` strictly before `done` (§4.1b), with the rationale for why order matters.
7. ✅ **Marker consolidation made atomic.** Single canonical `isRecognizedMarker` on server; mobile regex deleted in same commit (§4.4).
8. ✅ **Observability single-piped.** Sentry dropped for fallback signal; Inngest at 100% (§7). Three distinct `reason` values preserve triage granularity.
9. ✅ **§8 dated.** 14-day review date + 2%-of-exchanges escalation threshold + PR-blocking issue-file requirement.
10. ✅ **Persistence rule lowered to unit test.** DB round-trip integration replaced with unit test on the write site (§4.1a persistence rule; §6 row).
11. ✅ **Cross-flow table decided.** All four flows use the guard. Interview-specific `exchangeCount` preservation specified with a concrete test (§5, §6).
12. ✅ **Commit plan split to three.** Marker consolidation is its own atomic commit.
