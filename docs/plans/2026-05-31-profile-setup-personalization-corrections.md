---
title: Profile Setup, Personalization, and Corrections - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [onboard-1, onboard-2, onboard-3, onboard-4]
---

# Profile Setup, Personalization, and Corrections - Implementation Plan

> **⚠️ Classification pending** (added 2026-06-01) — re-triage against the identity-foundation clean-cut target before acting on this plan. Not yet classified as identity-coupled vs. independent. See [`_wip/identity-foundation/ROADMAP.md`](../../_wip/identity-foundation/ROADMAP.md) § "Sibling-plan re-triage".

**Goal:** Make learner personalization reachable during first-run and editable
later: pronouns, tutor-prose language, birth date corrections, and interests
with school/free-time context.

**Approach:** Treat this as one profile-personalization primitive with two entry
points: first-run setup and later settings/profile edit. Reuse the existing
pronouns screen, onboarding-dimensions hooks, mentor-memory interests editor,
and conversation-language schema; add only the missing navigation, edit surface,
and birth-date update contract.

> **Adversarial-review corrections (2026-05-31).** This plan was red-teamed
> against the codebase before approval. Material corrections folded in below:
> birth date is a **single `birthYear` column** (`schema/profiles.ts:88`) — there
> is no `birth_month`/`birth_day` column, so T4 writes one column plus the
> existing `birth_year_set_by` audit field, not three fields "atomically"
> [C-1]. Birth-date editing is a **privilege-escalation surface** — a
> self-registered minor (`isOwner=true`, `profile.ts:465`) who raises their own
> `birthYear` unlocks add-child/family/billing (`profile.ts:629`,
> `onboarding.ts:133`); the server must reject self-edits that raise the
> caller's own eligibility bracket, and that fix ships with a break test [C-2].
> The tutor-language self route is **owner-gated** (`onboarding.ts:62-67`), so
> the settings row must hide for / re-route non-owner children [H-3]. Birth
> date was immutable until now, so there are **no existing consent gates to
> reuse** — the gate is new [H-2]. See the per-task notes and Failure Modes.

## Scope

In scope:
- `packages/schemas/src/profiles.ts`
- `apps/api/src/routes/profiles.ts`
- `apps/api/src/services/profile.ts`
- `apps/api/src/routes/onboarding.ts`
- `apps/mobile/src/hooks/use-onboarding-dimensions.ts`
- `apps/mobile/src/app/create-profile.tsx`
- `apps/mobile/src/app/(app)/onboarding/**`
- `apps/mobile/src/app/(app)/more/account.tsx`
- `apps/mobile/src/app/(app)/mentor-memory.tsx`
- `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx`
- `apps/mobile/src/i18n/**`
- Co-located API and mobile tests, plus cross-package integration tests under
  `tests/integration/` for the new birth-date route (auth scoping).

**No DB migration [M-2].** Birth date is the single `birth_year` column with the
existing `birth_year_set_by` audit FK (`schema/profiles.ts:88-89`); the edit is a
single-column update that stamps `birthYearSetBy`. No new columns, no migration.
If exact-age (month/day) precision after an edit is ever required, that is a
separate migration adding `birth_month`/`birth_day` and is explicitly **out of
scope** here.

Out of scope:
- Identity/org membership model changes.
- New UI shell languages. This plan exposes all existing tutor-prose languages,
  including conversation-only locales, without adding UI translations.
- Age-verification vendor integrations.
- Persisting `birthMonth`/`birthDay` (no such columns exist — see above).
- Recomputing historical consent decisions automatically after a birth-date edit.
  Birth date was immutable until this plan, so there is **no pre-existing consent
  gate to reuse** [H-2]; the new birth-date contract defines its own
  bracket-crossing gate (see Product Decisions and T4).

## Product Decisions

- The first-run path is: create profile -> personalization checklist -> subject
  setup/session. Pronouns and interests are skippable; tutor-prose language is
  defaulted but editable; birth date is collected at create and editable later
  behind confirmation.
- Tutor-prose language is separate from UI shell language. The settings picker
  shows the full `conversationLanguageSchema` set: `en`, `cs`, `es`, `fr`, `de`,
  `it`, `pt`, `pl`, `ja`, `nb`. **Owner-gating [H-3]:** the self-service
  `/onboarding/language` route is owner-gated (`onboarding.ts:62-67` — a child on
  a parent's account must not unilaterally change the tutor language). The row is
  therefore shown to owners (including a self-registered minor, who is their own
  owner). For a managed child, the guardian changes it through the
  `/onboarding/:profileId/language` variant; the row is hidden when the active
  profile is a non-owner child.
- Birth date correction is allowed for the active profile and, for guardians,
  for managed child profiles they can edit. **Bracket-crossing is privileged
  [C-2].** A confirmation alone is not sufficient because raising `birthYear`
  unlocks add-child/family/billing (`profile.ts:629`) and clears the pronouns age
  gate (`onboarding.ts:133`). Rules:
  - Same-bracket correction (e.g. adult→adult): allowed for self or guardian,
    with a confirmation.
  - A **self-edit that raises the caller's own eligibility/age bracket** is
    **rejected** server-side (the caller cannot promote themselves). A genuine
    correction in that direction is a support/guardian path, not a tap-through.
  - A guardian may change a **managed child's** bracket-crossing date (both
    directions) with a legal-impact confirmation.
  - An **owner with linked children** editing self adult→minor is **rejected**
    (it would strand guardianship and break family writes —
    `profile.ts:627-636`); they must remove children first.
  - Every write stamps `birthYearSetBy` with the editing profile's id (existing
    audit FK, `schema/profiles.ts:89`).
