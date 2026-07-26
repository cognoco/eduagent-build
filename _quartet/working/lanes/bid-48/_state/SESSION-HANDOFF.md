# BID-48 session handoff

Last reconciled: 2026-07-26 21:55 CEST

- Batch page: `3a88bce9-1f7c-8170-a3df-d40eac8c95e0`
- Shepherd: `shepherd:codex:integration-migration`
- Topology: operator-authorized combined Orchestrator/Shepherd, no Clacks.
- Status: `Running`.
- Authoritative members (27): WI-2636, WI-2639, WI-2640, WI-2643, WI-2644,
  WI-2649, WI-2667, WI-2755, WI-2790, WI-2791, WI-2792, WI-2794, WI-2795,
  WI-2797, WI-2798, WI-2799, WI-2800, WI-2801, WI-2802, WI-2804, WI-2805,
  WI-2809, WI-2810, WI-2811, WI-2812, WI-2813, WI-2815.
- Brief/relation parity: live-verified at 27 after the formal member 27 amendment.

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

## Active typed work

- WI-2810 — landed rework `2df76a91` independently bounced: retained phase is
  overwritten and reports the latest rather than AC-required first visible phase.
  Reclaimed for exact first-phase retention rework; WI-2800 remains unclaimed.
- WI-2812 — Nexus PR #330 at `89339b49`; despite two zero-finding fixed-point reviews,
  armed preflight exposed a blocking Codex P1 confirmed against live Cosmo: top-level
  `last_edited_time` is minute-rounded too. Exact transition-identity rework is active.
- WI-2813 — stale mobile-test count repair discovered from WI-2801's landed suite;
  PR #2649 at `7fd75c84` is exact-head strict green and ready with fresh CodeRabbit
  review, but the armed merge gate cannot obtain the path-excluded Claude verdict.
  It is formally blocked by external WI-2718 / PR #2581; no bypass is authorized.
- WI-2815 — draft Nexus PR #331 at `737b93d2`; one-line test-contract correction,
  exact mutation 14/1, restored focused 15/15, full Clacks 616 pass / 3 sanctioned
  skips / 0 fail. Awaiting independent fixed-point reviews and ready-state gate.

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
- WI-2800 and WI-2804 remain Ready and collision/capacity waiting.
- WI-2755 remains blocked by WI-2794; do not extend its cleanup timeout again.

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
