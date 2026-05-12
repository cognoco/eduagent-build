# BMAD in this repo

This repo uses the BMAD method for agent-orchestrated workflows. There is
**no separate BMAD plugin** installed in the Claude Code marketplace — the
in-repo source tree under `_bmad/` and a set of slash-command shims under
`.claude/commands/bmad/` together form the entire BMAD surface.

## Canonical source (this directory)

The actual agent personas, workflows, tasks, and configuration live here:

- `_bmad/core/` — BMAD Master, shared tasks, shared workflows
- `_bmad/bmm/` — Method module (analyst, architect, dev, pm, qa, sm, tech-writer, ux-designer, etc.)
- `_bmad/tea/` — Test Architect module
- `_bmad/_config/` — module help indices, agent/IDE configs
- `_bmad/_memory/` — sidecar memory (currently just tech-writer)

When you want to evolve agent behavior, edit files here — not the shims.

## How invocation reaches this tree

`.claude/commands/bmad/` contains 51 thin slash-command shim files. Each
shim has YAML frontmatter (`name`, `description`) that registers the slash
command, and a body that tells Claude Code to load the real persona or
workflow from this `_bmad/` tree.

Claude Code namespaces slash commands by the parent directory of the
command file, so:

| Shim file | Slash command | Skill name |
| --------- | ------------- | ---------- |
| `.claude/commands/bmad/help.md` (with `name: 'help'`) | `/bmad:help` | `bmad:help` |
| `.claude/commands/bmad/bmad-agent-bmm-pm.md` | `/bmad:bmad-agent-bmm-pm` | `bmad:bmad-agent-bmm-pm` |

The same shim file shows up twice in a Claude Code session — once as a
slash command, once as a Skill in the available-skills list. They are the
same file, not parallel surfaces.

## What there is NOT

- No BMAD entry in `~/.claude/plugins/installed_plugins.json` (verified 2026-05-12).
- No BMAD plugin published in any of the marketplaces this machine is
  subscribed to (`claude-plugins-official`, `anthropic-agent-skills`,
  `zdx-claude-code-plugins`, `pydantic-claude-code-logfire-plugin`).
- No alternative install path — the shims + this tree are it.

## A note on `.codex/prompts/`

`.codex/prompts/bmad-*.md` is a parallel export for Codex (OpenAI) users.
Per `AGENTS.md`, that path is not the reliable Codex slash-command
mechanism — do not add new repo workflows there without re-verifying Codex
prompt discovery first.

## History

Closed audit finding **AUDIT-SKILLS-2 / PR-22** (2026-05-12). The original
audit row framed this as "vendored vs installed plugin — pick canonical."
That framing was incorrect, since no BMAD plugin exists in the marketplaces
this machine consults and `~/.claude/plugins/installed_plugins.json`
confirms none is installed. The shim + `_bmad/` source setup documented
here IS the canonical setup. If a marketplace BMAD plugin ever lands,
revisit this README and the PR-22 closure note in
`docs/audit/cleanup-plan.md`.
