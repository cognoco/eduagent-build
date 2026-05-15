# Run Tests — Failure Loop with Mock-on-Touch Cleanup

Run any test suite (unit, integration, or e2e) and drive it to green by either fixing the test (when it has drifted from real behavior) or fixing the underlying bug (when the test caught one). Never weaken assertions. Every test file you touch must have its internal `jest.mock()` calls rewritten against the real implementation as part of the change.

This is the shared test discipline used by `/my:e2e`, `/my:sweep-mocks`, `/my:fix-ci`, `/my:dispatch`, and `/my:fix-notion-bugs`. They reference this skill — keep it the single source of truth.

## Scope

`$ARGUMENTS` — what to run. Examples:

- `apps/api` — full API package (Jest + integration)
- `apps/mobile` — full mobile package
- `apps/api/src/services/dictation/` — specific directory
- `apps/api/src/services/dictation/result.integration.test.ts` — specific file
- `e2e` — full mobile E2E suite (delegate to `/my:e2e` for the runner)
- (omitted) — ask the user which scope before running

For integration tests, prepend `C:/Tools/doppler/doppler.exe run -- ` so `DATABASE_URL` and friends are populated. For e2e, `seed-and-run.sh` handles env itself.

## The loop

1. **Run the target suite.** Capture full output. Keep the failure list verbatim.
2. **Note every failure.** One line each: `<file> :: <test name> :: <one-line cause>`.
3. **Investigate each one.** Classify:
   - **Real bug** — the test caught a regression. **Fix the production code, not the test.** Never weaken assertions, never delete the failing case.
   - **Test drift** — the test references behavior that legitimately changed (renamed testID, restructured response, removed feature). **Rewrite the assertion to match the current real implementation**, not to a vaguer/optional check. If the feature genuinely no longer exists, delete the whole test, not the failing assertion.
   - **Env / infra failure** — Metro down, port not reversed, DB migration not applied, Doppler scope mismatch. Fix the env and re-run. Do not edit the test.
4. **For every test file you opened in step 3, run the mock-on-touch sweep below before declaring that file done.**
5. **Re-run.** Repeat 1–4 until clean.

**Parallel agents:** when the failure surface is wide (multiple packages, route groups, Inngest function families), fan out via `/my:dispatch` — it owns the planning, agent contract, post-fan-out validation, and safety limits. Don't roll your own fan-out logic here. Subagents do not commit; they report changed files; the coordinator commits via `/commit`.

## Mock-on-touch sweep (GC6)

Any test file you open during the loop must have its internal `jest.mock('./…')`, `jest.mock('../…')`, and `jest.mock('@eduagent/…')` calls converted before you call that file done. External-boundary mocks stay — they use bare specifiers and are not violations: LLM via `routeAndCall`, Stripe, Clerk JWKS, Expo Push, email transports, and the Inngest framework.

### Canonical replacement

```typescript
jest.mock('../services/session', () => {
  // Use the real module so instanceof checks, exported error classes, and
  // pure helpers stay real. Only override the specific side-effect exports
  // the test needs to control.
  const actual = jest.requireActual('../services/session') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    sendNotificationOnComplete: jest.fn(),
  };
});
```

Working example: `apps/api/src/routes/sessions.test.ts:128` (and the later inline reuse around `:309`).

### Decision matrix

| Original mock | Action |
| --- | --- |
| Stubs a pure function the test could call for real | Remove the mock entirely; let the real implementation run. |
| Stubs a side-effect export, rest of the module is safe | `requireActual` spread + targeted override (canonical above). |
| Stubs DB/repo from a unit test where DB shape is part of the contract | Convert file to `*.integration.test.ts`; use `createIntegrationDb` (see harness table). |
| Genuinely irreplaceable (e.g. Inngest client registration metadata) | Annotate with `// gc1-allow: <reason>` on the same `jest.mock(` line. |

If removing a mock makes the test fail, the mock was hiding a bug — that's the point. Fix the bug, not the mock.

## Shared harnesses to prefer over hand-rolled mocks

