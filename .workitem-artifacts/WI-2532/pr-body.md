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
- post-merge affected API unit coverage under Doppler `dev`: 3 suites /
  203 tests passed
- main-identical metering integration on Orion's pre-repoint development
  database: 4/4 red at
  `quota_pools_subscription_id_subscriptions_id_fk`; known M-REPOINT baseline
  canonically deduplicated to WI-789 (post-cutover CI repoint baseline) /
  WI-805 (quota-satellite FK rehome) and not claimed green
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

Publication merge-forward now incorporates authoritative main `59906b359`,
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
The later zero-direct-overlap API merge also incorporates WI-2944 (established
test-seed profile confirmation) PR #2743 and WI-2653 (credentialed non-owner
self-write authority) PR #2739. The mobile union remained green and affected API units passed;
the pre-repoint metering integration baseline is recorded above without any
unrelated WI-2532 patch.
The subsequent zero-direct-overlap merge incorporates WI-2737 (learner PII
egress filtering) PR #2745; its affected API unit set passed 3 suites / 40
tests under Doppler `dev`.

Refs: WI-2532
