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

PATH=/home/vetinari/.local/node22/bin:$PATH \
  pnpm exec jest --config scripts/jest.config.cjs \
  scripts/api-integration-routing.test.ts --runInBand --no-coverage
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

## Post-Doppler child execution after fourth adversarial review

At the fourth-review head, the fake Doppler preload printed the received
arguments and returned status `0` without starting the command after `--`.
Consequently, the three Windows package-script checks proved only that Doppler
was reached, not that the intended Nx/Jest boundary started.

The corrected preload uses real `spawnSync(process.execPath, ...)` to start a
cross-platform Node boundary child. Direct `nx` and `jest` commands go straight
to that child. The API package script first starts its real guarded
`run-api-integration.mjs --nx` re-entry; the inherited preload then substitutes
the boundary child only at the eventual `pnpm exec nx` call. The child prints
the exact semantic command argv and exits `23`, which propagates through the API
launcher, Doppler wrapper, and pnpm lifecycle.

The formerly documented direct targeted command also bypassed the pnpm
lifecycle and therefore lacked `npm_execpath`. The supported command is now:

```text
pnpm run test:api:integration --jest <test-path> --runInBand --no-coverage
```

`pnpm exec node ...` was rejected as an alternative because the pinned pnpm
does not set `npm_execpath` for that child. Adding `--` after the script name was
also rejected because pnpm forwards it as the launcher's first argument.

Fourth-review TDD cycle under Node `v22.16.0`:

1. **CHILD-EXECUTION RED:** required child markers and exit `23` before changing
   the fake Doppler seam. Result: 3 failed, 14 passed; all three package scripts
   printed only `ARGS:...` and returned `0`.
2. **CHILD-EXECUTION GREEN:** added the boundary child and executed the API
   re-entry through to its Nx boundary. Result: 17 passed, 0 failed.
3. **RUNBOOK RED:** required the pnpm-lifecycle targeted command and rejected
   the raw-Node form. Result: 1 failed, 5 skipped.
4. **TARGETED-COMMAND RED:** a temporary safe guard returned `97` at
   `pnpm exec jest`; no child marker appeared. Result: 1 failed, 17 passed.
5. **TARGETED-COMMAND GREEN:** routed that Jest boundary to the real child and
   updated the runbook. Result: 18 passed, 0 failed; the runbook contract passed.
6. **SEAM-ONLY REVERT RED:** disabled only post-Doppler child execution while
   holding tests, API lifecycle handling, and the targeted-command seam fixed.
   Result: 3 failed, 15 passed.
7. **RESTORE GREEN:** restored post-Doppler execution. Result:
   18 passed, 0 failed.

The changed-file Prettier gate also exposed three pre-existing line-wrap
violations in `doppler-run.mjs`. Formatting changed only those
`resolveDopplerBinary()`/`selfTest()` lines; the approved entry-guard logic was
unchanged.

## Hermetic missing-Doppler case after fifth adversarial review

At the fifth-review head, the negative real-invocation test replaced `PATH` but
still called the host filesystem for `C:/Tools/doppler/doppler.exe`. A native
Windows machine with Doppler installed at that supported fallback could
therefore make the missing-Doppler test dispatch the real executable.

The existing test preload now has a conditional missing-Doppler mode. For that
one negative case it returns `ENOENT` for the `doppler` PATH probe and `false`
for the exact Windows fallback path. Production code and behavior are
unchanged.

Fifth-review TDD cycle under Node `v22.16.0`:

1. **RED:** enabled the requested test mode before implementing it. The preload
   continued reporting fake Doppler as present: 1 failed, 17 passed.
2. **GREEN:** implemented both test-only resolver interceptions:
   18 passed, 0 failed.
3. **SEAM-ONLY REVERT RED:** disabled only the new test-mode request while
   holding its assertion and preload implementation fixed:
   1 failed, 17 passed.
4. **RESTORE GREEN:** restored the test-mode request:
   18 passed, 0 failed.

## Scripts-suite lifecycle after sixth adversarial review

