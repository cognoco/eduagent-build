# Runbook: LLM Aggregate Spend Guardrail + Traffic Kill Switch

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
   within a UTC day. The production Worker entry point registers a structured
   logger sink that forwards only that exact record to `Sentry.logger.warn`,
   with the seven fields above reconstructed from an explicit allowlist.
   `enableLogs: true` makes it queryable in Sentry Logs; the original
   `console.warn` record remains available to Cloudflare. This is **not** a
   Sentry error or `captureMessage` event, and Sentry's console-log integration
   is deliberately not enabled. This is NOT a globally accurate daily total —
   Cloudflare Workers isolates are ephemeral and do not share memory — it is an
   early-warning signal for a single hot isolate; treat the external
   log-pipeline sum as authoritative. The operator alert rule is configured
   separately under WI-2706; it is not mutated by this code path.

2. **Kill switch** — a KV-backed boolean, read lazily at the first LLM router
   choke point in each LLM request, that blocks learner-facing LLM traffic
   before any provider is contacted.

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
- **Read path:** `llmMiddleware` (`apps/api/src/middleware/llm.ts`) carries the
  `SUBSCRIPTION_KV` binding into request-local `AsyncLocalStorage` with zero KV
  I/O. The first `routeAndCall()` or `routeAndStream()` choke point invokes
  `readLlmKillSwitch(kv)` (`apps/api/src/services/kv.ts`) lazily. Its in-flight
  promise and resolved result are memoized once per LLM request, so concurrent
  LLM calls in the same request share one KV read.
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
wrangler kv key put --namespace-id <SUBSCRIPTION_KV_NAMESPACE_ID> "llm:kill-switch" "1"
```

**Turn OFF (resume traffic):**

```bash
wrangler kv key delete --namespace-id <SUBSCRIPTION_KV_NAMESPACE_ID> "llm:kill-switch"
```

Either command is a plain KV write — no deploy, no CI run, no mobile release.
It takes effect on the next LLM request that reaches `routeAndCall()` or
`routeAndStream()`. Non-LLM requests do not read the switch. The promise/result
cache is request-local only; there is no isolate- or boot-level caching of this
flag. In practice this is effectively immediate — Cloudflare KV writes
propagate to the edge within seconds, and each subsequent LLM request reads the
new value.

To confirm the current state without changing it:

```bash
wrangler kv key get --namespace-id <SUBSCRIPTION_KV_NAMESPACE_ID> "llm:kill-switch"
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
| Per-isolate early warning (best-effort) | `LLM_DAILY_VOLUME_ALERT_THRESHOLD = 5000` requests, per `(provider, environment)`, per isolate, per UTC day | `apps/api/src/services/llm/router.ts` emits the canonical structured warning; `apps/api/src/index.ts` routes only that record through `apps/api/src/services/llm-volume-alert-sink.ts` to Sentry Logs while preserving the Cloudflare console line |

Tune `LLM_DAILY_VOLUME_ALERT_THRESHOLD` in `router.ts` if the per-isolate
signal is too noisy or too quiet once real traffic volume is known; it is a
named exported constant, not a magic number. The **alert rule** that fires on
this log event is configured under WI-2706 (a metric-emission hook here + an
alert rule there), not in this repo.

### 5.1 Production sink query and bounded proof

After this code lands and the API Worker is deployed through the authorized
production workflow, Sentry Logs should return the canonical record for:

```text
message:"llm.volume.daily_threshold_exceeded"
```

The record's custom attributes must be exactly `event`, `surface`, `provider`,
`environment`, `count`, `threshold`, and `utc_date`. No prompt, response,
learner text, profile/session identifier, or arbitrary logger context is
forwarded. Because the Sentry SDK enriches logs before serialization,
`beforeSendLog` reconstructs this seven-field allowlist at the final boundary
and drops every unrelated direct SDK log. `beforeSend`,
`beforeSendTransaction`, and `beforeBreadcrumb: dropConsoleBreadcrumb` remain
installed; enabling Sentry Logs does not opt into
`consoleLoggingIntegration()`.

