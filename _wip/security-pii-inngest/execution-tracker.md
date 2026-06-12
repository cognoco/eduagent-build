# PRG-13 · Background-Job Security — execution tracker

> **THE entry point for this workstream.** Shepherd-owned once spawned.
> Umbrella row: `_wip/umbrella-program/program-roster.md` PRG-13. Charter:
> `_wip/umbrella-program/activation-planning.md` §2 PRG-13. Full finding text:
> `docs/audit/2026-05-29-full-audit/L-gap-delta.md` (label `security-pii-inngest`).

**Activated:** 2026-06-11 (fourth run of the §2.1 recipe) · **Operator:** Jorn ·
**Shepherd:** PRG-13 shepherd session (spawn pending kickoff) ·
**Cosmo Workstream:** "Inngest Security & Correctness" (`37c8bce9-1f7c-81d7-9377-e79356055ff3`)

## 1. Charter (one paragraph)

All 6 `security-pii-inngest` findings from the 2026-05-29 full audit remediated:
minors' PII out of memoized Inngest step returns and event payloads (F-028, F-091,
F-090), env-binding isolation across concurrent runs in one isolate (F-094), and two
background-job correctness bugs (F-162 cursor skip, F-174 grade-before-claim). Gate:
**G4 fired 2026-06-11** (W1-inngest-wiring + W3 landed) — both charter open questions
resolved at activation (below).

## 2. Unit map

| Unit | Name | Findings | Priority | Order |
|---|---|---|---|---|
| **WI-665** | WP-S13-pii-step-state — minors' PII out of remaining step returns + event payloads | F-028 (2 remaining legs) · F-091 · F-090 | P1 | 1 |
| **WI-666** | WP-S13-config-correctness — env-binding isolation + 2 correctness bugs | F-094 · F-162 · F-174 | P2 | 2 |

Units are independent (different files, no shared surface) — parallel-safe if the
shepherd chooses, but small enough to run serially.

## 3. Slice-time decisions (activation, 2026-06-11)

