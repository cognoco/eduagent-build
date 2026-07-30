## Summary

- replace the unconditional family-intent child-profile redirect with a durable
  Me-or-someone-else onboarding fork
- keep the fork non-authorizing while routing credentialed learners to the
  existing invitation form and explicitly gating the unavailable managed path
- restore pending setup across remount/relaunch and clear it only after the
  selected destination mounts or on sign-out
- add focused mobile coverage, translated copy, and a preview browser journey

## Verification

- six focused mobile suites: 267 tests passed
- full mobile unit suite: passed
- full API unit suite under Doppler `dev`: passed
- TypeScript build and i18n/clinical-copy/test-only-export ratchets: passed
- touched-file ESLint with `--max-warnings=0`: passed
- publication-review regressions: focused RED-to-green coverage passed
- preview Playwright journey: passed in 1.7 minutes

## Collision note

BID-33 PR #2692 is incorporated from authoritative main with both locale key
families retained. WI-2231 PR #2704 remains an unlanded collision watch and
must be reconciled from authoritative main if it lands before this branch.

Refs: WI-2532
