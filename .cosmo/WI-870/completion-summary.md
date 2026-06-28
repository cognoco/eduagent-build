## Completion Summary — WI-870 (deterministic auth-provider handoff coverage, AUTH-03/05/06/08/09)

**What was done:** Added CI-stable jest coverage for the five P1 primary-auth
handoff/recovery flow IDs that previously had only partial Chrome/source coverage,
and promoted their flow-plan rows to ✅ Pass with exact test cites. No real mailbox
or external OAuth provider was required; Clerk integration behavior was not weakened.

**What changed:** `apps/mobile/src/app/(auth)/sign-up.test.tsx` — +6 tests
(verification resend; change-email-back clears the code; back-to-sign-in;
email-verification + OAuth `setActive` retry preserving `sessionId`;
try-another-method fallback) covering AUTH-03 verification, AUTH-05 additional
verification, AUTH-08 OAuth. `apps/mobile/src/app/(auth)/sign-in.test.tsx` — +1
test (OAuth retry re-calls `setActive` with preserved `sessionId`) covering
AUTH-08/09. `docs/flows/plans/flow-revision-plan-2026-06-17.md` — AUTH-03/05/06/08/09
→ ✅ Pass with WI-870 cites; fixed a pre-existing AUTH-05/06 label/note swap.

**Verification:** jest AUTH suites green (sign-up + sign-in), 95 tests pass;
`tsc --noEmit` clean (mobile); GC1 ratchet clean (0 new internal `jest.mock`).
CI on PR #1258: all 5 required checks SUCCESS — `main`, `Playwright web smoke`,
`API Quality Gate`, `Merge completeness check`, `Flag-ON integration` — plus
`claude-review` green. Squash-merged to `main` as `e48f518e0` (PR-head SHA
`ea10a1937`).

**Caveats / Follow-ups:** Real mailbox/SMTP delivery and external OAuth/SSO provider
*completion* remain true external boundaries — exercised at integration/e2e, not
faked in these unit suites. The advisory (non-required) `run-smoke` job failed on an
unrelated parent-gateway smoke (`j03-parent-gateway › parent can switch between
Family and My Learning`), reproduced identically on re-run — a pre-existing staging
condition with zero overlap with this WI's diff (AUTH jest + doc only), not a WI-870
regression. No follow-ups for WI-870; a separate pre-existing
`consent-reminders.test.ts` identity-v2 `resolveOrgId` defect surfaced during sibling
WI-871 work and is tracked there.
