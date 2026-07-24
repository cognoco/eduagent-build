# WI-2187 — Owner-global Account settings identity verification

## Reported defect exercised

The named defect case is **owner-global rows stay labelled Owner while learner
rows follow the exact authorized V2 person scope**. The regression renders the
Account administration sheet with an owner session and an authorized learner
person scope, then observes the visible and accessible mutation targets and the
learner-specific destinations.

The review-correction case is **a live external supportership person, or a
managed-child person in a Study context without the child-editor route gate,
must not receive learner rows whose destinations reject the edit**. The
production scope API includes every live supportee at
`apps/api/src/services/scope-resolution.ts:36`, while the Account sheet now
requires the selected person to appear in the navigation contract's linked
child IDs and to be editable under the same route gates as the destinations at
`apps/mobile/src/components/account/AccountAdminSheet.tsx:51`. The sheet consumes
the contract's public `canEnter` boundary; its linked-child route decision is
implemented at `apps/mobile/src/lib/navigation-contract.ts:457` and
`apps/mobile/src/lib/navigation-contract.ts:477`. The exact
external-supportee and route-gate regressions start at
`apps/mobile/src/components/account/AccountAdminSheet.test.tsx:213` and
`apps/mobile/src/components/account/AccountAdminSheet.test.tsx:247`.

The production scope resolver is at
`apps/mobile/src/components/account/AccountAdminSheet.tsx:39`, and the exact
regression starts at
`apps/mobile/src/components/account/AccountAdminSheet.test.tsx:289`.

## Executed RED → GREEN → production-only revert RED → restore GREEN

The Account administration regression file remained present and unchanged in
all four phases. The revert phase removed only the production diff, and the
restore phase reapplied that exact production diff.

| Phase | Production state | Exact captured output |
| --- | --- | --- |
| RED | Baseline production with the new regression | Exit 1; 1 suite failed; 1 test failed, 4 passed, 5 total. The named case expected the Notifications accessibility label to contain `Owner` and received `Notifications`. |
| GREEN | Account-scope production fix restored | Exit 0; 1 suite passed; 6 tests passed, 6 total. The named case passed together with owner gating, routing, and sign-out coverage. |
| Production-only revert RED | Final seven-test regression set retained while the production diff was removed | Exit 1; 1 suite failed; 5 tests failed, 2 passed, 7 total. The named case again expected `Owner` and received `Notifications`. |
| Restore GREEN | The exact saved production diff was restored | Exit 0; 1 suite passed; 7 tests passed, 7 total. The named case, non-owner direct-entry guard, stale-scope guard, persisted-scope loading guard, and route cases all passed. |

This sequence exercises the reported identity defect itself. It does not use a
generic smoke result as a substitute for the owner-global-versus-authorized-
learner assertion.

## Review correction — external supportee and Study-context route gate

The two correction regressions remained present and unchanged in all four
phases. The production-only revert removed only the managed-child and route-gate
check from `AccountAdminSheet.tsx`; restoring reapplied that exact production
diff.

| Phase | Production state | Exact captured output |
| --- | --- | --- |
| RED | Pre-correction PR production with both new regressions | Exit 1; 1 suite failed; 2 tests failed, 7 passed, 9 total. The live external supportee and the managed child without editor gates both still rendered `account-admin-learning-preferences`. |
| GREEN | Minimal managed-child plus destination-gate check applied | Exit 0; 1 suite passed; 9 tests passed, 9 total. Both named cases withheld all three learner rows while owner-global rows remained owner-labelled. |
| Production-only revert RED | Both correction tests retained; only the production check removed | Exit 1; 1 suite failed; the same 2 tests failed, 7 passed, 9 total, at the same learner-row assertion. |
| Restore GREEN | Exact production correction restored | Exit 0; 1 suite passed; 9 tests passed, 9 total. |

This sequence exercises the reported external-supportee and Study-context dead
affordances themselves. No existing Playwright fixture seeds a supportership
person outside the Clerk account's managed profile list, so no adjacent browser
spec is presented as proof of this defect; the required PR smoke remains a
separate CI gate.

## Acceptance-criteria evidence

### AC-1 — Owner-global rows and leaves identify the owner

- `apps/mobile/src/components/more/settings-rows.tsx:24` constructs visible and
  accessible row labels from the exact target identity;
  `apps/mobile/src/components/more/settings-rows.test.tsx:54` and
  `apps/mobile/src/components/more/settings-rows.test.tsx:72` execute the row and
  toggle variants.
- `apps/mobile/src/components/account/AccountAdminSheet.tsx:168` binds owner-only
  Account, security, notification, privacy, support, and sign-out rows to the
  owner display name. The mixed owner/learner assertion is executable at
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:289`.
- `apps/mobile/src/components/account-security.tsx:42` includes the owner name in
  each security mutation's accessible name;
  `apps/mobile/src/components/account-security.test.tsx:61` executes all three
  security rows.
- `apps/mobile/src/components/account-security.tsx:47` constrains long or
  large-font identity text to a shrinking column and keeps the indicator fixed;
  the extreme localized-name regression is executable at
  `apps/mobile/src/components/account-security.test.tsx:78`.

### AC-2 — Direct Mentor language and exact owner request identity

- `apps/mobile/src/components/account/AccountAdminSheet.tsx:149` routes Mentor
  language directly to the intended picker with the authorized learner ID;
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:289` executes the
  first learner route, scope-change route, and owner route without a duplicate
  Account hop.
