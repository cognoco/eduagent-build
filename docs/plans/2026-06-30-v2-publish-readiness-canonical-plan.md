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

- [x] T5 / WI-1172: Preserve concrete progress in the right places — done when topic/book/subject mastery, due-review state, and learning counts live in Subjects/Subject Hub; reports, recaps, milestones, notes, and memory live in Journal; next action lives in Mentor; and the old Progress tab has no unique publish-critical job left. Ownership split documented in `docs/plans/v2-dossier/06-screen-function-access-map.md` → "Concrete Progress Ownership Split (WI-1172)"; residual legacy-Progress-only signals (vocabulary browser, milestone history, live global glance) tracked there for WI-1174, not silently dropped.

- [x] T6 / WI-1173: Verify learner V2 parity, not just existence — done when Mentor, Subjects, Journal, Subject Hub, session, homework, quiz, dictation, and practice each have one current smoke or focused test proving the V2 trigger path, not only the legacy route path.

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
| **More tab** (`apps/mobile/src/app/(app)/more/*`) | S3 avatar/admin sheet — S6 plan T5 | Avatar/Admin sheet (`AccountAdminSheet.tsx`, reached via the avatar icon — `AccountAvatar.tsx`, mounted in `_layout.tsx` and shown only under `MODE_NAV_V2_ENABLED` — routing to `/(app)/account`) | **PARTIAL — entry point live, content not migrated.** `AccountAdminSheet.tsx` exists and is rendered at `apps/mobile/src/app/(app)/account/index.tsx`; under V2 it replaces the More-tab navigation slot (`showAccountAvatar = FEATURE_FLAGS.MODE_NAV_V2_ENABLED && …`, `_layout.tsx:630-676`), with owner-gating wired correctly (`navigationContract.gates.showAccountSecurity`/`showBilling`). But `AccountAdminSheet`'s own rows still `router.push` into the legacy `more/account`, `more/accommodation`, `more/notifications`, `more/privacy`, `more/help`, plus a `more` escape hatch (`AccountAdminSheet.tsx:78,88,105,118,141,150,155`) — the More-tab *screens* remain live, load-bearing content, not yet migrated to avatar-native screens. T5's full scope (deleting `more/index`, `account`, `privacy`, `notifications`, `accommodation`, `celebrations`, `help`, `security-sessions`) is therefore not yet safe. | No deletion attempted — every `more/*` file is present. Per S6 plan T2–T8 rollback row: future removal is pure UI-route deletion, `git revert` restores verbatim, no schema/data loss. | `more` remains a live `LEGACY_GUARDIAN_TABS`/`STUDY_TABS` token (`navigation-contract.ts:155,161,173`); covered by the nav-contract guard/property/totality/snapshot/acceptance/usage-guard suite + `legacy-navigation-contract.test.ts` — all green today, must stay green until gates (b)+(c). |
| **Library tab** (`apps/mobile/src/app/(app)/library.tsx`, 1,399 lines) | S2 Subjects list + S3 Journal archive — S6 plan T6 | Subjects tab (`subjects.tsx`) + Subject Hub (`subject-hub/[subjectId]/index.tsx`) for structure-browse; Journal cross-subject archive (EU-6, `JournalNotesArchive` in `components/journal/JournalTabView.tsx:558-620`) for saved-items browse | **Both heirs LIVE.** Subjects tab + Subject Hub render real mastery/chapter structure; `JournalNotesArchive` is a genuine browsable archive, not search-only (EU-6 met). `library.tsx` itself is untouched — no de-linking has started. | Per S6 plan T6 rollback: `git revert` restores the route; `components/library/*` stays regardless (both heirs reuse it) — no shared-component risk. | Same nav-contract guard/property/totality/snapshot/acceptance/usage-guard suite (`library` token, `navigation-contract.ts:154-172`) plus e2e flow `apps/mobile/e2e/flows/learning/solo-owner-tab-shape.yaml` (confirmed present), exercising the V0 4-tab shape that includes Library. |
| **Progress tab** (`apps/mobile/src/app/(app)/progress/*` — index, `[subjectId]/`, `reports/`, `weekly-report/`, `saved.tsx`, `vocabulary.tsx`, `milestones.tsx`) | **Gap — no S6 task owns the full tab.** The S6 cutover plan names a task for only one file, `progress/milestones.tsx` (T5); WI-1172 (in progress) is landing the Subjects/Journal redistribution, but nothing in `v2-plan/2026-06-10-s6-cutover-deletions.md` retires `progress/index.tsx` or its other subroutes | Subject Hub (mastery, due-review, topic/book/subject progress) + Journal (reports, recaps, `milestone_reached` moments, notes, memory) per the Progress Placement Rule below | **PARTIAL — WI-1172 in progress; milestones heir is half-live.** `milestone_reached` moments ARE live in the Journal moments strip: emitted at `services/snapshot-aggregation.ts:1276` (`kind: 'milestone_reached'`), routed to a Journal deep link at `services/now-feed.ts:803`, and rendered via `journal.moments.milestone_reached` in `components/journal/JournalTabView.tsx:155`. But the Mentor-feed half of the heir is **not live** — `components/mentor/NowCardStack.tsx` (the Mentor tab's card renderer, consumed via `useNowFeed()` in `mentor.tsx`) has zero `milestone_reached` handling. The S6 plan's stated heir ("moments rendering in both the Mentor feed (S1) and the Journal moments strip (S3)") is only half built; S6 plan gate (c) lost-flow-heir #5 (concrete progress numbers) remains open for the Mentor-feed half. | No deletion attempted. Milestone **data**/table/detection (`services/milestone-detection.ts`) stays regardless of gallery-screen disposition (S6 plan explicit out-of-scope note) — no data-loss risk either way. | `progress` is a live token in every V1 tab-shape set (`navigation-contract.ts:154-172`); same guard/property/totality/snapshot suite. **Gap:** because no S6 task names the full-tab retirement, there is no dedicated "whole Progress tab" no-regression assertion beyond the generic tab-shape suite — this is a planning gap this WI surfaces, not one it closes (out of WI-1174's lane; a future S6-plan task should name it explicitly before Group A work on Progress begins). |
| **`ParentHomeScreen`** (`apps/mobile/src/components/home/ParentHomeScreen.tsx`; branch at `home.tsx:164-166`) | S4/S5 Support-hub feed — S6 plan T4 | Support hub Mentor feed (`SupportHubMentorTab`, wired in `mentor.tsx:377,386` via `useScopeContext`) + shared-record rendering (`useSharedRecord` → `GET /visibility/reports/:personId/shared-record`, consumed by `SupportHubJournalTab` and `PersonScopeJournalPlaceholder`) | **LIVE** (WI-1170 #1751, WI-1168 #1732, both merged). Support hub renders per-scope through the same three tabs; real shared-record data flows end-to-end. `ParentHomeScreen.tsx` and the `home.tsx:164-166` branch are still present and live — no de-linking started. | Per S6 plan T4 rollback (shared T2–T8 row): pure UI, `git revert` restores verbatim, no data loss. | `FamilyHome`/`ParentHomeScreen` covered by `navigation-contract.snapshot.test.ts` + `legacy-navigation-contract.test.ts`; `home.tsx` has its own related-test suite (S6 plan T4 done-when). |
| **`child/[profileId]/*` proxy routes** (9 screens + `_layout`, all present) | S4/S5 chip person-scopes + structural mask — S6 plan T7 | Scope chip person-scopes; masked structural drill-in (`PersonScopeStructuralSubjects`, reuses the `SubjectHub` component, server-shaped via `supporteeStructuralSubjectsResponseSchema` to exclude private artifacts) + `PersonScopeJournalPlaceholder` | **LIVE** (WI-1169, merged). `PersonScopeStructuralSubjects` renders real mastery/chapter data through the masked schema; person-scope Journal renders real shared-record data. `child/[profileId]/*` routes are still present and live — no de-linking started. | Per S6 plan T7 rollback (shared T2–T8 row): pure UI/route removal, `git revert` restores verbatim; the server read endpoints these screens use are explicitly kept (S6 plan out-of-scope note) regardless of the mobile-route decision. | `child/[profileId]` routes covered by their own 18 co-located test files plus the `HIDDEN_TAB_ROUTES`/`_layout.tsx` related-test suite named in S6 plan T7 done-when. |
| **Session summary exit funnel** (`apps/mobile/src/app/session-summary/[sessionId].tsx` + `_view-models/session-summary-derived.ts`) | S1 T24 + S3 evals — S6 plan T1, gated on gate (a) | In-thread mentor wrap-up turn (`FirstSessionWrapUpCard`, `session/index.tsx:155-234`) — learner-written reflection, filed, 1.5x reflection-bonus receipt (`RewardReceiptCard` with `multiplier: 1.5`) | **PARTIAL — gate (a) now MET; heir is scope-limited.** Gate (a) P3 park-and-return eval coverage is met: `park-and-return-ranking.ts` + `park-and-return-reweave.ts` are registered (`apps/api/eval-llm/index.ts:68-69`) and the EU-3 competition assertion is present (`park-and-return-ranking.ts:54`) — this reverses the S6 plan's 2026-06-10 "verified UNMET" note. But the wrap-up-turn heir itself is gated `shouldUseFirstSessionWrapUp = isV2MentorEntry && isFirstSession` (`session/index.tsx:1068`) — **first session only.** Every subsequent session still routes unconditionally to `/session-summary/[sessionId]` via `navigateToSessionSummary`/`navigateToSummary` in `use-session-actions.ts`. T1's "dissolve the exit funnel" is therefore not yet ready to execute for the general case. | Per S6 plan T1 rollback row: reversible; the only persisted-state risk is the transient `summary-draft` SecureStore key (no server mirror, no historical data lost). | `session-summary/[sessionId]` route is a `HIDDEN_TAB_ROUTES` member (`navigation-contract.ts:183`) with its own co-located tests; V0/V1 shells are untouched by the first-session wrap-up work (no nav-flag file changed). |

**S6 remains blocked** until all of the following hold, per
`v2-plan/2026-06-10-s6-cutover-deletions.md` §Gates — this table does not loosen any of
them:

1. **Per-surface readiness evidence exists for every row above.** Today that is 3 of 6
   with a fully live heir and zero de-linking started (Library tab, `ParentHomeScreen`,
   child proxy routes), and 3 of 6 partial: More tab's avatar entry point is live but
   its content still depends on the legacy `more/*` screens; Progress tab has both an
   unowned S6-task gap and a half-live milestones heir (Journal yes, Mentor feed no);
   session summary's gate (a) is met but the wrap-up-turn heir is first-session-scoped
   only.
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

## Publish-Readiness Review (WI-1175)

**Reviewed:** 2026-07-02. **Recommendation: CONDITIONAL-SHIP.** The seven publish-critical
task prompts in T8's done-condition all pass on current `origin/main` code, but this WI's
own Acceptance Criteria are not fully met today — see the conditions below. This section is
additive: it does not retroactively flip the T3/T4 checkboxes above or the dossier's
`PARTIAL`/`OPEN` labels, because two of those are accurate, not stale (see WS-28 Full
Roster).

### Publish-critical task prompts (T8 done-condition)

| Prompt | Status | Evidence |
|---|---|---|
| Start homework help | `CODE` | `mentor.tsx:78`, `homework/camera.tsx` — 06 § Linked Target Screens. |
| Review something due | `CODE` | Subject Hub next-up + due-review; `use-subject-hub.ts:228-276`. |
| Find a subject's concrete progress | `CODE` | `use-subjects-index.ts:34`, `SubjectHubProgressSummary.tsx:10` — 06 § Concrete Progress Ownership Split. |
| Find a previous note/recap/report | `CODE` | Journal `me` scope Notes/Sessions/Reports sections — `JournalTabView.tsx`. |
| See what a supported learner worked on | `CODE` | Journal supporter-hub/person scope shared-record (WI-1168/1169), `SupportHubJournalTab.tsx`, `PersonScopeJournalPlaceholder.tsx`. |
| Explain what a supporter can and cannot see | `CODE` | Visibility ceremony contract screens (WI-1171) name shared vs. private facts; `supporter-structural-mask.ts` enforces it server-side. |
| Change billing/security/privacy settings | `CODE` | `AccountAdminSheet.tsx` rows route to `more/account.tsx`, `more/privacy.tsx`, `more/security-sessions.tsx` — reachable, not yet visually migrated (see More-tab row, 2026-06-30 retirement table above). |

All seven pass today. This is the basis for not recommending HOLD.

### WS-28 full roster (AC clause 1: "All WS-28 items are either Closed or explicitly deferred")

The canonical plan's own `work_items` frontmatter and T1-T8 checklist name 8 items. The
Cosmo `V2 finalization` workstream page actually relates **17** items. The 9 not named in
this plan's checklist:

| WI | Name | Stage / State | Disposition |
|---|---|---|---|
| WI-1122 | S3: add use-my-reports hook + remove out-of-scope JournalPracticeSection | Closed / Done | Closed. **Root cause of WI-1207 below** — see next row. |
| WI-1130 | S1: improve bar-intent-match fidelity beyond literal IDs | Closed / Done | Closed. |
| WI-1131 | S1: differentiate retention.review vs challenge.start deep links | Closed / Done | Closed. |
| WI-1133 | S2: re-add cross-entity search (notes + sessions) | Closed / Done | Closed. |
| **WI-1207** | Restore Practice access on Journal landing | **Executing / Active** | **Open, unlanded.** Regression: WI-1122's resolution removed the Journal Practice section; WI-1207 exists to restore it. Bounced at review 2026-07-01 — `Fixed In` cited a commit that exists only on `origin/WI-1207`, not an ancestor of `origin/main`; no PR, no CI runs. **Not closed, not explicitly deferred with owner/rationale** — it is simply stuck. Does not block the 7 task prompts (none require Practice access from Journal), and matches the already-documented 07 gap ("no V2-native forward trigger reaches the standalone `/(app)/practice` hub"). Recommend: land or explicitly re-scope/defer before this plan can truthfully claim "all WS-28 items closed or deferred." |
| WI-1124 | S0-R: add T10 cross-writer lifecycle integration test + GC6 mock cleanup | Executing / Active | Open, unlanded. P3 test-hygiene item, no product surface. Does not block publish; recommend closing out or formally deferring so the roster is accurate. |
| WI-1120 | S1: add card + celebration animation (NowCard/NowCardStack/MentorCelebration) | Executing / Active | Open, unlanded. Rejected twice at review (exit-animation bypass; reduced-motion AC not met — landed component keeps the animated surface for `alreadySeen=false` instead of the static one the AC requires). P1, but purely animation polish on already-functional surfaces — does not block any of the 7 task prompts. |
| WI-1118 | S2: wire writable Subject Hub notes (onAddNote) | Reviewing / Awaiting Info | Blocked on a scope ruling, not unfinished code: PR #1721 merged and landed **topic-scoped** note authoring (`/subjects/:subjectId/topics/:topicId/notes`) per a newer spec (`docs/specs/2026-06-27-felt-knowing-loop.md`), which supersedes this WI's original AC #3 (a **topicless** `POST /subjects/:subjectId/notes` endpoint). A human needs to either accept the supersession and close, or send it back for the original topicless endpoint. The functional equivalent ("find/add a note in Subject Hub") already works today, so this does not block the "find a previous note" task prompt. |
| WI-904 | Dictation playback: rework pacing around clear speech and phrase/sentence pauses | Refining / Active | See below — correction to the brief's framing. |

**Net for AC clause 1:** not met as written. 13 of 17 WS-28 items are Closed; WI-904 has a
real, well-documented deferral rationale (below) though no `Owner` property is set; the
remaining 3 (WI-1207, WI-1124, WI-1120) are open and were not named anywhere as deferred —
they were simply absent from this plan's own roster. None of the three block the 7 task
prompts. WI-1118 is a scope-ruling gate, not missing functionality.

### WI-904 — correction to the brief's framing

On-device QA was **not** "unavailable" — it was performed and it **failed**. Timeline from
Cosmo comments: code landed lengthening `normal`-pace pauses (2026-06-25); reviewer
requested on-device confirmation twice (2026-06-25, 2026-06-28); the product owner ran the
QA on 2026-06-30 and it failed ("'normal' dictation pace is still too fast to write
along"); a rework PR (#1749) implementing an age-scaled per-word/per-character pause model
was then closed **unmerged** on 2026-07-01 because a deep-research report
(`docs/analysis/research/dictation-deep-research-report.md`) changed the intended approach
(natural clear speech + phrase-level pauses, not per-word/per-character scaling); the item
moved back to `Refining/Active` the same day with AC/Description updated to the new
direction. The rationale is thoroughly documented in Cosmo comments; the gap is that the
`Owner` property is empty, so AC clause 1's "deferred with owner" is only half-satisfied.
**Does not block publish** — dictation pacing quality is not one of the 7 task prompts, and
is an existing-feature UX-quality issue, not a missing V2 surface.

### Dossier/plan/Cosmo reconciliation (AC clause 2: "Dossier maps, canonical plan, and route/flow inventory agree on what ships")

They do not fully agree today. Two distinct patterns, kept separate because they cut
opposite ways:

1. **Currency gaps (docs lag landed code) — benign, needs a follow-up doc pass, not a
   product concern:**
   - T4/WI-1171's checkbox above is still unticked even though WI-1171 is Closed and its
     appeal-affordance follow-on (`AppealButton.tsx`, `apps/mobile/src/components/visibility/AppealButton.tsx`)
     is merged and documented in `07-trigger-flow-logic-map.md`'s "Failure Modes — Supporter
     Appeal" table.
   - `06-screen-function-access-map.md` § "Plan-Backed Or Partial Screens Still Needed" →
     "Visibility ceremony screens" row still reads "appeal affordance is in-flight rework
     (WI-1171)" — stale; it has landed.
   - `07-trigger-flow-logic-map.md` § "Current Gaps To Review" still lists "Support hub is
     still mostly list/placeholder UI" as a gap — stale relative to WI-1170's cockpit-card
     landing (see next point for why the row isn't simply wrong).

2. **A real, accurate discrepancy — not a doc-sync issue:** T3/WI-1170's checkbox is
   unticked and `06`'s "Mentor tab, supporter hub scope" / "Support hub cold-start" /
   "Supporter co-learning/nudge actions" rows are correctly labelled `PARTIAL`/`PLAN`. WI-1170
   was closed 2026-07-01 delivering real, verified functionality (`SupportHubMentorTab.tsx`
   now renders visibility-backed shared-record cards with next actions into Mentor/Subjects/
   Journal — confirmed merged via PR #1751, `bad3821df19a6c443197e55fdc7fe8bf5b9b0f59`, an
   ancestor of `origin/main`). But T3's own Acceptance Criteria explicitly required
   "co-learning/start-together actions, and quiet nudge affordances" in addition to the
   attention-item cards. A repo-wide grep (`co-?learn|nudge|start.together`) over
   `apps/mobile/src/components/support/` and `mentor.tsx` on `origin/main` returns **zero
   hits** — that scope was not built. WI-1170's own completion summary does not mention this
   gap; it reads as fully done. This is a **silent scope-narrowing on close**, not a
   documentation-currency lag: the docs (T3 checkbox, dossier `PARTIAL` label) are the
   accurate record here, and Cosmo's `Closed/Done` status is the outlier.
   `06`'s companion table (§ "Concrete Progress Ownership Split (WI-1172)") independently
   confirms this: it lists "Guardian nudge action (`childSummaryQuery.nudgeRecommended`)" as
   `OPEN`, explicitly attributed to "the support-hub job-to-be-done work" (i.e. T3/WI-1170
   scope), not yet delivered.

3. **Route/flow inventory:** the plan's own text (top of this document) names
   `06-screen-function-access-map.md` + `07-trigger-flow-logic-map.md` as "the source maps
   for this plan," and `07` is the trigger/flow map, so this review treats `06`+`07` as the
   operative "route/flow inventory" for V2. Separately: `docs/flows/mobile-app-flow-inventory.md`
   (the repo's general flow inventory, cited by `AGENTS.md`'s navigation-shell-matrix note)
   has **zero** mentions of V2, the Mentor/Subjects/Journal shell, scope chip, or support hub
   as of its last rebuild (2026-06-25) — it was not extended to cover V2 and none of the
   WS-28 closures touched it. It cannot be said to "agree" with the V2 canonical plan because
   it is silent on V2 entirely. Recommend a follow-up item to either extend it to cover the
   V2 shell or explicitly scope-note it as V0/V1-only.

### Recommended follow-up actions (not this WI's job to execute)

1. Tick T4/WI-1171's checkbox and refresh the two stale `06`/`07` rows named above (currency
   gaps only — do not touch T3 or its dossier `PARTIAL` labels).
2. Get a product ruling on WI-1170's missing co-learning/nudge scope: accept as a fast-follow
   (open a new WI) or reopen T3.
3. Land or formally re-scope/defer WI-1207 (Practice-access regression) so WS-28's roster is
   accurate; not a publish blocker on its own.
4. Rule on WI-1118's topicless-vs-topic-scoped notes AC supersession.
5. Decide WI-1120's disposition (fix the reduced-motion AC mismatch, or re-rule the AC) —
   cosmetic, non-blocking.
6. Assign an `Owner` to WI-904 per its documented rework direction; not a publish blocker.
7. Either extend `docs/flows/mobile-app-flow-inventory.md` to cover the V2 shell or add an
   explicit scope note that it is V0/V1-only.
