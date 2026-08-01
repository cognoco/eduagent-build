## What was done

Made the payment-failed alert integration fixture derive its subscription
period end from the test run instead of treating 2026-08-01 as permanently in
the future.

## What changed

The suite now creates one period-end instant seven days ahead of module
evaluation, reuses it when inserting and resetting the subscription, and
asserts the emitted billing-card deadline against that exact instant. No
production source, schema, environment, or billing behavior changed.

## Verification

GitHub Actions runs 30653298824 and 30687802948 reproduced the rollover: both
normal and identity-v2 API integration lanes reached the payer-card assertion
after the fixed deadline had expired. Targeted lint, formatting, and diff
validation pass for the corrected fixture. The focused real-database suite and
both CI variants must pass on the exact PR head before governed landing.

## Caveats / Follow-ups

Local databases on this host are not at the current identity schema, so the
real-database green proof is intentionally delegated to the repository's
ephemeral CI database rather than mutating a shared or stale local target.
No further date-fixed occurrence remains in the affected test file.
