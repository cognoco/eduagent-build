# Store Submission

Operator path for the Config-T production build and first store submissions. This runbook does not authorize a build or upload by itself.

## Gate

Credential provisioning was completed under **OPQ-37** on 2026-07-27. Do not merge the Config-T production flag change, change the production Doppler flag triple, trigger a production build, or submit to a store until **OPQ-155** records product approval of the Config-T store candidate.

Before that ruling, agents may refresh the branch and run static, unit, export, and configuration checks needed to present a current candidate. OPQ-155 is the current authority home for the V0-retirement ruling required by the mentor-is-the-app spec section 13 S6 gate and the M6 product go-ahead; approval does not itself build, upload, or release the app.

The committed Android profile targets **Play internal** testing. The iOS profile relies on EAS-managed App Store Connect credentials and targets TestFlight through the normal EAS submit path. No Apple identifier or private key belongs in `eas.json`.

## Credential Preparation

The approved secret provider must inject `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`; the value must be the complete Google service-account JSON object. With the value stored in Doppler production, materialize the ignored file without printing the secret:

```powershell
doppler run -c prd -- pnpm mobile:submit:prepare
git check-ignore apps/mobile/.eas-submit/google-play-service-account.json
```

The materializer validates the credential shape, writes mode `0600`, and exits without writing when the value is missing or malformed. POSIX systems enforce that mode. Windows does not enforce POSIX read permissions, so the helper emits a warning; restrict the file to the current operator and inspect the resulting ACL before submission:

```powershell
$credentialPath = 'apps/mobile/.eas-submit/google-play-service-account.json'
$principal = "$env:USERDOMAIN\$env:USERNAME"
icacls $credentialPath /inheritance:r /grant:r "${principal}:(R,W)"
icacls $credentialPath
```

Stop if any unapproved principal retains access. Never paste the JSON into a shell argument, `eas.json`, an environment file, a CI log, or a pull request.

## Preflight

Run from the repository root unless the command starts with `cd apps/mobile`:

```powershell
pnpm check:mode-nav-flag-combo
pnpm exec jest --config scripts/jest.config.cjs scripts/prepare-eas-submit-credentials.test.ts --runInBand --no-coverage
git status --short
cd apps/mobile
eas build:list --platform android --limit 3
eas build:list --platform ios --limit 3
```

The production profile must classify as Config T: V0 off, V1 on, V2 on. Stop if the worktree is dirty, OPQ-155 is not approved, a production build already covers the intended commit, or the credential path is absent/ignored incorrectly. The production Doppler flag triple must also be aligned to Config T before running `pnpm env:sync`; otherwise that sync will restore V0 and invalidate the candidate.

## Build

After approval, trigger exactly one production build for the required platform or `all` when both stores are ready:

```powershell
cd apps/mobile
eas build --platform all --profile production --non-interactive
```

Record each build ID, commit, profile, flag classification, and link. Verify the installed candidate against the production API and the Config-T shell before submission. Use that recorded build ID for submission; never select a candidate by recency.

## Internal Submission

Android's `track: internal` is the dry-run destination; it is a real upload to Play internal testing, not a no-op command:

Google Play requires the first AAB for a new app to be uploaded manually before
API-based submission can take over. For MentoMate, verify the existing app bundle
and version in Play Console before running `eas submit`; that existing bundle is
the bootstrap upload. If a future app has no bundle listed, upload its first AAB
manually in Play Console and complete the release setup there before using this
command.

```powershell
cd apps/mobile
eas submit -p android --profile production --id <android-build-id> --non-interactive --wait
```

Confirm the submission succeeds and the build appears on Play internal testing before promoting any release.

For iOS, submit the verified production build to TestFlight:

```powershell
cd apps/mobile
eas submit -p ios --profile production --id <ios-build-id> --non-interactive --wait
```

Confirm processing in App Store Connect and add only approved internal TestFlight groups.

## Failure And Rollback

- Do not retry a failed build or submission until the failure is diagnosed.
- If credential validation fails, replace the approved secret upstream and rematerialize; never edit the generated file.
- If Config T fails candidate verification, stop submission and rebuild from the approved fallback or reverted production flag commit. Build-time flags cannot be repaired by changing a runtime database value.
- Remove the local credential after submission evidence is recorded. Keep only build/submission IDs, timestamps, commit, profile, track, and status.
