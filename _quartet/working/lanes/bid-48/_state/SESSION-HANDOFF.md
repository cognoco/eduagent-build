# BID-48 session handoff

Last reconciled: 2026-07-31 11:08 CEST

- Batch page: `3a88bce9-1f7c-8170-a3df-d40eac8c95e0`
- Shepherd: `shepherd:codex:integration-migration`
- Topology: operator-authorized combined Orchestrator/Shepherd, no Clacks.
- Status: `Running`.
- Authoritative members (41): WI-2484, WI-2636, WI-2639, WI-2640, WI-2643, WI-2644,
  WI-2649, WI-2667, WI-2755, WI-2790, WI-2791, WI-2792, WI-2794, WI-2795,
  WI-2797, WI-2798, WI-2799, WI-2800, WI-2801, WI-2802, WI-2804, WI-2805,
  WI-2809, WI-2810, WI-2811, WI-2812, WI-2813, WI-2815, WI-2818, WI-2819,
  WI-2822, WI-2826, WI-2833, WI-2921, WI-2922, WI-2923, WI-2924, WI-2925,
  WI-2931, WI-2936, WI-2939.
- Brief/relation parity: live-verified at 41 after the 2026-07-31 operator ruling
  retracted WI-2941's admission. WI-2941 is Backlog/Active in Nexus / Cosmo
  Lifecycle Tooling with no Sprint or Delivery Batch; WI-2946 is Backlog/Active
  in Nexus / Clacks with no Sprint or Delivery Batch. WI-2942 remains Closed /
  Duplicate of WI-2941. WI-2926 remains Closed / Duplicate of WI-2925.
- Live stage count at checkpoint: 27 Closed, 4 Executing, 10 Ready.

## Current frontier — supersedes stale per-item positions below

- WI-2636 — governed PR #2726 landed as `30a034dd`; execute-complete and independent
  QA/review passed; live state is Closed / Done.
- WI-2812 — replacement PR #344 passed exact-head checks and the governed merge gate,
  landed as `792e22cf`, passed independent QA/review, and is Closed / Done.
- WI-2639 — PR #2730 passed the governed gate and landed as `fee204b5`.
  Execute-complete and independent adversarial QA verified all eight ACs, exact CI,
  disposable-Postgres proof, merge evidence, and origin/main ancestry; Closed / Done.
  Both batch-owned worktrees and obsolete local/remote execution branches are cleaned.
- WI-2794 — landed code, sanctioned database-backed evidence, and corrected
  completion pointers passed independent re-review; Closed / Done.
- WI-2790 — source repair PR #2733 passed the governed gate and landed as `70411272`.
  The item remains Executing until WI-2939 supplies its separate disposable-schema
  proof.
- WI-2939 — member 41, draft PR #2741 at exact head `631355d5` contains the distinct
  revision-pinned schema-bootstrap tooling contract for WI-2790's uniquely named
  disposable non-staging target. The corrected path directly replays the pinned SQL
  journal before guarded schema reconciliation so raw RLS policies are retained; its
  evidence now distinguishes committed migration DML/reference rows from forbidden
  copied user data or separate seed commands. Focused/local gates and exact-head
  review are green; the one bounded rerun of the legacy onboarding smoke reproduced
  the identical two 60-second signed-in-readiness expirations. This is the admitted
  WI-2826 dependency, not a new finding. PR #2741 remains draft and red until WI-2826
  supplies the missing hosted discriminator and a fresh smoke reaches strict green.
  No DB connection occurred, and live mutation remains explicitly operator-gated.
- Operator correction — all eight shepherd-created infrastructure Work Items
  (WI-2792, WI-2812, WI-2815, WI-2819, WI-2924, WI-2931, WI-2941, WI-2946)
  are assigned to Nexus and normalized as factual issue reports. Their original
  solution-shaped title/Description/Acceptance Criteria are preserved verbatim in
  dated page comments. WI-2792 was corrected from ZDX-Marketplace to Nexus while
  retaining Cosmo Lifecycle Tooling. WI-2941 moved to that workstream, returned to
  Backlog, and left BID-48; Marketplace PR #166 is preserved only as a proposal.
  WI-2946 remains outside BID-48 and returned to Backlog in Clacks.
  Marketplace PR #166 is open/draft at `9652d7d`; its clean local execution
  worktree was removed while the local and remote proposal branch were preserved.
