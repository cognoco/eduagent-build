---
description: Telemetry probe — does Codex read OTEL_RESOURCE_ATTRIBUTES from the environment?
argument-hint: (no arguments)
---

# Telemetry Probe (Codex env-var path)

This command exists to answer one specific question:

> **Does the Codex CLI honor `OTEL_RESOURCE_ATTRIBUTES` set in the process environment?**

The workflow YAML for this node sets:

```yaml
env:
  OTEL_RESOURCE_ATTRIBUTES: archon.test_marker=envvar_propagated
```

If Codex respects the OTEL spec and forwards that env var into its trace
exporter, the resulting trace will carry the resource attribute
`archon.test_marker = envvar_propagated`.

If the attribute is missing from the trace, then Codex strips or ignores
that env var, and `.codex/config.toml` is the only effective override
mechanism.

The `[otel].environment` value in `.codex/config.toml` (written by
`archon-init-tracing`) still tags this trace as
`env=archon-test-telemetry` — that's independent of the env-var probe.
Both signals are expected on the trace if Codex respects both paths.

---

## Steps

1. **Confirm the worktree config files are in place** (same as
   `telemetry-codex-ping`):

   ```bash
   cat .codex/config.toml
   ```

   You should see an `[otel]` block with
   `environment = "archon-test-telemetry"`.

2. **Confirm the env var is set in this process** so we know the
   workflow runner did pass it through:

   ```bash
   echo "OTEL_RESOURCE_ATTRIBUTES=$OTEL_RESOURCE_ATTRIBUTES"
   ```

   Expected: `OTEL_RESOURCE_ATTRIBUTES=archon.test_marker=envvar_propagated`.

   If this prints empty or differs, the workflow runner didn't propagate
   the env: block — investigate before drawing conclusions about Codex.

3. **Capture an ISO timestamp** for trace lookup:

   ```bash
   date -u +%Y-%m-%dT%H:%M:%SZ
   ```

4. **Emit a single confirmation line:**

   ```
   Telemetry probe (Codex env-var path) — service=codex_cli_rs, env=archon-test-telemetry, test_marker=envvar_propagated, ts=<ISO timestamp>
   ```

That's the entire command. The trace Codex emits while reading this
prompt is what we measure.

---

## Verification (after the workflow run)

1. Open Logfire (zpm project).
2. Filter to this run's Codex traces:
   `WHERE service.name = 'codex_cli_rs' AND env = 'archon-test-telemetry'`.
3. Find the trace whose timestamp matches step 3 above. (There should
   be two `codex_cli_rs` traces in this run — one from `codex-ping` and
   one from this node. The probe is the more recent one if the nodes
   ran sequentially; either way, the timestamp printed in step 4 is the
   tiebreaker.)
4. **The decisive check**: does the trace carry the resource attribute
   `archon.test_marker = envvar_propagated`?

   - **YES** → Codex respects `OTEL_RESOURCE_ATTRIBUTES`. The earlier
     unverified assertion was wrong. The `env:` block on
     `adversarial-review` in `execute-cleanup-pr.yaml` IS effectively
     tagging Codex traces. Update `.archon/spike-plan.md` Tech Debt to
     close the item.
   - **NO** → Codex strips or ignores the env var. The assertion was
     correct (just unverified at the time). `.codex/config.toml` is
     the only working override path, so the `env:` block on
     `adversarial-review` is dead code and can be removed (along with
     the explicit `init-tracing` entry in its `depends_on`). Update
     `.archon/spike-plan.md` Tech Debt with the resolved finding.

If the `codex-ping` trace also lacks `env=archon-test-telemetry`, the
problem is upstream of this probe — the worktree-local
`.codex/config.toml` isn't being picked up at all. Fix that first;
this probe's result is meaningless until the baseline path works.

If neither Codex trace shows up in Logfire, Codex's OTEL configuration
is missing at a layer above this workflow (`~/.codex/config.toml` not
pointing at Logfire, network egress, missing auth) — out of scope for
this test.
