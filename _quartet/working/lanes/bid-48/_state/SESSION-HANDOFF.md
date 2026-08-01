# BID-48 session handoff

Last reconciled: 2026-08-01 19:27 CEST

- Batch page: `3a88bce9-1f7c-8170-a3df-d40eac8c95e0`
- Shepherd: `shepherd:codex:integration-migration`
- Topology: operator-authorized combined Orchestrator/Shepherd. No standing Clacks
  attachment; the operator explicitly directed one bounded read/action of handoff
  103751 on `mentomate-pgm` for WI-2939.
- Status: `Running`.
- Authoritative members (41): WI-2484, WI-2636, WI-2639, WI-2640, WI-2643, WI-2644,
  WI-2649, WI-2667, WI-2755, WI-2790, WI-2791, WI-2792, WI-2794, WI-2795,
  WI-2797, WI-2798, WI-2799, WI-2800, WI-2801, WI-2802, WI-2804, WI-2805,
  WI-2809, WI-2810, WI-2811, WI-2812, WI-2813, WI-2815, WI-2818, WI-2819,
  WI-2822, WI-2826, WI-2833, WI-2921, WI-2922, WI-2923, WI-2924, WI-2925,
  WI-2931, WI-2936, WI-2939.
- Brief/relation parity: currently divergent. The Brief remains at 41 after the 2026-07-31 operator ruling
  retracted WI-2941's admission. WI-2941 is Backlog/Active in Nexus / Cosmo
  Lifecycle Tooling with no Sprint or Delivery Batch; WI-2946 is Backlog/Active
  in Nexus / Clacks with no Sprint or Delivery Batch. WI-2942 remains Closed /
  Duplicate of WI-2941. WI-2926 remains Closed / Duplicate of WI-2925. The live
  relation now also contains WI-2958 without a Brief amendment; formal membership
  disposition is pending and the item is not silently admitted or taken over.
- Live relation slice at checkpoint: 32 Closed, 5 Executing, 5 Ready (42 related
  rows). The 41 Brief-declared members comprise 32 Closed, 4 Executing, 5 Ready.

## Current frontier — supersedes stale per-item positions below

### Latest authoritative boundary — 2026-08-01 19:27 CEST

- WI-2939's same logical disposable development database and owner were recreated
  under the operator's item-specific authority after exact-name deletion reduced the
  branch inventory from nine databases to eight. Numeric database ID `4886176`
  replaced failed ID `4886158`; project, branch, endpoint, database name, owner, and
  development-only boundary remained unchanged. The operator subsequently granted
  standing authority for equivalent replacement of this disposable target without a
  repeated ruling; it does not extend to shared development, staging, production, or
  changed logical identities.
- The exact historical implementation revision `c5cc41fe` reproduced the bootstrap
  defect: historical RLS replay targeted absent relations after schema push. The
  independently landed prerequisite repair `55eb79c4` (WI-2996) skipped stale replay
  targets, then bootstrapped the recreated target green. The canonical command
  `corepack pnpm run test:api:integration` was invoked exactly once and exited zero:
  150 suites passed, 6 skipped; 1,141 tests passed, 52 skipped; zero failures.
- Evidence-only PR #2846 tracked six sanitized source receipts and terminal excerpts.
  Its valid auditability review finding was repaired at exact head `1b360de1`; all 16
  logical checks and fresh zero-finding review passed. The governed gate squash-landed
  it as `15bbb36f`, verified on `origin/main`. Sanctioned execute-complete then moved
  WI-2939 to Reviewing, set that exact commit as Fixed In, cleared its producer claim,
  and preserved the producer identity. After the unavailable automatic adversarial
  route paused, distinct reviewer `codex:wi2939-independent-adversarial` resumed and
  picked up the item. Independent QA passed 5 mechanical claims with 0 failures and
  manually proved all six ACs, the bug red/green chain, 43/43 fresh safe guards,
  evidence equality/archive hash, exact live disposable identity, and strict-green
  merge ancestry. Sanctioned review independently Closed/Done the item; QA comment
  `3af8bce9-1f7c-81f2-8a5e-001d89972f58`, close comment
  `3af8bce9-1f7c-81cc-8fe1-001d2d51f9d6`.
