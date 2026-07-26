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

## Source-level budget analysis

The source explains why the terminal evidence is non-attributable:

1. `apps/mobile/playwright.config.ts` gives each test one 90-second budget, one CI retry, and four workers for `E2E_ENV=staging`.
2. `apps/mobile/e2e-web/flows/v2/v2-account-owner.spec.ts` calls `signInFreshOwner` before its first named `test.step`. It then serially runs the Mentor, Subjects, and Journal entry/Account/leaf/Back/return variants inside that same test budget.
3. `seedAndSignIn` performs seed-service and Clerk work before sign-in. `fetchWithRetry` alone can sleep for 37.2–55.8 seconds across its five jittered backoffs, excluding request time. Clerk lookup can add nine 750ms propagation waits and invokes the same retrying fetch path; the raw fetches have no local elapsed-time diagnostic.
4. `signIn` can then spend up to 60 seconds in signed-in readiness, plus navigation, polling, and late post-approval waits. Those phases also run before the first owner journey step.
5. When the global 90-second budget preempts one of those asynchronous loops or a later serialized variant, the current reporter has no retained phase label to emit. The observed bare timeout is the expected failure shape of that observability gap.

These bounds do not prove that Clerk, sign-in, or a particular tab was slow in this run. They prove that several independently variable phases share one terminal budget without a durable phase marker, so the existing evidence cannot select among them.

## Classification and disposition

Classification: **test orchestration / diagnostic observability**.

- A deterministic product defect is not established: the exact case passed on its CI retry.
- API/query latency, fixture state, Clerk/seed latency, sign-in readiness, and a later tab-return phase remain viable variants because the hosted run retained no discriminator.
- The three entry variants sharing one budget amplify elapsed-time sensitivity, but splitting them into separate 90-second tests would effectively widen the allowed budget and is not an acceptable diagnostic repair.

The independently deliverable repair is captured as WI-2826 (Instrument V2 Account owner journey phase timing). It requires sanitized phase timing and allowlisted request/query state for seed, Clerk verification, sign-in readiness, and each owner tab-return phase; mutation-sensitive variant coverage; and preservation of the existing timeout, retry, worker, staging, and credential-safety contracts.

No product or test repair is implemented under WI-2800.
