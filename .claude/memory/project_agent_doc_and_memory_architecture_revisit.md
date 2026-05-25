---
name: Revisit CLAUDE.md/AGENTS.md and cross-agent memory architecture
description: Open work item from the worktree-rules PR. The current AGENTS.md/CLAUDE.md sync handles the cross-runtime visibility of agent doctrine, but memories under .claude/memory/ remain Claude-only — Codex agents don't see them. A dedicated session is needed to design how memories work across agents, with Cortex (Nexus, ../../) as prior art.
type: project
---

Surfaced during the worktree-rules PR (May 2026). The AGENTS.md → CLAUDE.md sync mechanism was prototyped, then **rolled back by executive decision** before merge — both files now diverge by design pending a proper merge session. Skills sync (.agents/skills/ → .claude/skills/) was kept; only the doc sync was rolled back. Two related issues to revisit in a dedicated future session:

**Issue 1 — AGENTS.md vs CLAUDE.md content split.** This PR established AGENTS.md → CLAUDE.md sync (Shape B, in-band conditionals, byte-equality apart from title). But we have not deeply audited what content belongs in AGENTS.md vs other locations (memory, skills, docs/). Pre-sync CLAUDE.md had drifted richer than AGENTS.md, and the first sync silently regressed content; a content-recovery pass was needed. The deeper question: what is the *right* content profile for a single AGENTS.md document, and what should live elsewhere?

**Issue 2 — Cross-agent memory architecture.** `.claude/memory/` is Claude Code only. Codex agents working in this repo can't see those memories. The two-runtime asymmetry that drove the skill-sync work also applies to memory, but we haven't designed a solution. Questions to address:

- Should memory be runtime-neutral (e.g. `.agents/memory/` with sync to `.claude/memory/`)?
- Or should some memory remain Claude-only (sessions, transient context) while operational memory promotes to AGENTS.md or to a new shared location?
- How does this relate to the Cortex work in the Nexus repo (`../../Cortex/`) — Supabase pgvector-based estate-wide AI memory? Cortex was deployed but not wired to Slack. Could it serve as the cross-agent memory backbone?
- What about cross-session memory vs cross-agent memory — are these the same problem or different?

**When to act:** Bring up in the next architectural session about agent infrastructure. Not blocking; current memory-layer behavior is "Claude-only" which is a known limitation, not a regression.

**Files / references:**
- `AGENTS.md` § Cross-runtime File Sync (current sync mechanism)
- `scripts/sync-agent-docs.mjs`, `scripts/sync-skills.mjs` (current sync scripts; could extend to memory)
- `../../CLAUDE.md` (Nexus content control plane doctrine — memory schemas, Cortex description)
- `../../Cortex/` (Nexus, Supabase pgvector estate-wide memory)
- `project_sync_script_extension.md` (related — generalize sync mechanism when N=3+)
