# Runbook Directory

Operational review completed against current code, workflows, and configuration on 2026-07-14. Runbooks marked **Update required** must not be followed beyond their still-valid diagnostic sections until the warning at the top is resolved.

| Runbook | Action | Operational disposition |
| --- | --- | --- |
| [`activation-funnel-queries.md`](activation-funnel-queries.md) | Update required | Queries remain valid; daily activation-retention automation replaces the obsolete manual production DELETE. |
| [`concurrent-agent-working-tree-wipe.md`](concurrent-agent-working-tree-wipe.md) | Update required — high risk | Diagnosis is useful; blanket `git restore .` can destroy mixed uncommitted work and is disabled. Align recovery with worktree ownership. |
| [`launch-health-alerts.md`](launch-health-alerts.md) | Update required | Existing buckets are code-backed; add activation-retention delayed/terminal signals and record external console proof. |
| [`llm-kill-switch.md`](llm-kill-switch.md) | Update required — high risk | Key/guard remain live; require rendered config, explicit remote environment/namespace verification, before/after reads, approval, and rollback evidence. |
| [`llm-model-vetting.md`](llm-model-vetting.md) | Update required | Keep policy, but define executable change classes, exact current eval commands, pricing/latency/safety evidence, and master↔record CI linkage. |
| [`local-db-testing.md`](local-db-testing.md) | Keep current | Canonical disposable pgvector/Postgres local-test procedure; paths, ports, loaders, and CI shape match code. |
| [`nativewind-windows.md`](nativewind-windows.md) | Updated | Patch/Metro workaround remains current; Android launch instructions now use PowerShell and the dev-client package. |
| [`production-worker-secret-sync.md`](production-worker-secret-sync.md) | Keep current | Matches the 30-minute workflow, credentials, rendered config, secret sync, health verification, and alert path. |
| [`retention-slo-alerts.md`](retention-slo-alerts.md) | Updated — high risk | Summary/reconciliation SLO remains unique; disabling purge and manually asserting `purgedAt` are prohibited. Canonical purge alerts live in launch-health. |
| [`session-llm-streaming-recovery.md`](../_archive/runbooks/2026-07-14-stale-runbook-cleanup/session-llm-streaming-recovery.md) | Archived — addressed | Historical PR301–303 incident. Current routing, recovery code, tests, and maintenance surfaces own the guardrails. |
