# WI-1405 Builder Brief — Billing v2 coverage

You are a Codex builder executor for **WI-1405 — Billing v2 live-path + child-facing + top-up test coverage gaps** in WS-44 Coverage Debt.

Workspace:
- Repo worktree: `C:\Dev\Projects\Products\Apps\eduagent-build\.worktrees\WI-1405`
- Branch: `WI-1405`
- Claimant identity already set by shepherd shell: `codex:builder:WI-1405`
- Report file expected by shepherd: `C:\Dev\Projects\Products\Apps\eduagent-build\.cosmo-watch\coverage-debt\WI-1405-builder-report.md`

Hard runtime constraints:
- Do **not** call Notion/Cosmo from inside this executor. Nested `codex exec` cannot reach Notion over REST/API/CLI. The shepherd shell owns Cosmo claim/complete mechanics.
- Do **not** modify `apps/mobile/eas.json`.
- Do **not** merge anything. F35 landing rhythm: build, verify, commit, push, open PR, then **hold**. The orchestrator lands the gate-cleared PR and returns the squash SHA; shepherd completes Cosmo afterward.
- You are explicitly authorized by the shepherd/orchestrator lane protocol to open the PR for this WI after committing and pushing this branch.

Objective:
Add high-value, real-behavior test coverage for the remaining billing-v2 money/quota gaps while respecting the headless/device split. This is a coverage-debt WI; keep production behavior changes out unless a test exposes a real defect and the smallest fix is necessary.

Refined acceptance criteria:

1. Add real-DB `quota-provision-v2` integration coverage for owner and child role resolution, absent `profileQuotaUsage` provisioning, stale-limit update, and missing/cross-org membership no-provision behavior.
   - Red-green-revert evidence: tests fail if role resolution is changed to legacy/profile-only or insert/update provisioning is removed.

2. Add live quota hot-path coverage for per-profile v2 from an absent quota row, preferably through route or metering boundary with only external dependencies stubbed.
   - Assert the row is lazy-provisioned and decremented exactly once.
   - Assert child 402 details do not expose owner top-up availability.
   - Red-green-revert evidence: test fails if `getOrProvisionProfileQuotaUsageV2` is bypassed or per-profile tiers hit shared-pool decrement.

3. Add real-DB `family-v2` integration coverage for current service semantics: list, pool status, add validation of an existing same-org profile, and remove/archive/revoke behavior.
   - Cover family/pro happy path, plus/free rejection, over-cap rejection, cross-org rejection, owner-removal rejection, and archived members excluded from count/list.
   - Red-green-revert evidence: tests fail if archived persons remain billable/listed or owner/cross-org removal succeeds.

4. Add mobile child in-chat quota coverage at code level and e2e level.
   - Unit/screen coverage asserts `sessionIsOwner=false` renders child actions, hides upgrade/top-up actions, and disables composer after structured 402.
   - Maestro child-profile flow asserts `quota-exceeded-card`, `quota-notify-parent-btn`, `quota-go-home-btn`, and no `quota-upgrade-btn`.
   - Mark device assertions `verify-at-e2e-run` unless you actually run them on a configured device.

5. Add mobile top-up success-to-poll screen test.
   - Paid tier plus top-up package plus successful purchase enters polling UI, refetches usage, confirms only when `topUpCreditsRemaining > baseCredits`, shows success alert, and clears in-flight state.
   - Red-green-revert evidence: test fails if polling is skipped or confirmation uses `>= baseCredits`.

6. Keep live RevenueCat purchase e2e separate from headless code claims.
   - You may add/adjust YAML or seeded confirmed-state tests.
   - Do not claim live store purchase or RevenueCat sandbox confirmation unless actually executed on a configured device.

Research notes:
- Live v2 dispatch/routes: `apps/api/src/services/billing/billing-v2/index.ts`, `dispatch.ts`, `apps/api/src/routes/billing.ts`.
- Quota provisioning: `apps/api/src/services/billing/billing-v2/quota-provision-v2.ts`; live usage/metering via `apps/api/src/routes/billing.ts`, `apps/api/src/middleware/metering.ts`, `apps/api/src/services/billing/metering.ts`.
- Family v2: `apps/api/src/services/billing/billing-v2/family-v2.ts`.
- Top-up v2: `apps/api/src/services/billing/billing-v2/top-up-v2.ts`; mobile `apps/mobile/src/app/(app)/subscription.tsx`.
- Child quota UI: `apps/mobile/src/components/session/QuotaExceededCard.tsx`, `SessionMessageActions.tsx`, `use-session-streaming.ts`, `apps/mobile/src/app/(app)/session/index.tsx`.
- Existing adjacent tests already cover some decrement/top-up paths; do not duplicate weak coverage. Narrow to the missing lazy-provision/per-profile/family-v2/mobile-positive-path gaps.

Execution expectations:
- Start with a short implementation plan in your report.
- Use existing repo patterns and test utilities. Prefer real DB integration tests for API ACs; stub only true external dependencies.
- Run focused tests for every changed area and the repo change-class validator if feasible.
- Perform red-green-revert checks where practical and report exactly what was reverted and which test failed.
- Commit with the repo commit skill/workflow. Push branch `WI-1405`.
- Open a PR for `WI-1405`; include verification and caveats. Then stop. Do not run Cosmo complete.

Final report must include:
- PR URL and commit SHA(s), or explicit blocked state.
- Files changed.
- Tests run with exact commands and pass/fail counts.
- Red-green-revert evidence.
- Any AC not satisfied and why.
- Confirmation that Cosmo completion was not run and the PR is waiting for orchestrator landing.

