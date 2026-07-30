## Summary

- replace the unconditional family-intent child-profile redirect with a durable
  Me-or-someone-else onboarding fork
- keep the fork non-authorizing while routing credentialed learners to the
  existing invitation form and explicitly gating the unavailable managed path
- restore pending setup across remount/relaunch and clear it only after the
  selected destination mounts or on sign-out
- add focused mobile coverage, translated copy, and a preview browser journey

## Verification

- six focused mobile suites: 263 tests passed
- full mobile unit suite: passed
- full API unit suite under Doppler `dev`: passed
- TypeScript build and i18n/clinical-copy/test-only-export ratchets: passed
- touched-file ESLint: 0 errors (one pre-existing duplicate-dependency warning)
- preview Playwright journey: passed in 1.7 minutes

## Collision note

BID-33 PR #2692 touches the same locale files and generated baseline but adds a
separate key namespace. This branch was refreshed from current `origin/main`
and the source baseline was regenerated from source at publication time.

Refs: WI-2532
