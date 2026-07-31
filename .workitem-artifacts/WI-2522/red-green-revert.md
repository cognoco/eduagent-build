# WI-2522 — doppler-run Windows entry guard RGR evidence

## Root cause

Executed with the repository-pinned Node 22.16.0:

```text
argv1:           C:\repo\scripts\doppler-run.mjs
import.meta.url: file:///C:/repo/scripts/doppler-run.mjs
old comparison:  file://C:\repo\scripts\doppler-run.mjs
old matches:     false
pathToFileURL:   file:///C:/repo/scripts/doppler-run.mjs
new matches:     true
```

The old template interpolation did not convert a native Windows drive-letter
path to a file URL. `pathToFileURL(argvPath, { windows: true }).href` performs
the required slash and drive-letter conversion. The same API with
`windows: false` preserves the POSIX direct-entry behavior.

## Command

Every phase used:

```bash
PATH=/home/vetinari/.local/node22/bin:$PATH \
  pnpm exec jest --config scripts/jest.config.cjs \
  scripts/doppler-run.test.ts --runInBand --no-coverage
```

## Strict TDD cycle

1. **RED — tests only, pre-fix production:** 3 failed, 10 passed. All three new
   entry-guard subprocess cases failed because the production dispatch seam
   was absent. Existing resolver, real invocation, exact exit propagation, and
   all three intercepted package-script checks passed.
2. **GREEN — fix applied:** 13 passed, 0 failed.
3. **PRODUCTION-ONLY REVERT RED:** changed only the production predicate from
   `pathToFileURL(argvPath, { windows }).href` back to
   `` `file://${argvPath}` ``; tests were unchanged. Result: 1 failed,
   12 passed. The sole failure was:

   ```text
   Windows drive-letter argv dispatches main when its file URL matches
   Expected: "doppler"
   Received: ""
   ```

   The different-Windows-URL no-dispatch case, POSIX dispatch case, three
   package-script dispatch checks, and exact child exit propagation remained
   green.
4. **RESTORE GREEN:** restored only the normalized production comparison.
   Result: 13 passed, 0 failed.

## Windows-facing package-script proof

The focused suite runs `pnpm test`, `pnpm test:api:integration`, and
`pnpm test:integration` as real subprocesses with the repository fake Doppler
binary first on `PATH`. The fake exits before any Nx/Jest/database work, so the
checks are deterministic, offline, and secret-free while proving each package
script reached `doppler-run.mjs` and dispatched:

```text
ARGS:run -- nx run-many -t test
ARGS:run --project mentomate --config dev_integration -- ... scripts/run-api-integration.mjs --nx
ARGS:run -- jest --config tests/integration/jest.config.cjs --no-coverage
```

The entry-guard subprocess cases separately exercise native Windows
`C:\...` argv conversion against `file:///C:/...`, a different Windows file
URL that must not dispatch, and a matching POSIX path/file URL.

## Exit propagation

The pre-existing real-invocation regression sends `--exit-check` to the fake
Doppler child, which exits `7`; the wrapper process also exits exactly `7`.
That test passed in GREEN, production-only revert RED, and RESTORE GREEN.
