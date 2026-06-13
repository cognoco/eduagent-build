---
name: use-the-standard-shepherd-executor-protocols-don-t-author-bespoke-kickoffs
description: "Lane execution uses a standard layered machinery (executor-protocol.md + shepherd-protocol.md + thin per-dispatch pointer-briefs + the lane tracker + a thin kickoff). Don't write bespoke shepherd kickoff prompts; know the lineage and the two standard shepherd musts."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4300a125-f90d-4b09-95ff-fbe74d4b868b
---

Lane execution uses a STANDARD, layered machinery — use it, don't reinvent it per lane:

- **Lineage (don't get it backwards):** `nexus/_WIP/wi-execute.md` is the operator's raw manual **example** (the principles: goal → adversarial review → PR-to-green). From it we built the standardized **`executor-protocol.md`** (repo-committed executor scaffold, phases 0–7). `executor-protocol.md` is the *official distilled version*, NOT an "embryo" — the shepherd's brief points at it.
- **Layers:** lane `execution-tracker.md` (entry point — charter/units/slice-scan + lane-specific notes) → **`shepherd-protocol.md`** (standard shepherd scaffold) → **`executor-protocol.md`** (standard executor scaffold) → thin per-dispatch **pointer-briefs** (shape: `executor-protocol-example.md`). The **kickoff is a thin launcher**: "read these instructions + the lane tracker, shepherd PRG-NN accordingly." There is NO bespoke per-lane kickoff doc.
- **Two standard shepherd musts** (live in `shepherd-protocol.md`, every lane): (1) the reviewer/watcher is a **SEPARATE session** (currently Codex) — the shepherd does NOT own/wire it; (2) the shepherd runs its **OWN Cosmo monitor** on its workstream's WI stages to catch verdicts (Closed vs rework→Executing) and re-engage. **DoD = Cosmo Close, not a green PR.**
- **Executor model/effort:** default Sonnet, standard effort; escalate a unit to Opus only when the *reasoning* is hard (not by severity).

**Why:** For PRG-10 I authored a bloated bespoke `shepherd-kickoff-prompt.md`, mislabeled `executor-protocol.md` as "embryo" (backwards), and dragged in review-loop internals — three rounds of confusion before the operator pointed out the standard machinery already existed and was clean. Generalizing this machinery is [[project_identity_foundation_decisions]]-adjacent PRG-05 work (the shepherd↔reviewer contract). Relates to [[feedback_use_sonnet_agents]].