- Interests use the existing `InterestEntry` shape and support context values
  `school`, `free_time`, and `both`.

## Tasks

- [ ] **T1: Build a first-run personalization checkpoint.** Done when:
  post-profile creation routes through a real onboarding sequence instead of
  orphaned `/onboarding/index` (today the real chain is
  `create-profile.tsx` → `handleClose()`/home or `create-subject` → `/ready` →
  session, which never visits `/onboarding/*`), and tests prove solo learners and
  child-profile creation can reach pronouns, tutor language, and interests before
  first session while preserving skip paths. **Re-entrancy, not exact resume
  [H-4]:** there is no per-step completion model — `pronouns` is nullable,
  `conversationLanguage` defaults to `'en'` (`schema/profiles.ts:97`), and
  `interests` empty are all indistinguishable from "never asked." The checkpoint
  is therefore **idempotent and re-entrant**: each step is independently skippable
  and re-openable from settings; tutor language is treated as always-defaulted
  (never a blocking step). Do **not** promise "resume at the exact incomplete
  step" unless a dedicated onboarding-progress marker is added (out of scope).

- [ ] **T2: Wire pronouns into first-run and settings.** Done when:
  `onboarding/pronouns.tsx` has production entry points from first-run and
  account/profile settings; `useUpdatePronouns` remains the only mutation path;
  users under the pronouns age gate see a skip/omit path; tests cover reachable
  first-run and settings routes. Covers `onboard-1`.

- [ ] **T3: Add a tutor-prose language settings picker.** Done when:
  a new settings row writes through `useUpdateConversationLanguage`, lists all
  10 conversation languages, does not change `i18next.language`, and makes
  Czech/French/Italian selectable even though the UI shell remains English.
  **API already exists** — `PATCH /onboarding/language` (self) and
  `/onboarding/:profileId/language` (guardian) are live and ownership-checked
  (`onboarding.ts:54-112`); this is UI wiring, not a new endpoint [L-1].
  **Owner-gating [H-3]:** show the row to owners and self-registered minors; for
  a managed child the guardian uses the `:profileId` variant; hide the row when
  the active profile is a non-owner child (the self route would 403). Tests cover
  selecting a conversation-only locale, verify UI language is unchanged, **and
  assert the row is absent / the self route is denied for a non-owner child.**
  Covers `onboard-2`.

- [ ] **T4: Add a birth-date correction API and UI.** Decided contract (not a
  fork): a **dedicated route**, `PATCH /onboarding/birth-year` (self) and
  `PATCH /onboarding/:profileId/birth-year` (guardian), mirroring the existing
  onboarding dimension routes — keeps `profileUpdateSchema` `.strict()` untouched
  (it deliberately omits `birthYear`, `profiles.ts:81-84`) rather than punching a
  hole in the general profile PATCH. New `onboardingBirthYearPatchSchema` =
  `{ birthYear: birthYearSchema }` (reuse the existing 11+ refinement,
  `profiles.ts:38-54`). Service `updateBirthYear(db, profileId, accountId,
  birthYear, editedBy)` writes `birthYear` **and** stamps `birthYearSetBy =
  editedBy` (`schema/profiles.ts:89`) — a **single-column** value update, **no**
  `birthMonth`/`birthDay` (those columns do not exist) [C-1].

  Authorization [C-2] (enforced in the service over `computeAgeBracket`, not just
  the route):
  - Self route: load the caller's current bracket; **reject with 403** if the new
    `birthYear` raises the caller's own bracket (minor→adult) — a self-promotion.
    Allow a same-bracket or lowering self-correction.
  - Guardian route: `assertOwnerAndParentAccess` (as the other `:profileId`
    routes, `onboarding.ts:160`); allow bracket changes in both directions for a
    managed child, returning the bracket-crossing flag to the client for the
    confirmation copy.
  - **Reject** an owner→minor self-edit when the owner has linked children
    (would strand guardianship — `profile.ts:627-636`).

  Done when: the routes + schema + service above exist, mobile shows age/consent
  impact before saving and only sends after confirmation on a bracket cross, and
  tests cover: same-bracket self edit (allowed), **self minor→adult promotion
  (denied, 403)**, guardian edit of a managed child crossing a bracket (allowed +
  confirmation), owner-with-children adult→minor (denied), and unauthorized cross
  -account / non-guardian edit (denied). Per CLAUDE.md "Fix Development Rules"
  this is a security boundary → ship a **red-green break test** for the self
  -promotion denial (write test, watch pass, revert guard, watch fail, restore),
  and add a `tests/integration/` case for the auth scoping. Covers `onboard-3`.

