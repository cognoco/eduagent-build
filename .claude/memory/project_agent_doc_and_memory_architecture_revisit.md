---
name: Revisit CLAUDE.md/AGENTS.md and cross-agent memory architecture
description: From the worktree-rules PR. The AGENTS.md ↔ CLAUDE.md content split is RESOLVED (WI-386, 2026-06-09 — reference model: AGENTS.md is the single source, CLAUDE.md is a thin @AGENTS.md pointer). The remaining open concern is cross-agent memory: memories under .claude/memory/ are Claude-only — Codex agents don't see them. A dedicated session is needed to design how memories work across agents, with Cortex (Nexus, ../../) as prior art.
type: project
---

Surfaced during the worktree-rules PR (May 2026). The AGENTS.md → CLAUDE.md sync mechanism was prototyped, then **rolled back by executive decision** before merge — both files diverged by design pending a proper merge. Skills sync (.agents/skills/ → .claude/skills/) was kept; only the doc sync was rolled back. Of the two issues below, **Issue 1 is now resolved; Issue 2 remains open.**

**Issue 1 — AGENTS.md vs CLAUDE.md content split. ✅ RESOLVED 2026-06-09 (WI-386).** Adopted the **reference model**: AGENTS.md is the single source of truth; CLAUDE.md is a thin `@AGENTS.md` pointer (one line). The one-time content merge recovered all richer CLAUDE.md doctrine into AGENTS.md (the RECOVER table in `docs/plans/2026-05-25-agents-claude-md-merge-plan.md`), and every harness consumer that read CLAUDE.md literally was repointed to AGENTS.md (the doc-count scripts `_doc-counts.sh` / `validate-doc-versions.sh` / `update-claude-md.sh`, and the CI claude-review action + workflow that load the rules doc in full). Divergence between the two files is now structurally impossible, so **`scripts/sync-agent-docs.mjs` is NOT revived** — there is nothing to sync between them. The prior "do NOT revive / diverge by design" framing is superseded. (Note: this resolves only the *doc* split. The original *content-profile* question — what belongs in AGENTS.md vs memory/skills/docs — is a softer, still-open hygiene question, but it is no longer blocking.)

**Issue 2 — Cross-agent memory architecture.** `.claude/memory/` is Claude Code only. Codex agents working in this repo can't see those memories. The two-runtime asymmetry that drove the skill-sync work also applies to memory, but we haven't designed a solution. Questions to address:

- Should memory be runtime-neutral (e.g. `.agents/memory/` with sync to `.claude/memory/`)?
- Or should some memory remain Claude-only (sessions, transient context) while operational memory promotes to AGENTS.md or to a new shared location?
- How does this relate to the Cortex work in the Nexus repo (`../../Cortex/`) — Supabase pgvector-based estate-wide AI memory? Cortex was deployed but not wired to Slack. Could it serve as the cross-agent memory backbone?
- What about cross-session memory vs cross-agent memory — are these the same problem or different?

**When to act:** Bring up in the next architectural session about agent infrastructure. Not blocking; current memory-layer behavior is "Claude-only" which is a known limitation, not a regression.

**Files / references:**
- `AGENTS.md` § Cross-runtime File Sync (now documents the reference model: AGENTS.md single source, CLAUDE.md → `@AGENTS.md`)
- `scripts/sync-skills.mjs` (skills sync — still active; could extend to memory). `scripts/sync-agent-docs.mjs` is **not revived** (reference model made doc-sync unnecessary — WI-386)
- `../../CLAUDE.md` (Nexus content control plane doctrine — memory schemas, Cortex description)
- `../../Cortex/` (Nexus, Supabase pgvector estate-wide memory)