- `apps/mobile/src/app/(app)/more/account.tsx:111` labels the owner Mentor-language
  row and routes directly to the picker;
  `apps/mobile/src/app/(app)/more/account.test.tsx:218` executes that route.
- `apps/mobile/src/app/(app)/more/notifications.tsx:32` selects the owner target
  displayed on every global notification mutation;
  `apps/mobile/src/app/(app)/more/notifications.test.tsx:240` executes all rows.
- `apps/mobile/src/hooks/use-settings.ts:306` sends the captured profile identity
  as the request header, with exact header assertions at
  `apps/mobile/src/hooks/use-settings.test.ts:144` and
  `apps/mobile/src/hooks/use-settings.test.ts:204`.

### AC-3 — Learner ID plus live authorization; deep links fail closed

- `apps/mobile/src/components/account/AccountAdminSheet.tsx:41` authorizes a
  learner only when both person ID and edge ID match the live scope list, and
  `apps/mobile/src/components/account/AccountAdminSheet.tsx:51` additionally
  requires an account-managed child plus both destination editor gates before
  emitting learner mutations. Direct non-owner/proxy, stale-scope, live
  external-supportee, Study-context route-gate, and loading cases execute at
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:172`,
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:192`,
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:213`,
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:247`, and
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:273`.
- `apps/mobile/src/app/(app)/more/accommodation.tsx:45` requires owner role plus a
  live child profile before sending `childProfileId`, and
  `apps/mobile/src/app/(app)/more/accommodation.tsx:68` redirects unauthorized
  direct links before rendering mutation controls. Cached non-owner and stale
  deep links execute at
  `apps/mobile/src/app/(app)/more/accommodation.test.tsx:425` and
  `apps/mobile/src/app/(app)/more/accommodation.test.tsx:447`.
- `apps/mobile/src/app/(app)/more/mentor-language.tsx:40` applies the same owner
  plus live-child authorization before the guardian write, and
  `apps/mobile/src/app/(app)/more/mentor-language.tsx:54` fails unauthorized
  child links closed. Exact guardian request identity, non-owner, stale-link, and
  child-back cases execute at
  `apps/mobile/src/app/(app)/more/mentor-language.test.tsx:147`,
  `apps/mobile/src/app/(app)/more/mentor-language.test.tsx:221`,
  `apps/mobile/src/app/(app)/more/mentor-language.test.tsx:236`, and
  `apps/mobile/src/app/(app)/more/mentor-language.test.tsx:265`.

### AC-4 — Cross-mutation, scope-change, navigation, and request regressions

- `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:289` exercises
  owner-global and learner-specific rows in the same rendered scope and changes
  from one authorized learner pair to another without cross-attribution.
- `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:213` and
  `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:247` exercise
  live supportership and route-gate variants without exposing dead learner
  affordances.
- `apps/mobile/src/components/account/AccountAdminSheet.test.tsx:340` executes all
  existing Account destinations, while
  `apps/mobile/src/app/(app)/more/accommodation.test.tsx:466` and
  `apps/mobile/src/app/(app)/more/mentor-language.test.tsx:252` execute back-stack
  and deterministic fallback navigation.
- `apps/mobile/src/app/(app)/more/notifications.test.tsx:240` executes visible and
  accessible owner identity on each global notification mutation, and
  `apps/mobile/src/hooks/use-settings.test.ts:144` executes the exact request
  identity emitted by notification writes.
- `apps/mobile/src/components/account-security.test.tsx:78` keeps extreme owner
  names and large-font wrapping from displacing the row indicator.

## Corrective-slice TDD and validation

The long-owner layout case at
`apps/mobile/src/components/account-security.test.tsx:78` was added before the
layout change. Its RED result was exit 1 with 1 failed and 9 skipped tests because
the shrinking label column was absent. After the constraints at
`apps/mobile/src/components/account-security.tsx:47` and
`apps/mobile/src/components/account-security.tsx:58`, the unchanged case was
GREEN with 1 passed and 9 skipped tests.

Final validation against the complete corrective candidate produced:

- focused identity, authorization, route, request, and layout regressions: 8
  suites passed; 96 tests passed;
- the complete mobile Jest project: 485 suites passed; 5,860 tests passed;
- mobile typecheck and all six dependency targets: successful;
- full mobile lint: successful with 0 errors and the existing 51-warning
  baseline; no warning points at the corrective files;
- repository package format checks and explicit formatting checks for every
  changed source, test, evidence, and completion file: successful;
- the repository pre-push TypeScript build and diff whitespace check:
  successful; and
- the read-only completion preflight: all four summary sections, all trip-wire
  checks, manifest presence, and AC coverage passed with no lifecycle write.

The available runtime was Node 24.18.0 with pnpm 10.19.0 while the repository
declares Node 22.x. The successful public-seam tests, full mobile project,
typecheck, lint, format, and pre-push build provide no indication that the engine
warning affected this change. The mobile runner's existing open-handle warning
appeared after all suites passed and was unchanged by this item.
