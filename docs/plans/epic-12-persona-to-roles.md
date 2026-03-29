# Epic 12: Remove Persona Enum — Age + Role + Intent (POST-LAUNCH)

**Author:** Zuzka + Claude
**Date:** 2026-03-29
**Status:** Spec complete, development deferred to post-launch

---

## Problem Statement

The current system jams three independent concepts into one `personaType` enum (`TEEN | LEARNER | PARENT`):

1. **Age** — computed from `birthDate`, drives LLM voice tone, session timer caps, and consent requirements
2. **Parental relationship** — whether the account has linked children, drives oversight capabilities
3. **Session intent** — what the user wants to do right now (homework, learn, browse, check kid's progress)

None of these are personas. "Teen" is an age bracket. "Parent" is a relationship. "Eager learner" vs "casually browsing" is a mood. None belong in a profile enum.

## Design Principles

- The `personaType` field goes away entirely
- Profile stores who you are: `displayName`, `birthDate`
- The system derives everything else at runtime
- A parent who wants to learn doesn't need a second profile
- The user never sees or picks a "persona"

---

## Functional Requirements

### FR200: Age-Based Classification (replaces persona auto-detection)

- **FR200.1:** Age bracket is computed at runtime from `profile.birthDate`, never stored as a separate column.
- **FR200.2:** Age brackets: `child` (< 13), `adolescent` (13-17), `adult` (18+). These drive:
  - LLM voice tone (`getPersonaVoice()` → `getAgeVoice()`)
  - Session timer caps (child: 15/20 min, adolescent/adult: 25/30 min)
  - Consent requirements (< 16: GDPR parental consent required)
- **FR200.3:** Age bracket labels are never shown to the user. The app just behaves appropriately.

### FR201: Dynamic Parent Capabilities

- **FR201.1:** If `familyLinks` exist for the current profile (i.e., linked children), a "Family" tab appears in the tab bar automatically.
- **FR201.2:** Parent oversight features (dashboard, transcripts, consent management) are available alongside learning features — not instead of them.
- **FR201.3:** A parent can learn AND check their kid's progress from the same profile. No profile switching required.
- **FR201.4:** When the last child link is removed, the Family tab disappears.

### FR202: Theme Decoupling

- **FR202.1:** Theme (light/dark mode + accent color) is a user preference, not derived from age or role.
- **FR202.2:** Default theme follows system preference (light/dark). Accent color defaults to the brand blue (#378ADD, see Epic 11).
- **FR202.3:** The accent picker (already exists on More screen) becomes the sole theme control.

### FR203: Database Migration

- **FR203.1:** The `persona_type` PostgreSQL enum and column are removed from the `profiles` table.
- **FR203.2:** Migration is reversible: a down migration re-adds the column and populates it from `birthDate` using the same age brackets.
- **FR203.3:** API continues to accept `personaType` in profile creation requests during a transition period, but ignores it (derives from `birthDate`).

### FR204: LLM Voice Refactor

- **FR204.1:** `getPersonaVoice()` is replaced by `getAgeVoice(birthDate)` which computes age and returns the appropriate voice instructions.
- **FR204.2:** Voice tones remain the same — only the lookup key changes (age bracket instead of persona enum).
- **FR204.3:** No change to the actual LLM prompt content — just how it's selected.

### FR205: Session Timer Refactor

- **FR205.1:** `SessionTimerConfig.personaType` replaced by `SessionTimerConfig.birthDate`.
- **FR205.2:** Timer logic changes from `if (personaType === 'TEEN')` to `if (computeAge(birthDate) < 13)`.
- **FR205.3:** Adolescents (13-17) get the same timer caps as adults (25/30 min). Previously "TEEN" (<13) and "LEARNER" (13-17) had different thresholds only because they were separate enum values — the actual timer code treated TEEN as the only short-session persona.

---

## Architecture Decisions

### AD1: No new enum — compute at runtime

Age bracket is a pure function of `birthDate` and the current date. Storing it would create a stale-data problem (the bracket changes on the user's birthday). Compute it every time it's needed.

```typescript
type AgeBracket = 'child' | 'adolescent' | 'adult';

function computeAgeBracket(birthDate: string): AgeBracket {
  const age = computeAge(birthDate);
  if (age < 13) return 'child';
  if (age < 18) return 'adolescent';
  return 'adult';
}
```

### AD2: Parent capabilities via familyLinks, not role flag

No new `isParent` boolean. The `familyLinks` table already tracks parent-child relationships. Query it:
- `familyLinks.length > 0` → show Family tab
- `familyLinks.length === 0` → hide Family tab

This is already how the parent dashboard works — it queries `familyLinks` for the account. The change is making the tab bar dynamic rather than route-group-based.

### AD3: Route groups merge

Currently:
- `(learner)/` — learning screens + tab bar (Home, Book, More)
- `(parent)/` — parent dashboard + tab bar (Dashboard, More)

After:
- `(app)/` — single route group with dynamic tab bar:
  - Home, Book, More (always)
  - Family (if familyLinks exist)

The `persona === 'parent'` redirect in `_layout.tsx` is removed.

### AD4: Migration strategy

Phase 1 (backwards-compatible):
1. Add `computeAgeBracket()` utility
2. Replace all `personaType` reads with `computeAgeBracket(birthDate)`
3. Keep `personaType` column but stop writing to it
4. Tests verify age-based logic matches old persona-based logic

Phase 2 (cleanup):
1. Remove `personaType` from Zod schemas
2. Drop column via Drizzle migration
3. Remove enum from PostgreSQL

---

## Epic 12 — Stories

### Story 12.1: Age-based LLM voice and timer caps

**Scope:** Replace `getPersonaVoice(personaType)` with `getAgeVoice(birthDate)`. Replace `SessionTimerConfig.personaType` with `birthDate`-based age check. Pure backend refactor — no UI changes.

**Acceptance criteria:**
- `getAgeVoice()` returns same voice prompts as before, keyed by age bracket
- Session timer caps unchanged: <13 gets 15/20 min, 13+ gets 25/30 min
- All existing exchange and session-lifecycle tests pass with updated fixtures
- No personaType references remain in `services/exchanges.ts` or `services/session-lifecycle.ts`

**Tests:** Update fixtures in `exchanges.test.ts`, `session-lifecycle.test.ts`. Verify voice output matches for each age bracket.

### Story 12.2: Dynamic tab bar — Family tab for parents

**Scope:** Merge `(learner)` and `(parent)` route groups into single `(app)` group. Tab bar shows Family tab when `familyLinks` exist for the active profile.

**Acceptance criteria:**
- Single route group replaces both `(learner)` and `(parent)`
- Tab bar: Home, Book, [Family if parent], More
- Family tab contains current parent dashboard screens
- A parent can access both learning and family screens without switching profiles
- Navigation guards (consent, post-approval) still work

**Tests:** Integration test for tab bar rendering with/without familyLinks. E2E flow: parent sees Family tab, taps it, sees dashboard, switches to Home, starts a learning session.

### Story 12.3: Theme decoupled from persona

**Scope:** Remove `schemeForPersona()` mapping. Theme follows system preference by default. Accent picker is the sole theme control. Design tokens no longer have persona-keyed palettes.

**Acceptance criteria:**
- `design-tokens.ts` has one light palette and one dark palette (no per-persona variants)
- Color scheme follows system preference unless user overrides
- Accent picker on More screen works independently of profile type
- No `persona` parameter in theme token resolution

**Tests:** Update theme-related tests. Verify accent picker works. E2E: switch between light/dark and verify colors.

### Story 12.4: Remove personaType from database and schemas

**Scope:** Drop `persona_type` column and enum from profiles table. Remove from Zod schemas. Update profile CRUD.

**Acceptance criteria:**
- `personaType` removed from `profileCreateSchema`, `profileUpdateSchema`, `profileSchema`
- `persona_type` column dropped via Drizzle migration
- `persona_type` enum removed from PostgreSQL
- Profile creation derives all behavior from `birthDate`
- Backwards-compatible: API ignores `personaType` if sent (no 400 error during client rollout)

**Tests:** Update all 22 test files that reference personaType. Run full test suite. Run migration against dev database.

### Story 12.5: Remove profile-based persona routing

**Scope:** Remove `persona === 'parent'` redirect from learner layout. Remove `PersonaType` from mobile theme context. Clean up `detectPersona()` calls.

**Acceptance criteria:**
- No `persona` concept in mobile code
- `useTheme()` no longer exposes `persona`
- Home screen renders same content regardless of age (coaching card already adapts)
- Profile creation form: just name + birthDate (persona picker already hidden in Task 2)

**Tests:** Remove persona-specific assertions from mobile tests. E2E: verify all user types see the same app structure.

---

## Dependency Order

```
Story 12.1 (LLM + timers)     — no dependencies, pure backend
Story 12.3 (theme decoupling)  — no dependencies, pure frontend
Story 12.2 (dynamic tab bar)   — depends on 12.1 (age logic exists)
Story 12.5 (remove persona routing) — depends on 12.2 (single route group exists)
Story 12.4 (DB migration)      — depends on 12.1 + 12.2 + 12.3 + 12.5 (all reads gone)
```

Stories 12.1 and 12.3 can be done in parallel. Story 12.4 is always last (removes the column only after all code stops reading it).

---

## What Was Already Done (Task 2, 2026-03-29)

- Persona picker hidden from `create-profile.tsx` (commented out, auto-detects from birthDate)
- Birth date field has explanatory copy ("personalise how your coach talks to you")
- ProfileSwitcher shows "Student" / "Parent" instead of "Teen" / "Learner" / "Parent"
- `profiles.tsx` modal shows "Student" / "Parent" role labels
- All tests updated and passing (170 tests, 17 suites)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Route group merge breaks deep links | Audit all `router.push`/`router.replace` calls before merging |
| familyLinks query adds latency to tab bar | Cache in React Query (already cached), show tabs optimistically |
| Existing TEEN/LEARNER data in prod DB | Migration converts rows; computed age bracket is source of truth |
| Third-party integrations read personaType | Audit: Sentry tags, Inngest event payloads, RevenueCat metadata |
