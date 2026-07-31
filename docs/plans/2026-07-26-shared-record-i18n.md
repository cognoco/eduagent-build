---
title: Shared-record structured metadata and client-side i18n — Implementation Plan
date: 2026-07-26
profile: code
work_items: [WI-2783]
spec: docs/specs/2026-07-26-supporter-surface-v1-presentation-over-v2-logic.md
status: in-progress
---

# Shared-record structured metadata and client-side i18n — Implementation Plan

**Goal:** Render weekly-report, session-recap, and milestone facts in the supporter's UI locale while preserving legacy fallback data and keeping learner-authored text out of structural titles.
**Approach:** Add metadata to the existing open `ReportableFact.metadata` field, translate that metadata through one client-side renderer, and retain `title`/`detail` solely as the compatibility fallback. Re-project learner-authored chapter text into an explicitly attributed topic-body line while keeping curriculum book names as chapter headings.

## Scope

In scope:
- `apps/api/src/services/shared-record-read-model.ts`
- `apps/api/src/services/shared-record-read-model.test.ts`
- `apps/mobile/src/components/support/shared-record-fact-copy.ts`
- `apps/mobile/src/components/support/shared-record-fact-copy.test.ts`
- `apps/mobile/src/components/support/SupportHubMentorTab.tsx`
- `apps/mobile/src/components/support/SupportHubMentorTab.test.tsx`
- `apps/mobile/src/components/visibility/SharedRecordView.tsx`
- `apps/mobile/src/components/visibility/SharedRecordView.test.tsx`
- `apps/mobile/src/components/support/SupportHubJournalTab.tsx`
- `apps/mobile/src/components/support/PersonScopeJournalPlaceholder.tsx`
- `apps/mobile/src/components/support/PersonScopeStructuralSubjects.tsx`
- `apps/mobile/src/components/support/PersonScopeStructuralSubjects.test.tsx`
- `apps/mobile/src/i18n/locales/*.json`
- `docs/plans/2026-07-26-shared-record-i18n.md`

Out of scope:
- `apps/api/src/services/reportability.ts`
- `packages/schemas/src/visibility-contract.ts`
- database schema or migration changes
- supporter IA, visibility-policy, gate, or consent changes

## Tasks

- [ ] T1: Add structured metadata to all three API fact variants while retaining legacy title/detail — done when `shared-record-read-model.test.ts` first fails on missing metadata and then verifies weekly-report fields, recap date, milestone type/threshold/available subject name, unchanged sources, and no raw artifact leakage.
- [ ] T2: Add a defensive client renderer for the three known template keys, localized fact-count headlines, and legacy fallback — done when `shared-record-fact-copy.test.ts` first fails because the renderer is absent, then verifies German output for weekly report, session recap, and each milestone copy path plus metadata-absent and unknown-key fallback without blank text or raw weekly label/comparison prose.
- [ ] T3: Route every Support hub and Journal shared-record card through the renderer — done when `SupportHubMentorTab.test.tsx` and `SharedRecordView.test.tsx` first demonstrate raw server prose, then prove structured facts and headlines use translated copy while legacy facts still render their original fallback fields; Journal callers supply the supportee name needed for the localized supporter headline.
- [ ] T4: Keep learner-authored chapter text out of headings and attribute it in topic body copy — done when `PersonScopeStructuralSubjects.test.tsx` first sees the learner text in the heading, then sees the curriculum book name as heading and a localized `Learner asked: …` body line instead.
- [ ] T5: Unify the German hub term and synchronize locale catalogs — done when the German scope chip and hub heading use one term and the orphan-key, staleness, and JSX-literal checks report no new finding.
- [ ] T6: Verify the complete affected surface — done when focused API/mobile suites, API/mobile typechecks, API/mobile lint, all i18n gates, full API unit suite, and full mobile unit suite complete with recorded receipts; `reportability.ts` and schema files remain unchanged.
