---
title: WI-2788 Sentry Runtime Remediation — Implementation Plan
date: 2026-08-01
profile: code
work_items: [WI-2788]
spec: https://app.notion.com/p/3a98bce91f7c8146b80fe382cd774184
status: in-progress
---

# WI-2788 Sentry Runtime Remediation — Implementation Plan

**Goal:** Restore trustworthy Sentry environment separation, prevent Drizzle parameters from leaving the worker, and re-level only the explicitly classified handled conditions.
**Approach:** Pin environment and scrub behavior at the Sentry boundary with adversarial payload tests. Preserve every classified capture site, changing severity/deduplication only where the absorbed criteria explicitly authorize it.

## Scope

In scope:

- `apps/api/src/index.ts` and its config tests — set Sentry `environment` from the worker binding for staging, production, development, and preview values.
- `apps/api/src/services/sentry.ts` and `sentry.test.ts` — strip Drizzle `params:` segments from top-level messages and every exception value/cause representation without exposing values in test output.
- The exact handled-telemetry sites named by absorbed WI-2765: missing Inngest binding, graceful Clerk 404, LLM provider fallback, filing wait timeout, and final-only Voyage failure capture.

Out of scope:

- Broad Sentry taxonomy changes, deleting capture sites, changing launch-health policy, or weakening request/body/header scrubbing.
- Live issue resolution or dashboard mutation before reviewed code lands and a clean staging cycle supplies evidence.

## Tasks

- [ ] T1: Add a config assertion that fails while the Sentry init omits `environment`, then wire the existing worker `ENVIRONMENT` binding and prove all supported environment strings propagate.
- [ ] T2: Add hostile Drizzle-shaped message and exception-chain fixtures containing synthetic Clerk/UUID parameters; capture red, redact the whole parameter segment, and prove neither secret-shaped value survives.
- [ ] T3: Inventory the five named handled sites against current main and classify already-correct, missing, or superseded behavior with exact tests.
- [ ] T4: For each missing site, add a failing severity/dedup/final-attempt assertion before changing code; retain a named capture with non-PII context and explicit justification.
- [ ] T5: Run focused Sentry and Inngest suites, scrubbing/security guards, API type/lint/change-class checks, and the full API Jest surface required by WI-2788.

## Rollback

Revert the WI-2788 landed commit. The environment field and scrubber/noise-diet changes are code-only and do not need data rollback.
