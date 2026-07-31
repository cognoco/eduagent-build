# WI-2702 completion summary

## What was done

Strengthened the two rejected-write route cases for speaking practice with database-level zero-persistence assertions, proving that a rejected request leaves no attempt row or related residue. Also established why the asserted table set is complete: the service's only write is a single transactional insert into speaking_practice_attempts (services/speaking-practice/attempt.ts), both rejected paths short-circuit before the service runs (profile-scope middleware for the cross-account case; the proxy-mode assertion in the route handler for the missing-profile case), and the metering middleware does not apply to this route, so no quota or billing write path exists.

## What changed

apps/api/src/routes/speaking-practice.integration.test.ts only:
- The cross-account FORBIDDEN case now queries speaking_practice_attempts for both the caller profile and the attacker-targeted profile and asserts zero rows.
- The missing-profile PROXY_MODE case now queries speaking_practice_attempts for the fixture profile and asserts zero rows.
Both assertions use the integration harness's real database handle (createIntegrationDb), matching the idiom of the sibling cases in the same file; the suite exercises the exported production app against the isolated integration database with no internal mocks.

## Verification

Lint reported no issues on the changed file, and a grep confirmed the file contains no jest.mock at all. Local execution of the integration suite is environment-gated on this machine (the shared-config Doppler guard, a pre-existing box condition unrelated to this diff), so the authoritative run is the pull request's CI: every check concluded successfully, including the flag-on integration job that runs this suite against a real database, and the automated review verdict was a clean approval with zero findings. The change landed on main via the squash commit recorded in Fixed In.

## Caveats / Follow-ups

The residue assertion is scoped to speaking_practice_attempts by construction of the current write path; if a future change adds a second write surface to this route (for example metering), these tests will not guard it automatically — the completeness argument above is the review anchor for that future change.
