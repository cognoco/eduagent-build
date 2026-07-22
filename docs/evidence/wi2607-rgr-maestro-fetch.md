# WI-2607 — red-green evidence (Maestro-main-health fetch fix)

The bug is in the `gh` I/O seam (`fetchMaestroRuns` in
`scripts/check-maestro-main-health.ts`), which shells out to the live GitHub API and
is therefore exercised by a **live run**, not a unit test (the pure classifier that IS
unit-tested — 12/12 — was already correct; the fetcher fed it the wrong runs). The
red→green evidence is the observed live behaviour before and after the fix, against the
real `cognoco/eduagent-build` repo.

## The defect

`fetchMaestroRuns` pulled an unfiltered `?branch=main` runs list. On this busy `main`
every CI completion triggers a `workflow_run` E2E run — dozens/day, most change-class-skip
Maestro — so the fetched window is ~all Maestro-skipped `workflow_run` runs and the nightly
`schedule` run (which unconditionally executes the full 8-shard suite) is buried beyond it.
The classifier then finds no executed health-suite run → **STALE forever** → the scheduled
workflow would exit red and false-alarm on every run, defeating WI-2596's AC-3.

## RED — before the fix (live run against the real repo)

```
maestro-main-health: STALE
  No E2E Tests run on main has executed the Maestro shards in the fetched history — Maestro-on-main health is unknown.
exit=1
```

Diagnosis confirming the cause: the 40 most-recent `e2e-ci.yml` runs on main were **100%
`workflow_run`** (zero `schedule` in the window); the newest all had `Mobile Maestro E2E
Tests` = `skipped`; the latest nightly `schedule` run (29894742910, 05:46Z) was outside the
fetched/​resolved window.

## The fix

Query by trigger instead of an unfiltered list: always resolve the latest few `schedule`
(nightly) runs — the reliable signal — plus scan recent `workflow_run` runs only until one
that actually executed Maestro is found. Classifier unchanged.

## GREEN — after the fix (same live run)

```
maestro-main-health: RED
  Maestro is RED on main: run 29894742910 (4dad2a83c5c2, schedule) had 8 failing shard(s): Mobile Maestro E2E Tests (1..8).
  last-executed: run 29894742910 sha=4dad2a83c5c2848c2f7a699f7e5b0451eda1412f event=schedule at=2026-07-22T05:46:38Z
exit=1
```

It now finds the nightly and correctly reports RED — surfacing a real, previously-invisible
Maestro-on-main breakage (the nightly's 8 shards all failing), which is exactly what AC-3
exists to make visible. Unit suite stayed green (12/12) and typecheck clean throughout;
the change is confined to the I/O seam.

## Toolchain note

Local system Node is v24 (breaks the repo's pre-push helper tests); all runs used a local
Node 22 binary (`~/.local/node22/bin`) on `PATH`, matching `engines.node: 22.x`.
