# Shepherd ↔ Reviewer loop — PoC observations

**What this is.** Meta-observations on the prototype closed loop running in the
Identity-Foundation execution (2026-06-11 →): a **shepherd session** (pick →
refine → brief executor sub-agents → merge-gate) hands WIs at `Stage=Reviewing`
to an autonomous **reviewer session** that runs `/cosmo:review` and closes or
bounces them; the shepherd detects outcomes via a 90s Notion poll on the
workstream. Operator intent: hone the mechanism here, productionize later.
Keep this file current — one entry per observation, dated, with a
productionization implication.

## The mechanism as currently wired

- **Queue signal:** `Stage=Reviewing` (set by `/cosmo:execute complete`).
- **Pickup:** reviewer agent polls/claims autonomously (its own loop; details
  not visible to the shepherd).
- **Outcome signal back:** none, except the Stage property itself changing.
  Shepherd runs a persistent 90s poll (session-bound Monitor) emitting Stage
  transitions; reacts to `→ Closed` (sweep-check children, tracker, dispatch
  unblocked work) and to rework bounces (re-engage executor with findings).
- **Merge timing:** shepherd merges green PRs *before* review (operator-granted
  conditional authority) — review is a post-merge DoD audit, not a merge gate.

## Observations (dated)

- **2026-06-11 — children bulk-close is inconsistent across closes.** WI-570,
  WI-572, WI-574 closes swept their provenance children; the WI-571 close left
  WI-594/595 at Captured (shepherd swept manually). Same nominal gate, different
  behavior — likely two different close paths (/cosmo:review vs /cosmo:close, or
  manual variance). *Production:* children sweep must be mechanical in ONE close
  path, idempotent, and verified by the close gate itself (`dod.wp.bulk_ready`
  checks existence, not closure).
- **2026-06-11 — outcome propagation is poll-only.** The shepherd learns
  Closed/bounced by polling Notion every 90s; the monitor dies with the session
  and must be hand-restarted (tracker §5 carries the instruction). *Production:*
  an event channel (Cosmo→Inngest webhook, or reviewer posts a completion
  message to the shepherd) instead of N agents polling the same DB.
- **2026-06-11 — operator was the messenger before the monitor.** First four
  closes were relayed by the human ("569/570/571 closed") — exactly the
  coordination cost the loop exists to remove. The monitor closed that gap
  mid-PoC.
- **2026-06-11 — shepherd merge-gate and reviewer DoD audit partially overlap.**
  Both verify PR/CI state and finding dispositions. The overlap caught real
  executor mis-reports (see below), so it is NOT pure waste — but in production
  the division should be explicit: merge-gate = "is the PR really green and
  in-scope" (pre-merge, fast); review = "is the WI's AC actually satisfied"
  (post-merge, deep). Avoid double-auditing the same finding threads.
- **2026-06-11 — post-merge review means a bounce costs a follow-up PR.** No
  bounce has occurred yet; when one does, the rework lands as a new PR on main
  rather than a fix-up on the open PR. Acceptable pre-launch; for production
  decide per-risk-class whether review gates the merge (e.g. `risky` WPs) or
  trails it (`standard`).
- **2026-06-11 — executor failure modes the gates caught (4 distinct):**
  (1) stale-green reporting — "all checks green" from the previous CI run while
  the final commit was still pending (WI-571, WI-583 partially);
  (2) committed plan file (`_plan-WI-571.md`);
  (3) finding mis-reported as fixed — WI-583 conflated the safeSend *label* with
  the Inngest event *name*, reported a CodeRabbit Major addressed when the code
  diverged;
  (4) wrong-tree editing — WI-576 created its worktree, then edited the shared
  main checkout anyway.
  *Production:* (1),(2) are mechanically checkable (a pre-complete script:
  checks-on-HEAD green + no `_plan-*` in diff); (4) is checkable (executor CWD
  assertion before first edit); only (3) genuinely needs a judgment gate.
- **2026-06-11 — executors stall at the commit→PR seam (recurring, 2×).**
  WI-575 and WI-576 both ended their turn right after `/commit` pushed the
  branch — implementation done, no PR opened, no completion — and needed a
  shepherd nudge to resume Phase 5. Likely cause: the commit skill runs as a
  forked execution and its return reads like a natural stopping point.
  *Production:* the protocol's phase chain needs an explicit "the turn does NOT
  end at push" instruction, or the dispatch harness should auto-resume an
  executor whose WI is still claimed but whose turn ended pre-`complete`.
- **2026-06-11 — bounce protocol is undefined.** If the reviewer rejects, what
  Stage does it set (Ready? Executing?), who holds the claim, and where do the
  findings land (page comment? new child items?)? The shepherd currently plans
  to "read the review and re-engage the executor" — works only if findings are
  on the WI page. *Production:* define the bounce contract explicitly in the
  lifecycle standard.

## Open design questions for productionization

1. Event-driven outcome channel vs polling (and who owns the monitor when no
   shepherd session is alive).
2. Bounce contract: Stage, claim, findings location, executor re-engagement.
3. Merge-gate placement per risk class (pre-review merge vs review-gated merge).
4. Mechanize the cheap executor checks (green-on-HEAD, plan-file, CWD) into
   the protocol/harness so shepherd judgment is spent only on substance.
5. Children/provenance sweep as a mechanical part of the close path.
6. Claim-collision rules between shepherd, reviewer, and executors (none seen
   yet; untested under contention).
