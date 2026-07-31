# BID-48 Integration and migration reliability — Execution Tracker

> Disposable delivery state for the operator-authorized standalone Codex shepherd.
> Cosmo and GitHub remain authoritative; this file is only the resume map.

## Charter

Drain BID-48 completely: every authoritative member and every formally admitted
in-scope finding reaches independently reviewed `Closed / Done`, then live-verify the
Delivery Batch as `Done`.

## Authority and topology

- Operator assignment: thread goal of 2026-07-26; formal Quartet commissioning is
  explicitly bypassed.
- Topology: combined Orchestrator/Shepherd seat, no Clacks. Direct Cosmo and GitHub
  polling substitutes for bus events; the earlier no-Clacks ruling remains binding.
- Shepherd identity: `shepherd:codex:integration-migration`.
- Repository `AGENTS.md`, ZDX lifecycle rules, the live Batch Brief, and later operator
  rulings outrank this tracker.
- Decision budget: reversible implementation and sequencing choices are delegated;
  shared-database mutations, membership changes, merges, and other recorded gates
  retain their named authority requirements.

## Entry gate — ratified by assignment

- Formation began with six members. The live Running relation later gained WI-2755;
  WI-2790 and WI-2791 were admitted from database/environment residue; and cross-repo
  WI-2644 was admitted when its exact merge-gate defect blocked WI-2649. WI-2792 was
  admitted from WI-2636's independent-review finding. The Brief and relation now
  agreed on eleven members before WI-2794 was formally admitted. WI-2797 and
  WI-2795 were subsequently refined and formally admitted. The remaining V2 smoke
  residue was split into WI-2798, WI-2799, and WI-2800, refined, and formally
  admitted. WI-2798 then proved and captured the independent primary-row/enrichment
  defect WI-2801, which passed DoR and was formally admitted. The hosted-smoke
  diagnostics then added WI-2802, WI-2804, and WI-2805. Diagnostic execution exposed
  three independently deliverable evidence repairs: WI-2809, WI-2810, and WI-2811.
  Each passed triage and DoR. WI-2797 re-review then exposed the same-minute reviewer
  attempt-key liveness defect WI-2812, which also passed DoR and was formally admitted;
  WI-2801's landed suite then exposed stale count claim WI-2813, and WI-2812 full-suite
  verification exposed stale governed-manifest assertion WI-2815. Both passed DoR and
  were formally admitted. WI-2804 diagnosis then exposed the distinct Mentor-return
  refresh-gate repair WI-2818, which passed DoR and formal admission; the
  Brief/relation agreed on twenty-eight members. Operator-authorized Govern recovery
  then externally admitted Ready WI-2484 to the live relation. WI-2810's bounded rerun
  exposed stale nav-shell contract WI-2822, and WI-2815's review bounces exposed the
  squash-merge evidence defect WI-2819. Both passed typed DoR and formal admission;
  the Brief and relation now agree on thirty-one members. WI-2800's diagnosis then
  exposed phase-timing repair WI-2826, which passed typed DoR and was admitted as
  member 32; live Brief/relation parity is thirty-two.
- The original six were live-verified `Ready / Active`, unclaimed, and without
  delivery PRs before dispatch.
- The operator's drain-batch goal authorizes the standard reversible entry decisions.
- Collision preflight: merged PR #2585 has no direct overlap. Excluded draft PR #2457
  is a semantic collision fence for WI-2649 and must rebase/regenerate its migration
  after the guard lands; it is not a batch member.

## Live reconciliation — 2026-07-31 08:56 CEST

- The live Brief and membership relation agree on 42 authoritative members.
  WI-2941 was captured from six expired cross-owner BID-48 claims, triaged and
  refined to DoR, then formally admitted as member 42 with Origin WI-2826. The exact
  retry duplicate WI-2942 was closed `Duplicate` of WI-2941. Verified Brief/relation
  parity is 42/42 with zero differences.
- Current lifecycle slice: 27 Closed, 11 Executing, and 4 Ready.
  Re-query Cosmo rather than deriving routing from this count.
- WI-2639 PR #2730 passed the exact-head governed gate and landed as `fee204b5`.
  Execute-complete recorded exact landed evidence; independent adversarial QA then
  verified all eight ACs, exact CI, loopback disposable-Postgres proof, governed
  merge evidence, and origin/main ancestry. The item is Closed / Done.
- WI-2800 remains honestly Ready after independent review rejected the already-landed
  `fdbe36d2` artifact: the isolated dev evidence stopped on a different 68.6-second
  sign-in failure and did not attribute the original hosted 90-second exhaustion.
  WI-2826 instrumentation plus the item-specific hosted-run authority remain required.
- WI-2790 source-repair PR #2733 passed the governed gate and landed as `70411272`.
  The item remains Executing pending the independently deliverable disposable-schema
  proof. WI-2939 draft PR #2741 is at corrected exact head `631355d5`; direct pinned
  journal replay now retains the raw RLS policies omitted by schema push alone, and
  the evidence distinguishes committed migration DML/reference rows from forbidden
  copied user data or separate seed commands. Focused/local gates are green and fresh
  hosted CI/review are green except for one unrelated legacy onboarding smoke timeout;
  the single failed-job rerun is active. No DB connection occurred; real live
  bootstrap remains explicitly operator-gated.
