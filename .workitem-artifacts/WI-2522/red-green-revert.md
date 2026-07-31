# WI-2522 — doppler-run Windows entry guard RGR evidence

## Root cause

`package.json` requires Node `22.x`. The following observation was obtained on
this worktree's local Node `v22.16.0`:

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

The final focused command is:

```bash
PATH=/home/vetinari/.local/node22/bin:$PATH \
  pnpm test:doppler-run
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

## Cross-platform harness correction after adversarial review

The first committed harness used a literal `:` when extending `PATH` and an
extensionless `#!/bin/sh` fake Doppler. That harness was POSIX-only and did not
support the Windows-facing claim. The correction replaced it with a CommonJS
Node preload that patches only `spawnSync('doppler', ...)`, calls
`syncBuiltinESMExports()` before `doppler-run.mjs` loads, and returns deterministic
spawn results without a shell executable. Fake setup is centralized in
`fakeDopplerEnv()`. Nested package scripts launch pnpm's lifecycle-provided
`npm_execpath` directly when it is executable-shaped (including `pnpm.exe`), or
through `process.execPath` when it is a `.js`/`.cjs` CLI. The harness does not
spawn bare `corepack`. The fake-Doppler and package-script cases do not modify
`PATH`; the missing-Doppler negative case intentionally replaces `PATH` with an
empty fixture directory.

Correction cycle:

1. **HARNESS RED:** tests referenced the not-yet-created Node preload. Result:
   5 failed, 8 passed; the two real-invocation cases and all three package-script
   cases failed, while guard/resolver cases stayed green.
2. **HARNESS GREEN:** added the preload and removed the shell fixture. Result:
   13 passed, 0 failed.
3. **WINDOWS-CI RED:** added a contract test requiring the focused suite in the
   existing required `windows-latest` job. Result: 1 failed, 13 passed because
   the step was absent.
4. **WINDOWS-CI GREEN:** added `pnpm test:doppler-run` to that job. Result:
   14 passed, 0 failed.
5. **REPEATED PRODUCTION-ONLY REVERT RED:** with the corrected harness and CI
   contract held fixed, changed only the production predicate back to
   `` `file://${argvPath}` ``. Result: 1 failed, 13 passed. The sole failure
   remained the matching Windows drive-letter dispatch case:

   ```text
   Expected: "doppler"
   Received: ""
   ```

6. **REPEATED RESTORE GREEN:** restored `pathToFileURL(...)`. Result:
   14 passed, 0 failed.

## Native pnpm launcher correction after second adversarial review

The required Windows workflow installs pnpm with `pnpm/action-setup` and
`standalone: true`, so `npm_execpath` is a native `pnpm.exe`, not a JavaScript
CLI. Passing that executable to `node.exe` would fail before the Doppler preload
could observe package-script dispatch. The launcher now uses `process.execPath`
only for `.js` and `.cjs` CLI paths and spawns every other executable shape
directly.

After a 14/14 behavior-preserving extraction baseline, the launcher
RED/GREEN/revert/restore phases ran with the repository-required Node
`v22.16.0`:

1. **BEHAVIOR-PRESERVING REFACTOR GREEN:** extracted the existing unconditional
   Node launcher into `packageManagerLaunch()`. Result: 14 passed, 0 failed.
2. **LAUNCHER-SHAPE RED:** added focused `.js`, `.cjs`, and native `pnpm.exe`
   launcher assertions before changing the predicate. Result: 1 failed,
   16 passed. Only the native executable case failed because it received
   `process.execPath` as the command.
3. **LAUNCHER-SHAPE GREEN:** selected Node only for `.js`/`.cjs` paths and direct
   execution otherwise. Result: 17 passed, 0 failed.
4. **LAUNCHER-ONLY REVERT RED:** reverted only the launcher predicate to the
   unconditional Node behavior, holding the tests, production entry guard,
   preload, and CI contract fixed. Result: 1 failed, 16 passed; only the native
   executable case failed.
5. **RESTORE GREEN:** restored the suffix-based launcher selection. Result:
   17 passed, 0 failed.

## Package-script dispatch coverage

The focused suite runs `pnpm test`, `pnpm test:api:integration`, and
`pnpm test:integration` as real subprocesses under the Node preload. The fake
exits before any Nx/Jest/database work, so the checks are deterministic,
offline, and secret-free while proving each package script reached
`doppler-run.mjs` and dispatched:

```text
ARGS:run -- nx run-many -t test
ARGS:run --project mentomate --config dev_integration -- ... scripts/run-api-integration.mjs --nx
ARGS:run -- jest --config tests/integration/jest.config.cjs --no-coverage
```

The entry-guard subprocess cases separately exercise Windows `C:\...` argv
conversion against `file:///C:/...`, a different Windows file URL that must not
dispatch, and a matching POSIX path/file URL.

This Linux host does **not** constitute native-Windows execution evidence. The
PR gate for that evidence is the existing required
`wi2176-windows-orion-contract` job on `windows-latest`, now extended with
`pnpm test:doppler-run`. No PR was opened in this builder task, so that native
Windows result remains pending the PR run.

## Exit propagation

The pre-existing real-invocation regression sends `--exit-check` to the fake
Doppler preload, which returns exit `7`; the wrapper process also exits exactly
`7`. That test passed in both GREEN states, both production-only revert RED
states, and the final RESTORE GREEN state.
