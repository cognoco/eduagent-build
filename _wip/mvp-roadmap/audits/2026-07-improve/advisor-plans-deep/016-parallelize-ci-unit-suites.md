# Plan 016: Parallelize the serial CI unit suites (measured, with a revert path)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- package.json apps/mobile/jest.config.cjs apps/api/jest.config.cjs .github/workflows/mobile-ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

> ⚠️ **READ THIS BEFORE ANYTHING ELSE.** This is an **experiment with a revert
> path**, not a confident cleanup. `--runInBand` was almost certainly added on
> purpose. If parallelism reintroduces flake or OOM, **reverting is a
> successful outcome of this plan**, not a failure — you will have converted an
> unknown into a documented constraint. Do not force it through.

## Status

- **Priority**: P2
- **Effort**: S (but timeboxed — see STOP conditions)
- **Risk**: **MED** — this touches test-suite stability, and serial execution
  appears to have been a deliberate stabilization choice.
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

CI runs the mobile unit suite **serially**. `mobile-ci.yml:180` runs
`pnpm test:mobile:unit`, which is:

```
jest --config apps/mobile/jest.config.cjs --runInBand --forceExit
```

`--runInBand` forces every test file into a **single process, one at a time**.
There are **~483 mobile test suites**. No `maxWorkers` is configured anywhere in
the repo. The same pattern exists for `test:api:unit` (`--runInBand`, ~584
suites), which CI invokes conditionally at `ci.yml:426`.

The stated pain is explicit: *"60-minute feedback loops are unacceptable."*
Jest defaults to `cores - 1` workers; on a standard GitHub runner that is a
meaningful multiple of throughput for a suite this size. This is the single
cheapest available lever on CI wall-clock.

**But the honest caveat, which shapes this entire plan:** `--runInBand
--forceExit` was introduced by commit `860119c76` — *"fix: stabilize session
recovery flows and jest"*. And `apps/mobile/jest.config.cjs:120-122` carries:

```js
  // Recycle workers after each file exceeds this memory limit.
  // Prevents OOM when the session test runs after 70+ other suites in one worker process.
  workerIdleMemoryLimit: '512MB',
```

That comment describes a **worker-based** run — i.e. parallelism was in use and
caused memory pressure. `--forceExit` further implies leaked handles (timers,
sockets) that do not close cleanly. Both are signals that serial execution may
be load-bearing.

So: measure, change one variable, prove stability, and be ready to revert.

## Current state

### The scripts (root `package.json`)

```json
"test:api:unit": "jest --config apps/api/jest.config.cjs --runInBand",
"test:mobile:unit": "jest --config apps/mobile/jest.config.cjs --runInBand --forceExit",
```

### Where CI uses them

- `.github/workflows/mobile-ci.yml:180` — `run: pnpm test:mobile:unit` (the main
  mobile test job; runs on every mobile-affected PR). **This is the primary target.**
- `.github/workflows/ci.yml:426` — `run: pnpm test:api:unit`, gated on the
  change-class router's `unit` flag (a narrower, conditional path).

Note the *main* API/mobile test path on PRs goes through `nx affected` targets
(the `@nx/jest` plugin), not these scripts. So the biggest single win is
`mobile-ci.yml:180`, which calls the serial script directly and unconditionally.

### Existing stability machinery you must not break

- `apps/mobile/jest.config.cjs:122` — `workerIdleMemoryLimit: '512MB'`
- `tools/quarantine/registry.cjs` — a flaky-test quarantine (WI-536) already
  feeds `testPathIgnorePatterns` in both jest configs. Known-flaky files are
  already excluded from the gate.
- `--forceExit` — masks non-closing handles. Removing it is **out of scope**.

### Repo conventions

