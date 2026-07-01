---
title: V2 Publish Readiness — Canonical Priority Plan
date: 2026-06-30
profile: change
workstream: WS-28
work_items: [WI-1168, WI-1169, WI-1170, WI-1171, WI-1172, WI-1173, WI-1174, WI-1175]
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: active
cosmo_state: WS-28 items triaged and refined to Ready on 2026-06-30
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

- [x] T1 / WI-1168: Make shared-record Journal real — mobile person-scope and supporter-hub Journal fetch `GET /visibility/reports/:personId/shared-record`, render report/recap/milestone shared-record facts, show loading/error/empty states through `SharedRecordView`, and the dossier maps identify the feature as `CODE` rather than placeholder.

- [x] T2 / WI-1169: Add person-scope Subject drill-in — done when a supporter can open a supported person's subject from the Subjects tab into a masked Subject Hub or equivalent structural detail view, with private artifacts excluded by server response shape and tests proving private notes, mentor memory, and conversations are not exposed.

- [ ] T3 / WI-1170: Finish support hub job-to-be-done cards — done when the Support hub answers "what should I do now?" with real per-person attention items, shared-record entry points, co-learning/start-together actions, and quiet nudge affordances; placeholder/list-only cards are removed or demoted.

- [ ] T4 / WI-1171: Build visibility ceremony screens — done when link, accept, revoke, trust-contract, kid-initiated unlink, and appeal affordance flows exist on mobile, are wired to the visibility API, and have tests for the non-reportable class and artifact-wall boundaries.

- [ ] T5 / WI-1172: Preserve concrete progress in the right places — done when topic/book/subject mastery, due-review state, and learning counts live in Subjects/Subject Hub; reports, recaps, milestones, notes, and memory live in Journal; next action lives in Mentor; and the old Progress tab has no unique publish-critical job left.

- [ ] T6 / WI-1173: Verify learner V2 parity, not just existence — done when Mentor, Subjects, Journal, Subject Hub, session, homework, quiz, dictation, and practice each have one current smoke or focused test proving the V2 trigger path, not only the legacy route path.

- [ ] T7 / WI-1174: Define per-surface retirement gates and prepare S6 — done when S6 has a checklist mapping each legacy surface to its live V2 heir: More tab -> Avatar/Admin, Library tab -> Subjects/Subject Hub, Progress tab -> Subject Hub + Journal, ParentHomeScreen -> Support hub + shared records, child proxy routes -> person scopes + masked drill-in, session summary -> in-thread V2 wrap-up; all current evidence is reflected in the S6 gates; and the plan still blocks actual deletion until explicit human confirmation.

- [ ] T8 / WI-1175: Run the publish-readiness review — done when the user can complete these task prompts without coaching in a V2 build: start homework help; review something due; find a subject's concrete progress; find a previous note/recap/report; see what a supported learner worked on; explain what a supporter can and cannot see; change billing/security/privacy settings.

## Per-Surface Retirement Readiness (WI-1174)

This is the T7 gate table: one row per S6 retirement candidate, so S6 is never treated
as a single broad switch. It supplements — does not replace — the full task-by-task
gate/rollback detail already in
[`v2-plan/2026-06-10-s6-cutover-deletions.md`](v2-plan/2026-06-10-s6-cutover-deletions.md)
(§Gates, §Ordered deletion sequence, §Rollback); this table cites that plan rather than
re-deriving it. Evidence below is code-verified against `origin/main` as of 2026-07-01,
not the plan's own (partly stale) checkboxes — re-verify before relying on any row past
that date, per the Review Cadence below.

