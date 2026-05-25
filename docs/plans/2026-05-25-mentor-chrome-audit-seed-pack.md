# 2026-05-25 Mentor Chrome Audit Seed Pack

## Purpose

The Mentor Chrome audit in `docs/flows/plans/mentor-flow-revision-plan.md` reviewed 167 flows. Eighty-two rows were blocked because Chrome could not reach the required account, consent, billing, learning-history, or native/provider state from the available staging seeds.

This plan creates a deterministic seed pack for rerunning those blocked mentor flows from an end-user Chrome perspective.

## Shape Of Work

This should be one coordinated plan, not 13 independent plans.

Use one owning agent or engineer for the seed registry and shared conventions. If parallelized, split into five domain slices:

1. Auth/account state seeds.
2. Family/consent state seeds.
3. Billing/quota state seeds.
4. Rich child learning-history seed.
5. Interrupted/resumable activity seed.

Do not split one subagent per seed. The seeds share account setup, cleanup, Clerk user creation, subscription state, profile relationships, and Playwright helpers, so per-seed ownership would create naming and state drift.

## Existing Seed System

Seed implementation belongs in `apps/api/src/services/test-seed.ts`, which already backs the gated test-seed API. Relevant existing scenarios include:

| Existing scenario | Likely reuse |
| --- | --- |
| `pre-profile` | Starting point for first-profile/no-profile coverage, but verify it truly lands on first-profile creation in web. |
| `parent-solo` | Starting point for adult-without-children, but the 2026-05-25 Chrome audit observed unreliable child-style post-approval behavior. |
| `consent-pending` | Starting point for pending-consent gates and parent email flows. |
| `consent-withdrawn`, `consent-withdrawn-solo` | Starting point for withdrawn/denied consent gates. |
| `account-deletion-scheduled` | Starting point for scheduled deletion recovery. |
| `parent-with-weekly-report` | Starting point for weekly report detail. |
| `parent-subject-with-retention` | Starting point for subject retention badges/cards. |
| `parent-session-with-recap` | Starting point for recap detail and session recap. |
| `quota-exceeded`, `daily-limit-reached` | Starting point for quota/paywall states. |
| `subscription-family-active`, `subscription-pro-active` | Starting point for family/pro billing and max-profile states. |
| `quiz-*`, `dictation-*`, `review-empty` | Starting point for student-activity state, once Mentor route exposure is corrected. |

The first implementation step is to verify which existing scenarios already satisfy the mentor-audit contract and which need dedicated variants. Prefer extending or composing existing scenarios over creating duplicates with similar but subtly different data.

## Seed Registry Contract

Add or document a stable mentor audit registry. Use names that describe the test contract, not the implementation detail.

| Registry name | Backing scenario |
| --- | --- |
| `mentor-audit-empty-adult` | Existing `pre-profile` if it lands on first-profile creation; otherwise new scenario. |
| `mentor-audit-family-no-children` | Fixed `parent-solo` or new variant if current behavior remains child-style. |
| `mentor-audit-family-at-profile-limit` | New variant built from `subscription-family-active` or `subscription-pro-active`. |
| `mentor-audit-consent-pending-child` | Existing or extended `consent-pending`. |
| `mentor-audit-consent-withdrawn-child` | Existing or extended `consent-withdrawn`. |
| `mentor-audit-consent-post-approval` | New deterministic post-approval state or test route/state helper. |
| `mentor-audit-regional-consent-matrix` | New matrix scenario or three explicit regional variants. |
| `mentor-audit-deletion-scheduled-owner` | Existing `account-deletion-scheduled`. |
| `mentor-audit-session-expired` | New Playwright storage/session fixture, not only DB seed. |
| `mentor-audit-mfa-required` | New Clerk-backed account fixture or mocked provider lane. |
| `mentor-audit-billing-boundaries` | New or composed billing scenarios for quota, child paywall, and family pool. |
| `mentor-audit-rich-child-history` | New composite scenario using existing parent report, retention, recap, vocabulary, quiz, dictation, and homework seed helpers. |
| `mentor-audit-resumable-session` | New scenario with resumable learning session state. |

