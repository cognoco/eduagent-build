# Store Submission

Operator path for the Config-T production build and first store submissions. This runbook does not authorize a build or upload by itself.

## Gate

Credential provisioning was completed under **OPQ-37** on 2026-07-27. **OPQ-155** establishes that MentoMate is Android-only. Do not change the production Doppler flag triple, trigger a production build, or submit to Google Play unless the Config-T product gate is satisfied.

Before that ruling, agents may refresh the branch and run static, unit, export, and configuration checks needed to present a current candidate. OPQ-155 is the current authority home for the V0-retirement ruling required by the mentor-is-the-app spec section 13 S6 gate and the M6 product go-ahead; approval does not itself build, upload, or release the app.

The committed Android profile targets **Play internal** testing. This runbook covers Android only; it does not authorize a public Play release.

## Credential Preflight

Android submission uses the EAS-managed Google Play service account assigned to
the app for `com.mentomate.app` under **OPQ-37**. Keep
`serviceAccountKeyPath` out of `eas.json`: setting it forces EAS to read local
material and prevents managed-key resolution.

Before submission, run the metadata-only preflight. It checks assignment without
printing or creating credential material, and fails closed when the key is absent
or unassigned:

```powershell
doppler run -c prd -- pnpm mobile:submit:preflight
```

Stop on a preflight failure. Do not paste, materialize, rotate, or otherwise handle
the Google service-account JSON locally.

The retired materializer may have left a stale local credential on an existing
worktree. The preflight fails closed before its Expo request when it finds that
path. Delete only the stale local credential file, then verify it is absent
before rerunning the preflight:

```powershell
$credentialPath = 'apps/mobile/.eas-submit/google-play-service-account.json'
Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $credentialPath) {
  throw "Stale Google Play credential still exists at $credentialPath"
}
```

Do not print, copy, or stage its contents. The legacy directory remains ignored
only to prevent accidental staging while that cleanup happens.

## Preflight

Run from the repository root unless the command starts with `cd apps/mobile`:

```powershell
pnpm check:mode-nav-flag-combo
pnpm exec jest --config scripts/jest.config.cjs scripts/eas-managed-submit-profile-contract.test.ts scripts/verify-eas-managed-submit-credential.test.ts --runInBand --no-coverage
git status --short
cd apps/mobile
eas build:list --platform android --limit 3
```

The production profile must classify as Config T: V0 off, V1 on, V2 on. Stop if the worktree is dirty, OPQ-155 is not approved, a production build already covers the intended commit, or the managed-credential preflight fails. The production Doppler flag triple must also be aligned to Config T before running `pnpm env:sync`; otherwise that sync will restore V0 and invalidate the candidate.

## Build

After approval, trigger exactly one Android production build:

```powershell
cd apps/mobile
eas build --platform android --profile production --non-interactive
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
$androidBuildId = Read-Host 'Recorded Android build ID'
eas submit -p android --profile production --id $androidBuildId --non-interactive --wait
```

Confirm the submission succeeds and the build appears on Play internal testing before promoting any release.

For the completed WI-1341 internal submission, record only the Android production build `fd1b0e50` (STORE `1.0.1`, versionCode `2`) and Play internal submission `b3aebb23`. Those records prove internal-track delivery, not a public release.

## Failure And Rollback

- Do not retry a failed build or submission until the failure is diagnosed.
- If managed-credential preflight fails, stop before upload and have the authorized EAS administrator restore the app assignment; do not create a local credential file.
- If Config T fails candidate verification, stop submission and rebuild from the approved fallback or reverted production flag commit. Build-time flags cannot be repaired by changing a runtime database value.
- Keep only build/submission IDs, timestamps, commit, profile, track, and status; never retain credential material.
