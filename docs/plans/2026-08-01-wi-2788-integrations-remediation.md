---
title: WI-2788 Integrations Remediation — Implementation Plan
date: 2026-08-01
profile: code
work_items: [WI-2788]
spec: https://app.notion.com/p/3a98bce91f7c8146b80fe382cd774184
status: in-progress
---

# WI-2788 Integrations Remediation — Implementation Plan

**Goal:** Make email, embedding, event, and binding integrations fail safely and observably without leaking PII or retrying permanent failures.
**Approach:** Normalize provider outcomes at their service boundary, keep durable retry semantics inside Inngest steps, resolve user-visible topic metadata from scoped database state, and make empty deployment inputs loud without mutating any environment during implementation.

## Scope

In scope:

- Resend transport/function/webhook code and tests — non-production no-send or explicit allowlist behavior, permanent 4xx classification, one sanitized final capture, and real `data.to` array compatibility through bounce suppression.
- `scripts/sync-secrets.js` and tests — warn or fail when a required value is empty instead of silently omitting its binding.
- Embedding callers and tests — respect `Retry-After` for 429s inside durable Inngest steps and capture only terminal failure.
- `app/filing.completed` producer/consumer contracts and tests — remove `topicTitle` from the event and resolve the real title by `topicId` through a profile-scoped parent-chain query.

Out of scope:

- Reading or changing vendor billing, adding a payment method, changing Doppler/Cloudflare values, deploying workers, or resolving Sentry issues. Those are explicit operator/protection-gated evidence steps.
- Any direct provider SDK call outside established service/router boundaries.

## Tasks

- [ ] T1: Add red tests for non-production Resend behavior and permanent 4xx handling; represent permanent/transient outcomes explicitly enough that Inngest retries only the latter, with sanitized provider code context.
- [ ] T2: Add a production-shaped `data.to: string[]` webhook regression and prove the full parsed event reaches bounce suppression; preserve compatibility only if current real callers require the legacy string shape.
- [ ] T3: Add an empty-binding regression for `sync-secrets`; make the omission loud without printing the key value.
- [ ] T4: Add deterministic 429/`Retry-After` tests around every Inngest embedding caller; implement bounded durable backoff and terminal-only Sentry capture.
- [ ] T5: Add producer/consumer contract regressions proving `topicTitle` never egresses, the consumer resolves the title from `topicId` under `profileId`, and the LLM prompt contains the real title rather than `[pii-scrubbed]`.
- [ ] T6: Run all touched unit/integration suites, event-schema/PII guards, API type/lint/change-class checks, and the full API Jest surface required by WI-2788.
- [ ] T7: After code review and merge approval, stop at each protected evidence gate and request the exact operator action: staging bindings/sync/deploy, vendor-account ruling, clean E2E cycle, live environment/binding/event verification, and Sentry issue resolution.

## Rollback

Revert the WI-2788 landed commit for code behavior. Any later protected configuration change must carry its own operator-authored rollback receipt; this plan does not authorize one.