Each registry entry must expose:

- Email.
- Password when sign-in is possible.
- Account ID.
- Owner profile ID.
- Child profile IDs where applicable.
- Subject, topic, session, report, recap, and quiz/dictation IDs where applicable.
- Expected landing route after sign-in.
- Expected testIDs or visible copy for the first assertion.

## Seed Requirements

### 1. Fresh Verified Adult With No Profiles

Requirement: Create an email-verified owner account with no profile records.

Acceptance:

- Signing in lands on first-profile/profile-creation or the intended first-use onboarding gate.
- The first-use path can capture Study/Family intent.
- No Family/Children mentor home appears before a profile or child link exists.
- The scenario is safe to rerun and cleans up by seed email prefix.

Implementation notes:

- Start by verifying `pre-profile`.
- If `pre-profile` bypasses the first-profile gate, add `mentor-audit-empty-adult` as a new scenario that inserts only the account row and Clerk user, with no profile rows.

### 2. Adult With No Linked Children, Family-Eligible

Requirement: Create an onboarding-complete adult owner with an eligible Family/Pro or trial state and no child links.

Acceptance:

- Signing in lands in Study as the adult or in a neutral Family setup gate.
- The app exposes the add/link-first-child path from the expected surface.
- It does not show child-style post-approval copy such as "You're approved" or "Pick a subject".
- It preserves the adult's Study access.

Implementation notes:

- Fix or replace `parent-solo`; the 2026-05-25 audit found it unreliable for this contract.

### 3. Family Owner At Profile Limit

Requirement: Create a Family/Pro owner with the maximum supported profile count already present.

Acceptance:

- More/Profile/Add child entry is visible if that is the intended entry point.
- Starting add-child shows max-profile/family-plan gating.
- The app does not open an empty create-child form when the plan limit is already reached.
- The gate copy identifies the recovery action, such as upgrade, manage plan, or remove profile.

Implementation notes:

- Build from `subscription-family-active` or `subscription-pro-active`.
- Insert the owner plus exactly `getTierConfig(tier).maxProfiles` profiles/links for that account.

### 4. Underage Child Pending Consent

Requirement: Create an underage child link where parent consent has been requested but not approved.

Acceptance:

- Parent sees pending consent state for the child.
- Child learning data and mentor review routes are gated.
- Parent email resend/change actions are visible where expected.
- Direct child deep links do not bypass the pending gate.

Implementation notes:

- Verify existing `consent-pending`.
- Ensure the returned IDs include consent token/state IDs for direct-route checks.

### 5. Underage Child With Withdrawn Or Denied Consent

Requirement: Create a child link where consent was withdrawn or denied after previously existing.

Acceptance:

- Parent/mentor child routes are blocked or reduced to the expected recovery state.
- Child learning data is not visible.
- Recovery/action copy is visible.
- Direct child detail, progress, memory, and session routes cannot leak child data.

Implementation notes:

- Verify `consent-withdrawn` and `consent-withdrawn-solo`.
- Add a denied-consent variant if withdrawn and denied are distinct product states.

### 6. Post-Approval Consent Landing

Requirement: Create a deterministic state that simulates returning after parent approval.

Acceptance:

- Landing route restores child visibility.
- The child appears on Family/Children home.
- The app does not land on child-style learner onboarding for the parent.
- The approval state cannot be replayed to create duplicate links.

Implementation notes:

- Prefer a seed route/API helper that creates the approved link and returns the expected URL.
- If a real email link is required, add a test-only consent approval token response in the seed result so Playwright can open the same URL a parent would open.

### 7. Regional Consent Variants

Requirement: Create child profiles across supported age/region consent thresholds.

Acceptance:

