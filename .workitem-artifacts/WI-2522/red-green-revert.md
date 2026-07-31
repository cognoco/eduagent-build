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

The final focused commands are:

```bash
PATH=/home/vetinari/.local/node22/bin:$PATH \
  pnpm test:doppler-run

PATH=/home/vetinari/.local/node22/bin:$PATH \
  pnpm exec jest --config scripts/jest.config.cjs \
  scripts/run-api-integration.test.ts --runInBand --no-coverage
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
itself spawn bare `corepack`. At the second-review head,
`run-api-integration.mjs` still spawned bare `corepack` before reaching Doppler,
so the earlier blanket no-Corepack claim was false; the third-review correction
below removes those production calls. The fake-Doppler and package-script cases
do not modify `PATH`; the missing-Doppler negative case intentionally replaces
`PATH` with an empty fixture directory.

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

## API integration launcher correction after third adversarial review

The canonical `pnpm test:api:integration` command enters
`run-api-integration.mjs` before Doppler. At the third-review head, both its
version probe and its Jest/Nx dispatch used `spawnSync('corepack', ...)`.
Windows Node 22 supplies `corepack.cmd`, not an executable that Node can spawn
directly without a shell, so that path could fail before exercising the fixed
Doppler guard.

The script now resolves pnpm from lifecycle-provided `npm_execpath`, uses
`process.execPath` only for `.js`/`.cjs` CLI paths, and directly spawns native
executable shapes such as the standalone action's `pnpm.exe`. The version probe
returns that exact launcher for the subsequent `pnpm exec` call, preserving the
`packageManager: pnpm@10.19.0` pin check and preventing a different PATH binary
from handling forwarded arguments.

Third-review TDD cycle under Node `v22.16.0`:

1. **RED:** with production unchanged, a cross-platform preload rejected bare
   Corepack and observed no `npm_execpath` launch. The standalone `pnpm.exe`,
   Windows `.cjs`, POSIX `.js`, and version-mismatch cases all failed:
   4 failed, 15 skipped.
2. **GREEN:** switched the version probe and Jest/Nx dispatch to the lifecycle
   launcher. Result: 4 passed, 15 skipped; the full
   `run-api-integration.test.ts` suite then passed 19/19.
3. **PRODUCTION-ONLY REVERT RED:** restored only the production version probe
   and command dispatch to bare Corepack, holding tests and the preload fixed.
   Result: 4 failed, 15 skipped with the same Corepack-before-launch failure.
4. **RESTORE GREEN:** restored the lifecycle launcher. Result: 4 passed,
   15 skipped; the full suite again passed 19/19.

## Package-script dispatch coverage

The focused suite runs `pnpm test`, `pnpm test:api:integration`, and
`pnpm test:integration` as real subprocesses under the Node preload. For the API
script, the already-installed lifecycle pnpm first answers `--version`; the fake
Doppler then exits before Nx, Jest, or database work. The prior blanket
`offline` claim was false because bare Corepack could perform package-manager
resolution. The corrected proof explicitly rejects bare Corepack, remains
deterministic and secret-free, and proves each package script reached
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
