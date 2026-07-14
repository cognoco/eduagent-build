---
title: Activation analytics query surface - Implementation Plan
date: 2026-07-11
profile: change
work_items: [WI-1762]
status: complete
---

# Activation analytics query surface - Implementation Plan

**Goal:** Make first-party activation events reviewable for any beta date range without ad-hoc schema discovery.
**Approach:** Turn the existing runbook into the supported aggregate query surface, parameterized for `psql`, current to the v2 identity schema, and explicit about privacy and raw-row retention. Add a contract test so event coverage, parameters, and schema references cannot silently drift.

## Scope

In scope:

- `docs/runbooks/activation-funnel-queries.md`
- `scripts/activation-funnel-query-contract.test.ts`

Out of scope:

- Activation ingest, event schema, or mobile dispatch changes
- Third-party analytics/PostHog
- A new authenticated analytics API
- Automated retention scheduling

## Tasks

- [x] T1: Pin the supported query contract - done when: a focused test fails because the runbook lacks arbitrary date parameters, complete event coverage, current identity-table segmentation, retention, and aggregate-only output guarantees.
- [x] T2: Implement the beta query runbook - done when: the focused test passes and an operator can produce all ten event counts, funnel conversions, and current-model profile segments for supplied start/end timestamps and environment.
- [x] T3: Verify and review - the focused contract test, PostgreSQL parsing, formatting, and diff checks pass; three completed adversarial rounds produced no unresolved actionable findings after correction. The optional full scripts suite exceeded its local time bound and is delegated to required CI.