| Legacy surface | Current owner (S6 task) | Replacement V2 surface | Readiness evidence (verified 2026-07-01) | Rollback posture | No-regression check (shipped flag states) |
|---|---|---|---|---|---|
| **More tab** (`apps/mobile/src/app/(app)/more/*`) | S3 avatar/admin sheet — S6 plan T5 | Avatar/Admin sheet (billing, security, export/delete, owner-gated) | **NOT LIVE.** Zero hits for `avatar`/`AccountSheet`/`AdminSheet` anywhere in `apps/mobile/src` — no admin sheet exists yet. `more/*` (account, privacy, notifications, accommodation, celebrations, help, security-sessions) remains the only reachable path. Heir-live precondition unmet; T5 blocked. | No deletion attempted. Per S6 plan T2–T8 rollback row: future removal is pure UI-route deletion, `git revert` restores verbatim, no schema/data loss. | `more` is a live member of `LEGACY_GUARDIAN_TABS`/`STUDY_TABS`/etc. (`navigation-contract.ts:154-172`); covered by the nav-contract guard/property/totality/snapshot/acceptance/usage-guard suite + `legacy-navigation-contract.test.ts` — all green today, must stay green until gates (b)+(c). |
| **Library tab** (`apps/mobile/src/app/(app)/library.tsx`, 1,399 lines) | S2 Subjects list + S3 Journal archive — S6 plan T6 | Subjects tab (`subjects.tsx`) + Subject Hub (`subject-hub/[subjectId]/index.tsx`) for structure-browse; Journal cross-subject archive (EU-6, `JournalNotesArchive` in `components/journal/JournalTabView.tsx:558-620`) for saved-items browse | **Both heirs LIVE.** Subjects tab + Subject Hub render real mastery/chapter structure; `JournalNotesArchive` is a genuine browsable archive, not search-only (EU-6 met). `library.tsx` itself is untouched — no de-linking has started. | Per S6 plan T6 rollback: `git revert` restores the route; `components/library/*` stays regardless (both heirs reuse it) — no shared-component risk. | Same nav-contract guard/property/totality/snapshot/acceptance/usage-guard suite (`library` token, `navigation-contract.ts:154-172`) plus e2e flow `apps/mobile/e2e/flows/learning/solo-owner-tab-shape.yaml` (confirmed present), exercising the V0 4-tab shape that includes Library. |
| **Progress tab** (`apps/mobile/src/app/(app)/progress/*` — index, `[subjectId]/`, `reports/`, `weekly-report/`, `saved.tsx`, `vocabulary.tsx`, `milestones.tsx`) | **Gap — no S6 task owns the full tab.** The S6 cutover plan names a task for only one file, `progress/milestones.tsx` (T5); WI-1172 (in progress) is landing the Subjects/Journal redistribution, but nothing in `v2-plan/2026-06-10-s6-cutover-deletions.md` retires `progress/index.tsx` or its other subroutes | Subject Hub (mastery, due-review, topic/book/subject progress) + Journal (reports, recaps, `milestone_reached` moments, notes, memory) per the Progress Placement Rule below | **PARTIAL.** WI-1172 in progress. The milestones-gallery heir specifically — `milestone_reached` moments in the Mentor feed (S1) + Journal moments strip (S3) — is **not live**: zero hits for `milestone_reached` anywhere in `apps/mobile/src` or `apps/api/src`. S6 plan gate (c) lost-flow-heir #5 (concrete progress numbers) is open. | No deletion attempted. Milestone **data**/table/detection (`services/milestone-detection.ts`) stays regardless of gallery-screen disposition (S6 plan explicit out-of-scope note) — no data-loss risk either way. | `progress` is a live token in every V1 tab-shape set (`navigation-contract.ts:154-172`); same guard/property/totality/snapshot suite. **Gap:** because no S6 task names the full-tab retirement, there is no dedicated "whole Progress tab" no-regression assertion beyond the generic tab-shape suite — this is a planning gap this WI surfaces, not one it closes (out of WI-1174's lane; a future S6-plan task should name it explicitly before Group A work on Progress begins). |
| **`ParentHomeScreen`** (`apps/mobile/src/components/home/ParentHomeScreen.tsx`; branch at `home.tsx:164-166`) | S4/S5 Support-hub feed — S6 plan T4 | Support hub Mentor feed (`SupportHubMentorTab`, wired in `mentor.tsx:377,386` via `useScopeContext`) + shared-record rendering (`useSharedRecord` → `GET /visibility/reports/:personId/shared-record`, consumed by `SupportHubJournalTab` and `PersonScopeJournalPlaceholder`) | **LIVE** (WI-1170 #1751, WI-1168 #1732, both merged). Support hub renders per-scope through the same three tabs; real shared-record data flows end-to-end. `ParentHomeScreen.tsx` and the `home.tsx:164-166` branch are still present and live — no de-linking started. | Per S6 plan T4 rollback (shared T2–T8 row): pure UI, `git revert` restores verbatim, no data loss. | `FamilyHome`/`ParentHomeScreen` covered by `navigation-contract.snapshot.test.ts` + `legacy-navigation-contract.test.ts`; `home.tsx` has its own related-test suite (S6 plan T4 done-when). |
| **`child/[profileId]/*` proxy routes** (9 screens + `_layout`, all present) | S4/S5 chip person-scopes + structural mask — S6 plan T7 | Scope chip person-scopes; masked structural drill-in (`PersonScopeStructuralSubjects`, reuses the `SubjectHub` component, server-shaped via `supporteeStructuralSubjectsResponseSchema` to exclude private artifacts) + `PersonScopeJournalPlaceholder` | **LIVE** (WI-1169, merged). `PersonScopeStructuralSubjects` renders real mastery/chapter data through the masked schema; person-scope Journal renders real shared-record data. `child/[profileId]/*` routes are still present and live — no de-linking started. | Per S6 plan T7 rollback (shared T2–T8 row): pure UI/route removal, `git revert` restores verbatim; the server read endpoints these screens use are explicitly kept (S6 plan out-of-scope note) regardless of the mobile-route decision. | `child/[profileId]` routes covered by their own 18 co-located test files plus the `HIDDEN_TAB_ROUTES`/`_layout.tsx` related-test suite named in S6 plan T7 done-when. |
| **Session summary exit funnel** (`apps/mobile/src/app/session-summary/[sessionId].tsx` + `_view-models/session-summary-derived.ts`) | S1 T24 + S3 evals — S6 plan T1, gated on gate (a) | In-thread mentor wrap-up turn (`FirstSessionWrapUpCard`, `session/index.tsx:155-234`) — learner-written reflection, filed, 1.5x reflection-bonus receipt (`RewardReceiptCard` with `multiplier: 1.5`) | **PARTIAL — gate (a) now MET; heir is scope-limited.** Gate (a) P3 park-and-return eval coverage is met: `park-and-return-ranking.ts` + `park-and-return-reweave.ts` are registered (`apps/api/eval-llm/index.ts:68-69`) and the EU-3 competition assertion is present (`park-and-return-ranking.ts:54`) — this reverses the S6 plan's 2026-06-10 "verified UNMET" note. But the wrap-up-turn heir itself is gated `shouldUseFirstSessionWrapUp = isV2MentorEntry && isFirstSession` (`session/index.tsx:1068`) — **first session only.** Every subsequent session still routes unconditionally to `/session-summary/[sessionId]` via `navigateToSessionSummary`/`navigateToSummary` in `use-session-actions.ts`. T1's "dissolve the exit funnel" is therefore not yet ready to execute for the general case. | Per S6 plan T1 rollback row: reversible; the only persisted-state risk is the transient `summary-draft` SecureStore key (no server mirror, no historical data lost). | `session-summary/[sessionId]` route is a `HIDDEN_TAB_ROUTES` member (`navigation-contract.ts:183`) with its own co-located tests; V0/V1 shells are untouched by the first-session wrap-up work (no nav-flag file changed). |

**S6 remains blocked** until all of the following hold, per
`v2-plan/2026-06-10-s6-cutover-deletions.md` §Gates — this table does not loosen any of
them:

1. **Per-surface readiness evidence exists for every row above.** Today that is 2 of 6
   fully live (`ParentHomeScreen`, child proxy routes), 2 of 6 with a live heir but
   zero de-linking started (More tab is NOT live; Library tab IS live), 1 of 6 partial
   with an unowned gap (Progress tab), and 1 of 6 partial with a scope-limited heir
   (session summary).
2. **Gate (b) — the §13.1 V0-retirement ruling has not been made** (owner: product,
   Zuzana). Until it is, every destructive deletion of a V0/V1-reachable file, route,
   contract branch, or test stays blocked; only V2-only de-linking is permitted.
3. **The mandatory human irreversibility confirmation** (S6 plan, "DEFERRED — DO NOT
   EXECUTE WITHOUT EXPLICIT HUMAN CONFIRMATION") has not been sought and must precede
   any destructive step regardless of gates (a)–(c) being green.

No agent runs any S6 step — deletion, flag flip, or OTA — off the strength of this
table. It defines readiness; it does not authorize execution.

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
