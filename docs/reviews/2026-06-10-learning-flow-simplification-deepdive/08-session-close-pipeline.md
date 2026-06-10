# Session Close → Summary → Pipeline + Mode Taxonomy: Deep-Dive
> Cluster scope: session close → Summary screen → the `session-completed` Inngest pipeline + the 7-string UI mode taxonomy · Analyst: pipeline · Date 2026-06-10 · Sources verified at HEAD of `new-llm` (`git branch --show-current` = `new-llm`)

All file:line citations re-verified against source this session. VERIFIED = I read the line. INFERRED = reasoned from verified facts. Where the current doc (`learning-path-flows.md`) or the atlas is wrong at HEAD, §4 gives file:line proof.

---

## 1. Feature inventory (verified)

### 1.1 Dispatch sites (FOUR) + idempotency semantics

| Site | Trigger | Idempotency key | Load-bearing? | Evidence |
|---|---|---|---|---|
| `POST /sessions/:id/close` (skip-status only) | Close where `summaryStatus ∉ {pending, submitted, auto_closed}` | route: `session-completed-${sessionId}-${status}` (`sessions.ts:1630`) | **Yes** — only dispatch path for a non-reflection close | `sessions.ts:1286-1304` |
| `POST /sessions/:id/summary` (submit "Your Words") | prev summary null/pending/auto_closed | same route key | **Yes** — primary happy-path dispatch | `sessions.ts:1472-1486` |
| `POST /sessions/:id/summary/skip` | prev summary null/pending/auto_closed | same route key | **Yes** — the "skip reflection" dispatch | `sessions.ts:1425-1438` |
| `session-stale-cleanup` cron | session idle >30 min | **un-keyed array** (`step.sendEvent` array, NO `id:`) — relies on Inngest native delivery dedup | **Yes** — only path for abandoned sessions | `session-stale-cleanup.ts:40-64` |

