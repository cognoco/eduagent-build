---
description: Initialize OTEL tracing context for this Archon workflow run.
argument-hint: (no arguments)
---

# Initialize Archon Tracing

Generate a unique run ID and write worktree-scope config files so subsequent
Claude Code and Codex calls in this workflow are tagged with archon-specific
telemetry attributes.

## Why this exists

User-scope configs (`~/.claude/settings.json`, `~/.codex/config.toml`) point
both tools at Logfire and tag traces with `environment=native`. When Archon
launches CC or Codex inside a worktree, we want those traces re-tagged as
`archon-<workflow>` plus per-run context (`archon.run_id`, `archon.workflow`,
`archon.repo`, optional `archon.pr`).

The mechanism: write project-scope config files in the worktree. Both CC and
Codex honor project-scope overrides that merge with the user-scope baseline.

## Why `OTEL_RESOURCE_ATTRIBUTES` is not used for CC

We empirically confirmed that **Claude Code strips `OTEL_RESOURCE_ATTRIBUTES`
from the subprocess env** before spawning hook subprocesses. Setting it in the
`env` block of `.claude/settings.json` has no effect — those key/value pairs
never reach the Pydantic plugin and never land on traces.

What the CC env block does reliably propagate: `LOGFIRE_TOKEN`,
`LOGFIRE_BASE_URL`, `LOGFIRE_ENVIRONMENT`, `PYTHONUTF8`, `TMPDIR`. So
`LOGFIRE_ENVIRONMENT=archon-<workflow>` works fine and appears as
`deployment.environment.name` on CC traces — that is our archon-vs-native
differentiator for CC.

For the richer per-run attributes (`archon.run_id`, `archon.workflow`,
`archon.repo`, `archon.pr`) we use a sidecar JSON file:
`<cwd>/.claude/logfire-resource-attributes.json`. The Pydantic plugin reads
`os.environ["CLAUDE_PROJECT_DIR"]` (which IS propagated to hooks) and merges
this file's keys into resource attributes at trace-emission time. The file is
written by this command alongside `.claude/settings.json`.

## Why not service.name?

Originally we wanted `service.name` to be one of `claude-code-archon` /
`codex-archon`. Two upstream limitations made that impractical:

