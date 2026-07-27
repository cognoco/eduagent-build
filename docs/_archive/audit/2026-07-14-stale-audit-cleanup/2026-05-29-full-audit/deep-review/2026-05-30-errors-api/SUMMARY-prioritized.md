# Errors / Silent-Failure Review — `apps/api/src` — Prioritized Summary (2026-05-30)

Coordinator's re-prioritization of the silent-failure-hunter, with manual verification. Raw:
[`silent-failure-hunter.md`](./silent-failure-hunter.md).

**Scope:** path-scoped silent-failure audit of `apps/api/src`. Run as a **rule-verification
pass** against the four CLAUDE.md non-negotiables no prior review had checked. Not a PR diff —
all findings [PRE-EXISTING].

**Headline:** **All four rules PASS. No P0/P1.** The billing/auth/webhook/consent/LLM paths
have clearly already been through silent-failure remediation — nearly every catch in those
paths carries a finding-ID tag and escalates via Sentry `captureException` and/or Inngest
`safeSend`. Residual findings are three swallows in **non-priority** paths.

---

## Rule verification (the point of this run)

| CLAUDE.md non-negotiable | Verdict | Evidence |
|---|---|---|
| "Silent recovery without escalation is banned" (billing/auth/webhook) | **PASS** | ~15 sites verified — stripe stale-event drop, metering KV failure w/ double-decrement risk escalated, auth JWKS-vs-validation classification, idempotency fail-closed 503, RevenueCat unresolvable-account capture — all emit Sentry and/or Inngest metric |
| Non-core Inngest via `safeSend()`; bare `inngest.send` carries `// core-send:` | **PASS** | 100% compliance |
| Every LLM envelope signal has a server-side hard cap | **PASS** | `MAX_INTERVIEW_EXCHANGES`, `MAX_ASSESSMENT_EXCHANGES`, `MAX_CHALLENGE_QUESTIONS` etc. all present; parse failures return typed results; count caps terminate regardless of LLM |
| No fire-and-forget durable work from route handlers | **PASS** | `books.ts` uses `executionCtx.waitUntil`; the one un-awaited `safeSend` is telemetry with a defensive catch |

This is the strongest "rule holds in reality" outcome of the audit so far.

---

## P2 — Worth noting (all non-priority paths; no money/access/GDPR impact)

- **Bare `catch {}` swallows DB failure with zero escalation** — `routes/dictation.ts:286`
  *(verified)*. `getLearningProfile` failure is swallowed by an empty catch (comment only) so
  dictation review proceeds without struggle-aware feedback. Intent (graceful degradation) is
  legitimate, but the degradation rate is **unqueryable** — exactly the "if you can't query how
  often it fired, the recovery is invisible" smell, just outside the billing/auth/webhook
  banned-class (hence not HIGH). Fix: `logger.warn('dictation.struggles.fetch_failed', { profileId })`
  (or a counter) inside the catch; keep the degradation. *(silent-failure MEDIUM)*
- **Consent resend-counter rollback failure swallowed** — `services/consent.ts:672`. Only a
  comment; its two sibling sites `logger.warn`. Inconsistent — add the matching warn. *(LOW)*
- **Webhook signature-verify catch discards error detail** — `routes/stripe-webhook.ts:87`
  (+ resend). A webhook-secret misconfiguration causing mass-400s would be undiagnosable from
  logs. Log the verification-failure reason (not the payload). *(LOW)*

---

## Verified clean / explicitly cleared

~10 grep-suspicious patterns cleared as benign so future reviewers don't re-flag: provider
error/ok body-read branches are mutually exclusive (no double-read); `clerk-user` null is
handled; the LLM router catches re-throw rather than recover. Key infra: `services/safe-non-core.ts`,
`services/safe-refresh-kv-cache.ts`, `services/sentry.ts`, `middleware/metering.ts`,
`middleware/auth.ts`, the webhook routes.

## Severity summary (agent scale)
0 critical / 0 high / 1 medium / 2 low