- WI-2941 Marketplace PR #166 is at exact head `9652d7d`; two in-scope review
  considerations were repaired and the expanded focused/full local plus hosted
  functional gates are green. Four exact-head Claude attempts aborted before a
  review turn, so the governed merge gate remains correctly closed; one further
  cooldown-bounded failed-job rerun is delegated. WI-2755 expired after capture,
  making the post-landing recovery set seven cross-owner claims. WI-2755's governed
  implementation is already landed from PR #2630 as `37b7a4e6`; all seven claims
  remain untouched pending governed landing and Nexus commissioning of WI-2941 rather
  than being impersonated or hand-edited.
- WI-2936 remains Ready pending the requested no-Doppler worktree exception.
  WI-2922 and WI-2923 remain Ready behind their exact shared-development database and
  Clerk/Doppler mutation approvals. Staging and production remain forbidden.
- Historical per-item rows below are retained as an audit trail; this reconciliation
  supersedes their stale lifecycle positions.

## Units / live slice

| WI | Item | Initial route | Current position |
|---|---|---|---|
| WI-2484 | Reconcile dev Neon notification-preferences FK after identity-v2 cutover | operator-authorized clean dev-only execution after expired-claim recovery | Executing — draft PR #2657 at `3fe6960d`; live dev catalog already correct, no DB mutation; CI pending, staging/production untouched |
| WI-2636 | Repair semantic type debt in the integration-test graph | independent executor | Executing rework — evidence pointer/content defects |
| WI-2639 | Concurrent filing calls return different shelf IDs | diagnosis first; shared-DB gate if repair required | Executing — `builder:codex:WI-2639`; operator gate |
| WI-2640 | Static subscription fixture makes integration test non-repeatable | independent executor | Closed / Done — landed `1bea527b`; independent review passed; worktrees/branches cleaned |
| WI-2643 | Integration role cannot switch for RLS isolation tests | diagnosis first; operator-owned role mutation | Executing — diagnosis complete; operator gate |
| WI-2644 | Merge gate treats superseded cancelled check as current | cross-repo blocker for WI-2649 | Closed / Done — landed `7e1670c9`, independent DoD passed |
| WI-2649 | Guard enum `ADD VALUE` migrations with `IF NOT EXISTS` | independent executor; before WI-2667 | Closed / Done — landed `6e9f9c53`; independent DoD passed |
| WI-2667 | `--fast` can push DDL to shared dev Neon | serialize after WI-2649 | Closed / Done — landed `9f8693a2`; independent DoD passed |
| WI-2755 | Eliminate forced-drop socket race in migration replay test | isolated executor; no ambient staging tests | Executing / blocked by WI-2794 — stale PR retired; claim renewed |
| WI-2790 | Make canonical API integration target portable on Lancre | dedicated non-staging DB/operator provisioning gate | Executing — PR #2638 head `e476bccb3`; all completed checks green, aggregate `main` pending, operator live-proof gate retained |
| WI-2791 | Restore curriculum indexes missing despite ledger entries | forward-only migration; staging apply operator-gated | Closed / Done — landed `e91e6b92`; independent re-review passed |
| WI-2792 | Make cosmo:qa evidence pointers revision- and path-exact | canonical ZDX-Marketplace; adversarial review | Closed / Done — landed `3d42ae49`; cross-repo re-review passed |
| WI-2794 | Attribute lingering scratch-database backends before ownership repair | diagnostic prerequisite for WI-2755 | Executing — draft PR #2637 at `8345e9e52`; strict CI/review running |
| WI-2795 | Correlate staging Worker 1101 seed failures with retained Workers Logs | diagnostic Spike; Workers Logs/repro operator gate | Executing — three sanitized evidence comments preserved; expanded Workers Logs/repro authority gate retained; database variants externally owned by BID-33 WI-2788 |
| WI-2797 | Eliminate returning-learner transcript observation race in V2 E2E | independent executor; no retry/timeout weakening | Closed / Done — landed `8510ef4f`; exact RGR re-review passed; worktrees/branches cleaned |
| WI-2798 | Diagnose V2 Account non-owner subject-row readiness lag | diagnostic Spike; no shared smoke-spec collision | Executing — cause class preserved; exact trace attribution remains operator-gated; repair WI-2801 active |
| WI-2799 | Diagnose V2 zero-state Mentor cold-start readiness lag | diagnostic Spike; serialize behind overlapping V2 smoke work | Closed / Done — diagnosis `f42c4a6e` plus landed WI-2809 evidence passed independent review; cleanup complete |
| WI-2800 | Diagnose V2 Account owner journey 90-second budget exhaustion | diagnostic Spike; serialize behind overlapping V2 smoke work | Executing — PR #2655 at `ac726877`; CI green, fixed-point review requested; durable diagnosis proves shared-budget exhaustion but retained evidence cannot identify the slow phase |
| WI-2801 | Render available V2 subject rows while enrichment queries are pending | independent TDD repair; no shared-smoke overlap | Closed / Done — landed `69811e20`; exact RGR re-review passed; cleanup complete |
| WI-2802 | Diagnose J-01 pushed-content Account chrome readiness lag | diagnostic Spike; serialize behind overlapping hosted-smoke work | Executing — durable bounded diagnosis; repair WI-2810 admitted; exact phase remains unobservable until repair |
| WI-2804 | Diagnose V2 post-wrap-up Mentor-return navigation stall | diagnostic Spike; serialize behind overlapping hosted-smoke work | Executing / blocked by WI-2718 — PR #2653 at `dd006d86` is otherwise green; docs-only Claude verdict remains impossible under the armed gate |
| WI-2805 | Diagnose V2 first-session close-to-wrap-up readiness failure | diagnostic Spike; serialize behind overlapping hosted-smoke work | Executing — durable branch diagnosis; exact hosted branch remains unobservable until repair WI-2811 |
| WI-2809 | Observe `/now` semantic readiness in V2 Mentor cold-start smoke | bounded evidence/test repair | Closed / Done — landed `8d83ecf3`; independent review passed; cleanup complete |
| WI-2810 | Instrument J-01 Account readiness phases before avatar assertion | bounded evidence/test repair | Executing / blocked by WI-2822 — PR #2652 head `3d797a1e`; rerun exposed distinct stale nav-shell doorway contract, no third rerun |
| WI-2811 | Preserve V2 first-session close-boundary evidence | bounded evidence/test repair | Closed / Done — landed `b6a2206a`; independent review passed; cleanup complete |
| WI-2812 | Make reviewer attempt keys unique across same-minute pause and resume | Nexus reviewer-liveness repair | Executing rework — draft PR #330 at `b875c83a`; persisted filtered-poll visibility edge with mutation proof, focused 90/90 and full Clacks green; fresh review running |
| WI-2813 | Refresh mobile test-count claim after WI-2801 suite expansion | bounded documentation/CI repair | Executing / blocked by WI-2718 — PR #2649 at `7fd75c84` exact-head green/ready; armed gate cannot obtain path-excluded Claude verdict |
| WI-2815 | Align reviewer pin-manifest revision assertion with production spec | bounded Nexus Clacks test-contract repair | Ready / blocked by WI-2819 — landed `689d5f56`; two reviews accepted code but host gate checks CI on squash instead of exact PR head |
| WI-2818 | Prevent failed Now-feed refresh from swallowing first Mentor-return Back | bounded session-boundary repair from WI-2804 | Closed / Done — landed `cfeeaed7`; independent review passed with zero findings; worktree/local/remote branch cleaned |
| WI-2819 | Verify strict-green PR head when Fixed In is a squash merge commit | ZDX Marketplace reviewer-preflight repair plus Nexus pin surface | Executing — admitted member 31 and claimed; exact fail-closed mapping variants and deployment boundary retained |
| WI-2822 | Prevent supporter self-learning doorway bleed-through after support-hub Back | bounded nav-shell test-contract repair | Executing — draft PR #2658 at `c0002155`; local mutation/focused/named Playwright proof green, hosted run-smoke red; original executor is classifying without blind rerun |
| WI-2826 | Instrument V2 Account owner journey phase timing | credential-safe E2E diagnostic instrumentation | Executing — admitted member 32 and dispatched; local deterministic coverage only, hosted rerun remains operator-gated |

