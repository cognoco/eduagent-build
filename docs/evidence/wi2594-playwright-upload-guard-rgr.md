# WI-2594 Playwright upload guard red-green-revert evidence

Date: 2026-07-22
Scope: deterministic workflow-structure test only; no existing artifact or credential content was opened, searched, quoted, or reproduced.

## Replacement failure diagnostics (AC-3)

A throwaway Playwright spec used the same `[['line']]` reporter retained by `apps/mobile/playwright.config.ts`, with screenshot, trace, and video generation disabled. The synthetic spec contained only `expect('got').toBe('want')`; it did not contact staging, seed a user, or handle a credential.

Observed output from the real Playwright test runner:

```text
Running 1 test using 1 worker

[1/1] demo.spec.ts:3:5 › line reporter preserves a debuggable failure
  1) demo.spec.ts:3:5 › line reporter preserves a debuggable failure

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "want"
    Received: "got"

      3 | test('line reporter preserves a debuggable failure', () => {
    > 4 |   expect('got').toBe('want');
        |                 ^
      5 | });
        at demo.spec.ts:4:17

  1 failed
    demo.spec.ts:3:5 › line reporter preserves a debuggable failure
```

The job log therefore retains the failing test title, expected and received values, source line, code frame, and stack location without producing or uploading Playwright artifacts.

## Command

```bash
pnpm exec jest --config scripts/jest.config.cjs \
  scripts/e2e-web-artifact-upload-guard.test.ts --runInBand
```

## RED — temporarily reintroduced an offending upload

The committed workflow was temporarily given this uncommitted probe, deliberately using a case-variant action and a parent glob that would select the sensitive Playwright trees without naming either directory:

```yaml
- name: TEMP WI-2594 non-vacuity probe
  if: always()
  uses: Actions/Upload-Artifact@v4
  with:
    name: wi-2594-non-vacuity-probe
    path: apps/mobile/e2e-web/*
```

Observed failing output:

```text
FAIL scripts/e2e-web-artifact-upload-guard.test.ts
  [WI-2594] e2e-web.yml never republishes credential-bearing Playwright artifacts
    ✓ recognizes upload-artifact actions despite casing, wrappers, parent paths, or globs
    ✕ declares no upload-artifact action while no redaction or secret-scan proof exists

Expected: []
Received: ["job \"run-smoke\" step \"TEMP WI-2594 non-vacuity probe\""]

Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 passed, 2 total
```

## GREEN — reverted the probe

The temporary workflow step was removed and the identical command was rerun:

```text
PASS scripts/e2e-web-artifact-upload-guard.test.ts
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

The final workflow contains no probe and no `upload-artifact` action. The guard intentionally bans every official or local `upload-artifact` action in this workflow until a future change supplies and tests a proven redaction or secret-scan path.