**Critical correctness fact (VERIFIED, under-stated in the doc):** all four sites converge on `session-completed`, which carries **function-level `idempotency: 'event.data.sessionId'`** (`session-completed.ts:377`) — keyed on `sessionId` ALONE, no status. So the route-level `${id}-${status}` key (`sessions.ts:1630`) only dedupes *retries within one status*; **cross-status and cron-vs-route collisions are deduped at the function level by `sessionId`.** The un-keyed cron is therefore not a hole — `session-completed` will not re-run for a `sessionId` it already processed. (This nuances `learning-path-flows.md:606-608`, which implies the cron's dedup is weaker; the function-level key is the real floor.)

### 1.2 The 17-step pipeline + gates (verified end-to-end)

| # | Step | Gate (VERIFIED) | Load-bearing? |
|---|---|---|---|
| 0 | `wait-for-filing` (≤60s) | `(sessionType==='homework' \|\| !topicId) && summaryStatus!=='auto_closed'` (`:399`) | Yes (homework/freeform filing); **incidental latency for topicless recitation** |
| 1 | `re-read-session` | `!topicId \|\| exchangeCount==null` (`:446`) | Yes (backfills after filing) |
| 2 | `process-verification-completion` | `vType ∈ {evaluate, teach_back} + topicId` | Yes |
| 3 | `relearn-retention-reset` | `mode==='relearn' && exchangeCount>0 && effectiveQuality!=null && topicId` (`:638-643`) | Yes (relearn correctness) |
| 4 | `update-retention` (SM-2) | skip if `retentionTopicIds.length===0` OR `effectiveQuality==null` (`:685-697`) | Yes (core SRS) |
| 5 | `update-vocabulary-retention` | four_strands + languageCode | Yes (language) |
| 6 | `update-needs-deepening` | quality + topics | Yes |
| 7 | `check-milestone-completion` | language milestone advanced | Marginal |
| 8 | `write-coaching-card` | always | Yes |
| 9 | `generate-session-insights` (2b) | LLM if ≥3 exch else template | Yes (parent recap) |
| 10 | `generate-learner-recap` (2c) | summary row + subjectId; `exchangeCount>=3 && transcriptTurns>=4` | Yes (drives the poll, §2.1) |
| 11 | `generate-llm-summary` (2d) | always | Marginal (archived-transcript only) |
| 12 | `analyze-learner-profile` (3) | **3-layer gate**: `memoryConsentStatus==='granted' && memoryCollectionEnabled!==false` (pre-LLM) + `isGdprProcessingAllowed` (pre-LLM) (`:1380-1396`) | Yes (memory, consent) |
| 13 | `embed-new-memory-facts` | Voyage key | Marginal |
| 14 | `dedup-new-facts` | `MEMORY_FACTS_DEDUP_ENABLED` | Marginal |
| 15 | `notify-struggle` (3b) | struggle detected | Yes (parent push) |
| 16 | `update-dashboard` (CRITICAL) | XP always; streak skipped if unattended/0-exch | Yes |
| 17 | `generate-embeddings` | **NO consent gate** (`:1670-1683`) — asymmetric with step 12 | Yes (retrieval); **see §4 asymmetry** |
| 18 | `extract-homework-summary` (6) | `sessionType==='homework'` (`:1690`) | Yes (homework only) |
| 19 | `update-pace-baseline` | always | Marginal |
| 20 | `queue-celebrations` | per-condition | Marginal |

(The doc and atlas both say "~17 steps"; the literal ordered count above is ~20 `step.run` blocks. The discrepancy is incidental — several are conditionally-skipped one-liners.)

### 1.3 The five summary/recap layers (VERIFIED, `learning-path-flows.md:644-651`)
1. `session_summaries` lifecycle (`pending→submitted|accepted|skipped|auto_closed`).
2. Reflection eval — `evaluateSummary` (rung 2), bonus XP; works freeform.
3. Learner recap + next-topic (step 2c) — **the thing the mobile poll waits on**.
4. Structured LLM summary (step 2d) — archived-transcript only, not real-time UI.
5. Parent insights (step 2b) — surfaced via `GET /recaps`.

### 1.4 The 7 mode strings (JSONB-only) vs `session_type` (3-value DB enum)
- **`mode` / `effectiveMode` is NOT a DB column** — VERIFIED: no `mode` column in `packages/database/src/schema/sessions.ts` (only `inputMode` text at `:142`); `effectiveMode` lives in `metadata` JSONB, read via `getSessionEffectiveMode()` (`packages/schemas/src/sessions.ts:265`).
- **`session_type` pgEnum = exactly 3 values**: `learning`, `homework`, `interleaved` (`sessions.ts:53-57`). VERIFIED.
- The 7 UI mode strings actually pushed (`freeform, learning, review, homework, relearn, recitation, gap_fill`) — 5 of them (`freeform, learning, review, relearn, recitation`) all map to `sessionType='learning'`; `gap_fill` also → `learning`. So the DB taxonomy is *already* collapsed; the 7 strings are a UI/prompt-layer overlay.

---

## 2. Complexity map

### 2.1 User-felt complexity (the close → summary → spinner trace)
A user ending a session walks a **3-screen exit funnel** (atlas `learning-session.md:108-109,209`): End button → (homework only) library-filing prompt → Summary "Your Words" → (homework only) recall bridge → Continue. The felt friction:
- **The recap dead-wait.** On the Summary screen, `useSessionSummary` polls **every 2s with a 15s timeout** (`session-summary/[sessionId].tsx:189-197, 231-251`), gated `exchangeCountForRecap >= 3`. The poll only stops when `learnerRecap` lands or the 15s elapses. The recap is produced by pipeline step 2c (`generate-learner-recap`) — which runs *after* the 60s filing-wait for topicless/homework sessions. So for a homework or freeform session the learner can sit on the spinner for up to ~15s and **still time out**, because the recap is gated behind a pipeline that itself may be 60s deep. The 15s/2s numbers are a UI guess disconnected from real pipeline latency.
- **Reflection is optional but framed as a wall.** "Your Words" + Skip is a full screen for what is one declinable turn.

### 2.2 Hidden complexity (dispatch sites, idempotency, step graph, crons)
- **Four dispatch sites, two idempotency regimes** (route `${id}-${status}` vs cron un-keyed), reconciled only by the function-level `sessionId` idempotency. A reader cannot reason about double-runs without knowing all three keys.
- **`session-completed` is a ~20-step monolith** (`session-completed.ts:358-1811`) doing SM-2 math, 4 LLM generations (insights, recap, summary, profile-analysis), 2 Voyage embedding passes, dashboard, push, celebrations — atlas calls it "the single most important background process" (`inngest-crosscutting.md:176`).
- **Two reconciliation crons** sit behind it: `session-stale-cleanup` (every 10 min, closes idle >30 min) and `summary-reconciliation-cron` (daily 04:00, re-queues missing summaries/recaps without replaying the full pipeline). VERIFIED `inngest-crosscutting.md:35,44`.
- **Mode-branch blast radius (VERIFIED counts):** `exchange-prompts.ts` has **28-31** mode-conditional sites (`isRecitation`, `isReviewMode`, `gap_fill`, `effectiveMode` switches — see `:482-484, 549, 770, 864, 1205`); `session-exchange.ts` **19**; ~15 mobile files (top: `use-session-streaming.ts:26`, `use-session-actions.ts:14`, `session/index.tsx:13`). These gate **real pedagogy** (review source-override, recitation prompt, relearn opener, gap_fill targeting), not cosmetics.

### 2.3 Load-bearing vs incidental verdict
**Load-bearing (keep):** the 4-step retention spine (verification-completion → relearn-reset → update-retention → needs-deepening), the consent gate on step 12, the function-level `sessionId` idempotency, the parent-facing insights/recap/homework-summary, dashboard XP/streak. These earn their place — they are the product's memory and SRS.

**Incidental / accretion (candidates):** (a) the **60s filing-wait firing for topicless recitation** — recitation never files, so the wait always times out at 60s then proceeds (`learning-path-flows.md:356`); pure latency tax. (b) The **mobile recap poll's 2s/15s magic numbers** — decoupled from real pipeline depth. (c) `generate-llm-summary` (2d) and `update-pace-baseline` run *always* but feed only archived-transcript reads / a median — low marginal value per session. (d) ~20 observability "observe" sink functions wrapping this pipeline (`inngest-crosscutting.md:112-118`) — zero user value, exist only because the layer is otherwise unobservable.

---

## 3. Hypothesis audit (claims from proposed/diff docs + atlas on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| Atlas: `filing-timed-out-observe.ts:303` has **illegal step nesting** (`step.sendEvent` inside `step.run`) that throws at runtime | **REFUTED at HEAD** | The bug was already fixed on `new-llm`. The fix-comment `[H-2 / INNGEST-NESTED-STEP]` at `:264-272` documents the prior nesting and the hoist; the `step.sendEvent` at `:317` runs at top level (the `step.run` at `:277` closes at `:302` returning `{shouldEmit}`). All 8 `step.sendEvent` calls in the file are top-level. |
| Diff doc: "reward-first close" (dispatch a recap path immediately on *pending* close) hits an idempotency trap — pending-close + later submit = different keys → double-run | **PARTIAL / mostly REFUTED** | The *route* keys differ (`...-pending` vs `...-submitted`), but `session-completed`'s **function-level `idempotency: 'event.data.sessionId'`** (`:377`) dedupes across statuses — the second dispatch is dropped at function level. Double-run only possible if the function idempotency window expires between the two dispatches (Inngest's idempotency TTL), which for a same-session close→submit (seconds apart) does not happen. The trap is real *in principle* but **bounded to near-zero in practice**; reward-first close is **L**, not M. |
| Doc: "pending close does NOT dispatch; a skip close dispatches immediately" | **CONFIRMED** | `sessions.ts:1286-1289`: `shouldDispatchCompletionEvent = status !== 'pending' && !== 'submitted' && !== 'auto_closed'`. Pending is excluded; skip (which sanitizes to `'skipped'`) passes the guard. |
| Doc: dispatch fires from FOUR sites, the cron path un-keyed | **CONFIRMED** | 3 route sites via `dispatchSessionCompletedEvent` (`sessions.ts:1295,1430,1478`); cron array send, no `id:` (`session-stale-cleanup.ts:40-64`). |
| Doc: `mode` is JSONB-only; `session_type` already 3-value | **CONFIRMED** | No `mode` column (`schema/sessions.ts`); `sessionTypeEnum` = `learning/homework/interleaved` (`:53-57`). |
| Doc: `update-retention` skips when quality null | **CONFIRMED** | `session-completed.ts:687-697`. |
| Doc: `relearn-retention-reset` resets card to baseline before SM-2 advance | **CONFIRMED + REFINED** | `:636-677`. Refinement: the reset is *also* gated on `effectiveQuality != null && topicId` (`:638-643`) — a relearn session with no verification overlay (null quality) skips BOTH reset and advance. |
| Doc: analyze-learner-profile 3-layer consent gate, embeddings ungated | **CONFIRMED** | gate `:1380-1396`; `generate-embeddings` calls `storeSessionEmbedding` with no gate `:1670-1683`. |
| Doc: recitation gets a guaranteed 60s filing-wait timeout | **CONFIRMED** | recitation is topicless → `!topicId` triggers the wait `:399`; never files → 60s timeout → Sentry + `app/session.filing_timed_out` `:415-439`. |
| Spec §7: exit funnel dissolves only AFTER P3 park-and-return eval coverage | **CONFIRMED (constraint stands)** | spec `:25, :254, S3/S6 in §11`. |

