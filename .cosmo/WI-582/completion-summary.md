What was done:
Closed both cross-account entitlement/credit leaks bundled in WP-W3-entitlement-isolation, scoping entitlement + credit reads to the owning account per the bundle strategy (MMT-ADR-0001/0002/0015; depends on WP-W2-scope-rls, already landed). Delivered via PR #903 (merged to main, merge commit 6ca07824; head 03204b1d3).

- F-135 (API — owner top-up balance leaked to child profiles): getTopUpCreditsRemaining() returns the subscription-wide sum when profileId is omitted; the metering middleware passed profileId only for per-profile owners, so a child's quota-exceeded path aggregated the OWNER's purchased credits and echoed them in the 402 body (details.topUpCreditsRemaining) and the quotaFractionRemaining denominator. Fixed at both middleware call sites: per-profile non-owners get 0 and the unscoped query never runs — mirroring the masking the /usage route already does. Shared-pool tiers unchanged (pool-wide sum is by-design).
- F-134 (mobile — RevenueCat identity-sync race): useCustomerInfo (keyed by Clerk userId) raced Purchases.logIn; on a shared-device account switch the previous account's entitlement snapshot could be cached/persisted under the new user's key. Fixed with a module-level identity-sync store: useCustomerInfo.enabled gates on "logIn completed for this userId" (useSyncExternalStore); the identity hook invalidates the user-scoped customerInfo key after a successful logIn; terminal sync failure (after retries) escalates via Sentry.captureMessage (the fail-closed gate makes a silent terminal failure consequential, so breadcrumb-only recovery was no longer acceptable on a billing path).

What changed:
- apps/api/src/middleware/metering.ts — owner-only gating at both getTopUpCreditsRemaining call sites (pre-check + post-decrement).
- apps/api/src/middleware/metering.test.ts — new "[F-135] per-profile top-up credit isolation" describe (3 tests: fast-path 402, decrement-rejection 402, owner-scoped read).
- apps/mobile/src/hooks/use-revenuecat.ts — identity-sync store + gate, post-logIn invalidation, terminal-failure Sentry escalation, test-only reset helper.
- apps/mobile/src/hooks/use-revenuecat.test.ts — new "[F-134] identity-sync gating" describe (4 tests) + escalation/fail-closed test + wrapper updates.
- Commits: 7191a3fac (both fixes + break tests), 7ccba2f3b (review round 1: Sentry escalation), 03204b1d3 (review round 2: pinned fail-closed assertion + listener clear).

Verification:
- Bundle AC "entitlement + credit balance never cross the account/child boundary" + "break-test attempting a child read of an owner's credit/entitlement": both findings carry red-green break tests. F-135: pre-fix the child 402 body leaked the owner balance (test observed topUpCreditsRemaining: 500), post-fix 0 with the unscoped aggregate never queried. F-134: tests verified red against the unfixed hook (stash revert), green post-fix; review round 2 additionally pinned the fail-closed property — after terminal sync failure, Purchases.getCustomerInfo is asserted NEVER called.
- Local: api metering suite 80/80; --findRelatedTests 27 suites / 861 tests; api:typecheck + api:lint green. Mobile hook suite 20/20; 157 related tests; tsc --noEmit + lint green.
- CI: all checks green on head 03204b1d3; Claude review APPROVED ("No issues found") after one fix round; CodeRabbit pass.
- GC6: no new internal jest.mock added; deferral recorded in commit 03204b1d3 body — use-revenuecat.test.ts retains 1 pre-existing internal relative-path mock (jest.mock('../lib/revenuecat'), on-line gc1-allow, native-boundary thin wrapper that cannot run under jest).

Caveats / Follow-ups:
- A snapshot persisted under a user's key BEFORE this fix can still render during the brief identity-sync window; the post-logIn invalidation corrects it on first sync. The server tier remains the access authority throughout (no premium access ever crossed accounts — both findings were disclosure-only).
- If Purchases.logIn fails permanently (after 2 retries), customerInfo stays disabled for the session — fail-closed by design, now queryable via the new Sentry signal.
- getTopUpCreditsRemaining keeps its unscoped-by-default signature; both consumer surfaces (metering middleware, /usage route) mask at the call site. Optional hardening follow-up: require an explicit scope for per-profile subscriptions so the unscoped sum cannot be reached by accident — touches services/billing/** (CODEOWNERS), deliberately not bundled here.
- Provenance children WI-612/613 swept Closed/Done by the shepherd with Fixed In = 03204b1d3.
