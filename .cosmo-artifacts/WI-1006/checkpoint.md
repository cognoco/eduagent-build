WI-1006 checkpoint

- Claimed WI-1006 after Cosmo repo/project guard passed.
- Initial worktree setup produced a directory at `.worktrees\WI-1006`, but it was not a registered git worktree: `git -C .worktrees\WI-1006 status` walked up to the main checkout and reported branch `ongoing`, `.worktrees\WI-1006\.git` was missing, and `git worktree list --porcelain` had no WI-1006 entry.
- No implementation work was started in that directory.
- Next step: move the invalid directory aside and recreate `.worktrees\WI-1006` using Windows/PowerShell/Git-for-Windows only, then confirm `git -C .worktrees\WI-1006 status --short --branch` reports branch `WI-1006`.

Coordinator stop update:

- The recreated `.worktrees\WI-1006` did register as a Git worktree on branch `WI-1006` with Windows-native metadata (`gitdir: C:/Dev/Projects/Products/Apps/eduagent-build/.git/worktrees/WI-1006`).
- Dependency setup failed during `pnpm install` with a Windows `EPERM` rename error under `node_modules\.pnpm\jsdom...`.
- Immediately afterward, `git -C .worktrees\WI-1006 status --short --branch` showed massive unrelated deletions, including `.agents/skills/*` and many repo-wide docs/tooling files. These are not WI-1006 changes.
- No WI-1006 implementation or test edits were made in the worktree.
- Repair plan: preserve this checkpoint in the main checkout, verify branch `WI-1006` has no unique commits beyond `origin/main`, remove/recreate the broken worktree cleanly, rerun setup, and only proceed after status shows branch `WI-1006` with no unrelated deletions.

Repair result:

- Verified local `WI-1006` branch matched `origin/main` before cleanup (`364b6a0d83b6b2db04dcd164c93befae7741e9d2`).
- Removed the broken registered worktree/branch, moved the leftover unregistered directory aside under `.worktrees\WI-1006.broken-*`, then recreated `.worktrees\WI-1006` from `origin/main`.
- Confirmed the repaired worktree:
  - `git -C .worktrees\WI-1006 status --short --branch` => `## WI-1006`
  - `.worktrees\WI-1006\.git` => `gitdir: C:/Dev/Projects/Products/Apps/eduagent-build/.git/worktrees/WI-1006`
  - `git -C .worktrees\WI-1006 rev-parse --show-toplevel` => `C:/Dev/Projects/Products/Apps/eduagent-build/.worktrees/WI-1006`
  - `git worktree list --porcelain` shows `WI-1006` with no `/mnt/c` entry for this worktree.
- No implementation, tests, commits, pushes, or Cosmo completion were performed after the stop instruction.

Dependency setup gate update:

- Ran dependency/environment setup from the repaired `.worktrees\WI-1006` worktree.
- `pnpm install` completed successfully.
- `pnpm run env:sync` completed, but modified tracked file `apps/mobile/eas.json`.
- No `.agents/skills` deletions or repo-wide tracked deletions appeared after setup.
- Because `apps/mobile/eas.json` is unrelated generated drift for `WI-1006`, stopped before reading/coding per coordinator gate.

Implementation checkpoint:

- Current item: WI-1006 — v2 Stripe subscription handler drops top-up credit re-attribution.
- Changed source files in `.worktrees\WI-1006`:
  - `apps/api/src/services/billing/billing-v2/stripe-webhook-handler-v2.ts`
  - `apps/api/src/services/billing/billing-v2/stripe-webhook-handler-v2.integration.test.ts`
- Surrounding code read:
  - v2 handler: `stripe-webhook-handler-v2.ts`
  - legacy parity handler: `stripe-webhook-handler.ts`
  - v2 top-up attribution primitive: `billing-v2/tier-v2.ts`
  - v2 RevenueCat attribution usage: `billing-v2/revenuecat-v2.ts`
  - v2 subscription/race-fence core: `billing-v2/subscription-core-v2.ts`
  - database lock/find helpers: `packages/database/src/account-repository.ts`
  - existing legacy Stripe F-124 integration tests and v2 subscription/revenuecat integration seed patterns.
- Test-first evidence:
  - Added focused v2 integration test.
  - Initial test run failed too early because the current integration DB no longer has legacy `accounts`; adjusted the seed to tolerate both freeze-window and post-legacy-drop schemas.
  - RED run then failed on the intended symptom: pro/family-to-free left `top_up_credits.profileId` null, and plus-to-family left owner credits non-null.
- Implementation present:
  - Added v2 previous-tier lock helper using `findSubscriptionByStripeIdV2__unscoped` plus `lockSubscriptionByOrganizationId__unscoped` so the lock targets the current v2 `subscription` table.
  - Wired re-attribution inside `handleSubscriptionEventV2` for expiry and effective-tier branches, and inside `handleSubscriptionDeletedV2`.
  - Emits `emitTopUpCreditsReattributedMetric` outside the transaction when credits moved.
- Verification so far:
  - `pnpm exec jest --config apps/api/jest.integration.config.cjs --testMatch '**/apps/api/src/services/billing/billing-v2/stripe-webhook-handler-v2.integration.test.ts' --runInBand --no-coverage --forceExit` passed: 4 tests.
  - `pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/services/billing/billing-v2/stripe-webhook-handler-v2.test.ts --runInBand --no-coverage` passed: 4 tests.
  - `pnpm exec tsc --build apps/api/tsconfig.json --pretty false` passed.
- Next step:
  - Run one adjacent v2 integration test and focused lint, then write final artifacts, commit, and push branch `WI-1006`.
- Current caveat:
  - The integration tests emit existing logger warnings for unconfigured Stripe pricing and known Jest open-handle behavior; they do not fail the run.

Stop checkpoint:

- User instructed no new work should start due to low token budget.
- WI-1006 source work is committed and pushed to `origin/WI-1006`.
- Local commit: `f811c70de2a04a8f44cf31bdfa611ccff37d0618`.
- Remote branch `origin/WI-1006` matched the same SHA when checked.
- Worktree `.worktrees\WI-1006` was clean after push (`git status --short --branch` showed `## WI-1006`).
- Artifacts present under `.cosmo-artifacts\WI-1006`: `workitem.json`, `checkpoint.md`, `completion-summary.md`.
- No Cosmo complete was run.
- No further Lane C items were claimed or started after WI-1006.