Membership is dynamic: re-query the relation and Brief at every consequential
boundary. Newly discovered, independently deliverable residue is captured and routed
for formal membership disposition before execution.

### Discovered scope disposition

- WI-2796 — the attempt-2 login-insert capture was authoritatively triaged Closed /
  Duplicate of WI-2795; both evidence variants remain preserved on the canonical.
- WI-2798 was narrowed to the non-owner subject-row readiness diagnostic, refined,
  admitted, and dispatched. Its originally bundled owner timeout was split into
  WI-2800. WI-2799 was retyped/refined as a Mentor readiness diagnostic and admitted.
- WI-2797 proof attempt 3 produced WI-2802 plus the split WI-2804/WI-2805, all
  refined/admitted. WI-2803 was authoritatively Closed Duplicate of WI-2801.
  Mentor and non-owner symptoms were deduplicated to WI-2799/WI-2798;
  seed/reset/login variants remain externally owned by BID-33 WI-2788.
- Diagnostic execution of WI-2799, WI-2802, and WI-2805 produced repair atoms
  WI-2809, WI-2810, and WI-2811. Capture-time similarity linking did not establish
  duplicate identity: diagnostic Spikes and their independently deliverable evidence
  repairs have different completion contracts. All three passed triage/refine and
  were formally admitted as members 22-24.
- WI-2797's same-minute capacity pause and sanctioned resume exposed WI-2812. Exact
  launch-ledger evidence proved a fresh review attempt was suppressed by the
  minute-rounded Modified key; no duplicate existed. The Bug passed DoR and was
  formally admitted as member 25.
