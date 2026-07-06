# WI-1413 Review Evidence — reviewer claude-code:reviewer-ws44

WI: WI-1413 "S3 avatar-admin parity coverage — sheet omits + doesn't test rare rows before S6 More-tab deletion"
Workstream: WS-44 Coverage Debt (3938bce9-1f7c-81ad-add6-f36bf7c317bc)
Type: Task · ExecPath: Assisted · Producer (Executed By): codex:shepherd:coverage-debt
Landing branch: main · Reviewed: 2026-07-06

## Disposition: DONE

## Landed state
- Fixed In: commit aaa5fda95676845f7ed555be883896e5545f99dc — IS tip of origin/main (ancestor of target branch main).
- PR #1952 (WI-1413-rework -> main): state MERGED, mergedAt 2026-07-06T17:47:47Z, mergeCommit aaa5fda9.
- Coverage landed across two PRs: #1947 (98951bfe5 "cover account admin sheet rows", +46/+58) and #1952 (aaa5fda9 rework "exercise account back navigation").
- Rework cycle (Tags include `rework`): prior review bounced an internal navigation convenience mock in account/index.test.tsx; rework removed it and now exercises the real back-nav helper via router behavior.

## CI (PR #1952) — 10/10 checks, 0 non-green
ota-update(skip), API Quality Gate(pass), CodeRabbit(pass), Flag-ON integration IDENTITY_V2(pass),
Merge completeness(pass), Playwright web smoke(pass), changes(pass), claude-review(pass), main(pass), run-smoke(pass).

## AC-by-AC
- AC1 owner row set + denied gates: AccountAdminSheet.test.tsx:92-134 asserts 12 owner rows present; non-owner/all-gates-false hides security/subscription/add-child/family-settings while preserving learning-prefs/mentor-memory/mentor-language/profile/notifications/privacy/help/sign-out. PASS
- AC2 reach paths: :136-176 exact route assertions — accommodation, mentor-memory?returnTo=account, more/account (mentor-language), /profiles, more/account (security), /subscription, more/notifications, create-profile{for:child}, /more, more/privacy, more/help. PASS
- AC3 account wrapper + back fallback: account/index.test.tsx:41-66 mounts AccountAdminSheet; canGoBack=false -> replace('/(app)/home'); canGoBack=true -> back(). Real AccountScreen rendered; back-nav helper NOT mocked. PASS
- AC4 D4 boundary: NO devices / withdrawal-archive / breakdown-sharing rows asserted or rendered — boundary respected, deferred to WI-1416. PASS
- AC5 verification: focused Jest re-run NOW below. PASS

## Local re-run (verified NOW, against byte-identical origin/main content)
Method: staged origin/main versions of both test files into place (byte-diff == origin/main confirmed), ran jest directly (repo Windows guidance), then restored working tree.
- AccountAdminSheet.test.tsx: 1 suite, 4 passed, 0 failed.
- account/index.test.tsx: 1 suite, 3 passed, 0 failed.
Total: 7 passed / 0 failed.

## Lane invariant (tests exercise real behavior)
- account/index.test.tsx: mocks only expo-router (external) + AccountAdminSheet child (gc1-allow, dedicated coverage). Back-nav logic runs for real. The previously-bounced internal convenience mock is gone — confirmed in file.
- AccountAdminSheet.test.tsx: 4 internal mocks, all gc1-allow annotated — useNavigationContract/useProfile (React context hooks, gate/profile injection; nav-contract separately covered), lib/sign-out (SecureStore boundary), lib/platform-alert (native Alert boundary). Component-under-test (AccountAdminSheet) is real and rendered; assertions are strong (exact testIDs, exact routes/params, wrapper-invoked-not-clerk-direct). Not weakened; not the GC1 antipattern; green PR = ratchet accepted the escapes.

## Producer-is-not-closer
Producer codex:shepherd:coverage-debt != reviewer actor claude-code:reviewer-ws44 -> gate satisfied.

## Policy override applied
WP-child formality waived for WS-44 (direct Item slice, no WP). No other DoD criterion relaxed.