- Direct Cosmo polling returns 42 related rows: 32 Closed, 5 Executing, and 5 Ready.
  WI-2958 remains the extra, unadmitted relation row under an expired external claim.
  The Brief still declares 41 authoritative members.
- Same-owner heartbeats renewed WI-2643, WI-2790, WI-2826, and WI-2922 at 19:22 CEST.
  The authoritative pages record future expiry at 20:22 UTC; no claim was transferred.

### Latest authoritative boundary — 2026-08-01 17:22 CEST

- WI-2922 is repository-landed through the governed merge gate. Ready-state review
  found two valid guard defects: a mislabeled `dev_integration` credential could
  bypass disposable-target identity checks, and a concurrent incompatible column
  could win between preflight and `IF NOT EXISTS`. Exact head `57dd317c` wires the
  canonical target validator and post-DDL catalog verification; mutation-sensitive
  RED 17/2 became GREEN 19/19, the focused family passed 35/35, and database tests
  passed 320/320. Both Codex threads were resolved with evidence. Full exact-head CI
  passed; one unrelated V2 manual-homework smoke miss was recorded as FO-2092 /
  `OCC-462262050B18`, then the single failed-job rerun passed 23/23 V2 and 24/24
  legacy. The gate verified all 16 logical checks and squash-merged PR #2830 as
  `01f55639`, now on `origin/main`. Shared-development schema reconciliation remains
  unperformed and separately operator-gated, so the item remains Executing.

- WI-2643 is repository-landed through the governed merge gate. Exact head
  `fc2de822` passed all 14 checks after the single failed-job rerun cleared the
  unrelated staging smoke timeout; fresh ready-state Claude review again reported
  zero findings. The gate verified zero automated-review threads and squash-merged
  PR #2833 as `695634b3`, now on `origin/main`. The separately gated shared Neon role
  setup has not occurred, so the item correctly remains Executing and is not
  execute-complete.
- WI-2922 PR #2830 remains draft at `f8320a9d`; a fresh governed dry-run reports
  `would MERGE` with its exact-head checks, thread disposition, and Claude approval
  satisfied. No merge or shared-development database mutation occurred.
- Same-owner heartbeats renewed WI-2643, WI-2790, WI-2826, WI-2922, and WI-2939 at
  16:30 CEST. Direct re-read confirms all five remain Executing/Active with unchanged
  claimant identities and `Claim Expired=false`; WI-2958's unrelated external claim
  remains expired and untouched.

- Direct Cosmo polling still returns 42 related rows: 31 Closed, 6 Executing,
  and 5 Ready. BID-48 remains Running. The Brief/relation mismatch is unchanged:
  WI-2958 is the extra related row and remains unadmitted under its expired external
  claim.
- WI-2939's newly authorized logical-target preflight passed project, branch,
  endpoint, endpoint-to-branch, Doppler database-name, and owner checks, but the
  named disposable database is now absent. The branch contains only the same eight
  older databases that predate WI-2939; there is no successor database/owner pair.
  The guard stopped before Jest, bootstrap, or any schema/test mutation, so the
  one-run allowance remains unconsumed. Durable refusal evidence is
  `.workitem-artifacts/WI-2939/full-canonical-rerun-logical-target-refusal.json`.
  The operator is considering whether to recreate the same disposable development
  database and owner on the already authorized stable project/branch/endpoint.
- WI-2643 exact-head Flag-ON CI job `91374686708` is green, including local-role
  provisioning and both integration-test steps. Main job `91374928424` is still
  running after its own provisioning and database guard steps passed. The separate
  staging smoke run failed one V2 homework readiness wait while its legacy run passed
  24/24; FO-2091 / `OCC-547F9C3B9EAA` records the unrelated occurrence. A single
  failed-job rerun is queued only after main concludes green; no code was changed.

- WI-2936 is independently Closed/Done at landed commit `08d75f40`; its sole
  evidence-integrity bounce was corrected without production changes. Independent
  QA passed seven mechanical claims and sanctioned close preserved producer/reviewer
  separation.
