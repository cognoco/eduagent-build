# P1 Codex Execution Brief — Playwright Web E2E

**Status:** Active execution source for Codex P1 work.
**Prepared:** 2026-05-14.
**Branch:** `consistency`.
**Scope of this brief:** execution coordination and current failure assumptions only. It does not replace the companion audit snapshots, and it does not assert root causes that were not verified by current code, a fresh replay, or trace evidence.

## Current Verified Inventory

| Item | Count | Verification |
|---|---:|---|
| Flow spec files | 27 | `find apps/mobile/e2e-web/flows -type f -name '*.spec.ts' \| wc -l` |
| Journey spec files | 20 | `find apps/mobile/e2e-web/flows/journeys -maxdepth 1 -type f -name '*.spec.ts' \| wc -l` |
| Seed scenarios | 44 | Parsed `SeedScenario` union in `apps/api/src/services/test-seed.ts` |

Static source checks:

- `j08-ask-freeform-session-summary.spec.ts` currently uses `home-ask-anything`, not stale `intent-ask`.
- `home-ask-anything` exists in `apps/mobile/src/components/home/LearnerScreen.tsx`.
- `thinking-bulb-animation` exists in `apps/mobile/src/components/session/ChatShell.tsx`.
- `shelf-row-header-<subjectId>` exists in `apps/mobile/src/components/library/ShelfRow.tsx` and is used by J-01, W-05, and J-11.
- `apps/mobile/e2e-web/helpers/serve-exported-web.mjs` currently rewrites `.env.local` and `.env.development.local` before export to set `EXPO_PUBLIC_API_URL` from `PLAYWRIGHT_API_URL`.

## Freshness Replays

