---
description: Telemetry smoke test — Codex variant. Emits one trace so we can verify archon tagging.
argument-hint: (no arguments)
---

# Telemetry Ping (Codex)

This command exists solely to generate a Codex trace inside an archon workflow run. The workflow node sets `OTEL_RESOURCE_ATTRIBUTES` via an `env:` block to the codex-variant string output by `archon-init-tracing`, so this Codex call should carry `service.name=codex-archon` plus the archon.* attributes (`archon.run_id`, `archon.workflow`, `archon.repo`).

Unlike the Claude variant, Codex doesn't read project-scope `.claude/settings.json` — the `env:` block in the workflow YAML is the override mechanism for Codex.

---

## Steps

1. **Confirm the env var is set.** This proves the workflow YAML's `env:` block + init-tracing handoff is working:

   ```bash
   echo "$OTEL_RESOURCE_ATTRIBUTES"
   ```

   You should see `service.name=codex-archon` plus the archon.* attributes.

2. **Extract the run-id** for the confirmation line:

   ```bash
   echo "$OTEL_RESOURCE_ATTRIBUTES" | grep -oE 'archon.run_id=[^,]+'
   ```

3. **Emit a single confirmation line:**

   ```
   Telemetry ping (Codex) — service=codex-archon, <archon.run_id=...>, ts=<ISO timestamp>
   ```

That's the entire command. The trace Codex emits while reading this prompt and producing that line is what we're measuring.

---

## Verification (after the workflow run)

1. Open Logfire (or whichever OTEL backend Codex is configured to send to).
2. Filter by `service.name=codex-archon`.
3. Find the trace whose `archon.run_id` matches the one printed above (this should be the **same** run-id as the Claude ping — both nodes share the run-context from init-tracing).
4. Confirm it carries `archon.workflow=test-telemetry` and `archon.repo=<basename of repo dir>`.

If the env var is empty or missing the archon.* attributes, the workflow YAML's `env: OTEL_RESOURCE_ATTRIBUTES: $init-tracing.output` interpolation isn't resolving — check init-tracing's stdout output format and confirm the workflow node is reading it correctly.

If no trace shows up at all, Codex's OTEL configuration is missing at a layer above this workflow — out of scope for this test.
