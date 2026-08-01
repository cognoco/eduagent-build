# WI-2948 (Repair shared staging/Clerk E2E seeded sign-in path) rework evidence

This directory preserves the secret-free, independently inspectable evidence for the second repair attempt.

## Final signed-staging disposition

The repaired candidate completed the authorized Ramtop Node 22 staging setup proof
on 2026-08-01 at exact head `719b2b5254a88111ada253fc1b5fb2e60bc15551`.
All three setup/sign-in scenarios passed once each with retries disabled, and the
global teardown reset passed. The sanitized machine-readable receipt is
[ramtop-node22-seeded-signin-receipt.json](ramtop-node22-seeded-signin-receipt.json).
It supersedes the earlier bounded failure classifications below without deleting
their audit history.

## Cross-lane Clerk preflight regression

The regression command was run under the repository Node 22 toolchain with the production workflow as the system under test:

```bash
mise exec node@22 -- pnpm exec jest --config scripts/jest.config.cjs \
  scripts/e2e-ci-injection-and-smoke-gate.test.ts --runInBand \
  --testNamePattern='fail-closed Clerk instance preflight|Clerk instance mismatch blocks' \
  --json --outputFile=<phase-artifact>
```

| Phase | Workflow state | Result | Machine-readable result |
| --- | --- | --- | --- |
| RED | Baseline workflow; checker only inside V2 | 4 failed, 171 skipped | [rework-2-red.json](rework-2-red.json) |
| GREEN | Shared preflight candidate | 4 passed, 171 skipped | [rework-2-green.json](rework-2-green.json) |
| production-only REVERT | Workflow byte-identical to `HEAD` blob `563ded271af2287231eca4913c83e4dea4398f6d`; tests retained | 4 failed, 171 skipped | [rework-2-revert-production.json](rework-2-revert-production.json) |
| exact RESTORE | Candidate workflow blob `8f93ac78a24b6d6fc0d85ed1306d6e2a6d142c1a` restored | 4 passed, 171 skipped | [rework-2-restore-green.json](rework-2-restore-green.json) |

The parameterized mismatch contract executes the real alignment checker with synthetic, decodable keys from different Clerk hosts. The checker exits 1, then the contract independently requires each credential-consuming V2, required-legacy, and advisory-legacy step to depend on the single successful `clerk-preflight` outcome before its script can export `CLERK_SECRET_KEY`. Removing the gate from any one lane fails that lane's case.

The broader focused validation ran the complete workflow contract, Clerk alignment checker, and GitHub workflow-security suites: 3 suites and 237 tests passed. Machine-readable result: [focused-green.json](focused-green.json).

## Ramtop Node 22 staging setup

A durable success receipt now exists at
`ramtop-node22-seeded-signin-receipt.json`. It records the UTC interval, Ramtop
and Node identity, exact secret-free command shape, zero-retry configuration and
observed retry indexes, all three successful scenario outcomes, candidate source
blobs, successful global teardown reset, and the stable repository artifact
pointer.

The current wrapper explicitly removes ambient `CLERK_SECRET_KEY` and `CLERK_TESTING_TOKEN` from the local environment, then asks Doppler for exactly `TEST_SEED_SECRET`, `CLERK_PUBLISHABLE_KEY`, and the aligned staging `CLERK_SECRET_KEY`. Raw Playwright reporter output is processed only in a mode-`0700` temporary directory and destroyed after allowlisted outcome extraction; it is not a durable artifact because reporter output contains seeded identity data. The historical two-secret invocation described below remains a fact about that earlier run, not the current wrapper boundary.

Three earlier diagnostic invocations exited at the Clerk preflight before Playwright launched. They were not Playwright attempts or retries. The read-only checks below supersede their initial classification: Doppler `mentomate/stg` is aligned; a login-shell startup file reintroduced a host-scoped production Clerk key after the outer command had unset it.

The prepared one-shot proof then genuinely launched Playwright once with `--retries=0`. The wrapper exited 3 after Playwright exited 1. Global teardown reported zero failures. The first `onboarding-complete` setup scenario failed with the allowlisted class `clerk-email-lookup`; the other two setup scenarios were skipped. The failed scenario recorded exactly one attempt at retry index 0. No receipt or raw reporter output survived the mode-`0700` temporary directory.