---

## 4. Current-doc corrections (file:line proof)

1. **Atlas `inngest-crosscutting.md` (and the cluster brief) call `filing-timed-out-observe.ts:303` an illegal-nesting runtime throw.** REFUTED at `new-llm` HEAD: fixed, see `filing-timed-out-observe.ts:264-272` (the fix-comment) + `:277-302` (`step.run` returns data only) + `:317` (`step.sendEvent` hoisted to top level). **The bug register entry is stale.**

2. **`learning-path-flows.md:606-608`** frames the cron's reliance on "Inngest's native delivery dedup, NOT the `${id}-${status}` key" as the dedup story. Incomplete: the authoritative backstop for *all four* paths is `session-completed`'s **function-level `idempotency: 'event.data.sessionId'`** (`session-completed.ts:377`). Worth adding so the reward-first-close analysis isn't mis-scoped.

3. **`learning-path-flows.md:617` ("relearn-retention-reset … mode==='relearn'")** omits that the step *also* requires `effectiveQuality != null && exchangeCount > 0 && topicId` (`session-completed.ts:638-643`). A relearn session with no overlay-derived quality silently skips the reset.

No regressions found to the V0 5-tab shell, envelope contract, `profileId` scoping, or `safeSend` in any candidate below.

---

## 5. Simplification candidates

