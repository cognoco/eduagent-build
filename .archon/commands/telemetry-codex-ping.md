---
description: Telemetry smoke test — Codex variant. Emits one trace so we can verify archon tagging.
argument-hint: (no arguments)
---

# Telemetry Ping (Codex)

This command exists solely to generate a Codex trace inside an archon workflow run. By being invoked from within the worktree (where `archon-init-tracing` has written a project-scope `.codex/config.toml`), the resulting trace should carry `env=archon-<workflow>` as a resource attribute.

`service.name` will remain at the Codex default (`codex_cli_rs`) — see `archon-init-tracing.md` for why differentiation happens via the `env` attribute instead of `service.name`.

Codex also cannot carry `archon.run_id` / `archon.workflow` / `archon.repo` resource attributes today (per [openai/codex#7821](https://github.com/openai/codex/issues/7821)). Only the `env` field differentiates Codex archon traces from Codex native — accept this asymmetry with the CC variant for now.

Unlike the Claude variant, Codex does NOT read `OTEL_RESOURCE_ATTRIBUTES` from the environment — its override mechanism is the project-scope `.codex/config.toml` that init-tracing wrote.

---

## Steps

1. **Confirm the worktree-local config.toml is in place.** This proves init-tracing wrote it.

   ```bash
   cat .codex/config.toml
   ```

   You should see an `[otel]` block with `environment = "archon-<workflow>"`. (Other `[otel]` settings — endpoint, auth, protocol — are inherited from `~/.codex/config.toml` and don't need to be repeated here.)

2. **Capture an ISO timestamp** to use in the confirmation line. Codex traces can't carry `archon.run_id` today, so timestamp proximity is how we'll match this trace to the parallel `claude-ping` trace:

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ
   ```

3. **Emit a single confirmation line:**

   ```
   Telemetry ping (Codex) — service=codex_cli_rs, env=archon-<workflow>, ts=<ISO timestamp>
   ```

That's the entire command. The trace Codex emits while reading this prompt and producing that line is what we're measuring.

---

## Verification (after the workflow run)

1. Open Logfire (zpm project).
2. Filter: `WHERE service.name = 'codex_cli_rs' AND env LIKE 'archon-%'`.
3. Find the most recent trace matching the timestamp printed above.
4. Confirm the trace carries:
   - `service.name = codex_cli_rs` (default; tells you which tool emitted it)
   - `env = archon-<workflow>`

To correlate this trace with the parallel `claude-ping` trace, use timestamp proximity (both should land within seconds of each other) or the run-id printed by the CC ping. Direct correlation by `archon.run_id` will not work for the Codex side until #7821 lands.

If `env=native` shows up instead of `archon-<workflow>`, the project-scope `.codex/config.toml` isn't being picked up — verify the worktree has the file at `<cwd>/.codex/config.toml` and that the `codex` CLI is being invoked with cwd inside the worktree.

If no trace shows up at all, Codex's OTEL configuration is missing at a layer above this workflow (`~/.codex/config.toml` not pointing at Logfire, network egress, etc.) — out of scope for this test.
