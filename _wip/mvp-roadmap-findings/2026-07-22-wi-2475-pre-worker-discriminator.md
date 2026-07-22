# WI-2475 — pre-Worker run-smoke discriminator

**Work Item:** WI-2475 (Discriminate DNS vs Cloudflare edge vs GitHub
Actions runner cause of the pre-Worker connectivity gap)

**Result:** Cloudflare's rate limiter is the root cause. Zone Analytics records
`action=block`, `source=ratelimit`, and rule ID
`4bf51dbfc2ad4c17a77099e5db854212` at the exact browser-failure timestamps in
every required incident. The events identify Microsoft ASN 8075 and the same
Linux HeadlessChrome user agent as the GitHub Actions jobs. A Cloudflare Ray
and rate-limit decision prove that DNS resolution and the runner path reached
Cloudflare; the block occurred at the edge before the Worker ran.

A phase-aware probe now runs across both Playwright lanes in `run-smoke` and
records the missing signals for the next incident. No retry cap, TanStack
retry count, Playwright retry/timeout, quarantine entry, lane classification,
or required-check behavior was changed.

## 1. Incident property and historical evidence

Property **I** is a concurrent run-smoke interval in which selected browser
flows lose multiple routes on `api-stg.mentomate.com`, Chromium receives no
HTTP response (`status=-1`, `net::ERR_FAILED`, no server IP), and no matching
request is observable at the Worker/application boundary. The failed UI
locator is downstream evidence only; it is not part of the definition.

| Run | Browser evidence | Cloudflare Zone Analytics evidence | GitHub-hosted runner |
|---|---|---|---|
| `29688502157` | All-route terminal burst `13:21:22.416–13:21:28.866Z` (6.450s). | 9 rate-limit blocks from `13:21:22–13:21:32Z`; the first event is in the same second as the first browser failure. Blocked routes include `/v1/activation-events` and `/v1/profiles`. | job `88196967102`; `GitHub Actions 1000041931`; `ubuntu-latest`; ASN 8075 |
| `29671898435` | All-route terminal burst `03:38:34.600–03:38:40.182Z` (5.582s). | 7 rate-limit blocks from `03:38:32–03:38:40Z`; events cover the entire browser-failure interval. Blocked routes include `/v1/now`, `/v1/profiles`, and `/v1/activation-events`. | job `88152392894`; `GitHub Actions 1000041496`; `ubuntu-latest`; ASN 8075 |
| `29826201916` | Quiz-results absent on first attempt and retry, then learner/parent retries; required-stable step timed out at five minutes. | 33 rate-limit blocks from `11:33:34–11:36:45Z`, in bursts matching the first attempt, retry, later learner/parent attempts, and reset call. | job `88620058287`; `GitHub Actions 1000002933`; `ubuntu-latest`; ASN 8075 |
| `29827835935` (exact main) | Quiz first attempt: four `net::ERR_FAILED` requests over `11:58:18.014–11:58:21.177Z` (3.163s). Retry: 20 failures across eight routes over `11:58:53.279–11:59:07.190Z` (13.911s). Learner and parent traces have 11 and 12 `net::ERR_FAILED` requests respectively. | 38 rate-limit blocks from `11:58:13–12:00:58Z`. `/v1/profiles` and `/v1/activation-events` blocks begin at `11:58:17Z`; the retry burst covers report, profile, now, and activation routes through `11:59:10Z`. | job `88625219282`; `GitHub Actions 1000003045`; `ubuntu-latest`; ASN 8075 |

The two July 19 incidents and raw queries are preserved in
`2026-07-19-run-smoke-failure-taxonomy-and-staging-root-cause.md`. The July
21 artifact summaries above were extracted before the credential-bearing
Playwright artifacts were removed; this investigation did not download or
republish them again.

An additional clean-current-main reproduction, run `29829373808`, provides a
same-day independent check. Its quiz first/retry snapshots were byte-identical
profile/server-unreachable pages. The browser bursts were
`12:27:47.390–12:27:50.523Z` and `12:28:59.107–12:29:02.150Z`. Zone Analytics
records 17 blocks by the same rate-limit rule from `12:27:45–12:29:01Z`,
including `/v1/profiles` and `/v1/activation-events` during both bursts.

