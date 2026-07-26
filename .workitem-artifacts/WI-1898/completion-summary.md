## What was done

Reworked the two accusatory or underspecified learner-facing safety fallbacks identified by the deterministic exchange-path audit, while preserving every existing safety decision and fail-open rule.

## What changed

The suitability soft block now uses a neutral reset and offers three constructive learning paths. The sexual-content-minor tripwire now declines only the unsafe content, offers age-appropriate adjacent topics, and retains a non-blaming trusted-adult route. Regression coverage now pins both messages, verifies image-screening recovery remains non-blaming, proves raw judge/provider errors stay out of learner replies, and asserts the structured unavailable-judge alarm contains metadata only.

## Verification

The test-first RED run failed only the two intended copy assertions (140 of 142 tests already passed). Final focused verification passed 170 of 170 tests across suitability, catastrophic tripwire, dangerous-procedure, and exchange-alarm suites. The full API unit run passed 495 of 495 suites and 9,764 tests, with 9 skipped, before the review-only route assertion was added. API typecheck passed; API lint passed with zero errors (55 pre-existing warnings); changed-file Prettier and `git diff --check` passed. Independent adversarial review found no merge-blocking defect and confirmed that no safety gate, threshold, allowlist, flag, or routing behavior changed.

## Caveats / Follow-ups

The full API integration command was executed directly because the repository's Doppler wrapper is a no-op on Windows. It reached existing identity and retention suites but failed because Orion's shared test database is behind the current schema (`subscription.past_due_at` and `retention_cards.last_recall_feedback` are absent). This item does not touch those tables or suites, and no shared-database migration was attempted. Rephrase actions and block-to-rephrase observability remain owned by WI-2115.
