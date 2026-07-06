# SEAM — which enabling-layer (B) fixes gate the MentoMate (A) restart

**One-pass cross-audit note.** Roadmap A is *executed by* the assembly line Roadmap B repairs. The four operator pains are product-agnostic: any product lane inherits them. So the question is — **before MentoMate work flows through the machine again, which B items must be in place?**

## It depends on how MentoMate restarts

**Case 1 — MentoMate as a manual, operator-guided pipeline (the current UQ plan: WS-44 → WS-33, not under a Quartet team).**
Almost nothing in B gates it. The operator is the orchestrator/shepherd/reviewer in one seat, so the liveness/queue/charter machinery isn't in the loop. Only two touch it:
- **B-30** plugin-version preflight — MentoMate lanes call the same `/cosmo:*` tools; a stale plugin silently breaks lifecycle writes (OPQ-17 class). Cheap, do it in Wave 1 regardless.
- **B-31** trip-wire false-positives — MentoMate `complete` runs hit the same Gate-2 bounce class. Wave 1 already.

**Case 2 — MentoMate under a Quartet team (any future point it goes autonomous).**
Then it should-depend on the assembly-line integrity + liveness + queue fixes, because those are exactly the defects that froze/mis-tracked ZDX lanes and would bite a product lane identically:

| Gate | Why it gates a MentoMate Quartet lane |
|------|--------------------------------------|
| **B-17** Validity formula holes | A MentoMate WI created without a Stage, or a zombie `Executing` claim, is "✓ Valid" and never reaped — same silent orphan/freeze. |
| **B-35** liveness arming | An unarmed ladder = a MentoMate lane can freeze undetected (the 8h-freeze class). Non-Windows/unregistered host has zero process-death detection. |
| **B-36 + charters** queue trigger + WIP | Without a dispatch-trigger owner, MentoMate Ready items sit while one executes (the "5 P3s sat" incident) — throughput death. |
| **B-30 / B-31** (from Case 1) | Same tool-integrity dependency, now unattended. |
| **B-24** Codex binding | Only if the MentoMate lane runs a Codex shepherd — then attended-only + the 7 findings apply. |

## What does NOT gate MentoMate

- **B-29 marketplace branch protection** — eduagent (MentoMate) already has branch protection + strong enforced CI (Audit A, D1 STRONG). B-29 is the *marketplace* repo's gap, not eduagent's.
- Substrate v1.1 (B-01/B-03/B-04/B-05), reviewer heartbeat (B-09), top-down verbs (B-21), root-repo ADR (B-12) — enabling-layer internal; MentoMate execution doesn't touch them.

## Sequencing implication

The UQ plan keeps MentoMate **manual** at restart — so **no B item blocks the MentoMate roadmap from starting**; Roadmap A's Phase-0 rulings and Phase-1 dispatch can proceed in parallel with Roadmap B's waves. The gate only arms **if/when** you rule MentoMate onto a Quartet team — at which point {B-17, B-30, B-31, B-35, B-36-charters} become hard should-dependencies. Recommend treating that transition as its own decision, with this list as its readiness gate.