### Duration distribution

The earlier 5–6.5 second sizing premise is not the current envelope:

- Historical client-visible terminal spans include 3.163s, 5.582s, 6.450s,
  7.559s (the July 21 isolated single-worker probe), and 13.911s. These are
  lower bounds when the test stops before recovery.
- The two cleanest Worker-accounting gaps are 14s and at least 18s.
- July 21 capped-fetch traces show first sequences still failing at the final
  7.5s attempt and recovery only in the higher-level query replay around
  9–12s. That replay was subsequently removed because it multiplied the
  bounded sequence; it was observation, not a valid cure.

Therefore WI-2451's bounded replay remains a valid client mitigation for a
safe request whose outage clears within its existing 7.5s schedule. It
cannot be represented as the infrastructure cure for the observed 9–12s+
members of **I** without widening the cap or adding another retry owner.
Both are prohibited here, so no such widening was made.

## 2. Zone Analytics resolves the candidate

### Available data

- GitHub Actions jobs API: job/run times, conclusion, runner name/ID/group,
  and image label.
- Sentry Discover/Errors: exact UTC windows around each trace. The absence of
  matching application activity is consistent with an edge block.
- Cloudflare account-level `workersInvocationsAdaptive`: script
  `mentomate-api-stg`, UTC second, status and colo. It independently confirms
  that the blocked requests did not invoke the Worker.
- Cloudflare zone-level `firewallEventsAdaptive`: queried for
  `api-stg.mentomate.com` over every incident window. Each result supplies
  UTC time, action, source, rule ID, Ray ID, route, user agent, client ASN,
  and country. All returned incident events have:

  ```text
  action:  block
  source:  ratelimit
  ruleId:  4bf51dbfc2ad4c17a77099e5db854212
  client:  ASN 8075 (Microsoft), US, Linux HeadlessChrome
  ```

The token initially lacked Zone Analytics Read. After the operator added that
read-only permission on 2026-07-22, the same historical queries returned the
events above. Cloudflare's official GraphQL example documents the dataset and
fields used by this investigation:
[firewall-event query](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-firewall-events/).

### Candidate decision table

| Candidate | Decisive signal | Decision |
|---|---|---|
| DNS | Explicit resolver failure before TCP, with no edge receipt. | Ruled out: Cloudflare assigned Ray IDs and evaluated the requests. |
| GitHub Actions runner network | Failure before the request reaches Cloudflare. | Ruled out as the failure mechanism: ASN 8075 identifies the source, but Cloudflare received and blocked its requests. |
| Cloudflare edge/security | A zone event for the same host, route, client, and UTC interval, with an edge action before Worker invocation. | Confirmed: all five queried runs contain blocks from the same rate-limit rule. |

The repository currently describes the custom staging domain as
"non-rate-limited" and therefore runs four Playwright workers. The zone
configuration contradicts that assumption. This is a Cloudflare edge-policy
fault, not a Worker cold start, Worker application error, Neon failure, or
unexplained ambient network flake.

**Cure owner/action:** inspect Cloudflare rule
`4bf51dbfc2ad4c17a77099e5db854212` and change its staging-host behavior so the
expected parallel smoke workload is not blocked. Preserve production
protection and avoid a blanket bypass for all GitHub-hosted traffic. The
diagnostic token can read Analytics but cannot read the zone Rulesets API, so
this report does not invent the rule's threshold or expression. The durable
configuration change needs its own mutation-sensitive verification; client
retry/timeout widening is not a cure.

## 3. Repeatable next-incident discriminator

`scripts/playwright-edge-probe.cjs` runs before V2 Playwright starts and is
stopped after legacy smoke. Every sample uses a fresh HTTPS connection to
the public `/v1/health` route and records a sanitized JSONL allowlist:

- UTC start/end, duration, unique probe ID, GitHub run/attempt/job and runner;
- DNS result/address/family and lookup timing;
- TCP connect and TLS secure-connect timing/protocol/authorization;
- HTTP status, CF-Ray, colo, `cf-mitigated`, and Cloudflare server marker;
- Worker correlation: valid health JSON plus deployed SHA; and
- a bounded error code, never request/response headers or response content.

