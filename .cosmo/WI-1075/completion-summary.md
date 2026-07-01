**What was done:** Completed the `@inngest-admin` annotation sweep that WI-1075 owns. The reviewer's bounce (against origin/main c441508c, 2026-06-29 20:12) found one Inngest function file missing the first-line marker: `apps/api/src/inngest/functions/billing-subscription-store-teardown.ts`. That file was added by WI-885 *after* PR #1642 branched, so #1642's sweep could not have covered it.

**What changed:** Added the first-line annotation `// @inngest-admin: no-db (...)` to `billing-subscription-store-teardown.ts`. The underlying service (`services/billing/store-teardown.ts`) imports only Stripe + RevenueCat + logger/sentry and touches no database, so `no-db` is the correct scope. Landed via hotfix PR #1654 (squash 411803de).

**Verification:** `pnpm exec tsx scripts/check-inngest-admin.ts` passes on current origin/main (HEAD 660f784d) — all non-test/non-helper Inngest function files annotated, 0 unannotated. PR #1654 CI was fully green (main, API Quality Gate, Merge completeness check, Playwright web smoke, claude-review). The guard step on #1643's branch (which lacked #1654) is the only place it still fails, confirming the gap was the missing annotation now present on main.

**Caveats / Follow-ups:** Fixed In cites 411803de (#1654), the commit that closed the sweep gap. None outstanding.
