# Plan cleanup dispositions

**Date:** 2026-07-14  
**Starting scope:** 58 Markdown plans and two HTML design artifacts under `docs/plans/`.  
**Method:** Current source code, tests, guards, runtime flags, and route/component existence were checked. Plan checkboxes and status labels were treated only as claims to verify.

## Outcome

- **31 starting Markdown plans were implemented** and moved to `docs/_archive/plans/done/`.
- **22 starting Markdown plans and two HTML artifacts were superseded** and moved to `docs/_archive/plans/2026-07-14-superseded/`.
- **5 starting Markdown documents remain live**: three active plans, one irreversible deferred plan, and the MVP definition reference.
- The audit-doc cleanup plan created immediately before this pass was also completed and archived with implemented plans.

## Per-document action

Every Markdown file matched by a listed directory/glob inherits that action as
its individual disposition. The two HTML files inherit the V2 dossier ruling.

| Original plan(s) | Action | Current-code basis / replacement |
|---|---|---|
| `2026-07-11-*.md`; `2026-07-12-*.md` except `2026-07-12-one-way-door-risk-drain.md` | **Archive — addressed (19 plans)** | All implementations and focused tests exist. External Sentry/Inngest/deployment proof belongs in current runbooks/operator evidence, not implementation plans. |
| `2026-06-26-challenge-round-grader-judge.md` | **Archive — addressed** | Dedicated grader, judge capability, flag, terminal guard, evals, tests, and bake-off record exist. |
| `2026-06-27-homework-autofile-recall-bridge.md` | **Archive — addressed** | Autofiling and recall-bridge submit/skip paths are implemented and tested. |
| `2026-06-27-review-continuity-opener-simulation-harness.md` | **Archive — addressed** | Builder, schema, flag, prompt gate, fixtures, judge, snapshots, and tests exist. |
| `v2-plan/03-gap-analysis-2026-06-28.md`; `v2-plan/2026-06-10-s0-backend-primitives.md`; `s0r`; `s1`; `s2`; `s3`; `s4`; `s5` | **Archive — addressed (8 plans)** | `/now`, retention updates, V2 Mentor/Subjects/Journal, Support/scopes/cold-start, visibility/linking, and their tests are present. |
| `2026-07-14-audit-docs-cleanup.md` | **Archive — addressed** | The audit estate was classified, archived, indexed, and link/inventory verified. |
| `2026-04-15-S06-rls-phase-2-4-enforcement.md` | **Archive — superseded/captured** | RLS policies/guards exist; activation remains intentionally outside MVP scope and must be planned from current identity architecture. |
| `2026-05-19-mobile-lab-macos-setup-plan.md` | **Archive — superseded** | Current cross-platform E2E runbooks, skills, and the cross-platform development ADR replace the one-account Mac setup. |
| `2026-05-31-billing-recovery-learner-capacity.md` | **Archive — superseded/captured** | Payment-failure alerting is live; child allocations/cap actions are outside MVP scope. |
| `2026-05-31-notification-reachability-nudges.md` | **Archive — superseded/captured** | Notification reachability is live; child-to-parent nudges are explicitly outside MVP scope. |
| `2026-05-31-product-continuity-low-hanging-fruit.md` | **Archive — superseded/captured** | Overlap landed through V2 Mentor, Journal, and summary work; remaining parent nudge/recap ideas are deferred. |
| `2026-05-31-profile-setup-personalization-corrections.md` | **Archive — superseded/captured** | Pronouns/interests/tutor-language work landed; birth-date correction belongs to current identity canon, not the legacy owner model. |
| `2026-05-31-resumable-practice-state.md` | **Archive — superseded/captured** | Honest exit copy landed; a recovery engine remains explicitly deferred outside MVP scope. |
| `2026-06-08-note-correctness-and-challenge-draft.md` | **Archive — superseded/captured** | Challenge-note drafting is live/hardened; broad note-correctness nudging is outside MVP scope. |
| `2026-06-24-gemini-runtime-removal-cutover.md` | **Archive — superseded/captured** | Served routing excludes Gemini; any remaining provider-code removal is governed by the model register and one-way-door drain. |
| `2026-06-30-v2-publish-readiness-canonical-plan.md` | **Archive — superseded** | Its work-item roster is stale; current MVP roadmap and code own readiness. |
| `2026-07-02-4-strands.md` | **Archive — superseded** | Brainstorming was decomposed and implemented through focused graded-input, meaning-output, progress, summary, next-practice, and speaking-practice slices. |
| `2026-07-03-remaining-feature-classification.md` | **Archive — superseded** | Point-in-time work-item snapshot replaced by the MVP roadmap and current work-item state. |
| `v2-plan/00-README.md`; `00-STATE-OF-PLAY.md`; `01-codebase-anchors.md`; `02-flow-map.md` | **Archive — superseded** | June assertions that S4/S5 were unbuilt are false; file/line anchors and flow states materially drifted. |
| `v2-dossier/**/*` including `04-reels.html` and `05-reels-v1.html` | **Archive — addressed/superseded** | Pre-build journeys, gap frames, decisions, and access maps were implemented or overtaken by current routes/tests and the MVP roadmap. Do not use the dossier to authorize deletions. |
| `2026-05-12-shared-test-utility-framework-plan.md` | **Keep active** | Shared utilities exist, but existing-suite cleanup batches remain and have no newer owner plan. |
| `2026-07-10-mvp-roadmap/RUNWAY.md` | **Keep active** | Accepted roadmap of record; sequencing is ongoing. |
| `2026-07-12-one-way-door-risk-drain.md` | **Keep active** | Eleven unchecked governance/owner tasks remain current. |
| `v2-plan/2026-06-10-s6-cutover-deletions.md` | **Keep active, deferred** | V0/V1 contracts, flags, and fallback shell remain. S6 removes flag-flip rollback and requires explicit human confirmation. |
| `2026-07-10-mvp-roadmap/MVP-DEFINITION.md` | **Keep current reference** | Ratified launch scope: 13+ launch, managed tier dormant, S6 deferred, V2-with-rollback posture. |

## Live residues retained in current owners

- RLS activation, child-capacity allocation, parent nudges, durable practice
  recovery, broad note-correctness, and managed under-13 activation are not
  silently “done”; they are explicitly deferred/out in the MVP definition or
  owned by current canon/registers.
- External alert-console, production endpoint, and deployed-secret proof remains
  operator evidence even when its implementation plan is archived.
- V2 S6 remains the sole live June stage plan. Nothing in this cleanup authorizes
  its execution.
