# Master Implementation Plan — Remaining Epics

**Author:** Zuzka + Claude
**Date:** 2026-03-30 (original), 2026-04-04 (rewritten from code verification), 2026-04-13 (status update)
**Context:** App has zero users. All work delivered by LLM agents. Order optimized for least friction, minimal code duplication, and safe incremental delivery.

---

## Status Summary

*Last verified against codebase: 2026-04-13.*

| Epic / Phase | Status | Details |
|------|--------|-------|
| 0-5 | **COMPLETE** | Foundation, onboarding, learning, retention, progress, billing |
| 6 | **COMPLETE** | Language learning — Four Strands, vocabulary CRUD, CEFR milestones, SM-2 spaced repetition. Merged to main. |
| 7 | **COMPLETE** (core) | Self-building library — curriculum books, generation, library UI, shelf/book screens, search/sort/filter. Stories 7.5 (visual map) and 7.6 (knowledge tracking) deferred to v1.1. |
| 8 | **COMPLETE** | Full voice mode — Stories 8.1-8.5 shipped. Story 8.6 (VAD) remains optional stretch. |
| 9 | **COMPLETE** | Native IAP (RevenueCat) |
| 10 | **COMPLETE** | Pre-launch UX polish — all Story 10.1-10.23 slices shipped. |
| 11 | **COMPLETE** | Brand identity — navy dark bg, teal/lavender tokens, light mode. |
| 12 | **NEAR COMPLETE** | Remove persona enum — 12.1, 12.2, 12.4, 12.5, 12.6, 12.7 done. Only 12.3 (theme decoupling) remains. |
| 13 | **COMPLETE** | Session lifecycle — all 7 stories. Wall-clock, crash recovery, celebrations, adaptive silence. |
| 14 | **COMPLETE** | Human agency — ALL stories (A+B+C). |
| 15 | **COMPLETE** | Visible progress — progress snapshots, milestones, journey screen, parent dashboard. Merged via PR #117. |
| — | **COMPLETE** | Adaptive home screen — intent router, ParentGateway, LearnerScreen, /learn, /learn-new routes. |

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

*Verified against codebase: 2026-04-13.*

| Story | Status | Evidence |
|-------|--------|----------|
| **12.1** (age voice) | ✅ DONE | `exchanges.ts` uses `getAgeVoice(ageBracket)` via `resolveAgeBracket(context.birthYear)`. Zero `personaType` refs in exchanges. |
| **12.2** (route merge) | ✅ DONE | `(learner)` and `(parent)` route groups removed. Unified `(app)` group in place. |
| **12.4** (DB migration) | ✅ DONE | `personaType` enum/column and `birthDate` removed from `packages/database/src/schema/profiles.ts`. Uses `birthYear` only. |
| **12.5** (routing cleanup) | ✅ DONE | Routing uses `isOwner` + `hasLinkedChildren`, not personaType. |
| **12.6** (big migration) | ✅ DONE | Factory, schemas, DB, consent, routing all migrated. `personaType` removed from `@eduagent/schemas`. Only residual: `birthDate` as local UI variable in `create-profile.tsx` (date picker intermediate). |
| **12.7** (home cards) | ✅ DONE | `precomputeHomeCards()`, `HomeActionCard`, ranking heuristics, SecureStore dismissal. Persona-agnostic. |
| **12.3** (theme decoupling) | ❌ NOT DONE | `_layout.tsx` still derives persona from `birthYear` via `personaFromBirthYear()`. `design-tokens.ts` still ships 3 persona token matrices. `AccentPicker` component still exists (commented out import). |

### 12.3 Remaining Work

This is the only remaining Epic 12 story:

1. **`_layout.tsx`** — Stop deriving persona from `personaFromBirthYear()`. Use fixed teal+lavender scheme.
2. **`design-tokens.ts`** — Remove persona-keyed token structure. Single token set per color scheme.
3. **`theme.ts`** — Remove `persona` from `ThemeContextValue`. Simplify hooks.
4. **`AccentPicker`** — Delete component file and commented-out import.
5. **Grep audit** — Zero `persona` hits in theme/design-token code.

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

### Short-term (launch readiness)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 1 | **Pre-launch config** — Clerk staging key swap, Resend API key, RevenueCat store connections | Config, not code | Store account access |
| 2 | **Store blockers** — Apple enrollment (~pending since 2026-03-13), Google Play appeal | Administrative | External |

### Post-launch cleanup

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 3 | **Story 12.3** — Theme decoupling (remove persona token matrices, simplify _layout theme derivation) | Medium (~5 files) | Nothing |
| 4 | **Code review fixes** — Phases 2-4 of `Plan-code-review-fixes` (~125 items: N+1 queries, Inngest crons, UX dead-ends, test gaps) | Large | Phase 1 done |

### Deferred (v1.1)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 5 | **Epic 7 deferred** — 7.5 visual topic map, 7.6 knowledge tracking | Medium | Nothing |
| 6 | **Epic 6** — Language learning mobile UI (backend complete, no mobile screens) | Medium | Nothing |

---

## Hotspot Files (remaining work)

Only Story 12.3 (theme decoupling) has hotspot files:

| File | Change |
|------|--------|
| `apps/mobile/src/app/_layout.tsx` | Stop deriving persona from `personaFromBirthYear()`. Use fixed scheme. |
| `apps/mobile/src/lib/design-tokens.ts` | Remove persona-keyed token structure. Single token set. |
| `apps/mobile/src/lib/theme.ts` | Remove `persona` from `ThemeContextValue`. |
| `apps/mobile/src/components/common/AccentPicker.tsx` | Delete. |

## Spec Documents

| Epic/Feature | Spec file |
|------|-----------|
| 7 (library v3) | `docs/superpowers/specs/2026-04-04-epic-7-library-design.md` |
| 7.8-7.9 (library UX) | `docs/superpowers/specs/2026-04-06-library-ux-refactor-design.md` |
| 12 (persona removal) | `docs/plans/epic-12-persona-to-roles.md` |
| 15 (visible progress) | `docs/superpowers/specs/2026-04-07-epic-15-visible-progress-design.md` |
| Conversation-first | `docs/superpowers/specs/2026-04-08-conversation-first-learning-flow-design.md` |
| Home screen | `docs/superpowers/specs/2026-04-04-adaptive-home-screen-design.md` |

**`docs/epics.md` is the master document.** Spec files add detail but are not authoritative when they conflict with `epics.md`.
