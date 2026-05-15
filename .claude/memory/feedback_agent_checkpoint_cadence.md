---
name: Agent checkpoint cadence
description: Parallel/subagents should save durable progress checkpoints every four minutes so investigation and implementation work does not live only in chat.
type: feedback
---

When dispatching any long-running agent or subagent, explicitly instruct it to save a durable checkpoint at least every 4 minutes.

**Why:** A 2026-05-15 investigation lost practical momentum because two read-only subagents returned useful findings only in chat. The repo stayed clean, so there was no file artifact to resume from if the thread/context failed or the user wanted the work preserved.

**How to apply:**
- Do not make subagents commit, stage, or push by default. The no-git rule in `feedback_agents_commit_push.md` still wins.
- For implementation agents, "save" means write actual code/test/docs changes to their assigned files as they work, plus report modified paths.
- For research/review/explorer agents, "save" means write a short checkpoint note to a coordinator-approved durable file, such as a task-specific doc under `docs/audit/`, `docs/plans/`, or a scratch checkpoint path provided in the prompt.
- If no checkpoint file is appropriate, the coordinator should create or name one before dispatching agents.
- For work expected to finish in under 4 minutes, a final report is enough. For anything longer, agents should checkpoint partial findings every 4 minutes and include the latest checkpoint path in their final message.
