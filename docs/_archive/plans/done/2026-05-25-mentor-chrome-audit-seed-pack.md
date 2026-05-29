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

## Navigation Contract Flag Matrix

The guardian/Family shell behaves differently under `MODE_NAV_V1_ENABLED=false` (V0, current production, 5 tabs) vs `true` (V1, 4 tabs with Recaps). The hard constraint in `CLAUDE.md` requires V0 to remain green; the audit re-run must execute under both flag positions for every scenario that touches the guardian shell. Every Chrome walkthrough log row must record the flag position it was executed under. A row is not closed until both V0 and V1 are recorded for entries that depend on guardian-shell behaviour (every `mentor-audit-*` entry except the pre-shell ones — `empty-adult`, `session-expired`, `session-revoked`, `mfa-totp`).

## Existing Seed System

Seed implementation belongs in `apps/api/src/services/test-seed.ts`, which already backs the gated test-seed API. Relevant existing scenarios include:

| Existing scenario | Status against mentor-audit contract |
| --- | --- |
| `pre-profile` | Verified at `test-seed.ts:1579-1595` — creates account + Clerk user with **no profile row** (`profileId: ''`, `ids: {}`). Satisfies `mentor-audit-empty-adult` as a registry alias; no new seeder needed. |
| `parent-solo` | Defined at `test-seed.ts:1522-1572` with the shape the audit asks for (adult `isOwner: true`, `tier: 'family'`, `CONSENTED`, no children, no `family_links`). The audit log line 133 reports it lands on child-style `/dashboard` with "You're approved! ... Pick a subject" copy. **This is a product-or-seed defect that must be root-caused before the seed is replaced — see Task 1.** |
| `consent-pending` | Reusable for pending-consent gates. Extend to expose `consentToken` and `consentStateId` in `SeedResult.ids` for direct-route checks. |
| `consent-withdrawn`, `consent-withdrawn-solo` | Reusable for withdrawn gates. **"Denied" is not a separate enum value** — `packages/database/src/schema/profiles.ts:20-25` has `'PENDING' \| 'PARENTAL_CONSENT_REQUESTED' \| 'CONSENTED' \| 'WITHDRAWN'`. No separate denied seeder. |
| `account-deletion-scheduled` | Reusable as-is for scheduled deletion recovery. |
| `parent-with-weekly-report`, `parent-subject-with-retention`, `parent-session-with-recap`, `with-bookmarks`, `parent-with-reports` | Reusable as starting points, but composition into `mentor-audit-rich-child-history` requires **Task 0** to extract shared insert helpers first. |
| `quota-exceeded`, `daily-limit-reached` | Reusable for owner daily-quota states. **Constrained to Study/free tier** — Family and Pro tiers have no daily limit per `subscription.ts:35,50,61,72`. |
| `trial-expired-child` | Reusable for child paywall notify-parent path. |
| `subscription-family-active`, `subscription-pro-active` | Reusable for family/pro monthly quota and max-profile states. Family = 4 profiles, Pro = 6 profiles. |
| `quiz-*`, `dictation-*`, `review-empty` | Reusable for student-activity state, once Mentor route exposure is corrected. |

## Seed Registry Contract

Add or document a stable mentor audit registry. Use names that describe the test contract, not the implementation detail.

