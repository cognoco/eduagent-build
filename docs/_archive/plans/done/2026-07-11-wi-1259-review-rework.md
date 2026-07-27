---
title: WI-1259 Review Rework — Implementation Plan
date: 2026-07-11
profile: change
work_items: [WI-1259]
status: done
---

# WI-1259 Review Rework — Implementation Plan

**Goal:** Align age-date response assertions and add coverage for full-date projection in GDPR exports and `updateProfileAppContext` returns.
**Approach:** Make only test and report changes. Reuse existing fixtures, preserve the Jan-1 sentinel case, and verify the offline-capable unit suite and API typecheck.

## Scope

In scope:
- `tests/integration/profile-fulldate-age-gate.integration.test.ts`
- `apps/api/src/services/identity-v2/export-v2.integration.test.ts`
- `apps/api/src/services/profile.test.ts`
- `report.md`
- This plan

Out of scope:
- Production code
- New mocks or test harnesses
- Database-backed integration-test execution
- Commits, installs, and network operations

## Tasks

- [x] T1: Update the exact-13 create-response contract assertion — done when: only the stale comment and two month/day expectations use the present-but-null contract.
- [x] T2: Cover full-date and sentinel GDPR export profiles in the existing v2 export test — done when: the owner exports month/day `6`/`15` and the child exports `null`/`null`.
- [x] T3: Cover full-date projection in `updateProfileAppContext` — done when: the existing v2-dispatch unit test asserts month/day `4`/`9` and the requested Jest command passes.
- [x] T4: Verify and report — done when: the API typecheck result, Jest result, integration-test offline limitation, files changed, and T2 fixture choice are recorded in `report.md`.
