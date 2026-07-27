# WI-2397 — executed red-green-revert

AC-2's negative-path break test is
`[MANDATORY WI-2397] GET /v1/dashboard: non-owner spoofing X-Profile-Id=owner is denied (403)`
in `tests/integration/wi1989-owner-idor.integration.test.ts`, run via:

```
node scripts/doppler-run.mjs run -- pnpm exec jest \
  --config tests/integration/jest.config.cjs --no-coverage \
  -t "WI-2397" tests/integration/wi1989-owner-idor.integration.test.ts
```

## RED — the new test against the pre-fix route (root GET /dashboard with no gate)

`assertCallerIsAccountOwner` was temporarily removed from the root `GET /dashboard`
handler in `apps/api/src/routes/dashboard.ts` (the fix's only functional line),
reproducing the state at `origin/main` before this WI:

```
FAIL integration tests/integration/wi1989-owner-idor.integration.test.ts (5.424 s)
  WI-1989: consent/dashboard/recaps/curriculum/onboarding/settings/notifications owner gates reject a spoofed X-Profile-Id
    ✕ [MANDATORY WI-2397] GET /v1/dashboard: non-owner spoofing X-Profile-Id=owner is denied (403) (1577 ms)
    ✓ control WI-2397: GET /v1/dashboard — the real owner (no spoof) gets 200

  ● ... [MANDATORY WI-2397] GET /v1/dashboard: non-owner spoofing X-Profile-Id=owner is denied (403)

    expect(received).toBe(expected) // Object.is equality

    Expected: 403
    Received: 200

      242 |     );
      243 |
    > 244 |     expect(res.status).toBe(403);
          |                        ^

Tests:       1 failed, 9 skipped, 1 passed, 11 total
```

`Received: 200` is the exact leak this WI closes: a same-account non-owner
spoofing `X-Profile-Id = <owner's profile id>` reads the owner's dashboard
(children list + pending notices) instead of being rejected.

## GREEN — the same test against the landed fix

`assertCallerIsAccountOwner(c, 'Only the account owner can view the family dashboard.')`
restored immediately after `withProfile(c)` in the root `GET /dashboard` handler:

```
PASS integration tests/integration/wi1989-owner-idor.integration.test.ts (5.248 s)
  WI-1989: consent/dashboard/recaps/curriculum/onboarding/settings/notifications owner gates reject a spoofed X-Profile-Id
    ✓ [MANDATORY WI-2397] GET /v1/dashboard: non-owner spoofing X-Profile-Id=owner is denied (403) (1522 ms)
    ✓ control WI-2397: GET /v1/dashboard — the real owner (no spoof) gets 200 (1656 ms)

Tests:       9 skipped, 2 passed, 11 total
```

## REVERT / RESTORE

The fix removal above (via `git stash push -- apps/api/src/routes/dashboard.ts`)
was the REVERT step and reproduced RED exactly (same failure, same message).
`git stash pop` was the RESTORE step, verified by re-running the same command
and getting the GREEN result above again — the fix landed in the commit is
byte-identical to what was verified green.

## What this demonstrates

The break test cannot pass against the pre-fix route (RED) and passes cleanly
against the landed fix (GREEN); reverting the fix reproduces RED, restoring it
reproduces GREEN. The full suite run (11/11, including the 9 pre-existing
WI-1989 sibling-route tests) confirms no regression to the routes this gate
pattern already protects.
