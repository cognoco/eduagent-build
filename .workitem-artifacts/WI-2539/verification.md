# WI-2539 verification receipt

Recorded on 2026-07-26 from branch `WI-2539` in its isolated worktree.

| Command | Result |
| --- | --- |
| `pnpm exec jest src/components/session/ChatShell.test.tsx src/components/session/ChatShell.perf.test.tsx --runInBand --no-coverage` (pre-change baseline) | Exit 0; 2 suites and 106 tests passed. Existing `baseline-browser-mapping` age notice only. |
| `pnpm exec jest src/components/session/ChatShell.test.tsx src/components/session/ChatShell.perf.test.tsx --runInBand --no-coverage` (final diff) | Exit 0; 2 suites and 106 tests passed. No suite console output; existing `baseline-browser-mapping` age notice only. |
| `pnpm exec tsx scripts/check-gc1-pattern-a.ts` | Exit 0; no findings. |
| `pnpm exec prettier --check apps/mobile/src/components/session/ChatShell.test.tsx apps/mobile/src/components/session/ChatShell.perf.test.tsx` | Exit 0; both files use Prettier style. |
| `pnpm exec eslint apps/mobile/src/components/session/ChatShell.test.tsx apps/mobile/src/components/session/ChatShell.perf.test.tsx` | Exit 0; no findings. |
| `pnpm exec nx run mobile:typecheck` | Exit 0; mobile plus dependencies typechecked. Existing Nx `MaxListenersExceededWarning` observed. |
| `bash scripts/check-change-class.sh --run --fast` | Five legs passed. The full mobile-unit leg failed solely in unrelated `apps/mobile/scripts/run-wi2176-orion-evidence.test.ts` because `pwsh` is absent on this Linux host. |
| `pnpm test:mobile:unit --onlyFailures --silent` | Reproduced the unrelated failure: 1 suite / 1 test failed; received `spawnSync pwsh ENOENT` where the test expects PowerShell exit 0. Reported to the BID-19 shepherd for capture/disposition; no out-of-scope fix attempted. |
| `git diff --cached --check` | Exit 0; no whitespace errors. |

Exact-head GitHub CI and Claude review are intentionally deferred until after the commit, push, and PR publication steps.