- CI is the authoritative gate; local hooks are fast feedback.
- Do not add `eslint-disable` or suppress warnings to make things pass.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Mobile suite (current, serial) | `pnpm test:mobile:unit` | all pass |
| Mobile suite (parallel candidate) | `pnpm exec jest --config apps/mobile/jest.config.cjs --forceExit --maxWorkers=50%` | all pass |
| Time a run | prefix with `time` (e.g. `time pnpm test:mobile:unit`) | records wall-clock |
| Typecheck mobile | `cd apps/mobile && pnpm exec tsc --noEmit` | exit 0 |

## Scope

**In scope:**
- Root `package.json` — the `test:mobile:unit` and (only if mobile succeeds) `test:api:unit` scripts.
- `apps/mobile/jest.config.cjs` / `apps/api/jest.config.cjs` — only if a `maxWorkers` default belongs there rather than in the script.

**Out of scope (do NOT touch):**
- **`--forceExit`.** It masks leaked handles. Removing it is a separate,
  larger investigation and will fail the suite in confusing ways. Keep it.
- `workerIdleMemoryLimit` — leave it; it is precisely the guard that makes
  parallelism survivable.
- The flaky-test quarantine (`tools/quarantine/`). Do **not** quarantine a test
  just to make this plan pass — that converts a speed win into a coverage loss.
  If a test only fails in parallel, that is a **finding**, not a nuisance.
- The integration suites. `apps/api/jest.config.cjs:65` is explicit: integration
  tests share a real Neon DB and **must** run serially. Never parallelize those.
- The `nx affected` test path — leave it alone.

## Git workflow

