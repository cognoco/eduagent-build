---
title: V2 Publish Readiness — Canonical Priority Plan
date: 2026-06-30
profile: change
workstream: WS-28
work_items: [WI-1168, WI-1169, WI-1170, WI-1171, WI-1172, WI-1173, WI-1174, WI-1175]
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

# V2 Publish Readiness — Canonical Priority Plan

**Goal:** Make V2 publishable by finishing the supporter visibility promise, preserving concrete learning progress, and retiring legacy surfaces only after their V2 heirs are real.

**Approach:** This is the living priority plan above the phase plans. Keep it short and update it item by item as work lands. The detailed build plans remain in `docs/plans/v2-plan/`; the source maps for this plan are `docs/plans/v2-dossier/06-screen-function-access-map.md` and `docs/plans/v2-dossier/07-trigger-flow-logic-map.md`.

**Cosmo workstream:** `WS-28` — V2 finalization.

## Current Ruling

Learner V2 is substantially built: Mentor, Subjects, Journal, Subject Hub, session, homework camera, quiz, dictation, and practice have code-backed paths.

Supporter V2 is the critical publish gap: support hub, person-scope Journal, shared-record rendering, person-scope Subject drill-in, and visibility ceremony screens are still partial or missing.

## Scope

In scope:

- `apps/mobile/src/app/(app)/mentor.tsx`
- `apps/mobile/src/app/(app)/subjects.tsx`
- `apps/mobile/src/app/(app)/journal/**`
- `apps/mobile/src/app/(app)/subject-hub/**`
- `apps/mobile/src/components/support/**`
- `apps/mobile/src/components/journal/**`
- `apps/mobile/src/lib/scope-context.tsx`
- `apps/api/src/routes/visibility.ts`
- `apps/api/src/routes/scopes.ts`
- `apps/api/src/services/supporter-structural-mask.ts`
- `docs/plans/v2-dossier/06-screen-function-access-map.md`
- `docs/plans/v2-dossier/07-trigger-flow-logic-map.md`
- `docs/plans/v2-plan/2026-06-10-s4-scope-chip-support-hub.md`
- `docs/plans/v2-plan/2026-06-10-s5-visibility-contract.md`
- `docs/plans/v2-plan/2026-06-10-s6-cutover-deletions.md`

Out of scope:

- Executing S6 deletions or flipping V2 to production default.
- Removing V0/V1 flags, routes, tests, or fallback behavior.
- Reopening the three-tab shell decision.
- Building the mentor character / brand animation project.
- Adding new product areas beyond the existing V2 promise.

## Priority Tasks

- [ ] T1 / WI-1168: Make shared-record Journal real — done when mobile person-scope and supporter-hub Journal fetch `GET /visibility/reports/:personId/shared-record`, render real report/recap/milestone facts, show honest empty/error states, and the dossier maps identify the feature as `CODE` rather than placeholder.

- [ ] T2 / WI-1169: Add person-scope Subject drill-in — done when a supporter can open a supported person's subject from the Subjects tab into a masked Subject Hub or equivalent structural detail view, with private artifacts excluded by server response shape and tests proving private notes, mentor memory, and conversations are not exposed.

- [ ] T3 / WI-1170: Finish support hub job-to-be-done cards — done when the Support hub answers "what should I do now?" with real per-person attention items, shared-record entry points, co-learning/start-together actions, and quiet nudge affordances; placeholder/list-only cards are removed or demoted.

- [ ] T4 / WI-1171: Build visibility ceremony screens — done when link, accept, revoke, trust-contract, kid-initiated unlink, and appeal affordance flows exist on mobile, are wired to the visibility API, and have tests for the non-reportable class and artifact-wall boundaries.

- [ ] T5 / WI-1172: Preserve concrete progress in the right places — done when topic/book/subject mastery, due-review state, and learning counts live in Subjects/Subject Hub; reports, recaps, milestones, notes, and memory live in Journal; next action lives in Mentor; and the old Progress tab has no unique publish-critical job left.

- [ ] T6 / WI-1173: Verify learner V2 parity, not just existence — done when Mentor, Subjects, Journal, Subject Hub, session, homework, quiz, dictation, and practice each have one current smoke or focused test proving the V2 trigger path, not only the legacy route path.

- [ ] T7 / WI-1174: Define per-surface retirement gates and prepare S6 — done when S6 has a checklist mapping each legacy surface to its live V2 heir: More tab -> Avatar/Admin, Library tab -> Subjects/Subject Hub, Progress tab -> Subject Hub + Journal, ParentHomeScreen -> Support hub + shared records, child proxy routes -> person scopes + masked drill-in, session summary -> in-thread V2 wrap-up; all current evidence is reflected in the S6 gates; and the plan still blocks actual deletion until explicit human confirmation.

- [ ] T8 / WI-1175: Run the publish-readiness review — done when the user can complete these task prompts without coaching in a V2 build: start homework help; review something due; find a subject's concrete progress; find a previous note/recap/report; see what a supported learner worked on; explain what a supporter can and cannot see; change billing/security/privacy settings.

## Progress Placement Rule

Use this rule for every V2 screen decision:

- Mentor: what to do next.
- Subjects / Subject Hub: learning structure, mastery, due review, and concrete topic/book/subject progress.
- Journal: produced record of the relationship: reports, recaps, notes, memory, moments, milestones.
- Avatar/Admin: account, billing, security, privacy, notifications, profile and family administration.
- Scope chip: whose relationship lens is active; never impersonation.

## Review Cadence

Before any V2 publish-readiness claim:

1. Re-read `06-screen-function-access-map.md` and `07-trigger-flow-logic-map.md`.
2. Re-run a route/flow grep for the touched surface.
3. Update this checklist and the dossier status labels from `PARTIAL`/`OPEN` to `CODE` only after code and tests support the claim.
4. Do not mark S6-ready while any protected V0/V1 path is still required for the publish promise.
