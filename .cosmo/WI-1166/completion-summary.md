**What was done:** Fixed the identity-v2 reclaim null-guard the reviewer found unresolved in the original WI-1166 merge (#1613). In the 23505 `LOGIN_EMAIL_UNIQUE` catch branch of `createIdentityGraph`, the post-rollback re-read of the login row by email can return `undefined` (the winning row disappeared between the 23505 and the re-read — rare but real), making `existingClerkUserId` `null`; the old code passed that `null` straight to `refuseReclaim`, emitting `app/account.reclaim_attempt` with `existingClerkUserId: null`, which the new handler only validates for the non-null case.

**What changed:** `apps/api/src/services/identity-v2/identity-graph.ts` — guard the null `existingClerkUserId` before emitting the reclaim event (do not emit / safe-handle when null), removing the stale orphan-allow path. Landed via fix-forward PR #1665 (squash 68e54245aa4decac09a318eb276e220f1b63d7f9).

**Verification:** PR #1665: all required checks SUCCESS, claude-review VERDICT APPROVED (0 must-fix / 0 should-fix / 0 consider), mergeStateStatus CLEAN. Regression coverage added for the null-payload edge case.

**Caveats / Follow-ups:** Two external-boundary mocks (Inngest client, Sentry — not internal) carry `gc1-allow` comments citing the genuine unit-test boundary; accepted by the GC1 CI check and the APPROVED review. None outstanding.
