# Silent Failure Hunter — `apps/api/src` Error-Handling Audit

**Scope:** Path-scoped rule-verification pass over `apps/api/src` (Hono/Cloudflare Workers, Drizzle/Neon, Clerk, Inngest, Stripe/RevenueCat, LLM router). Not a PR diff — **all findings classified `[PRE-EXISTING]`.** Weighting: billing / auth / webhook / consent highest.

## Executive Summary

This is an unusually well-instrumented codebase for error handling. The priority paths (billing webhooks, metering/quota, auth, consent, Inngest dispatch) have already undergone extensive silent-failure remediation — nearly every catch block in those paths carries a finding-ID tag (`[CR-...]`, `[BUG-...]`, `[FCR-...]`, `[SEC-...]`) and escalates via `captureException` (Sentry) and/or `safeSend` (Inngest, captured-on-failure). The four CLAUDE.md rules audited here **all pass** in the priority paths.

The escalation infrastructure is real and consistent:
- `captureException` / `captureMessage` → `services/sentry.ts` (queryable Sentry events, the "structured metric" required by the no-silent-recovery rule).
- `safeSend()` → `services/safe-non-core.ts` (non-core Inngest/webhook dispatch; captures failure + late-rejection + timeout to Sentry, never throws).
- `safeRefreshKvCache()` → `services/safe-refresh-kv-cache.ts` and `safeReadKV`/`safeWriteKV`/`safeDeleteKV` in `middleware/metering.ts` (KV failures captured, never propagate 5xx to webhook senders — prevents Stripe/RevenueCat 72h retry storms).

No CRITICAL or HIGH silent-failure findings were identified in the audited scope. The findings below are LOW/MEDIUM observations on non-priority paths plus a couple of style notes.

---

## CLAUDE.md Rule Verification

### Rule 1 — "Silent recovery without escalation is banned" (billing / auth / webhook / consent / LLM) — **PASS**

Every catch/fallback in the money/access/GDPR paths emits a structured Sentry event and/or Inngest signal in addition to logging. Verified sites:

- `routes/stripe-webhook.ts:87` — signature-verify catch returns 400 (correct; no recovery to escalate). `:121-139` stale-event drop → `logger.warn` + `captureException`. `:168-188` idempotency-claim-unavailable → continues but `captureException` ("claim_unavailable").
- `services/billing/stripe-webhook-handler.ts:135-165` — unmapped Stripe status → `logger.warn` + `captureException` before early return. `:193-200` tier mismatch → `captureException`.
- `services/safe-refresh-kv-cache.ts:69-84` — KV refresh failure → `captureException` + `logger.error` (intentionally non-throwing; documented retry-storm rationale).
- `middleware/metering.ts:329` (idempotency replay lookup), `:455-462` (`safeReadKV`), `:473-480` (`safeWriteKV`), `:495` (`safeDeleteKV`) — all call `captureKvFailure` → `captureException(tag surface='billing.kv')`, and the replay-lookup path additionally fires a `safeSend` metric event. Double-quota-decrement risk on KV outage is explicitly escalated.
- `middleware/auth.ts:163-` — JWT verify catch **classifies** infra (JWKS/network/abort) vs. validation failure, escalates infra to `captureException`, and deliberately avoids the 401 that would force mass sign-out on a Clerk outage. Exemplary "classify before formatting" handling.
- `middleware/idempotency.ts:70-` — KV preflight read failure → `logger.warn` + `captureException(severity:'high')` + fail-closed 503 (does not admit duplicate writes).
- `middleware/profile-scope.ts:135-158` — auto-resolve failure → `logger.error` + `captureException` + fail-closed 503.
- `routes/revenuecat-webhook.ts:214-230` — unresolvable `app_user_id` → `logger.error` + `captureException` (with GDPR-conscious PII omission per `[SEC-11]`), acks 200 to avoid retry storm. The handler-level `if (!accountId) return;` (e.g. `services/billing/revenuecat-webhook-handler.ts:175`) is redundant defense-in-depth *behind* this route-level escalation — verified the route resolves+escalates before dispatch, so the handler early-return is not a silent drop.
- `services/billing/revenuecat-webhook-handler.ts:181-188` — unknown `product_id` → `captureException` before drop.
- `routes/resend-webhook.ts:431-470, 486-` — KV dedup read/pre-write failures → `logger.warn` + `captureException` + `safeSend` metric event.

### Rule 2 — Non-core Inngest via `safeSend()`; bare `inngest.send` only with `// core-send:` — **PASS**