| Registry name | Backing scenario |
| --- | --- |
| `mentor-audit-empty-adult` | Alias for existing `pre-profile`. No new seeder. |
| `mentor-audit-family-no-children` | Use existing `parent-solo` **after** Task 1 root-causes the landing-copy defect. May resolve to "no new seeder" (bug is in nav contract) or to extending `parent-solo` (missing row, e.g., onboarding marker). |
| `mentor-audit-family-at-profile-limit` | New seeder built from `subscription-family-active`. Tier pinned to `family` (4 profiles: 1 owner + 3 children). `mentor-audit-pro-at-profile-limit` added only if the audit explicitly requires Pro gate-copy coverage. |
| `mentor-audit-consent-pending-child` | Alias for existing `consent-pending`. Extend `SeedResult.ids` to include `consentToken` and `consentStateId`. |
| `mentor-audit-consent-withdrawn-child` | Alias for existing `consent-withdrawn`. (No separate "denied" entry — see Existing Seed System table.) |
| `mentor-audit-post-approval-steady-state` | Alias for existing `parent-multi-child`. Already verified to land on Family home (audit log line 131). |
| `mentor-audit-post-approval-redirect` | New seeder: sits at `/consent/approve?token={consentToken}` so Playwright opens the same URL a parent clicks from the consent email. Reuses the `consentToken` already inserted by `seedConsentPending` (`test-seed.ts:1613`). |
| `mentor-audit-consent-us-under-threshold` | New seeder (region=US, age below threshold). |
| `mentor-audit-consent-eu-under-threshold` | New seeder (region=EU, age below threshold). |
| `mentor-audit-consent-over-threshold` | New seeder (age above threshold — no consent required). |
| `mentor-audit-deletion-scheduled-owner` | Alias for existing `account-deletion-scheduled`. |
| `mentor-audit-session-expired` | New Playwright storage-state helper: mutate the persisted `__session` cookie to a malformed/expired token so Clerk middleware rejects on next request. Tests the **expired** banner + forced sign-out. |
| `mentor-audit-session-revoked` | New seeder: after sign-in, call Clerk Backend `POST /sessions/{id}/revoke`. Tests the **revoked-token-refresh** path (different code path from cookie corruption). Combined coverage of both seeds is required for AUTH-11. |
| `mentor-audit-mfa-totp` | New Clerk-backed seeder. Calls Clerk Backend `POST /users/{id}/totp` to attach a TOTP factor, returns the shared secret in `SeedResult.ids.totpSecret`. Playwright helper generates the rolling code via `otplib` at sign-in time. Backup-code and SMS factor paths are **out of scope** — file a follow-up if AUTH-05 requires them. |
| `mentor-audit-quota-owner-daily` | New seeder built from `daily-limit-reached`. Constrained to Study/free tier (Family/Pro have no daily cap). |
| `mentor-audit-family-owner-daily-quota-with-child` | New seeder. Free-tier owner with `defaultAppContext: family`, 1 linked consented child holding a subject/topic/session, owner daily quota exhausted. Proves child-review surfaces still work while adult Study/billable actions are quota-blocked. Covers BILLING-07 + BRIDGE-03. Distinct from `mentor-audit-quota-owner-daily`, which has no linked child. |
| `mentor-audit-quota-family-monthly` | New seeder: `subscription-family-active` with `quotaPools.usedThisMonth` driven over the monthly cap. Tests family-pool-exhausted owner state. |
| `mentor-audit-family-pool-members` | New seeder. Active Family-tier subscription, owner + 2-3 linked consented children, shared monthly quota pool partially used (~40-60% of cap), stable `subscriptionId` + child profile IDs returned. Covers BILLING-08. Distinct from `mentor-audit-family-at-profile-limit` (which sits at the add-child cap) — this seed is a semantic "family in normal mid-month use" seed, not a gating-boundary seed. |
| `mentor-audit-paywall-child-notify` | New seeder built from `trial-expired-child`. Tests the child paywall → notify-parent path independently from owner billing states. |
| `mentor-audit-rich-child-history` | New composite scenario. **Requires Task 0 (extract reusable insert helpers) to land first.** |
| `mentor-audit-resumable-session` | New scenario: deterministic in-progress `learning_sessions` row + enough `session_events` for the resume card to render. No LLM calls during seeding. |
| `mentor-audit-bridge-backstack` | New scenario. Reuses `parent-multi-child` DB state (Family owner + child with topic that is NOT yet in the adult's Library). Adds a dedicated Playwright probe that performs **Add to my learning** from the child topic/session/recap, opens the adult copy, then backs out and asserts the user lands back on the Family child/recap context — not proxy/child active-profile state. Covers BRIDGE-04. |

Each registry entry must expose:

- Email — see "Seed Email Convention" below.
- Password when sign-in is possible.
- Account ID.
- Owner profile ID.
- Child profile IDs where applicable.
- Subject, topic, session, report, recap, and quiz/dictation IDs where applicable.
- Expected landing route after sign-in (imported from `apps/mobile/e2e-web/fixtures/scenarios.ts` constants — do not inline route strings in the registry).
- Expected testIDs or visible copy for the first assertion (same — import the testID constant rather than inlining).

A Playwright registry-smoke project (added in Task 5) opens each entry, signs in, and asserts the landing testID is visible. This converts route drift into a CI failure rather than silent registry staleness.

## Seed Email Convention

Two modes:

- **Audit re-run (single human in Chrome).** Stable per-scenario email: `mentor-audit-{registry-key}@example.com`. Re-running the same scenario is safe because `seedScenario` deletes existing seed-managed rows for the same email before re-seeding (`apps/api/src/services/test-seed.ts:3649-3661`).
- **Automated Playwright suites.** Run-id-prefixed email via `buildSeedEmail(alias)` from `apps/mobile/e2e-web/helpers/runtime.ts:32-34`, yielding `pw-${runId}-${alias}@example.com`. Parallel workers do not collide because each Playwright run gets a unique `PLAYWRIGHT_RUN_ID`.

Cleanup-by-prefix handles both modes via the `clerk_seed_*` external_id (`test-seed.ts:3666-3744`).

## Seed-Pack Failure Modes

| State | Trigger | Recovery |
| --- | --- | --- |
| Clerk rate-limit on bulk seed | Many parallel workers seeding in <1s | Handled by `fetchWithRetry` in `apps/mobile/e2e-web/helpers/test-seed.ts:23-72` (exponential backoff + jitter). No plan action. |
| Pre-existing real Clerk user with seed email | Email collision with non-seed user | Seeder throws `Refusing to reuse non-seed Clerk user` (`test-seed.ts:201-205`). Operator picks a different email. Document this when adopting stable per-scenario emails. |
| Partial DB cleanup mid-loop | Interrupted reset between Clerk delete and DB delete | `resetDatabase` is idempotent — the `OR (clerkUserId LIKE 'clerk_seed_%')` clause at `test-seed.ts:3732-3741` still matches orphans. Safe to retry. |
| Clerk Backend API down during seed | Network/5xx | Seeder throws; account row only inserted after Clerk user creation succeeds (`test-seed.ts:3640-3663`). No corruption. |
| MFA TOTP shared secret leaks to CI logs | `SeedResult.ids.totpSecret` printed | Acceptable — seed accounts are environment-gated, never production. Do not redact; redaction breaks the otplib helper. |
| `parent-solo` symptom recurs after Task 1 fix | Audit re-run still lands on child-style `/dashboard` | Task 1 has not actually root-caused. Re-open triage; do not silently replace the seed. |

## Seed Requirements

### 1. Fresh Verified Adult With No Profiles

Requirement: An email-verified owner account with no profile records.

Seed contract (what this plan delivers):

- Account row exists, Clerk user exists and is email-verified, `profiles` has no row for the account.
- Re-seeding is idempotent.

Implementation notes:

- Alias `mentor-audit-empty-adult` → `pre-profile`. No new seeder. Already verified at `test-seed.ts:1579-1595`.

### 2. Adult With No Linked Children, Family-Eligible

Requirement: An onboarding-complete adult owner with an eligible Family/Pro or trial state and no child links.

Seed contract (what this plan delivers):

- One owner profile (`isOwner: true`), `tier: 'family'` active subscription, `CONSENTED` consent state, no `family_links` rows, no child profiles.
- `parent-solo` already satisfies this shape. The defect is in how the app renders for this state, not in the seed (unless Task 1 finds otherwise).

Implementation notes:

- **Blocked on Task 1.** Do not extend or replace `parent-solo` until the root cause of the child-style landing copy is identified.

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

### 5. Underage Child With Withdrawn Consent

Requirement: A child link where consent was withdrawn after previously being CONSENTED.

Seed contract:

- `consentStates` row with `status: 'WITHDRAWN'` and `respondedAt` set.
- Child profile + family_link still exist; app gating is enforced at runtime by reading `status`.

Implementation notes:

- Alias `mentor-audit-consent-withdrawn-child` → existing `consent-withdrawn`. No separate "denied" variant — `consent_status` enum has no `DENIED` value (`packages/database/src/schema/profiles.ts:20-25`). "Denied" is product-language for `WITHDRAWN` from a never-CONSENTED transition; that variant is left out of this plan because the existing `consent-withdrawn` already produces a state the app cannot distinguish from "denied" without UI copy hints.

### 6. Post-Approval Consent — Steady-State

Requirement: An owner who already has approved consent for their child and signs in normally.

Seed contract:

- Already covered by existing `parent-multi-child`. Audit log line 131 confirms it lands on Family home.

Implementation notes:

- Alias only. Confirm in Task 1 and close.

### 6b. Post-Approval Consent — Redirect

Requirement: A user opening the same URL a parent clicks from the consent-approval email.

Seed contract:

- Pending-consent state exists (reuses `seedConsentPending` data), `consentToken` exposed in `SeedResult.ids`.
- Playwright opens `/consent/approve?token={consentToken}` directly. The server validates, marks `CONSENTED`, and redirects to the post-approval landing route.
- Approval token is single-use — re-opening the same URL must not create a duplicate link.

Implementation notes:

- New seeder `mentor-audit-post-approval-redirect`. Reuses the `consentToken` already inserted at `test-seed.ts:1613`.

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

Requirement: An owner account in scheduled-deletion state.

Seed contract:

- Existing `account-deletion-scheduled` already produces the required state. Alias only.

Implementation notes:

- Audit-side Playwright coverage for the recovery path is scoped to the audit re-run, not this plan.

### 9. Expired Session

Requirement: A reproducible signed-in browser state whose token Clerk rejects on the next request.

Seed contract:

- A normal signed-in storage-state is captured, then the persisted `__session` cookie is mutated to a malformed/expired token before the spec under test runs.

Implementation notes:

- New Playwright storage-state helper, not a DB seed. Gated to dev/staging/E2E.
- Exercises Clerk middleware's reject-and-force-sign-out path.

### 9b. Revoked Session

Requirement: A reproducible signed-in browser state whose session Clerk has revoked server-side.

Seed contract:

- After normal sign-in, Playwright calls Clerk Backend `POST /sessions/{id}/revoke`. Next API call from the page hits the revoked-token-refresh code path (distinct from the expired-cookie path).

Implementation notes:

- New seeder. Combined coverage with §9 is required for AUTH-11.

### 10. MFA TOTP Account

Requirement: An account configured with a TOTP factor that Playwright can satisfy at sign-in.

Seed contract:

- New seeder calls Clerk Backend `POST /users/{id}/totp` to attach a TOTP factor.
- `SeedResult.ids.totpSecret` returns the shared secret.
- Playwright helper generates the rolling code via `otplib` at sign-in.

Implementation notes:

- Backup-code and SMS factor paths are **out of scope**. File a follow-up plan if AUTH-05 requires them.

### 11. Quota / Paywall States

Requirement: Three distinct billing-boundary states. "Composed" boundary scenarios are not reachable in the data model.

Seed contract — three separate seeders:

- `mentor-audit-quota-owner-daily` — Study/free tier, `quotaPools.usedThisMonth` driven over the daily cap. Family and Pro tiers have no daily limit (`subscription.ts:35,50,61,72`), so this scenario is Study-tier-only.
- `mentor-audit-quota-family-monthly` — `subscription-family-active` with `quotaPools.usedThisMonth` over the monthly cap.
- `mentor-audit-paywall-child-notify` — built from `trial-expired-child`, exercises the child paywall → notify-parent path.

Audit-side assertions (which states the app gates, whether non-owner child profiles can read billing) are scoped to the audit re-run rows, not the seed contract.

### 11b. Family Owner With Daily Quota Exhausted + Linked Child

Covers BILLING-07 and BRIDGE-03.

Requirement: A free-tier owner with `defaultAppContext: 'family'`, one linked consented child holding real learning state, and the owner's daily quota fully consumed. The split lets Chrome prove that child-review surfaces (Recaps, child topic detail, child session) remain reachable while adult Study/billable actions hit the quota gate.

Seed contract:

- Owner: `isOwner: true`, free/Study tier, `defaultAppContext: 'family'`, onboarding complete.
- Child: 1 linked profile, `consentStates.status: 'CONSENTED'`, `family_links` row present, at least one subject + topic + session under the child's profile ID.
- Quota: `quotaPools.usedToday` driven at or above the Study daily cap (`subscription.ts:33-49`). Monthly bucket left below cap so the failure attributable to the daily gate.
- `SeedResult.ids` returns `ownerProfileId`, `childProfileId`, `childSubjectId`, `childTopicId`, `childSessionId`.

Why a new seed (not a tweak to `mentor-audit-quota-owner-daily`):

- The existing daily-quota seed has the quota state but no linked child, so it cannot exercise the Family Mentor context at all. Composing on the fly in Playwright would duplicate child-link insertion logic that already lives in the seed layer and would diverge from the test-seed cleanup contract.

Implementation notes:

- Compose `daily-limit-reached` quota plumbing with `parent-multi-child`-style child/subject/topic/session insertion (use the Task 0 extracted helpers — do not inline inserts).
- Both V0 and V1 nav-contract flag positions must be executed against this seed per the audit's flag matrix.

### 11c. Family Pool Members Mid-Use

Covers BILLING-08.

Requirement: An active Family-tier subscription with the owner plus 2-3 linked consented children sharing a partially-used monthly quota pool. This is the "normal mid-month Family in use" semantic seed — not a gating-boundary seed.

Seed contract:

- Owner: `isOwner: true`, `tier: 'family'`, active `subscriptionId` exposed in `SeedResult.ids`.
- Children: 2 or 3 linked profiles, all `CONSENTED`, `family_links` rows present, stable `childProfileIds` array returned in registry order.
- Subscription: `subscription-family-active` shape.
- Quota: `quotaPools.usedThisMonth` set to ~40-60% of `getTierConfig('family').monthlyQuota` (single numeric constant in the seed; document the exact value beside the seeder).
- `SeedResult.ids` returns `ownerProfileId`, `subscriptionId`, `childProfileIds: string[]`, and `quotaUsedThisMonth: number` so audit assertions can express percentages without re-reading the tier config.

Why a new seed (not a reuse of `mentor-audit-family-at-profile-limit`):

- `mentor-audit-family-at-profile-limit` exists to exercise the add-child cap branch and pins the count at `maxProfiles`. BILLING-08 is about the pool-sharing readout in steady state; coupling it to the add-child gate would make the seed brittle to any future cap change and conflate two unrelated audit concerns.

Implementation notes:

- Build from `subscription-family-active`. Insert exactly the number of children specified (2 or 3 — pick one and pin it; document the choice).
- Quota helper must be deterministic — no `Date.now()`-based usage values.

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

### 14. Bridge Backstack

Covers BRIDGE-04.

Requirement: A Family owner viewing a child topic/session/recap can perform **Add to my learning**, open the adult copy, then back out and land on the same Family child/recap context they came from — not on the proxy/child active-profile state and not on the adult Library root.

Seed contract:

- DB state: reuses `parent-multi-child` (Family owner + at least one child with a subject/topic/session/recap). No new DB columns or rows beyond what `parent-multi-child` already inserts.
- Precondition the seed must guarantee: at least one child topic that does **not** yet exist in the adult owner's Library. If `parent-multi-child` accidentally copies the topic to the owner, this seed extends it to delete that adult-side copy before returning.
- `SeedResult.ids` returns `ownerProfileId`, `childProfileId`, `childSubjectId`, `childTopicId`, `childSessionId`, `childRecapId` — the IDs the Playwright probe needs to deep-link to each entry surface.

Why a new entry (not just reusing `parent-multi-child` directly):

- `parent-multi-child` is a DB-state seed. BRIDGE-04 is a backstack/navigation contract that DB state alone cannot exercise — the gap is the dedicated browser probe and the assertion that `router.back()` does not fall through to `Tabs` first-route (see `CLAUDE.md` → "Repo-Specific Guardrails" on cross-tab `router.push` chain rules).
- A named registry entry pins the contract so future child-topic / Library refactors that quietly change the back-target are caught by the registry-smoke project, not lost in `parent-multi-child`'s general use.

Implementation notes:

- New Playwright probe under `apps/mobile/e2e-web/`. Three entry surfaces — child topic, child session, child recap — each with the same shape: open entry → tap **Add to my learning** → confirm adult copy renders → `router.back()` → assert testID of the original Family child/recap context, and assert `activeProfileId === ownerProfileId` (not the child's).
- Both V0 and V1 nav-contract flag positions must be executed against this seed per the audit's flag matrix. The V1 guardian shell collapses `own-learning` + `library` into `recaps`, so the back-target testID differs by flag — the registry constants must encode both.
- If the adult copy already exists when the probe runs (idempotent reseeding leaves it behind), the seeder must clean it up before returning rather than skipping the **Add to my learning** action.

## Implementation Tasks

### Task 0 - Extract Reusable Insert Helpers

Required before `mentor-audit-rich-child-history` is composable.

Today each parent-history seeder (`seedParentWithReports`, `seedParentWithWeeklyReport`, `seedParentSubjectWithRetention`, `seedParentSessionWithRecap`, `seedWithBookmarks`) is a top-level function in `test-seed.ts` that inserts its own subject, sessions, reports, and retention cards inline. Composing them requires extracting:

- `insertSubjectWithCurriculum(db, profileId, name)` — already exists as `createSubjectWithCurriculum` at the top of `test-seed.ts`; promote and document.
- `insertWeeklyReport(db, profileId, opts)` — extract from `seedParentWithWeeklyReport`.
- `insertRetentionCards(db, subjectId, count)` — extract from `seedParentSubjectWithRetention`.
- `insertSessionWithRecap(db, profileId, subjectId, opts)` — extract from `seedParentSessionWithRecap`.
- `insertVocabulary(db, subjectId, count)` and `insertBookmarks(db, profileId, count)` — extract from `seedWithBookmarks` and language seeders.

Each existing scenario is rewritten to call the extracted helpers. Regression contract: `test-seed.test.ts` and `test-seed.medium-priority.integration.test.ts` must remain green:

```powershell
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest --config apps/api/jest.config.ts apps/api/src/services/test-seed.test.ts apps/api/src/services/test-seed.medium-priority.integration.test.ts --runInBand --no-coverage
```

If a refactor would change the shape of `SeedResult.ids` for an existing scenario, do not change it — keep the old keys and add new ones.

### Task 1 - Inventory Verification + `parent-solo` Root-Cause Triage

Two subtasks. Both produce a written finding in this plan or a new Notion bug.

**1a. Inventory pass.** Run:

```powershell
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest --config apps/api/jest.config.ts apps/api/src/services/test-seed.test.ts --runInBand --no-coverage
C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest --config apps/api/jest.config.ts apps/api/src/services/test-seed.medium-priority.integration.test.ts --runInBand --no-coverage
```

For each scenario in the Existing Seed System table, confirm it produces the documented DB state. Record any drift as a follow-up Notion bug.

**1b. `parent-solo` triage.** Sign in to staging Chrome with a freshly-seeded `parent-solo` account. Capture in a structured note:

- Active feature-flag values: `MODE_NAV_V0_ENABLED`, `MODE_NAV_V1_ENABLED` (in Doppler).
- What `resolveTabShape()` returns for this profile.
- What the `LearnerScreen` `showParentHome` branch sees — `isOwner`, `hasLinkedChildren`, `mode`, `isFamilyPlanOwner`. (Add a temporary `console.log` if needed; remove before any commit.)
- Whether `learning_profiles` row exists for the profile, and whether any onboarding-completion marker is missing vs `parent-multi-child`.

Triage outcomes (pick one):

- **Nav-contract bug.** File a Notion P1 against the navigation contract. `parent-solo` stays unchanged. `mentor-audit-family-no-children` becomes an alias.
- **Missing seed row.** Extend `seedParentSolo` to insert the missing row(s). `mentor-audit-family-no-children` becomes an alias.
- **Both.** File the nav bug AND extend the seed.

Do not proceed to §2 acceptance work until 1b is closed.

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
- The seed returns expected IDs (per-scenario whitelist).
- Consent pending vs withdrawn states are distinct (no test for "denied" — see §5).
- Profile-limit seed creates exactly `getTierConfig('family').maxProfiles` profiles.
- Rich child seed creates report, retention, recap, vocabulary, and session rows via the Task 0 helpers (assert the helpers are called, not the inline inserts).
- Existing parent-history seeders still produce the same `SeedResult.ids` after Task 0's extraction (regression contract).
- MFA seed returns a `totpSecret` whose `otplib.authenticator.generate()` output is accepted by Clerk.
- Session-revoked seed returns a session-id-less storage state after the revoke call.
- Seed cleanup still scopes to seed-managed Clerk users only.

### Task 5 - Add Web E2E Setup Coverage + Registry-Smoke Project

Update `apps/mobile/e2e-web/README.md` and Playwright setup helpers so the mentor-audit seed pack can be run from Chrome.

Storage-state naming convention:

```text
mentor-audit-empty-adult.json
mentor-audit-family-no-children.json
mentor-audit-rich-child-history.json
mentor-audit-quota-family-monthly.json
```

Add a Playwright **registry-smoke** project (opt-in via `--project=mentor-audit-registry-smoke`). One spec per registry entry that:

1. Seeds the scenario.
2. Signs in (or applies the storage-state helper for pre-shell scenarios).
3. Asserts the landing route + landing testID from the registry constants resolve to a visible element.

This converts landing-route drift into a CI failure. The smoke project is **not** part of the default suite — opt-in to keep CI runtime stable.

Landing-route constants must be imported from `apps/mobile/e2e-web/fixtures/scenarios.ts` (extend the existing `authScenarios` const) — do not inline path strings.

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