- Operator-authorized expired-claim recovery — compare-before-write confirmed
  `Claim Expired=true` and unchanged identity/timestamp/workspace for WI-2643,
  WI-2755, WI-2795, WI-2798, WI-2802, WI-2805, and WI-2826. Each has an audit
  comment and is now Ready/Active with claim fields empty. Started, Executed By,
  Fixed In, PR, evidence, dependencies, and item-specific authority gates remain.
  WI-2755's `37b7a4e6` is already landed; typed executor finalization is dispatched.
- Finding Occurrence policy — new incidental observations are factual occurrences
  only unless explicitly promoted by the operator/owning governance process.
  Operator-authorized direct-write workaround captured FO-2075 /
  `OCC-F968A7988008` in the authoritative Finding Occurrences database as Unlinked.
  No canonical Finding or replacement Work Item was created.
- WI-2755 — dependency WI-2794 is Closed/Done and landed commit `37b7a4e6` is on
  origin/main with merged PR #2630 strict green. Independent review bounced the item
  to Ready/Active: the exact source-artifact run still timed out on a persistent idle
  PgBouncer backend and left the scratch database; the completion manifest also mixed
  Operational classification, unlanded `2cff2484`, Fixed In `37b7a4e6`, and draft
  PR #2746. Full findings are in Cosmo comment
  `3ae8bce9-1f7c-8152-a59d-001d3034c7f3`. PR #2746 remains untouched. FO-2076 /
  `OCC-B9142581EAF8` records the completion/PR mismatch; FO-2077 /
  `OCC-42DF599F8508` records the persistent source-artifact failure. The freed WIP
  slot from WI-2802 was immediately reused: WI-2755 is now claimed by
  `codex:wi2755-rework:WI-2755` for bounded source-artifact rework. Direct-URL
  isolation rework is pushed to draft PR #2746 at `b0981e8c` with its focused
  regression green. A normal origin/main merge resolved the two WI-scoped conflicts
  locally, but the mandatory hook formatted one unrelated current-main line. Merge
  `36c598a33` remains unpushed; no hook bypass, history rewrite, or out-of-scope
  landing occurred. The executor renewed its same-owner claim.
- WI-2802 — Closed/Done. Closed/Done WI-2810 supplies
  the sanitized observer but cannot retroactively classify the 2026-07-26 failure.
  The operator authorized exactly one post-instrumentation isolated hosted J-01
  reproduction. Its sole invocation failed during Playwright config loading because
  the disposable checkout lacked `@playwright/test`; no browser or hosted request
  began, no retry occurred, and the clean checkout was removed. FO-2078 /
  `OCC-A7536C9B0020` records the environment failure. The operator then authorized
  one properly prepared retry. A clean current-main checkout passed frozen install
  and Playwright config preflight; the single workers=1/retries=0 invocation passed
  all three setup cases and the targeted pushed-content J-01 case. The avatar absence
  did not recur and WI-2810 captured no failing phase. FO-2079 /
  `OCC-F6CB34D4EBE4` records the non-reproduction. The operator authorized an AC
  amendment accepting this as the terminal diagnostic outcome without claiming a
  root cause or product fix. Execute completion passed, independent manual QA passed,
  and the autonomous reviewer closed the item Done at 10:00 UTC. The duplicate
  completion heading and opaque Operational attempt ID were adjudicated non-blocking.
- WI-2800 — Ready/Active after review rejected its already-landed `fdbe36d2` evidence:
  the isolated run diagnosed a different 68.6-second sign-in failure and did not
  attribute the original hosted 90-second exhaustion. WI-2826 plus the hosted gate
  remain prerequisites.
- WI-2936 — Ready and unclaimed. Execution needs an operator ruling because the
  mandatory repo worktree script always runs Doppler `env:sync`, while the item scope
  forbids touching Doppler. The operator authorized a one-worktree exception in
  comment `3ae8bce9-1f7c-8166-8f54-001da619ca14`: create the canonical isolated
  worktree and install dependencies, skip `pnpm env:sync`, and use only existing
  local credentials without printing, committing, uploading, rotating, or remotely
  synchronizing them. Dispatch waits only for a WIP slot. FO-2080 /
  `OCC-894322F2C99D` records the broader setup observation without creating a WI.
- WI-2922 and WI-2923 — Ready behind explicit development-only shared mutation gates.
- Remaining shared-database, hosted-reproduction, and credential mutations retain
  their item-specific operator gates; no broad batch mandate silently widens them.
