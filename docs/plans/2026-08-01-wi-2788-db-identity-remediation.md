---
title: WI-2788 DB and Identity Remediation — Implementation Plan
date: 2026-08-01
profile: code
work_items: [WI-2788]
spec: https://app.notion.com/p/3a98bce91f7c8146b80fe382cd774184
status: in-progress
---

# WI-2788 DB and Identity Remediation — Implementation Plan

**Goal:** Remove the database and identity failure generators absorbed into WI-2788 while preserving organization ownership and deletion invariants.
**Approach:** Credit current-main fixes only where regression coverage proves the acceptance criterion, then add the smallest missing behavior test-first. Reuse the existing DB-cause unwrapping and identity-v2 transaction boundaries rather than introducing parallel abstractions.

## Scope

In scope:

- `apps/api/src/services/test-seed.ts` and focused tests — prove seed/reset graph atomicity, idempotent login reuse, and the Clerk create race.
- `apps/api/src/services/transient-db-retry.ts`, `apps/api/src/index.ts`, and focused tests — classify wrapped transient driver errors while leaving wrapped constraint violations non-transient.
- `apps/api/src/services/identity-v2/deletion-v2.ts` and integration tests — preserve an organization's last admin and prevent deleted identities from retaining usable Clerk sessions, using existing identity-v2 boundaries.

Out of scope:

- Schema migrations, profile/person naming changes, broad identity refactors, production data repair, or direct database mutation.
- Staging deployment and post-deploy Sentry verification; those are WI-2788 delivery gates after code review.

## Tasks

- [ ] T1: Audit current-main seed/reset behavior against the four absorbed WI-2757 criteria and cite existing tests/landed commits for every already-satisfied branch.
- [ ] T2: Add only missing seed/reset regression tests first, capture their red state, implement the minimum transactional/idempotent/race-safe behavior, and rerun the focused service suite green.
- [ ] T3: Add wrapped `ECONNRESET` and wrapped FK-violation regressions for retry classification plus the API 503 boundary; capture red, compose the existing `unwrapDbError` behavior, and make both focused suites green.
- [ ] T4: Add last-admin and Clerk-session-revocation deletion regressions before production edits; implement inside the existing deletion flow without weakening cross-org authorization or transactionality.
- [ ] T5: Run all touched unit/integration suites, the API type/lint/change-class gates, and the full API Jest surface required by WI-2788.

## Rollback

Revert the WI-2788 landed commit. No schema or data migration belongs to this cluster; rollback must restore code and tests together.