Audited every `inngest.send` call site outside tests. Result: **100% compliance.** Every non-core dispatch is wrapped in `safeSend(...)` (sessions, quiz, consent, feedback, books, account, profile, subject, quota-provision, subscription-core, session-exchange, resend-webhook, session-filing-dispatch). Every *bare* `inngest.send` carries a justifying `// core-send: <reason>` comment immediately above (`routes/account.ts:69-73` account-deletion handoff; `routes/sessions.ts:350-352, 1522-1523, 1568-1569` filing/pipeline integrity; `routes/filing.ts:107-109`; `routes/maintenance.ts:69-70`; `services/session/session-exchange.ts:1191-1196` compensation pattern). Inngest-function internal `step.sendEvent` fan-outs (`session-stale-cleanup.ts`, `trial-expiry.ts`, `topup-expiry-reminder.ts`) document why they avoid bare loops. The one un-awaited `safeSend` (`session-exchange.ts:1806`) carries an explicit belt-and-braces `.catch` (BUG-755) and `routes/books.ts:171` registers the dispatch with `c.executionCtx.waitUntil`.

### Rule 3 — Every LLM envelope signal has a server-side hard cap — **PASS**

Hard caps present and exported for all envelope-driven state machines: `MAX_INTERVIEW_EXCHANGES = 4` (`services/exchanges.ts:66`), `MAX_ASSESSMENT_EXCHANGES = 4` (`services/assessments.ts:60`), `MAX_CHALLENGE_QUESTIONS = 3` (`services/challenge-round/caps.ts:13`), `MAX_PARTIAL_PROGRESS_HOLDS = 2` (`services/escalation.ts:48`), `MAX_REVIEW_CALIBRATION_ATTEMPTS = 2` and `MAX_CORRECT_STREAK = 5` (`services/session/session-exchange.ts`). Envelope parse failures (`services/llm/envelope.ts:193-200, 301, 313`) return typed `{ ok:false, reason }` results that callers branch on — they do not let a state machine spin (the count-based cap terminates regardless of whether the LLM emits the signal). No unbounded envelope loop found.

### Rule 4 — Durable async via Inngest; no fire-and-forget from route handlers — **PASS**

No un-awaited durable work that is lost on failure was found in route handlers. Background work is dispatched via awaited `safeSend`/`inngest.send`; the one Worker-lifetime concern (`routes/books.ts`) correctly uses `executionCtx.waitUntil` so the runtime is kept alive until the dispatch settles. The un-awaited `safeSend` at `session-exchange.ts:1806` is telemetry (non-durable) with a defensive catch.

---

## Findings

### [PRE-EXISTING] MEDIUM — Silent swallow of DB failure when fetching dictation struggles
- **Location:** `apps/api/src/routes/dictation.ts:286-288`
- **Category:** Silent Failure
- **Issue:** The `try { ... getLearningProfile(...) ... } catch { /* Graceful degradation */ }` block swallows **all** errors with no `logger` call and no `captureException`. The comment frames it as graceful degradation (review proceeds without struggle-aware feedback), which is a reasonable product decision — but the bare `catch {}` also masks DB connection drops, query timeouts, and unexpected throws from `getLearningProfile`. If the learning-profile read starts failing systematically (e.g. a Neon connection-pool exhaustion or a schema drift), every dictation review silently loses struggle-aware feedback and **ops has zero signal** — you cannot query how often this degradation fires. Not a billing/auth/consent path, so impact is feature-quality, not money/access.
- **Recommendation:** Add a `logger.warn` with a structured `event` name and a `captureException` (mirroring the pattern used everywhere else in this codebase), so the degradation rate is queryable. Keep the degradation behavior. Consider narrowing to the expected error if `getLearningProfile` has a typed failure mode.
- **Example:**
  ```ts
  } catch (err) {
    logger.warn('[dictation] struggle fetch failed; degrading review', {
      event: 'dictation.struggle_fetch_failed',
      profileId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { profileId, extra: { context: 'dictation.review.struggles' } });
  }
  ```

### [PRE-EXISTING] LOW — Consent resend-counter rollback failure swallowed without escalation
- **Location:** `apps/api/src/services/consent.ts:672-674` (`} catch { /* best-effort rollback */ }`)
- **Category:** Silent Failure (GDPR-adjacent)
- **Issue:** When a consent email send fails and the code rolls back the `resendCount` counter, this particular rollback catch swallows the rollback error with only a comment — no `logger.warn`, no Sentry. The sibling rollback handlers at `consent.ts:548-556` and `:724-733` correctly `logger.warn('[consent] Failed to rollback resend counter', ...)`; this one is the odd inconsistent site. Consequence is bounded: the outer flow still `throw`s `ConsentRequestNotFoundError`, so the *user-facing* error is not hidden. The only invisible effect is a consent `resendCount` slot that drifts high (a parent could be blocked from re-requesting consent one attempt early). Low severity because it is one counter slot and the request-level error still propagates — but it violates the codebase's own "silent recovery is banned" standard and is inconsistent with its two sibling blocks.
- **Recommendation:** Match the sibling sites — add `logger.warn('[consent] Failed to rollback resend counter', { error })` so counter-drift is queryable. Bind the error: `} catch (rollbackError) { logger.warn(...) }`.

