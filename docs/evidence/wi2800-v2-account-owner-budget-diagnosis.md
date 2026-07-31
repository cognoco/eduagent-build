# WI-2800: V2 Account owner budget-exhaustion diagnosis

## Scope

This report diagnoses the `V2 owner learner Account returns its exact self scope to each initiating tab` failure from the durable evidence retained by GitHub Actions. It does not rerun shared staging, widen a timeout, add a retry, quarantine a test, or change the shared smoke specification.

Collision fences:

- WI-2798 (Diagnose V2 Account non-owner subject-row readiness lag) owns the non-owner subject-row readiness diagnosis.
- WI-2802 (Diagnose J-01 pushed-content Account chrome readiness lag) and WI-2810 (Instrument J-01 Account readiness phases before avatar assertion) own J-01 Account-chrome readiness diagnosis and instrumentation.
- WI-2822 (Prevent supporter self-learning doorway bleed-through after support-hub Back) owns the support-hub Back doorway bleed-through defect.

## Durable evidence

| Evidence | Observation |
| --- | --- |
| [Run 30210691166, job 89818535396](https://github.com/cognoco/eduagent-build/actions/runs/30210691166/job/89818535396) | The run tested unrelated PR head `8345e9e52ce66f21830dc1fdf1206efbcc63d653` from WI-2794 (Switch tests to new Worker-owned database scratch backends). That commit changed database scratch-backend cleanup files, not the mobile Account journey or its helpers. |
| V2 release result | The owner test's first attempt ended only with `Test timeout of 90000ms exceeded.` It retained no pending locator, call site, request, query, or named phase. Its CI retry passed, so Playwright reported the case as flaky. |
| Suite context | The same four-worker run reported one unrelated hard failure, three flaky cases, and 12 passes. The required-stable legacy smoke passed. |
| Artifact inventory | The run exposes zero downloadable artifacts. Trace, screenshot, and video capture are deliberately disabled because they can contain seeded credentials. |
| Source identity | The owner spec, `seed-and-sign-in.ts`, `test-seed.ts`, and Playwright configuration are byte-identical between failing head `8345e9e52` and the investigated `origin/main`. |

The retained output therefore proves a transient total-budget exhaustion. It does **not** identify a slow UI assertion, API/query, or fixture operation.

## Isolated phase reproduction

The non-attributable hosted record was supplemented on 2026-07-30 with a
credential-safe, disposable diagnostic run at exact `origin/main` revision
`7cb7b0f68971918fb638ce4a455ac47fe513ff40`.

- Target: a local Wrangler Worker (`ENVIRONMENT=development`) and local static
  Expo export, using the non-staging Doppler development database and Clerk
  instance. The run used a unique synthetic seed prefix and the seed reset
  completed after each attempt. No staging or production target was contacted
  or mutated.
- Contract: the owner case retained its 90-second Playwright timeout, the
  `parent-multi-child` seed, fresh owner sign-in, and the Mentor, Subjects, and
  Journal journey. A disposable spec logged only phase name, elapsed
  milliseconds, method, sanitized pathname, and status class. It logged no
  headers, query values, bodies, tokens, email addresses, or credentials.
- Compatibility shim: the development database lacks the checked-in
  `session_summaries.language_learning_summary` column. The first seed attempt
  therefore ended in 2.434 seconds with `POST /v1/__test/seed` returning 500
  (`PostgreSQL 42703`). To continue without mutating the shared database, the
  local Worker's runtime schema declaration alone temporarily omitted that
  field. The edit was restored immediately after the run.

The continued run produced these phase and request observations:

| Phase/request | Elapsed | Result |
| --- | ---: | --- |
| `seed-and-clerk` | 3,481 ms | completed |
| `POST /v1/__test/seed` | 3,004 ms | 2xx |
| Clerk `GET /v1/users` | 249 ms | 2xx |
| Clerk `PATCH /v1/email_addresses/:id` | 219 ms | 2xx |
| `sign-in-readiness` | **65,079 ms** | helper's 60-second readiness wait expired |
| `GET /v1/profiles` | 8 ms in browser / 4 ms at Worker | 401 |
| Whole instrumented journey | 68,562 ms | ended before the first Account entry |

At termination, the diagnostic had zero pending requests. The Worker recorded
the exact cause of the profile response:
`CLERK_AUDIENCE is not configured — JWT audience validation is disabled`.
The development config supplies that binding as an empty value: retaining the
empty binding fails environment validation, while omitting it lets public
seed/Clerk setup run but makes authenticated routes reject the token.

The consuming step in this isolated reproduction is therefore
`signIn` → `waitForSignedInReady`, waiting after the fast failed
`GET /v1/profiles` request. It is **not** an executing API query and it is not
an Account-tab assertion. The request fails immediately; the readiness loop
then consumes the time.

This result does not retroactively prove that the hosted staging attempt
received the same 401. The hosted attempt retained no request evidence, and its
configured Clerk audience is a different environment boundary. It does,
however, replace the previous source-budget candidate list with a directly
observed consuming phase and request on an explicit isolated target. It also
shows how a slow seed/Clerk prelude followed by the same 60-second readiness
window can be preempted by the outer 90-second budget before the helper emits
its own error; that relationship is an inference, not a claim about the
missing hosted request record.

## Source-level budget analysis

The source explains why the terminal evidence is non-attributable:

1. `apps/mobile/playwright.config.ts` gives each test one 90-second budget, one CI retry, and four workers for `E2E_ENV=staging`.
2. `apps/mobile/e2e-web/flows/v2/v2-account-owner.spec.ts` calls `signInFreshOwner` before its first named `test.step`. It then serially runs the Mentor, Subjects, and Journal entry/Account/leaf/Back/return variants inside that same test budget.
3. `seedAndSignIn` performs seed-service and Clerk work before sign-in. `fetchWithRetry` alone can sleep for 37.2–55.8 seconds across its five jittered backoffs, excluding request time. Clerk lookup can add nine 750ms propagation waits and invokes the same retrying fetch path; the raw fetches have no local elapsed-time diagnostic.
4. `signIn` can then spend up to 60 seconds in signed-in readiness (`waitForSignedInReady`, `apps/mobile/e2e-web/helpers/auth.ts:240`), plus navigation, polling, and late post-approval waits. On the post-approval-interstitial path, `signIn` taps through the interstitial and awaits a second, independent 60-second `waitForSignedInReady` window (`auth.ts:255`) before continuing — so that path's readiness budget alone can reach up to 120 seconds, before navigation, polling, and late post-approval waits are even counted. Those phases also run before the first owner journey step.
5. When the global 90-second budget preempts one of those asynchronous loops or a later serialized variant, the current reporter has no retained phase label to emit. The observed bare timeout is the expected failure shape of that observability gap.

These bounds do not prove which phase consumed the historical hosted attempt.
The isolated reproduction does select `sign-in-readiness` and
`GET /v1/profiles` for the reproduced non-staging failure, while preserving the
historical-evidence boundary above.

## Classification and disposition

Classification:

- Historical hosted attempt: **test orchestration / diagnostic observability**.
  A deterministic product defect is not established because the exact case
  passed on retry and retained no phase/request discriminator.
- Isolated reproduction: **fixture/environment configuration**. The development
  schema drift blocks the seed; after a local-only compatibility shim, the
  missing Clerk audience makes authenticated profile readiness consume the
  60-second helper budget. No slow API query was observed.
- The three entry variants sharing one budget amplify elapsed-time sensitivity, but splitting them into separate 90-second tests would effectively widen the allowed budget and is not an acceptable diagnostic repair.

The durable observability dependency remains WI-2826 (Instrument V2 Account
owner journey phase timing). It owns the sanitized, mutation-sensitive
instrumentation needed to make the reproduction command part of the normal
test surface without colliding with this diagnostic spike.

Two independently deliverable defects were captured for formal BID-48
membership disposition:

- WI-2922 (Align development database schema with current session summaries)
  — origin: the 500 seed response at exact revision `7cb7b0f68`; dependency:
  current Drizzle schema/migration history and the development database
  operator; boundary: no shared schema mutation without explicit authority.
- WI-2923 (Configure a valid Clerk JWT audience for development diagnostics)
  — origin: the 401 profile response and 65,079 ms readiness phase; dependency:
  the development Clerk/Doppler owner and WI-2826 instrumentation; boundary:
  do not copy higher-environment credentials or weaken audience validation.

No product or test repair is implemented under WI-2800.