## Sanitized root-cause diagnosis

The proven hypothesis is **the setup lookup logic is wrong**. `seedScenario()` repeated the API seed service's Clerk email lookup and verification whenever any ambient `CLERK_SECRET_KEY` existed. The one-shot outer boundary unset that variable, but its inner `zsh -lc` loaded shell startup state and reintroduced a key for the live Clerk instance. The helper then spent all ten lookup attempts searching the live instance for an identity the staging Worker had created in the staging instance.

| Boundary | Secret-free observation | Conclusion |
| --- | --- | --- |
| Exact proof shell boundary | Plain `zsh -f` child after `env -u` reported the backend key absent. `zsh -lc` reported it present. | The key crossed the login-shell startup boundary, not the Doppler two-secret allowlist. |
| Login-shell Clerk fingerprint | Secret tier `live`, opaque shape; authenticated Domains GET status 200; domain host `clerk.mentomate.com`. Publishable/JWKS tier `test`; host `whole-iguana-9.clerk.accounts.dev`. | The client-side lookup used a different Clerk instance and tier from the seeded staging login. |
| Doppler `mentomate/stg` fingerprint | Secret tier `test`, opaque shape; publishable/JWKS host `whole-iguana-9.clerk.accounts.dev`; authenticated Domains GET status 200 with the same host. Required staging seed/password/database slots were present. | Doppler staging itself is aligned; no Doppler repair or Cloudflare mutation is warranted. |
| Deployed staging Worker | Health GET status 200 at deployed SHA `2e84f0b6`; Cloudflare listed the required Clerk/seed bindings. **GitHub Actions run `30640832469` — latest main staging deploy for that SHA; completed successfully** recorded one Clerk alignment pass, a verified 33-secret staging-only sync, one staging deploy, and zero credential-pattern matches in the inspected log. | The deployed seed service received the aligned staging backend key. |
| Staging seed and Clerk read paths | Authenticated scenarios GET status 200 returned 82 scenarios and included `onboarding-complete`. Staging Clerk users GET status 200 returned six seed-managed users, all six with email login records. | The seed system creates real Clerk logins; it is not taking the fake-ID fallback. |
| Seed service return contract | `createClerkTestUser()` performs Clerk lookup/create, password patch, user GET, and email verification before `POST /__test/seed` can return 201. The failed setup reached the later Playwright lookup, so the POST had already returned successfully. | The failed request had completed real server-owned Clerk provisioning before the duplicate lookup ran. |
| Cleanup ordering | Per-run cleanup exists only in Playwright global teardown, after setup execution. The scheduled cleanup accepts only seed users older than 24 hours. | No cleanup path can explain deletion during the immediate post-seed lookup. |

The other hypotheses are therefore rejected:

- **Different seed endpoint instance:** the only different-instance request was the Playwright helper's reintroduced live-key lookup; the deployed Worker was synchronized from aligned staging Doppler immediately before its current deployment.
- **No Clerk login:** impossible on this successful real-key seed path because the service verifies the Clerk user before returning; the deployed binding and current staging-user counts independently corroborate it.
- **Cleanup race:** neither cleanup path is eligible to run between the awaited seed response and the helper's lookup.

## Surgical repair and regression guard

- `apps/mobile/e2e-web/helpers/test-seed.ts` now trusts the server-owned seed provisioning boundary and no longer reads an ambient backend key, queries Clerk, or mutates email verification state after a successful seed response.
- `apps/mobile/e2e-web/helpers/test-seed.test.ts` sets a synthetic ambient key, returns a successful seed response, and rejects any second network request. RED failed because the implementation requested `api.clerk.com`; GREEN passed after the duplicate lookup was removed.
- `scratchpad/wi2948-ramtop-receipt.zsh` now uses `zsh -f -c` and exits 4 before Playwright if `CLERK_SECRET_KEY` crosses the two-secret allowlist. Shell syntax validation passed.

## Unverifiable transport-loss attempt and replacement authorization

