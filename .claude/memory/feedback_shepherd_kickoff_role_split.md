---
name: shepherd-kickoff-must-model-the-role-split-reviewer-is-a-separate-session
description: "When authoring a shepherd/executor kickoff, model the current role-split (orchestrator / shepherd+executors / reviewer-watcher as a SEPARATE session, often Codex) and bake in executor model+effort, DoD=Cosmo Close (not green PR), and the shepherd's own Cosmo verdict self-watch."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4300a125-f90d-4b09-95ff-fbe74d4b868b
---

Shepherd kickoff prompts must be written for the CURRENT role-split architecture, not a single-session model:

- **The reviewer/watcher is a SEPARATE session** (currently a Codex session) that owns `review-watcher-v3.ts`, polls all workstreams for `Stage=Reviewing`, and runs the reviews. The shepherd does NOT wire/restart/own the watcher and is NOT notified of verdicts.
- Therefore the shepherd MUST run its OWN standing Cosmo watch (Monitor/poll on its `Workstream` relation, Stage field) to catch rework/done/human verdicts and re-engage. This is the shepherd↔reviewer communication gap.
- **DoD = Cosmo Close** (Stage=Closed / Resolution=Done), NOT a green PR. `complete` → Reviewing is a HANDOFF to the review gate, not the finish line.
- **Executor model/effort** belongs in the kickoff as a general rule (default Sonnet, standard effort; escalate a unit to Opus when the *reasoning* is hard, not by severity) + per-unit escalations.

**Why:** I authored PRG-10's kickoff from an outdated single-session model; the shepherd's pre-execution task-playback surfaced three gaps in sequence (executor model/effort, DoD=Close, reviewer-is-a-separate-session). Operator twice said this "should be in the DEFAULT instructions."

**How to apply:** Put all of the above in every shepherd kickoff + the tracker's inherited-mechanisms section. The durable home is PRG-05's productized shepherd/executor/reviewer protocol — the role-split and the **shepherd↔reviewer verdict-communication contract** are core PRG-05 design (its agnosticity scope explicitly owns the orchestrator↔shepherd and shepherd↔reviewer seams). Until PRG-05 lands a template, carry these per-kickoff. Relates to the [[feedback_use_sonnet_agents]] tiering.
