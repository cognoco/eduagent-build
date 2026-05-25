---
name: project-memory
description: Use when starting substantial EduAgent repo work, when the user asks to remember or update memory, or when durable project decisions, workflow corrections, recurring mistakes, or stale memories are involved.
---

# Project Memory

Use `.claude/memory/` as Codex's project memory store. Mimic Claude Code auto memory: keep a concise `MEMORY.md` index loaded first, move details into focused topic files, and update memory only for durable information that will help future sessions.

## Read Workflow

1. Read `.claude/memory/MEMORY.md` first.
2. Load only memory files relevant to the task.
3. Treat memory as context, not authority. Precedence is: explicit user instruction, `AGENTS.md`, current code/docs, then memory.
4. If a memory conflicts with higher-priority sources, do not follow it silently. Update it, point it at the canonical source, or archive it.

## Write Workflow

Write or update memory when:

- The user says "remember", "add to memory", or corrects a repeated behavior.
- A durable project decision is made outside code/docs.
- A workflow preference should persist across sessions.
- A recurring bug pattern, environment trap, or investigation lesson would save future time.

Do not write memory for:

- One-off status updates.
- Temporary branch state unless it is the active source of truth for a workstream.
- Facts already captured clearly in `AGENTS.md`, `CLAUDE.md`, specs, plans, or code, unless the memory adds incident context and points to the canonical source.

## File Rules

- `MEMORY.md` is the index. Keep it concise and grouped by topic.
- Detailed notes live in separate markdown files.
- New files use lowercase kebab/snake style matching the existing directory, such as `feedback_new_pattern.md` or `project_new_decision.md`.
- Use frontmatter with `name`, `description`, and `type` when creating a detail file.
- Move resolved or stale files to `.claude/memory/_archive/`; update `MEMORY.md` links at the same time.
- Prefer pointers over duplicated rules. If `AGENTS.md` or `CLAUDE.md` is canonical, say so.

## Detail File Template

```markdown
---
name: Short human title
description: One sentence explaining when this memory matters
type: feedback | project | reference | user
---

Short durable fact or decision.

**Why:** Incident, rationale, or source.

**How to apply:** Concrete future behavior.
```

## Maintenance Checks

When managing memory, scan for:

- Pure paraphrases of `AGENTS.md` or `CLAUDE.md`: reduce to a pointer or archive after preserving useful context.
- Divergence between memory and current rules/code: resolve in favor of the current canonical source.
- Stale date-sensitive entries: archive or update with an exact date.
- Index bloat: keep `MEMORY.md` under roughly the first 200 lines/25KB so startup recall stays useful.

After edits, run:

```bash
find .claude/memory -maxdepth 2 -type f -name '*.md' | sort
rg -n "new-file-name|changed-topic" .claude/memory/MEMORY.md
```