- WI-2755 PR #2808 landed through the governed merge gate as `223a9cfe` and is now
  independently Closed/Done. Fresh QA re-established two consecutive
  DATABASE_URL-only replays, focused 5/5 behavior, and zero leaked scratch databases
  or backends. Comment `3af8bce9-1f7c-814b-9b6d-001dd8918017` preserves the
  independent corroboration. Its three merged/closed branches and worktrees were
  removed after closure; durable PR and Cosmo evidence remains.
- WI-2939 implementation rework PR #2809 landed as `c5cc41fe`. The operator amended
  the credential boundary to permit a branch-scoped role on the existing nine-DB
  `dev-integration` branch while keeping every connection and mutation pinned to
  `eduagent_integration_wi2790_811f580999ce`. The role and five authorized
  `mentomate/dev_integration` keys were repaired; fresh no-cache preflight passed.
  The target already had a trusted ready marker and 1,843 matching structural facts,
  so it was not bootstrapped again. Durable Jest cache evidence proves the authorized
  canonical command ran once from 10:32:07–10:54:36 local: 147/151 suites passed and
  four failed, but the original executor retained no terminal failure detail. Comment
  `3af8bce9-1f7c-812d-af48-001d851b5015` and
  `.workitem-artifacts/WI-2939/exact-once-recovery.json` preserve the result. No rerun
  or execute-complete occurred from that result. The operator has now selected one
  full canonical rerun with durable redacted output. Two guarded preflights refused
  before Jest because Neon repeatedly recreated the same project/branch/endpoint/
  database-name/owner-role target: ID `4883605` disappeared, successor `4884123` was
  authorized, then live identity moved again to `4884446`. The one-run allowance is
  unconsumed and neither refusal performed bootstrap, schema, or test mutation.
  Durable receipts are in `.workitem-artifacts/WI-2939/`; the next operator ruling is
  whether to authorize the exact logical disposable target despite numeric-ID churn.
- WI-2826 local instrumentation is published in draft PR #2811 at `140c5233` with
  focused 4 suites/20 tests, mutation proof, typecheck/lint/format/change-class gates,
  and normal pre-push green. No hosted run occurred; its controlled seeded-account
  reproduction remains a later operator gate after WI-2939 is concluded. FO-2086 /
  `OCC-1B3E2CB142B3` records stale-local-main change-class over-selection without a WI.
- WI-2921 head `bb8f07df` passed every gate except full CI: two existing mocked
  remote-API success-path tests had not installed the now-required explicit fake
  seed secret. FO-2087 / `OCC-D2E82DA0564A` records the factual CI occurrence.
  Bounded test-only repair `938a041d` now declares remote helper mode and an explicit
  fake test-process secret, restores both variables after each case, and touches no
  production code or real credentials. Focused 4 suites/20 tests are green; normal
  push published exact PR #2718 head `938a041d`; all 14 exact-head checks passed,
  the sole automated thread was resolved with evidence, and fresh Claude reported
  zero findings. The governed merge gate landed squash commit `8a26201b`; landed
  verification passed and execute-complete moved the item to Reviewing. Independent
  review bounced it because the local 4/4 Playwright and required mutation cycle were
  not preserved in a tracked durable artifact; FO-2088 / `OCC-965BA3CB88AA` records
  the factual evidence-integrity failure. It is now reclaimed on evidence-only branch
  `WI-2921-evidence-r2`: a fresh real local run passed 4/4 with one worker and zero
  retries, and the disconnected-source mutation produced the expected RED before an
  exact restore returned GREEN. The single-file tracked artifact landed through the
  governed merge gate: PR #2832 exact head `99decc568` passed 14 required checks,
  zero automated threads, and a fresh zero-finding Claude approval, then squash-landed
  as `9a3415b5`. All 23 landed checks concluded green/skipped, corrected completion
  artifacts passed the sanctioned validator, and execute-complete returned the item
  to Reviewing with durable tracked provenance and claim cleared. A distinct reviewer
  independently re-established the DoD and the live item is now Closed/Done. Both
  merged PR branches and isolated worktrees (`WI-2921`, `WI-2921-evidence-r2`) were
  removed locally and remotely after closure; landed commits and PR/Cosmo evidence
  remain durable. WI-2790 and WI-2939 remain dependency/authority-bound Executing.
