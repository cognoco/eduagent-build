# WI-2524 — staging verification of the v2 nav-shell support-hub Back scope

Verification record for **WI-2524 — Re-run v2 nav-shell.spec.ts (support-hub Back scope) against
staging CI once staging worker redeploys**. Venue-upgrade follow-up from WI-2223, whose AC-3 e2e
case was PM-ruled to be evidenced by a *local* wrangler-dev run because the deployed staging worker
rejected the `v2-supporter-accepted` seed. This record upgrades that venue to staging CI.

Verification is **observational as to product behaviour**: no application code changed. The change set
is this document plus one test-only edit — a positive post-Back assertion added to the named case in
`apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts`, which §3 explains and which was required to satisfy
AC-2 rather than merely to re-run it.

## 1. Preconditions — both original WI-2223 blockers are cleared

| Blocker (WI-2223) | State now | Evidence |
|---|---|---|
| `DOPPLER_TOKEN_STG` absent as a CI secret | **Cleared** | Repo secret present, created `2026-07-20T19:40:00Z`. `.github/workflows/e2e-web.yml` hard-errors when unset, so its presence is load-bearing. |
| Deployed staging worker rejected the `v2-supporter-accepted` seed (scenario enum predated WI-2241) | **Cleared** | Seed landed on main at `36e77d887` (2026-07-19, WI-2241, PR #2288). Last **successful** staging Deploy = run `29847649529`, sha `c43a07cc`, `2026-07-21T16:13:49Z`; that sha contains `apps/api/src/services/test-seed-v2-supporter.ts` with `scenario: 'v2-supporter-accepted'` and is an ancestor of `origin/main`. Staging is therefore **post-deploy** with respect to the seed. |

A later Deploy (run `29855742311`, sha `f346ee16`) was still `in_progress` at its pre-deploy
"API Quality Gate" stage at time of verification and had not altered the deployed worker.

## 2. AC-1 — run provenance

Two exact-main runs are recorded against AC-1, because the named case was strengthened mid-item (§3).
**`29862030418` is the operative AC-1 evidence** — it is the only exact-main run of the *strengthened*
case. `29856034716` is the earlier exact-main run of the *original* case; it is what established that
the preconditions were cleared. Their transcripts are **not** interchangeable and are kept separate below.

### 2a. Properties shared by both runs

- **Dispatch shape:** event `workflow_dispatch`, ref `main` — so each ran against an exact-main commit.
- **Project selected:** `v2-release` — the gate step ran
  `pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=v2-release`.
- **Target is staging:** `EXPO_PUBLIC_API_URL` / `PLAYWRIGHT_API_URL` = `https://api-stg.mentomate.com`
  (`e2e-web.yml`), secrets single-sourced through `doppler run -p mentomate -c stg`.
- **The named case executed in each — not skipped, not setup-only**, and in each the staging gate
  decided `FAILURE_CLASS=success` with **no** `ZodError` / `invalid_enum` anywhere in the run log.
- **Seed acceptance is load-bearing, not incidental:** `seedAndSignIn(...)` passes
  `landingTestId: 'support-hub-mentor-tab'`, so a rejected seed fails the case instead of passing quietly.

### 2b. Run `29862030418` — operative (strengthened case)

Head sha `79f22774a` (the squash commit that landed the b2 assertion; ancestor of `origin/main`).
<https://github.com/cognoco/eduagent-build/actions/runs/29862030418> — transcript and artifacts in §3/§4:
named case `[5/5]`, **`5 passed (2.2m)`**.

### 2c. Run `29856034716` — earlier (original case, pre-fix)

Head sha `f346ee16ca4e700b48201f1f5c86d7417cbc0100` (exact-main HEAD at dispatch).
<https://github.com/cognoco/eduagent-build/actions/runs/29856034716>. Gate output:

```text
Running 5 tests using 3 workers
[4/5] [v2-release] › apps/mobile/e2e-web/flows/v2/nav-shell.spec.ts:60:5 › V2 nav shell: real Back
from the support-hub Mentor surface keeps the supporter-hub surface, no learner-surface bleed-through
  5 passed (2.3m)
```

`run-smoke` ran 18:09:59Z → 18:18:36Z (8m37s). This transcript belongs to the **original** case only —
the `[4/5]` ordering and the `2.3m` duration are this run's, not the operative run's.

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
| b2 | person scope → tap `tab-journal` → `/journal` → ScopeChip to supporter-hub → **Back** | URL `/mentor` **and** `support-hub-mentor-tab` visible **and** `mentor-screen` count 0 **and** `person-scope-journal-placeholder` not visible |

Both b1 and b2 now assert the supporter-hub surface **positively** as well as negating the foreign
ones, so each covers both halves of AC-2's requirement.

**b2 did not always do so, and the gap was real.** As originally written, b2 asserted only the two
negatives after its `page.goBack()` — no supporter-hub testid at all (`support-hub-journal-tab` is
asserted *before* the Back, which proves the scope switch, not the post-Back surface). Both negatives
also hold on a blank or errored route, so b2 could pass with **no supporter-hub surface rendered**,
evidencing only AC-2's "never a foreign surface" half. The gap was raised by the automated reviewer
on this PR (Codex P2, "Narrow the claimed b2 coverage"); it is closed here rather than resolved by
narrowing the claim.

**The fix.** b2 now asserts `toHaveURL(/\/mentor$/)` and `support-hub-mentor-tab` visible ahead of the
two negatives. `support-hub-mentor-tab` is the correct surface because neither interaction on that
path navigates — `onOpenPersonScope` is `setActiveScope` (`mentor.tsx:510,526`) and `ScopeChip`'s
`onPress` is `setActiveScope` (`ScopeChip.tsx:64`) — so the only pushed entry is the Journal tab, and
Back returns to the Mentor route with `activeScope` still supporter-hub.

**The strengthened case passes on an exact-main commit.** Run **`29862030418`** — `workflow_dispatch`,
ref `main`, head sha `79f22774a` (the squash commit that landed the assertion; an ancestor of
`origin/main`) — `--project=v2-release`, `Running 5 tests`, the named case listed `[5/5]` at
`nav-shell.spec.ts:60:5`, **`5 passed (2.2m)`**, staging gate `FAILURE_CLASS=success`, zero `ZodError`
in the log. This is the run that satisfies AC-1's exact-main requirement **for the strengthened case**.

Interim, retained for provenance: run `29859015027` exercised the same strengthened assertion first,
on branch head `233fd5d54` before it landed (`5 passed (2.3m)`). It agrees with the above but is not
an exact-main commit, so it is not the AC-1 evidence.

> Scope note on run `29856034716` in §2: it was dispatched on **pre-fix** main and therefore exercised
> the *original* case. It evidences the preconditions and AC-1 provenance only — it did **not** exercise
> the `support-hub-mentor-tab` assertion, and is not cited as evidence that the strengthened case passes.

The case additionally proves (not assumes) the `me`-scope caveat carried over from WI-2223:
`scope-chip-option-me` and `supporter-self-learning-doorway` both assert `toHaveCount(0)`.

## 4. AC-3 — recorded artifacts and protected-main configuration

> **⚠ SUPERSESSION NOTICE — added under WI-2595, appended not rewritten.** The CI artifacts cited in
> this section are **pending purge under WI-2593** (Playwright HTML reports embed reusable seeded
> staging credentials). Once purged, the artifact ids below will no longer resolve. The **durable
> record of this evidence** is [`wi2524-playwright-report-record.md`](wi2524-playwright-report-record.md),
> which is committed in-repo and carries the run/head identifiers, report totals, named-case identity
> and outcome, the post-Back assertions, and the original artifact names/ids/sha256 digests.
> **Follow that file for the AC-3 record.** The original citations are retained below unchanged, as
> provenance — they are deliberately not deleted, and nothing in this closed record has been altered.

These fields record the **strengthened case on an exact-main commit** — run `29862030418`, head
`79f22774a`. That is the single run satisfying AC-1, AC-2 and AC-3 together; the other two runs are
retained below only for provenance.

- **Named case result:** `5 passed (2.2m)`, case listed as `[5/5]` at `nav-shell.spec.ts:60:5`,
  from run `29862030418` on head `79f22774a` (§3).
- **Playwright artifact:** `playwright-web-v2-29862030418-1` (id `8507767965`, 205,255 bytes, unexpired).
- **Exact `Playwright web smoke` check-run URL for that staging run:**
  <https://github.com/cognoco/eduagent-build/actions/runs/29862030418/job/88742989182>
  — `conclusion=success`, started `2026-07-21T19:42:28Z`, on head `79f22774a`.
- Retained for provenance, **not** cited as the AC evidence:
  - `29856034716` (head `f346ee16`, **pre-fix**) — artifact `playwright-web-v2-29856034716-1`, check-run
    <https://github.com/cognoco/eduagent-build/actions/runs/29856034716/job/88722571666>. Establishes the
    preconditions were cleared; did not exercise the b2 assertion.
  - `29859015027` (head `233fd5d54`, strengthened but **branch, not main**) — artifact
    `playwright-web-v2-29859015027-1`, check-run
    <https://github.com/cognoco/eduagent-build/actions/runs/29859015027/job/88732917146>.
- **Protected-main requires that exact context.** `gh api repos/cognoco/eduagent-build/branches/main/protection`:

```text
required_status_checks.strict:   false
required_status_checks.contexts: ["main", "Playwright web smoke", "API Quality Gate",
                                  "Merge completeness check"]
```

  `Playwright web smoke` is a **required** status check on protected `main`, so the green above is a
  gating context and not a generic workflow summary.

**No result was converted.** All three staging runs recorded here passed on their first execution —
`29856034716` (original case, exact-main), `29859015027` (strengthened, branch) and `29862030418`
(strengthened, exact-main). Nothing here
relied on rerun-until-green, timeout or retry changes, quarantine, advisory reclassification, or
merge-over-red; had the case failed behaviourally it would have stayed red and been reported as a
nav-shell regression.
