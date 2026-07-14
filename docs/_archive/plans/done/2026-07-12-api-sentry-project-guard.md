# WI-1920 API Sentry project guard

## Goal

Prevent the API Worker secret-sync path from uploading a Sentry DSN that belongs to a non-API Sentry project.

## Success criteria

- A regression test rejects the known mobile-project DSN and accepts the API-project DSN without exposing real secret keys.
- The Doppler-to-Worker sync fails before `wrangler secret bulk` when `SENTRY_DSN` targets the wrong project.
- Validation output identifies only the environment and expected/actual project IDs, never the DSN or public key.
- Existing secret-sync and deployment-order coverage remains green.

## File map

- `scripts/sync-secrets.test.ts` — red/green project-identity cases.
- `scripts/sync-secrets.js` — pure DSN project parser and pre-upload invariant.
- `docs/runbooks/sentry-launch-alerting.md` — routing invariant and recovery procedure.

## Verification

1. Run the focused test before implementation and retain the expected failure.
2. Implement the pre-upload check and rerun the focused test.
3. Run secret-sync and deployment-workflow regression suites.
4. Run repository change-class validation before commit.

## External remainder

OPQ-88 owns correction of the staging Doppler value and the post-deploy Sentry routing proof. No secret value is changed by this code slice.
