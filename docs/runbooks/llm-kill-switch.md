# Runbook: LLM Aggregate Spend Guardrail + Traffic Kill Switch

> **SAFETY CORRECTION (2026-07-14): DO NOT COPY THE KV COMMANDS UNTIL THE TARGET IS PROVEN.** Render the target environment's Wrangler config from Doppler, confirm the Worker and `SUBSCRIPTION_KV` namespace in Cloudflare, use remote targeting, capture a before-read, obtain operator approval, then write and verify with an after-read. Never hand-type a namespace ID from a placeholder config. KV propagation is not guaranteed to be immediate; verify from the served environment before declaring recovery.

**WI-1505.** Operator procedure for the aggregate LLM spend/volume
observability signal and the emergency kill switch that stops or degrades
learner-facing LLM traffic without a mobile app release or an API worker
redeploy.

## 1. What this is

Two related pieces:

1. **Observability** — every LLM call emits a structured `llm.stop_reason`
   log line tagged with `provider` and `environment` (see
   `apps/api/src/services/llm/router.ts` → `logStopReason`). An external
   log/metrics pipeline (Sentry Logs, Cloudflare Logpush, or whatever this
   deployment's log sink is) sums that line by `(provider, environment)` for
   the authoritative daily request-volume/spend total. A secondary,
   best-effort **in-process** signal (`recordVolumeMetric` in `router.ts`)
   emits a structured `logger.warn` **log line** with
   `event: llm.volume.daily_threshold_exceeded` (plus `surface`, `provider`,
   `environment`, `count`, `threshold`, `utc_date` fields) when a single Worker
   isolate's own count for a `(provider, environment)` pair crosses
   `LLM_DAILY_VOLUME_ALERT_THRESHOLD` (`5000`, exported from `router.ts`)
   within a UTC day. This is a **queryable log line** on the deployment's log
   sink (Sentry Logs / Cloudflare Logpush) — **not** a Sentry error or
   captureMessage event. This is NOT a globally accurate daily total —
   Cloudflare Workers isolates are ephemeral and do not share memory — it is
   an early-warning signal for a single hot isolate; treat the external
   log-pipeline sum as authoritative. The operator **alert rule** that pages on
   `event: llm.volume.daily_threshold_exceeded` lives on the WI-1500 operator-
   console alert-rules, not in this codebase.

2. **Kill switch** — a KV-backed boolean, read fresh on every request, that
   blocks learner-facing LLM traffic before any provider is contacted.

## 2. Switch location

- **KV namespace:** `SUBSCRIPTION_KV` (reused — no new namespace/binding was
  created; see `apps/api/wrangler.toml` for the per-environment namespace
  IDs, and `apps/api/src/services/kv.ts` for `readSubscriptionStatus` /
  `writeSubscriptionStatus`, the existing pattern this reuses).
- **Key:** `llm:kill-switch` (constant: `LLM_KILL_SWITCH_KEY` in
  `apps/api/src/services/kv.ts`).
- **Value:** `"1"` = kill switch ON (traffic blocked). Any other value, or key
  absence, = OFF. Writing `false` **deletes** the key rather than writing
  `"0"`, so a stray value can never be misread as "on".
- **Read path:** `readLlmKillSwitch(kv)` (`apps/api/src/services/kv.ts`) is
  called every request from `apps/api/src/middleware/llm.ts` (`llmMiddleware`),
  which sets the module-level flag in `apps/api/src/services/llm/router.ts`
  via `setLlmKillSwitchActive(...)`.
- **Enforcement point:** `checkLlmKillSwitch()` in
  `apps/api/src/services/llm/router.ts`, called as the FIRST statement in
  both `routeAndCall()` (the single choke point ~20 call sites route through)
  and `routeAndStream()` (the separate streaming entry point the learner
  chat/exchange flow uses) — before `getModelConfig`/provider selection,
  before any network call.

## 3. How to flip it (operator procedure)

The switch is a raw KV write. Use `wrangler kv key put`, scoped to the target
environment's `SUBSCRIPTION_KV` namespace (the namespace ID is Doppler-managed
per environment — see `apps/api/wrangler.toml` comments for the
`CF_KV_SUBSCRIPTION_ID_{DEV,STG,PRD}` Doppler references, or look up the
binding in the Cloudflare dashboard: Workers & Pages → KV).

**Turn ON (block/degrade LLM traffic):**