- WI-2801's expanded suite exposed WI-2813's stale mobile-count claim. It passed DoR,
  was admitted as member 26, and reached a strict-green PR; external WI-2718's
  documentation-only review deadlock remains its formal merge blocker.
- WI-2812 full Clacks verification exposed WI-2815: the recovery-overlay test asserted
  superseded revision `WI-2652-r1` while the governed production specification declares
  `OPERATOR-20260726-COSMOGRAPH-PATH-r1`. Dedup classified WI-2250 as a distinct
  production-runtime sibling. WI-2815 passed DoR, was admitted as member 27 with origin,
  Project, Clacks Workstream, Sprint, and relation context, and was dispatched.
- WI-2804's source-and-hosted-evidence diagnosis exposed WI-2818. The exact
  actor/profile/epoch Now-feed refetch gate swallows the first Mentor-return Back on
  rejection and can stall on non-settlement. Dedup classified WI-2234 as a distinct
  release-coverage sibling; success/rejection/non-settlement Bug DoR passed and the
  item was formally admitted as member 28 with origin and relation context.
- WI-2815's two lifecycle bounces exposed WI-2819. Typed inspection established the
  exact Marketplace preflight, GitHub mapping, direct-commit and fail-closed variants,
  plus the Nexus pin/deployment surface. It passed Bug DoR and was admitted as member
  31. WI-2815 is formally blocked by it; no third futile completion attempt is authorized.
- WI-2810's single bounded strict-CI rerun exposed WI-2822. Typed refinement proved
  the support-hub test fails before either Back action because its obsolete absence
  premise conflicts with WI-2243's intentional no-Me doorway. WI-2822 passed DoR, was
  admitted as member 30, and is executing; WI-2810 will not blind-rerun around it.
- WI-2800's durable diagnosis captured WI-2826 for missing Account-owner phase timing.
  Typed refinement established credential-safe phase variants and collision fences;
  it passed DoR, was admitted as member 32, and is executing without hosted rerun authority.

## Sequence and collision policy

1. Initial frontier: WI-2640, WI-2649, WI-2636, and diagnosis-only WI-2639.
2. WI-2667 follows WI-2649 because both touch change-class tooling.
3. WI-2649 landing is hard-blocked by WI-2644; raw merge and dummy commits are banned.
4. WI-2643 may proceed through read-only diagnosis, but no shared Neon role or
   privilege mutation occurs without explicit operator authority.
5. No ambient integration DB test runs: Lancre's current development/Doppler target
   was proven to be shared staging. Only explicitly isolated disposable DBs are valid.

## Lifecycle gates

- Claim immediately before executor work and verify a future `Claim Expires`.
- Work occurs in isolated WI worktrees; executors never merge or close.
- Strict-green PR plus applicable merge authority is required before `/cosmo:merge`.
- `/cosmo:execute complete` runs only after the landed commit is on `origin/main`.
- Independent reviewer owns disposition and Close; a bounce returns to Ready and is
  reclaimed and redispatched.

## Current position

Active typed work is WI-2819's squash-evidence repair, WI-2822's test-contract repair,
and WI-2826's credential-safe phase instrumentation. WI-2484 is in draft PR #2657 CI;
WI-2818 is independently Closed / Done and cleaned; WI-2812 is in typed rework after
a valid filtered-poll P1.
WI-2813 remains exact-head green but externally blocked by WI-2718's
documentation-only review deadlock. WI-2799 and WI-2809 have independently closed
Done and their worktrees/branches are cleaned. Live membership is 32 with 12 Closed,
19 Executing, and one Ready (blocked WI-2815).
WI-2755 is blocked by WI-2794, and its attempted host
diagnostic runner stopped before DB access because no sanctioned injection was
available.
WI-2636 evidence PR #2632 remains blocked by external WI-2718 / WI-2725; capture
WI-2793 was formally Closed Duplicate. WI-2639 and WI-2643 remain at their explicit
operator gates.

## Change log

- 2026-07-26 — Live membership, DoR, collision fences, existing Git artifacts, and
  authority gates reconciled; entry gate recorded.
- 2026-07-26 — Batch moved Ready→Running and the three available isolated executor
  slots were claimed and dispatched; each lease was live-verified non-expired.
- 2026-07-26 — WI-2790 captured from WI-2640 validation, deduped, triaged, refined,
  and formally admitted. A direct poll then found externally added Ready WI-2755;
  the Brief was reconciled to the eight-member live relation.
- 2026-07-26 — WI-2649 opened draft PR #2620; its slot was immediately reused for
  premise-first WI-2639 execution.
- 2026-07-26 — WI-2639 proved ledger/schema drift and shared-staging identity without
  mutation. WI-2791 captured/refined/admitted for sibling indexes; WI-2790 was
  reopened and corrected to require a dedicated non-staging database.