At the sixth-review head, the focused `pnpm test:doppler-run` command supplied
`npm_execpath`, but the bundled CI step invoked Jest through `pnpm exec`.
Consequently, `npm_execpath` was absent inside Jest and all four package-script
subprocess cases threw before dispatch. The exact old CI command reproduced the
review result: 64 of 65 suites passed, with 4 failed and 1,131 passed tests.

The root package now owns the bundled command as `test:scripts`, and CI invokes
it through `pnpm run test:scripts`. That lifecycle supplies the actual pnpm CLI
path without weakening or skipping the four package-script tests. A focused
regression assertion pins both the package-script body and the CI `run:` line.

Sixth-review TDD cycle under Node `v22.16.0`:

1. **RED:** added the command-shape assertion before either configuration
   change. Result: 1 failed, 18 passed; `test:scripts` was absent.
2. **GREEN:** added `test:scripts` and routed CI through its lifecycle.
   Result: 19 passed, 0 failed.
3. **CONFIGURATION-ONLY REVERT RED:** restored only CI's direct Jest command
   while holding the package script and assertion fixed. Result:
   1 failed, 18 passed on the exact CI-command mismatch.
4. **RESTORE GREEN:** restored `pnpm run test:scripts`.
   Result: 19 passed, 0 failed.
5. **FULL CI-EQUIVALENT GREEN:** `pnpm run test:scripts` completed with
   65 suites and 1,136 tests passed, 0 failed.

## API integration CI lifecycle after seventh adversarial review

At the seventh-review head, both co-located API integration CI steps invoked
`pnpm exec nx run api:integration-api`. Unlike a package-script lifecycle,
`pnpm exec` did not set `npm_execpath`; the guarded launcher therefore refused
before Jest. The clean local-database reproduction exited `1` with
`npm_execpath is required`, matching the review.

The root package now exposes `test:api:integration:ci` as
`node scripts/run-api-integration.mjs --nx`. Both CI lanes and the canonical
AGENTS invocation use `pnpm run test:api:integration:ci`, preserving the pinned
package-manager check. The existing fake preload executes this exact package
script through the pnpm lifecycle, observes
`CHILD_STARTED:["nx","run","api:integration-api"]`, and verifies exact child
exit `23` propagation.

Seventh-review TDD cycle under Node `v22.16.0`:

1. **RED:** added the package-script boundary and route/documentation contracts
   before implementation. The boundary suite had 1 failed and 19 passed; the
   routing suite had 4 failed and 3 passed.
2. **GREEN:** added the dedicated script and routed both CI sites plus AGENTS
   through it. Result: boundary 20 passed; routing 7 passed.
3. **CONFIGURATION-ONLY REVERT RED:** restored only both CI steps to direct Nx,
   holding the script, AGENTS text, preload boundary, and assertions fixed.
   Result: routing 2 failed, 5 passed, one failure per CI site.
4. **RESTORE GREEN:** restored both lifecycle commands. Result:
   boundary 20 passed; routing 7 passed.
5. **FULL SCRIPTS GREEN:** `pnpm run test:scripts` completed with 65 suites
   and 1,138 tests passed, 0 failed; the combined launcher/routing run passed
   26 tests.

## Package-script dispatch coverage

The focused suite runs `pnpm test`, `pnpm test:api:integration`, and
`pnpm test:integration` as real subprocesses under the Node preload. For the API
script, the already-installed lifecycle pnpm first answers `--version`; the fake
Doppler starts the guarded re-entry and it proceeds to the Nx command boundary;
no Nx/Jest/database workload runs. The prior blanket `offline` claim was false
because bare Corepack could perform package-manager resolution. The corrected
proof explicitly rejects bare Corepack, remains deterministic and secret-free,
and observes these real child results:

```text
CHILD_STARTED:["nx","run-many","-t","test"]                         -> exit 23
CHILD_STARTED:["nx","run","api:integration-api"]                   -> exit 23
CHILD_STARTED:["jest","--config","tests/integration/jest.config.cjs","--no-coverage"] -> exit 23
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
`7`. It remained green throughout the fourth-review child-execution and
revert/restore cycle; the new package-script checks independently prove exact
propagation of the boundary child's exit `23`.
