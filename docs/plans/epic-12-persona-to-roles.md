# Epic 12: Remove Persona Enum — Age + Role + Intent-as-Cards (POST-LAUNCH)

**Author:** Zuzka + Claude
**Date:** 2026-03-30 (revised), 2026-04-13 (status update)
**Status:** Near complete — only Story 12.3 (theme decoupling) remains. See `plan-master.md` for current story-level status.
**Supersedes:** v1 (dynamic tab bar model, 2026-03-29)

---

## What Changed from v1 and Why

| Original (v1) | Revised (v2) | Why |
|---------------|-------------|-----|
| `birthDate` (full date) for age | `birthYear` (integer) for age | Less PII. Age bracket changes on Jan 1, not birthday — no jarring mid-year voice shift. |
| Dynamic Family tab (appears/disappears) | Stable tab bar + Family as home card | Dynamic tabs break muscle memory. Tab positions shift when Family appears/disappears. |
| Session intent in profile settings | Per-session intent via home cards | Intent changes every session. Burying it in settings makes it stale by day 2. |
| "What brings you here?" picker (considered) | AI-ranked cards, user taps to choose | Pickers cause frequency fatigue. Cards let the AI suggest without blocking. |
| Parent dashboard = separate route group | Parent dashboard = home card showing real data | Parent oversight is a card tap, not a mode switch. Same app for everyone. |
| Single coaching card on home | 2-3 ranked home cards | Multiple cards = multiple intents visible, no settings needed for intent switching. |

---

## Problem Statement

The current system jams three independent concepts into one `personaType` enum (`TEEN | LEARNER | PARENT`):