After the repair above, a controlled run invoked the setup project once with one worker and Playwright retries disabled. While the orchestrator was collecting the script's already-sanitized stdout, its `write_stdin` boundary failed to serialize the output for process `11096`. The script's exit trap deleted the raw temporary JSON reporter and console files as designed. No receipt was promoted, no proof process remains, and neither the outcome nor a sanitized classification can be reconstructed. This invocation is therefore **unverifiable**: it is not green, and the transport failure is not a Playwright retry.

The combined orchestrator/Shepherd operator authorized exactly one new replacement invocation, conditional on repairing that evidence boundary first. The repaired script redirects its sanitized stdout before proof setup to `.workitem-artifacts/WI-2948/ramtop-node22-seeded-signin-classification.txt`, pins that file to mode `0600`, and never includes it in raw-temporary cleanup. Raw Playwright JSON, console, identity, token, screenshot, trace, and video material remain temporary-only or disabled and are never promoted.

## Authorized replacement result — no receipt

The replacement authorization was consumed. Its durable sanitized classification is `.workitem-artifacts/WI-2948/ramtop-node22-seeded-signin-classification.txt`:

```text
PLAYWRIGHT_EXIT=1
GLOBAL_TEARDOWN_FAILURE_COUNT=0
[]
FAILURE_CLASSES=unclassified
```

This proves only that Playwright exited 1, the wrapper observed no global-teardown failure line, and the JSON reporter contained no setup-project scenario result. It does not prove that any setup scenario ran. The raw JSON top-level errors and console output were intentionally destroyed, so the exact early failure cannot be reconstructed and no success receipt can be promoted.

The zero-result JSON shape is explained by the installed Playwright 1.56.1 runner. `runAllTestsWithConfig()` executes `createGlobalSetupTasks()` before `createLoadTask()`. Those early tasks include the configured web-server plugin and `globalSetup`. If either fails, test loading never occurs. `InternalReporter.onEnd()` then synthesizes an empty root suite, while the JSON reporter preserves the failure separately in its top-level `errors` array. The proof classifier inspected only setup specs and a short console-regex allowlist; it ignored top-level errors and therefore fell through to `unclassified`.

The surviving evidence cannot distinguish an Expo web-export/server startup failure from Clerk global setup or another pre-load failure. Any narrower claim would be speculation.

## Current-main comparison and refresh

The failed proof candidate was 15 commits behind `origin/main` at diagnosis time. Current main at `406823882a693a085351e774948acaf53555755e` had byte-identical blobs for `.github/workflows/e2e-web.yml`, `apps/mobile/playwright.config.ts`, `apps/mobile/e2e-web/helpers/global-setup.ts`, `apps/mobile/e2e-web/helpers/auth.setup.ts`, and `pnpm-lock.yaml`; it contained no prerequisite workflow, config, setup, staging, or dependency repair absent from the candidate. Its E2E changes were downstream V2 flow and Now-response handling changes, not inputs to `--project=setup`.

A main refresh was still mandatory because a new proof must identify and exercise the eventual PR revision rather than a stale ancestor. The validated candidate/evidence was committed first at `acc2df804471223a666cde5048f959e593f3c03a`, then current `origin/main` was merged without rebasing or rewriting history.

During non-Playwright validation, `origin/main` advanced to `25162e5d61a9b0a7dba955eda969384495514409`. Those three additional commits changed API export coverage, disposable-schema bootstrap tooling, and documentation only; they did not touch the E2E workflow, Playwright config/setup, seeded-sign-in helper, or Playwright dependency lock. That base was merged normally as a second refresh, leaving the candidate zero commits behind `origin/main` at this audit.

The final read-only fetch advanced `origin/main` once more to `da7a1842066765796ed1f1a4ef988b13a5bd01a4`. That commit changed supporter-authority API code, API tests, and evidence only. It was merged normally as a third refresh and likewise introduced no E2E/Playwright/config/setup/dependency prerequisite or conflict.

## Safe early-run classification

At that prior candidate, the local proof harness emitted only allowlisted metadata from early failures: Playwright top-level error count, setup-scenario count, the sanitized setup-result array, and `FAILURE_CLASSES=early-run-before-setup` when the setup count was zero. It did not copy top-level error messages or raw console text into the durable classification. A synthetic JSON fixture containing sentinel raw error/console material first failed because the classifier did not exist, then passed after the classifier was wired into the proof wrapper; no Playwright command or staging endpoint was used for that test. The bounded discriminator below supersedes that coarse future-run behavior without rewriting the preserved result above.

