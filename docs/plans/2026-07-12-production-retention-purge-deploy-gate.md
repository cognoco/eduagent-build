# WI-1194 production retention purge deploy gate

## Goal

Prevent a production API deployment from silently regressing the confirmed transcript-purge configuration to disabled or missing.

## Success criteria

- The production deploy path reads `RETENTION_PURGE_ENABLED` from the selected Doppler config without printing its value.
- Production deploys fail before Worker secret sync and traffic switch unless the value is exactly `true`.
- Staging deploy behavior remains unchanged.
- A workflow-contract regression test pins the check and its ordering.

## Scope boundary

This slice does not choose retention periods, age out persistent quotes, or define dormancy behavior. Those remain blocked on the counsel schedule in OPQ-24.

## Verification

1. Add the workflow-contract assertion and retain the expected red result.
2. Add the production-only check to the existing secret-sync step.
3. Run the focused scripts test, workflow security check, and complete scripts test project.
