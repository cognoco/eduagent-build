# Agent 1 - Auth, Account, Consent Checkpoint

Date: 2026-05-22
Branch/SHA: `i18n-translations` @ `ae5cacc8a`
API target: `https://api-stg.mentomate.com`
Preview: `http://127.0.0.1:19006`
Agent scope: AUTH-01..AUTH-14; ACCOUNT-01, ACCOUNT-03, ACCOUNT-19..ACCOUNT-24, ACCOUNT-26, ACCOUNT-28/29 if reachable.

## Runtime Coverage

| Row | Coverage | Evidence / Result |
| --- | --- | --- |
| AUTH-01 | Anonymous web preview | `/` and `/sign-in` load the shared sign-in gate with first-time student-safe copy and no app shell exposure. |
| AUTH-02 | Anonymous web preview | Filed bug: email sign-up stalls after submit and never reaches verification. |
| AUTH-03 | Blocked by AUTH-02 | Verification cannot be reached from the tested new-user sign-up path. |
| AUTH-04 | Existing blocker | Existing Notion bug covers seeded web sign-in returning to sign-in with session-expired banner. I did not rerun full authenticated setup in parallel. |
| AUTH-05 | Code/E2E inspection only | MFA/additional verification branches exist, but E2E flow is explicitly blocked pending Clerk MFA seed/test token. |
| AUTH-06 | Anonymous + seeded forgot-password web check | Filed bug: reset request enters indefinite spinner for a seeded Clerk test account. Nonexistent account path correctly shows `Couldn't find your account.` |
| AUTH-07 | Anonymous web preview | Sign-in -> sign-up and sign-in -> forgot navigation work; sign-up and forgot submit paths have separate blockers above. |
| AUTH-08 | Anonymous web preview + E2E inspection | Google SSO button visible on web. Apple is iOS-only; OpenAI is config-gated. Full OAuth not run. |
| AUTH-09 | Direct callback web check + E2E inspection | `/sso-callback` shows `Finishing sign-in...`; after 10s `Back to sign in` appears and returns to sign-in. |
| AUTH-10 | Code/E2E inspection only | Sign-out is implemented from More and consent pending/withdrawn gates; post-auth runtime blocked by AUTH-04. |
| AUTH-11 | Existing blocker/code inspection | Existing AUTH-04 shows session-expired banner during sign-in failure. Forced expiry requires Clerk/token hook, not rerun. |
| AUTH-12 | Anonymous web preview + E2E inspection | Clean-state sign-in shows `Welcome to MentoMate`; returning-user copy needs signed-in/previous-state setup. |
| AUTH-13 | Anonymous web direct-route check | Signed-out `/library` and `/progress` redirect to sign-in with `redirectTo` params. Post-sign-in restoration blocked by AUTH-04. |
| AUTH-14 | Code inspection only | Transition spinner/stuck fallback testIDs and timeout logic are present; true setActive transition blocked by AUTH-04. |
| ACCOUNT-01 | Blocked | First profile creation from real new sign-up is blocked by AUTH-02. Direct `/create-profile` while signed out correctly redirects to sign-in. |
| ACCOUNT-03 | Anonymous preview web | Filed bug: pre-sign-up `Both` setup choice opens unmatched `/preview/both`. `Me`, `My child`, and `Not sure` preview paths are valid. |
| ACCOUNT-19 | Direct-route web check | Filed bug: `/consent?profileId=...` renders parent-email consent form while signed out. |
| ACCOUNT-20 | E2E/source inspection only | Hand-to-parent consent flow exists and is covered by `hand-to-parent-consent.yaml`, but runtime is blocked by sign-in/new-profile blockers. |
| ACCOUNT-21 | E2E/source inspection only | Parent email/resend/change email controls exist in consent screen/gates; source also has same-email guard, with separate existing CR issue for hydration-window bypass. |
| ACCOUNT-22 | E2E/source inspection only | Pending gate blocks tabs, has check-again, preview browse/sample coaching, and sign-out. Runtime sign-in into seeded pending account blocked by AUTH-04. |
| ACCOUNT-23 | E2E/source inspection only | Withdrawn gate blocks tabs and provides sign-out/switch-profile recovery where available. Runtime sign-in blocked by AUTH-04. |
| ACCOUNT-24 | E2E/source inspection only | Post-approval landing exists with one-time dismissal. Runtime sign-in blocked by AUTH-04. |
| ACCOUNT-26 | E2E/source inspection only | Under-13 and under-16 consent E2E flows exist; current implementation is GDPR-everywhere under 16. Runtime sign-in/profile creation blocked. |
| ACCOUNT-28 | Not reachable in current preview | App language row is behind `FEATURE_FLAGS.I18N_ENABLED`; flow notes flag is disabled in production/current config. |
| ACCOUNT-29 | Source inspection only | More -> `Mentor language` routes to Account/Profile, not a separate identity; runtime blocked by AUTH-04. |

## Filed / Referenced Notion Bugs

- `[AUTH-02] Email sign-up never reaches verification on web` - https://www.notion.so/3688bce91f7c8132abfef344c1b4acbf
- `[AUTH-06] Forgot-password reset request can spin indefinitely` - https://www.notion.so/3688bce91f7c8181a608c5819fa42c4f
- `[ACCOUNT-03] Preview Both setup choice opens unmatched route` - https://www.notion.so/3688bce91f7c8138a902ee7fb89fbc3a
- `[ACCOUNT-19] Consent route renders parent-email form while signed out` - https://www.notion.so/3688bce91f7c819e82f9c91d8e86abe8
- Existing blocker reused: `[AUTH-04] Web email sign-in returns to sign-in with session-expired banner` - https://www.notion.so/3688bce91f7c81818b81c045870cfedd

## Artifacts

- `docs/flows/plans/student-flow-revision-checkpoints/artifacts/agent1-auth02-signup-stuck.png`
- `docs/flows/plans/student-flow-revision-checkpoints/artifacts/agent1-auth06-forgot-password-seeded.png`
- `docs/flows/plans/student-flow-revision-checkpoints/artifacts/agent1-account03-preview-both-dead-end.png`
- `docs/flows/plans/student-flow-revision-checkpoints/artifacts/agent1-account19-consent-unauthenticated.png`

## Blockers / Skips

- Did not run full authenticated Playwright setup or full E2E suites, per coordinator instruction.
- Did not use emulator/native paths. OAuth happy path, SSO user cancel, native date picker consent creation, and MFA branches remain native/auth-infra dependent.
- Authenticated account/profile/consent runtime checks are blocked by AUTH-04 after seeded sign-in and AUTH-02 for new-user sign-up.