- Branch from `main`: `advisor/016-parallelize-ci-unit-suites`
- Conventional commits (e.g. `perf(ci): run mobile unit suite with bounded parallelism`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Establish the baseline — measure before you change anything

```
time pnpm test:mobile:unit
```

Record: wall-clock, suites passed, tests passed. You need this number; without
it the plan cannot prove it achieved anything.

**Verify**: the suite passes serially on your machine today. **If it does NOT
pass on a clean checkout before your change, STOP** — you cannot attribute
later failures to parallelism.

### Step 2: Measure a bounded-parallel run, without committing anything

```
time pnpm exec jest --config apps/mobile/jest.config.cjs --forceExit --maxWorkers=50%
```

Use `--maxWorkers=50%`, **not** the unbounded default. Bounded parallelism is the
whole point: it captures most of the speedup while keeping memory pressure (the
documented OOM risk) in check.

Compare against the Step-1 baseline. Two outcomes:

- **Same pass/fail result, meaningfully faster** → proceed to Step 3.
- **Any test fails that passed serially** → go to Step 5 (the honest-failure path).

**Verify**: record both wall-clock numbers. If the speedup is under ~1.3×, the
change is not worth the stability risk — say so and stop.

### Step 3: Prove it is stable, not lucky

A single green parallel run proves nothing about flake. Run it **five times**:

```
for i in 1 2 3 4 5; do
  pnpm exec jest --config apps/mobile/jest.config.cjs --forceExit --maxWorkers=50% || echo "RUN $i FAILED"
done
```

**All five must pass.** Order-dependence and races surface intermittently — that
is exactly the failure mode `--runInBand` would have been papering over.

**Verify**: 5/5 green. If **any** run fails, go to Step 5. Do not average it out,
do not retry until green, and do not quarantine the offender.

### Step 4: Commit the change (only if Step 3 was 5/5 green)

In root `package.json`:

```json
"test:mobile:unit": "jest --config apps/mobile/jest.config.cjs --forceExit --maxWorkers=50%",
```

Keep `--forceExit`. Drop `--runInBand`. Add `--maxWorkers=50%`.

Leave a comment in the PR description recording the before/after wall-clock and
the 5/5 stability result.

**Then, and only then**, repeat Steps 1–3 for the API suite
(`test:api:unit`, ~584 suites, no `--forceExit`). Treat it as a **separate
commit** so it can be reverted independently — the two suites have different
stability characteristics and must not be coupled.

**Verify**:
- `pnpm test:mobile:unit` → passes, and is faster than the Step-1 baseline.
- `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0.

### Step 5: The honest-failure path (a legitimate outcome)

If parallelism causes **any** failure:

1. Identify the failing test(s) and **why** they fail in parallel — shared module
   state, a global mock, a real timer, a fixed port, a shared temp file, order
   dependence on another suite.
2. **Do not** quarantine them. **Do not** re-add `--runInBand` and call it done
   silently.
3. Write up what you found: which tests, what shared state, and whether it is a
   handful of fixable tests or a systemic issue.
4. **Revert the change** and report.

This outcome is a **success for this plan**: it converts "why is CI serial?" from
folklore into a documented, evidenced constraint, and it hands the team a precise
list of what would have to be fixed to unlock the speedup. Say so plainly.

## Test plan

There are no new tests to write — the existing ~483 suites **are** the test.

The verification is behavioral:
- The same set of tests passes under parallelism as under serial execution
  (identical suite/test counts, zero new failures).
- It does so **five times consecutively** (the flake gate).
- Wall-clock improves meaningfully (≥1.3×, else not worth the risk).

## Done criteria

Exactly one of these two must hold, and you must state which:

**Outcome A — parallelism adopted:**
- [ ] `pnpm test:mobile:unit` no longer contains `--runInBand` and passes
- [ ] 5/5 consecutive green parallel runs recorded
- [ ] Before/after wall-clock recorded in the PR description; speedup ≥1.3×
- [ ] Suite/test counts identical to the serial baseline (nothing silently skipped)
- [ ] `--forceExit` and `workerIdleMemoryLimit` unchanged
- [ ] Nothing added to `tools/quarantine/`
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` status row updated

**Outcome B — parallelism rejected, constraint documented:**
- [ ] The working tree is reverted to the serial scripts
- [ ] A written finding lists the specific tests that fail in parallel and the shared state causing it
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` row set to `REJECTED` with the one-line reason
- [ ] Nothing added to `tools/quarantine/`

## STOP conditions

Stop and report — do not improvise — if:

- The suite does not pass **serially** on a clean checkout before you change
  anything (Step 1). Something else is broken; this plan is not the place to fix it.
- Any of the 5 stability runs fails. Go to Step 5, revert, report. **Do not**
  retry-until-green, do not quarantine, do not reduce `maxWorkers` until the flake
  hides — a test that fails at 50% workers and passes at 25% is still a broken test.
- You are tempted to remove `--forceExit`, quarantine a test, or raise
  `workerIdleMemoryLimit` to make parallelism work. All three trade correctness or
  coverage for speed. Stop and report instead.
- The machine you are on has too few cores for `--maxWorkers=50%` to be meaningful
  (e.g. 2 cores). Say so — your local result will not predict CI's.

## Maintenance notes

- **Why the tentative framing**: commit `860119c76` ("fix: stabilize session
  recovery flows and jest") introduced `--runInBand --forceExit`, and
  `apps/mobile/jest.config.cjs:120-122` documents an OOM in a *worker-based* run.
  Serial execution may be genuinely load-bearing. This plan is designed to find
  out cheaply and reversibly, not to assume.
- **Why `--maxWorkers=50%` and not the default**: the documented failure mode is
  memory, not CPU. Bounded workers keep peak memory well under the runner's
  ceiling while still capturing most of the win. If it proves stable, a follow-up
  can try raising it — one variable at a time.
- **What a reviewer should scrutinize**: that suite/test **counts** match the
  serial baseline. A parallel run that "passes" while silently running fewer tests
  is the dangerous failure mode here.
- **The bigger prize, not in this plan**: `mobile-ci.yml` runs the *whole* mobile
  suite on every mobile-affected PR rather than sharding it across runners or
  using `nx affected`. Sharding across 2–4 runners would likely beat any
  `maxWorkers` tuning. That is a larger CI change and deliberately out of scope
  here — but it is where the real headroom is if this plan's win proves modest.