Required target shape:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  <spec> --project=<project> --workers=1 --retries=0 --reporter=list
```

Observed on 2026-05-14:

| Target | Project | Result | Current signal |
|---|---|---|---|
| `j04-parent-inline-learn.spec.ts` | `role-transitions` | Blocked before target | First run failed seeding `onboarding-complete` with Cloudflare 1101. Second run seeded `onboarding-complete`, then failed seeding `parent-multi-child` with Cloudflare 1101. J-04 did not run. |
| `j01-ux-pass.spec.ts` | `smoke-learner` | Reached product test and failed | Setup passed. J-01 failed on `/library`: `shelf-row-header-<subjectId>` element not found after `networkidle` and a 30s assertion timeout. Teardown reset also hit Cloudflare 1101. |
| `j08-ask-freeform-session-summary.spec.ts` | `later-phases` | Blocked before target | Setup failed seeding `onboarding-complete` with Cloudflare 1101. J-08 did not run. Current code disproves the stale `intent-ask` claim. |
| `w05-tab-routes-render-correct-screen.spec.ts` | `later-phases` | Blocked before target | Setup timed out waiting for `post-approval-continue`; error context showed the profile-load fallback, "We could not load your profile". W-05 did not reach tab assertions in this run. |

Do not treat these setup failures as product-flow root causes. They are freshness constraints for this prep pass. The execution session should start by stabilizing or bypassing setup only enough to inspect target traces, then classify app bug vs spec drift.

## Local API Caveat

The older brief described local API mode as broken because the prebuilt web bundle had a staging URL baked in. Current helper code is more nuanced: `serve-exported-web.mjs` rewrites the mobile env files before `expo export`, so local mode must be re-diagnosed before claiming a baked-URL root cause.

For P1, use remote-staging CI-equivalent commands first because that is the measured baseline. If local mode is needed for faster iteration, verify the actual request target with network logs and the current helper behavior before editing docs or config.

## Execution Split

### P1A — Existing Suite Green

Goal: make the existing 27 spec files pass under the CI-equivalent command, then repeat the full suite once more.

Priorities:

1. Restore reliable setup/auth/seed execution enough to inspect target failures.
2. Classify every failing spec before patching.
3. Fix existing-suite app bugs or spec drift.
4. Stabilize retry-only flakes with `--retries=0` targeted checks.
5. Run the full suite twice back-to-back with the CI-equivalent command.

### P1B — Coverage, Docs, Hardening

Start only after P1A is green.

Deliverables:

- Add new journey coverage from a mapped scenario list.
- Add or update `apps/mobile/e2e-web/README.md`.
- Add Doppler fail-closed behavior if still required.
- Confirm no silent `.catch(() => null)` swallows in `apps/mobile/e2e-web/`.

## Failure Inventory For First P1A Pass

### Cluster A — likely splash or pointer-event issue; confirm from trace before patching

Specs from the 2026-05-14 baseline:

- `j04-parent-inline-learn.spec.ts`
- `j05-parent-switch-to-child.spec.ts`
- `j06-child-switch-to-parent.spec.ts`
- `j07-parent-dashboard-drilldown.spec.ts`
- `j16-parent-drilldown-back-chain.spec.ts`
- `j17-parent-session-recap-copy.spec.ts`

Current prep could not refresh J-04 because setup failed before the target. Treat the May 11 splash/pointer-event evidence as a companion lead, not a confirmed current root cause. First action: run one role-transition spec to target failure, open the trace, and verify whether the click is intercepted, hanging in `locator.click()`, or blocked by a route/state issue.

### Library Surface — J-01, W-05, J-11

Current code and replay indicate this should be one early worker slice.

- J-01 freshly fails at `shelf-row-header-<subjectId>` on `/library`.
- W-05 is not currently proven to fail at the More-tab `Profile` assertion; it should first pass the same library shelf row wait.
- J-11 was flaky in the baseline and also depends on the library shelf-to-book surface.

Do not start by changing the More-tab assertion in W-05. First classify why the seeded learner's expected subject row is absent or invisible on `/library`.

### Session and Quiz — J-08, J-10

- J-08 is not stale `intent-ask`; the spec now clicks `home-ask-anything`.
- J-08 still needs a fresh target replay after setup is reliable to classify whether failure is session creation, streaming, summary filing, or navigation home.
- J-10 should not be assumed to be the May 8 `usage_events` table issue. The table exists in current schema. Reproduce fresh and classify from current error context.

### Other Open Questions

- `j09-learn-create-subject-onboarding.spec.ts`
- `j12-pre-profile-create-profile.spec.ts`
- `j13-consent-pending-parent-approval.spec.ts`
- `j15-parent-solo-add-first-child.spec.ts`

Use current app behavior as source of truth. The May 8 and May 11 audit docs are companion snapshots only.

### EUPW-2 — parent onboarding notices

May 11 reported duplicate parent notices: "You're a parent now too" and "This is your home". Verify against current `ParentHomeScreen` behavior before patching. It belongs in P1A only if it blocks existing-suite green or is still visible in target traces; otherwise move it to P1B.

## Coordinator And Worker Model

GPT-5.5 coordinator owns:

- Diagnosis order and final classification decisions.
- Reading traces and deciding whether a patch is app code, spec drift, or test infrastructure.
- Worker prompts, file ownership boundaries, and patch review.
- All commits, pushes, and final verification.

GPT-5.3-codex workers may own bounded, disjoint tasks only:

- Inspect assigned files and traces.
- Make scoped patches only within assigned ownership.
- Report changed files and verification commands.
- Never commit, push, rewrite unrelated files, or broaden scope without coordinator approval.

Coordinator must review every worker patch before integration and must run final verification locally.

## Initial Worker Slices

### Worker A — Library Surface

Ownership: `apps/mobile/e2e-web/flows/journeys/j01-ux-pass.spec.ts`, `apps/mobile/e2e-web/flows/journeys/j11-library-to-book-session.spec.ts`, `apps/mobile/e2e-web/flows/navigation/w05-tab-routes-render-correct-screen.spec.ts`, and library screen/components needed to classify the shelf-row absence.

Prompt:

```text
Inspect current library-surface failures for J-01, W-05, and J-11. Start from the latest J-01 no-retry failure: /library did not show shelf-row-header-<subjectId>. Determine whether this is app bug, seed-data mismatch, loading/race issue, or spec drift. Do not edit outside the listed spec files and library screen/component files without asking. Do not commit or push. Return the classification, exact evidence, proposed patch, changed files, and targeted verification command.
```

### Worker B — Session And Quiz

Ownership: `j08-ask-freeform-session-summary.spec.ts`, `j10-practice-quiz-cycle.spec.ts`, session/quiz screens/helpers needed for classification.

Prompt:

```text
Inspect J-08 and J-10 from current code. J-08 is not stale intent-ask; it already uses home-ask-anything. J-10 must not be assumed to be the old usage_events SQL issue. Reproduce with retries disabled once setup is available, classify each failure from current evidence, and patch only within assigned session/quiz/spec files. Do not commit or push. Return classification, evidence, changed files, and targeted verification commands.
```

### Worker C — Role Transitions And Parent Notices

Ownership: role-transition specs J-04/J-05/J-06/J-07/J-16/J-17, `AnimatedSplash`, parent home/profile transition code, and `ParentHomeScreen` only if EUPW-2 reproduces.

Prompt:

```text
Inspect current role-transition failures. The old splash/pointer-event theory is likely but unconfirmed in this prep pass because setup blocked J-04. First get one role-transition trace to the target failure and classify whether the click is intercepted, hanging, or routed incorrectly. Also verify whether EUPW-2 duplicate parent notices still reproduces. Patch only in assigned role-transition/splash/parent-home areas. Do not commit or push. Return trace evidence, classification, changed files, and targeted verification commands.
```

### Worker D — P1B Scenario Mapping

Start only after P1A is green. No app/spec edits in P1A.

Ownership: documentation or a proposed mapping artifact only.

Prompt:

```text
Prepare P1B new-spec scenario mapping only. Use the 44 SeedScenario values in apps/api/src/services/test-seed.ts and existing journey gaps to propose at least six new Playwright journey specs, seed scenario, target user path, and primary assertion. Do not edit app code or existing specs. Do not commit or push.
```

## First Commands For Execution Session

Static refresh:

```bash
find apps/mobile/e2e-web/flows -type f -name '*.spec.ts' | wc -l
find apps/mobile/e2e-web/flows/journeys -maxdepth 1 -type f -name '*.spec.ts' | wc -l
node -e "const fs=require('fs'); const s=fs.readFileSync('apps/api/src/services/test-seed.ts','utf8'); const m=s.match(/export type SeedScenario =([\s\S]*?);/); console.log((m?.[1].match(/\|\s*'[^']+'/g)||[]).length);"
rg "intent-ask|home-ask-anything|thinking-bulb-animation|shelf-row-header" apps/mobile/e2e-web apps/mobile/src
```

Setup/auth health probe:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j01-learner-home.spec.ts \
  --project=smoke-learner --workers=1 --retries=0 --reporter=list
```

