## Summary

- replace the unconditional family-intent child-profile redirect with a durable
  Me-or-someone-else onboarding fork
- keep the fork non-authorizing while routing credentialed learners to the
  existing invitation form and explicitly gating the unavailable managed path
- restore pending setup across remount/relaunch; Me durably clears before
  synchronous `onComplete` mounts/reveals the learner shell, and the
  existing-account destination clears after its real route mounts (V2
  invitation form or older-shell unavailable gate)
- preserve shell-aware completion after durable persistence: V2 lands at Mentor
  and older shells retain Home, including the marker-only retry path
- add focused mobile coverage, translated copy, and a preview browser journey

## Verification

- merge-forward union: thirteen suites, 470 tests passed
- full mobile unit suite: passed
- full API unit suite under Doppler `dev`: passed
- TypeScript build and i18n/teen-consent/test-only-export/GC1 ratchets: passed
- touched-file ESLint with `--max-warnings=0`: passed
- exact candidate Prettier and `git diff --check`: passed
- publication-review regressions: focused RED-to-green coverage passed
- review hardening covers stale-read invalidation after sign-out, recovery-only
  primary repair, all-mode terminal marker consumption, and an inaccessible
  restore-probe navigator that retains requested route state
- preview Playwright journey: passed in 1.7 minutes

## Collision note

Publication merge-forward now incorporates authoritative main `23ef357b9`,
including landed WI-2231 PR #2704, WI-2399 PR #2722, and WI-1556 PR #2727.
WI-2532 retains the non-authorizing durable fork, no-PATCH/no-child-redirect
contract, retry journal, and all-mode terminal marker consumption while
adopting WI-2231's shell-aware completion routing. WI-2399's
resubmit-generation guards remain intact. A focused RED caught WI-1556's
first-Mentor language gate pre-empting the unresolved durable-state probe; the
gate now waits for family intent to resolve absent before it can render.

Refs: WI-2532