## Bounded pre-load discriminator candidate

No further staging invocation was made. The replacement authorization described above remains spent. This candidate instruments only lifecycle boundaries owned by the repository and reads no raw error field beyond the count of Playwright top-level errors.

The installed Playwright 1.56.1 reporter contract does not expose an error kind, phase code, or stable exception name. `TestError` exposes message, stack/snippet, cause, and optional source location; the JSON report likewise stores top-level errors as text-bearing objects. Those fields are deliberately excluded. Playwright also synthesizes `onBegin` with an empty suite when an earlier task fails, so callback presence is not treated as discovery evidence. The custom reporter records `tests-discovered` only when `suite.allTests().length > 0`.

The supported failure taxonomy is:

| Emitted class | Fixed marker boundary | What it establishes | Deliberate limit |
| --- | --- | --- | --- |
| `web-server-startup-timeout` | Reporter constructed; the configured Expo web-server command emitted its fixed start marker; global setup never started | The configured web-server command started and failed before Playwright advanced to global setup. | Does not distinguish export failure, bind failure, early process exit, or readiness timeout. A failure in output cleanup or another task before the command marker stays `unclassified-preload`. |
| `global-setup-failure` | Global setup started but did not complete | Failure occurred inside the repository-owned global-setup boundary. | Does not identify Clerk setup's raw exception or sub-operation. |
| `configuration-test-discovery` | Either no reporter marker, or global setup completed without a non-empty discovered suite | Configuration/reporter construction failed before lifecycle reporting, or test collection/loading failed after global setup. The emitted marker counts distinguish those two structural shapes. | Does not persist the config/load exception or arbitrary error name. |
| `browser-worker-or-fixture-pre-body` | A non-empty suite was discovered and at least one setup attempt began without the setup body marker (or dispatch stopped before any attempt/body) | The failure is after discovery but before repository setup-test code executes. A synthetic invalid-browser launch reaches this class. | Playwright exposes no stable structural discriminator among worker dispatch, browser launch, built-in fixture resolution, and pre-body hooks, so the label remains intentionally broad. |
| `setup-scenario-failure` | A setup body marker exists and Playwright reports setup results | Repository setup-test code ran before failure. | Does not classify the body failure from message text. |
| `unclassified-preload` | Missing/invalid/impossible marker shape or an unsupported sequence | Nothing narrower is safe to claim. | Raw text is never truncated or substituted into this class. |

The durable failure output is limited to booleans/counts, fixed phase counts, fixed result-status counts, retry/attempt counts, and one allowlisted class. It does not emit test titles, error names, messages, stacks, commands, response bodies, environment values, credential-bearing URLs, or filesystem paths. Raw JSON and console material remain inside the wrapper's mode-`0700` temporary directory and are destroyed by its exit trap. The wrapper's separate global-teardown check continues to emit only a count from one fixed repository-owned log line.

Mutation-sensitive local evidence on Node 22:

- RED: the marker unit contract exited 1 while `preload-phase.ts` was absent; all five phase cases plus the unknown-shape case failed classification before the discriminator existed.
- GREEN: the marker/global-setup suites passed 10 of 10; the evidence-transport contract passed.
- Real local Playwright probes passed five supported cases: configuration throw, configured web-server startup failure, global-setup throw, test-discovery throw, and invalid browser executable. Removing one decisive marker from each supported case changed its classification in all five mutations. Secret and PII sentinels appeared only in destroyed raw inputs; durable-output leak count was zero. The impossible unknown sequence emitted `unclassified-preload`.
- The exact repository `--list --project=setup` path, with dummy loopback values, discovered three setup scenarios and emitted one non-empty-suite discovery marker. List mode did not start a web server, run global setup, launch a browser, or contact staging.
- The exact configured Expo web-export/static-server command was exercised with the production proof flags but a dummy loopback API URL. The loopback server became ready, emitted exactly one `web-server-command-started` marker, and left zero environment-file backup residue. The process was terminated, generated `dist`/Metro temporary artifacts were removed, and port 19006 was free afterward.
- Five prior Jest RGR JSON files stored absolute `testResults[].name` values; the two RED files also retained Jest failure messages/details. Those fields were sanitized to repo-relative paths, fixed `red-phase-expected-failure` codes, and structural counts. A normalized comparison against the original committed artifacts matched 5 of 5 files, proving all non-sensitive evidence fields were preserved.

