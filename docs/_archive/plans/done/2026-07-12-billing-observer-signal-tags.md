# WI-1917 billing observer signal tags

## Goal

Give each launch-health billing observer a stable, PII-free Sentry `signal` tag so alert rules can distinguish the four bucket-1 failure types.

## Success criteria

- Payment failures emit `surface=billing`, `signal=payment-failed` after event validation and include no account, subscription, payer, or learner values.
- Delivery, missing-period-end, and trial-expiry observers add their specified distinct signal tags without weakening existing context or schema guards.
- Unit coverage asserts exact signal values and the payment-failure privacy boundary.
- The launch-health runbook names the real four Sentry filters.

## Verification

1. Add the signal/privacy assertions and retain the expected red result.
2. Add only the four signal emissions/tags and run the focused suites green.
3. Run API typecheck, lint, and the relevant API test class.

## External remainder

Replacing the deployed Sentry rules after staging deployment is console work and remains in the operator lane.