The stop step prints each incident's first/last failure and recovery sample
into the permanent Actions log. The same UTC/probe window is then usable for
the account Worker and zone HTTP/WAF queries. The classifier is signal-driven
and has no Playwright project or test name list.

Checked fixtures cover DNS, runner network, Cloudflare edge/security,
Worker-reached health, and unresolved evidence. Workflow structure is also
checked so the probe spans both Playwright lanes, the summary runs under
`always()`, and a probe-only change triggers real smoke instead of the
pass-through check.

Live verification on 2026-07-22 produced a healthy sample with DNS success,
TCP and TLS 1.3 connection, HTTP 200, CF-Ray colo ARN, and Worker deploy SHA
`fed38fab`. A three-second watch produced two samples and no incident.

PR run `29912608850` then exercised the probe across the complete real-smoke
job while the fault was active. The required V2 gate passed, but the legacy
lane reached its five-minute timeout. The summary recorded 13 Cloudflare-edge
incidents: DNS, TCP, and TLS 1.3 succeeded; Cloudflare returned HTTP 429 with
LAX Ray IDs; Worker health proof was absent; and recovery samples returned
HTTP 200 with a deploy SHA. The sustained windows measured 8.6–10.3 seconds,
directly confirming the previously inferred 9–12-second envelope.

That first CI exercise also exposed observer load: the original 500ms cadence
made 849 health requests during the job. It cannot be left to consume a
material share of the rate budget or potentially amplify the fault it observes.
The checked workflow cadence is now 5 seconds (and the script default matches),
roughly one tenth of the request rate while still sampling the observed
9–12-second windows. This is diagnostic sampling, not a retry or tolerance
mechanism.

## 4. Mutation-sensitive evidence

### Cloudflare edge signal

The decisive expression is:

```js
Boolean(sample.http?.cfRay)
```

It was mutated to `true`, removing the required CF-Ray signal while leaving
the 403/challenge fixture unchanged. The named test went red:

```text
FAIL scripts/playwright-edge-probe.test.ts
  [WI-2475] classifyProbeSample
    ✕ stays unresolved when the decisive CF-Ray edge signal is absent

Expected: "unresolved"
Received: "cloudflare-edge-security"

Test Suites: 1 failed, 1 total
Tests:       1 failed, 7 skipped, 8 total
```

The exact expression was restored.

### Production-shaped runner-network signal

The implementing expression is:

```js
sample.tcp?.ok !== true
```

Changing it back to `sample.tcp?.ok === false` made the production-shaped
fixture (`tcp: null`, matching a socket that never emits `connect`) go red:

```text
FAIL scripts/playwright-edge-probe.test.ts
  [WI-2475] classifyProbeSample
    ✕ identifies a runner network path failure after successful DNS

Expected: "runner-network"
Received: "unresolved"

Test Suites: 1 failed, 1 total
Tests:       1 failed, 9 skipped, 10 total
```

The exact expression was restored.

### Probe change surface

The workflow case arm is:

```text
|scripts/playwright-edge-probe*
```

Removing that exact arm made the named contract red:

```text
FAIL scripts/playwright-edge-probe.test.ts
  [WI-2475] run-smoke workflow probe contract
    ✕ runs real smoke when the probe implementation or contract changes

Expected substring: "scripts/playwright-edge-probe*"
Received string:    <change-surface case without the probe arm>

Test Suites: 1 failed, 1 total
Tests:       1 failed, 9 skipped, 10 total
```

The arm was restored and the focused suite returned 10/10 green. Full red
records are retained in `.workitem-artifacts/WI-2475/` for lifecycle
evidence.

### Non-amplifying probe cadence

The workflow expression is:

```text
--interval-ms 5000
```

Mutating it back to the live-run value `--interval-ms 500` made the span
contract red:

```text
FAIL scripts/playwright-edge-probe.test.ts
  [WI-2475] run-smoke workflow probe contract
    ✕ probes continuously across both Playwright lanes and always emits a summary

Expected substring: "--interval-ms 5000"
Received string:    <probe command with --interval-ms 500>

Test Suites: 1 failed, 1 total
Tests:       1 failed, 9 skipped, 10 total
```

The five-second expression was restored before green verification.
