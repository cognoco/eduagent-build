# WI-2458 / WI-2604 reviewer-rework evidence

This record is intentionally sanitized. It retains only run identifiers, public
GitHub URLs, artifact-internal paths, aggregate counts, timestamps, commands,
exit statuses, and concise assertion output. No report, trace, screenshot,
video, token, cookie, credential, request header value, seeded identity, or user
data is tracked here.

## WI-2604 AC-1: retained 18/19 source symptom

Primary source:

- Run: [E2E Web 29919567748](https://github.com/cognoco/eduagent-build/actions/runs/29919567748), commit `8431f4a84efbb1d547db47fc33e30a495354a44f`.
- Job: [run-smoke 88921439622](https://github.com/cognoco/eduagent-build/actions/runs/29919567748/job/88921439622).
- Retained artifact: [playwright-web-legacy-29919567748-1, artifact 8529567720](https://github.com/cognoco/eduagent-build/actions/runs/29919567748/artifacts/8529567720).
- Failing test directory inside the artifact: `test-results-legacy/flows-journeys-j01-ux-pass-6525e-learner-UX-screenshot-crawl-smoke-learner/`.

Sanitized artifact findings:

- `trace.zip!/0-trace.network` contains 122 `api-stg.mentomate.com`
  resource snapshots whose response status is `-1`, failure text is
  `net::ERR_FAILED`, and response headers contain no
  `Access-Control-Allow-Origin`. It also contains 13 navigation-abort records;
  those were counted separately and are not used as `ERR_FAILED` proof.
- `trace.zip!/0-trace.trace` contains 160 browser console records stating that
  the requested API resource was blocked because no
  `Access-Control-Allow-Origin` header was present. The first burst begins at
  trace line 202; progress-related examples occur from trace line 228 onward.
- The job's `Stop and summarize runner-to-edge phase probe` step records a
  `cloudflare-edge-security` incident beginning `2026-07-22T12:31:47.386Z`,
  overlapping the browser CORS/`ERR_FAILED` burst that begins at
  `2026-07-22T12:31:46.956Z`. The probe recorded failed edge samples and
  recovery at `2026-07-22T12:31:57.513Z`.
- `trace.zip!/0-trace.trace:1362` is frame snapshot `after@call@12` at the
  sanitized route `/progress/:subjectId`; it contains test id
  `progress-subject-error` and exact rendered text
  `We couldn't load this subject`.
- `test-failed-1.png` in the same failing test directory visually records that
  exact progress-subject error state. The image itself is not committed.

Sanitized job-log findings from `Run legacy Playwright smoke (advisory)`:

- `2026-07-22T12:30:54.445Z`: `Running 19 tests using 4 workers`.
- The log enumerates the selected cases through `[19/19]`, covering
  `smoke-auth`, setup, `smoke-learner`, `smoke-parent`,
  `smoke-accessibility`, and `smoke-transport-recovery`.
- `2026-07-22T12:33:29.969Z`: only the learner screenshot crawl enters
  `[20/19] (retries) ... (retry #1)`.
- `2026-07-22T12:35:08.219Z`: the step reaches its existing five-minute
  timeout. This is the retained 18/19 failure shape; sibling projects did not
  enter a retry.

Together, the phase-probe, console, network, frame-snapshot, screenshot, and
job-log records establish the required Cloudflare/CORS transport symptom,
Chrome `net::ERR_FAILED`, exact progress-subject error state, sibling-project
completion, learner retry, and five-minute budget exhaustion without relying on
a generic profile-load error.

## WI-2604 AC-5: merged exact-main post-fix result

Primary source:

- Run: [E2E Web 29923281492](https://github.com/cognoco/eduagent-build/actions/runs/29923281492), workflow-dispatched from `main` at merged commit `fab52926e1a479ec42e28eb252b7804245c3da10`.
- Job: [run-smoke 88933913704](https://github.com/cognoco/eduagent-build/actions/runs/29923281492/job/88933913704).
- Retained report artifact: [playwright-web-legacy-29923281492-1, artifact 8531016906](https://github.com/cognoco/eduagent-build/actions/runs/29923281492/artifacts/8531016906).

The legacy step logged `Running 19 tests using 4 workers` at
`2026-07-22T13:22:40.639Z`, enumerated `[1/19]` through `[19/19]`, and logged
`19 passed (3.3m)` at `2026-07-22T13:24:48.830Z`. The step contains no
`(retries)` or `retry #` line. The 3.3-minute Playwright result is inside the
unchanged five-minute step budget.

## Durable-guard RED -> GREEN -> revert -> restore

### WI-2458 no-argument smoke lane

Exact command in every phase:

```text
pnpm exec jest --config tools/quarantine/jest.config.cjs --runInBand tools/quarantine/run-smoke-projects.test.ts
```

| Phase | Exit | Salient result |
| --- | ---: | --- |
| RED, test added before production fix | 1 | `Expected: "core"`; `Received: undefined`; 1 failed, 5 passed |
| GREEN, minimal default applied | 0 | 6 passed; `defaults the no-argument command to the scoped core lane` passed |
| Revert, only production default removed | 1 | Same expected failure: `Expected: "core"`; `Received: undefined`; 1 failed, 5 passed |
| Restore, production default reapplied | 0 | 6 passed |

The retained test also supplies a future-dated advisory entry and verifies that
the no-argument default excludes that project from the selected core lane. The
existing unknown-lane test continues to reject an explicit unscoped value.

Package-surface verification used the real top-level pnpm command with only the
runner's child `pnpm` replaced by a temporary argument-capturing executable:

```text
pnpm run test:e2e:web:smoke
```

Exit status was 0. The runner selected `core` and attempted only these explicit
project flags:

```text
--project=smoke-auth
--project=smoke-learner
--project=smoke-parent
--project=smoke-accessibility
--project=smoke-transport-recovery
```

Thus the supported no-argument command no longer fails for a missing lane and
cannot fall through to an unscoped Playwright project set. A direct explicit
invalid-lane check, `node tools/quarantine/run-smoke-projects.cjs all`, exited 1
with `lane must be "core" or "advisory"`.

### WI-2604 smoke-learner retry policy

Exact command in every phase:

```text
pnpm exec jest --config scripts/jest.config.cjs --runInBand scripts/e2e-ci-injection-and-smoke-gate.test.ts
```

| Phase | Exit | Salient result |
| --- | ---: | --- |
| RED, test added before production fix | 1 | Parsed CI config omitted `learnerRetries`; 1 failed, 47 passed |
| GREEN, learner-only override applied | 0 | 48 passed; global retries remained 1, learner retries resolved to 0, parent had no override |
| Revert, only `smoke-learner.retries` removed | 1 | Same expected missing `learnerRetries` failure; 1 failed, 47 passed |
| Restore, learner-only override reapplied | 0 | 48 passed |

The retained test imports the real Playwright config with `CI=1`. It proves the
global policy remains one retry, `smoke-learner` resolves to zero retries, and
`smoke-parent` retains inherited policy. No timeout or other project retry
setting changed.

## Preserved crawl and command-surface contracts

- `j01-ux-pass.spec.ts` still contains 24 numbered `capture()` calls and all
  corresponding screen assertions.
- It contains exactly one initial `page.goto()` and performs subsequent
  internal navigation through `history.pushState` plus a `popstate` event.
- Its profile-bootstrap listener still counts only GET requests whose pathname
  is exactly `/v1/profiles`, and the final assertion remains
  `expect(profileBootstrapRequests).toBe(1)`.
- Active no-argument command surfaces remain in `package.json`, `AGENTS.md`,
  `docs/change-classes.md`, and `scripts/check-change-class.sh`; they are now
  supported by the core default. Workflow call-sites remain explicit `core`
  and `advisory` lanes.
- The retry sweep found only the main Playwright global policy, the new
  learner-only zero-retry override, and the already-zero manual learner/parent
  UX configs. No workflow or package command supplies a CLI retry override.

## Fresh local verification

The following verification completed after the production fixes were restored:

| Command | Result |
| --- | --- |
| `pnpm exec jest --config tools/quarantine/jest.config.cjs --runInBand` | 2 suites passed, 34 tests passed |
| `pnpm exec jest --config scripts/jest.config.cjs --runInBand scripts/e2e-ci-injection-and-smoke-gate.test.ts` | 1 suite passed, 48 tests passed |
| `pnpm exec prettier --check apps/mobile/playwright.config.ts scripts/e2e-ci-injection-and-smoke-gate.test.ts tools/quarantine/run-smoke-projects.cjs tools/quarantine/run-smoke-projects.test.ts docs/evidence/wi2458-wi2604-reviewer-rework.md` | exit 0 |
| `pnpm exec eslint apps/mobile/playwright.config.ts scripts/e2e-ci-injection-and-smoke-gate.test.ts tools/quarantine/run-smoke-projects.cjs tools/quarantine/run-smoke-projects.test.ts` | exit 0 |
| `EXPO_PUBLIC_ENABLE_MODE_NAV=true EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true bash scripts/check-change-class.sh --run` | structural checks passed; 19 smoke tests passed in 2.1m; 3 gates passed |

The navigation variables in the last command are the same explicit values used
by the E2E Web workflow. The change-class script did not receive a lane
argument; it exercised the repaired no-argument smoke command.
