---
name: Commit skill drift between .claude/ and .agents/ — sync skipped
description: .claude/skills/commit/SKILL.md and .agents/skills/commit/SKILL.md have substantial pre-existing drift (~278 vs ~70 lines). The Claude version has runtime-specific harness directives (context, agent, model, allowed-tools) that the Codex skeleton lacks. sync-skills.mjs SKIP_SKILLS excludes 'commit' to prevent regression. Follow-up: unify the two, separating runtime-neutral commit doctrine into the master and any Claude-only harness into a separate adapter.
type: project
---

The `commit` skill is in `scripts/sync-skills.mjs` SKIP_SKILLS because the two versions diverged before sync infrastructure existed:

- `.agents/skills/commit/SKILL.md` (~70 lines): skeleton with frontmatter only.
- `.claude/skills/commit/SKILL.md` (~278 lines): full ruleset + Claude Code harness directives (`context: fork`, `agent`, `model`, `allowed-tools`).

**Why the skip exists:** Naive sync would replace the rich Claude version with the skeleton, wiping critical commit workflow guidance.

**Follow-up work:**

1. Diff the two carefully. Identify runtime-neutral content (commit-message format, push behavior, commitlint types, scope rules) vs Claude-specific harness (subagent fork directives, model selection).
2. Move runtime-neutral content into `.agents/skills/commit/SKILL.md` (master).
3. For Claude-specific directives: either keep them in a Claude-only adapter file (`.claude/skills/commit/.harness.yaml` or similar), or document the commit skill as platform-specific.
4. Once unified, remove `'commit'` from `SKIP_SKILLS` in `scripts/sync-skills.mjs`. Run sync; verify both runtimes still behave correctly.

Non-urgent — the current state works (Claude Code reads its full version, `/commit` is invoked directly). The skip-list is a code smell; unifying improves Codex parity and removes the special case.