- [ ] **T5: Put interests in the first-run chain without duplicating mentor
  memory.** Done when: the interests-context editor — today inline in
  `mentor-memory.tsx` (`:60`) and duplicated in
  `child/[profileId]/mentor-memory.tsx` — is factored into one reusable
  component, first-run writes through `useUpdateInterestsContext` (self route;
  the guardian `:profileId` variant already exists, `onboarding.ts:200-222`
  [L-1]), **both** mentor-memory screens adopt the extracted component, and tests
  cover school/free-time/both context persistence. Covers `onboard-4`.

- [ ] **T6: Reconcile navigation and i18n.** Done when:
  Expo Router deep pushes use full ancestor chains, **the new strings this plan
  adds** are routed through `t()` and present in `en.json`,
  `scripts/check-i18n-orphan-keys.ts` passes, and small-screen layout (Galaxy
  S10e, 5.8") is checked for the personalization sequence. **Scope note [M-4]:**
  `create-profile.tsx` is in scope but is currently almost all hardcoded English
  JSX ("Who's the learner?", "Display name", "Continue", date-picker "Done") that
  the orphan checker cannot see (CLAUDE.md i18n known gap). Translating those
  pre-existing literals is a separate effort — this task localizes only the
  copy this plan introduces and does not regress the existing literals; a full
  `create-profile` i18n pass is explicitly deferred.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| User skips pronouns | Taps skip | Neutral confirmation that this can be edited later | Settings entry remains available |
| Tutor language unsupported by UI shell | Selects `cs`, `fr`, or `it` | Tutor-language value updates, UI remains current shell language | Change either setting independently |
| Non-owner child opens tutor-language [H-3] | Active profile is a non-owner child | Row is hidden; no self route attempted | Guardian changes it from the child's profile via the `:profileId` route |
| Birth-date edit crosses consent threshold (managed child) | Guardian changes a child's date across a bracket | Confirmation explaining consent + eligibility impact | Confirm to save or cancel |
| Self minor→adult birth-date promotion [C-2] | A user raises their own `birthYear` across a bracket | Typed 403 ("can't change your own age bracket here") | Contact support / guardian path; no self-promotion |
| Owner with children edits self → minor [H-1] | Adult owner with linked children lowers own date below adult | Typed error: remove children first | Cancel, or remove/relink children before retry |
| Crosses pronouns age gate (13) [H-1] | Edit moves a profile across `PRONOUNS_PROMPT_MIN_AGE` | Pronouns step appears/disappears accordingly | Re-open pronouns from settings if newly eligible |
| Unauthorized guardian edits child birth date | Wrong relationship/profile | Typed permission error (`assertOwnerAndParentAccess`) | Switch to an authorized profile or stop |
| Interests save fails | Network/API error | Inline retry state | Retry without losing local entries |
| First-run interrupted [H-4] | App killed during sequence | Re-entrant checklist re-opens with steps still skippable (no exact-step resume) | Continue or skip any remaining step |

## Verification

Focused checks:

```powershell
# API unit tests for profile + onboarding (incl. the new birth-year route)
pnpm exec nx run api:test --testPathPattern="profiles|onboarding"

# Integration tests — REQUIRED because this plan touches apps/api/ (routes +
# services). The pre-commit/pre-push hooks skip *.integration.test. files, so
# DB/auth-scoping regressions on the new birth-year route are only caught here.
pnpm exec nx test:integration api

# Mobile — run jest directly (the @nx/expo/plugin Windows stack-overflow bug
# means do NOT use `nx test mobile`). Note the literal parens in the (app) path.
Push-Location apps/mobile
pnpm exec jest --findRelatedTests "src/app/create-profile.tsx" "src/app/(app)/onboarding/pronouns.tsx" "src/app/(app)/more/account.tsx" --no-coverage
pnpm exec tsc --noEmit
Pop-Location
pnpm check:i18n:orphans
```

**Security break test [C-2].** The self minor→adult promotion denial is a
security boundary. Verify it red-green: write the negative-path test, watch it
pass, revert the service-side bracket guard, watch it fail, restore the guard.

If onboarding navigation changes affect Maestro flows, run the app-launch
dev-client smoke via the repo E2E skill before marking this plan done.

