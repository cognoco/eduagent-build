# WI-2889 RED/GREEN evidence

## Defect

`removeTempRepo()` in `scripts/check-change-class.test.ts` retried only
`EBUSY`. Every other `rmSync` failure was **rethrown** out of the `afterEach`,
so a transient `ENOTEMPTY` while clearing a temp repo's `.git/objects` on CI
turned an otherwise-passing run red (PR #2668 required-check red, cleared only
by a rerun). The `scripts/* tests` step runs on every non-docs-only PR
(`.github/workflows/ci.yml:383-385`), so the flake surface was every PR.

## Guard

`scripts/check-change-class.test.ts` →
`describe('removeTempRepo (test-harness teardown)')` →
`it('swallows a non-EBUSY removal failure instead of failing the run')`.

It calls `removeTempRepo()` on a path whose parent component is a regular
file. On POSIX that raises `ENOTDIR` deterministically, whatever the uid — the
same non-EBUSY class as the `ENOTEMPTY` race, without having to win a race.
The guard therefore binds both halves of the fix: the removed rethrow **and**
the retry-budget exhaustion path (it runs the full 20 x 250 ms budget, hence
the explicit 20 s test timeout).

## Three steps, as observed

| Step | Command | Result |
|---|---|---|
| RED (guard added, helper unfixed) | `pnpm exec jest --config scripts/jest.config.cjs scripts/check-change-class.test.ts -t "swallows a non-EBUSY"` | **FAIL** (29 ms) — `expect(received).not.toThrow()`; `ENOTDIR: not a directory, unlink '/tmp/ccc-teardown-guard-qAkfJf/file/child'`, thrown at `removeTempRepo (check-change-class.test.ts:97:13)` |
| GREEN (helper fixed) | same | **PASS** (4758 ms — full retry budget) |
| RED again (helper body reverted, guard untouched) | same | **FAIL** (37 ms) — same `ENOTDIR` assertion failure, now thrown from line 104 |

The revert touched only the `removeTempRepo` body; the guard was byte-identical
across all three runs.

## Stress evidence (AC 2)

The structural limb is satisfied first: teardown can no longer throw, so it
cannot fail a run regardless of what the filesystem does. The stress limb was
also run — 10 consecutive full-file runs, 60 tests each, exercising the
`afterEach` teardown ~600 times:

```
for i in $(seq 1 10); do pnpm exec jest --config scripts/jest.config.cjs \
  scripts/check-change-class.test.ts --no-coverage; done
-> pass=10 fail=0; zero ENOTEMPTY across all 10 logs
```

## Validation

| Command | Result |
|---|---|
| `pnpm run test:scripts` (CI-equivalent) | 75 suites passed / 1 skipped, 1271 tests passed |
| `pnpm exec tsc --build` | exit 0 |
| `pnpm check:no-gemini-runtime` | clean (76 grandfathered, 0 new) |
| `pnpm exec eslint scripts/check-change-class.test.ts` | clean |

`bash scripts/check-change-class.sh` classes the diff `typescript`,
`no-gemini-runtime`; both demanded fast commands are in the table above.

## Scope notes

- `rg -n "EBUSY" scripts/ --glob '*.ts'` -> 1 hit, the site fixed here. No
  sibling drift, so the 3+-locations sweep rule does not fire.
- The bare `rmSync(ambientRepo, { recursive: true, force: true })` in the same
  file's WI-1345 test had **zero** retries and sat in a `finally`, where an
  `ENOTEMPTY` would both redden the check and mask the real assertion failure.
  Converted to `removeTempRepo()` — same AC 1 property, same file.
- `rmSync(baseline)` (the no-Gemini baseline deletion) is a mid-test file
  delete that *is* the behavior under test, not teardown. Left alone.
- The suite's assertions are unchanged (AC 3): the diff touches the teardown
  helper, one teardown call site, and adds one new guard.