- The persistent goal is active again. Existing execution WIP is WI-2755, WI-2790,
  WI-2921, and WI-2939. Ready items with explicit
  database, credential, hosted-reproduction, or worktree/Doppler gates remain held
  until their recorded authority is satisfied. PR #2741 remains fail-closed on the
  twice-reproduced WI-2826 dependency.
- Claim heartbeat (11:07 CEST): same-owner sanctioned renewal verified WI-2790,
  WI-2921, and WI-2939 Executing with `Claim Expired=false`; each expires at
  12:07 UTC / 14:07 CEST. WI-2755 was freshly claimed at 10:01 UTC.

## Closed / Done

- WI-2640 — landed `1bea527b`; independent review passed; worktrees and obsolete
  branches cleaned.
- WI-2644 — landed `7e1670c9`; independent review passed; cleanup complete.
- WI-2649 — landed `6e9f9c53`; independent review passed; cleanup complete.
- WI-2667 — landed `9f8693a2`; independent review passed; cleanup complete.
- WI-2791 — landed `e91e6b92`; exact RGR re-review passed; cleanup complete.
- WI-2792 — landed `3d42ae49`; exact RGR re-review passed; cleanup complete.
- WI-2797 — landed `8510ef4f`; exact evidence rework passed independent re-review;
  worktrees and obsolete local/remote branches cleaned.
- WI-2801 — landed `69811e20`; exact RGR evidence bounce repaired; independent
  re-review passed; worktrees and obsolete local/remote branch cleaned.
- WI-2811 — landed `b6a2206a`; independent review passed; WI worktree and obsolete
  local/remote branch cleaned.
- WI-2799 — landed diagnosis `f42c4a6e`; WI-2809 supplied its remaining AC evidence;
  independent review passed and cleanup is complete.
- WI-2809 — landed `8d83ecf3`; independent review passed; worktree and obsolete
  local/remote branch cleanup is complete.
- WI-2818 — landed `cfeeaed7`; completion evidence passed, independent global review
  closed with zero findings, and worktree/local/remote branch cleanup is complete.
- WI-2822 — repair and exact evidence rework landed as `0a3000af` and `c96f6bf3`;
  independent review passed. Three batch-owned worktrees and obsolete local/remote
  branches are cleaned; the separate BID-19 integration worktree was not touched.
- Closed Nexus-side WI-2815, WI-2819, and WI-2931 have no remaining registered
  batch-owned execution/deployment worktrees. WI-2819's two Marketplace worktrees and
  merged PR head branches are also cleaned; obsolete Nexus local/remote heads for
  WI-2815 and WI-2931 are cleaned as well. Their landed commits and merged PRs remain
  authoritative; non-worktree deployment-evidence directories are retained for final
  archive/trash disposition.

## Active typed work

- WI-2810 — PR #2652 at `3d797a1e` repairs first-visible-phase retention. Its single
  bounded rerun exposed distinct nav-shell doorway defect WI-2822; no third rerun.
- WI-2812 — draft Nexus PR #330 at `b875c83a`; persisted filtered-poll visibility now
  detects the exact disappearance/re-entry sequence, mutation proof and focused/full
  Clacks are green, and fresh review is running.
- WI-2813 — stale mobile-test count repair discovered from WI-2801's landed suite;
  PR #2649 at `7fd75c84` is exact-head strict green and ready with fresh CodeRabbit
  review, but the armed merge gate cannot obtain the path-excluded Claude verdict.
  It is formally blocked by external WI-2718 / PR #2581; no bypass is authorized.
- WI-2815 — landed `689d5f56`; code/mutation/full-suite proof accepted twice, but host
  review gate still inspects only squash checks. Ready and formally blocked by WI-2819.
- WI-2804 — diagnostic PR #2653 at `dd006d86` is otherwise green but formally blocked
  by WI-2718's docs-only armed-review repair; no verdict bypass.
- WI-2800 — diagnostic PR #2655 at `ac726877`; shared 90s budget exhaustion diagnosed,
  exact slow phase unknowable; WI-2826 captured and being refined.
- WI-2484 — draft PR #2657 at `3fe6960d`; live dev constraints already correct, so no
  database mutation occurred; dev-only evidence/rollback guard committed, CI pending.
- WI-2822 — draft PR #2658 at `c0002155`; local mutation/focused/named Playwright proof
  is green, but hosted run-smoke failed; original executor is classifying without rerun.