1. **Charter OQ1 — F-028/F-091 subsumption scan vs WI-578 (WP-W3-pii-step-state, PR
   #933): PARTIAL.** Verified against PR #933's file list AND live code:
   - **F-028 shrinks 3 functions → 2.** The `freeform-filing` leg is ALREADY FIXED —
     transcript rehydrated from DB inside the `retry-filing` step closure, never
     serialized into Inngest state (explicit PII-egress comment,
     `freeform-filing.ts:170-172`). Executors must replicate that closure pattern,
     not re-fix it. Still LIVE: `auto-file-session` (`fetch-transcript` step return,
     `auto-file-session.ts:71`) and `topic-probe-extract` (`load-transcript` step,
     `topic-probe-extract.ts:176`).
   - **F-091 fully LIVE:** `extract-signals` step return (`topic-probe-extract.ts:184`).
   - WI-578 landed the sanctioned fix pattern **and** the `pii-scrub.ts` service +
     `pii-scrub.guard.test.ts` guard pattern — WI-665 extends, never reinvents.
   - F-090/F-094/F-162/F-174 were not touched by the rewrite (out-of-radius per
     charter); executors re-verify each finding fresh-grep at plan time regardless.
2. **Charter OQ2 — F-162 stays in PRG-13** (not exported to PRG-11): it is a tiny,
   self-contained fix; exporting would orphan it for weeks behind PRG-11's
   human-led decomposition.

## 4. Inherited mechanisms (wire from the start)

- **Autonomous review loop:** verify reviewer-watcher coverage for Workstream
  "Inngest Security & Correctness" on arrival (multi-workstream config array,
  `_wip/identity-foundation/review-watcher-v3.ts`; extension recipe in
  `_wip/identity-foundation/review-loop-productization-handoff.md`). Items the
  shepherd moves to Reviewing are closed (or bounced) autonomously.
- **Executor protocol:** dispatch build work via
  `_wip/identity-foundation/executor-protocol.md` (+ example). Mandatory plan-phase
  stop before code — that stop is what caught the IF cutover gap; treat it as
  load-bearing.
- **Cosmo lifecycle:** claim before execute · complete → Reviewing · never
  self-close · WP DoR bridge (`refine --to-ready`) before claiming.
- **Supervision profile (charter):** medium — WI-665's PII data-handling changes get
  review attention even when mechanical; WI-666 is agent-routine.
- **Landing checks:** adjudicate any red main at CI *step* level before bouncing or
  refuting (2026-06-11 incident lesson: run-level red conflated three independent
  failures). Known ambient reds: Deploy fails on every push (chronic staging
  IDEMPOTENCY_KV gap — captured as WI-664, NOT yours to fix).

## 5. Execution state

- 2026-06-11 — Activated. Workstream + WI-665/WI-666 created (`Stage=Backlog`).
  Subsumption scan done (§3). Shepherd kickoff prompt handed to operator.
- 2026-06-11 — Shepherd arrived. Review watcher wired for this workstream
  (`review-watcher-v3.ts` 4th config entry, commit `9a314f736`; watcher restarted,
  baseline confirms coverage). Restart-gap repair: WI-625 (L10n & A11y Mobile)
  entered Reviewing during the ~45s watcher restart window — its review agent was
  launched manually with the identical prompt contract.
- 2026-06-11 — WI-665 brought through DoR bridge to `Stage=Ready`. Bundle brief
  authored on the WP page; 4 children linked as absorbed provenance (ZDX-ADR-0001):
  WI-638 (F-028 leg 1, auto-file-session — pre-existing capture from the WI-578
  wave, adopted; dedup judge flagged it at 0.95), WI-667 (F-028 leg 2,
  topic-probe-extract load-transcript — narrowed from the initial capture to avoid
  overlap with WI-638), WI-668 (F-091), WI-669 (F-090). Execution Path=Assisted.
  Executor dispatched (wi665-executor, plan-phase stop enforced).
- 2026-06-11 — WI-666 brought through DoR bridge to `Stage=Ready` (brief authored;
  children WI-670 (F-094), WI-671 (F-162), WI-672 (F-174) linked as absorbed
  provenance; Execution Path=Assisted). Dedup adjudication: capture judge linked
  WI-672 to WI-234 (Closed, PR #415, retention-data.ts) as duplicate@0.85 —
  shepherd verified F-174 LIVE in `review-calibration-grade.ts:96` (grade step
  precedes cooldown claim); kept as related-provenance, NOT a duplicate. WI-666
  build dispatch deferred until WI-665 lands (serial per unit map order).
- 2026-06-11 — WI-665 plan-phase stop reviewed and APPROVED with rulings:
  (D1) F-090 via new `feedback_retry_queue` table, migration 0110 (enum alternative
  rejected — PG enums irreversible); insert in failure path only, insert-failure
  degrades gracefully (Sentry, no PII fallback into payload); support_to re-derived
  from config if possible; unconsumed-row purge or tracked follow-up. (D2) 4→1 step
  collapse in topic-probe-extract conditionally approved — executor must verify
  seedRetentionCard idempotency under retry, else fall back to 2-step
  reference-and-rehydrate shape. Corrections: event payload TYPE must drop
  message/supportTo; GC1 hazard on DB mocks (requireActual pattern); migration
  -before-deploy ordering in PR description. Executor implementing; next boundary
  PR-open.
- 2026-06-11 ~23:25 — wi665-executor killed mid-implementation by the account
  usage-limit window (resets 00:40 Oslo). Worktree `.worktrees/WI-665` holds
  uncommitted partial progress (F-028 legs + F-091 source/test edits;
  F-090 schema + route-test started; no migration, no commits; `_plan-WI-665.md`
  present). Recovery: shepherd scheduled a 00:47 one-shot wake-up to resume the
  SAME executor from its transcript (context preserved). If this session dies
  before the resume, a fresh executor must re-orient from `_plan-WI-665.md` +
  `git status` in the worktree and the approved-plan rulings logged above.
- 2026-06-12 ~01:10 — Executor resumed at 00:47, banked two worktree commits
  (`0094499fe` F-028 legs + F-091; `893711d15` F-090), then was limit-killed a
  second time (resets 04:30 Oslo). Tree near-clean; untracked
  `webhook-idempotency-purge.test.ts` = half-done D1 purge piece. Remaining:
  purge (or tracked follow-up), GC6 scan, typecheck/lint, push, PR. Next resume
  scheduled 04:37.
- 2026-06-12 ~01:4x — Operator-ordered immediate resume succeeded. **PR #1030
  open** (head `a0799401d`), CI pending; shepherd owns the wait (backstop cron
  cancelled). D2 outcome: `seedRetentionCard` NOT return-stable → two-step shape
  taken (seed as own step before idempotent merged `extract-signals`). D1
  outcomes: `supportTo` config-derivable → not stored; unconsumed-row purge
  landed in-PR (no follow-up WI); enqueue-failure degrades gracefully.
  Adversarial review: 1 round, SHIP. GC6 clean. Migration `0110` re-verified
  free at PR time; migration-before-deploy note in PR description.
- 2026-06-12 — Incident adjudicated: executor's first `/commit` forked into the
  MAIN checkout and pushed `20b06b4c7` (19 ambient `.cosmo/` artifact files from
  several sessions + the review-loop handoff-doc edit). Content benign (no code,
  no secrets; handoff edit substantively correct — documents this workstream's
  watcher extension). Ruling: ACCEPT, no revert — reverting would delete other
  sessions' artifacts. Flagged for operator. Executor self-corrected to
  worktree-directed commits afterward.
- Open observation (executor): unrelated schema drift (concepts/identity churn)
  sits unshipped on main — `drizzle-kit generate` would bundle it; deliberately
  NOT absorbed into migration 0110. May deserve a capture by its owners.
- 2026-06-12 ~11:0x — **PR #1030 MERGED** (merge commit, house precedent). Landing
  sequence: CI red #1 = RLS-coverage invariant on new `feedback_retry_queue`
  (fixed properly: ENABLE RLS + profile-isolation policy per 0085/BUG-216 pattern,
  no exceptions escape). Review triage: 2 fixed (DELETE profileId scoping;
  duplicate Inngest step name), 2 CodeRabbit nitpicks rejected with rationale.
  claude-review crash on `ceff5b435` adjudicated per WI-378 (no verdict marker =
  did not run) → re-run → APPROVED, 1 CONSIDER accepted-as-is in-thread.
  Executor instructed to run `complete` (→ Reviewing; watcher closes
  autonomously). **Ops note: migration 0110 merged but NOT applied to
  staging/prod Neon — apply before/with next worker deploy** (enqueue degrades
  gracefully until then).
- 2026-06-12 ~11:15 — WI-665 `complete` ran: Stage=Reviewing, claim released,
  Fixed In=`b7de23fdf` (PR #1030 merge commit; derived from detached-HEAD
  worktree since main had advanced). Watcher caught the transition at 09:13Z and
  launched the autonomous review (pid 9008) — first live proof of the 4th
  workstream wiring. Worktree `.worktrees/WI-665` clean at `ceff5b435`; remove
  after WP closes. **WI-666 executor dispatched** (wi666-executor; same protocol
  + lessons: incremental commits, explicit worktree-directed first /commit, no
  bare drizzle-kit generate, plan-phase stop).
- 2026-06-12 ~11:25 — Autonomous review of WI-665 BOUNCED it (rework,
  Reviewing→Executing): all code-evidence DoD passed, sole blocker "children not
  closed" (WI-638/667/668/669 at Captured). Shepherd adjudicated as reviewer
  misfire: absorbed-provenance children are bulk-closed BY the close ceremony
  (close.ts WP bulk-close; WI-578→WI-606/607 precedent). Adjudication comment
  posted on the WP page; executor re-claiming + re-running `complete` to return
  it to Reviewing for a second pass. **Productization observation for the review
  loop (feed to review-loop-reviewer-observations.md owners): reviewer manual
  checklist needs an explicit rule — open absorbed-provenance children are NOT a
  WP DoD gap; disposition done + close handles them.**
- 2026-06-12 ~11:30 — WI-666 plan-phase stop reviewed: APPROVED with F-162
  design correction (max-successful cursor → longest-successful-PREFIX cursor;
  mid-slice red test; zero-progress livelock guard with Sentry escalation;
  sibling-backfill sweep check) + F-174 constraints (finalize keeps card-id WHERE
  + profile protection, idempotent, partial-state semantics documented) + F-094
  combined-ALS approved. Executor implementing.
- 2026-06-12 ~11:40 — **WI-665 UNIT COMPLETE.** Second autonomous review pass
  applied `done` (fresh local validation: 5 suites/51 tests + RLS 7 tests + tsc +
  lint, all green) → WP `Closed/Done`. Children gap: review.ts's done path does
  NOT run close.ts's WP bulk-close, leaving WI-638/667/668/669 at Captured —
  shepherd replicated close.ts child semantics exactly via REST (Closed/Done,
  parent Fixed In, date backfill, "Closed via WP WI-665." comment on each).
  Worktree `.worktrees/WI-665` removed, branch deleted (merged). **Second
  productization observation: review-close vs close-ceremony gap — a WP closed
  via review.ts strands its children; either review's done path must invoke the
  bulk-close or the watcher prompt must direct reviewers to run close.ts for
  WPs.** F-028/F-091/F-090 remediated in production code (PR #1030).
- 2026-06-12 ~12:1x — **WI-666 UNIT COMPLETE → CHARTER COMPLETE.** PR #1045
  merged (`f0d122de5`): F-174 claim-before-grade split, F-162
  longest-successful-prefix cursor + zero-progress livelock guard (mid-slice +
  tail + livelock tests), F-094 combined-ALS env bindings (12 singletons
  removed). Sibling sweep: embed-backfill already safe (BUG-366),
  filing-stranded structurally unaffected. Review triage: 1 CONSIDER rejected
  with rationale, CodeRabbit 0 actionable. Autonomous review applied `done` on
  the FIRST pass (the pre-review children note on the WP page prevented a repeat
  bounce). Children WI-670/671/672 bulk-closed via shepherd ceremony; worktree +
  branch removed.

## 6. Charter outcome (2026-06-12)

All 6 `security-pii-inngest` findings remediated and closed: F-028 (2 legs) /
F-091 / F-090 via WI-665 → PR #1030 (`b7de23fdf`); F-094 / F-162 / F-174 via
WI-666 → PR #1045 (`f0d122de5`). Both WPs `Closed/Done` through the autonomous
review loop; all 7 children closed via WP ceremony.

**Standing operator items:**
1. **Migration `0110` (`feedback_retry_queue`) is merged but NOT applied to
   staging/production Neon** — apply before/with the next worker deploy
   (feedback enqueue degrades gracefully until then; retry path inert).
2. Unshipped schema drift (concepts/identity churn) sits on main —
   `drizzle-kit generate` bundles it into any new migration; its owners should
   capture it as a WI.
3. Review-loop productization findings (for review-loop-reviewer-observations
   owners): (a) reviewers need an explicit rule that open absorbed-provenance
   children are not a WP DoD gap; (b) review.ts's `done` path strands WP
   children — only close.ts runs the bulk-close.
4. Stray commit `20b06b4c7` (executor /commit forked into main checkout,
   ambient .cosmo state) — accepted, content benign; commit-skill CWD behavior
   worth a look by its owners.