| Boundary | Helper | Use when |
| --- | --- | --- |
| API integration DB | `tests/integration/helpers.ts` → `createIntegrationDb`, `buildIntegrationEnv` | Test asserts persisted state |
| API external HTTP | `tests/integration/fetch-interceptor.ts`, `apps/api/src/test-utils/jwks-interceptor.ts` | LLM/embedding/push/email HTTP boundaries |
| API LLM with real router + envelope | `apps/api/src/test-utils/llm-provider-fixtures.ts` | Anywhere `./llm` is currently mocked |
| API Inngest step semantics | `apps/api/src/test-utils/inngest-step-runner.ts` | Workflow tests that want real handler bodies |
| API Inngest dispatch capture | `apps/api/src/test-utils/inngest-transport-capture.ts` | Tests that only verify the right event was sent |
| Mobile route-shaped fetch | `apps/mobile/src/test-utils/mock-api-routes.ts` (`createRoutedMockFetch`, `mockApiClientFactory`) | Screen/hook tests instead of mocking `../lib/api-client` |
| Mobile QueryClient + profile wrapper | `apps/mobile/src/test-utils/app-hook-test-utils.tsx` | Hooks (and screens, extending the wrapper) that need providers |
| Mobile native shims | `apps/mobile/src/test-utils/native-shims.ts` | Stable boundary mocks for router, safe area, icons, SecureStore, Sentry |

## References

- Inventory + risk classes: `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md`
- Per-mock CSV (1k+ rows): `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv`
- Harness framework plan: `docs/plans/2026-05-12-shared-test-utility-framework-plan.md`
- E2E preconditions + runbook entry: `/my:e2e`, then `docs/E2Edocs/e2e-runbook.md`
- Mobile Maestro patterns: `/my:maestro-testing`
- Proactive mock-elimination sweep (no failure loop): `/my:sweep-mocks`
- Project rules: `CLAUDE.md` → "Tests Must Reflect Reality", "Code Quality Guards" (GC1 ratchet + GC6 boy-scout)
- Inventory guard: `apps/api/src/test-utils/integration-mock-guard.test.ts` (fails CI on non-allowlisted integration mocks)

## Update documentation after every run

The discipline is only durable if the docs reflect the real state. Before you report back, refresh whichever of these your run touched:

- **Mocks added, removed, or converted** → regenerate the inventory:
  ```powershell
  node --no-warnings scripts/generate-internal-mock-cleanup-inventory.ts
  ```
  That rewrites `docs/plans/2026-05-12-internal-mock-cleanup-inventory.csv`. Then hand-edit `docs/plans/2026-05-12-internal-mock-cleanup-inventory.md` so the totals, risk-class table, and "Top files by internal-ish mock count" reflect the new CSV.
- **New shared harness or pattern established** → add a row to the harness table in `docs/plans/2026-05-12-shared-test-utility-framework-plan.md` (and to the harness table in this skill) so the next agent finds it.
- **E2E infra fault diagnosed or workaround learned** → add a row to the troubleshooting matrix in `docs/E2Edocs/e2e-runbook.md`.
- **Mobile flow test status changed** (pass → fail, blocked → pass, new flow added) → update the flow table in `docs/flows/plans/2026-05-01-flow-revision-plan.md`.
- **Bug verified or fix shipped from a Notion row** → update the Notion row (`Status`, `Fixed In`, `Resolution`, `Resolved`). See `/my:fix-notion-bugs`.
- **Repo rule discovered or refined** → CLAUDE.md is the canonical place. Don't bury a new rule in this skill only.

If you didn't touch any of the above, say so explicitly in the report ("docs unchanged, no new mocks added, no harnesses introduced"). Silence is ambiguous.

## NEVER

- Weaken an assertion to make a failing test pass (`optional: true`, broadening `text:` matches, deleting the failing step, `try/catch` around an `expect`).
- Add a new internal `jest.mock('./...')` / `jest.mock('../...')` / `jest.mock('@eduagent/...')` without `// gc1-allow: <reason>` on the same line.
- Mock the database, repositories, services, middleware, or your own modules in an integration test.
- Have a subagent commit. Coordinator commits via `/commit`.
- Skip the failure loop and declare a partial run "good enough". Either drive to clean or report exactly which failures remain and why they're deferred.
