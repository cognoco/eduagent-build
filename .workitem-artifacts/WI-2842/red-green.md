# WI-2842 red-green-revert audit — no valid RED reproduced

## Boundary and revision

The audit ran in isolated worktree `WI-2842` from BID-19 revision
`a36b0891c7288125c04ab574ebbd1b400f59b64c`. The named invocation was:

```text
doppler run --config stg -- env EXPO_PUBLIC_ENABLE_MODE_NAV=true EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true PLAYWRIGHT_RUN_ID=<phase> PLAYWRIGHT_SEED_PREFIX=pw-<phase>- pnpm exec playwright test -c apps/mobile/playwright.config.ts apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts --project=v2-release --workers=1 --retries=0 --reporter=line --no-deps
```

## Landed GREEN

The route-owned fetch/fulfill strategy passed before mutation in 58.3 seconds.

## Faithful legacy reversion — GREEN, not RED

The corrected reversion kept the historical
`route.continue({ url: discriminator.url })` and restored the response-wrapper
matcher. The journey file matched historical blob
`012399938c90facc3f66ede4ff61683a24d7f054` exactly. Four independent staging
seeds passed: the original audit rerun plus fresh attempts taking 1.0 minutes,
54.7 seconds, and 55.6 seconds. Every run used one worker, zero retries, and no
dependency projects.

The original held-response timeout therefore is not reproducible at the exact
legacy seam under the current browser lifecycle. WI-2842 AC-3 is not met.

## Invalid attempt withdrawn

An earlier mutation combined the legacy matcher with bare `route.continue()`.
That removed the historical URL continuation and created a synthetic timeout.
Codex review thread `PRRT_kwDORREiyc6T6TVe` identified the mismatch. The timeout
is withdrawn and must not be cited as red-green-revert evidence.

## Restoration

Both product files were restored byte-for-byte:

```text
returning-learner-resume.spec.ts 5ff958fb735af0c22481b91e7935d5b5a1c75295
held-now-request.ts              ddecb0e004b2926acf5c80cd414df7d08c1b299d
```

`git diff --quiet` passed for both paths. No product source change remains.
