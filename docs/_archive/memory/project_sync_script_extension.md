---
name: Cross-runtime sync scripts should be generalized when N=3+
description: scripts/sync-skills.mjs and scripts/sync-agent-docs.mjs are two specialized mirroring scripts (.agents/skills/ → .claude/skills/ and AGENTS.md → CLAUDE.md). If we add a third cross-runtime artifact class, generalize into a single sync mechanism with per-artifact configuration rather than spawning sync-* script #3.
type: project
---

Today there are two narrow sync scripts:

- `scripts/sync-skills.mjs` — `.agents/skills/` → `.claude/skills/` (excludes `agents/` adapter subdir, has SKIP_SKILLS for divergent skills)
- `scripts/sync-agent-docs.mjs` — `AGENTS.md` → `CLAUDE.md` (with H1 title swap + generated-file header)

Both are invoked from `.husky/pre-commit` in write mode and auto-stage results. Both have `--check` mode for verification.

**When to generalize:** the trigger is "we're about to write a third sync script." Likely candidates: slash commands (`.agents/commands/` ↔ `.claude/commands/`), settings overlays, per-runtime hooks, per-runtime READMEs.

**Sketch of generalized mechanism:**

- One script (`scripts/sync-runtime-mirrors.mjs`) that reads a manifest of mirror declarations.
- Manifest entries: source path → target path(s), transformations (title swap, exclude patterns, frontmatter overrides), skip lists.
- Pre-commit hook runs the one script.
- `pnpm sync` runs the same script.

**Do NOT preemptively refactor.** Two narrow scripts are easy to read and modify; a generalized mechanism would add indirection that costs more than it saves at N=2. Revisit when N=3 is on the horizon.
