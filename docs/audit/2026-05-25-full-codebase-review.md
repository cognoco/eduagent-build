# Full Codebase Review — 2026-05-25

> **STATUS (2026-06-27):** Audit backlog — findings tracked inline below; not wholesale re-verified in the 2026-06-27 doc-audit pass; treat per-item status as point-in-time. Mix of fixed (marked [FIXED]) and open items.

Branch: `date-notionbugfix` (from `origin/main` at `9dcc4b906`)
Reviewers: 15 parallel Sonnet lenses. Total raw findings: ≈ 182.
Verification deep-dive: 1 (L15-001).

This document captures every Critical / High finding from the review **and** the actionable Medium findings clustered alongside them. Low / Info findings live in the original lens transcripts and are not transcribed here. Items marked **[FIXED]** were addressed in this branch; everything else is open backlog.

---

## Fixed in this branch (working tree, uncommitted)

| ID | Sev | Description | File |
|---|---|---|---|
| L14-007 | Low | `EXPO_PUBLIC_E2E` flag value inconsistency (`'1'` vs `'true'`) — dictation gallery picker now matches seed routes | `apps/mobile/src/app/(app)/dictation/complete.tsx` |
| L8-006 | Low | `sessionTranscriptPurgedEventSchema.purgedAt` — call site stringifies the `Date` before sending | `apps/api/src/inngest/functions/transcript-purge-cron.ts` |
| L10-001 | Med | `startSession` session row + `session_start` audit event now atomic in one transaction | `apps/api/src/services/session/session-crud.ts` |
| L10-002 | Med | `skipTopic` / `unskipTopic` topic update + adaptation insert now atomic | `apps/api/src/services/curriculum.ts` |
| L3-001 | Med | `session-completed.ts` `analyze-learner-profile` step subject lookup scoped by `profileId` (closes cross-profile name leak on crafted/replayed events) | `apps/api/src/inngest/functions/session-completed.ts` |
| L6-001 | Med | `use-session-streaming.ts` homework-state sync + override-subject session create now route through `assertOk` — typed error classification restored | `apps/mobile/src/components/session/use-session-streaming.ts` |
| L1-002 | High | `embed-new-memory-facts` Inngest step now soft-fails (Sentry capture + sentinel return) instead of propagating to the function and retrying | `apps/api/src/inngest/functions/session-completed.ts` |
| L15-003 | High | Misleading comment at `notes.ts:237` referencing a non-existent `note-draft.guard.test.ts` corrected to describe the actual (unwired) state | `apps/api/src/services/notes.ts` |

---

## Critical / High deferred (need a dedicated work item)

### L15-001 — CRITICAL — Challenge Round mastery pipeline entirely unwired

The deep-dive verification (read-only) confirms every claim in the reviewer report:

- `decideMasteryAndReview()` (`services/challenge-round/evaluation.ts:119`) — **zero production callers**.
- `validateEvaluationEventIds()` (`evaluation.ts:82`) — **zero production callers**.
- `validateNoteDraft()` (`services/challenge-round/note-draft.ts:117`) — **zero production callers**.
- `envelopeToParsedExchange()` (`services/exchanges.ts:1627`) does **not** extract `signals.challenge_round_evaluation`, `signals.challenge_round_offer`, or `ui_hints.note_draft`. They are silently dropped.
- `ParsedExchangeEnvelope` (`exchanges.ts:1430-1476`) has **no slots** for those fields.
- `challengeEligible` / `challengeRound` on `ExchangeContext` are declared (`exchanges.ts:300-302`) but never populated anywhere in production.
- `evaluateChallengeReadiness()` (`trigger.ts:73`) is never called from any production path.
- The only production import from `challenge-round/` is `prompts.ts`. `evaluation.ts`, `note-draft.ts`, `trigger.ts`, `state.ts`, `caps.ts` are unreachable.

Net effect: the LLM is prompted to emit `challenge_round_offer` and `challenge_round_evaluation` signals, but server-side **nothing** consumes them. Mastery is never stamped. Notes are never validated. Cooldowns are never touched. The Challenge Round feature is fully aspirational at runtime.

This is a multi-day feature wiring project. Out of scope for a coordinator fix pass.

### L15-002 — HIGH — `ParsedExchangeEnvelope` missing CR fields (root cause of L15-001)

Add `challengeRoundEvaluation`, `challengeRoundOffer`, `noteDraft` slots and forward them from `envelopeToParsedExchange`. Part of the L15-001 wiring work.

### L15-004 — HIGH — `challengeEligible` / `challengeRound` never populated in production `ExchangeContext`

`buildExchangeContext()` (`session/session-exchange.ts:1619-1704`) must call `evaluateChallengeReadiness()` and set both fields. Part of the L15-001 wiring work.

### L5-003 — HIGH — `claimWebhookId` does direct `db.insert` from a route file

`apps/api/src/routes/resend-webhook.ts:37-57` imports `webhookIdempotencyKeys` from `@eduagent/database` as a runtime value and runs the insert inside a route file. `routes/stripe-webhook.ts:22` imports the same function. Should move to `apps/api/src/services/webhook-idempotency.ts`. Approx 1 hour of mechanical refactor + test updates.

### L5-004 — HIGH — `revenuecat-webhook.ts` is 725 LOC of business logic in the route layer

Nine handler functions, `PRODUCT_TIER_MAP`, and `constantTimeCompare` should move to `services/billing/revenuecat.ts` (or similar). The route file should only do request validation + dispatch. Matches the `stripe-webhook.ts` cleanup pattern. ~1 day.