Library target:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j01-ux-pass.spec.ts \
  --project=smoke-learner --workers=1 --retries=0 --reporter=list
```

Role-transition target:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j04-parent-inline-learn.spec.ts \
  --project=role-transitions --workers=1 --retries=0 --reporter=list
```

J-08 and W-05 targets:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/journeys/j08-ask-freeform-session-summary.spec.ts \
  --project=later-phases --workers=1 --retries=0 --reporter=list

CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm exec playwright test -c apps/mobile/playwright.config.ts \
  apps/mobile/e2e-web/flows/navigation/w05-tab-routes-render-correct-screen.spec.ts \
  --project=later-phases --workers=1 --retries=0 --reporter=list
```

Full suite final verification:

```bash
CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 \
  PLAYWRIGHT_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  EXPO_PUBLIC_API_URL="https://mentomate-api-stg.zwizzly.workers.dev" \
  doppler run --project mentomate --config stg -- \
  pnpm run test:e2e:web --reporter=list,json
```

Required before completion:

- Full suite green twice consecutively with the command above.
- Targeted no-retry checks pass for prior flakes: setup auth, `j11-library-to-book-session.spec.ts`, and `j15-parent-solo-add-first-child.spec.ts`.
- No remaining failures are waived as "known" without current classification and a tracked follow-up outside P1.

## Companion Sources

- `docs/audit/e2e/baseline-2026-05-14.md` — measured baseline.
- `docs/audit/e2e/p1-goal-brief.md` — stale handoff retained for history.
- `docs/audit/2026-05-08-web-e2e-full-suite-bug-ledger.md` — companion triage snapshot.
- `docs/audit/2026-05-11-end-user-playwright-bug-pass.md` — companion root-cause snapshot.
- `apps/mobile/playwright.config.ts` — project, retry, worker, and web server behavior.
- `apps/mobile/e2e-web/helpers/serve-exported-web.mjs` — current export/env rewrite behavior.
