## What was done

Completed the V2 Subjects release-proof coverage across browser and release-APK
journeys. The preserved implementation covers browse/search/no-results, exact
Subject Hub ownership, active-session resume, due review, recovery and
curriculum-preparing states, Android/browser Back ancestry, and first-subject
creation without duplicating the WI-2215 product path.

## What changed

- Added six bounded V2 Playwright cases using the established multi-subject,
  learning-active, retention-due, and onboarding-no-subject seeds.
- Registered three explicit V2 Maestro journeys for browse/resume, due review,
  and first-subject creation, with hard owner-bound assertions and a shared
  active-profile helper.
- Preserved exact Subject Hub ancestry through Topic and Session transitions,
  including Android hardware Back, while rejecting crafted or mismatched
  return provenance.
- Kept paused and archived Subjects visible for management while withholding
  every learning, curriculum-generation, and retry action.
- Added component, hook, navigation, and structural mutation coverage for the
  contracts exercised by the end-to-end journeys.

## Verification

After normally integrating the latest `origin/main`, Jest reported 15/15
directly affected suites and 394/394 assertions, the WI-2238 structural gate
reported 5/5 cases, the Maestro validator reported 7/7 checks, TypeScript built
cleanly, and the V2 Playwright catalog listed all expected cases. The canonical
serialized mobile run reported 515/515 suites and 6,806/6,806 assertions in
331.19 seconds. Changed-file Prettier and diff integrity passed; ESLint
reported zero errors and one inherited warning on an unchanged May line.
Exact-head hosted browser, release-APK, CI, and review receipts will be attached
to the Work Item before governed landing.

## Caveats / Follow-ups

The release-APK workflow is intentionally required again at the newly
published exact head because its older diagnostic failures predated the landed
WI-2836 PowerShell portability repair. No schema, external API, deployment, or
data migration is part of this item. Rollback is a commit revert.
