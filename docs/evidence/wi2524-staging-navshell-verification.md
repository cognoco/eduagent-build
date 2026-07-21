# WI-2524 — staging verification of the v2 nav-shell support-hub Back scope

Verification record for **WI-2524 — Re-run v2 nav-shell.spec.ts (support-hub Back scope) against
staging CI once staging worker redeploys**. Venue-upgrade follow-up from WI-2223, whose AC-3 e2e
case was PM-ruled to be evidenced by a *local* wrangler-dev run because the deployed staging worker
rejected the `v2-supporter-accepted` seed. This record upgrades that venue to staging CI.

Verification is **observational**: no product code changed. The commit carrying this document adds
only this file.

## 1. Preconditions — both original WI-2223 blockers are cleared

| Blocker (WI-2223) | State now | Evidence |
|---|---|---|
| `DOPPLER_TOKEN_STG` absent as a CI secret | **Cleared** | Repo secret present, created `2026-07-20T19:40:00Z`. `.github/workflows/e2e-web.yml` hard-errors when unset, so its presence is load-bearing. |
| Deployed staging worker rejected the `v2-supporter-accepted` seed (scenario enum predated WI-2241) | **Cleared** | Seed landed on main at `36e77d887` (2026-07-19, WI-2241, PR #2288). Last **successful** staging Deploy = run `29847649529`, sha `c43a07cc`, `2026-07-21T16:13:49Z`; that sha contains `apps/api/src/services/test-seed-v2-supporter.ts` with `scenario: 'v2-supporter-accepted'` and is an ancestor of `origin/main`. Staging is therefore **post-deploy** with respect to the seed. |

A later Deploy (run `29855742311`, sha `f346ee16`) was still `in_progress` at its pre-deploy
"API Quality Gate" stage at time of verification and had not altered the deployed worker.

## 2. AC-1 — run provenance

- **Run: `29856034716`** — event `workflow_dispatch`, ref `main`, head sha
  `f346ee16ca4e700b48201f1f5c86d7417cbc0100` (exact-main HEAD at dispatch).
  <https://github.com/cognoco/eduagent-build/actions/runs/29856034716>
- **Project selected:** `v2-release` — the gate step ran
  `pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=v2-release`.
- **Target is staging:** `EXPO_PUBLIC_API_URL` / `PLAYWRIGHT_API_URL` = `https://api-stg.mentomate.com`
  (`e2e-web.yml`), secrets single-sourced through `doppler run -p mentomate -c stg`.
- **The named case executed — not skipped, not setup-only.** Gate output:

```
Running 5 tests using 3 workers
[4/5] [v2-release] › apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts:60:5 › V2 nav shell: real Back
from the support-hub Mentor surface keeps the supporter-hub surface, no learner-surface bleed-through
  5 passed (2.3m)
```

  `run-smoke` ran 18:09:59Z → 18:18:36Z (8m37s); the staging gate decided `FAILURE_CLASS=success`.

- **The seed was accepted.** No `ZodError` / `invalid_enum` appears anywhere in the run log. Seed
  acceptance is load-bearing rather than incidental: the case's `seedAndSignIn(...)` passes
  `landingTestId: 'support-hub-mentor-tab'`, so a rejected seed fails the case instead of passing quietly.

> **Why the PR-check green on #2297 is _not_ this evidence.** `e2e-web.yml` documents that a PR with
> no web/mobile surface change gets a **pass-through report (~seconds)**; PR #2297 showed
> "Playwright web smoke pass **4s**". AC-1 excludes setup-only passes, so only a dispatched
> V2-gate run (which "always runs" per the same workflow header) can satisfy it.

## 3. AC-2 — every Back transition renders a supporter-hub-owned surface

Let **B** be the real browser-Back transitions exercised after active scope is supporter-hub. The
named case contains exactly two, both driven by real `page.goBack()` and real `pressableClick` taps
(no direct `setActiveScope` call — the substitution rejected on WI-2223):

| b | Path | Assertions after Back |
|---|---|---|
| b1 | landing `/mentor` → tap `tab-subjects` → `/subjects` → **Back** | `support-hub-mentor-tab` visible **and** `mentor-screen` count 0 |
| b2 | person scope → tap `tab-journal` → `/journal` → ScopeChip to supporter-hub → **Back** | `mentor-screen` count 0 **and** `person-scope-journal-placeholder` not visible |

Each b asserts the supporter-hub surface positively *and* negates the learner (`mentor-screen`) and
person-scope (`person-scope-journal-placeholder`) surfaces, so a nav-shell regression selecting a
surface inconsistent with the active scope turns the named case red rather than passing vacuously.

The case additionally proves (not assumes) the `me`-scope caveat carried over from WI-2223:
`scope-chip-option-me` and `supporter-self-learning-doorway` both assert `toHaveCount(0)`.

## 4. AC-3 — recorded artifacts and protected-main configuration

- **Named case result:** `5 passed (2.3m)`, case listed as `[4/5]` at `nav-shell.spec.ts:60:5` (§2).
- **Playwright artifact:** `playwright-web-v2-29856034716-1` (id `8505395256`, 204,959 bytes, unexpired).
- **Exact `Playwright web smoke` check-run URL for this staging run:**
  <https://github.com/cognoco/eduagent-build/actions/runs/29856034716/job/88722571666>
  — `conclusion=success`, started `2026-07-21T18:18:39Z`, on head `f346ee16`.
- **Protected-main requires that exact context.** `gh api repos/cognoco/eduagent-build/branches/main/protection`:

```
required_status_checks.strict:   false
required_status_checks.contexts: ["main", "Playwright web smoke", "API Quality Gate",
                                  "Merge completeness check"]
```

  `Playwright web smoke` is a **required** status check on protected `main`, so the green above is a
  gating context and not a generic workflow summary.

**No result was converted.** The named case passed on its first dispatched staging run. Nothing here
relied on rerun-until-green, timeout or retry changes, quarantine, advisory reclassification, or
merge-over-red; had the case failed behaviourally it would have stayed red and been reported as a
nav-shell regression.
