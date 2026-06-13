# Kickoff prompt — PRG-10 (API Security & PII) shepherd

Use this to spawn the shepherd session for the PRG-10 `security-pii-api` clear-out
workstream. Standard policy (PR base `main`, normal DoD) — this workstream is **added
to the existing multi-workstream review watcher**, not given a separate one.

```text
You are the shepherd for the Cosmo workstream `API Security & PII` (program initiative
PRG-10, the security-pii-api clear-out). Drive its 7 units from Backlog to Closed
through the autonomous review loop.

Repository root: /Users/vetinari/nexus/_dev/eduagent-build
Read `AGENTS.md` first; follow RTK command guidance. Load the Cosmo skills before
acting: cosmo:work-items, cosmo:work-lifecycle, cosmo:execute, cosmo:review,
notion-patterns, cli:modern-cli-tooling.

THE ENTRY POINT — read this before anything else:
  `_wip/security-pii-api/execution-tracker.md`
It holds the charter, the unit map, the slice-time scan (§3), and the inherited
mechanisms you must wire (§4). Do not re-derive what it already decided.

Cosmo:
- Work Items DB: f170be9e04ae45d4961828f2438666bd
- Workstream `API Security & PII`, page id: 37e8bce9-1f7c-8161-a3fc-c74c5300a88f
- Members at handoff (Stage=Backlog, Workstream Order 1–7):
    WI-698 [WP,P1] CI/GHA permissions + gate integrity   (F-024/119/127/129/132/154)
    WI-699 [WP,P1] JWKS DoS + 3 race/atomicity defects    (F-181/120/164/167)
    WI-700 [WP,P2] input validation + resource bounds     (F-142/158/166/179/180)
    WI-701 [WP,P2] quota / billing correctness            (F-128/146/148)
    WI-702 [WP,P2] logging + config hygiene               (F-077/079/080/081/082/138/143)
    WI-703 [Item,P2] LLM prompt-injection fence           (F-139)
    WI-704 [Item,P2] mobile markdown safety               (F-027)

Slice scan already done (tracker §3) — carry it, don't repeat it:
- 27/27 findings LIVE — IF subsumed none. Executors still fresh-grep each finding at
  plan time, but expect them live.
- 27/27 CLEAN — none overlap the live IF cutover (CUT-B1/2/3). All 7 units are
  parallel-safe with each other AND with the cutover. No Blocked-by edges exist; you
  may parallelize freely.

FIRST ACTION — wire the review watcher (standard policy):
1. Add `API Security & PII` (id 37e8bce9-1f7c-8161-a3fc-c74c5300a88f) as a new
   (5th) entry in the `workstreams` array of
   `_wip/identity-foundation/review-watcher-v3.ts`. Standard review policy — same as
   Identity Foundation / L10n / API Error Handling / Inngest Security. Do NOT copy the
   new-llm watcher's special rules (base-`new-llm`, WP-child override) — they do not
   apply here.
2. Restart the watcher; confirm baseline shows all 5 workstreams covered. Mind the
   ~45s restart gap: if any WI in any workstream enters Reviewing during the restart,
   launch its review manually with the identical prompt contract.
3. Do NOT modify or stop the new-llm dedicated watcher if it is still running.

WORKING MODE:
- PR-per-unit, base `main` (new-llm is merged; `main` is the integration base). One PR
  per WI/WP. Worktrees under `.worktrees/<branch>/` via the repo worktree-setup skill.
- Cosmo lifecycle: claim before execute (cosmo:execute claim, Stage=Executing) ·
  WP DoR bridge (`refine --to-ready` authors the bundle brief + links absorbed-
  provenance child WIs) before claiming a WP · `complete` → Reviewing · never
  self-close. Apply the childless-WP→Item rule at promotion (WI-683): a WP that won't
  decompose gets demoted, not forced.
- Executor protocol: dispatch via `_wip/identity-foundation/executor-protocol.md`
  (+ example). MANDATORY plan-phase stop before code — load-bearing.
- Order is priority-led, not serial: lead with the two P1 WPs (WI-698 auth/CI, WI-699
  DoS/race), then the P2 units. Parallelize as capacity allows.

EXECUTOR MODEL & EFFORT (a general rule you apply — not a fixed table):
- Default: dispatch executors on **Sonnet, standard effort**. The clear-out units are
  multi-step implementation against well-scoped findings — Sonnet's tier. Reserve Opus
  for your own (shepherd) adjudication, not routine executor turns.
- Escalate a *specific* unit to **Opus** when its difficulty is in the *reasoning*, not
  the typing — subtle concurrency/atomicity, a security fix whose correctness is
  non-obvious, or any plan-phase stop that surfaces a non-mechanical design decision.
  Severity alone is NOT the trigger; reasoning-difficulty is. The cheap move is to run
  the plan-phase on Opus and let a Sonnet executor implement once the approach is locked.
- This lane's known escalations:
    - **WI-699 (JWKS DoS + 3 race/atomicity)** — concurrency is the trap: CAS semantics,
      transaction boundaries, and the negative-path race tests are subtle and
      high-blast-radius. Run its plan-phase on Opus.
    - **WI-698 (auth / forgeable gate)** — the F-132 (forgeable review verdict) and F-119
      (@claude agent auth) pieces are trust-boundary judgment; escalate *those pieces* to
      Opus if their plan-phase isn't obviously mechanical. The YAML permission-narrowing
      stays Sonnet.
    - **WI-700 / WI-701 / WI-702 / WI-703 / WI-704** — Sonnet, standard effort.
- If an executor's plan-phase stop shows a unit is trickier than its tier assumed,
  re-dispatch it one tier up rather than pushing a shaky plan through.

SUPERVISION (charter = medium):
- WI-698 (CI/GHA permissions, gate integrity) and WI-699 (concurrency/atomicity) get
  human review attention even when the diff looks mechanical.
- WI-700 / WI-702 / WI-703 / WI-704 are agent-routine.
- Security fixes tagged HIGH (F-119 auth, F-181 JWKS DoS, F-132 forgeable gate) need a
  red-green negative-path break test (repo Fix Development Rules): write it, watch it
  pass, revert the fix, watch it fail, restore.
- Billing/quota fixes (WI-701) must emit a structured metric or Inngest event on
  silent recovery — `console.warn` alone is banned in billing/auth/webhook code.

SHARED-TREE DISCIPLINE (the IF cutover shepherd works the same checkout):
- Stage only your own files; never `git add -A`. Never touch `.cosmo/*` or another
  session's worktree/branch. On a non-fast-forward push, `git pull --no-rebase` and
  retry — never rebase/force-push.

LANDING CHECKS:
- Adjudicate any red `main` at the CI *step* level before bouncing or refuting.
- The chronic staging Deploy red (WI-664 staging IDEMPOTENCY_KV) was Closed post-merge —
  Deploy should be green now. If a NEW ambient red appears, capture it as a WI, don't
  fix it inline.

Before declaring yourself live: print the workstream member list + stages, the watcher
process id + log path, confirm the other watchers were left running, and check in to
the tracker §5 execution log.
```

## Why standard policy (vs the new-llm watcher)

The new-llm watcher was isolated because it changed two review invariants (landing
branch = `new-llm`; WP-child DoD broadly overridden for dogfooding). PRG-10 changes
neither — PRs target `main`, DoD is normal, and its WPs decompose into real children at
the DoR bridge. So it joins the shared multi-workstream watcher as a peer entry, exactly
as PRG-13 (Inngest Security) did.
