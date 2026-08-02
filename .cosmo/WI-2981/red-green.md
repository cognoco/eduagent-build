# WI-2981 RED/GREEN evidence

> **Rework note (supersedes the first submission's evidence).** Independent
> review rejected the original proof: the deterministic model's variant B used
> three *distinct* SHA groups (`ci-main-main-1/2/3`), so `schedule()` never
> entered its same-group replacement branch and the variant could not reproduce
> the baseline defect. Its retention check compared set sizes, which held
> trivially. The sections below replace that proof. This rework is
> test-and-evidence only — `.github/workflows/ci.yml` is byte-identical to
> `origin/main` (`git diff origin/main -- .github/workflows/ci.yml` is empty).

## What the contract now proves

`scripts/ci-concurrency-contract.test.ts` no longer hand-writes group names.
It parses `.github/workflows/ci.yml` and evaluates the real
`concurrency.group` / `concurrency.cancel-in-progress` expressions through a
small, dependency-free GitHub Actions expression evaluator (context paths,
single-quoted strings, `format()`, `==`/`!=`, `!`, and operand-returning
`&&`/`||` with GitHub's falsy set).

The **same** evaluator scores both inputs, so the baseline and the fix are
compared on equal terms:

| Input | Source | Main-push groups for `sha-1/2/3` |
|---|---|---|
| Baseline (defective) | `BASELINE_GROUP` constant, the pre-fix expression | `ci-refs/heads/main` ×3 — one shared group |
| Current (fixed) | parsed from `.github/workflows/ci.yml` | `ci-main-sha-1`, `ci-main-sha-2`, `ci-main-sha-3` |

Groups are asserted **by value**, and retention is asserted as the **exact
ordered list of surviving SHAs** — never a set-size comparison.

### Baseline defect, reproduced

With one shared group and `cancel-in-progress: false`, GitHub keeps at most one
running plus one pending run per group. `sha-1` runs, `sha-2` waits, and
`sha-3` displaces `sha-2` from the pending slot:

```text
retained SHAs = ['sha-1', 'sha-3']   # sha-2 never receives CI
```

This is the WI-2981 symptom — an intermediate merge commit losing attributable
CI — and it is now executed by the test, not asserted in prose.

### Fix, proven mutation-sensitively

Driven by the parsed workflow expression, the same three pushes land in three
distinct groups and all survive:

```text
retained SHAs = ['sha-1', 'sha-2', 'sha-3']
```

Because the groups are derived from the file, swapping `github.sha` back to
`github.ref` collapses them and this retention assertion itself fails.

## GREEN — current workflow

```text
pnpm exec jest --config scripts/jest.config.cjs scripts/ci-concurrency-contract.test.ts --runInBand --no-coverage
PASS — 1 suite; 13 passed, 13 total; exit 0
```

## RED — mutation to the pre-fix baseline

Only the concurrency **group line** was reverted, so the RED is attributable to
the concurrency key alone and the OTA assertions stay green (the first
submission's whole-file revert reddened OTA tests for unrelated reasons and
made the record unauditable):

```diff
-  group: ${{ github.event_name == 'pull_request' && format('ci-pr-{0}', github.event.pull_request.number) || format('ci-main-{0}', github.sha) }}
+  group: ci-${{ github.event.pull_request.number || github.ref }}
```

```text
FAIL — 1 suite; 5 failed, 8 passed, 13 total; exit 1
```

Tests that flipped to RED (by name, not by count):

1. `retains running, pending, and third main SHAs independently`
   — **the retention contract**: expected `['sha-1','sha-2','sha-3']`,
   received `['sha-1','sha-3']`. `sha-2` is displaced. This is the assertion the
   reviewer required to be mutation-sensitive.
2. `gives each main push its own SHA-scoped group` — received
   `['ci-refs/heads/main','ci-refs/heads/main','ci-refs/heads/main']`.
3. `D — a historical main rerun stays isolated from newer main evidence` —
   both reruns collapse onto `ci-refs/heads/main`.
4. `keeps pull-request and main groups from ever colliding` — PR group is
   `ci-42` under the baseline rather than `ci-pr-42`.
5. `pins the exact PR/main concurrency group and PR-only cancellation policy` —
   the pre-existing exact-string pin. **Expected and by design**; it is a
   literal pin, not behavioral proof, and is listed here so it is not read as
   noise.

Tests that correctly stayed GREEN under the mutation:

- both `baseline defect …` tests — they are driven by the baseline constant,
  so they are invariant to the workflow file;
- `C — a stale pull-request head cancels the prior run in the same group` —
  deliberately group-name agnostic (asserts both heads share one group and only
  the newest survives), so PR cancellation behavior is unchanged by the
  mutation and does not dirty the RED record;
- `A — an idle main push simply queues`;
- all OTA serialization and live-tip tests.

## RESTORE → GREEN

```text
git checkout -- .github/workflows/ci.yml
git diff origin/main -- .github/workflows/ci.yml   # empty — no production change
pnpm exec jest --config scripts/jest.config.cjs scripts/ci-concurrency-contract.test.ts --runInBand --no-coverage
PASS — 1 suite; 13 passed, 13 total; exit 0
```

## OTA contract — corrected claim

The earlier evidence claimed a superseded OTA run "remains green". That was
wrong and is withdrawn: the `ota-update` job carries
`concurrency: { group: ota-preview, cancel-in-progress: true }`, so a
superseded OTA job can be **cancelled outright** rather than finishing green.

What is actually contracted, and what the tests assert:

- **No stale publish.** `Publish OTA update to preview channel` requires
  `steps.live-main-tip.outputs.matches == 'true'`, and the live-tip check runs
  immediately before it.
- **The guard step does not fail the job it is in.** When main has advanced the
  step emits `matches=false` and `exit 0`; it never `exit 1`s. Whether the
  surrounding job survives is decided by `ota-preview`'s `cancel-in-progress`,
  not by this step.
- Preview publication is serialized via the `ota-preview` group.

No claim is made here about branch-protection required checks: that
configuration is GitHub-side and not declared in this repository, and this
change does not touch it.

## Wider validation (this rework)

```text
pnpm run test:scripts                       74 suites passed, 1 skipped; 1248 tests passed; exit 0
pnpm check:github-workflow-security         passed
pnpm exec prettier --check scripts/ci-concurrency-contract.test.ts .github/workflows/ci.yml
                                            all matched files use Prettier code style
yaml parse of .github/workflows/ci.yml      parses; concurrency.group intact
tsc --noEmit on the contract test           exit 0
```

## Scope

No deployment authority, permissions, triggers, required checks, or merge-gate
settings were changed. The only tracked production file touched during this
rework was `.github/workflows/ci.yml`, mutated temporarily for the RED
experiment and restored to its `origin/main` content.
