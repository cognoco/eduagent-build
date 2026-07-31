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
- producer-local historical full-mobile run on code candidate `c7504d9f`: 524
  suites / 6,955 tests passed with zero failures; its untracked ephemeral log
  is not revision-exact closure evidence, so exact-head hosted and landed
  verification must re-establish the applicable mobile gates
- full API unit suite under Doppler `dev`: passed
- post-merge affected API unit coverage under Doppler `dev`: 3 suites /
  203 tests passed
- latest-main provider and change-class coverage: 7/7 and 56/56 passed;
  integration typecheck passed across 72 Jest-selected roots; Tier-1 LLM eval
  rewrote 528 snapshots with zero tracked drift
- main-identical metering integration on Orion's pre-repoint development
  database: 4/4 red at
  `quota_pools_subscription_id_subscriptions_id_fk`; known M-REPOINT baseline
  canonically deduplicated to WI-2633 (pre-repoint metering integration
  baseline), comment `3ae8bce9-1f7c-810b-9cdb-001de1216c1d`, and not claimed
  green
- the rejected pre-push shared-staging marker occurrence is canonically
  recorded on WI-2806 (env-sync staging markers), comment
  `3ae8bce9-1f7c-81a4-8f2c-001d09566bd9`; it made no network update
- main-identical Windows harness findings are captured for independent
  delivery, not patched here: WI-2950 (deploy-smoke fake-curl Bash PATH on
  Windows; local suite 4/24 passed) and WI-2951 (integration-typecheck checker
  pnpm.cmd resolution; local suite 2/4 passed). Both are mechanically DoR-green
  Ready/Active and formally admitted to BID-49; refine comments
  `3ae8bce9-1f7c-819e-88da-001dabeaa675` and
  `3ae8bce9-1f7c-81c4-aa2d-001d82e2d8ad`
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

Publication merge-forward now incorporates authoritative main `88d349973`,
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
The next zero-direct-overlap merge incorporates WI-2947 (staging smoke after
deploy) PR #2747, WI-2740 (Mistral EU endpoint) PR #2742, and WI-2578 (Jest
integration-source typecheck) PR #2734. Applicable gates passed; its
main-identical Windows harness findings are captured as WI-2950 and WI-2951.

Refs: WI-2532
