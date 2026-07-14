---
title: Staging Inngest Cloud Mode — Implementation Plan
date: 2026-07-12
profile: code
work_items: [WI-1865]
status: in-progress
---

# Staging Inngest Cloud Mode — Implementation Plan

**Goal:** Make deployed staging and production Workers explicitly use Inngest cloud mode while preserving inferred development mode locally.
**Approach:** Set the SDK-supported `INNGEST_DEV=false` binding only in the committed staging and production Wrangler variable tables. Extend the existing Wrangler configuration guard so removal from either deployed environment fails CI, then verify the real staging endpoint after merge and automatic deployment.

## Scope

In scope:
- `apps/api/wrangler.toml`
- `apps/api/src/wrangler-config.test.ts`
- `docs/plans/2026-07-12-staging-inngest-cloud-mode.md`

Out of scope:
- Inngest function behavior or registration
- Local development mode
- Inngest Cloud dashboard configuration
- Production deployment

## Tasks

- [x] T1: Add a deployed-mode configuration regression guard — done when: the focused Wrangler test fails because staging and production do not explicitly set `INNGEST_DEV=false`, while the root/local table is asserted not to force cloud mode.
- [x] T2: Set explicit cloud mode for deployed Workers — done when: the same focused test passes with `INNGEST_DEV=false` in staging and production only.
- [x] T3: Verify the affected API configuration surface — done when: focused tests, API typecheck, formatting, lint, and change-class validation pass.
- [ ] T4: Land and verify staging — done when: the PR is merged, the automatic staging deploy succeeds, and an unsigned staging Inngest request no longer returns development-mode introspection.
