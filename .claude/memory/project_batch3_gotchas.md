---
name: batch3-operational-gotchas
description: "Durable gotchas from the Batch 3 (V2 cutover) shepherd run — doppler double-wrap, gate-fixture blind spot, reviewer infra codes, deploy-approval gate"
metadata: 
  node_type: memory
  type: project
  created: 2026-07-11
  last_confirmed: 2026-07-11
  status: active
  originSessionId: 9de690ff-6947-4cf4-b828-7dc15bf0b9e9
---

- `pnpm test:llm:*` package scripts re-wrap via `scripts/doppler-run.mjs` — an outer `env VAR=x doppler run ...` gets OVERRIDDEN by the inner doppler injection. To override a Doppler value for one run, call the underlying `pnpm exec tsx scripts/<pass>.ts` directly (or flip the Doppler secret and restore).
- The enduser-session gate's fixtures are ALL minors → the WI-1052 under-18 gate routes every call to `approvedTextFallbackConfig` (Cerebras-first) on BOTH legacy and V2 — this gate cannot distinguish flag states by provider; only premium-routing-pass (adult cases) can.
- Autonomous reviewer (reviewer:codex:global) infra codes: `revision_missing` = it cannot process a sanctioned descriptive (no-commit) Fixed In → not a finding; dispose via an evidenced in-session `/cosmo:qa` + `/cosmo:review` pass (producer≠closer). Its env also sometimes can't reach notion/github (`needs_human` evidence-unavailable pauses).
- Prod deploys gate on the GitHub `production` Environment protection rule (reviewers: jojorgen/crowka) — agents must never click through it even when token-capable.
- Doppler→Worker: no auto-sync; local `pnpm secrets:sync` is blocked by CF_KV_* render vars that exist only as GH Actions secrets → the sanctioned sync path is the Deploy workflow (`workflow_dispatch` with api_environment).
- Reviewer bounces enforce AC text literally: a shepherd-accepted scope deferral MUST be reflected by an AC restatement on the page (with the operator ruling cited) before re-finalize, or it re-bounces (WI-1779 bounce 2).
