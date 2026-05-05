---
description: Initialize OTEL tracing context for this Archon workflow run.
argument-hint: (no arguments)
---

# Initialize Archon Tracing

Generate a unique run ID and write a project-scope Claude Code settings.json
into the worktree so all subsequent Claude Code calls in this workflow are
tagged with Archon-specific OTEL resource attributes. Also output the
resource-attributes string so downstream Codex nodes can set it via env.

## Why this exists

Claude Code's user-scope `~/.claude/settings.json` already configures the
OTEL connection (endpoint + auth) and tags traces as
`service.name=claude-code-native`. When Archon launches Claude Code in a
worktree, we want those traces re-tagged as `claude-code-archon` plus
per-run context. Project-scope settings (worktree-local) override
user-scope, so a small file in the worktree is the cleanest override.

For Codex, the equivalent override happens via an `env:` block on each
Codex workflow node, which references the resource-attributes string this
command outputs.

## Steps

1. **Generate run ID** — produce a UUID (e.g. via PowerShell
   `[guid]::NewGuid().ToString()`). This is `archon.run_id`.

2. **Determine workflow context**:
   - `archon.workflow` — read from environment or workflow YAML; fall back
     to `unknown-workflow` if unavailable.
   - `archon.repo` — basename of the repo dir (use `git rev-parse --show-toplevel`
     and take the last path segment, or fall back to cwd basename).
   - `archon.pr` — read from `$ARGUMENTS` if the workflow accepts a PR identifier
     (e.g. "PR-16"), otherwise omit.

3. **Compose the shared run-context** (no service.name yet):
   ```
   archon.run_id=<uuid>,archon.workflow=<name>,archon.repo=<repo>[,archon.pr=<id>]
   ```

4. **Write `<cwd>/.claude/settings.json`** for Claude Code consumption. The
   service.name is `claude-code-archon`. Use the Write tool with this exact JSON:
   ```json
   {
     "env": {
       "OTEL_RESOURCE_ATTRIBUTES": "service.name=claude-code-archon,<run-context>"
     }
   }
   ```
   Project-scope settings.json merges with user-scope by key, so endpoint, auth,
   and the telemetry flag are inherited from `~/.claude/settings.json`; only
   `OTEL_RESOURCE_ATTRIBUTES` is overridden. Any subsequent Claude Code call
   spawned with cwd inside this worktree picks it up automatically.

5. **Output the Codex-variant resource-attributes string** as the final line of
   stdout, on a line by itself. Workflow YAML references this via
   `$archon-init-tracing.output` to set `OTEL_RESOURCE_ATTRIBUTES` on Codex nodes:
   ```
   service.name=codex-archon,<run-context>
   ```
   Include nothing else on that line. Claude Code nodes do NOT consume this
   stdout — they read the file from step 4. Codex nodes do NOT read the file —
   they read this stdout via the `env:` block in their YAML.

## Verification

After this command runs, confirm:
- `<cwd>/.claude/settings.json` exists and contains the env block
- The output (stdout) ends with the resource-attributes string

## Output

The OTEL_RESOURCE_ATTRIBUTES string (one line, no surrounding text), e.g.:

```
service.name=claude-code-archon,archon.run_id=abc-123-def,archon.workflow=execute-cleanup-pr,archon.repo=Mentomate,archon.pr=PR-16
```

Note: the same string is what downstream Codex nodes pass via their `env:` block,
adjusting `service.name=codex-archon` if the workflow YAML wants the codex
variant. The simplest pattern in YAML is to override only `service.name` per node.
