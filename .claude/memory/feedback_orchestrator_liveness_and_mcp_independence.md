---
name: orchestrator-liveness-and-mcp-independence
description: Standing operator directive — liveness deadlines/probes/wakes for shepherd lanes; Notion MCP outage never stops work (REST/bun CLIs are MCP-independent)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 81e4a412-2137-4dc9-9c0c-d275af9647f7
---

Two standing operator directives (2026-07-03), codified canonically in **orchestrator-protocol.md on Nexus main** — re-read that file at every session boundary; this memory is the pointer, not the source.

1. **Liveness:** whenever a shepherd pauses or the orchestrator dispatches long work, record an expect-a-sign-of-life-by deadline (state file: `_quartet/_quartet-wip/liveness.md`). At deadline+grace, actively probe (outbox age, Cosmo stage, git activity); on silence send a wake directive; escalate to operator if the wake draws no response. Any active lane silent ~2h is suspect.
2. **MCP outage ≠ work stoppage:** the cosmo bun CLIs (NOTION_TOKEN over REST) and the notion CLI / raw REST are MCP-independent. Correct any shepherd that halts on Notion MCP loss.

**Why:** WS-28 sat idle ~1h on an un-monitored hold (posted at level=info, invisible to escalation monitors) — silent lanes cost real wall-clock; MCP flakiness had previously been treated as a blocker.
**How to apply:** rebuild the liveness cron sweep (each session — crons die with the session) + keep `liveness.md` rows current; broadcast the rules to new shepherd lanes at standup. Related: [[feedback_clacks_state_files_must_be_gitignored]].