- 2026-07-26 — Armed merge refused strict-green PR #2620 on a superseded cancelled
  review attempt. Existing WI-2644 was triaged/refined/admitted as the hard blocker,
  then claimed in the canonical ZDX-Marketplace repo. WI-2755 was also dispatched.
- 2026-07-26 — WI-2644 PR #158 reached nominal green but bounced on a fresh Codex P1:
  same display-name checks from distinct producers must not be collapsed. WI-2649
  PR #2620 likewise has an unresolved in-scope SQL-comment lexer finding. WI-2790
  and WI-2791 were claimed and dispatched in the freed executor slots.
- 2026-07-26 — WI-2755 opened ready PR #2626 after focused and full non-DB local
  gates; disposable-Postgres CI is running. WI-2640 PR #2622 bounced because its
  dirty case did not seed the original static ID and its variants shared an org tag.
- 2026-07-26 — WI-2636 PR #2624 reached 13/13 strict green with a fresh zero-finding
  Claude approval and no threads; the armed gate squash-merged `b0c95c7f`, and
  `/cosmo:execute complete` moved the item to Reviewing.
- 2026-07-26 — WI-2755 PR #2626 reached strict green and landed via the armed gate as
  `4dc483b2`; WI-2644 P1 rework reached strict green and landed as `7e1670c9`.
  Both passed execute-complete and moved to Reviewing. The landed producer-aware
  gate is now the sanctioned merge implementation for subsequent EduAgent PRs.
- 2026-07-26 — Independent source-artifact QA bounced WI-2755: all test bodies passed,
  but one scratch-database backend remained past the fixed ten-second deadline, so
  teardown threw and left the database. This is in-scope rework, not a new item.
- 2026-07-26 — Canonical independent review passed WI-2644's DoD and closed it Done;
  the batch gate and WI-2649 landing dependency are cleared.
- 2026-07-26 — WI-2790's post-rebase `check-change-class --run --fast` misdiffed
  against stale local `main`, classified 461 files, and invoked `db:push:dev`.
  The executor interrupted at the pre-apply prompt without accepting a plan and then
  interrupted `db:generate:dev` (exit 130). Further DB-capable commands are halted;
  the reproduction is recorded on existing batch member WI-2667.
- 2026-07-26 — WI-2636 independent review bounced revision-inexact evidence and
  missing disposable-CI completion evidence. The systemic same-basename QA false
  positive was captured as WI-2792, deduped, triaged/refined to DoR, corrected to
  the canonical ZDX project/workstream, and formally admitted as member eleven.
- 2026-07-26 — WI-2636 evidence-only PR #2632 exposed the known docs-review deadlock.
  New capture WI-2793 was deduplicated and formally Closed as Duplicate of executing
  WI-2718; WI-2636 now records the external WI-2718→WI-2725 dependency chain.
- 2026-07-26 — WI-2649 PR #2620 landed through the producer-aware gate as
  `6e9f9c53`, execute-complete passed, and global independent review claimed it.
  WI-2667 was immediately claimed and dispatched, clearing the former serialization
  wait while preserving WI-2790's publication dependency.
- 2026-07-26 — WI-2755's second independent source-artifact review reproduced the
  persistent backend after the revised 30-second wait and bounced it to Ready again.
  The timeout extension is rejected as the repair mechanism.
- 2026-07-26 — WI-2792 PR #159 reached nominal green, but exact-head Codex review
  found that the verifier accepts empty or malformed claim arrays. The unresolved P2
  is in-scope rework and blocks merge despite green checks.
- 2026-07-26 — Global independent review accepted WI-2649 at landed `6e9f9c53` and
  closed it Done. WI-2755's immutable evidence runner confirmed that the surviving
  backend is unattributed by the current implementation; rework was immediately
  reclaimed and redispatched to instrument identity and repair ownership/release.
- 2026-07-26 — Closed-item worktrees and obsolete local/remote topic branches for
  WI-2644 and WI-2649 were removed after verifying no tracked unpublished changes;
  their merged revisions remain preserved on the respective base branches.
- 2026-07-26 — WI-2667 published draft PR #2634 at `b84729f6`: the exact 461-file
  stale-main case is regression-covered, DB/Doppler actions are no longer fast, and
  no database-capable command was run. WI-2755 published attribution-only draft PR
  #2635 at `2cff248c`; an independent immutable host run was dispatched before any
  ownership/release mechanism is selected.
- 2026-07-26 — WI-2791 landed through the armed gate at `e91e6b92` and WI-2792 at
  `3d42ae49`; both passed execute-complete and entered Reviewing. A single independent
  reviewer was dispatched sequentially across the two non-colliding repositories.
- 2026-07-26 — The WI-2755 diagnostic runner found no sanctioned reviewer-host DB
  injection and stopped before access. Static evidence supports a pooler-shaped URL,
  but no ownership repair will be inferred without the unique application-name trace.
- 2026-07-26 — WI-2794 was captured from the independently deliverable WI-2755
  attribution prerequisite, live dedup found no canonical item, and triage/refine
  passed DoR. A formal Brief/relation amendment admitted it as member twelve and
  recorded WI-2755 blocked by WI-2794.
