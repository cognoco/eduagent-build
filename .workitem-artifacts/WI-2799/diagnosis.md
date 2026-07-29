# WI-2799 — V2 Mentor cold-start readiness diagnosis

## Disposition

The attempt-3 failure is an E2E semantic-readiness observation defect, not evidence that the canonical zero-state Mentor surface failed to render after a successful empty `/now` response.

`mentor-screen` is the unconditional learner Mentor container. The `mentor-cold-start-card` is intentionally absent while the initial `GET /v1/now?scope=self` query has no feed and is either loading or errored. The smoke spec waits for the container, then immediately starts a default 15-second assertion for the card without retaining the `/now` request, response, or rendered query branch.

The query's first request may legally consume its 12-second budget and enter TanStack Query's bounded retry path. That makes a shell-visible/card-absent window longer than the smoke assertion possible without a canonical product defect. The CI retry used a new seeded identity and passed.

## Evidence chain

1. GitHub Actions run `30212519286`, attempt 3, job `89822824508`, reports `mentor-cold-start-card` absent for 15 seconds at `v2-mentor-single-composer.spec.ts:21`; Playwright retry #1 passed. Run: <https://github.com/cognoco/eduagent-build/actions/runs/30212519286/attempts/3>
2. `apps/mobile/e2e-web/flows/v2/v2-mentor-single-composer.spec.ts` asks `seedAndSignIn` to stop at `landingTestId: 'mentor-screen'`, then asserts `mentor-cold-start-card` without observing `/now`.
3. `apps/mobile/src/app/(app)/mentor.tsx` always returns the `mentor-screen` container. It renders a loading branch when `nowFeed.isLoading && !feed`, an error branch when `nowFeed.isError && !feed`, and only enables cold-start prompts after both suppressions clear.
4. `apps/mobile/src/hooks/use-now-feed.ts` runs `/now` through `combinedSignal`; `apps/mobile/src/lib/query-timeout.ts` gives that request a 12-second default budget. `apps/mobile/src/app/_layout.tsx` permits bounded query retries for non-4xx failures.
5. The targeted isolated component regression proves both sides of the boundary: an empty resolved feed renders `mentor-cold-start-card`; loading and error states retain `mentor-screen` while suppressing the card.
6. The original CI run has no Playwright artifact to distinguish timeout/retry from response error or fixture contents. V2 report/test-result upload is intentionally prohibited because prior artifacts exposed seeded credentials, so absence of request-state evidence is expected rather than recoverable.

## Root-cause variants

- **Confirmed observation defect:** shell mount is treated as semantic readiness, although product code explicitly separates those states.
- **Best-supported trigger:** the first `/now` request reached its 12-second budget and the card assertion expired during the following query retry. This fits the exact 15-second failure and retry-pass outcome, but cannot be proven retrospectively without the removed trace.
- **Still possible from retained CI evidence:** a transient `/now` error or an unexpectedly non-empty fixture response. Either would also suppress the expected card, but the original run retained neither response nor rendered branch.
- **Not supported:** a persistent canonical Mentor rendering defect. The same commit's isolated tests cover resolved empty, loading, and error behavior, and the Playwright retry passed.

## Repair atom

WI-2809, “Observe /now semantic readiness in V2 Mentor cold-start smoke,” was captured as the bounded repair. It requires credential-safe request/response and rendered-branch observation before the cold-start assertion, plus a held-`/now` mutation-sensitive browser regression. It explicitly forbids changes to retries, timeouts, quarantine, smoke membership, staging data, and production Mentor/query behavior.

The capture dedup judge auto-linked WI-2809 to WI-2799, but WI-2809 remains a live Captured Bug pending Shepherd adjudication because the Spike diagnosis and independently deliverable smoke repair are distinct lifecycle atoms.

## Verification

```text
pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --forceExit \
  --runTestsByPath 'apps/mobile/src/app/(app)/mentor.test.tsx' \
  --testNamePattern='renders ColdStartCard|does not surface cold-start suggestions'

PASS: 3 passed, 73 skipped
```

No staging mutation, retry, timeout, quarantine, smoke-project, or production-code change was made.