### L1-001 — HIGH — `services/billing/metering.ts:256` dead guard masks a logic flaw in the top-up loop

The `contendedTopUpIds.includes(topUp.id)` guard at line 256 can never be true because `notInArray` already filters those out. Currently harmless but a future refactor could re-introduce an infinite-loop scenario. Add an explicit attempts cap (e.g. `while (!updatedTopUp && attempts++ < 10)`). ~30 min.

### L12-001 — HIGH — `lib/format-relative-date.ts` returns hardcoded English ("Today", "Yesterday", "X days ago")

Used by 10+ user-visible screens (mentor-memory, progress, recaps, etc.). The i18n-aware version exists only in `progress/saved.tsx:20-30`. Lift that version into the shared lib and update all callers. ~half day.

### L12-002 — HIGH — `quiz/results.tsx` has zero `useTranslation` import

Whole screen English-only. ~1 hour.

### L12-003 — HIGH — `topic/relearn.tsx` has zero `useTranslation` import

Whole screen English-only. `COPY_DEFAULT` / `COPY_LEARNER` const blocks must be replaced with `t()` calls. ~1 hour.

### L12-004 — HIGH — 55 `subscription.*` keys identical to English across all 6 non-English locales

These strings appear during real-money flows (purchase alerts, child paywall). The CI staleness check verifies key presence, not translation. Add a value-equality detector and translate the 55 keys × 6 locales = 330 strings. ~half day translation effort + ~1 hour to add the detector.

### L12-005 — HIGH — `toLocaleDateString('en-US', ...)` hardcoded in 4 spots

`child/.../session/[sessionId].tsx:35`, `topic/[topicId].tsx:82,103`, `format-note-source.ts:10,103`. Replace with locale-aware formatting using i18next's current language. ~1 hour.

---

## Important Mediums (not in the High set but worth a fast-follow)

| ID | Lens | File | Description |
|---|---|---|---|
| L13-008 | Deps | `pnpm-lock.yaml` | `react-native-css-interop@0.2.1` appears in both patched and unpatched copies — NativeWind Windows patch may not apply to the unpatched resolution |
| L13-001 | Deps | `apps/mobile/package.json` | `@clerk/clerk-expo@^2.19.23` is deprecated — migrate to `@clerk/expo` |
| L13-003 | Deps | (transitive) | `@ungap/structured-clone@1.3.0` has CWE-502; bump to 1.3.1+ |
| L13-006 | Deps | root `package.json` | `ts-node@10.9.1` is redundant (project uses `tsx`); removing it drops the `@esbuild-kit/*` abandoned packages and one extra esbuild install |
| L9-002 | Inngest | `weekly-self-reports.ts:127` | Cron `'0 * * * 1'` fires hourly every Monday; intent was once-per-Monday (`'0 0 * * 1'`) |
| L9-003 | Inngest | `routes/maintenance.ts:102-112` | Operator-triggered backfill dispatches wrapped in `safeSend` → ops sees `{ queued: true }` even when nothing queued |
| L11-001 | Errors | `routes/resend-webhook.ts:54` | `claimWebhookId` catch swallows DB errors with no Sentry / logger — sustained DB outage silently re-runs every webhook |
| L11-002 | Errors | `routes/filing.ts:231` | `resolveFilingResult` failure logs `logger.error` but no `captureException` |
| L7-003 | Perf | `services/recaps.ts:109-123` | `getRecapForParent` fans out N×`getChildSessionDetail` — O(N) per recap lookup |
| L7-001/L7-008 | Perf | `services/library-search.ts:177` | `ilike` on 6+ text columns with no GIN/trgm index outside `topic_notes.content` |
| L8-008 | Schema | many routes | 97 instances of `c.req.param()` without UUID validation — invalid UUIDs reach DB layer and produce 500s instead of 400s |
| L4-001 / L4-002 | Tests | `intro-state.test.ts:11`, `welcome.test.tsx:38` | New internal mocks added without `// gc1-allow:` annotation (GC1 ratchet violations) |

---

## Per-lens totals

| Lens | Findings | Critical | High |
|---|---|---|---|
| L1 — Correctness | 10 | 0 | 2 |
| L2 — Security (authn/authz) | 20 | 0 | 0 |
| L3 — Data integrity / scoping | 10 | 0 | 0 |
| L4 — Test quality | 14 | 0 | 0 |
| L5 — Architecture | 9 | 0 | 2 |
| L6 — UX / failure modes | 12 | 0 | 0 |
| L7 — Performance | 10 | 0 | 0 |
| L8 — Schema contract | 10 | 0 | 0 |
| L9 — Inngest / background jobs | 8 | 0 | 0 |
| L10 — DB / migrations | 7 | 0 | 0 |
| L11 — Error handling | 9 | 0 | 0 |
| L12 — a11y / i18n | 19 | 0 | 5 |
| L13 — Dependencies | 20 | 0 | 0 |
| L14 — Config / secrets | 14 | 0 | 0 |
| L15 — LLM / AI surface | 10 | **1** | 3 |
| **Total** | **≈182** | **1** | **12** |

The single Critical (L15-001) is the only finding that materially changes the product's runtime behavior — and the change is in the **opposite** direction from what the codebase suggests it does. Everything else is hardening, hygiene, or polish.

---

## How to use this document

1. Pick one finding ID at a time when scheduling work — they each have file:line citations and a concrete fix direction.
2. The "Fixed in this branch" set is staged but **not committed**. The user (or `/commit`) decides whether to land it.
3. For the deferred Critical / High items, open a tracking work item per cluster (Challenge Round wiring, i18n sweep, route refactor) — they are not single-PR items.