- 2026-07-26 — WI-2640 landed through the armed gate at `797a6974` and passed
  execute-complete into Reviewing. WI-2791 independent review bounced exactly one
  missing durable pass→disable→fail→restore→pass evidence sequence; an evidence-only
  executor was dispatched with staging and dummy commits forbidden.
- 2026-07-26 — WI-2640 global host review reproduced a deeper variant: when
  `sub_webhook_001` already exists, the dirty-test setup itself collides before the
  UUID-backed fixture runs. The item bounced to Ready for idempotent/reused residue
  setup without deleting unrelated rows.
- 2026-07-26 — WI-2640 PR #2636 captured the exact host variant in disposable CI:
  the dirty case alone failed on existing `sub_webhook_001`. Minimal head `890e9aa75`
  removed only the second unconditional insert while preserving idempotent find/create,
  static-ID assertion, UUID target, distinct tags, and unrelated-row safety.
- 2026-07-26 — WI-2791 evidence rework ran the landed revision on disposable loopback
  PostgreSQL: green, scratch-only removal of both index statements reproduced the
  missing-index/uniqueness symptom, byte-exact restore returned green. The durable
  evidence passes complete validation; same-Fixed-In completion moved it to Reviewing.
- 2026-07-26 — WI-2792 performed the equivalent exact green→disable validator→two
  matching false-positive failures→restore→green cycle, corrected its stale caveat,
  and passed same-Fixed-In completion back to Reviewing. The independent dual reviewer
  was redispatched across WI-2791 and WI-2792.
- 2026-07-26 — Independent re-review accepted WI-2791's exact-revision RGR evidence,
  revalidated landed ancestry and guards, and closed the item Done without any shared
  staging application. Its topic worktree/branch and clean detached RGR clone were
  removed after closure.
- 2026-07-26 — WI-2794 produced a clean credential-free local commit `83b95b201`,
  including current-main WI-2791 caller wiring. Publication is formally blocked by
  WI-2667; the executor handed back without running or bypassing the unsafe hook.
- 2026-07-26 — Cross-repository independent re-review accepted WI-2792's corrected
  RGR/caveat evidence and closed it Done. Its worktree and obsolete local/remote
  branch were removed after verifying no tracked unpublished changes.
- 2026-07-26 — WI-2667 passed strict green and the producer-aware armed merge gate,
  landed at `9f8693a2`, completed against the landed revision, and entered independent
  review. That landing releases safe publication work for WI-2790 and WI-2794.
- 2026-07-26 — Independent review accepted WI-2667 and closed it Done. Its obsolete
  pre-P2 dirty worktree, local/remote branch, and temporary publication clone were
  removed after confirming the residual delta was superseded by the landed contract.
- 2026-07-26 — WI-2794 rebased cleanly to `8345e9e52` on the WI-2667 landing. Its
  first advisory classifier still saw stale local `main`; the executor is reconciling
  an explicit supported base before any hook, push, prompt, database, or Doppler work.
- 2026-07-26 — WI-2640's repaired head passed the target Flag-ON suite (152 suites,
  1161 tests). A one-line forced-revert sensitivity head is running to prove the dirty
  variant returns to the exact static-ID collision before the executor restores GREEN.
- 2026-07-26 — WI-2790 rebased its unpublished change onto the WI-2667 landing at
  `69628286d`; the focused launcher is 11/11 green. Full script tests exposed two
  stale direct-command routing assertions that are being updated to the guarded launcher.
- 2026-07-26 — WI-2794 published correctly attributed draft PR #2637 at `8345e9e52`;
  normal hooks classified exactly six files without prompt/eval, database, or Doppler
  work. The superseded WI-2755 draft PR #2635 was closed, its stale Cosmo PR pointer
  cleared, and WI-2755's same-owner claim renewed while it remains blocked.
- 2026-07-26 — WI-2790 corrected its two stale routing assertions, published draft
  PR #2638 at `43511c80b`, and entered strict CI/review. The dedicated non-staging
  live-proof/operator provisioning portion of its AC remains an explicit gate.
- 2026-07-26 — WI-2640 forced-revert head `56d3694bd` reproduced the exact dirty-only
  `sub_webhook_001` uniqueness collision (1 failed / 1160 passed). Final restored head
  `abb16a952` passed normal local hooks and is in strict CI; Cosmo now points to PR #2636.
- 2026-07-26 — WI-2790 exact-head review found internal `--nx` arguments were silently
  dropped. Head `a034a5302` now refuses them, documents the intentional double safety
  check, and adds RED→GREEN coverage (1/11 failed, then 12/12 passed). Its three-variant
  RGR is durable on PR #2638; no credentialed database claim was made.
- 2026-07-26 — Two distinct PR #2637 staging seed failures were captured as WI-2795
  and WI-2796. Triage consolidated the incident family under canonical WI-2795 and
  closed WI-2796 Duplicate; WI-2795 remains outside membership pending typed root-cause
  refinement, DoR, and a formal Brief/relation amendment.
