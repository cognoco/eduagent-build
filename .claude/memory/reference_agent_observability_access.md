---
name: reference_agent_observability_access
description: "How the agent reaches Sentry + Inngest programmatically (token locations, hosts, plan gating)"
metadata: 
  node_type: memory
  type: reference
  created: 2026-07-12
  last_confirmed: 2026-07-12
  status: active
  originSessionId: e4fddf1e-c6e3-4067-b3c4-777ec3856ceb
---

**Sentry** (org `zwizzly`, EU region — API host `https://de.sentry.io`, project `mentomate-api` id `4511717632704592`):
`SENTRY_AUTH_TOKEN` in **Infisical** `zwizzly-global`/`prod`/`/agents-shared` (auto-loads into agent shells fleet-wide via `~/.config/nexus/secrets.conf` → `host.env`; read on-demand with `estate-secrets read --project zwizzly-global --env prod --path /agents-shared --name SENTRY_AUTH_TOKEN`). Internal-integration token; scopes cover alert-rule CRUD + issue/project/org read. Used to create the 16 `[LH]` launch-health alert rules. Org upgraded to **Team** (`am3_team`) 2026-07-12. **Business-gated (unavailable on Team):** custom inbound message-filters (`custom-inbound-filters`) AND per-key DSN rate limits (PUT silently no-ops). Alert-rule types: issue alerts `POST /projects/{org}/{proj}/rules/` (frequency must be ≥5; `NotifyEmailAction`→IssueOwners/ActiveMembers is the only wired action — no Slack/pager); metric via `/organizations/{org}/alert-rules/`.

**Inngest** (no separate token needed — OPQ-79 redundant): the app **`INNGEST_SIGNING_KEY`** in **Doppler** `mentomate`/`prd` (and `/stg`) authenticates the Inngest REST API as Bearer at `https://api.inngest.com/v1`. Event/run-centric only: `/v1/events`, `/v1/events/{id}/runs`, `/v1/runs/{id}` (status Completed/Failed/Cancelled). `/v1/apps` + `/v1/functions` 404 — no function inventory. Enough for fleet health / OPQ-66-style run checks.

Both keys used in-process only, never printed. See [[doppler-secrets]], [[project_inngest_staging]].