- Each region/age combination triggers the expected no-consent, pending-consent, or blocked state.
- Parent-visible copy matches the region requirement.
- Direct routes respect the same gate as click paths.

Implementation notes:

- Implement as either one matrix scenario returning multiple child IDs or explicit variants:
  - `mentor-audit-consent-us-under-threshold`
  - `mentor-audit-consent-eu-under-threshold`
  - `mentor-audit-consent-over-threshold`
- Keep birth dates relative to current year like existing test-seed age helpers.

### 8. Scheduled Deletion Owner

Requirement: Create an owner account in scheduled-deletion state.

Acceptance:

- Signing in/account surface exposes Keep account recovery.
- Owner-only safeguards remain in place.
- Keeping the account clears the scheduled deletion state and preserves the owner profile.

Implementation notes:

- Verify `account-deletion-scheduled`.
- Add Playwright coverage for the visible recovery path before exercising the state-clearing mutation.

### 9. Expired Or Revoked Session

Requirement: Provide a reproducible signed-in browser state that becomes invalid.

Acceptance:

- App forces sign-out when the session is expired/revoked.
- Sign-in screen shows the expected session-expired banner.
- The app does not remain on stale Family/child content.
- After re-authentication, authorized target route behavior matches the pending-redirect contract.

Implementation notes:

- This is not only a DB seed. Implement as a Playwright storage-state fixture or dev/test helper that writes an expired auth state.
- Keep the helper gated to development/staging/E2E only.

### 10. MFA / Additional Verification Account

Requirement: Provide accounts requiring supported and unsupported second-factor paths.

Acceptance:

- Supported factor routes show the correct verification form.
- Unsupported factor routes show support fallback copy and contact action.
- Backup-code path is reachable for accounts configured with backup-code support.
- Mentor deep-link pending route is preserved only after successful verification.

Implementation notes:

- If Clerk staging can create these factors safely, use real Clerk seed users.
- If not, place this in a provider-mocked web E2E lane and document that it is not a shared-staging Chrome seed.

### 11. Quota / Paywall States

Requirement: Provide owner/child billing states for quota exceeded, child notify-parent, and family pool visibility.

Acceptance:

- Owner daily quota exceeded state shows the correct paywall/recovery action.
- Child paywall notify-parent path creates or displays mentor-facing response.
- Family pool details are visible to eligible family owner.
- Non-owner child profiles cannot access owner billing data.

Implementation notes:

- Verify `quota-exceeded`, `daily-limit-reached`, `trial-expired-child`, `subscription-family-active`, and `subscription-pro-active`.
- Add one composed `mentor-audit-billing-boundaries` scenario if existing scenarios force too many separate sign-ins for the audit.

### 12. Child With Rich Learning History

Requirement: Create one linked child with enough learning history to exercise parent-native review surfaces.

Acceptance:

- Child has at least two subjects and three topics.
- At least one subject has retention cards and attempted/completed topic progress.
- Child has milestones, vocabulary, bookmarks, a weekly report, a monthly/report surface if supported, and at least one session recap.
- Child has completed quiz, dictation, and homework history sufficient for read-only parent review where designed.
- Seed result returns child, subject, topic, session, report, recap, quiz, dictation, and homework IDs used by Playwright.

Implementation notes:

- Compose existing helpers from `parent-with-reports`, `parent-with-weekly-report`, `parent-subject-with-retention`, `parent-session-with-recap`, `with-bookmarks`, `quiz-*`, and `dictation-*`.
- Do not rely on LLM calls during seed creation. Insert deterministic rows directly.

### 13. Interrupted / Resumable Session

Requirement: Create a profile with an in-progress resumable learning session.

Acceptance:

- Home shows the resume state.
- Resume remains Study-scoped for the active learner.
- Mentor/Family home does not claim the child's resumable session as the adult's session.
- Direct resume route restores the correct session and profile scope.

Implementation notes:

- Use a deterministic session row with status/state matching the app's resume query.
- Include enough session events for the UI to render a meaningful resume card.

