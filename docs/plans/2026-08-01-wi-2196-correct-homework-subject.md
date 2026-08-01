---
title: WI-2196 Correct Homework Subject — Implementation Plan
date: 2026-08-01
profile: code
work_items: [WI-2196]
spec: https://app.notion.com/p/39f8bce91f7c81d98df4e0056a8a2ed7
status: in-progress
---

# WI-2196 Correct Homework Subject — Implementation Plan

**Goal:** Let a learner keep the confirmed homework draft and create or reuse the correct Subject even when unrelated Subjects already exist.
**Approach:** Reuse the camera screen's existing typed-Subject mutation path in the OCR manual fallback, and give the maintained E2E-only manual-entry screen the same inline resolution behavior. Keep Subject creation profile-scoped through `useCreateSubject`; preserve current session-param construction and server authorization boundaries.

## Scope

In scope:

- `apps/mobile/src/app/(app)/homework/camera.tsx` — expose inline typed-Subject resolution in the OCR manual fallback and make it double-submit safe.
- `apps/mobile/src/app/(app)/homework/camera.test.tsx` — red/green regressions for unrelated/exact-match/zero-list/failure-retry/double-tap and draft/source/return preservation.
- `apps/mobile/src/app/(app)/homework/manual.tsx` — replace first-Subject auto-adoption with an explicit existing-or-inline-created Subject choice in the E2E-only manual route.
- `apps/mobile/src/app/(app)/homework/manual.test.tsx` — cover zero/one/many Subjects, exact-name reuse, creation failure/retry, and one-mutation behavior.
- `apps/mobile/e2e/flows/v2/v2-homework-manual-entry.yaml` — prove a seeded unrelated Science Subject does not capture an Algebra homework session; assert problem, selected Subject, session association, and Mentor return.

Out of scope:

- Subject API/schema/ownership changes; `useCreateSubject` and server guards remain authoritative.
- Generic `/create-subject` navigation behavior or curriculum-generation behavior.
- Camera hardware/OCR implementation, real homework images, production credentials, deploys, and EAS updates.
- Broader Subjects-screen fetch-error behavior outside these two homework entry surfaces; this change only fails closed and exposes retry where exact-name reuse must be trustworthy.

## Tasks

- [x] T1: Establish camera fallback regressions before production edits — done when focused Jest fails specifically because an OCR-error manual picker with an unrelated Subject lacks inline typed creation, while assertions pin manual problem text, capture source, entry source, return target, exact-name reuse, retry, and one POST under double tap.
- [x] T2: Reuse the camera typed-Subject resolver across result and OCR-manual drafts — done when T1 passes, existing Subject picking is unchanged, exact-name matches skip creation, failures retain both inputs for retry, and a synchronous in-flight guard prevents duplicate create/session actions.
- [x] T3: Establish direct-manual regressions before production edits — done when focused Jest fails because the E2E-only route silently adopts the first unrelated Subject and lacks inline typed resolution for zero/one/many loaded lists.
- [x] T4: Add explicit Subject resolution to the direct-manual route — done when T3 passes; route-provided Subjects remain selected, loaded Subjects remain selectable, a typed exact match reuses without POST, a new name creates once through `useCreateSubject`, failure leaves the problem/name intact for retry, and session start remains a separate enabled confirmation after resolution.
- [x] T5: Extend the maintained V2 Maestro round trip — done when the flow starts from seeded Science, enters the synthetic Algebra problem, creates/selects Algebra inline, asserts the resolved Subject and exact problem in the session, proves one associated session for the seeded profile, and returns to usable Mentor without optional assertions.
- [x] T6: Run heavy verification and adversarial review — done when focused red/green/revert receipts, affected mobile tests, full mobile Jest, i18n/type/lint/change-class gates, Maestro validation, and the Orion Android V2 flow are green; an independent adversarial reviewer reports no unresolved must-fix or should-fix findings.
- [ ] T7: Deliver through the full lifecycle — done when the scoped changes are committed and pushed with the repo commit skill, PR review threads/checks are dispositioned, armed merge lands on `main`, `complete --validate` and `complete green` succeed at the landed SHA, independent QA/review closes WI-2196, and the BID-33 run log records completion.

## Tests

- T1: `apps/mobile/src/app/(app)/homework/camera.test.tsx` — add WI-2196 cases for OCR error fallback with unrelated Subject, new Subject creation, exact-name reuse, zero-list creation, failure/retry, and rapid double press.
- T3: `apps/mobile/src/app/(app)/homework/manual.test.tsx` — add WI-2196 cases for explicit selection and inline creation over zero/one/many lists, exact match, failure/retry, and no duplicate mutation.
- T5: `apps/mobile/e2e/flows/v2/v2-homework-manual-entry.yaml` — deterministic seeded-device proof against `trial-active` (existing Science) using an Algebra homework problem and Subject.