1. **Age** — computed from `birthYear`, drives LLM voice tone and consent requirements
2. **Parental relationship** — whether the account has linked children, drives oversight capabilities
3. **Session intent** — what the user wants to do right now (homework, learn, browse, check kid's progress)

None of these are personas. "Teen" is an age bracket. "Parent" is a relationship. "Homework vs study" is a mood that changes daily. None belong in a profile enum.

Additionally, session intent is currently buried in profile settings — a static choice that goes stale. A teen who usually does homework but today wants to study deeply must dig into Settings to change their mode. This friction kills spontaneity.

## Design Principles

- The `personaType` field goes away entirely
- Profile stores who you are: `displayName`, `birthYear`
- Age is derived at runtime from `birthYear`, never stored as a separate column
- Parent capabilities are derived from `familyLinks` existence, no `isParent` flag
- **Intent is not stored or asked — it's expressed per-session by tapping a home card**
- A parent who wants to learn taps a learning card. Same profile. No switching.
- The user never sees or picks a "persona"
- The home screen IS the intent surface

---

## The Three Independent Axes

| Concern | Source | Stored? | Changes when? |
|---------|--------|---------|---------------|
| **Age** (LLM voice, consent) | `birthYear` on profile | Yes (integer) | On year rollover |
| **Role** (parent features) | `familyLinks` existence | Derived at runtime | When links added/removed |
| **Intent** (session mode) | Home screen card taps | Not stored as setting | Every app open |

---

## Functional Requirements

### FR200: Age-Based Classification (replaces persona auto-detection)

- **FR200.1:** Age bracket is computed at runtime from `profile.birthYear` and the current year, never stored as a separate column.
- **FR200.2:** Age brackets: `child` (< 13), `adolescent` (13-17), `adult` (18+). These drive:
  - LLM voice tone (`getPersonaVoice()` → `getAgeVoice()`)
  - Consent requirements (< 16: GDPR parental consent required — conservative: if `currentYear - birthYear <= 16`, require consent)
- **FR200.3:** Age bracket labels are never shown to the user. The app just behaves appropriately.

### FR201: Dynamic Parent Capabilities

- **FR201.1:** If `familyLinks` exist for the current profile as a parent (i.e., linked children), a **Family card** appears on the home screen with real child data (name, today's activity, reviews due).
- **FR201.2:** Parent oversight features (dashboard, transcripts, consent management) are available alongside learning features — not instead of them. Accessed via Family card → dashboard navigation, not a separate tab or route group.
- **FR201.3:** A parent can learn AND check their kid's progress from the same profile. No profile switching required. Different cards on the same home screen.
- **FR201.4:** When the last child link is removed, the Family card disappears from the home screen. No tabs shift, no navigation changes — just one fewer card.
- **FR201.5:** Cold-start case: when a new parent creates an account and indicates parental intent ("Do you have children who'll use EduAgent?" → Yes), but has not yet linked a child, a "Link your child" card appears on the home screen. The onboarding flow guides child linking.

### FR202: Theme Decoupling

- **FR202.1:** Theme (light/dark mode + accent color) is a user preference, not derived from age or role.
- **FR202.2:** Default theme follows system preference (light/dark). Accent color defaults to the brand blue (#378ADD, see Epic 11).
- **FR202.3:** The accent picker (already exists on More screen) becomes the sole theme control.

### FR203: Database Migration

- **FR203.1:** The `persona_type` PostgreSQL enum and column are removed from the `profiles` table.
- **FR203.2:** The `birth_date` column is migrated to `birth_year` (integer). Existing rows: extract year from `birth_date`.
- **FR203.3:** A new `birth_year_set_by` column (nullable profile ID) tracks who set the birth year. If not null, the birth year was set by a parent and the child cannot edit it.
- **FR203.4:** ~~Migration is reversible: a down migration re-adds columns and populates from computed values.~~ **Zero-user simplification: SKIP.** No production data to roll back. Reinstate if deferred past first real-user cohort.
- **FR203.5:** ~~API continues to accept `personaType` in profile creation requests during a transition period (2 mobile release cycles), but ignores it. After the transition window, the field is rejected with a 400 error. Deprecation header (`X-Deprecated-Field: personaType`) during transition.~~ **Zero-user simplification: SKIP.** Just remove `personaType` from schemas. No transition period, no deprecation header. Reinstate if deferred past first real-user cohort.

### FR204: LLM Voice Refactor

- **FR204.1:** `getPersonaVoice()` is replaced by `getAgeVoice(birthYear)` which computes age bracket and returns the appropriate voice instructions.
- **FR204.2:** Voice tones remain the same — only the lookup key changes (age bracket instead of persona enum).
- **FR204.3:** No change to the actual LLM prompt content — just how it's selected.
- **FR204.4:** Age bracket transition is smooth: since `birthYear` (not full date) is used, the bracket only changes on January 1st — a natural boundary, not the user's birthday.

### FR205: Session Timer Refactor

- **FR205.1:** `SessionTimerConfig.personaType` is removed entirely. Timer config no longer depends on persona or age.
- **FR205.2:** Hard caps and nudge thresholds are removed — see Epic 13 (FR213). No forced session end for any age group.
- **FR205.3:** Only silence detection remains: 8-min silence cap (Epic 13 FR210), 30-min auto-save/close. Age-agnostic.
- **FR205.4:** If future product research indicates a need for session limits, implement as a parent-configurable setting — not a system-imposed hard cap.

### FR206: Analytics & Event Schema Migration

- **FR206.1:** All analytics events, Sentry tags, and Inngest event payloads that include `personaType` must be updated to use `ageBracket` (or remove the field if not needed).
- **FR206.2:** If analytics dashboards or reports segment by persona, update them to segment by age bracket before dropping the column.
- **FR206.3:** RevenueCat customer metadata that references persona must be updated to age bracket or removed.
- **FR206.4:** Home card tap events tracked in `sessionEvents` with `eventType: 'home_card_tap'` and card type metadata — new analytics dimension for understanding intent patterns.
- **FR206.5:** Sentry age-gating function (`evaluateSentryForProfile` in `apps/mobile/src/lib/sentry.ts`) must be updated from `birthDate` to `birthYear`. This is distinct from Sentry tags — it's the Apple-compliance function that disables tracking for under-13 without consent. The age calculation changes from `Date`-based to `currentYear - birthYear`.
- **FR206.6:** Consent-web deep links (`apps/api/src/routes/consent-web.ts`) must be updated: `mentomate://parent/dashboard` → `mentomate://home` (or whatever the post-merge home route is), `mentomate://onboarding?persona=learner` → remove `persona` param. These are server-rendered HTML links in the parent consent email page, not mobile router calls — a `router.push` grep will not catch them.
- **FR206.7:** Consent service (`services/consent.ts`) function `checkConsentRequired(birthDate)` must be updated to accept `birthYear` (integer) and use the conservative formula `currentYear - birthYear <= 16`. The `ProfileMeta` interface in `middleware/profile-scope.ts` changes `birthDate: string | null` → `birthYear: number | null`. All consent middleware and route consumers must be updated.
- **FR206.8:** Test factory (`packages/factory/src/profiles.ts`) must remove `personaType: 'LEARNER'` default from `buildProfile()` and add `birthYear` default. Test seed service (`apps/api/src/services/test-seed.ts`, ~28 persona refs) must be fully migrated. This is a prerequisite for all other test updates — broken factory = ~1,443 broken tests.

### FR207: Prioritized Home Cards (NEW — the intent surface)

- **FR207.1:** The home screen displays 2-3 ranked action cards, replacing the single coaching card (`AdaptiveEntryCard`). Each card represents a possible session intent or action.
- **FR207.2:** Card types: Homework, Study/Continue, Review, Family, Resume Session (crash recovery), Link Child (cold-start). See Story 12.7 for full card type table.
- **FR207.3:** Card ranking uses a simple heuristic (no ML): time-of-day patterns, recent session modes, reviews due, familyLinks, and dismissal history. `precomputeHomeCards(profileId)` replaces `precomputeCoachingCard()`.
- **FR207.4:** Layout: primary card (large, full-width) is the AI's best bet. Secondary cards (smaller, side-by-side) are alternatives. Cold start: all cards equal-sized.
- **FR207.5:** Minimum 2 cards visible at all times. The user always has a choice — never reduced to a single forced option.
- **FR207.6:** Card taps are tracked in `sessionEvents` (`eventType: 'home_card_tap'`) to improve future ranking.
- **FR207.7:** Each card has a dismiss affordance (× button). Dismissed cards hidden for current session. Cards dismissed 3+ times deprioritized in ranking. Co-designed with Epic 14 FR221.
- **FR207.8:** Resume Session card (Epic 13 FR211 crash recovery) takes highest priority when present, displacing normal ranking.

---

## Architecture Decisions

### AD1: Birth year, not birth date

`birthYear` (integer) instead of `birthDate` (date). Less PII under GDPR for minors. Age bracket changes on January 1st, not the user's birthday — no jarring mid-year voice change. Sufficient precision for `computeAgeBracket()`.

```typescript
type AgeBracket = 'child' | 'adolescent' | 'adult';

function computeAgeBracket(birthYear: number): AgeBracket {
  const age = new Date().getFullYear() - birthYear;
  if (age < 13) return 'child';
  if (age < 18) return 'adolescent';
  return 'adult';
}
```

Conservative GDPR: if `currentYear - birthYear <= 16`, require parental consent (assumes worst-case birthday within the year).

### AD2: Parent locks child's birth year

| Account type | Who sets birthYear | Can child edit? | Can parent edit? |
|---|---|---|---|
| Child (< 16, GDPR) | Parent creates profile, sets birth year | No — field disabled, "Set by your parent" | Yes |
| Teen (16-17, self-signup) | Teen sets it themselves | Yes (they self-registered) | Can view if linked, not override |
| Adult (18+) | Self | Yes | N/A |

Tracked via `birthYearSetBy` column (nullable profile ID). If not null, the field is read-only for the profile owner.

### AD3: Parent capabilities via familyLinks, not role flag

No new `isParent` boolean. The `familyLinks` table already tracks parent-child relationships. Family card appears when `familyLinks` exist for the profile as a parent. Query is directional: only links where the current profile is the parent, not the child.

### AD4: Home cards — the intent surface

Intent is not stored, not asked, and not a profile setting. It's expressed per-session by tapping a home card. The AI ranks cards based on behavioral signals:

```typescript
type HomeCardInput = {
  reviewsDue: number;                    // from retention service
  activeSubjects: Subject[];             // from curriculum
  familyLinks: FamilyLink[];             // from DB (as parent only)
  recentSessions: Session[];             // last 7 days
  hourOfDay: number;                     // current time
  dayOfWeek: number;                     // current day
  lastSessionMode: string;               // what they did last time
  modeFrequency: Record<string, number>; // homework: 12, study: 3, review: 5
  dismissalCounts: Record<string, number>; // per card type, from sessionEvents
};
```

No ML — just: "At this hour, on this day, what has this user done most often?" + "What's objectively due (reviews)?" + "Do they have family?"

### AD5: Route groups merge — stable tabs

Currently: `(learner)/` (Home, Book, More) and `(parent)/` (Dashboard, Book, More).

After: `(app)/` — single route group with **stable** tab bar: Home, Book, More. Always 3 tabs, never changes. Parent dashboard is navigated to from the home screen Family card, not via a tab.

This avoids the dynamic-tab anti-pattern (tabs appearing/disappearing breaks spatial muscle memory).

### AD6: Migration strategy

**If zero users (current state — preferred):**
Single-pass migration. No backwards-compatibility phase needed.
1. Add `computeAgeBracket()` utility
2. Replace all `personaType` reads with `computeAgeBracket(birthYear)` — includes consent pipeline (FR206.7), Sentry age-gating (FR206.5), test factory + test-seed (FR206.8)
3. Update consent-web deep links (FR206.6)
4. Build `precomputeHomeCards()` service
5. Drop `personaType` column, `birthDate` column, and enum in one migration. Add `birthYear` (integer) + `birthYearSetBy` (nullable profile ID).

**If deferred past first real users (reinstate phased approach):**

Phase 1 (backwards-compatible):
1. Add `computeAgeBracket()` utility
2. Replace all `personaType` reads with `computeAgeBracket(birthYear)`
3. Add `birthYear` column, populate from `birthDate`, add `birthYearSetBy`
4. Build `precomputeHomeCards()` service
5. Keep `personaType` column but stop writing to it
6. API accepts `personaType` for 2 release cycles (FR203.5), deprecation header

Phase 2 (cleanup):
1. Remove `personaType` from Zod schemas
2. Drop `personaType` column and `birthDate` column via Drizzle migration
3. Remove enum from PostgreSQL
4. Reversible down migration (FR203.4)

---

## Stories

See `docs/epics.md` Epic 12 stories section for full story details (Stories 12.1-12.7).

---

## Cross-Epic Interactions

| Epic | Interaction |
|------|-------------|
| **Epic 14 Story 14.1 (FR221)** | Card dismissal co-designed with Story 12.7. Dismissal data feeds home card ranking algorithm. |
| **Epic 13 FR211** | Crash recovery "unfinished session" card becomes a home card with highest priority. |
| **Epic 13 FR213** | Timer caps removed — coordinated with Story 12.1 (both remove persona from timer config). |
| **Epic 7 FR121** | Age-based visualization threshold uses `birthYear` instead of `birthDate`. Trivial change. |
| **Epic 3 FR130** | EVALUATE framing keyed by age bracket instead of persona. Same voices, different lookup. |
| **Epic 14 FR219** | Quick-action chips in sessions use exchange metadata, not persona. No dependency. |
| **Epic 0 (consent)** | `checkConsentRequired(birthDate)` → `birthYear` formula. `ProfileMeta.birthDate` → `.birthYear`. Consent middleware + service pipeline update (FR206.7). |
| **Epic 0 (Sentry)** | `evaluateSentryForProfile(birthDate)` → `birthYear` age calc. Apple compliance function, not just tags (FR206.5). |
| **Epic 0 (test infra)** | `buildProfile()` factory + `test-seed.ts` (28 refs) — must migrate before other test updates (FR206.8). |
| **Epic 10 Story 10.19 (consent-web)** | Consent HTML deep links use `mentomate://parent/dashboard` and `?persona=learner` — must update after route merge (FR206.6). |

---

## Zero-User Simplifications

**The app has zero users as of 2026-03-30.** Several FRs were designed for a live migration scenario and can be simplified:

| FR | Original (live migration) | Simplified (zero users) |
|----|--------------------------|------------------------|
| **FR203.4** | Reversible migration with down script | Skip down migration — no production data to roll back |
| **FR203.5** | 2-release backwards-compat window, deprecation header | Skip entirely — just remove `personaType` from schemas. No transition period, no deprecation header. |
| **FR203.2** | Extract year from existing `birthDate` rows | Fresh schema — `birthYear` is the only column. `birthDate` column dropped without data migration. Seed data updated directly. |

**When to re-add these safeguards:** If Epic 12 is deferred past the first real-user cohort, reinstate FR203.4 and FR203.5.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Route group merge breaks deep links | Audit all `router.push`/`router.replace` calls AND server-rendered HTML links (`consent-web.ts`, push notification payloads) before merging (FR206.6) |
| Home card ranking feels wrong initially | Cold start shows equal cards. Ranking improves after 2-3 sessions. Manual override always available. |
| Existing TEEN/LEARNER data in prod DB | Migration converts rows; `birthYear` extracted from `birthDate`; computed age bracket is source of truth |
| Third-party integrations read personaType | Story 12.6 audits: Sentry tags, Sentry age-gating (FR206.5), Inngest payloads, RevenueCat metadata |
| Consent pipeline breaks on `birthDate` → `birthYear` | FR206.7: `checkConsentRequired()`, `ProfileMeta`, consent middleware all updated in Story 12.6. Test with under-16 and over-16 profiles. |
| ~1,443 API tests break at factory level | FR206.8: Update `buildProfile()` factory + test-seed FIRST, before any other test updates. Run full suite after factory change to establish baseline. |
| Wrong `birthYear` → wrong age bracket | Parent locks child's `birthYear`. Adults can self-correct in Settings. |
| `birthYear` less precise for GDPR age 16 | Conservative: `currentYear - birthYear <= 16` → require consent (worst-case birthday) |
| `precomputeHomeCards` adds latency | Cache in React Query. Precompute in background (Inngest or on session-close). |
| "Browse & explore" card is redundant with Book tab | Don't include Browse as a card type. Book tab is the browse surface. Cards are for session-starting intents + family. |