```bash
wrangler kv key put --remote --namespace-id <VERIFIED_TARGET_NAMESPACE_ID> "llm:kill-switch" "1"
```

**Turn OFF (resume traffic):**

```bash
wrangler kv key delete --remote --namespace-id <VERIFIED_TARGET_NAMESPACE_ID> "llm:kill-switch"
```

Either command is a plain KV write — no deploy, no CI run, no mobile release.
The read occurs in `llmMiddleware` on every request, but KV propagation may lag.
Verify both the remote KV read and served behavior; do not infer global edge
propagation from one request.

To confirm the current state without changing it:

```bash
wrangler kv key get --remote --namespace-id <VERIFIED_TARGET_NAMESPACE_ID> "llm:kill-switch"
```

(Prefer a value round-trip through Doppler-scoped `wrangler` config rather
than hand-typing the namespace ID; per `docs/project_context.md`/`AGENTS.md`,
secrets and infra IDs live in Doppler, not plaintext.)

## 4. Expected user-facing behavior when active

`checkLlmKillSwitch()` throws the SAME `CircuitOpenError` the existing
provider circuit breaker throws on a real outage (`provider: 'kill-switch'`,
`circuitKey: 'llm:kill-switch'` — distinguishable from an organic provider
trip in Sentry/logs by the `provider` tag). Because this is the identical
error type already wired everywhere:

- `apps/api/src/index.ts`'s global error handler maps it to
  `503 { code: ERROR_CODES.LLM_UNAVAILABLE, message: "LLM provider ... is
  temporarily unavailable. Please try again in a moment." }` — the same
  response shape and copy path the mobile client already handles for a real
  provider outage. No raw provider error text reaches the client; no new
  mobile-side handling is required.
- `apps/api/src/routes/sessions.ts` has the same `CircuitOpenError` handling
  for both the non-streaming and streaming (SSE) exchange paths, so an
  in-progress or new session start degrades gracefully rather than hanging or
  crashing.
- All ~20 `routeAndCall`/`routeAndStream` callers (assessments, book
  generation, curriculum, dictation, exchanges, quiz, recall bridge, etc.)
  inherit this uniformly — no per-flow code change was needed.

## 5. Alert threshold values

| Signal | Threshold | Where |
|---|---|---|
| Aggregate daily volume (authoritative) | Operator-configured on the external log/metrics pipeline over the `llm.stop_reason` log line, grouped by `(provider, environment)` | Sentry Logs / Cloudflare Logpush query — no fixed number shipped in code; set per deployment's traffic baseline |
| Per-isolate early warning (best-effort) | `LLM_DAILY_VOLUME_ALERT_THRESHOLD = 5000` requests, per `(provider, environment)`, per isolate, per UTC day | `apps/api/src/services/llm/router.ts` — emits a structured `logger.warn` **log line** with `event: llm.volume.daily_threshold_exceeded` (a queryable log record on Sentry Logs / Cloudflare Logpush, **not** a Sentry error/captureMessage event) |

Tune `LLM_DAILY_VOLUME_ALERT_THRESHOLD` in `router.ts` if the per-isolate
signal is too noisy or too quiet once real traffic volume is known; it is a
named exported constant, not a magic number. The **alert rule** that fires on
this log event is configured on the WI-1500 operator-console alert-rules (a
metric-emission hook here + an alert rule there), not in this repo.

## 6. Rollback / recovery

Turning the switch OFF (delete the KV key, §3) is the rollback — it is fully
reversible and takes effect on the next request with no data loss (no
requests are queued or buffered while the switch is on; blocked requests
simply receive the 503 and the caller is expected to retry, matching existing
circuit-breaker behavior). No database migration, no code deploy, and no
mobile release are involved in either direction.

If `readLlmKillSwitch` itself fails (a KV outage, not an operator flip), it
**fails OPEN** — traffic continues rather than being silently blocked by an
infra gap — and the read error is emitted as a structured `logger.warn` **log
line** with `event: kv.llm_kill_switch.read_error` (a queryable log record on
the log sink — Sentry Logs / Cloudflare Logpush — **not** a Sentry error
event), so a persistent KV outage is visible to whoever queries/alerts on that
event. This is a deliberate asymmetry: the kill switch is an operator-triggered
override, not a safety invariant, so on ambiguity the safer default is "keep
serving" rather than "silently kill all learner traffic because KV hiccuped."
