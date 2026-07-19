# Run-smoke gate structure — DEFERRED (WI-2452)

**Status:** the required-stable-vs-advisory lane-split decision this note used to
describe is **deferred**, not landed. This file records why, what changed
underneath it, and what a future pass needs to re-derive before touching
`.github/workflows/e2e-web.yml` again. This WI's PR makes **zero** changes to any
`.github/workflows/*` file and **zero** branch-protection changes — see
`tools/quarantine/run-smoke-lanes.cjs` and
`scripts/run-smoke-failure-class-annotate.cjs` for the two tools it *does* land,
both unwired.

## What WI-2452 originally assumed

WI-2452 (Run-smoke gate hygiene: required-stable vs advisory lanes + flaky
quarantine with expiry) was authored against this premise: `run-smoke` in
`e2e-web.yml` is a fully advisory job, and the required branch-protection check
("Playwright web smoke") is an unconditional pass-through that never gates on
its result. Under that premise, ambient staging flakiness was invisible-yet-noisy
and a real product regression could merge unnoticed — the AC called for splitting
`run-smoke` into a required-stable core lane and an advisory lane, a
quarantine-with-expiry mechanism so a demoted flow could never be permanently
muted, and a failure-class annotation on the PR.

## What actually happened underneath it

**PR #2273 — "zdx(e2e): hard-gate V2 release lane [WI-2228]"** merged
2026-07-19T13:46:55Z (commit `dbb143efe`), roughly five minutes after this WI's
Acceptance Criteria were authored/ratified the same day. It rebuilt exactly the
surface WI-2452 targets, from the opposite direction:

- Added an isolated `v2-release` Playwright project (`apps/mobile/playwright.config.ts`)
  scoped to a single stable case set (the J-01 seeded-learner Mentor-home /
  360×760 fixed-chrome flows) plus a matching Maestro case, deliberately narrow
  so it can be trusted as a hard gate.
- Made the required "Playwright web smoke" check **hard-gate** on that result:
  `e2e-web.yml`'s `smoke` job now does
  `if [[ "$SMOKE_RESULT" != "success" ]]; then exit 1; fi` when the real suite ran
  — it is no longer an unconditional pass-through.
  Companion PR #2264 ("fix(ci): add fail-closed staging canary for V2 smoke
  [WI-2228]", merged 2026-07-19T09:27:05Z) added the fail-closed canary this hard
  gate relies on.
- Demoted the **legacy** four-project smoke set
  (`smoke-auth`/`smoke-learner`/`smoke-parent`/`smoke-accessibility` — the exact
  set WI-2452's original AC named as "run-smoke") to a separate step inside the
  same job, `continue-on-error: true`: permanently advisory, with no expiry and
  no quarantine ledger.

So, on landed `main`, today:

- The thing that actually blocks a merge is `v2-release` — narrow by design,
  intentionally NOT the broad legacy set.
- The legacy set is already 100% advisory — already split out, just not via a
  job-level lane + registry, and with **no expiry** (a standing, if narrower,
  instance of the exact "no permanent mutes" problem AC-2 of the original WI-2452
  was written to solve).

WI-2452's original AC does not reproduce against this state. Splitting the
legacy set into "core" and "advisory" sub-lanes would be decorative — none of
today's real merge risk lives there. Wrapping `v2-release` itself in a
quarantine-with-expiry mechanism (whose entire purpose is "an ambient-class red
stops blocking") would, the first time anyone used it, reverse what PR #2273
deliberately shipped — a required-check-set-adjacent flip that is exactly what
this WI's own (now-superseded) AC-4 reserved for a separate, deliberate operator
action. Not something to do silently inside a "gate hygiene" PR.

## PM ruling (Option B, 2026-07-19)

Land only the two tools this investigation produced — both fully job-agnostic,
neither wired into any workflow — plus this note. Defer the actual
required-stable-vs-advisory lane-split decision until it can be re-derived
against `v2-release` as the current reality, not retrofitted onto a premise
PR #2273 already dissolved.

- `tools/quarantine/run-smoke-lanes.cjs` — declared-core/quarantine-with-expiry
  resolver + validator. Declares a project set, demotes a project to "advisory"
  only via an unexpired registry entry, and auto-reverts on expiry (no permanent
  mutes). The declared-project list and the registry entries are both inert data
  today — the mechanism is real and tested, but nothing consumes its output.
- `scripts/run-smoke-failure-class-annotate.cjs` — maps a
  `playwright-staging-gate.cjs --classify` result to a human-readable bucket and
  formats a PR annotation (GitHub Actions `::notice::` + Job Summary block).
  Also unwired — nothing calls it from any workflow yet.

Both are ready to be pointed at whichever lane a future decision names as
"core" — most plausibly `v2-release` itself, if a lane ever needs the
per-flow quarantine-with-expiry escape hatch WI-2452 was designed to provide,
or a formal quarantine ledger for the legacy advisory set to replace its
current unconditional (non-expiring) `continue-on-error`.

## Keep/kill recommendation: WI-2458

WI-2458 ("Enact run-smoke required-check split on branch protection") was
captured as this WI's Blocked-by operator-enactment item, on the premise that
WI-2452 would land inert-but-ready CI logic and WI-2458 would be the deliberate
follow-up that flips branch protection to make it bite.

**Recommendation: re-scope or close WI-2458, not enact it as originally
written.** PR #2273 already performed the load-bearing part of what WI-2458
existed to do — it made the required "Playwright web smoke" check gate on a
specific, narrow lane (`v2-release`) instead of pass-through-everything. There
is no longer an inert `run-smoke-core` check sitting unenacted, waiting for a
branch-protection edit — the hard gate already exists and is already required
today, achieved by a different code path than WI-2452 was going to build.
Whether WI-2458 should:

- close as superseded by PR #2273 (WI-2228), or
- re-scope to something WI-2228 did *not* cover (e.g., formalizing the legacy
  advisory lane's expiry-bearing quarantine using the tools this WI landed, or
  widening `v2-release`'s coverage under a still-deliberate, still-operator-gated
  promotion process)

is a PM call, not a builder one. This note exists so that call has the full
premise-dissolution timeline in one place instead of being re-discovered from
scratch.

## Evidence

- `gh api repos/cognoco/eduagent-build/branches/main/protection` (read 2026-07-19):
  required contexts are `main`, `Playwright web smoke`, `API Quality Gate`,
  `Merge completeness check`.
- `git log --oneline -3 -- .github/workflows/e2e-web.yml` (on `origin/main`,
  2026-07-19): `dbb143efe test(e2e): hard-gate V2 release lane [WI-2228]`,
  `976805e27 fix(ci): add fail-closed staging canary for V2 smoke [WI-2228]
  (#2264)`.
- PR #2273 (merged 2026-07-19T13:46:55Z,
  <https://github.com/cognoco/eduagent-build/pull/2273>) and PR #2264 (merged
  2026-07-19T09:27:05Z,
  <https://github.com/cognoco/eduagent-build/pull/2264>).
- `apps/mobile/playwright.config.ts` — `v2-release` project definition, scoped
  to `flows/(?:v2/.+|journeys/j01-learner-home)`.
- `package.json` — `test:e2e:web:v2` (`--project=v2-release`) vs.
  `test:e2e:web:smoke` (the four legacy `--project=` flags), both still present.
