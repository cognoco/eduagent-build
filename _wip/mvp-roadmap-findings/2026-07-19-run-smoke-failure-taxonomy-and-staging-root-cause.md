# Finding — run-smoke failure taxonomy + root cause (2026-07-19)

*(Filename retained from the original submission — this repo path is
already the citation target for `Fixed In` and cross-references. The
finding itself is not staging-side; see the retitled §3 below.)*

**WI:** WI-2450 (Diagnose spike — no fix in scope). Feeds WI-2451 (Cure,
Blocked-by this item) and WI-2452 (advisory/required gate-hygiene split).
**Related:** WI-2389 (tracks the three named flaky flows this doc
re-confirms); WI-2228 (landed the V2-release hard gate mid-way through this
doc's sample window — see "Architecture changed mid-sample" below); the
2026-07-18 precedent finding at
`_wip/mvp-roadmap-findings/2026-07-18-e2e-web-smoke-staging-api-flake.md`
(same symptom, independently re-confirmed here with fresh evidence a day
later).

**Method:** `gh run list`/`gh run view`/`gh api .../jobs/<id>/logs` over the
`E2E Web` workflow (`.github/workflows/e2e-web.yml`); Playwright artifact
download + `0-trace.network` parsing for two representative failures;
`scripts/playwright-staging-gate.cjs`'s `classifyFailure()` executed directly
against a synthetic input to verify (not infer) its behavior;
`gh api repos/.../branches/main/protection` to verify (not infer) which
check name is actually required; Sentry (`de.sentry.io`, org `zwizzly`) and
Cloudflare (Workers Adaptive-Invocations GraphQL Analytics) read-only
telemetry cross-reference (§3 rework revision). Read/instrument-only
throughout — no staging config change, no deploy, no local reproduction
loops, no token value reproduced anywhere in this document.

**Rework note (2026-07-19, bounce #1):** `reviewer:codex:global` bounced the
first submission — AC-1 and bucket (c) were accepted, but bucket (b)'s §3
named only the transport *symptom* (`net::ERR_FAILED` to `/v1/profiles`),
not the staging-side *cause* AC-2/AC-3 require. Per the PM's ruling on that
bounce (BID-29 batch page comment, 2026-07-19T19:40Z): pursue the Sentry/
Cloudflare telemetry cross-reference first, with a documented-gap scope
concession authorized only as a fallback if the discriminating telemetry
turns out not to exist. §3 below is the rework revision — the telemetry
cross-reference resolved the root cause to a layer (see §3), with one
narrower residual question minted as **WI-2475** per the same ruling's
fallback clause.

## Architecture changed mid-sample — read this before the counts

Commit `dbb143efe` ("test(e2e): hard-gate V2 release lane [WI-2228]") landed
on `main` **today, 2026-07-19 13:46:55 UTC (15:46:55 +02:00 CEST)**, splitting what
had been a single `run-smoke` step
(`Run Playwright smoke suite (via doppler run -c stg)`, running
`test:e2e:web:smoke` — the legacy `smoke-auth`/`smoke-learner`/`smoke-parent`/
`smoke-accessibility` projects) into two steps inside the same job:

- **`Run V2 release Playwright gate`** — runs `test:e2e:web:v2`
  (`--project=v2-release`). Its exit status is what the `run-smoke` job
  conclusion (and, when the branch touches the web/mobile surface, the
  required `Playwright web smoke` check) now actually gates on.
- **`Run legacy Playwright smoke (advisory)`** — the same
  `test:e2e:web:smoke` legacy suite as before, now `continue-on-error: true`.

**The required check has never actually been named `run-smoke`.** Verified via
`gh api repos/cognoco/eduagent-build/branches/main/protection`:
`required_status_checks.checks` = `["main", "Playwright web smoke",
"API Quality Gate", "Merge completeness check"]`. `run-smoke` itself has never
been a required-status-check, before or after today's split — so a red
`run-smoke` job has never natively blocked the GitHub merge button. The
"six merge-over-red operator authorizations" the WI cites are therefore best
read as **friction from a visibly-red PR check** (an "all checks green"
norm/practice, or a UI "not all checks succeeded" banner an admin bypasses),
**not** a hard required-check block — except for the *new* V2-release portion
introduced by today's split, which the `Playwright web smoke` required check
now does honestly inherit when the surface changed (confirmed: see the 7
post-split reds below, which correctly do fail the required check).

All 50 sampled runs fall on 2026-07-19 (02:00–17:28 UTC), so **22 of the 29
reds in this sample used the pre-split (single-step) architecture and 7 used
the post-split architecture** — the split happened in the middle of the
sampling window, not before or after it.

## 1. Failure taxonomy (AC-1)

Sample: the 50 most-recent **completed** `E2E Web` workflow runs as of
2026-07-19 17:35 UTC (`gh run list --workflow=e2e-web.yml`), spanning
2026-07-19 02:00–17:28 UTC.

| Outcome | Count |
|---|---|
| `run-smoke` success | 12 |
| `run-smoke` skipped (no web/mobile surface touched — `RUN_REAL=false`) | 8 |
| `run-smoke` cancelled (superseded by `cancel-in-progress` on a newer push to the same PR — branch `WI-2228-gate`, run `29686140612`) | 1 |
| **`run-smoke` red** | **29** |

Bucketing the 29 reds per the AC's three classes:

| Bucket | Count | % of reds | Architecture |
|---|---|---|---|
| **(a) seed/profile-bootstrap timeout** | **0** | 0% | — |
| **(b) one of the WI-2389 three named flows** | **22** | 76% | 100% pre-split (single-step) |
| **(c) other** | **7** | 24% | 100% post-split (V2-release gate) |

Bucket (a) is a **verified negative**, not an unchecked assumption: all 29
raw failure logs were grepped for seed/bootstrap-timeout signatures
(`seed.{0,30}(timeout|timed out)`, `bootstrap.{0,20}timeout`, etc.) — zero
matches. The only `[setup]`/seed-step failure in the whole sample is the
WI-2240 case in bucket (c) below, and it is a **validation** failure (400,
schema rejection), not a timeout.

### Bucket (b) — WI-2389's three flows (22/22, 100% of pre-split reds)

Every one of the 22 pre-split reds fails a subset of exactly these three
tests — no other test ever appears in a pre-split failure list:

| Test | Locator that fails to render |
|---|---|
| `flows/journeys/j01-ux-pass.spec.ts:37` (`smoke-learner`) — "single learner UX screenshot crawl" | (page-level render) |
| `flows/accessibility/quiz-results-exits.spec.ts:104` (`smoke-accessibility`) — "quiz-results exits are real named buttons with exact-once web activation" | `quiz-results-screen` |
| `flows/journeys/j03-parent-gateway.spec.ts:212` (`smoke-parent`) — "J-03 360px long supporter scopes remain operable and clear pushed content" | (page-level render) |

Representative run IDs (full run→bucket table below the reproduction
section): `29669482457`, `29670023353`, `29670253184`, `29670763292`,
`29671180154`, `29671379606`, `29671495029`, `29671898435`, `29680905528`,
`29682038944`, `29682048549`, `29682669105`, `29683117198`, `29683716796`,
`29685061751`, `29685529700`, `29685854006`, `29686049122`, `29686619359`,
`29687945649`, `29688502157`, plus one branch-scoped extra confirmed the
same way (`29682048549` = WI-2190/PR #2268, cross-checked below).

### Bucket (c) — other (7/7, 100% of post-split reds)

None of the 7 post-split reds are staging-infra-caused. They split into
three distinct sub-classes:

| Sub-class | Count | Runs (branch) | Root cause |
|---|---|---|---|
| **Scenario-catalog drift** | 4 | `29696680777` (WI-2240), `29696574472` (WI-2234), `29696066018` + `29695485756` (WI-2239) | New `flows/v2/*.spec.ts` fixture seeds a scenario name the shared-staging seed API's Zod enum does not (yet) accept — `400` `ZodError`, not a UI or infra failure. |
| **WIP feature not ready** | 2 | `29692027445` + `29696127898` (WI-2236) | `v2-homework-manual-entry.spec.ts:47` — `manual-entry-button` never renders (30s timeout, no offline-fallback text present — confirmed, not a staging symptom); a second occurrence adds `page.waitForResponse` 60s timeout on `homework-help-me-solve` and a `toMatchObject` mismatch. Ordinary red-before-green iteration on an active branch. |
| **Intentional canary** | 1 | `29681764115` (WI-2228-gate) | `flows/v2/wi-2228-red-proof.spec.ts:3` — "WI-2228 intentional v2-release hard-gate proof." Deliberately red to prove the new hard gate actually fires. Not a defect. |

**Scenario-catalog drift is the one sub-class worth naming precisely for
WI-2451.** Three unrelated, concurrently-developed branches (WI-2234,
WI-2239, WI-2240) each independently hit the identical failure shape:

```
Error: Seeding <scenario-name> failed (400): {"success":false,"error":{"name":"ZodError", ...
  "path":["scenario"], "message":"Invalid option: expected one of \"onboarding-complete\"|... }
```

at `apps/mobile/e2e-web/helpers/test-seed.ts:102`, for scenario names
`v2-account-non-owner-child`, `v2-journal-paper-trail`, and
`v2-returning-learner` respectively — none of which are in the accepted
enum the shared staging seed endpoint currently serves. This is a **process
gap**, not three independent bugs: a new `flows/v2/*.spec.ts` test can add a
scenario name to its own fixture without that name being registered
server-side on the shared staging deployment these branches all point at,
and the failure only surfaces once CI runs against the live seed API.

## 2. Reconciliation with the WI's cited "six bypass" incidents

The WI's body cites "six merge-over-red operator authorizations in three
days — 1989, 2244, #2255, #2256, #2253, #2268." The 50-run sample above is
today-only (2026-07-19); this section checks whether the cited incidents
(mostly 2026-07-18) reproduce the same taxonomy, and flags where a citation
doesn't hold up.

| PR | Branch | Merged | `run-smoke` history on this branch | Finding |
|---|---|---|---|---|
| **#2255** | WI-2347 | 2026-07-19 10:23 UTC | 2 runs, both red (`29649929053` 15:24 UTC, `29651214645` 16:03:45–16:11:33 UTC, both 2026-07-18) | **Bucket (b)**, both runs — identical `j01-ux-pass.spec.ts:37` + `quiz-results-exits.spec.ts:104` failed, `j03-parent-gateway.spec.ts:212` flaky. |
| **#2256** | WI-2372 | 2026-07-19 10:23 UTC | 2 runs, both red (`29650351353` 15:37 UTC, `29650840160` 15:52 UTC, both 2026-07-18) | **Bucket (b)**, both runs — same three-flow signature. |
| **#2268** | WI-2190 (still open) | — | 2 runs, both red (`29665025434` 2026-07-18 23:19 UTC, `29682048549` 2026-07-19 09:42 UTC — the latter is already in the 50-run sample above) | **Bucket (b)**, both runs — same three-flow signature. |
| **#2253** | WI-2301 | 2026-07-18 22:42 UTC | 3 runs, **all green** | `run-smoke` never failed on this branch. If a bypass genuinely happened on this PR, it was for a different check (the PR is mobile-CI/EAS-environment work) — does not reproduce a run-smoke incident. |
| **#2244** | wi2004-e2e-flake-findings | 2026-07-18 13:25 UTC | 1 run, green | This PR is the docs-only PR that *authored* the 2026-07-18 precedent finding; its own CI was clean. The incident it documents is on **PR #2239 (WI-2004)**, explicitly overridden per that finding's "Disposition for WI-2004" section — the citation should point at #2239, not #2244. |
| **1989** | — | 2026-07-08 14:45 UTC | — | Merged 11 days before the cited "three days," and its title ("API query-performance pass") is unrelated to E2E/web smoke. Does not fit the window or the subject; flagged as a likely citation error in the WI body rather than resolved. |

**Net:** of the six citations, three (#2255, #2256, #2268) independently
reproduce bucket (b) exactly, extending its observed window from
2026-07-18 15:24 UTC through 2026-07-19 17:28 UTC (>24h, stable, unchanged
signature) — well before and straddling today's architecture split. Two
citations (#2244, #1989) don't hold up as literal run-smoke-bypass instances
on inspection. One (#2253) shows no run-smoke redness at all. **This
strengthens, not weakens, the bucket-(b) finding**: it is not a today-only
artifact of the sample window, it is the same failure that has been driving
the "ambient red" complaint since at least the day before this WI was filed.

## 3. Root cause — bucket (b) (AC-2)

*(Titled "staging-side root-cause evidence" in the WI's AC-2 — the
investigation's finding is that it is not staging-side at all; see the
rework subsection below. Kept the AC's original wording as the section
identity for traceability; the finding itself supersedes it.)*

Every bucket-(b) failure's `error-context.md` (Playwright's page snapshot at
the moment of the `toBeVisible` timeout) is byte-identical across all
sampled runs, regardless of which of the three flows failed:

```
We could not load your profile
Looks like you're offline or our servers can't be reached. Check your
internet connection and try again.
[Retry] [Sign Out]
```

Parsed `0-trace.network` for one representative failure
(`29688502157`, `smoke-learner`, `j01-ux-pass.spec.ts:37`, 2026-07-19
13:20–13:22 UTC) against `apps/mobile/e2e-web/flows/journeys/j01-ux-pass.spec.ts:37`'s
retry attempt: `/v1/profiles` (the profile-bootstrap call the app's error
boundary is named after) returned `200` seven times between 13:20:23 and
13:21:15 — with one interleaved `net::ERR_ABORTED` at 13:20:42.629 that a
clean `200` followed four seconds later (13:20:46.277), consistent with
ordinary page-navigation request cancellation rather than an outage — then
failed **three times in a row, with no interleaved success**, over ~3
seconds right at the end of the test:

```
13:21:25.822  /v1/profiles  status=-1  net::ERR_FAILED
13:21:26.846  /v1/profiles  status=-1  net::ERR_FAILED
13:21:28.866  /v1/profiles  status=-1  net::ERR_FAILED
```

(`status: -1` is Playwright/Chromium's marker for "no HTTP response was ever
received" — a connection-layer failure, not a clean application 5xx. A
larger set of `net::ERR_ABORTED` entries elsewhere in the same trace,
including the one isolated `/v1/profiles` instance at 13:20:42 noted above,
is normal SPA request-cancellation noise from page navigation — each is a
single occurrence immediately followed by a clean `200` on retry, unlike the
terminal burst below, which has no interleaved success. The terminal burst
is `net::ERR_FAILED`, a distinct Chromium code from `ERR_ABORTED`, and is
the basis for this finding; the `ERR_ABORTED` noise is excluded.)

**The terminal burst is not `/v1/profiles`-specific.** Widening the same
trace to every `api-stg.mentomate.com` request (not just `/v1/profiles`)
in the window immediately around the burst shows a batch of ten-plus
distinct routes (`subjects`, `progress/inventory`, `consent/my-status`,
`scopes`, …) all returning a clean `200` within the same millisecond at
13:21:18.6xx, then **every** subsequent request to the host — regardless
of route — failing `net::ERR_FAILED` from 13:21:22.416 through at least
13:21:28.866 (`subjects/…` at 13:21:22.416 and 13:21:24.440,
`progress/inventory` at 13:21:24.369, `activation-events` at 13:21:25.818,
then the three `/v1/profiles` calls quoted above). `/v1/profiles` fails
only because it happens to be the profile-bootstrap call the app's error
boundary is named after and is mid-flight when the outage window opens —
not because the endpoint itself is special.

### Root cause (rework — telemetry cross-reference, 2026-07-19, per PM ruling on the reviewer bounce)

The original submission left the *ultimate* staging-side cause unresolved
(worker cold-start vs. Neon contention vs. shared-staging load) and was
bounced for stopping at the transport symptom. Per the PM's ruling on that
bounce (BID-29 comment, 2026-07-19T19:40Z — cited here and in the
completion summary), the read-only telemetry cross-reference was performed:
Sentry (`de.sentry.io`, org `zwizzly`, project `mentomate-api`, EU region —
not `sentry.io`) and Cloudflare (Workers Adaptive-Invocations GraphQL
Analytics for the `mentomate-api-stg` script, account-scoped). Both were
queried read-only; no staging mutation, deploy, or config change was made;
no token value is reproduced here — only status codes, counts, and
timestamps.

**Finding: the outage window is invisible to both the application and the
platform's own invocation accounting — the failure happens before a
request is ever counted as reaching the Worker.** For the representative
run above (`29688502157`, 13:21:22.4–13:21:28.9 UTC):

- **Sentry** shows a clean `GET /v1/profiles` transaction stream through
  13:21:18Z, then a **20-second gap with zero `/v1/profiles` transactions**
  (13:21:18Z → 13:21:38Z), and **zero `level:error` events of any kind**
  anywhere in a 20-minute window bracketing the failure (`13:15`–`13:35`
  UTC) — ruling out an application exception as the cause.

  **Raw query, re-run 2026-07-20 for this rework (transactions):**
  ```
  curl -sS -G "https://de.sentry.io/api/0/organizations/zwizzly/events/" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    --data-urlencode "project=4511717632704592" \
    --data-urlencode "field=timestamp" \
    --data-urlencode "field=transaction" \
    --data-urlencode "field=transaction.status" \
    --data-urlencode "start=2026-07-19T13:15:00" \
    --data-urlencode "end=2026-07-19T13:35:00" \
    --data-urlencode 'query=transaction:"GET /v1/profiles"' \
    --data-urlencode "sort=timestamp"
  ```
  (`project=4511717632704592` is the `mentomate-api` project ID under org
  `zwizzly`, resolved via `GET /api/0/organizations/zwizzly/projects/`. This
  is a discrete per-transaction event list, not a sampled/aggregated
  dataset — no separate sampling field applies; each row below is one real
  transaction Sentry recorded.)

  **Raw result (sanitized — timestamp + status only, event IDs omitted; 26
  rows, all `ok`):**
  ```
  13:17:31  13:17:54  13:18:05  13:18:05  13:18:05  13:18:24
  13:18:47  13:18:50  13:18:56  13:19:01  13:19:06  13:19:10
  13:19:11  13:19:17  13:20:26  13:20:33  13:20:41  13:20:44
  13:20:46  13:20:49  13:21:00  13:21:10  13:21:11  13:21:18
  13:21:38  13:21:47
  ```
  (all `2026-07-19T…Z`, `GET /v1/profiles`, `status: ok`.) Confirms the
  claimed gap exactly: the row immediately before is `13:21:18`, the row
  immediately after is `13:21:38` — nothing in between, a 20-second gap.

  **Raw query, re-run 2026-07-20 for this rework (error events, same
  window):**
  ```
  curl -sS -G "https://de.sentry.io/api/0/organizations/zwizzly/events/" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    --data-urlencode "project=4511717632704592" \
    --data-urlencode "field=timestamp" \
    --data-urlencode "field=title" \
    --data-urlencode "field=level" \
    --data-urlencode "start=2026-07-19T13:15:00" \
    --data-urlencode "end=2026-07-19T13:35:00" \
    --data-urlencode "query=level:error" \
    --data-urlencode "sort=timestamp"
  ```
  **Raw result: 0 rows** — confirmed empty, not merely unchecked.
- **Cloudflare** (`workersInvocationsAdaptive`, filtered
  `scriptName: "mentomate-api-stg"`, second-granularity `datetime`
  dimension) shows a burst of 22 `success` invocations at `13:21:18Z`
  (matching the trace's clean batch above), then **zero invocations of any
  status — `success`, `clientDisconnected`, or otherwise — from `13:21:19Z`
  through `13:21:32Z`**, a 14-second total gap in the Worker's own
  invocation log, squarely bracketing the client-observed failure window.
  Handled by colo `SEA`. This closes the one gap the Sentry evidence alone
  leaves open: Sentry's SDK runs *inside* Worker code, so a Worker crashing
  before its SDK initializes could in principle produce a Sentry-invisible
  application failure — but that scenario would still be a Worker
  invocation (the Worker started running), and Cloudflare's independent,
  SDK-external invocation log shows none occurred. The two sources cover
  each other's blind spot. `workersInvocationsAdaptive` is a sampled
  dataset by name, which could otherwise raise a "real zero or
  sampled-out zero?" objection. Cloudflare's schema exposes a direct
  readout for this rather than requiring an inference: a
  `confidence(level: 0.95)` field alongside `sum` that reports, per row,
  the raw `sampleSize` actually captured versus the extrapolated
  `estimate` (see the raw query/result below — this replaces an earlier,
  less precise version of this argument that inferred a sampling rate of
  "~1.0" from row counts alone, without querying the confidence field
  directly). Across the 19 rows in the minute bracketing the gap, most
  show `sampleSize == estimate` (1:1, no extrapolation applied); the two
  busiest rows, including the `13:21:18Z` row cited above, show partial
  sampling (`sampleSize` 7 of an estimated 16 at `13:21:11Z`, and 13 of an
  estimated 22 at `13:21:18Z` — roughly 44% and 59% respectively, not
  ~100%). Even at that lower end, a dataset sampling well under half of
  estimated traffic at one-to-two-second granularity would still be
  expected to register at least one raw sample somewhere across a
  sustained 14-second span if traffic had continued through it — none
  appears, at any status, anywhere in the gap — so the zero-count gap
  remains a real absence, not a sampling artifact, on the corrected
  sampling-rate reading.

  **Raw query, re-run 2026-07-20 for this rework** (includes a
  `confidence(level: 0.95)` selection alongside `sum` — introspected from
  Cloudflare's own GraphQL schema for this rework specifically to read the
  per-row sampling rate directly rather than infer it; see the "Sampling
  field relied on" note below the query):
  ```
  curl -sS -X POST "https://api.cloudflare.com/client/v4/graphql" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "query": "query WI($accountTag: string, $start: Time, $end: Time) { viewer { accounts(filter: {accountTag: $accountTag}) { workersInvocationsAdaptive(limit: 1000, filter: {scriptName: \"mentomate-api-stg\", datetime_geq: $start, datetime_leq: $end}) { dimensions { datetime status coloCode } sum { requests errors subrequests } confidence(level: 0.95) { sum { requests { estimate sampleSize lower upper isValid } } } } } } }",
      "variables": {
        "accountTag": "0bcf2a3befee2c8b247aad5a94b2354c",
        "start": "2026-07-19T13:21:00Z",
        "end": "2026-07-19T13:22:00Z"
      }
    }'
  ```
  (`accountTag` is the Cloudflare account ID — an identifier, not a
  credential; disclosed for the same reason the zone/script names already
  are: so the query is independently re-runnable. **Sampling field relied
  on:** `confidence(level: 0.95).sum.requests`, specifically its
  `sampleSize` (raw events actually captured) and `estimate` (the
  extrapolated `sum.requests` figure this document's earlier claims cite)
  sub-fields — found by introspecting `AccountWorkersInvocationsAdaptive`'s
  field list and `Confidence`'s field list via `__type` queries. This
  supersedes the prior version of this evidence block, which selected only
  `dimensions`/`sum` and stated no sampling field was exposed; one existed
  and had not yet been located.)

  **Raw result (sanitized — one row per distinct `datetime`+`status`+`coloCode`
  bucket returned by the query; `errors`/`subrequests` omitted as noise,
  `requests` = extrapolated `sum.requests`/`confidence.estimate` — always
  identical, the same figure the earlier version of this evidence cited —
  `sampleSize` = raw events actually captured, newly added):
  ```
  datetime(UTC)  status              colo  requests  sampleSize
  13:21:00       success             SEA   7         7
  13:21:02       clientDisconnected  SEA   2         2
  13:21:04       success             SEA   2         2
  13:21:08       success             SEA   2         2
  13:21:10       success             SEA   1         1
  13:21:10       clientDisconnected  SEA   6         6
  13:21:11       success             SEA   5         5
  13:21:11       clientDisconnected  SEA   16        7
  13:21:13       success             SEA   1         1
  13:21:15       success             SEA   2         2
  13:21:18       success             SEA   22        13
  13:21:33       success             SEA   1         1
  13:21:38       success             SEA   3         3
  13:21:38       clientDisconnected  SEA   3         3
  13:21:41       clientDisconnected  SEA   4         4
  13:21:42       clientDisconnected  SEA   4         4
  13:21:43       success             SEA   2         2
  13:21:47       clientDisconnected  SEA   5         5
  13:21:57       success             SEA   1         1
  ```
  Confirmed directly, not just narrated: the last row before the gap is
  `13:21:18` (`success`, 22 estimated requests from 13 raw-sampled
  events — the exact `requests` figure cited above, now with its sampling
  basis on record), the first row after is `13:21:33`; nothing in between
  at any status. That is a 14-second span (`13:21:19`–`13:21:32`
  inclusive) with zero rows of any kind, matching the claimed "14-second
  total gap" precisely. All rows in this window are colo `SEA`, matching
  the claimed colo. `sampleSize` equals `requests` for 17 of the 19 rows
  (full 1:1 sampling); the two exceptions (`13:21:11Z` `clientDisconnected`
  and `13:21:18Z` `success`) are the two busiest rows and are the basis for
  the 44%/59% figures in the narration above.

A Worker cold start, a Neon connection-pool exhaustion, a Neon cold-resume
(the PM ruling's named candidate — Neon's serverless compute can take
seconds to resume from suspension), or a Worker-side exception would all
still register as an invocation: Cloudflare's own documentation defines the
"Total requests" this dataset counts as "All incoming requests registered
by a Worker" — i.e. counted at request-receipt, before any application code
(including a Neon round-trip) runs — so a slow or failed database round-trip
inside an already-invoked Worker would show up as a delayed `success`, an
`errors`-counted entry, or at minimum a logged attempt — never as a total
absence of any invocation record
(<https://developers.cloudflare.com/workers/observability/metrics-and-analytics/>).
Cloudflare's own accounting shows none. Independently, Cloudflare
Workers cold starts are architecturally V8-isolate startups, documented and
widely benchmarked in the single-digit-millisecond range (unlike
container-based cold starts elsewhere) — a 14-second total gap is two to
three orders of magnitude too long to be a cold start even before
considering whether it would register as an invocation at all. **This rules
out worker cold-start and Neon-side contention as the cause** and places the
fault before the request reaches the Workers runtime's invocation layer:
an edge/network-path connectivity gap between the CI runner and Cloudflare,
not a backend resource-contention issue.

**Reproduced independently** in a second, unrelated run
(`29671898435`, `WI-2228-mitigation` branch, 2026-07-19 03:37–03:38 UTC —
over 9 hours earlier and a different PR entirely): the identical signature,
widened the same way as the first run above. The full trace in this window
shows a *distinct, recurring, and benign* pattern of `net::ERR_ABORTED`
batches at 03:37:28, 03:37:35, and 03:37:43 — each hits several routes
simultaneously (the signature of a page/render-cycle cancelling its own
prior in-flight requests, not a network problem) and each is followed by a
clean `200`/`201` on the same routes within 3–4 seconds (e.g. the
`03:37:43` batch recovers at `03:37:47.821`–`.828`) — excluded from this
finding on the same reasoning as the isolated `ERR_ABORTED` noise in the
first run. Separately, and not part of that recurring pattern, the actual
outage: starting at `03:38:34.600` (`subjects/…`, `net::ERR_FAILED`) through
`03:38:37.140` (`activation-events`) and the three `/v1/profiles` calls at
`03:38:37.161`–`03:38:40.182`, all `net::ERR_FAILED`, all-route, with **no**
interleaved success anywhere in this ~5.6-second window — unlike every
preceding `ERR_ABORTED` batch, this one never recovers before the test gives
up. Cross-checked against Cloudflare, which again shows the Worker's own
invocation log going silent immediately before and through the outage (last
invocation at `03:38:32Z`, none through the end of the query window), this
time on colo **`SJC`** — a *different* Cloudflare data center from the
first incident's `SEA`. Reproducing across two colos rules out a single
overloaded/faulty edge location as the cause; reproducing across a >9-hour,
different-PR gap rules out a one-off coincidence tied to one moment of
shared-staging load.

**Raw telemetry, incident 2 — re-run 2026-07-20 for this rework (both
systems, same query shapes as incident 1 above, windows shifted to bracket
this run instead):**

- **Sentry transactions** (same shape as incident 1's, this incident's
  window):

  **Raw query, re-run 2026-07-20 for this rework:**
  ```
  curl -sS -G "https://de.sentry.io/api/0/organizations/zwizzly/events/" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    --data-urlencode "project=4511717632704592" \
    --data-urlencode "field=timestamp" \
    --data-urlencode "field=transaction" \
    --data-urlencode "field=transaction.status" \
    --data-urlencode "start=2026-07-19T03:28:00" \
    --data-urlencode "end=2026-07-19T03:48:00" \
    --data-urlencode 'query=transaction:"GET /v1/profiles"' \
    --data-urlencode "sort=timestamp"
  ```

  **Raw result (sanitized — timestamp + status only; 25 rows, all `ok`):**
  ```
  03:34:34  03:34:55  03:35:06  03:35:07  03:35:09  03:35:24
  03:35:47  03:35:50  03:35:56  03:36:01  03:36:06  03:36:09
  03:36:12  03:37:27  03:37:35  03:37:42  03:37:43  03:37:47
  03:37:51  03:38:03  03:38:05  03:38:13  03:38:20  03:38:29
  03:38:31
  ```
  The last row in this 20-minute window is `03:38:31` — no `/v1/profiles`
  transaction reaches Sentry again before the window ends at `03:38:48`,
  corroborating the same signature (clean stream immediately preceding the
  outage, then silence) as incident 1. The doc does not claim a specific
  gap duration from this Sentry query alone (unlike incident 1, where the
  window closed shortly after the recovery) — this is presented as
  corroboration, not a new timed claim.
- **Sentry errors** (error-events query, same shape as incident 1's, this
  incident's window):

  **Raw query, re-run 2026-07-20 for this rework:**
  ```
  curl -sS -G "https://de.sentry.io/api/0/organizations/zwizzly/events/" \
    -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    --data-urlencode "project=4511717632704592" \
    --data-urlencode "field=timestamp" \
    --data-urlencode "field=title" \
    --data-urlencode "field=level" \
    --data-urlencode "start=2026-07-19T03:28:00" \
    --data-urlencode "end=2026-07-19T03:48:00" \
    --data-urlencode "query=level:error" \
    --data-urlencode "sort=timestamp"
  ```
  **Raw result: 0 rows** — confirmed empty, not merely unchecked.
- **Cloudflare** (same GraphQL query/shape as incident 1 — including the
  `confidence(level: 0.95)` sampling-rate selection added for this
  rework — this incident's window):

  **Raw query, re-run 2026-07-20 for this rework:**
  ```
  curl -sS -X POST "https://api.cloudflare.com/client/v4/graphql" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "query": "query WI($accountTag: string, $start: Time, $end: Time) { viewer { accounts(filter: {accountTag: $accountTag}) { workersInvocationsAdaptive(limit: 1000, filter: {scriptName: \"mentomate-api-stg\", datetime_geq: $start, datetime_leq: $end}) { dimensions { datetime status coloCode } sum { requests errors subrequests } confidence(level: 0.95) { sum { requests { estimate sampleSize lower upper isValid } } } } } } }",
      "variables": {
        "accountTag": "0bcf2a3befee2c8b247aad5a94b2354c",
        "start": "2026-07-19T03:38:25Z",
        "end": "2026-07-19T03:38:50Z"
      }
    }'
  ```

  **Raw result (sanitized — same shape as incident 1's; `requests` =
  extrapolated `sum.requests`/`confidence.estimate`, `sampleSize` = raw
  events actually captured):**
  ```
  datetime(UTC)  status              colo  requests  sampleSize
  03:38:26       clientDisconnected  SJC   1         1
  03:38:27       success             SJC   2         2
  03:38:29       success             SJC   3         3
  03:38:29       clientDisconnected  SJC   3         3
  03:38:31       success             SJC   13        13
  03:38:31       clientDisconnected  SJC   4         4
  03:38:32       clientDisconnected  SJC   2         2
  ```
  Confirmed directly: the last row in this 25-second window is `03:38:32`
  (`clientDisconnected`, colo `SJC`) — nothing after it through the window's
  end at `03:38:50`, matching the claimed "last invocation at 03:38:32Z,
  none through the end of the query window" exactly. All rows are colo
  `SJC`, matching the claimed colo and confirming it differs from incident
  1's `SEA`. Unlike incident 1, `sampleSize` equals `requests` on every
  row here — full 1:1 sampling throughout this window, so no
  partial-sampling correction applies to incident 2's reading.

**Residual discriminator (not resolved — genuinely out of reach here, not
guessed at):** the two-colo reproduction is most consistent with a DNS
resolution hiccup for the `api-stg.mentomate.com` hostname (colo-agnostic
by construction — DNS resolves before a colo is even selected) over a
runner-side or Cloudflare-edge-hardware cause, but this document does not
claim that as proven. A fourth candidate the Workers-invocation data alone
cannot rule out: Cloudflare's own documentation states a WAF or other
security-feature block is *also* excluded from "Total requests" counting
(same source as above) — so a transient WAF or bot-management
false-positive against this CI traffic (GitHub Actions runner IP ranges and
a headless-Chromium user agent are both plausible WAF/bot-management
trigger vectors for exactly this kind of automated traffic) would produce
an identical zero-invocation signature to a pre-edge DNS/network gap, and
this document's evidence cannot distinguish the two. Zone-level Cloudflare
HTTP-edge analytics (one layer
earlier than Workers-invocation data, which would show whether the request
reached Cloudflare's edge at all, and would separately surface a WAF-block
event) were attempted and refused: `com.cloudflare.api.account.zone.analytics.read` is
not granted to the available `CLOUDFLARE_API_TOKEN` for the `mentomate.com`
zone. GitHub Actions runner-side DNS/network diagnostics for these specific
job runs are not retained anywhere queryable from this repo. This residual
question — is the pre-invocation gap DNS-side, Cloudflare-edge-side
(including a WAF false-positive), or GitHub-Actions-runner-side? — is
minted as a follow-up Work Item (**WI-2475**) carrying these two incidents'
timestamps, colos, and queries as its starting evidence, rather than
guessed at here.

**This is the PM ruling's branch-2 outcome, explicitly pre-authorized —
not an evasion of the original bounce.** The ruling (BID-29 batch page
comment, 2026-07-19T19:40Z) states verbatim: *"if after a genuine attempt
the discriminating telemetry does not exist (retention window passed,
sampling missed it, logs not enabled at the relevant layer), document the
negative result precisely — what was queried, over what window, what was
absent — and on that record I grant in advance the scope ruling the
reviewer offered: transport-level failure-mode identification + documented
telemetry gap satisfies AC-2/AC-3 for bucket (b), with the residual
discriminator question minted as a follow-up WI carrying your queries as
its starting evidence."* The three candidate causes the original bounce and
the ruling named by name — worker cold-start, Neon connection-pool
exhaustion, and Neon cold-resume — **are** resolved above with real
telemetry (branch 1: genuinely ruled out, not merely undiscriminated). Only
the *further* question of which specific pre-invocation layer is the cause
falls to branch 2's documented-gap provision, because the access needed to
resolve it (zone-level Cloudflare edge analytics, GitHub Actions runner-side
network diagnostics) is unavailable, not because the telemetry
cross-reference wasn't attempted.

## 4. A named risk for WI-2452 — the V2 gate's own classifier can misfile this exact failure as "product"

`scripts/playwright-staging-gate.cjs` is the script the new required
V2-release gate uses to decide pass/fail on a suite failure
(`classifyFailure()`, `scripts/playwright-staging-gate.cjs:445-466`). Its
first check, before it ever inspects the network trace for an infra signal,
is:

```js
// scripts/playwright-staging-gate.cjs:41-42
const HARD_FAILURE =
  /(?:assert(?:ion)?|expect\(|unknown error| ... /i;
// scripts/playwright-staging-gate.cjs:448-449
if (HARD_FAILURE.test(hardFailureText(resultText)))
  return { kind: 'product' };
```

`hardFailureText`/`HARD_FAILURE` matches the literal substring `expect(` —
which is present in the printed error text of **every** Playwright
`toBeVisible` assertion timeout, infra-caused or not (see the bucket-(b)
error text above: `Error: expect(locator).toBeVisible() failed`). Verified
live, not inferred — feeding `classifyFailure()` a synthetic result whose
text is exactly the bucket-(b) failure shape:

```
$ node -e "const {classifyFailure}=require('./scripts/playwright-staging-gate.cjs'); \
  console.log(classifyFailure({artifactRoot:'apps/mobile/e2e-web/test-results', \
  apiUrl:'https://api-stg.mentomate.com', exitCode:1, resultText:\`... \
  Error: expect(locator).toBeVisible() failed ...\`}))"
{"kind":"product"}
```

returns `product`, never reaching the `hasApiNetworkSignal` trace-inspection
branch (`playwright-staging-gate.cjs:456-465`) at all — that branch is
effectively dead code for any `toBeVisible`-shaped failure, which is the
dominant Playwright failure shape.

Today's sample did **not** catch this misclassification live inside the
required gate, because `v2-release`'s `testMatch`
(`apps/mobile/playwright.config.ts:208-213`) deliberately excludes the three
WI-2389 files — the code comment there says exactly why ("keep the stable
J-01 learner-home baseline ... isolated from legacy smoke projects").
But `v2-release` **does** include `j01-learner-home.spec.ts` and other
`flows/v2/*.spec.ts` tests that exercise the same `/v1/profiles`-dependent
bootstrap path. The isolation is by **file**, not by **root cause** — the
same connection-layer blip that hits the three legacy flows today could, on
any future run, equally hit a `v2-release` test, and this classifier would
still call it `product`, silently reintroducing the exact "required check
blocked on staging flake" failure mode WI-2228 was built to prevent — just
now mislabeled as a code defect instead of honestly reported as infra. This
is the single most concrete, actionable target for WI-2452: reorder or
narrow `HARD_FAILURE` so a `toBeVisible`/`element(s) not found` failure with
an accompanying infra network signal isn't preempted by the literal
`expect(` substring match.
(Pointer: `scripts/playwright-staging-gate.cjs:41-42`, `:445-449`.)

## 5. A second observation for WI-2452 — the advisory step's real result is invisible, not just non-blocking

The legacy step's `continue-on-error: true` forces GitHub's reported step
`conclusion` to `success` regardless of the underlying Playwright exit code
— confirmed directly: `gh run view <id> --json jobs` reports
`{"name":"Run legacy Playwright smoke (advisory)","conclusion":"success"}`
for runs whose raw log for that exact step plainly ends `1 failed` /
`3 failed`. This is stronger than "non-blocking" (the intended design) — it
is **unreported**: nothing in `gh run view --json jobs`, the PR checks list,
or the job conclusion says the legacy suite failed at all.

In 6 of the 7 post-split reds sampled today, the masked legacy step
independently reproduces the bucket-(b) three-flow signature on the *same*
run that already failed for an unrelated bucket-(c) reason (WI-2234,
WI-2236 ×1, WI-2239 ×2, WI-2228-gate ×1); the seventh (WI-2240) instead
re-fails the legacy step for the same scenario-catalog-drift reason as its
V2-gate failure. Either way, the advisory signal WI-2228 intended to
*preserve* (visible-but-non-blocking) is currently *lost* — recommend
WI-2452 surface the legacy step's true pass/fail (a step-summary annotation
or a posted artifact/comment) rather than relying on the GitHub `conclusion`
field, which `continue-on-error` always reports as green.

## 6. Recommended cure per bucket (input to WI-2451)

- **(b) — WI-2389 three flows.** The root cause (§3, rework revision) is a
  brief, all-route, pre-Worker-invocation connectivity gap to
  `api-stg.mentomate.com` — not a Worker-side condition, so a Worker-side
  mitigation (health preflight, alarm on Worker 5xx) would not observe it.
  The mitigation that matches the actual failure layer: a bounded
  connection-level retry (specifically on `net::ERR_FAILED` transport
  failures, distinct from HTTP-level error status) around the app's API
  client. Caveat against overselling this as reliably-quick: both traced
  runs also show a separate, recurring, self-healing `net::ERR_ABORTED`
  pattern every ~7 seconds throughout the run (§3) — the connection to
  `api-stg.mentomate.com` is not uniformly quiet even outside the terminal
  `net::ERR_FAILED` outage this document measured at ~5–6.5 seconds twice.
  A short retry/backoff would very plausibly clear an outage of the
  *measured* duration, but this document has only two samples of that
  duration — it is not established as a reliable upper bound. Fail-fast +
  legible `staging-api-unavailable` status (2026-07-18 precedent finding)
  still applies for the case a retry doesn't clear it. Do not action the
  DNS/edge/WAF hypotheses (§3) until WI-2475 discriminates them — a fix
  aimed at the wrong layer wastes the retry-mitigation's effectiveness
  budget.
- **(c) scenario-catalog drift.** Add a fast, actionable check — either the
  seed API's scenario enum is generated from (or validated against) the same
  source the E2E fixtures reference, or a CI step fails a PR that adds a new
  `flows/v2/*.spec.ts` scenario name without a matching backend registration
  landing in the same change set.
- **(c) WIP-feature-not-ready, intentional canary.** No cure — expected,
  branch-local red on active development; not ambient noise.
- **Gate classifier (§4).** Narrow/reorder `HARD_FAILURE` in
  `scripts/playwright-staging-gate.cjs` so it doesn't preempt the
  network-trace infra check for `toBeVisible`/`element(s) not found`
  failures.
- **Masked advisory step (§5).** Surface the legacy step's actual pass/fail,
  not the `continue-on-error`-forced `conclusion`.

## Full run → bucket table (50-run sample, auditable)

29 reds, in reverse-chronological order (most recent first):

| Run | Branch | Time (UTC) | Architecture | Bucket |
|---|---|---|---|---|
| [29696680777](https://github.com/cognoco/eduagent-build/actions/runs/29696680777) | WI-2240 | 17:21:57 | post-split | c — scenario-catalog drift (`v2-account-non-owner-child`) |
| [29696574472](https://github.com/cognoco/eduagent-build/actions/runs/29696574472) | WI-2234 | 17:18:47 | post-split | c — scenario-catalog drift (`v2-returning-learner`) |
| [29696127898](https://github.com/cognoco/eduagent-build/actions/runs/29696127898) | WI-2236 | 17:05:07 | post-split | c — WIP feature not ready |
| [29696066018](https://github.com/cognoco/eduagent-build/actions/runs/29696066018) | WI-2239 | 17:03:12 | post-split | c — scenario-catalog drift (`v2-journal-paper-trail`) |
| [29695485756](https://github.com/cognoco/eduagent-build/actions/runs/29695485756) | WI-2239 | 16:45:26 | post-split | c — scenario-catalog drift (`v2-journal-paper-trail`) |
| [29692027445](https://github.com/cognoco/eduagent-build/actions/runs/29692027445) | WI-2236 | 15:02:22 | post-split | c — WIP feature not ready |
| [29688502157](https://github.com/cognoco/eduagent-build/actions/runs/29688502157) | WI-2241 | 13:14:28 | pre-split | b |
| [29687945649](https://github.com/cognoco/eduagent-build/actions/runs/29687945649) | WI-2241 | 12:57:09 | pre-split | b |
| [29686619359](https://github.com/cognoco/eduagent-build/actions/runs/29686619359) | WI-2348 | 12:14:38 | pre-split | b |
| [29686049122](https://github.com/cognoco/eduagent-build/actions/runs/29686049122) | WI-2353 | 11:56:14 | pre-split | b |
| [29685854006](https://github.com/cognoco/eduagent-build/actions/runs/29685854006) | WI-2215 | 11:49:59 | pre-split | b |
| [29685529700](https://github.com/cognoco/eduagent-build/actions/runs/29685529700) | WI-2215 | 11:39:25 | pre-split | b |
| [29685061751](https://github.com/cognoco/eduagent-build/actions/runs/29685061751) | WI-2225 | 11:24:15 | pre-split | b |
| [29683716796](https://github.com/cognoco/eduagent-build/actions/runs/29683716796) | WI-2215 | 10:39:19 | pre-split | b |
| [29683117198](https://github.com/cognoco/eduagent-build/actions/runs/29683117198) | WI-2215 | 10:18:33 | pre-split | b |
| [29682669105](https://github.com/cognoco/eduagent-build/actions/runs/29682669105) | WI-2215 | 10:03:29 | pre-split | b |
| [29682048549](https://github.com/cognoco/eduagent-build/actions/runs/29682048549) | WI-2190 (PR #2268) | 09:42:18 | pre-split | b |
| [29682038944](https://github.com/cognoco/eduagent-build/actions/runs/29682038944) | WI-2215 | 09:41:58 | pre-split | b |
| [29681764115](https://github.com/cognoco/eduagent-build/actions/runs/29681764115) | WI-2228-gate | 09:32:34 | post-split | c — intentional canary (`wi-2228-red-proof.spec.ts`) |
| [29680905528](https://github.com/cognoco/eduagent-build/actions/runs/29680905528) | teach-back-grader-fence | 09:03:34 | pre-split | b |
| [29671898435](https://github.com/cognoco/eduagent-build/actions/runs/29671898435) | WI-2228-mitigation | 03:31:33 | pre-split | b |
| [29671495029](https://github.com/cognoco/eduagent-build/actions/runs/29671495029) | WI-2228-mitigation | 03:15:53 | pre-split | b |
| [29671379606](https://github.com/cognoco/eduagent-build/actions/runs/29671379606) | WI-2215 | 03:11:40 | pre-split | b |
| [29671180154](https://github.com/cognoco/eduagent-build/actions/runs/29671180154) | WI-2228-mitigation | 03:04:23 | pre-split | b |
| [29670763292](https://github.com/cognoco/eduagent-build/actions/runs/29670763292) | WI-2228-mitigation | 02:48:32 | pre-split | b |
| [29670253184](https://github.com/cognoco/eduagent-build/actions/runs/29670253184) | WI-2228-mitigation | 02:28:41 | pre-split | b |
| [29670023353](https://github.com/cognoco/eduagent-build/actions/runs/29670023353) | WI-2215 | 02:19:50 | pre-split | b |
| [29669593753](https://github.com/cognoco/eduagent-build/actions/runs/29669593753) | WI-2228-mitigation | 02:04:09 | pre-split | b |
| [29669482457](https://github.com/cognoco/eduagent-build/actions/runs/29669482457) | WI-2215 | 02:00:18 | pre-split | b |

Plus, cross-checked outside the 50-run sample (§2): `29649929053`,
`29651214645` (WI-2347/PR #2255), `29650351353`, `29650840160`
(WI-2372/PR #2256), `29665025434` (WI-2190/PR #2268, older run) — all
bucket (b).