- **Codex** ([openai/codex#7821](https://github.com/openai/codex/issues/7821))
  doesn't expose any TOML or env knob for `service.name` or arbitrary resource
  attributes. It hardcodes `service.name=codex_cli_rs`.
- **Claude Code's Pydantic plugin** does support `OTEL_RESOURCE_ATTRIBUTES`
  for `service.name`, but on Windows the override has been fragile (silent
  SessionStart failures from missing TMPDIR or stdin codec errors — patched,
  but a class of bug we don't want on the critical path).

So we differentiate native-vs-archon via the `env` resource attribute (which
both tools can set) instead. `service.name` stays at the per-tool default
(`claude-code-plugin` for CC, `codex_cli_rs` for Codex) and tells you which
tool emitted the trace. Two-D pivot in queries: `(service.name, env)`.

## Steps

1. **Generate run ID** — produce a UUID via PowerShell:
   ```powershell
   [guid]::NewGuid().ToString()
   ```
   This is `archon.run_id`.

2. **Determine workflow context** (parse from the worktree path — no
   Archon env var carries this):

   Archon does **not** inject `ARCHON_WORKFLOW`, `ARCHON_REPO`, or any
   similar env var. The only signal available inside a running workflow node
   is the worktree directory path, whose layout is always:
   `~/.archon/workspaces/<owner>/<repo>/worktrees/archon/<task-dir>`

   Use PowerShell `Split-Path` — not bash `basename/dirname` — because this
   command runs on Windows inside a Claude Code session.

   ```powershell
   # cwd IS the worktree directory when this command runs
   $cwd = (Get-Location).Path

   # archon.repo — 3 levels up from the worktree dir
   # path:  .../workspaces/<owner>/<repo>/worktrees/archon/<task-dir>
   #                          ^--- 3 Split-Path -Parent hops up, then -Leaf
   $archonRepo = Split-Path -Leaf (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $cwd)))

   # archon.workflow — strip 'task-' prefix and '-<unix-ms>' suffix from
   # the worktree directory basename.
   # task-<workflow>-<13-digit-timestamp>  e.g. task-test-telemetry-1778008100772
   $taskDir = Split-Path -Leaf $cwd
   if ($taskDir -match '^task-(.+)-\d{10,}$') {
       $archonWorkflow = $Matches[1]
   } else {
       # Non-task workflow types (issue-, thread-, pr-review, etc.) don't
       # encode a YAML workflow name in their branch name. Fall back to a
       # safe sentinel so traces are still tagged rather than blank.
       $archonWorkflow = "unknown-workflow"
   }
   ```

   - `archon.pr` — read from `$ARGUMENTS` if the workflow takes a PR
     identifier (e.g. `PR-16`); omit otherwise.

   ## Why

   Archon's Claude provider passes `process.env` through unmodified and does
   not inject any workflow-identity env vars. The workflow executor knows the
   workflow name at call time (it's the `workflow.name` field), but it does
   not write a manifest file into the worktree and does not propagate the
   name via env. `git rev-parse --show-toplevel` returns the worktree path
   itself (not the canonical repo root) when run inside a worktree, so it
   would produce the wrong value for `archon.repo`. Path parsing from the
   worktree layout is the only reliable signal.

   The layout `~/.archon/workspaces/<owner>/<repo>/worktrees/archon/<task-dir>`
   is hardcoded in `@archon/git/src/worktree.ts` `getWorktreeBase()` →
   `getProjectWorktreesPath()`. Only `task` workflow types encode the YAML
   `name:` in `<task-dir>` as `task-<name>-<unix_ms>`. Other workflow types
   (issue, pr, thread, review) use a different format without the workflow
   YAML name, so they fall through to `unknown-workflow`.

3. **Compute the environment label** — `archon-<workflow>` (e.g.
   `archon-execute-cleanup-pr`). This is the differentiator both tools share.

4. **Write `<cwd>/.claude/settings.json`** for Claude Code consumption:
   ```json
   {
     "env": {
       "LOGFIRE_ENVIRONMENT": "archon-<workflow>"
     }
   }
   ```
   Notes:
   - Project-scope `settings.json` merges with user-scope by key.
     `LOGFIRE_TOKEN`, `LOGFIRE_BASE_URL`, `TMPDIR`, `PYTHONUTF8`, etc. are
     inherited from `~/.claude/settings.json` and don't need to be repeated.
   - The env block now carries only `LOGFIRE_ENVIRONMENT`. That is sufficient:
     it lands as `deployment.environment.name=archon-<workflow>` on CC traces
     (used by Logfire's UI environment dropdown) and is the archon-vs-native
     differentiator for CC.
   - `OTEL_RESOURCE_ATTRIBUTES` is intentionally absent. CC strips it from
     the subprocess env before spawning hook processes, so it never reaches
     the Pydantic plugin. See "Why `OTEL_RESOURCE_ATTRIBUTES` is not used for
     CC" above.
   - **Do not** set `service.name` here — leave it at the plugin default.

5. **Write `<cwd>/.claude/logfire-resource-attributes.json`** for per-run
   attribute injection via the patched Pydantic plugin:
   ```json
   {
     "archon.run_id": "<uuid>",
     "archon.workflow": "<workflow-name>",
     "archon.repo": "<repo-basename>",
     "archon.pr": "<pr-identifier>"
   }
   ```
   Notes:
   - Omit the `archon.pr` key entirely when there is no PR identifier (do
     not set it to null or an empty string).
   - The plugin reads `os.environ["CLAUDE_PROJECT_DIR"]` (propagated to
     hooks) and looks for `<that>/.claude/logfire-resource-attributes.json`
     at trace-emission time, merging its keys into resource attributes.
   - This is the mechanism that puts `archon.run_id`, `archon.workflow`,
     `archon.repo`, and `archon.pr` onto CC traces. Codex traces still cannot
     carry these attributes (issue #7821); only `env=archon-<workflow>` (via
     `.codex/config.toml`) differentiates Codex archon traces.

6. **Write `<cwd>/.codex/config.toml`** for Codex consumption:
   ```toml
   [otel]
   environment = "archon-<workflow>"
   ```
   Notes:
   - Project-scope `config.toml` overrides user-scope per-key. Trace exporter
     endpoint, auth header, protocol, etc. are inherited from
     `~/.codex/config.toml`.
   - Codex maps `[otel].environment` to the resource attribute named `env`
     (not `deployment.environment.name` — this is a Codex idiosyncrasy; the
     value still differentiates fine).
   - Custom `archon.run_id` / `archon.workflow` / etc. cannot be added to
     Codex traces until #7821 lands. For now, only `env` distinguishes Codex
     archon traces from Codex native.

7. **Output a brief summary** to stdout (visible in workflow logs):
   ```
   archon.run_id=<uuid>
   archon.workflow=<name>
   environment=archon-<workflow>
   wrote: <cwd>/.claude/settings.json
   wrote: <cwd>/.claude/logfire-resource-attributes.json
   wrote: <cwd>/.codex/config.toml
   ```
   Workflow YAML does NOT need to consume this output to wire env vars on
   downstream nodes — the worktree config files handle that automatically.
   This output is purely for human debugging. Remove any legacy
   `env: OTEL_RESOURCE_ATTRIBUTES: $init-tracing.output` blocks from existing
   workflow YAMLs (they were a relic of the service.name-based scheme and no
   longer apply).

## Verification

After this command runs, confirm:
- `<cwd>/.claude/settings.json` exists with `LOGFIRE_ENVIRONMENT` in the env
  block (and no `OTEL_RESOURCE_ATTRIBUTES` — that key is intentionally absent)
- `<cwd>/.claude/logfire-resource-attributes.json` exists with `archon.run_id`,
  `archon.workflow`, `archon.repo` (and optionally `archon.pr`)
- `<cwd>/.codex/config.toml` exists with `[otel].environment`

In Logfire after the workflow runs:
- All archon CC traces: `WHERE deployment.environment.name LIKE 'archon-%'`
- All archon Codex traces: `WHERE env LIKE 'archon-%'`
- All native traces: `WHERE deployment.environment.name = 'native'` (CC) or
  `WHERE env = 'native'` (Codex)
- This specific run on CC traces (archon.* attributes come from the JSON file
  via the patched plugin):
  `WHERE attributes->>'archon.run_id' = '<uuid>'`
- Codex archon traces: identifiable only by `env=archon-<workflow>` until
  issue #7821 ships; they will not carry `archon.run_id` / `archon.workflow` /
  etc.
- Two-D pivot for the four-channel view:
  `GROUP BY service.name, env` →
  `(claude-code-plugin, native)`, `(claude-code-plugin, archon-…)`,
  `(codex_cli_rs, native)`, `(codex_sdk_ts, archon-…)`
  Note: Archon's Codex provider uses the TypeScript SDK (`codex_sdk_ts`),
  not the Rust CLI (`codex_cli_rs`). Direct CLI usage → `codex_cli_rs`;
  Archon workflows → `codex_sdk_ts`.
