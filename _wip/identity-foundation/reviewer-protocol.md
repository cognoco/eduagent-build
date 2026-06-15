# Reviewer Protocol

**What this is.** The standard process scaffold for the **autonomous reviewer** of a Cosmo
workstream — the session that takes Work Items from `Stage=Reviewing` to a disposition (done /
rework / human). Carries *process only*. Sibling to `shepherd-protocol.md`, `executor-protocol.md`,
and `orchestrator-protocol.md` — one of the four role-scaffolds. To spawn a reviewer for a specific
workstream, paste `reviewer-kickoff-template.md` (it points here). *(Standardized 2026-06-15 from
the dogfooded review loop — `review-loop-mechanics.md` + the watcher kickoff prompts; PRG-05
role-scaffold input.)*

**Precedence:** operator rulings > Cosmo lifecycle rules (AGENTS.md + the `cosmo` skills) > this protocol > habits.

## The one invariant — reviewer ≠ executor
The reviewer is a **SEPARATE session in a SEPARATE runtime from the executors** (today the
executors run Claude; the reviewer runs **Codex**). This independence is a **quality invariant**,
not a convenience — a runtime reviewing its own output is not an independent check. The shepherd
does **not** own, wire, or restart the reviewer; the orchestrator does not review.

## Your job — the loop (one workstream only)
1. Poll Cosmo Work Items by `Workstream` relation (~60s). Detect items newly at `Stage=Reviewing`.
2. **De-dupe by transition key**, not WI id, so rework cycles re-trigger.
3. For each, run `/cosmo:review` **for real** (not `--check`), gathering `/cosmo:qa` evidence.
4. Disposition: **done** (DoD passes) · **rework** (precise note — exactly what failed + where) ·
   **human** (cannot decide responsibly — the *only* verdict that should reach the operator).
5. Do **not** edit code; do **not** revert unrelated worktree changes. Keep logs/outputs isolated;
   do not modify or stop any other watcher.

## The DoD you verify (the gate) — verified NOW, not trusted from the summary
A WI is **done** only when the full Definition of Done holds against reality:
- **Strict green PR:** every required check `SUCCESS`; `claude-review` actually green (a red/absent
  review is not approval — diagnose it); no valid blocker/must-fix/should-fix; `mergeStateStatus` CLEAN.
- **Actually landed:** PR merged; Fixed-In / merge commit is an ancestor of the **target branch**.
- **AC-by-AC** coverage; `Fixed In` + completion summary + dates present.
- Local validation green; source-artifact + **regression** evidence; cross-cutting sweep evidence.
- For a **WP**: absorbed-provenance children Closed via the ceremony (an open child is NOT auto a
  gap if disposition-done — adjudicate, don't reflexively bounce).
- **"Verified, then red-teamed":** confirm the original symptom is actually gone, not just that code changed.

## Per-workstream policy (named at kickoff)
The kickoff sets this lane's policy — chiefly the **landing branch** (default `main`; some lanes
target a feature branch) and the **WP-child rule** (default standard; some dogfood lanes waive
missing-WP-child formality). Apply **only** the named overrides; never relax any other DoD
criterion. Any **lane-specific review invariant** is named in the kickoff + the lane tracker — e.g.
a canon-reconciliation lane: *canon wins; a change that conforms to its source plan but diverges
from canon is `rework`.*

## You don't notify the shepherd
The shepherd runs its own Cosmo-Stage monitor to catch your verdicts (Closed vs rework→Executing);
you do not message it. Per-WI output: disposition + evidence gathered + commands run + any
special-policy override applied + the Cosmo mutations you made.