### [PRE-EXISTING] LOW — Signature-verification catch discards underlying error detail (Stripe + Resend)
- **Location:** `apps/api/src/routes/stripe-webhook.ts:87` and `apps/api/src/routes/resend-webhook.ts` signature path
- **Category:** Missing Context
- **Issue:** The `catch {}` around `verifyWebhookSignature` returns a 400 without logging *why* verification failed (clock skew vs. wrong secret vs. malformed payload vs. genuine forgery). This is largely benign — returning 400 on bad signature is correct, and you do not want to alert-storm on every probe — but during a real incident (e.g. a webhook-secret rotation gone wrong where *every legitimate* Stripe event starts 400ing), there is no breadcrumb distinguishing "attacker probing" from "we broke our own secret." A counter/breadcrumb (not a Sentry exception per event) would make a misconfiguration diagnosable.
- **Recommendation:** Optionally add a sampled `logger.warn`/breadcrumb on signature-verify failure with `eventType`-free context (no PII), or a rate-limited counter, so a mass-400 misconfiguration is visible without per-request noise. Do **not** `captureException` per failed signature (that would be a self-inflicted alert storm from internet background-noise probes).

---

## Patterns Verified As Benign (explicitly cleared)

These looked suspicious on a grep but are correct on inspection — noted so a future reviewer does not re-flag them:

- **LLM provider double body-read** (`gemini.ts:228/236`, `openai.ts:149/157`, `anthropic.ts:166/174`): `.text()` is on the `!res.ok` error branch and `.json()` on the ok branch — mutually exclusive, no stream double-consume.
- **`services/clerk-user.ts:178` `await res.json().catch(() => null)`**: the very next line handles `null` → returns a typed `email-missing`/`email-not-verified` error. No silent success.
- **`services/llm/router.ts:1353, 1454` `.catch(() => {})`**: on `stopReasonPromise`, which is documented as never-rejecting by design; defensive.
- **`services/session/session-crud.ts:336` and `services/llm/envelope.ts` parse catches returning `null`/typed-fail**: LLM-output JSON parsing; callers branch on the null/failure result. Not state-masking.
- **`routes/resend-webhook.ts:138, 190` (`decodeBase64Secret`, `base64ToBytes`)**: return `null`/empty-bytes on invalid attacker-controlled base64; `timingSafeEqual` then fails the comparison. Correct security behavior (no length/timing leak).
- **`inngest/functions/weekly-progress-push.ts:123`**: `toLocaleString` invalid-timezone catch → UTC-hour fallback. Correct degradation for a non-critical scheduling check.
- **`inngest/functions/session-completed.ts:1508` and `memory-facts-embed-backfill.ts:68`**: missing Voyage API key → structured `logger.warn` with `event` name + sentinel return. Escalated, non-money path.
- **`middleware/database.ts:30, 47` and `closeOnce().catch(...)` sites**: DB-close fallback with `waitUntil` + error capture; documented connection-teardown pattern.
- **LLM router retry/fallback catches** (`router.ts:805, 913, 1037, 1159`): record circuit-breaker failure on transient errors, **re-throw** on non-transient and after fallback exhaustion (`throw err`). Error surfaces upstream; not swallowed. (Note below.)

---

## Observation (not a finding) — LLM router relies on log+rethrow, not Sentry

The LLM router (`services/llm/router.ts`) logs failures at `logger.warn` with rich diagnostics and **re-throws** after retry/fallback exhaustion rather than calling `captureException` itself. This is acceptable under Rule 1 because the error is *propagated*, not recovered-from — the no-silent-recovery rule targets swallowed/recovered errors, and a rethrow is the opposite of a silent recovery (the upstream handler / global error middleware owns Sentry capture). Flagging only so reviewers understand the router intentionally delegates Sentry capture upward; if a future refactor adds a *recovery* branch (e.g. "return a canned reply on total LLM failure"), that branch would newly require a structured-metric emission to stay compliant.

---

## ERROR section

None. Full audited scope was readable; `rg`/`fd` were proxied through `rtk proxy` because the environment's `rg` alias rewrites to `grep`. No files were modified (read-only pass).