- WI-2922 was live-reconciled Ready/Active/unclaimed, then properly claimed as
  `codex:wi2922-repository-executor:WI-2922` in isolated worktree `WI-2922`. Its
  repository-only frontier is published in draft PR #2830 at `f8320a9d`. Focused
  catalog/DDL/guard coverage passes 33/33; fast change-class passes four commands
  and 62 tests. Commit/push hooks passed and `execute pr-opened` recorded the PR.
  Shared development, staging, production, and secrets remain untouched; AC2's
  explicit shared-dev mutation gate is not granted. All 14 exact-head checks are now
  green; PR #2830 remains draft pending the later shared-development ruling.
- WI-2643 repository repair is published in draft PR #2833. Initial head `033ce57e`
  failed only the Flag-ON CI job because that sibling job omitted the new local-role
  provisioning step; the normal main job provisioned successfully. FO-2089 /
  `OCC-C0E17AC9B170` records the exact CI occurrence. Minimal two-file repair head
  `fc2de822` invokes the existing guarded loopback provisioner in Flag-ON and adds a
  mutation-sensitive contract requiring both CI lanes to provision before integration.
  Restored contract coverage passes 6/6 and focused workflow coverage 61/61; fresh
  exact-head CI run 30701739419 is running. The broader six-file contract defines a
  minimal fixed NOLOGIN/NOINHERIT role, explicit SET
  membership, narrow schema/table grants, fail-closed remote/apply guards, CI-local
  provisioning, and documented shared-dev verification/rollback. Disposable local
  PostgreSQL verification passed 74/74 integration suites (610 passed, one skipped),
  focused RLS 9/9, setup contract 5/5, and mutation RED/restore GREEN. CI is running;
  no shared database or secret was touched.
- Same-owner lifecycle heartbeats renewed all claims approaching or beyond expiry:
  WI-2643, WI-2790, WI-2826, WI-2922, and WI-2939. WI-2921's fresh reclaim already has
  a future expiry. No claim was transferred to a different owner.
- WI-2958 appeared in the live BID-48 relation without a matching Brief amendment,
  increasing related rows from 41 to 42. Its external `shepherd:codex:smoke-cure`
  claim expired at 12:32 CEST; the detached worktree contains no tracked delta and no
  PR. The item overlaps and is blocked by WI-2939. FO-2090 /
  `OCC-BC2AC6B99167` records the exact governance drift. The item remains unchanged
  pending formal admission/exclusion; no silent takeover or execution occurred.
