> **STATUS: ACTIVE** — canonical E2E uplift proposal. Supersedes scope-proposal-1.md and scope-proposal-2.md.

# E2E Quality Uplift — Scope Proposal

**Status:** Canonical proposal for `/goal`-driven E2E uplift
**Date:** 2026-05-14
**Author:** Claude (Opus 4.7), after iterative review with project owner
**Supersedes:** `scope-proposal-1.md`, `scope-proposal-2.md` (kept as snapshots for evolution audit)
**Companion artefacts:** `baseline-2026-05-14.md` (measured Playwright baseline), `scope-proposal-2.html` (interactive explorer, still valid for visualisation), `2026-05-08-web-e2e-full-suite-bug-ledger.md` (point-in-time triage; **partially stale — verify specific claims**), `2026-05-11-end-user-playwright-bug-pass.md` (root-cause analysis on `parent-profile-carveout` branch; **mitigation merged via PR #211 but incomplete**)

## 0. Ambition

The `/goal` agent's job per package is **drive the relevant suite to one clean pass within a single session, then immediately re-run it; both must be green.** That's the exit bar — not five consecutive nightly runs, not CI promotion, not gating. Steady-state pass-rate measurement and merge-gating happen in a separate later stage and are explicitly out of scope here.

CI gating is also out of scope. The full Playwright suite costs ~23 minutes wall-clock today (measured 2026-05-14, see baseline doc); promoting it to required without speed work would add unacceptable PR latency. Speed work is its own package (**P5**), runs in parallel, and is largely human-driven with its own write-up under separate management.

## 1. Verified diagnostic baseline (2026-05-14)

Direct-grep verified against `apps/mobile/e2e/flows/`, `apps/mobile/e2e-web/flows/`, `tests/integration/`, `apps/api/src/services/test-seed.ts`. Used as concrete exit-criterion patterns throughout.

```bash
# Web (Playwright)
$ ls apps/mobile/e2e-web/flows/**/*.spec.ts | wc -l                  # 27
$ Full suite wall-clock (CI-equivalent, 1 worker, deployed staging)   # 23m 01s
$ Pass / Fail / Flaky                                                  # 15 / 13 / 3
$ Failing specs (verified 2026-05-14):
  j01-ux-pass, j04, j05, j06, j07, j08, j09, j10, j11, j12, j13, j15-flaky, j16, j17, w05
$ Fixes since May 8 audit (verified):
  j19 paywall passes; w01, w04 practice-intent pass; usage_events table exists in schema
$ Splash fix (PR #211, merged 2026-05-11) is in tree but incomplete:
  AnimatedSplash.tsx:415 has acceptsTouches gating; six tests still fail at 34s timeouts on
  splash-blocked taps (j04, j05, j06, j07, j16, j17)

# Mobile (Maestro)
$ ls apps/mobile/e2e/flows/**/*.yaml | wc -l                          # 163 (139 non-setup)
$ rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows # 23 files (More-tab drift)
$ rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows # 18 files (deprecated launch)
$ rg -l "optional: true" apps/mobile/e2e/flows                        # 78 files
$ rg "optional: true" apps/mobile/e2e/flows                           # 294 occurrences

# Integration (Jest)
$ ls tests/integration/*.integration.test.ts | wc -l                  # 44
$ grep -c "scenario" apps/api/src/services/test-seed.ts               # 43 seed scenarios

# Skill / runbook surfaces (both exist)
.agents/skills/e2e/SKILL.md         3209 bytes  2026-05-12  (mirror for non-Claude agents)
.claude/commands/my/e2e.md          3949 bytes  2026-05-05  (canonical)
.claude/commands/my/run-e2e.md       417 bytes  2026-05-14
docs/E2Edocs/e2e-runbook.md         (active operational runbook — Windows-only today)
docs/_archive/E2Edocs/e2e-2026-04-30-empirical-state.md  (archived)
```

GC1/GC6 mock cleanup is being handled by the parallel mock-drain spike (`docs/audit/goal-spike-mock-claude.md`); not duplicated here.

## 2. Sequencing

```
[mock-drain spike in goal/mock-claude worktree]   ─────────────────────────►
[Phase 0 — front-loaded prep]                     ────►
[P1 Web E2E (/goal, 1 session)]                       ──────►
[M1 Mobile E2E (/goal, 1–2 sessions)]                       ────────►
[P3 Inngest (/goal)]                                                  ──────►  starts AFTER mock-drain merges
[P4 End-of-initiative tooling refresh]                                       ──►
[P5 Speed/tiering]                                ─────────────────────────►  parallel, separate workstream
```

- **Phase 0, P1, M1, P5 can start any time** independent of the mock-drain spike.
- **P3 waits for mock-drain to merge to main.** Files overlap heavily; running in parallel guarantees rework.
- **CLAUDE.md merge conflict will be handled when it arises** — no special coordination upfront.

## 3. Phase 0 — front-loaded prep (human-supervised, this session or next)

Single-pass prep work to make `/goal` runs as repeatable as possible. Not autonomous.

### 3.1 Doc reconciliation

Banner every existing inventory/audit/plan doc with status. Three categories:

- `STATUS: ACTIVE (canonical for X)` — the runbook, the inventory file
- `STATUS: SNAPSHOT taken YYYY-MM-DD (do not edit)` — the empirical-state snapshot, the May 1 batch plan
- `STATUS: COMPANION (point-in-time triage from YYYY-MM-DD; verify specific claims against current state before acting)` — the May 8 web E2E ledger, the May 11 end-user Playwright pass, the May 13 mobile coverage audit. These remain useful as failure catalogues and root-cause hypotheses, but specific claims (e.g., "J-10 fails because `usage_events` table is missing") may already be resolved or differently caused. Verified-stale examples are kept in §1 of this proposal.

Don't merge files yet — phased approach. Migrate facts as fixes land; archive only when migration is complete. The companion-status framing is what protects /goal runs from inheriting stale audit claims as authoritative.

### 3.2 Runbook refactor in place

`docs/E2Edocs/e2e-runbook.md` becomes OS-aware. Three explicit subsections — Windows native, macOS, Linux/CI — for each command block. Reframe the title and intro away from "Windows + Unicode-username machine." Move Maestro path workarounds into a Windows-only troubleshooting subsection. Path stays the same so no incoming-reference churn.

~~Archive `docs/E2Edocs/e2e-2026-04-30-empirical-state.md` under `docs/_archive/E2Edocs/`.~~ Done — archived; original stub deleted; references updated to point at archive directly.

### 3.3 Skill refactor

`.claude/commands/my/e2e.md` (canonical) refactored:

- OS detection via `process.platform` or shell envs (Windows / Darwin / Linux)
- Replace hard-coded `C:/Tools/doppler/doppler.exe`, `/c/tools/maestro/bin/maestro`, MSYS path workarounds with portable equivalents per OS
- Change default flow off `quick-check.yaml` (known 6/7 failure on the "Sign up" assertion) — pick one that currently passes
- Update preconditions/troubleshooting to match the refactored runbook

`.agents/skills/e2e/SKILL.md` mirrors the canonical version minus Claude Code-specific superpowers (no MCP references, no Skill-tool-specific instructions). Add a header comment to both files: "Mirror of X — keep in sync."

### 3.4 Memory + small surface updates

Update to reflect new content shape (paths unchanged in all cases — these are content updates, not link rewrites):

- `.claude/memory/feedback_e2e_runbook.md` — refresh description, reflect OS-aware runbook
- `.claude/memory/feedback_emulator_issues_doc.md` — reflect that emulator-issues content lives in vault now, runbook covers operational reality
- `.claude/memory/MEMORY.md` line 151 — update one-liner
- `docs/visual-artefacts/data/atlas-data.js:24` — confirm path still correct (likely no-op)
- `package.json` lines 26, 28, 32 (`pretest:e2e*` hooks) — error messages reference runbook; confirm path still correct (likely no-op)

CLAUDE.md is explicitly **not** touched in Phase 0 — handle the merge conflict with the mock-drain spike when both land.

### 3.5 Validator spec

Write `docs/audit/e2e/validator-spec.md` — the design for the static YAML integrity validator that M1 will implement. Spec covers what it checks, what allowlists it reads, what patterns it understands. No implementation in Phase 0.

The validator must:

- Detect references to missing flow files
- Detect references to deprecated `_setup/` helpers (allowlist of current ones)
- Detect testID references not present in app source — pattern-aware: any `{...}` segment matches wildcards; plus an allowlist for runtime-assembled IDs
- Detect references to non-existent seed scenarios (cross-check against `apps/api/src/services/test-seed.ts`)
- Detect `launchApp` / `_setup/launch-devclient.yaml` usage outside an explicit release/ExpoGo opt-in list
- Detect `optional: true` on assertions in flows tagged `pr-blocking` or `smoke` unless justified by an allowlist file (`apps/mobile/e2e/optional-allowlist.txt`) or by a `# justified: <reason>` comment on the same or immediately preceding line
- Detect untagged flow files
- Output specific failure reasons ("not found in source AND not in allowlist AND no wildcard match"), never opaque "missing"

### 3.6 Doppler enforcement design

Lock the design for Playwright config-load behaviour: **(c) fail-closed.** Implementation in P1.

When `TEST_SEED_SECRET` is missing at Playwright project setup, the test run terminates immediately with a clear message: "TEST_SEED_SECRET not found. Wrap your command with `doppler run --project mentomate --config stg --` to load secrets." No silent failure, no warning-then-confused-failure.

### 3.7 CLERK_TESTING_TOKEN cleanup

The `CLERK_TESTING_TOKEN` env-var slot is vestigial — `@clerk/testing/playwright` fetches a fresh short-lived token via Clerk's Backend API at runtime. Verified: staging Clerk instance has testing mode enabled (sign-up smoke specs pass in the 23m baseline).

Decide in Phase 0: remove the slot from Doppler stg + re-run `pnpm env:sync` to refresh local files? Or leave as P4 cleanup nit? Owner's call. Either way: the four "deferred auth flows" I'd previously flagged (AUTH-05/09/11, ACCOUNT-09 reset, full sign-up) are **not blocked by Clerk** — they're blocked by separate infra (ADB deep-link injection, SecureStore manipulation, network throttling) which is outside this initiative's scope.

## 4. P1 — Web E2E to one green pass (Playwright, `/goal`, 1 session)

**Why first:** Fresh baseline measured today (23m, 13 failures, 3 flaky). Failure surface concrete, recent, fixable. Young suite — adding coverage doesn't compound rot. Single-session shape suits `/goal`.

**Scope:**

- Triage and fix the 14 failing specs from the 2026-05-14 run. **Do not trust prior-audit classification verbatim — the May 8 ledger has already gone stale on three entries** (J-10 SQL `usage_events`, J-19 paywall, W-01/W-04 practice intent are all now-passing). Verified-current failure clusters and recommended approach:
  - **Splash/pointer-event cluster (highest single leverage):** j04, j05, j06, j07, j16, j17. All time out around 34s at `locator.click()` after the splash retry window. EUPW-1 (`AnimatedSplash` overlay intercepts pointer events) is the diagnosed shared cause; a partial fix landed via PR #211 (`acceptsTouches` gating in `apps/mobile/src/components/AnimatedSplash.tsx`) but is insufficient. P1 completes the fix — not from scratch — and verifies it resolves the cluster.
  - **Confirmed spec drift (fix the spec, not the app):** j08 references stale `intent-ask` testID — current source uses `home-ask-anything`. w05 expects a "Profile" button on More tab — UI has "Account / Privacy & data / Help & feedback". Update both specs to match current product.
  - **Open-question failures (investigate from first principles at /goal time):** j01 (UX screenshot crawl — new failure since May 8, needs fresh root-cause), j09 (empty-home testID contract — May 8 ledger claims spec drift, verify against current onboarding code), j10 (no longer the May 8 SQL error since `usage_events` table now exists in `packages/database/src/schema/billing.ts:94` — different cause, undiagnosed), j11 (library shelf-to-book contract — may be spec drift or routing), j12 (pre-profile gate vs generic onboarding — verify which is the intended current behaviour), j13 (the two audits disagree: May 8 calls it a critical consent-gate bypass; May 11 calls it intentional landing on the external approval page — needs first-principles diagnosis), j15 (May 11 audit claims product intentionally moved to "solo adult takes student path"; this claim itself is untested — verify against current product spec before rewriting test or treating as regression).
- Investigate **EUPW-2** (duplicate parent home onboarding notices — "You're a parent now too" and "This is your home" both rendering simultaneously, per May 11 audit). Not strictly an E2E failure but a UX bug surfaced during the pass; fold into P1 scope. Not verified end-to-end against current code; PR #211 was for splash, not for these notices, so it likely still exists. Check the rendering logic in `ParentHomeScreen.tsx` and gating around `orientationCueTitle`.
- Stabilise the 3 flaky specs (setup parent-multi-child seed, j11, j15 — note j15 may resolve via spec rewrite per the open question above) so they pass without retry.
- Add ≥6 new journey specs covering the dictation flow, parent→child detail drill-down, multi-child switching, session recap/transcript, vocabulary/topic recall, subscription upgrade UX.
- Implement Doppler fail-closed (3.6).
- Write `apps/mobile/e2e-web/README.md` covering prerequisites, seed endpoint behaviour, scenario list, troubleshooting, and the local-API caveat (see baseline doc — local-API mode is currently broken-by-design because the prebuilt web bundle has `EXPO_PUBLIC_API_URL` baked in at build time).
- No `.catch(() => null)`-style silent swallows on critical waits. Equivalent of the Maestro `optional: true` rule for Playwright.

**Cross-cutting rule of approach (carryover from §9 but worth restating here):** For every failure, the /goal agent must classify before fixing — is this an app bug, a stale spec, or a still-undiagnosed contract mismatch? Audit reports may be referenced as **point-in-time triage signals** but not as authoritative classification. Verify against current code state before acting.

**Exit criteria (all must hold in-session):**

- Full Playwright suite passes twice consecutively without intervention between runs.
- `gh issue list --label e2e-web-2026-05-08-ledger` (or equivalent label) returns zero open items, or each open item carries a documented "won't-fix" rationale.
- `ls apps/mobile/e2e-web/flows/journeys/*.spec.ts | wc -l` ≥ 26 (currently 20).
- Running `pnpm run test:e2e:web` without `doppler run --project mentomate --config stg --` fails at config load with the clear "TEST_SEED_SECRET not found" message.
- `apps/mobile/e2e-web/README.md` exists, covers prerequisites + Doppler + scenarios + local-API caveat.

**Files touched:** `apps/mobile/e2e-web/`, `apps/mobile/playwright.config.ts`, `apps/api/src/routes/test-seed.ts` (if surfaced as a bug), `apps/api/src/services/test-seed.ts` (likewise), plus whatever app-code bugs the failure triage uncovers.

## 5. M1 — Mobile E2E trustworthiness (Maestro, `/goal`, 1–2 sessions)

**Why second:** Largest surface, most observable drift. The 23 stale flows + 78 files with `optional: true` skips + 18 deprecated launches mean current pass signals are not dependable. Internal ordering (consolidate → repair → validate) is non-negotiable; coverage expansion onto a rotten base would compound false confidence.

**Pragmatic split:** Session A is the heavy autonomous work; Session B is design/classification with light agent assist. Either fits inside the `/goal` model individually.

### M1-A — Drift repair (autonomous `/goal` session)

- Repair the 23 More-tab-refactored stale flows. Replace `learning-accommodation-section-header` markers with stable navigation helpers under `_setup/more-*` for Account, Privacy, Notifications, Learning Preferences, Accommodation, Help.
- Sweep the 18 `launchApp` / `_setup/launch-devclient.yaml` references. Migrate every product flow to `seed-and-run.sh` ownership of launch (release/ExpoGo opt-in stays explicit).
- Audit the 294 `optional: true` occurrences across 78 files. For each: either remove (mandatory assertion that was masked), justify with a same-line or preceding-line `# justified: <reason>` comment, or add to `apps/mobile/e2e/optional-allowlist.txt` (for systematic repo-wide patterns — system dialogs, OS-level overlays).
- Repaired flows must execute green on a clean emulator. "One green pass + one re-run" applies — repaired flows pass twice consecutively.

**Exit criteria (M1-A):**

- `rg -l "learning-accommodation-section-header" apps/mobile/e2e/flows` returns ≤ 2 results, each intentionally entering Learning Preferences and commented in-flow.
- `rg -l "launchApp|_setup/launch-devclient.yaml" apps/mobile/e2e/flows | grep -v release | grep -v expogo` returns zero.
- `rg "optional: true" apps/mobile/e2e/flows | rg -v "# justified:"` returns zero, OR every remaining match is covered by `apps/mobile/e2e/optional-allowlist.txt`.
- Repaired flow set passes twice consecutively on a clean Pixel API 34 emulator.

### M1-B — Validator + tag set + inventory (human-supervised, light agent assist)

- Implement the static YAML integrity validator from the Phase 0 spec.
- Wire it into `.github/workflows/docs-checks.yml` (PR-time check, not a merge gate yet).
- Define the `pr-blocking` tag set (~15–25 flows that are stable + cover top-of-funnel + critical paths).
- Tag every flow file with ≥1 tag — validator enforces.
- Drive inventory rows to actual executed status: passing flow OR `DEFERRED:<ticket-id>` annotation. The May 1 batch plan's 18 batches × ⬜ rows all close out one way or the other.

**Exit criteria (M1-B):**

- `bash scripts/validate-maestro-flows.sh` exits 0; wired into `docs-checks.yml`.
- `pr-blocking` tag set defined; named in `apps/mobile/e2e/CONVENTIONS.md`.
- Every flow file has ≥1 tag (validator-enforced).
- Inventory's every row maps to passing flow OR explicit `DEFERRED:<ticket>` annotation.

**Files touched:** `apps/mobile/e2e/`, `apps/mobile/e2e/scripts/`, `scripts/validate-maestro-flows.sh` (new) or `.ts` equivalent, `.github/workflows/docs-checks.yml`, `docs/flows/*`.

## 6. P3 — Inngest + integration coverage uplift (`/goal`, 1 session)

**Why third:** API-only, independent of UI work. Must wait for mock-drain spike to merge — heavy overlap on `tests/integration/` files.

**Scope:**

- Inventory all Inngest functions; produce `tests/integration/INNGEST-COVERAGE.md` classifying each as direct / indirect-via-route / none.
- Add dedicated integration tests for the 8 priority pipelines: onboarding multi-step, quiz grading, celebration rules, family-pool-reset-finished, retention tier transitions, calibration variants, coaching-card cache invalidation, memory facts refinement.
- Add integration tests for the 8 priority untested route groups: book-suggestions, books, coaching-card, feedback, filing, notes, retention, review.
- All new tests written in Pattern A (mock-drain's standard). No shadow mocks introduced.
- Investigate safe parallelism for `pnpm exec nx run api:test` (schema-per-worker or transaction-rollback isolation) — optional within session if time permits.

**Exit criteria:**

- `tests/integration/INNGEST-COVERAGE.md` exists with classification for every Inngest function.
- Each of the 8 priority Inngest pipelines has a dedicated `*.integration.test.ts`.
- Each of the 8 priority route groups has integration coverage.
- `pnpm exec nx run api:test` passes; runs twice consecutively without intervention.
- `rg "^\s*jest\.mock\(['\"]\.\.?/" tests/integration | rg -v "gc1-allow"` returns zero (carried over from mock-drain baseline — must not regress).

**Files touched:** `tests/integration/`, possibly `apps/api/src/inngest/` (test fixtures), `tests/integration/INNGEST-COVERAGE.md` (new), possibly `tests/integration/jest.config.cjs`.

## 7. P4 — End-of-initiative tooling refresh (after P1, M1, P3 land)

**Why last:** Incorporates everything the `/goal` agent learned. Different from the Phase 0 pass (which was the obvious-up-front refresh).

**Scope:**

- Second pass on `.claude/commands/my/e2e.md` and `.agents/skills/e2e/SKILL.md` — fold in any new preflight checks, command corrections, edge cases surfaced during P1/M1.
- Second pass on `docs/E2Edocs/e2e-runbook.md` — same.
- Consolidate `apps/mobile/e2e/scripts/regression-batch{2,3,4a,4b}.sh` into one parametric runner driven by M1's tag registry. Delete the old batch scripts.
- Rewrite `.claude/commands/my/run-e2e.md` (currently 417 bytes of unguarded delegation) to enforce: app-is-source-of-truth, GC1/GC6 compliance (no internal mocks), capped subagent fan-out, mandatory inventory update after any flow change.
- Final CLAUDE.md sync (test counts, Inngest function counts, env-file paths, canonical runbook location, canonical skill location). At this point the mock-drain merge conflict has long since been resolved.
- Memory file sync.
- Decide CLERK_TESTING_TOKEN cleanup if not done in Phase 0.

**Exit criteria:**

- Skill + runbook reflect lessons learned from P1, M1, P3.
- One parametric regression runner; `regression-batch*.sh` deleted.
- `.claude/commands/my/run-e2e.md` enforces the rules listed above.
- CLAUDE.md "Snapshot" counts match reality (`git ls-files | wc -l` patterns from §1).

## 8. P5 — Speed and tiering (parallel, separate workstream)

Owned and written up in a separate workstream / branch. Not detailed here — included for sequencing visibility only.

**Goal:** Reduce full-suite wall-clock from ~23 min toward something CI-affordable (~6–7 min if WAF contention is unblocked and 4-worker parallelism becomes viable). Define core/full tiering. Drop the screenshot crawl from any "always required" path. Possibly affected-test routing once tiering stabilises.

**Parallel-safe with:** Phase 0, P1, M1, P3. Mild collision risk only on `playwright.config.ts` and `.github/workflows/e2e-web.yml`.

**Not in this proposal's exit criteria.** Tracked separately.

## 9. Cross-cutting rules

- **App is source of truth.** Real-bug failures get a code fix; spec-drift failures get a spec fix with the prior assertion preserved as a regression test where possible. Never weaken an assertion to make a failing test pass.
- **No silent swallows.** Maestro `optional: true` covered by §3.5 / §M1-A. Playwright equivalent: no `.catch(() => null)` or `try/catch` that turns a critical wait into a pass.
- **GC1/GC6.** New tests authored in Pattern A from the start. Pre-commit hook enforces.
- **Subagents never run `git add` / `git commit` / `git push`** outside the `/commit` skill (CLAUDE.md rule).
- **Tag registry is canonical** across Maestro + Playwright once both exist.

## 10. Open items to settle in Phase 0

- CLERK_TESTING_TOKEN slot removal — Phase 0 or P4? Owner decides on execution day.
- Inventory rows that will be `DEFERRED:<ticket>` — which ones genuinely block on infra outside this initiative's scope (Clerk dashboard, ADB deep-link, SecureStore manipulation, network throttling), and which are just unaudited? Resolved during M1-B inventory close-out.

## 11. Source-of-truth references

- `docs/audit/e2e/baseline-2026-05-14.md` — measured Playwright baseline + local-API blocker analysis
- `docs/audit/e2e/scope-proposal-1.md`, `scope-proposal-2.md` — earlier iterations, kept as snapshots
- `docs/audit/e2e/scope-proposal-2.html` — interactive explorer (data slightly stale but structure valid)
- `docs/audit/goal-spike-mock-claude.md` — parallel mock-drain spike (P3 dependency)
- `docs/audit/e2e/runs/` — raw Playwright run logs
- `docs/audit/2026-05-08-web-e2e-full-suite-bug-ledger.md` — COMPANION; point-in-time triage; specific claims verified-stale on J-10/J-19/W-01/W-04 (see §1, §4)
- `docs/audit/2026-05-11-end-user-playwright-bug-pass.md` — COMPANION; root-cause analysis on `parent-profile-carveout` (merged via PR #211); splash mitigation is in tree but incomplete
- `docs/flows/e2e-flow-coverage-audit-2026-05-13.md` — COMPANION; mobile coverage audit (apply same currency scepticism during M1)
- `docs/E2Edocs/e2e-runbook.md` — operational runbook (active; to become OS-aware in Phase 0)
- `apps/mobile/e2e/{CONVENTIONS.md,README.md}` — Maestro project conventions
- `apps/mobile/playwright.config.ts`, `apps/mobile/e2e-web/helpers/` — Playwright wiring
- `tests/integration/{jest.config.cjs,setup.ts,external-mocks.ts}` — integration test infra
- `.github/workflows/{e2e-ci,e2e-web,docs-checks}.yml` — CI surfaces
- `.claude/commands/my/{e2e,run-e2e}.md`, `.agents/skills/e2e/SKILL.md` — operational skills
- `CLAUDE.md` — project rules (PR Review Protocol, GC1/GC6, UX Resilience Rules)
