# WI-2948 rework evidence

This directory preserves the secret-free, independently inspectable evidence for the second repair attempt.

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

The durable sanitized receipt will be recorded at [ramtop-node22-seeded-signin-receipt.json](ramtop-node22-seeded-signin-receipt.json). It records the UTC interval, machine and Node identity, exact secret-free command shape, zero-retry configuration and observed retry indexes, all three scenario outcomes, candidate source blobs, and the stable repository artifact pointer.

The run explicitly removes `CLERK_SECRET_KEY` from the local environment and asks Doppler for only `TEST_SEED_SECRET` and `CLERK_PUBLISHABLE_KEY`. Raw Playwright reporter output is processed only in a mode-`0700` temporary directory and destroyed after allowlisted outcome extraction; it is not a durable artifact because reporter output contains seeded identity data.

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

Fresh non-Playwright verification on Node 22:

- Helper suite: 2 of 2 tests passed.
- Clerk alignment plus E2E workflow contract suites: 186 of 186 tests passed.
- Full TypeScript build, targeted ESLint, GitHub workflow-security guard, no-Gemini runtime ratchet, shell syntax, and `git diff --check`: exit 0.
- Fresh Doppler staging alignment checker: exit 0 with only `Clerk key alignment OK`.
- Exact no-startup-files two-secret boundary probe: backend key absent; both allowlisted variables present.
- Durable evidence scan: zero raw Clerk-key, bearer-token, JWT, email-address, and private-key-pattern matches.

## Exact next proof precondition

Do not launch the authorized replacement staging proof until all of the following are true in this worktree:

1. The focused Node 22 helper regression and the relevant workflow/alignment suites pass on the final candidate.
2. `zsh -n scratchpad/wi2948-ramtop-receipt.zsh` exits 0, and a no-startup-files boundary probe reports `CLERK_SECRET_KEY` absent after the exact Doppler `--only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY"` boundary.
3. A fresh read-only `doppler run --project mentomate --config stg --no-cache --no-fallback -- node scripts/check-clerk-key-alignment.mjs` prints only `Clerk key alignment OK` under the same Doppler principal that will run the proof.
4. No raw reporter, trace, screenshot, video, seeded address, password, token, or key is configured for durable output.

Once those preconditions hold, invoke `zsh scratchpad/wi2948-ramtop-receipt.zsh` exactly once. Success requires all three setup scenarios to pass with one attempt each, retry index 0, zero teardown failures, and the durable sanitized classification to parse as the receipt promoted at the pointer above. On failure, preserve only the sanitized classification file and stop without another invocation.

After generation, the complete durable evidence directory is scanned explicitly for raw Clerk keys, bearer tokens, JWTs, email addresses, private-key material, and credential assignments. The final zero-match counts are recorded here after the receipt is generated.
