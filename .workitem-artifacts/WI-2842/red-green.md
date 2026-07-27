# WI-2842 exact red-green-revert proof

## Boundary and landed revision

The proof ran in isolated worktree `WI-2842` at landed BID-19 revision
`a36b0891c7288125c04ab574ebbd1b400f59b64c`. The final route-owned strategy is
the combination of:

- `apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts`, which creates
  a correlated discriminator and resolves the held response from the route;
- `apps/mobile/e2e-web/helpers/held-now-request.ts`, which fetches the exact
  correlated GET response, verifies its URL, fulfills the route, and returns it.

The named browser invocation was identical across the credited green, red, and
restored-green phases except for a unique seed cleanup prefix:

```text
doppler run --config stg -- env EXPO_PUBLIC_ENABLE_MODE_NAV=true EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true PLAYWRIGHT_RUN_ID=<phase> PLAYWRIGHT_SEED_PREFIX=pw-<phase>- pnpm exec playwright test -c apps/mobile/playwright.config.ts apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts --project=v2-release --workers=1 --retries=0 --reporter=line --no-deps
```

## GREEN before mutation

Phase `wi2842-green-final` ran with the landed route-owned fix present. The
single named WI-2234 journey passed in 58.3 seconds. It retained the active
Session assertion, fresh successful response, Mentor return, and both exact card
assertions.

## Controlled mutation and RED

The controlled mutation replaced only the route-owned response strategy with
the legacy response-wrapper matcher. It reintroduced `matchesHeldNowRequest`,
continued the captured request without making the correlation rewrite visible,
and waited for a later `response.request()` wrapper to equal the correlated
method/full-URL discriminator. This deterministically represents the original
variant: the later response wrapper retains the original URL rather than the
continued correlated URL. The complete mutation is recorded in
`controlled-mutation-diff.md`.

Phase `wi2842-red-missing-rewrite` exited 1 with the original held-response
failure at the same browser boundary:

```text
TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"
returning-learner-resume.spec.ts:144:43
1 failed
```

This is a named real-browser failure with `--workers=1 --retries=0 --no-deps`,
not the earlier WI-2838 lifecycle-array unit mutation.

For audit completeness, the exact historical pre-final journey blob
`012399938c90facc3f66ede4ff61683a24d7f054` was also rerun first. It passed under
the current browser lifecycle, so it was not credited as RED. An incomplete
first attempt lacked the removed helper export and failed with a TypeError; it
was likewise rejected as evidence. The credited mutation explicitly recreates
the missing-rewrite behavior that caused the historical timeout.

## REVERT and restored GREEN

Both mutated files were restored byte-for-byte to the landed revision:

```text
returning-learner-resume.spec.ts 5ff958fb735af0c22481b91e7935d5b5a1c75295
held-now-request.ts              ddecb0e004b2926acf5c80cd414df7d08c1b299d
```

`git diff --quiet` then passed for both paths. Phase
`wi2842-green-restored` reran the same named command and passed in 56.6 seconds.
No production source or test change remains.