- The operator clarified that the four-WIP figure is throughput guidance, not a
  reason to leave Ready work idle while executor capacity exists. Dependency/authority
  waits do not consume practical dispatch capacity.

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
- WI-2939 — Clacks handoff 103751 corrected ownership to BID-48 only; the erroneous
  BID-39 relation and Brief entry were removed by the handing-off lane. PR #2741
  reached exact head `45cad26d0` after five review findings were fixed with mutation
  evidence and focused 41/41. Current-head CI passed 14/14; the governed gate verified
  four resolved review threads and a fresh zero-finding approval, then squash-landed
  the PR as `42609a6d`. Cosmo comment
  `3ae8bce9-1f7c-8133-bd98-001dc987bf40` records the topology and landing evidence.
  The operator authorized the revision-pinned bootstrap/canonical test against only
  the uniquely named disposable `mentomate/dev_integration` target. Two fresh
  authoritative preflights passed the non-persisted target-identity guard but failed
  read-only PostgreSQL authentication with SQLSTATE `28000`. The authorization is
  unconsumed: no bootstrap/test invocation, database/config/secret mutation, or
  shared-development, staging, or production connection occurred. The dedicated
  role/password or URL must be repaired, and `INTEGRATION_DATABASE_TARGET_ID` plus
  `DATABASE_URL_DEVELOPMENT_HOST` must be provisioned, before the preflight and
  authorized run can proceed. Redacted evidence is in
  `.workitem-artifacts/WI-2939/preflight-blocker.json`.
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
  locally, but the mandatory hook formatted one unrelated current-main line. The
  operator authorized restoring that file exactly to origin/main and amending the
  still-unpushed merge once with `--no-verify`, solely to prevent the hook from
  recreating the unrelated formatter delta (Cosmo comment
  `3ae8bce9-1f7c-81f8-83a7-001de03c8ec4`). The executor restored the unrelated file,
  pushed normal merge head `02a93cd1` without force, and exact-head CI passed all 14
  checks. The governed merge gate verified zero unresolved threads and a fresh
  zero-finding approval, then squash-landed PR #2746 as `cf9434df`. Execute-complete
  validated the corrected artifacts, set Fixed In to that landed commit, cleared the
  claim, and moved the item to Reviewing. Independent adversarial review then bounced
  it to Ready/Active: the required DATABASE_URL-only source-artifact replay still
  selected the pooled fallback, retained one owned idle backend for about 30 seconds,
  threw before DROP DATABASE, and left the scratch database behind. The new focused
  test inspects source text rather than behavior, and completion overstated repeated
  DB replay because exact-head `main` skipped both API integration steps. FO-2081 /
  `OCC-85FD83133D26` records this landed-attempt occurrence. WI-2755 is first on the
  executor frontier when WIP capacity opens; the lane is currently full.
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
- WI-2936 — Executing/Active under the live unexpired claim
  `codex:wi2936-exec:WI-2936`. Execution needed an operator ruling because the
  mandatory repo worktree script always runs Doppler `env:sync`, while the item scope
  forbids touching Doppler. The operator authorized a one-worktree exception in
  comment `3ae8bce9-1f7c-8166-8f54-001da619ca14`: create the canonical isolated
  worktree and install dependencies, skip `pnpm env:sync`, and use only existing
  local credentials without printing, committing, uploading, rotating, or remotely
  synchronizing them. The freed WI-2755 execution slot was immediately reused and
  the typed executor operated under that bounded exception. PR #2789 reached
  correction head `d6d168b1`: focused 3 suites/16 tests, targeted quality checks,
  exact-head automated review, and independent review passed. Its Flag-ON job then
  reproduced an unrelated hard-coded billing-fixture date boundary twice; FO-2083
  and FO-2084 record the two occurrences. External PR #2803 independently repaired
  that test and landed as `503f4759`. The WI branch is now cleanly merged with that
  current main at local head `d54f366b`; the six-file WI delta is byte-identical and
  focused verification remains green. A normal push is blocked because the merge
  makes the local hook select broad unrelated current-main API tests, whose setup
  rejects the machine's staging Doppler fallback. The remote branch remains
  `d6d168b1`; one explicitly authorized `--no-verify` push is awaiting operator
  disposition before exact-head CI and both reviews are retriggered. FO-2085 /
  `OCC-BE11C145C361` records the occurrence without creating a Work Item. FO-2080 /
  `OCC-894322F2C99D` records the broader setup observation without creating a WI.
- WI-2922 and WI-2923 — Ready behind explicit development-only shared mutation gates.
- Remaining shared-database, hosted-reproduction, and credential mutations retain
  their item-specific operator gates; no broad batch mandate silently widens them.
- The persistent goal remains active. Existing execution WIP is WI-2790, WI-2921,
  WI-2936, and WI-2939. WI-2755 is first on the Ready executor frontier. Other Ready
  items with explicit
  database, credential, hosted-reproduction, or worktree/Doppler gates remain held
  until their recorded authority is satisfied. PR #2741 remains fail-closed on the
  twice-reproduced WI-2826 dependency.
- Claim/lifecycle reconciliation (09:43 CEST): the live relation verifies WI-2790,
  WI-2921, WI-2936, and WI-2939 Executing under their exact existing owners with
  `Claim Expired=false`; all other non-Closed members are Ready/Active and unclaimed.

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
