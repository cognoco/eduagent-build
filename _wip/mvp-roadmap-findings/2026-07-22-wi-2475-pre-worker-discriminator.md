# WI-2475 — pre-Worker run-smoke discriminator

**Work Item:** WI-2475 (Discriminate DNS vs Cloudflare edge vs GitHub
Actions runner cause of the pre-Worker connectivity gap)

**Result:** The historical incidents are confirmed at the pre-Worker
boundary, but the retained telemetry cannot honestly select DNS, Cloudflare
edge/security, or the GitHub-hosted runner network as the final cause. The
missing discriminator is Cloudflare Zone Analytics (`Zone Analytics Read`)
or contemporaneous DNS/TCP/TLS phase data from the runner. This is the
documented-gap outcome allowed by AC-3, not a claim that the three candidates
are equivalent.

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

| Run | Browser evidence | Worker/application evidence | GitHub-hosted runner |
|---|---|---|---|
| `29688502157` | All-route terminal burst `13:21:22.416–13:21:28.866Z` (6.450s). | Sentry stream stops after `13:21:18Z`; zero matching error events. Workers Adaptive Invocations has no row `13:21:19–13:21:32Z` (14s), colo SEA. | job `88196967102`; `GitHub Actions 1000041931`; `ubuntu-latest` |
| `29671898435` | All-route terminal burst `03:38:34.600–03:38:40.182Z` (5.582s). | Last matching Sentry profile transaction `03:38:31Z`; zero matching errors. Last Worker row `03:38:32Z`, none through query end `03:38:50Z` (at least 18s observed), colo SJC. | job `88152392894`; `GitHub Actions 1000041496`; `ubuntu-latest` |
| `29826201916` | Quiz-results absent on first attempt and retry, then learner/parent retries; required-stable step timed out at five minutes. The retained log establishes the failure family but contains no DNS/TCP/TLS or CF-Ray data. | No request-level edge correlation was retained. Aggregate Sentry/Workers rows cannot be assigned to one failed request while other flows run concurrently. | job `88620058287`; `GitHub Actions 1000002933`; `ubuntu-latest` |
| `29827835935` (exact main) | Quiz first attempt: four `net::ERR_FAILED` requests over `11:58:18.014–11:58:21.177Z` (3.163s). Retry: 20 failures across eight routes over `11:58:53.279–11:59:07.190Z` (13.911s). Learner and parent traces have 11 and 12 `net::ERR_FAILED` requests respectively. All four snapshots show the same profile/server-unreachable boundary. | The first interval has no Worker row or Sentry profile transaction during the failed seconds. The retry overlaps aggregate successful rows from other concurrent flows, and the historical data has no Ray/probe identifier with which to separate them. The zone WAF/HTTP query is permission-denied. | job `88625219282`; `GitHub Actions 1000003045`; `ubuntu-latest` |

The two July 19 incidents and raw queries are preserved in
`2026-07-19-run-smoke-failure-taxonomy-and-staging-root-cause.md`. The July
21 artifact summaries above were extracted before the credential-bearing
Playwright artifacts were removed; this investigation did not download or
republish them again.

An additional clean-current-main reproduction, run `29829373808`, provides a
same-day independent boundary check. Its quiz first/retry snapshots were
byte-identical profile/server-unreachable pages. The first terminal burst was
`12:27:47.390–12:27:50.523Z`; the retry burst was
`12:28:59.107–12:29:02.150Z`. Workers Adaptive Invocations has no row after
`12:27:41Z` through the first burst. For the retry, the last preceding rows
are at `12:28:57Z` and there is no row during the failed seconds.

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

## 2. What was queried and why the final candidate remains unresolved

### Available data

- GitHub Actions jobs API: job/run times, conclusion, runner name/ID/group,
  image label. It retains no historical DNS lookup, socket-connect, TLS, or
  runner-network trace for these jobs.
- Sentry Discover/Errors: exact UTC windows around each trace. This proves
  absence at the application boundary only when a failed request can be
  correlated; concurrent flows produce unrelated aggregate rows.
- Cloudflare account-level `workersInvocationsAdaptive`: script
  `mentomate-api-stg`, UTC second, status and colo. It proves the pre-Worker
  layer for the two clean gaps, but has no URL, DNS phase, runner identity,
  or request identifier with which to choose the residual candidate.
- Cloudflare zone-level `firewallEventsAdaptive`: queried for
  `api-stg.mentomate.com` over the July 21 incident windows, selecting only
  UTC time, action, source and Ray ID. The API returned:

  ```text
  Actor <redacted-token> does not have permission
  'com.cloudflare.api.account.zone.analytics.read' for zone
  65eeb0ef4b0726b82aa2a64d393be362
  ```

Cloudflare's official GraphQL examples place firewall-event investigation in
Zone Analytics and document Analytics Read as the required permission:
[firewall-event query](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-firewall-events/),
[GraphQL errors](https://developers.cloudflare.com/analytics/graphql-api/errors/).

### Candidate decision table

| Candidate | Decisive signal | Historical state |
|---|---|---|
| DNS | Explicit resolver failure such as `EAI_AGAIN`/`ENOTFOUND`, before TCP. | Not recorded. Remains possible. |
| GitHub Actions runner network | DNS succeeds, then TCP never connects with a runner-path error such as `ENETUNREACH`/`ETIMEDOUT`. | Not recorded. Remains possible. |
| Cloudflare edge/WAF/bot management | TLS reaches Cloudflare and an edge response carries CF-Ray plus a challenge/403/429, while the exact public health route does not produce Worker health proof. | Zone event query is permission-denied. Remains possible. |

No row supports selecting one of those candidates over the others. Naming a
specific cause would be fabrication. The supported conclusion is narrower:
the failure occurs before Worker invocation and is colo-agnostic; Worker
cold-start, Worker application code, and Neon are not candidates.

**Owner/action needed:** the operator or Cloudflare credential owner must
grant read-only Zone Analytics access to the diagnostic token, or run and
return the equivalent zone HTTP/WAF query for the incident UTC windows.
Historical retention may prevent backfill even after access is granted; the
new probe prevents that from reopening this Work Item indefinitely.

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
the account Worker query and, once permission exists, the zone HTTP/WAF
query. The classifier is signal-driven and has no Playwright project or test
name list.

Checked fixtures cover DNS, runner network, Cloudflare edge/security,
Worker-reached health, and unresolved evidence. Workflow structure is also
checked so the probe spans both Playwright lanes and the summary runs under
`always()`.

Live verification on 2026-07-22 produced a healthy sample with DNS success,
TCP and TLS 1.3 connection, HTTP 200, CF-Ray colo ARN, and Worker deploy SHA
`fed38fab`. A three-second watch produced two samples and no incident.

## 4. Mutation-sensitive evidence

The decisive Cloudflare expression is:

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

The exact expression was restored and the focused suite returned 8/8 green.
The full red record is retained in
`.workitem-artifacts/WI-2475/mutation-red.txt` for lifecycle evidence.
