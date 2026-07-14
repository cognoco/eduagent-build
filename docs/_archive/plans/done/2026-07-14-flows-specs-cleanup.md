---
title: Flow and Spec Documentation Cleanup — Implementation Plan
date: 2026-07-14
profile: change
status: done
---

# Flow and Spec Documentation Cleanup — Implementation Plan

**Goal:** Reconcile `docs/flows` and `docs/specs` against current code, archive completed or superseded artifacts, and prevent stale retained documents from presenting themselves as current implementation truth.

**Approach:** Use code, tests, feature flags, and current route/service schemas as evidence. Preserve durable product/security contracts and the deliberately parked V0/V1 flow directory; move only point-in-time, completed, or dead-route documents. Record every disposition and surviving action in folder indexes.

## Scope

In scope:
- `docs/flows/**`
- `docs/specs/**`
- `docs/audience-matrix.md` → `docs/flows/audience-matrix.md`
- `docs/privacy-policy.html` → `docs/compliance/privacy-policy.html`
- `docs/runbooks/**`
- `docs/meetings/**` and the live minors checklist moved to `docs/compliance/`
- `docs/_archive/runbooks/2026-07-14-stale-runbook-cleanup/**`
- `docs/_archive/meetings/2026-07-14-stale-meeting-cleanup/**`
- `docs/_archive/flows/2026-07-14-stale-flow-cleanup/**`
- `docs/_archive/specs/2026-07-14-stale-spec-cleanup/**`
- `docs/plans/2026-07-14-flows-specs-cleanup.md`
- `AGENTS.md` only if its current-canon pointer must be corrected
- `docs/E2Edocs/e2e-runbook.md`, `docs/reviews/**`, and `scripts/decision-adr-link-baseline.json` only for references broken by the dated archive moves

Out of scope:
- Application code, schemas, tests, migrations, and feature flags
- ADR, canon, register, review, `_quartet`, and `_wip` content
- V2 S6 cutover or deletion work
- Creating new product work items; surviving actions receive explicit keep, defer, discard, or already-captured dispositions

## Tasks

- [x] T1: Record code-grounded dispositions for all 14 specs and all 32 flow documents — done when: each source document appears exactly once in its folder index with a disposition, evidence summary, and survivor action.
- [x] T2: Archive completed, point-in-time, and superseded documents — done when: seven specs and four flow artifacts are moved to dated archive folders with no content loss except intentional status/link repair.
- [x] T3: Repair retained-document truthfulness — done when: stale live specs and high-risk flow inventories carry dated status notices, `epics.md` no longer claims to be current implementation canon, and parked V0/V1 pages remain explicitly non-current until S6.
- [x] T4: Repair references and verify the batch — done when: active relative links resolve, archived paths have no unresolved live inbound references, source/archive counts reconcile to 14 specs and 32 flows, `git diff --check` passes, and unrelated shared-tree changes remain untouched.
- [x] T5: Close the cleanup plan — done when: all prior tasks are checked and the plan status is `done` before it is moved to `docs/_archive/plans/done/` during commit preparation.
- [x] T6: Normalize cross-folder ownership — done when: the legal privacy notice lives under compliance, the routing/authorization audience matrix lives under flows with a stale-snapshot warning, and active consumers point to the new paths.
- [x] T7: Reconcile operational runbooks — done when: all ten are dispositioned, the resolved streaming incident is archived, unsafe blanket restore/manual retention/ambiguous KV procedures are disabled, and revised CLI syntax is verified against installed tools.
- [x] T8: Reconcile meeting artifacts — done when: three superseded/addressed decision artifacts are archived, the live minors checklist is moved to compliance with current status/capture pointers, and a meetings index records every action.