- WI-2819 — member 31, claimed and executing the fail-closed Marketplace/Nexus repair.
- WI-2826 — member 32, claimed and executing local credential-safe phase timing;
  hosted seeded-account rerun remains operator-gated.

## Captured / refining before membership

- WI-2946 — Diagnose repeated Claude pre-review aborts blocking governed merges.
  Ready/Active, valid and unclaimed after capture, triage, and refinement; Origin
  WI-2941. Its Delivery Batch relation is intentionally empty pending formal BID-48
  admission or exclusion/defer ruling. Do not dispatch before that disposition.

## Landing / CI frontier

- WI-2801 — PR #2642 landed through the armed gate as `69811e20`; exact RGR evidence
  rework passed independent re-review and the item is Closed / Done.
- WI-2799 and WI-2809 — both independently Closed / Done; cleanup complete.
- WI-2810 — initial `b072b7a4` bounced on lost transient phase; `2df76a91` preserved
  only the latest phase and bounced independently on the first-visible-phase contract.
- WI-2811 — PR #2646 landed through the armed gate as `b6a2206a`; independent review
  closed it Done and cleanup is complete.
- WI-2797 — later-minute sanctioned resume minted a distinct watcher key; global
  independent re-review closed it Done. WI-2812 owns the underlying defect.

## Diagnostics and waits

- WI-2798 — exact trace/Ray attribution requires one controlled trace-enabled hosted
  reproduction; WI-2801 owns the proved aggregate-loading repair.
- WI-2802 — durable diagnosis rules out WI-2185 geometry and narrows the failure to an
  upstream readiness class; exact phase remains unobservable until WI-2810 lands.
- WI-2805 — durable branch proof distinguishes the three code outcomes, but the failed
  retry retained none of the close/route/dialog evidence needed to select one; WI-2811
  owns that repair.
- WI-2800 is Ready but depends on WI-2826 instrumentation and its hosted-run authority
  gate; it is not lawfully dispatchable yet.
- WI-2755's implementation is already landed as `37b7a4e6`; its expired foreign claim
  awaits the governed WI-2941 recovery path before execute-complete and independent
  review.

## Operator authority gates

- WI-2639 — three bounded missing-expression-index mutations after preflight.
- WI-2643 — bounded shared integration-role/RLS membership mutation.
- WI-2790 — disposable Neon branch plus temporary Doppler integration target for the
  required live portability proof; PR #2638 is otherwise strict green.
- WI-2795 — retained Workers Logs/Observability access, or one controlled
  telemetry-enabled reproduction if retained logs are unavailable.
- WI-2798 — one controlled trace-enabled hosted reproduction for exact request
  attribution.
- WI-2805 — hosted rerun is unnecessary until WI-2811 makes the missing branch
  evidence retainable; any shared-staging reproduction still requires explicit gate.
- WI-2939 — one uniquely named disposable non-staging database bootstrap; shared
  development, staging, production, copied user data, and `drizzle migrate` remain
  forbidden.
- WI-2936 — no-Doppler worktree setup exception before local secret-identity proof.
- WI-2922 — bounded additive/idempotent shared-development database reconciliation;
  staging and production forbidden.
- WI-2923 — bounded shared-development Clerk/Doppler audience binding; staging and
  production forbidden.

## External edges

- WI-2636 / PR #2632 is blocked by external WI-2718 / PR #2581, which remains blocked
  by WI-2725. BID-48 monitors; it does not take over.
- WI-2813 / PR #2649 is also blocked by external WI-2718's docs-only-review repair:
  exact-head CI and CodeRabbit are green, but the armed gate refuses the impossible
  fresh Claude verdict because the workflow path-excludes Markdown-only changes.
- WI-2239 remains owned by Running BID-19 and is a strict-green release dependency.
- WI-2788 remains owned by Running BID-33 and owns WI-2795's database seed/reset
  variants.

## Safety and lifecycle

- Never run ambient integration DB tests: Lancre's default/Doppler development target
  was proven to be shared staging.
- Claim before execution and verify future expiry; executors use isolated worktrees.
- Never raw-merge. Require fresh strict green and the armed Cosmo merge gate.
- Run execute-complete only after landed ancestry; independent reviewer alone closes.
- Re-query the live Brief/relation at every consequential boundary. Capture, triage,
  refine, and formally disposition every newly discovered repair before execution.
