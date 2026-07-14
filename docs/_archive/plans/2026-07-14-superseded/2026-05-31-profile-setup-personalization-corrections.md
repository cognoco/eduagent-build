---
title: Profile Setup, Personalization, and Corrections - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft — NOT IMPLEMENTED; parked pending identity re-triage
implementation_status: none (verified 2026-06-09 — T1/T2/T3/T4/T5 all absent from source)
recommendation: ship 80/20 slice (T1+T2+T3+T5) AFTER identity re-triage; DEFER T4 (birth-date correction)
gap_ids: [onboard-1, onboard-2, onboard-3, onboard-4]
---

# Profile Setup, Personalization, and Corrections - Implementation Plan

> ## ✅ RENAME-GATE CHECK (2026-06-27)
>
> Verified the `T1`/`T2`/`T3`/`T5` slice against the identity cutover: it is
> **independent of the physical `profiles`→`person` rename** (WI-586
> `m-repoint`/`m-drop`, still pending — inert in `apps/api/drizzle/_freeze-only/`,
> migrate chain at `0123`). The slice adds **no migration and no new `profiles`-FK**;
> it only wires existing mobile primitives and consumes already-live owner-gated
> endpoints — so unlike the sibling parked plans (note-correctness, concept-capture,
> which *do* add `profiles`-FK'd tables and wait for the rename), this slice has no
> schema to re-home. The "identity re-triage" hard gate below is now satisfiable: the
> identity model is settled and the reader cutover is live (`IDENTITY_V2_ENABLED`),
> so the slice can be classified independent and built. `T4` (birth-date correction)
> stays deferred for the reasons below — unaffected by this check.
>
> ## 🧭 STATUS AT A GLANCE (read this first — updated 2026-06-09)
>
> - **What this is:** make learner personalization (pronouns, tutor-prose language, interests, birth-date correction) reachable in first-run *and* editable later. Closes audit gaps `onboard-1..4`.
> - **Implemented?** **No — nothing.** Verified against source 2026-06-09: the birth-year route/schema/service (`onboardingBirthYearPatchSchema`, `updateBirthYear`) exist only in docs; `useUpdateConversationLanguage` is not wired into any settings screen; `create-profile.tsx` still has no push into `/onboarding/*`. All six tasks are genuinely unstarted.
> - **Should it be implemented?** **Not as one unit, and not before the identity re-triage.** Split it:
>   - **Do (80/20 slice):** `T1`+`T2`+`T3`+`T5` — wire already-built primitives (pronouns screen, language hook+live API, interests editor) into first-run and settings. Low risk, no new mutable PII, no migration, no authorization minefield. Delivers `onboard-1/-2/-4` and ~80% of the felt value. See [§ 80/20 Analysis](#8020-analysis--what-to-build-and-what-to-defer).
>   - **Defer:** `T4` (birth-date correction) — ~70% of the risk for ~20% of the value; defines new bracket-crossing authorization on the `owner` concept that the identity reset *dissolves*, and ships a known UX dead-end ([H-EU-1](#failure-modes)) with no in-plan escape. Revisit after the identity reset + a real correction-flow decision.
> - **Hard gate:** re-triage against the identity-foundation clean-cut target before acting. The `owner`-gating that `T3`/`T5` consume and `T4` extends is being reshaped. See [`_wip/identity-foundation/ROADMAP.md`](../../_wip/identity-foundation/ROADMAP.md) § "Sibling-plan re-triage" and memory `project_identity_foundation_reconstruction.md`.
> - **End-user critique:** this plan was additionally red-teamed from the *end-user* perspective on 2026-06-08; findings (IDs `*-EU-*`) are folded into Product Decisions, Tasks, and Failure Modes below.

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
    **[H-EU-1]** Note this is the dead-end risk: a self-registered minor has no
    guardian, so the "support/guardian path" must be a *real, reachable* escape —
    see the T4 end-user blockers. A flat 403 is not acceptable on its own.
  - A guardian may change a **managed child's** bracket-crossing date (both
    directions) with a legal-impact confirmation. **[M-EU-4]** The confirmation
    must be **concrete**, not abstract — state exactly what the child gains or
    loses ("Your child will now be able to … / will no longer …"), not just
    "eligibility impact".
  - An **owner with linked children** editing self adult→minor is **rejected**
    (it would strand guardianship and break family writes —
    `profile.ts:627-636`); they must remove children first.
  - Every write stamps `birthYearSetBy` with the editing profile's id (existing
    audit FK, `schema/profiles.ts:89`).
- Interests use the existing `InterestEntry` shape and support context values
  `school`, `free_time`, and `both`.

## 80/20 Analysis — What to build, and what to defer

The value and the cost/risk in this plan are **not** evenly spread. `T4`
(birth-date correction) carries the majority of the risk, the only new mutable
PII surface, the only new authorization logic, and the tightest coupling to the
`owner` concept the identity reset dissolves — for a modest, rarely-needed
feature. The other tasks mostly *wire primitives that already exist* into
surfaces users can reach.

**Recommended split:**

| Bucket | Tasks | Delivers | Risk | Verdict |
|---|---|---|---|---|
| **80/20 slice** | `T1`, `T2`, `T3`, `T5` (+ new-strings slice of `T6`) | `onboard-1` (pronouns reachable), `onboard-2` (tutor-language picker), `onboard-4` (interests in first-run); ~80% of felt "I can personalize my tutor" value | Low — reuses built code (pronouns screen, `useUpdateConversationLanguage` + live owner-gated API, interests editor), no new mutable PII, **no migration**, no bracket-crossing authorization. Only *consumes* current `owner`-gating, doesn't define new logic → survives identity reset with a re-point. | **Do, after re-triage.** |
| **Defer** | `T4` | `onboard-3` (birth-date correction) | High — turns an immutable field mutable (privilege-escalation surface), defines new bracket-crossing authorization on the soon-dissolved `owner` concept, and ships the [H-EU-1](#failure-modes) dead-end whose real fix (support SOP / verification flow) is a separate project. Value is modest: signup birth-year typos are rare and the under-stated direction self-corrects as the user ages in real time. | **Defer** until identity reset lands **and** a correction-flow decision exists. |

**Why the split is clean (no hidden dependency):** birth date is already
collected at profile creation (`create-profile.tsx` sends `birthYear`/
`birthMonth`/`birthDay`), so `T4` is purely the *later edit*. Nothing in
`T1`/`T2`/`T3`/`T5` needs it. Deferring `T4` also defers its unsolved dead-end
rather than shipping it.

**Sequencing:** the re-triage is a cheap *classification* decision (is each task
identity-coupled or independent?), not implementation. Do it first; it will
almost certainly bless `T1`/`T2`/`T3`/`T5` as independent and flag `T4` as
coupled — exactly this split.

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
  **End-user [M-EU-6 — re-entry trigger]:** "re-entrant checklist re-opens"
  needs a concrete trigger, since there is no progress marker. Define one
  explicit account-level flag (e.g. `hasSeenFirstRunChecklist`, set on first
  exit of the sequence) so the checklist re-opens after an app-kill but does
  **not** nag a user who deliberately skipped every step. Without it the
  behaviour is undefined (lost checklist *or* forever-nag).
  **End-user [M-EU-5 — fatigue + framing]:** create → pronouns → language →
  interests → subject → session front-loads 3-4 gates before any value. Keep
  every step genuinely skippable, add a one-line "why we ask" rationale to each
  (birth date especially feels invasive at first run), and instrument first-run
  drop-off so we can later decide whether to defer steps to *after* a first
  session.

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
  **End-user [H-EU-2 — managed children stranded on English]:** `create-profile.tsx`
  seeds `conversationLanguage` from device UI locale **only for self-creates**;
  parent-creates-child omits it, so a managed child on the parent's account who
  never self-signs-in keeps an English-speaking tutor forever. The guardian
  picker is the fix surface, but the gap is silent. In the first-run guardian
  checklist, **proactively surface the child's resolved tutor language** with an
  explicit "change" affordance — do not hide it behind the default. Also: T1's
  "always-defaulted to `en`" framing must **preserve, not flatten**, the existing
  self-create UI-locale seeding (don't re-default to `en`).
  **End-user [M-EU-3 — hidden row confuses the child]:** rather than rendering
  *nothing* for a non-owner child, render a disabled/explanatory row
  ("Ask whoever set up your account to change this") so the child understands the
  setting exists and is guardian-controlled.
  **End-user [L-EU-2 — set expectations at selection]:** when a learner picks a
  conversation-only locale (`cs`/`fr`/`it`), label it in the picker itself
  ("Tutor speaks Italian; the app stays in English"), not only as a post-hoc
  failure mode.

- [ ] **T4: Add a birth-date correction API and UI. ⛔ DEFERRED** (see
  [§ 80/20 Analysis](#8020-analysis--what-to-build-and-what-to-defer)) — do
  **not** build until the identity reset lands and the end-user blockers below
  are resolved. Decided contract (not a
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

  **End-user blockers (must resolve before T4 is un-deferred):**
  - **[H-EU-1 — the 403 is a dead-end].** Age brackets are computed live from
    `birthYear`, so real-world aging auto-promotes a user without any edit;
    therefore raising your own `birthYear` is **only ever** correcting a signup
    typo, never a legitimate "I aged up" event. A flat 403 rejects 100% of
    honest typo-corrections, and a self-registered minor has **no guardian**
    (they are their own owner) to fall back to. The only escape is the
    `mailto:support@mentomate.app` row under More→Help (`more/help.tsx:18`),
    which this plan neither links from the error nor backs with a defined
    support-side correction SOP. This **violates the CLAUDE.md UX Resilience
    rule** ("never dead-end states with no actionable escape"). Resolve by EITHER
    (a) replacing the flat 403 with a **bounded verified self-correction**
    (re-enter full birth date behind soft friction), OR (b) making the 403 a
    real escape: deep-link it to a prefilled support composer **and** specify the
    support-side correction process in this plan. A typo'd minor must have a
    tap-path out.
  - **[M-EU-2 — year-only edit is inconsistent and loses precision].** Creation
    collects a **full date** via the date-picker and sends
    `birthYear`/`birthMonth`/`birthDay` for exact-age computation
    (`create-profile.tsx`), but this contract is **year-only** (`{ birthYear }`).
    So the user picks a full date to sign up but corrects only a year, and the
    age-gate result can **flip** relative to the exact-age signup computation
    (year-only overestimates age). Either accept a full date on the edit (compute
    bracket, persist year) or explicitly tell the user the correction is
    year-granularity. Do **not** silently degrade precision on a "correction".
  - **[M-EU-1 — error copy is system-speak].** "can't change your own age bracket
    here" is meaningless to a teen who typed a birthday. Rewrite to human terms
    + the concrete next action (the H-EU-1 support deep-link).
  - **[L-EU-3 — guardian entry point unpinned].** Scope lists
    `child/[profileId]/mentor-memory.tsx` but no child-settings birth-date
    surface. Pin where the guardian finds the child birth-date edit, or the
    flow is undiscoverable.

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
| Non-owner child opens tutor-language [H-3, M-EU-3] | Active profile is a non-owner child | **Disabled/explanatory row** ("Ask whoever set up your account to change this") — not a silent absence; no self route attempted | Guardian changes it from the child's profile via the `:profileId` route |
| Managed child left on English tutor [H-EU-2] | Parent-created child, language omitted at create, child never self-signs-in | Guardian first-run checklist surfaces the child's resolved tutor language with a "change" affordance | Guardian sets it via the `:profileId` route; not left silently defaulted |
| Picks a conversation-only locale [L-EU-2] | Learner selects `cs`/`fr`/`it` | Picker labels it at selection ("Tutor speaks Italian; app stays in English") | Change either setting independently |
| Birth-date edit crosses consent threshold (managed child) | Guardian changes a child's date across a bracket | Confirmation explaining consent + eligibility impact | Confirm to save or cancel |
| Self minor→adult birth-date promotion [C-2, H-EU-1, M-EU-1] | A user raises their own `birthYear` across a bracket (always a signup typo — real aging auto-promotes) | Human-readable copy (not "age bracket") explaining why + a **reachable next action** | **Real escape required**: bounded verified self-correction, or a 403 that deep-links to a prefilled support composer backed by a defined correction SOP. A flat dead-end 403 is **not acceptable** (no guardian exists for a self-registered minor) |
| Owner with children edits self → minor [H-1] | Adult owner with linked children lowers own date below adult | Typed error: remove children first | Cancel, or remove/relink children before retry |
| Crosses pronouns age gate (13) [H-1, L-EU-1] | Edit moves a profile across `PRONOUNS_PROMPT_MIN_AGE` | Pronouns step appears/disappears accordingly **+ a one-time hint when newly eligible** (don't rely on the user noticing) | Re-open pronouns from settings if newly eligible |
| Unauthorized guardian edits child birth date | Wrong relationship/profile | Typed permission error (`assertOwnerAndParentAccess`) | Switch to an authorized profile or stop |
| Interests save fails | Network/API error | Inline retry state | Retry without losing local entries |
| First-run interrupted [H-4] | App killed during sequence | Re-entrant checklist re-opens with steps still skippable (no exact-step resume) | Continue or skip any remaining step |

## End-User Findings (red-teamed 2026-06-08, folded in)

This plan was reviewed a second time from the **end-user perspective** (the first
red-team, 2026-05-31, covered code/security correctness → `C-*`/`H-*`). The lived
experience of the learner and guardian surfaced the findings below. All are
folded into the sections cited; this table is the index.

| ID | Sev | Finding | Folded into |
|---|---|---|---|
| H-EU-1 | HIGH | Self minor→adult 403 is a dead-end — every hit is an honest typo, and a self-registered minor has no guardian; support path unwired + no correction SOP. Violates UX Resilience rule. | T4 blockers; Product Decisions; Failure Modes |
| H-EU-2 | HIGH | Parent-created children stay on an English tutor forever with no signal; core value-prop miss. | T3; Failure Modes |
| M-EU-1 | MED | Error copy ("can't change your own age bracket") is system-speak with no next action. | T4 blockers; Failure Modes |
| M-EU-2 | MED | Year-only correction is inconsistent with full-date creation and can flip the age gate (precision loss). | T4 blockers |
| M-EU-3 | MED | Hidden tutor-language row leaves the child confused; prefer a disabled/explanatory row. | T3; Failure Modes |
| M-EU-4 | MED | Guardian bracket-cross confirmation is vague; needs concrete gain/lose copy. | Product Decisions |
| M-EU-5 | MED | Onboarding fatigue — 3-4 gates before any value; needs skippability + "why we ask" + drop-off instrumentation. | T1 |
| M-EU-6 | MED | First-run re-entry trigger undefined (no progress marker) → lost-checklist vs forever-nag. | T1 |
| L-EU-1 | LOW | Crossing the pronouns gate gives no notification that pronouns are newly available. | Failure Modes |
| L-EU-2 | LOW | Conversation-only locales should set expectations at selection time. | T3; Failure Modes |
| L-EU-3 | LOW | Guardian entry point for child birth-date edit not pinned in UI. | T4 blockers |

**Gets right (no change needed):** the security *rationale* for blocking
self-promotion is sound (the issue is the missing escape, not the block);
skip-with-neutral-confirmation, interests retry-without-losing-entries, and
tutor/UI language separation are all handled well.

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