A future one-shot proof would now reveal whether the run stopped in the configured web-server task, global setup, configuration/test discovery, the broader worker/browser/fixture pre-body boundary, or setup-test code; a success would still require all three scenario results, one attempt each, retry index zero, and zero teardown failures. It would still not reveal the raw exception or the exact subcause inside any class, and it intentionally cannot distinguish browser launch from another pre-body worker/fixture failure.

## Continuation reconciliation and authorized staging result

The continuation started with ten local commits at `bef51766a9b60a95dcd42343d4e550d078486337`. Those commits were preserved without rebase or history rewriting. Current `origin/main` was merged normally six times as it advanced during validation. The proof candidate was `37af17536437db19f9535b7bf55f06a82b5f4732`, whose second parent was then-current `origin/main` at `a4b4698432c6d7f6c984a4550425b50d7e457539`; the pre-invocation fetch reported zero commits behind.

One merge introduced **`WI-2936` — local Playwright Clerk secret-instance alignment; concurrent main repair** in the same helpers. The semantic resolution retained its local identity guard in global setup and retained this work item's server-owned seed boundary: `test-seed.ts` does not read an ambient backend key or repeat Clerk lookup/verification. The combined helper regression passed 17 of 17 tests before proof.

The operator-authorized continuation invocation ran exactly once with Doppler project `mentomate`, config `stg`, only `TEST_SEED_SECRET` and `CLERK_PUBLISHABLE_KEY` injected, `CLERK_SECRET_KEY` explicitly absent, one worker, and zero retries. Its sanitized result is [ramtop-node22-global-setup-failure.json](ramtop-node22-global-setup-failure.json).

The bounded proof class is **`global-setup-failure`**. Playwright exited 1 after the repository global-setup boundary started and emitted its fixed failure marker. It did not complete global setup or discovery and reported zero setup scenarios, attempts, or retries. Therefore the proof did not reach seeded sign-in, did not validate any scenario, and did not validate global teardown; the observed zero global-teardown failure-line count is not promoted into a teardown-success claim. No end-to-end success receipt exists.

The durable classification was mode `0600`. The wrapper published no raw console, top-level error, stack, command output, identity, token, or credential value. Its exit trap deleted the temporary reporter JSON, console log, and phase file; the post-run temporary-directory count was zero, no proof process remained, and port 19006 was free.

The proof candidate's non-staging gates passed before invocation: 17 of 17 focused mobile helper tests; 238 of 238 workflow/alignment/security tests; full TypeScript build; targeted and full mobile lint; workflow-security and no-Gemini guards; all five discriminator probes and five decisive-marker mutations; the unknown-shape fail-closed case; zero synthetic sentinel leaks; exact list-mode discovery of three setup scenarios; and exact-flag Expo export/static-server readiness with dummy loopback endpoints. The two-secret staging boundary reported the backend key absent and both allowlisted variables present, while the separate four-key read-only check printed only `Clerk key alignment OK`. The post-evidence scan found zero raw Clerk keys, bearer tokens, JWTs, email addresses, private keys, or credential assignments.

The failure is reproducible from versioned contracts without reading the destroyed exception text. The installed `@clerk/testing` implementation requires `CLERK_SECRET_KEY` or `CLERK_TESTING_TOKEN` during `clerkSetup()`, while this proof wrapper deliberately injected neither. The newly merged WI-2936 global-setup alignment runs immediately before `clerkSetup()` and correctly leaves a missing shared-mode runner secret missing; `clerkSetup()` then fails before discovery. This explains every bounded phase marker without inferring a narrower network or Clerk API failure.

The repaired wrapper now clears ambient `CLERK_SECRET_KEY` and `CLERK_TESTING_TOKEN`, injects the aligned staging `CLERK_SECRET_KEY` alongside the seed secret and publishable key through the same no-startup-files Doppler boundary, and fails closed if the backend key is absent or an ambient testing token crosses the boundary. This mirrors the production E2E workflow, whose credential-consuming lanes already export the staging backend key after the shared Clerk-alignment preflight, while retaining the server-owned seed boundary that removed the unsafe duplicate client-side lookup.