**C1 — Skip the 60s filing-wait for recitation (and any topicless mode that never files).**
- User gain: removes up to 60s of invisible server latency before the recap/dashboard land for recitation sessions.
- Deleted/kept: keep the wait for homework/freeform (they file); add `effectiveMode !== 'recitation'` (or a `willFile` predicate) to the `:399` gate.
- Size: **S**. One predicate change at `session-completed.ts:399`.
- Classification: **SHIP-NOW** (no spec conflict; pure latency fix).
- Risk: low — recitation has no filing event to wait for, so the wait is pure dead-time. Verify no recitation path ever dispatches `app/filing.completed` (grep confirms recitation is topicless and not in `isClosePathAutoFileEligible`).
- Verdict: **REAL WIN**.

**C2 — Kill / shorten the recap-poll dead-wait on the Summary screen.**
- User gain: the spinner stops guessing. Either (a) drop the fixed 15s and key the timeout off `pipelineQueued` + a server "recap-ready" signal, or (b) at minimum surface the recap via the existing `pipelineQueued` flag rather than blind 2s polling.
- Deleted/kept: keep the recap; replace the magic 2s/15s (`[sessionId].tsx:195, 251`) with a pipeline-aware wait or push.
- Size: **M** (touches mobile poll + would benefit from a server "recap ready" event; pure-mobile timeout-tuning is **S**).
- Classification: **SHIP-NOW** for the mobile timeout-tuning; the eventing version is **SPEC-ABSORBED** (§8.2 activity-ledger `surfacedAt` is the natural carrier for a "recap ready" moment).
- Risk: low for tuning; medium if adding an event (must stay non-core/`safeSend`-posture per §8.2).
- Verdict: **CONDITIONAL** (S tuning = real win now; full fix waits on §8.2 ledger).

**C3 — Stop treating the atlas "illegal nesting" finding as open work.**
- User gain: none directly; removes a phantom bug from the register so effort isn't spent re-fixing a fixed bug.
- Size: **S** (doc/register edit, out of scope for this read-only pass — flagged for the coordinator).
- Classification: SHIP-NOW (register hygiene).
- Verdict: **REAL WIN** (correctness of the bug register).

