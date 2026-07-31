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

- merge-forward union: fourteen suites, 472 tests passed
- full mobile unit suite on exact code candidate `c7504d9f`: 524 suites /
  6,955 tests passed, zero failures (durable local log:
  `.artifacts/full-mobile-c750.err`)
- full API unit suite under Doppler `dev`: passed
- TypeScript build and i18n/teen-consent/test-only-export/GC1 ratchets: passed
- touched-file ESLint with `--max-warnings=0`: passed
- exact candidate Prettier and `git diff --check`: passed
- publication-review regressions: focused RED-to-green coverage passed
- review hardening covers stale-read invalidation after sign-out, recovery-only
  primary repair, all-mode terminal marker consumption, and an inaccessible
  restore-probe navigator that retains requested route state
- pre-WI-1556 preview journey: historical diagnostic only; final attributable
  E2E evidence must come from the published exact head

## Collision note

Publication merge-forward now incorporates authoritative main `704112725`,
including landed WI-2231 PR #2704, WI-2399 PR #2722, WI-1556 PR #2727,
WI-2639 PR #2730, WI-2820 PR #2713, and WI-2790 PR #2733. WI-2532 retains the
non-authorizing durable fork, no-PATCH/no-child-redirect contract, retry
journal, and all-mode terminal marker consumption while adopting WI-2231's
shell-aware completion routing. WI-2399's resubmit-generation guards and
WI-2820's test-seed batching remain intact. A focused RED caught WI-1556's
first-Mentor language gate pre-empting the unresolved durable-state probe; the
gate now waits for family intent to resolve absent before it can render.
Independent exact-head review then caught the same gate pre-empting a restored
invitation replay. The handoff now stays pending after the push until the
terminal route is observed, and the terminal route itself suppresses the
language gate through destination mount and marker consumption.

Refs: WI-2532