- 2026-07-26 — PR #2638's unrelated smoke hard failure maps directly to already-active
  WI-2239 (V2 Journal paper trail E2E); the accompanying WI-2234 returning-learner
  case passed on retry. No duplicate BID-48 capture or silent membership change was made.
- 2026-07-26 — Because the WI-2234 returning-learner case passed only on retry after
  WI-2234 was already Closed / Done, residual WI-2797 was captured and triaged to
  Backlog for typed root-cause refinement; membership remains pending formal disposition.
- 2026-07-26 — The final authorized PR #2637 rerun remained red: active WI-2239 was
  hard-red, while Account owner/non-owner and zero-state Mentor cases were flaky.
  Existing WI-2239 received the evidence; residual WI-2798 and WI-2799 were captured
  and triaged without a membership change. No further reruns are authorized.
- 2026-07-26 — WI-2790 exact-head review found IPv6 loopback normalization and an
  overbroad local-database marker. Head `e476bccb3` fixes both with RED 12/2 → GREEN
  14/0 evidence; review threads are resolved and fresh strict CI is running.
- 2026-07-26 — The live BID-48 Brief now formally records WI-2239 as an external
  strict-green release edge: it remains owned by Running BID-19, so BID-48 monitors
  its closure and preserves evidence without cross-batch takeover. Membership stays 12.
- 2026-07-26 — WI-2797's typed surface analysis established the missing transcript
  response synchronization root cause and bounded its variants. Refine promoted it to
  Ready; a formal Brief/relation amendment admitted it as member 13 and it was dispatched.
- 2026-07-26 — WI-2795 correlation proved two attempt-2 database variants already
  owned by WI-2788 and isolated the two Worker 1101 Rays as an unresolved telemetry
  class. It was narrowed to a DoR-ready diagnostic Spike, formally admitted as member
  14, and dispatched; Workers Logs/read-or-reproduce authority remains explicit.
- 2026-07-26 — WI-2640 exact-head review exposed a lookup-then-insert race across
  concurrent real-DB runs. Intentional strengthened RED `9c194c99a` is queued before
  an advisory-lock GREEN fix; the review thread remains correctly unresolved.
- 2026-07-26 — WI-2797 published draft PR #2640 at `78cf2550` with a pre-click exact
  transcript-response waiter, ordered event-identity/content checks, phase diagnostics,
  and deterministic mutation RED→GREEN evidence. Hosted strict-green evidence remains
  in progress; the item stays Executing.
- 2026-07-26 — Direct membership polling reconfirmed 14 Brief/relation members and
  valid lifecycle combinations. Same-owner claims for WI-2636, WI-2639, WI-2640,
  WI-2643, WI-2755, WI-2790, and WI-2794 were renewed through at least 20:26 CEST;
  WI-2795 and WI-2797 also hold future executor claims.
- 2026-07-26 — WI-2795 preserved three sanitized telemetry-correlation comments and
  stopped honestly at the authority boundary: the current Cloudflare token cannot
  query exact Ray logs or Workers Observability. The Brief now records WI-2788 as a
  colliding external edge owned by Running BID-33; membership remains 14.
- 2026-07-26 — Typed refinement ruled WI-2798's owner and non-owner observations
  independently deliverable. WI-2798 was narrowed/retyped to a non-owner diagnostic;
  WI-2799 was retyped to a Mentor readiness diagnostic; owner attribution was captured
  as WI-2800. All three passed Assisted Spike DoR and were formally admitted as
  members 15-17; Brief/relation parity is 17.
- 2026-07-26 — WI-2797 hosted proof run 2 reproduced WI-2798 on unrelated exact head
  `78cf2550` (1 flaky / 15 passed; legacy 24 passed) while returning-learner stayed
  clean. The evidence was deduplicated onto WI-2798, which was claimed/dispatched for
  isolated non-colliding diagnosis; WI-2799 and WI-2800 remain collision-waiting Ready.
- 2026-07-26 — WI-2798 correlated repeated exact misses with clustered route 499→200
  evidence and the aggregate-loading seam, then captured WI-2801. Root triage/refine
  confirmed no duplicate and passed Bug DoR; a formal amendment admitted member 18
  and dispatched it for non-colliding TDD. WI-2798 remains Executing at the exact
  trace/Ray attribution authority boundary.
- 2026-07-26 — WI-2797 proof attempt 3 generated three exact captures. Typed surface
  review closed WI-2803 Duplicate of WI-2801 and split WI-2804 into post-wrap-up
  Mentor-return navigation plus new WI-2805 close-to-wrap-up readiness. WI-2802,
  WI-2804, and WI-2805 passed DoR and were formally admitted as members 19-21;
  Brief/relation parity is 21.
- 2026-07-26 — WI-2640 PR #2636 passed the armed gate and squash-landed at
  `1bea527b`; WI-2797 PR #2640 likewise passed at `8510ef4f` after three exact
  zero-retry observations and a final V2 16/16 + legacy 24/24 run. Both are now in
  landed execute-complete finalization; neither has been self-reviewed or closed.