**C4 — "Reward-first close" (dispatch a recap-generating path on pending close).**
- User gain: recap could start generating the moment the user taps End, shaving the post-reflection wait.
- Deleted/kept: would remove the `pending`-exclusion at `sessions.ts:1287` for a *recap-only* sub-dispatch.
- Size: **L** — NOT M. The function-level `sessionId` idempotency means a naive "dispatch on pending too" makes the *first* dispatch win and the later submit/skip a no-op, so the reflection's `qualityRating` / bonus-XP / auto-note would never reach the pipeline. To do it safely you must split the pipeline into a "recap-now" slice and a "finalize-on-reflection" slice with *separate* idempotency — a real pipeline refactor.
- Classification: **CONFLICTS** with the spec's sequencing — the exit funnel itself is slated to dissolve into the mentor wrap-up turn (§7, gated on S3 P3 eval coverage). Building reward-first-close on the *current* 3-screen funnel is throwaway work.
- Risk: high (double-apply XP/retention if idempotency split is wrong — the exact class CLAUDE.md guards).
- Verdict: **MIRAGE** as a standalone now; revisit only inside the §7 funnel dissolution.

**C5 — 7→3 mode collapse (UI mode strings → `session_type`).**
- User gain: **none directly** — `mode` is already JSONB-only and `session_type` is already 3-value; users never see the taxonomy. This is internal.
- Deleted/kept: the 7 strings re-key onto 3 enum values, but the **~80 branch sites survive** (`exchange-prompts.ts` 28-31, `session-exchange.ts` 19, ~15 mobile files) because they gate genuinely divergent pedagogy/UI (review source-override, recitation prompt, gap_fill targeting, relearn opener, timer chrome). Collapsing the *string* does not collapse the *branches* — it just forces them to re-derive intent from `session_type` + extra metadata flags, which is strictly more code.
- Size: **XL** if pursued (touching every branch); the "win" is a smaller enum, not fewer branches.
- Classification: **SPEC-ABSORBED / superseded.** Spec §7 retires the ModeSwitcher and proxy via scope chips, and §7's exit-funnel dissolution + the S6 cutover change what "mode" even means. Doing a standalone mode collapse now is re-keying churn that the shell redesign will re-touch.
- Risk: high churn, low payoff; easy to introduce pedagogy regressions across 80 sites.
- Verdict: **MIRAGE** (the branches survive, just re-keyed). The S6 exit-funnel death removes any standalone reason to do it — let the shell redesign absorb mode semantics.

**C6 — Gate `generate-embeddings` on `isGdprProcessingAllowed` (close the consent asymmetry).**
- User gain: none felt; **compliance correctness** — transcript content currently reaches Voyage even under withdrawn GDPR consent (`:1670-1683`), while the generative-LLM path is gated (`:1394`).
- Size: **S** (add the same `isGdprProcessingAllowed` guard the profile step uses).
- Classification: SHIP-NOW (or formally document as intentional per `learning-path-flows.md:662` open-question 6). This is a **legal decision**, not a UX one — flag to the compliance owner.
- Risk: low code risk; the *decision* (gate vs document) is the open item.
- Verdict: **CONDITIONAL** (real win if legal rules "gate"; no-op if they rule "intentional").

---

## 6. Bottom line

**Simplification score: 2 / 5.** This cluster is *sophisticated, not bloated*. The pipeline's retention spine, consent gate, and function-level idempotency are load-bearing and correct; the mode taxonomy is already collapsed at the DB layer. The genuine wins are small and peripheral, not a structural simplification.

**Highest-value move:** **C1 — skip the 60s filing-wait for recitation** (size S, ship-now, removes up to 60s of invisible latency on every recitation completion), paired with **C2's mobile timeout-tuning** to stop the recap-poll dead-wait. Together they're the only user-felt latency reductions available without a refactor.

**The one thing that must NOT be simplified away:** the **function-level `idempotency: 'event.data.sessionId'` on `session-completed`** (`:377`) plus the conservative **null-quality skips** (`update-retention :687`, `relearn-reset :641`). These are what stop double-applied XP/retention and inflated forgetting curves across four dispatch sites and two crons. Any "reward-first close" (C4) or mode collapse (C5) that touches the dispatch/idempotency surface risks exactly the double-apply class CLAUDE.md's fix-verification rules exist to prevent. Leave the SRS spine and its idempotency alone; let the spec's §7 funnel dissolution own the close-path rework.
