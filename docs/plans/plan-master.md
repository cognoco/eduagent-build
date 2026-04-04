# Master Implementation Plan — Remaining Epics

**Author:** Zuzka + Claude
**Date:** 2026-03-30 (original), 2026-04-04 (rewritten from code verification)
**Context:** App has zero users. All work delivered by LLM agents. Order optimized for least friction, minimal code duplication, and safe incremental delivery.

---

## Status Summary

*Verified against codebase: 2026-04-04. Every status below was confirmed by reading source files, not from prior documentation.*

| Epic / Phase | Status | Details |
|------|--------|-------|
| 0-5 | **COMPLETE** | Foundation, onboarding, learning, retention, progress, billing |
| 6 | **COMPLETE** | Language learning — Four Strands, vocabulary CRUD, CEFR milestones, SM-2 spaced repetition. Full stack: schema, routes, services, mobile UI, tests. On `diverse` branch (PR #109). |
| 7 | **COMPLETE** (core) | Self-building library — curriculum books, generation, library UI (merged main via PR #108). Stories 7.5 (visual map) and 7.6 (knowledge tracking) deferred to v1.1. |
| 8 | **COMPLETE** | Full voice mode — Stories 8.1-8.5 shipped and merged to main (PRs #104, #105). Story 8.6 (VAD) remains optional stretch. |
| 9 | **COMPLETE** | Native IAP (RevenueCat) |
| 10 | **COMPLETE** | Pre-launch UX polish — all Story 10.1-10.23 slices shipped. 10.10 consent animation now implemented (300ms fade transitions). |
| 11 | **COMPLETE** | Brand identity — navy dark bg, teal/lavender tokens, light mode. |
| 12 | **PARTIAL** | Remove persona enum — 12.1, 12.5, 12.7 complete; 12.6 ~40%; 12.2, 12.3, 12.4 not started. |
| 13 | **COMPLETE** | Session lifecycle — all 7 stories. Wall-clock, crash recovery, celebrations, adaptive silence. |
| 14 | **COMPLETE** | Human agency — ALL stories (A+B+C). |
| — | **COMPLETE** | Adaptive home screen — intent router, ParentGateway, LearnerScreen, /learn, /learn-new routes. On `diverse` branch (PR #109). |

### Completed Phases (historical record)

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Epic 11 brand tokens + Story 13.1-13.2 wallClock/hard-cap | ✅ |
| Phase 2 | Stories 14.2, 14.3, 14.4, 14.10 (quick wins) | ✅ |
| Phase 2.5 | Code review remediation (3 HIGH, 6 MEDIUM, 6 LOW) — 13/15 fixed, 2 pre-resolved | ✅ |
| Phase 3 | Homework overhaul (14.9, 14.10, 14.11, 14.12) | ✅ |
| Phase 4 | Celebration system + crash recovery + adaptive silence (13.3-13.7) | ✅ |
| Phase 5 | Epic 8 voice mode (8.1-8.5), Epic 12.6 birthYear compat, Epic 10 completion | ✅ |
| Phase 6 | Epic 7 self-building library (7.1-7.4) | ✅ |
| Phase 7 | Epic 6 language learning, adaptive home screen, code review fixes | ✅ (on `diverse`, PR #109) |

---

## Epic 12 — Detailed Story Status

*Each row verified by reading source files on 2026-04-04.*

| Story | Status | Evidence |
|-------|--------|----------|
| **12.1** (age voice) | ✅ DONE | `exchanges.ts` uses `getAgeVoice(ageBracket)` via `resolveAgeBracket(context.birthYear)`. Zero `personaType` refs in exchanges. `create-profile.tsx` still submits `personaType` (legacy, persona picker UI commented out). |
| **12.7** (home cards) | ✅ DONE | `precomputeHomeCards()` in `home-cards.ts`, `HomeActionCard` component, `GET /v1/home-cards` + `POST /v1/home-cards/interactions` routes, ranking heuristics, SecureStore dismissal tracking. Fully persona-agnostic. |
| **12.5** (routing cleanup) | ✅ DONE | `(learner)/_layout.tsx:683-684` redirects based on `isOwner` + linked children, NOT `personaType`. `(parent)/_layout.tsx:121-124` uses `hasLinkedChildren` with `isOwner` check. `home.tsx` routes to `ParentGateway` or `LearnerScreen` via family structure. Zero persona-based redirects remain. |
| **12.6** (big migration) | ⏳ ~40% | **Done:** Consent service uses `checkConsentRequired(birthYear)` ✅. Consent middleware uses `meta.birthYear` ✅. Sentry age-gating uses `birthYear` ✅. Inngest payloads use `profileId` not persona ✅. RevenueCat syncs `userId` only ✅. DB schema has `birthYear` integer column ✅. Routing uses `isOwner` not persona ✅. **Not done:** Factory (`buildProfile()` still has `personaType: 'LEARNER'`). Test-seed (5 `personaType` refs). Schemas (`personaTypeSchema` still exported, `personaType` in create/response schemas). `create-profile.tsx` still submits `personaType`. Consent-web deep links still use `mentomate://parent/dashboard`. |
| **12.3** (theme decoupling) | ❌ NOT STARTED | `_layout.tsx:118` derives persona from `activeProfile.personaType.toLowerCase()`. `design-tokens.ts` organizes tokens by `Record<Persona, Record<ColorScheme, ThemeTokens>>`. Theme values still sourced from DB `personaType` column. |
| **12.2** (route merge) | ❌ NOT STARTED | Routes still in separate `(learner)/` and `(parent)/` groups. No `(app)/` group exists. |
| **12.4** (DB migration) | ❌ NOT STARTED | Schema still has `personaType` enum + column. `birthYear` integer column now exists (added during 12.6 compat work), but `personaType` and `birthDate` have not been removed. |

### 12.6 Remaining Work (ordered)

1. **Factory + test-seed** (FR206.8) — DO FIRST. `buildProfile()` in `packages/factory/src/profiles.ts` still defaults `personaType: 'LEARNER'`. `test-seed.ts` has 5 `personaType` refs (hardcoded `'PARENT'` in parent scenarios). Broken factory = broken tests.
2. **Schemas** — Remove `personaTypeSchema`, `PersonaType` type, and `personaType` field from profile schemas in `packages/schemas/src/profiles.ts`.
3. **create-profile.tsx** — Stop submitting `personaType` in profile creation request (persona picker UI already commented out).
4. **Consent-web deep links** (FR206.6) — Update `mentomate://parent/dashboard` → post-merge route in server-rendered HTML.
5. **Full grep audit** — Zero `personaType` and zero `birthDate` hits in source code.

---

## Epic 6 — Language Learning (Four Strands)

*Verified against code 2026-04-04. Previously listed as "TODO". Now COMPLETE on `diverse` branch.*

| Component | Status | Key Files |
|-----------|--------|-----------|
| **DB Schema** | ✅ | `packages/database/src/schema/language.ts` — vocabulary table, retention cards (SM-2), CEFR levels. `subjects.ts` — `pedagogy_mode` enum, `language_code`, CEFR fields on topics. |
| **API Schemas** | ✅ | `packages/schemas/src/language.ts` — 121 lines. Pedagogy mode, vocab type, CEFR level, language code, vocabulary CRUD schemas, progress schemas. |
| **API Routes** | ✅ | `apps/api/src/routes/vocabulary.ts` — GET/POST vocabulary, POST review. `language-progress.ts` — GET CEFR progress. `subjects.ts` — POST language-setup. |
| **Services** | ✅ | `vocabulary.ts` (341 lines, SM-2, bulk upsert). `language-curriculum.ts` (543 lines, 48 milestones A1-C2). `language-detect.ts` (14 languages). `language-prompts.ts` (four strands prompt). `vocabulary-extract.ts` (LLM transcript mining). |
| **Session Integration** | ✅ | `session-completed.ts` Inngest function auto-extracts vocabulary from four_strands sessions. |
| **Mobile UI** | ✅ | `language-setup.tsx` (onboarding). `VocabularyList.tsx`, `MilestoneCard.tsx`, `FluencyDrill.tsx` components. `use-vocabulary.ts`, `use-language-progress.ts` hooks. |
| **Tests** | ✅ | Vocabulary routes (309 lines), language progress (138 lines), language setup, detection, mobile components. |

---

## Epic 7 — Self-Building Library

*Verified against code 2026-04-04. Previously listed as "TODO". Core stories (7.1-7.4) merged to main via PR #108.*

| Story | Status | Evidence |
|-------|--------|----------|
| **7.1** (book data model + generation) | ✅ DONE | `curriculum_books` table, `books.ts` routes with generation endpoint |
| **7.2** (enhanced session context) | ✅ DONE | Topic generation per book, `bookId` FK on topics |
| **7.3** (library navigation) | ✅ DONE | `library.tsx` with `useBooks` hook, book/topic hierarchy |
| **7.4** (coaching cards) | ✅ DONE | Urgency boost fields on subjects, home cards integration |
| **7.5** (visual topic map) | 🗓️ DEFERRED | Planned for v1.1 fast-follow |
| **7.6** (knowledge tracking) | 🗓️ DEFERRED | Planned for v1.1 fast-follow |

---

## Adaptive Home Screen

*Verified against code 2026-04-04. Implemented on `diverse` branch per design spec `docs/superpowers/specs/2026-04-04-adaptive-home-screen-design.md`.*

| Component | Status | Evidence |
|-----------|--------|----------|
| **Intent router** (`home.tsx`) | ✅ | Routes to `ParentGateway` or `LearnerScreen` based on `isOwner` + family links. ~58 lines. |
| **ParentGateway** | ✅ | Two intent cards: "Check child's progress" / "Learn something". Child activity highlight. Time-aware greeting. |
| **LearnerScreen** | ✅ | Three intent cards: "Learn something new!" / "Help with assignment?" / "Repeat & review" (conditional on library content). |
| **IntentCard** | ✅ | Reusable pressable component with title/subtitle. |
| **/learn route** | ✅ | Wraps LearnerScreen with back navigation. |
| **/learn-new route** | ✅ | Learning fork: "Pick a subject" / "Just ask anything" / "Continue where you left off" (conditional on recovery marker). |
| **Greeting utility** | ✅ | Time-of-day + day-of-week greetings in `lib/greeting.ts`. |

---

## What Remains — Prioritized

### Immediate (merge existing work)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 1 | **Merge PR #109** (`diverse` → main) — language learning, adaptive home screen, code review fixes | Review + merge | Nothing |

### Short-term (launch readiness)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 2 | **Pre-launch config** — Clerk staging key swap, Resend API key, RevenueCat store connections | Config, not code | Store account access |
| 3 | **Store blockers** — Apple enrollment (~pending since 2026-03-13), Google Play appeal | Administrative | External |

### Medium-term (v1.1 features)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 4 | **Epic 12 remainder** — 12.6 factory/test-seed/schemas/create-profile, 12.3 theme, 12.2 route merge, 12.4 DB migration | Large (~30 files) | 12.6 factory first |
| 5 | **Epic 7 deferred** — 7.5 visual topic map, 7.6 knowledge tracking | Medium | Nothing |

---

## Key Constraints (active)

1. **Story 12.6 FR206.8 (factory) before any other 12.x test updates** — broken factory breaks tests.
2. **No parallel agents on the same hotspot file** — sequential execution for session screen, Inngest chain, and home screen work.

### Resolved Constraints

- ~~Story 13.2 before Story 12.1~~ — Both done.
- ~~Story 12.7 before 14.1~~ — Both done and wired together.
- ~~Story 13.7 before Epic 7 Story 7.5~~ — 13.7 done. Epic 7 unblocked.
- ~~Epic 8 before Epic 6~~ — Epic 8 merged (PRs #104, #105). Epic 6 complete.
- ~~Epic 8 must merge before Epic 6~~ — Both complete.

---

## Hotspot Files

These files are touched by remaining work. Agents must read current state before modifying.

| File | Remaining touches |
|------|-------------------|
| `packages/database/src/schema/profiles.ts` | 12.4 (drop `personaType` enum + column, drop `birthDate`) |
| `packages/schemas/src/profiles.ts` | 12.6 (remove `personaTypeSchema`, `personaType` from create/response schemas) |
| `packages/factory/src/profiles.ts` | 12.6 FR206.8 (remove `personaType: 'LEARNER'` default) |
| `apps/api/src/services/test-seed.ts` | 12.6 FR206.8 (5 remaining `personaType` refs) |
| `apps/mobile/src/app/_layout.tsx` | 12.3 (stop deriving persona from `activeProfile.personaType` at line 118) |
| `apps/mobile/src/lib/design-tokens.ts` | 12.3 (remove persona-keyed token structure) |
| `apps/mobile/src/app/(learner)/_layout.tsx` | 12.2 (route merge into unified group) |
| `apps/mobile/src/app/(parent)/_layout.tsx` | 12.2 (route merge into unified group) |
| `apps/mobile/src/app/create-profile.tsx` | 12.6 (stop submitting personaType) |
| `apps/api/src/routes/consent-web.ts` | 12.6 (update `mentomate://parent/dashboard` deep link) |

### Phase Details (reference)

**Phase 8 — Architecture Refactor (Epic 12 remainder):**

```
12.6 (factory/test-seed/schemas) ──┐
                                    ├─→ 12.3 (theme decoupling) ──┐
                                    │                               ├─→ 12.2 (route merge) ──→ 12.4 (DB migration)
                                    └───────────────────────────────┘
```

Story 12.6 is the heaviest remaining item — covers factory, test-seed, schemas, create-profile, and deep links. Must complete before 12.3/12.2/12.4.

**Deferred Features:** Epic 7 Stories 7.5 (visual map) + 7.6 (knowledge tracking).

## Spec Documents

| Epic | Plan file | Master stories |
|------|-----------|---------------|
| 6 | (no separate plan — impl on `diverse` branch) | `docs/epics.md` Epic 6 stories |
| 7 | `docs/plans/epic-7-revised-guide-dont-gate.md`, `docs/superpowers/specs/2026-04-04-epic-7-library-design.md` | `docs/epics.md` Epic 7 stories |
| 8 | (no separate plan — spec in `docs/epics.md`) | `docs/epics.md` Epic 8 stories |
| 11 | (no separate plan — spec in `docs/epics.md`) | `docs/epics.md` Epic 11 section |
| 12 | `docs/plans/epic-12-persona-to-roles.md` | `docs/epics.md` Epic 12 stories |
| 13 | `docs/plans/epic-13-session-lifecycle-overhaul.md` | `docs/epics.md` Epic 13 stories |
| 14 | `docs/plans/epic-14-human-agency-feedback.md` | `docs/epics.md` Epic 14 stories |
| Home | `docs/superpowers/specs/2026-04-04-adaptive-home-screen-design.md` | N/A (standalone feature) |

**`docs/epics.md` is the master document.** Plan files add detail but are not authoritative when they conflict with `epics.md`.