## Implementation Tasks

### Task 1 - Seed Inventory Verification

Run and document current behavior for these existing scenarios:

```powershell
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest --config apps/api/jest.config.ts apps/api/src/services/test-seed.test.ts --runInBand --no-coverage
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest --config apps/api/jest.config.ts apps/api/src/services/test-seed.medium-priority.integration.test.ts --runInBand --no-coverage
```

For each scenario in the Existing Seed System table, record whether it already satisfies the Mentor audit requirement, needs extension, or should be replaced by a new mentor-audit variant.

### Task 2 - Add Registry Names

Add mentor audit aliases or scenarios in `apps/api/src/services/test-seed.ts`.

Implementation pattern:

```ts
export type SeedScenario =
  | 'mentor-audit-empty-adult'
  | 'mentor-audit-family-no-children'
  // existing scenarios remain here
```

Add each implemented scenario to `SCENARIO_MAP`. For aliases, the map can point to the same seeder only when the behavior exactly satisfies the requirement.

### Task 3 - Return Stable IDs

Extend each mentor-audit scenario's `SeedResult.ids` with route-critical IDs. Use explicit keys:

```ts
ids: {
  ownerProfileId,
  childProfileId,
  subjectId,
  topicId,
  sessionId,
  weeklyReportId,
  recapSessionId,
}
```

Only include keys that apply to the scenario. Tests should assert required keys exist for each mentor-audit seed.

### Task 4 - Add API Tests

Add or extend tests beside `apps/api/src/services/test-seed.test.ts` and the existing integration seed suites.

Minimum assertions:

- Every mentor-audit scenario is accepted by `seedScenario`.
- The seed returns expected IDs.
- Consent/pending/withdrawn states are distinct.
- Profile-limit seed creates exactly the configured max profile count.
- Rich child seed creates report, retention, recap, vocabulary, and session rows.
- Seed cleanup still scopes to seed-managed Clerk users only.

### Task 5 - Add Web E2E Setup Coverage

Update `apps/mobile/e2e-web/README.md` and Playwright setup helpers so the mentor-audit seed pack can be run from Chrome.

Add a setup output or helper naming convention for the storage states:

```text
mentor-audit-empty-adult.json
mentor-audit-family-no-children.json
mentor-audit-rich-child-history.json
mentor-audit-billing-boundaries.json
```

Do not make every seed part of the smoke suite. Add focused specs or opt-in projects for seed validation first.

### Task 6 - Re-run The Blocked Rows

After the seed pack exists, rerun the blocked Mentor audit rows in `docs/flows/plans/mentor-flow-revision-plan.md`.

Use this command shape for staging web E2E:

```powershell
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web
```

For manual Chrome verification, record:

- Seed name.
- Email.
- Build SHA.
- API environment.
- Route opened.
- Result and bug link if failed.

## Deliverables

1. Mentor-audit seed registry in `apps/api/src/services/test-seed.ts`.
2. API seed unit/integration tests for every registry entry.
3. Web E2E setup documentation for using the seed pack in Chrome.
4. Optional Playwright setup/storage states for the highest-value seeds.
5. Updated Mentor audit rows replacing blocked seed-dependent notes with pass/fail evidence where Chrome can now test the flow.

## Non-Goals

- Do not use production data or production Clerk users.
- Do not add unguarded seed endpoints.
- Do not make native-only camera/gallery/store/shake behavior claim Chrome coverage.
- Do not turn provider-dependent OAuth/MFA/email verification into fake product passes unless the provider is actually exercised or the test lane is explicitly provider-mocked.

## Validation

Before calling the seed pack ready:

```powershell
pnpm exec nx run api:typecheck
pnpm exec nx run api:test
pnpm exec nx test:integration api
C:/Tools/doppler/doppler.exe run -c stg -- pnpm run test:e2e:web:smoke
```

If only docs are changed, run:

```powershell
git diff --check
```
