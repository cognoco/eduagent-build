Checkpoint: WI-1023 worktree repair gate

- Lane A stopped before implementation after coordinator reported the WI-1023 worktree was broken.
- The broken registration observed by the coordinator was:
  `fatal: not a git repository: /mnt/c/Dev/Projects/Products/Apps/eduagent-build/.git/worktrees/WI-1023`
- No WI-1023 code changes, commits, pushes, or Cosmo claims were made by this lane before this checkpoint.
- Earlier setup attempt was interrupted after a Git fetch ref-lock race and then a retry; `git worktree list` later showed WI-1023 registered with `/mnt/c/...` metadata and locked.
- Current gate: repair or recreate `.worktrees\WI-1023` using Windows/PowerShell/Git-for-Windows paths only, then confirm:
  `git -C .worktrees\WI-1023 status --short --branch`
  reports branch `WI-1023`.

Repair result:

- Repaired only the WI-1023 Git pointer files:
  - `.worktrees\WI-1023\.git`
  - `.git\worktrees\WI-1023\gitdir`
- Replaced `/mnt/c/...` pointers with `C:/Dev/Projects/Products/Apps/eduagent-build/...`.
- Confirmed `git -C .worktrees\WI-1023 status --short --branch` works and reports `## WI-1023`.
- Confirmed `git worktree list --porcelain` reports WI-1023 at `C:/Dev/Projects/Products/Apps/eduagent-build/.worktrees/WI-1023`.

Implementation checkpoint:

- Fetched and claimed WI-1023 after repair; repo guard passed for MentoMate / `cognoco/eduagent-build`.
- Read `workitem.json`, root `package.json`, `pnpm-workspace.yaml`, current `pnpm-lock.yaml` Vitest entries, and npm metadata for `vitest@3.2.6`, `@nx/vite@22.2.0`, and `@nx/vitest@22.2.0`.
- Before patch, `pnpm audit --json` reported `vitest` advisory `1120126`, `CVE-2026-47429`, vulnerable `<3.2.6`, patched `>=3.2.6`, finding `3.2.4 via .>@nx/react>@nx/vite>vitest`.
- Added root pnpm override `"vitest": "3.2.6"` to avoid floating to Vitest 4.x while satisfying Nx peer ranges and the patched floor.
- `pnpm install` timed out before producing a lockfile change; current worktree diff at checkpoint is only `package.json`.

Later dependency-resolution state:

- The initial override-only lockfile update was insufficient: it changed Nx's peer requirement text but still left the resolved peer as `vitest@3.2.4`.
- Retried with explicit root `vitest@3.2.6` so Nx's auto-installed peer resolves to the patched version.
- Current tracked diff is `package.json` + `pnpm-lock.yaml`.
- Confirmed `pnpm install --lockfile-only --frozen-lockfile` exits 0.
- Confirmed lockfile no longer contains `vitest@3.2.4`, `@vitest/*@3.2.4`, or `vitest: 3.2.4`.
- Confirmed focused `pnpm audit --json` extraction returns `NO_VITEST_CVE_2026_47429`.
- Generated `node_modules` in `.worktrees\WI-1023` is stale/partially removed after interrupted installs; `pnpm list` may still reflect stale generated state until node_modules is rebuilt.
- Rebuilt dependencies with `pnpm install --frozen-lockfile --ignore-scripts --force`; command exited 0.
- After rebuild, `pnpm list vitest -r --depth 20` shows root `vitest 3.2.6` and Nx peer paths resolving `vitest 3.2.6`.
- `pnpm exec nx run-many -t test` ran for about 16 minutes and exited 1 without useful captured output; do not treat full-suite verification as passed from that run.
- Read `.nx/cache/run.json` from that Nx run: all targets passed except `@eduagent/mobile:test`; api/test-utils/retention/database/schemas test/build targets exited 0.
- Read mobile terminal output: the failure was one mobile suite failing to run because `node_modules/.pnpm/html-parse-stringify@3.0.1/.../dist/html-parse-stringify.js` was missing, with 439 mobile suites passing and 5133 tests passing. This points to generated install integrity, not a source assertion failure from the Vitest change.
- Confirmed the missing `html-parse-stringify` dist file later exists on disk and `pnpm list vitest -r --depth 20` still shows root + Nx peer paths at `vitest 3.2.6`.
- Retried `pnpm test:mobile:unit`; it timed out at the 20-minute tool limit, so mobile verification remains unresolved.
