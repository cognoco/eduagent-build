# Finding — run-smoke failure taxonomy + staging-side root cause (2026-07-19)

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
download + `0-trace.network` parsing for one representative failure;
`scripts/playwright-staging-gate.cjs`'s `classifyFailure()` executed directly
against a synthetic input to verify (not infer) its behavior;
`gh api repos/.../branches/main/protection` to verify (not infer) which
check name is actually required. Read/instrument-only throughout — no
staging config change, no local reproduction loops (CI log/artifact reads
and one `classifyFailure()` unit invocation only).

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

## 3. Staging-side root cause — bucket (b) (AC-2)

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

**Root cause: short (~3s), sustained bursts of connection-layer failure
(`net::ERR_FAILED`) to `api-stg.mentomate.com`'s `/v1/profiles` endpoint** —
not a clean HTTP 5xx, not isolated to the seed endpoint. The app's own
offline-fallback fires on this, and whichever of the three flows is mid-test
at that moment fails.

**Discriminator not established here (named, not resolved):** the trace
evidence pins the *symptom* (a connection-layer blip to the Cloudflare
Worker) but not the *ultimate* cause — worker cold-start vs. Neon contention
vs. genuine shared-staging load from the many concurrent PR runs this same
15-hour window shows (12+ distinct branches hit `api-stg.mentomate.com`'s
E2E suite in the sampled window). Discriminating these needs a Sentry/
Cloudflare Worker error-rate cross-reference at the precise failure
timestamps above — out of scope for this read-only diagnosis pass, named as
the concrete next step for whoever picks up WI-2451.

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
(`apps/mobile/playwright.config.ts:210-213`) deliberately excludes the three
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

- **(b) — WI-2389 three flows.** The 2026-07-18 precedent finding's four
  candidate mitigations (fail-fast + legible `staging-api-unavailable`
  status; bounded retry/backoff on profile-load; a staging-health preflight
  that skips/soft-fails on down; alarm on Worker 5xx/timeout) still apply.
  This diagnosis adds the specific, reproducible evidence to act on them:
  endpoint `/v1/profiles`, error `net::ERR_FAILED`, burst shape "3 fails in
  ~3s after a run of clean 200s."
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