#### Approved one-shot production trigger

After the commit containing this route is deployed through the authorized
production workflow, an authorized operator may invoke the protected
`POST /v1/maintenance/llm-volume-alert-probe` endpoint once. It accepts no
payload, requires the existing `MAINTENANCE_SECRET`, calls no LLM provider, and
emits exactly one canonical repository `logger.warn` record with
`provider=synthetic-operator-probe`, `count=1`, and `threshold=1`. Run:

```bash
node scripts/doppler-run.mjs run --project mentomate --config prd -- node --input-type=module --eval 'const secret = process.env.MAINTENANCE_SECRET; if (!secret) throw new Error("MAINTENANCE_SECRET is unavailable"); const response = await fetch("https://api.mentomate.com/v1/maintenance/llm-volume-alert-probe", { method: "POST", headers: { "X-Maintenance-Secret": secret }, redirect: "error" }); const body = await response.text(); if (!response.ok) throw new Error(`probe failed (${response.status}): ${body}`); console.log(body);'
```

The command performs one HTTP request with no retry and does not print the
secret. A successful response has this shape:

```json
{
  "emitted": true,
  "provider": "synthetic-operator-probe",
  "emittedAt": "<UTC ISO-8601 timestamp>",
  "utcDate": "<YYYY-MM-DD>"
}
```

Record `emittedAt`, then open Sentry → Explore → Logs for the production API
project, set a narrow time window around that timestamp, and run:

```text
message:"llm.volume.daily_threshold_exceeded" provider:"synthetic-operator-probe" environment:"production" count:1 threshold:1
```

Confirm one row in that invocation window. Its custom-attribute set must be
exactly these seven values (Sentry-owned timestamp, SDK, release, and trace
metadata are not custom attributes):

| Attribute | Expected value |
|---|---|
| `event` | `llm.volume.daily_threshold_exceeded` |
| `surface` | `llm_volume_alert` |
| `provider` | `synthetic-operator-probe` |
| `environment` | `production` |
| `count` | `1` |
| `threshold` | `1` |
| `utc_date` | the response's `utcDate` |

Capture the query, row, seven fields, and response timestamp as the
source-to-sink evidence for WI-2717 and the input to WI-2706.

Cleanup is deliberately empty: the trigger writes no database/KV/provider
state and creates no Sentry rule or saved query. Leave the retained probe log
under the normal Sentry Logs retention policy as evidence; do not mutate or
delete unrelated monitoring rules. A direct Sentry API/SDK call and the
separate `/maintenance/sentry-smoke` error probe do not prove this logger
transport and must not substitute for the command above. Alert-rule creation,
test notification, and cleanup remain WI-2706's separate authorized work.

## 6. Rollback / recovery

Turning the switch OFF (delete the KV key, §3) is the rollback — it is fully
reversible and takes effect on the next LLM request with no data loss (no
requests are queued or buffered while the switch is on; blocked requests
simply receive the 503 and the caller is expected to retry, matching existing
circuit-breaker behavior). No database migration, no code deploy, and no
mobile release are involved in either direction.

If the `SUBSCRIPTION_KV` binding is absent or `readLlmKillSwitch` fails (a KV
outage, not an operator flip), the switch **fails OPEN** — traffic continues
rather than being silently blocked by an infra gap. An absent binding is the
normal no-read fallback and emits no error. An actual read failure emits a
structured `logger.warn` **log line** with
`event: kv.llm_kill_switch.read_error` (a queryable log record on the log sink
— Sentry Logs / Cloudflare Logpush — **not** a Sentry error event), so a
persistent KV outage is visible to whoever queries/alerts on that event. This
is a deliberate asymmetry: the kill switch is an operator-triggered override,
not a safety invariant, so on ambiguity the safer default is "keep serving"
rather than "silently kill all learner traffic because KV hiccuped."
