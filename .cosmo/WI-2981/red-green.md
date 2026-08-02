# WI-2981 RED/GREEN evidence

## Contract

`scripts/ci-concurrency-contract.test.ts` covers four deterministic variants:

- idle main push — main group must include `github.sha`;
- running + pending + third main push — the intermediate SHA must remain independently attributable and main runs must not cancel;
- stale pull-request head — PR group must use the PR number and stale PR runs must cancel;
- historical main rerun — a rerun SHA must remain isolated from newer main evidence.
- OTA publication — the preview branch is serialized and publication requires a live-main-tip match immediately before `eas update`.
- stale live-main tip — the guard exits successfully with `matches=false`, so the superseded workflow stays green and the publish step is skipped.

## RED

The test was added before the workflow change and run against the baseline
`.github/workflows/ci.yml`:

```text
pnpm exec jest --config scripts/jest.config.cjs scripts/ci-concurrency-contract.test.ts --runInBand --no-coverage
FAIL — 1 suite; 3 failed, 1 passed
```

The three failures all received the baseline group
`ci-${{ github.event.pull_request.number || github.ref }}` instead of a
commit-SHA group. The PR stale-head case already passed because the baseline
used the PR number and `cancel-in-progress` was already PR-only.

## GREEN

The workflow now uses a PR-number group for pull requests and a SHA group for
main pushes:

```yaml
group: ${{ github.event_name == 'pull_request' && format('ci-pr-{0}', github.event.pull_request.number) || format('ci-main-{0}', github.sha) }}
cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

The same focused command passed:

```text
PASS — 1 suite; 4 tests passed
```

## REVERT → RED → RESTORE → GREEN

For restoration proof, only the workflow concurrency block was temporarily
reverted to the baseline and the same focused command was rerun:

```text
REVERT/RED — exit 1; 1 suite; 1 failed, 8 passed (the stale guard still exited 1)
RESTORE/GREEN — exit 0; 1 suite; 9 passed
```

## OTA correction

The OTA job now uses `group: ota-preview` with `cancel-in-progress: true` and
checks the live `main` ref through the existing read-only `github.token` before
publication. The publish condition requires
`steps.live-main-tip.outputs.matches == 'true'`; this prevents an older main
SHA from publishing after a newer tip has landed, while the stale case emits
`matches=false` and exits 0 so superseded CI remains green.

No deployment authority, permissions, trigger, required-check, or merge-gate
settings were broadened.