- 2026-07-26 — Independent review accepted WI-2640 at `1bea527b`, closed it Done,
  and its obsolete worktrees/branches were removed. WI-2797 review instead bounced
  one valid evidence-only finding: the durable record lacked an exact original-symptom
  RED→GREEN→revert cycle. It was reclaimed for bounded evidence rework.
- 2026-07-26 — WI-2801 PR #2642 reached exact-head strict green and was marked ready
  for a fresh landing review. WI-2799 published diagnosis PR #2643 at `f401a388`.
- 2026-07-26 — WI-2799, WI-2802, and WI-2805 diagnostics captured WI-2809, WI-2810,
  and WI-2811. Shepherd adjudication rejected diagnostic-versus-repair duplicate
  identity; all three passed triage/refine, the Brief and relations were formally
  amended, and live parity was verified at 24 members. WI-2810 and WI-2811 were
  immediately dispatched; WI-2809 followed as soon as WI-2797 released the colliding
  V2 surface.
- 2026-07-26 — WI-2797's first sanctioned Standard-fallback resume occurred inside
  the same Notion Modified minute as its Adversarial-capacity pause, so the durable
  watcher key suppressed the fresh attempt. WI-2812 captured the exact liveness bug,
  passed triage/refine, and was formally admitted as member 25. A later-minute
  sanctioned resume minted a distinct key and global independent re-review launched.
- 2026-07-26 — Global independent re-review accepted WI-2797's exact RGR evidence and
  closed it Done at landed `8510ef4f`. Three obsolete clean/ignored-only worktrees,
  two local branches, and the remote producer branch were removed; the landed commit,
  PR evidence, and Cosmo record remain durable.
- 2026-07-26 — WI-2809 landed through the armed gate as `8d83ecf3`; its held
  authenticated `/now` evidence completed WI-2799's diagnostic contract. Global
  independent review closed both Done, and their clean worktrees/local/remote topic
  branches were removed while preserving PRs and landed commits.
- 2026-07-26 — WI-2810's valid review bounce was repaired at PR #2651 head `40e952c5`.
  Exact mutation/focused evidence, 13 strict checks, fresh approval, zero threads, and
  armed-gate dry-run passed; the gate squash-landed `2df76a91` for producer completion.
- 2026-07-26 — WI-2812 opened Nexus PR #330 at `89339b49`; focused verification is
  154/154 and two independent fixed-point reviews reported zero findings. Its full
  Clacks run exposed distinct stale-assertion residue WI-2815, which passed dedup,
  triage, and Bug DoR, was formally admitted as member 27 with Brief/relation parity,
  and immediately dispatched in a non-colliding Nexus worktree.
- 2026-07-26 — Armed-gate preflight refused WI-2812 PR #330 on a newly surfaced Codex
  P1. Live Cosmo confirmed top-level `last_edited_time` is minute-rounded exactly like
  `Modified`, invalidating the proposed attempt discriminator and its synthetic-ms
  tests. The thread remains unresolved and exact transition-identity rework is active.
- 2026-07-26 — Independent source-artifact review bounced landed WI-2810 `2df76a91`:
  the sampler overwrites every non-unknown observation and reports the latest phase,
  while AC-1 requires the first visible phase. The executable auth→profile reproduction
  was accepted; WI-2810 was reclaimed for bounded first-phase retention rework.
- 2026-07-26 — WI-2804's bounded diagnostic committed `790ab795` and proved the
  returnTo target is correct while the exact Now-feed refresh gate swallows Back on
  rejection or stalls on non-settlement. Repair WI-2818 was captured, deduped from
  sibling WI-2234, refined through mutation-sensitive Bug DoR, and formally admitted
  as member 28 with verified Brief/relation parity.
- 2026-07-26 — WI-2815 landed through the armed Nexus gate as `689d5f56`; independent
  review accepted the one-line repair, mutation, focused, and full-suite evidence but
  bounced AC-6 because completion recorded only the squash revision. The item was
  reclaimed for evidence-only binding of exact green PR head `737b93d2` to the merge.
- 2026-07-26 — A second WI-2815 review again ignored explicit PR-head evidence and
  inspected only skipped checks on the squash commit. Systemic host-gate defect WI-2819
  was captured with no duplicate, routed to Backlog for typed DoR surface preflight,
  and recorded as WI-2815's formal blocker.
- 2026-07-26 — WI-2810's single bounded CI rerun failed on an unrelated support-hub
  doorway assertion, not the J-01 repair. WI-2822 captured the exact original+retry
  symptom and sibling relations, routed to Backlog for typed root-cause refinement;
  no third CI rerun was authorized.
- 2026-07-26 — Direct authoritative polling detected externally added WI-2484 after
  operator-authorized Govern recovery released its expired historical claim, found no
  surviving branch/PR/worktree, rechecked zero-gap DoR, and normalized Ready/Active for
  clean dev-only execution. The live relation rose to 29; the Brief was formally
  reconciled to the operator disposition without reusing expired execution state.