## Post-refresh no-rerun verification

- The permitted non-executing Playwright list mode loaded the refreshed config and discovered exactly three setup tests in `helpers/auth.setup.ts`; installed runner source confirms list mode does not start web servers, invoke global setup, launch a browser, or call staging.
- The Node 22 helper suite passed 2 of 2 tests.
- The complete workflow contract, Clerk alignment, and workflow-security set passed 237 of 237 tests.
- `tsc --build`, targeted ESLint, the workflow-security guard, the no-Gemini runtime ratchet, shell syntax, the synthetic classifier contract, and `git diff --check` exited 0.
- Full mobile lint exited 0 with 52 pre-existing warnings and no errors; the targeted candidate-file lint was clean.
- The durable evidence/classification scan found zero email, raw key, bearer token, JWT, private-key, or credential-assignment patterns.
- The exact-flag standalone Expo web export was deliberately not run during this diagnosis. It remains an unmet precondition for any separately authorized proof because web-server startup is one of the early boundaries the destroyed raw output cannot distinguish.

Pre-replacement non-Playwright verification previously recorded on Node 22:

- Helper suite: 2 of 2 tests passed.
- Clerk alignment plus E2E workflow contract suites: 186 of 186 tests passed.
- Full TypeScript build, targeted ESLint, GitHub workflow-security guard, no-Gemini runtime ratchet, shell syntax, and `git diff --check`: exit 0.
- Fresh Doppler staging alignment checker: exit 0 with only `Clerk key alignment OK`.
- Exact no-startup-files two-secret boundary probe: backend key absent; both allowlisted variables present.
- Durable evidence scan: zero raw Clerk-key, bearer-token, JWT, email-address, and private-key-pattern matches.

## Refusal and exact preconditions for any further proof

The one replacement authorization is spent. Refuse any further staging proof unless it is separately authorized after all of the following are true in this worktree:

1. The final candidate is committed, contains the current `origin/main` merge, and is zero commits behind that base.
2. The focused Node 22 helper regression, workflow/alignment suites, TypeScript build, targeted lint, workflow-security guard, no-Gemini ratchet, and `git diff --check` pass on that exact revision without Playwright.
3. A non-executing `playwright test --list --project=setup` configuration/collection check lists exactly the three expected setup scenarios and reports no config or load error. This check must not start web servers, run global setup, launch a browser, or call staging.
4. The exact-flag Expo web export used by the configured web server is verified separately without calling staging, and the proof port is free before invocation. This isolates the web-server boundary that runs before test loading.
5. `zsh -n` passes for the receipt wrapper and classifier, and the synthetic pre-load discriminator passes all supported phase cases, marker mutations, the unknown-shape fail-closed case, and the sentinel non-leak assertion.
6. A no-startup-files boundary probe reports all three exact Doppler slots present after `--only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY"`, with ambient `CLERK_TESTING_TOKEN` absent; no value may be printed.
7. A fresh read-only `doppler run --project mentomate --config stg --no-cache --no-fallback -- node scripts/check-clerk-key-alignment.mjs` prints only `Clerk key alignment OK` under the same Doppler principal that would run the proof.
8. No raw reporter, trace, screenshot, video, seeded address, password, token, or key is configured for durable output, and the durable evidence scan remains at zero sensitive-pattern matches.

The renewed continuation authorization was consumed by the single `global-setup-failure` invocation above. The operator's combined orchestrator/Shepherd mandate authorizes dispositioning this proven wrapper prerequisite and one replacement only after the repaired boundary and all checks pass again. Success still requires all three setup scenarios to pass with one attempt each, retry index 0, zero observed teardown failures, and the durable sanitized classification to parse as the receipt promoted at the pointer above. On failure, preserve only the sanitized classification and stop without another invocation.

After generation, the complete durable evidence directory is scanned explicitly for raw Clerk keys, bearer tokens, JWTs, email addresses, private-key material, and credential assignments. The final zero-match counts are recorded here after the receipt is generated.
