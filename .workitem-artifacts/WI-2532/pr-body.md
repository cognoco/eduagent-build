## Summary

- replace the unconditional family-intent child-profile redirect with a durable
  Me-or-someone-else onboarding fork
- keep the fork non-authorizing while routing credentialed learners to the
  existing invitation form and explicitly gating the unavailable managed path
- restore pending setup across remount/relaunch; Me durably clears before
  synchronous `onComplete` mounts/reveals the learner shell, and the
  existing-account destination clears after its real route mounts (V2
  invitation form or older-shell unavailable gate)
- add focused mobile coverage, translated copy, and a preview browser journey

## Verification

- six focused mobile suites: 267 tests passed
- full mobile unit suite: passed
- full API unit suite under Doppler `dev`: passed
- TypeScript build and i18n/clinical-copy/test-only-export ratchets: passed
- touched-file ESLint with `--max-warnings=0`: passed
- publication-review regressions: focused RED-to-green coverage passed
- review hardening covers stale-read invalidation after sign-out, recovery-only
  primary repair, all-mode terminal marker consumption, and an inaccessible
  restore-probe navigator that retains requested route state
- preview Playwright journey: passed in 1.7 minutes

## Collision note

Publication merged authoritative main `47dd24d50` after a zero-overlap file-map
preflight. BID-33 PR #2692 remains incorporated with both locale key families
retained. WI-2231 PR #2704 remains open and unlanded at `2602ee46`; its
create-profile changes are therefore not incorporated into this branch.

Refs: WI-2532
