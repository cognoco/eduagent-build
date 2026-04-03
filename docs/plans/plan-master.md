# Master Implementation Plan — Remaining Epics

**Author:** Zuzka + Claude
**Date:** 2026-03-30
**Context:** App has zero users. All work delivered by LLM agents. Order optimized for least friction, minimal code duplication, and safe incremental delivery.

---

## Status Summary

*Last verified against codebase: 2026-04-03*

| Epic / Phase | Status | Scope |
|------|--------|-------|
| 0-5 | **COMPLETE** | Foundation, onboarding, learning, retention, progress, billing |
| 9 | **COMPLETE** | Native IAP (RevenueCat) |
| 10 | **NEARLY COMPLETE** | Pre-launch UX polish — 15 done, 7 partial, 1 unbuilt (10.17). See `docs/epics.md` for per-story detail. |
| Phase 1 | **COMPLETE** | Epic 11 brand tokens + Story 13.1-13.2 wallClock/hard-cap |
| Phase 2 | **COMPLETE** | Stories 14.2, 14.3, 14.4, 14.10 (quick wins) |
| Phase 2.5 | **COMPLETE** | Code review remediation — deploy blockers, test gaps, UX polish |
| Phase 3 | **COMPLETE** | Homework overhaul (14.9, 14.10, 14.11, 14.12) |
| Phase 4 | **COMPLETE** | Celebration system + session polish (13.3-13.7) |
| **11** | **COMPLETE** | Brand identity — all 3 stories verified 2026-04-01 |
| **13** | **COMPLETE** | Session lifecycle — all 7 stories verified 2026-04-01 |
| **14** | **COMPLETE** | Human agency — all stories implemented (Phases A+B+C). See Phase 5 notes. |
| **8** | **NEARLY COMPLETE** | Voice gap closure — 4/5 gaps done on `feat/epic-8-voice-gaps`. Gap 5 (VoiceOver/TalkBack) deferred to v1.1. |
| **12** | **PARTIAL** | Remove persona enum — 12.1 logic complete (DB migration not run). Consent + Sentry clean. Factory, test-seed, schemas, route merge, home cards NOT done. |
| **7** | **TODO** | Concept map — advisory prerequisite learning (v1.1) |
| **6** | **TODO** | Language learning — Four Strands (v1.1). Blocked on Epic 8 voice infra (nearly unblocked). |

---

## Implementation Order

### Phase 1 — Foundation Cleanup

**Goal:** Simplify existing code, set visual foundation. All parallel — no file overlap.

| Item | What | Why first |
|------|------|-----------|
| **Epic 11** (all stories) | Brand colors — navy bg, teal default accent, WCAG-compliant palette, accent cascade fix | Pure design tokens. Sets palette before Epic 12 removes persona-based theme defaults. Zero logic changes. |
| **Story 13.1** | Add `wallClockSeconds` column + dashboard engagement context | Additive backend. No existing code modified. |
| **Story 13.2** | Remove hard caps + nudge constants | Simplifies `session-lifecycle.ts`. **Must precede Story 12.1** — both touch `SessionTimerConfig`, but 13.2 removes caps first so 12.1's timer refactor is a no-op. |

**Exit criteria:** Design tokens updated, `wallClockSeconds` column exists, hard cap constants deleted, all tests pass.

---

### Phase 2 — Quick Wins

**Goal:** Immediate user-facing value with near-zero risk. All independent and parallelizable.

| Item | What | Risk |
|------|------|------|
| **Story 14.2** | "I don't remember" on recall tests | Independent — recall test screen only |
| **Story 14.3** | "Add my own topic" to curriculum | Independent — curriculum screen + new API endpoint |
| **Story 14.4** | "Something else" on ambiguous subject suggestions | Independent — subject resolution screen only |
| **Story 14.10** | "Help me" vs "Check my answer" (homework explain-don't-question) | One prompt edit in `exchanges.ts` — huge daily-use value |

**Exit criteria:** All 4 features working, related tests pass.

---

### Phase 2.5 — Code Review Remediation (Phase 1+2) ✅ COMPLETE

**Goal:** Fix all findings from the Phase 1+2 code review before moving forward. No new features — only correctness, test coverage, and polish on already-shipped code.

**Context:** Code review of `phase4` branch (44 files, ~5k lines) found 3 HIGH, 6 MEDIUM, and 6 LOW issues across API services, mobile screens, shared schemas, and design tokens.

**Result:** 13 of 15 findings fixed. 2 were already resolved before implementation (L5 double border, L6 unused `_config`). Migration `0004_uneven_mandroid.sql` generated (also captures celebration, quota, and learning_modes schema drift). All tests pass. `tsc --noEmit` clean.

#### Stream A — Deploy Blockers (HIGH, do first) ✅

| # | Severity | Status | Issue | Resolution |
|---|----------|--------|-------|------------|
| H1 | **HIGH** | ✅ | Missing SQL migration for `wallClockSeconds` | Generated `0004_uneven_mandroid.sql` (also covers celebration_level enum, quota daily_limit, coaching cache celebrations, learning_modes median/celebration columns) |
| H2 | **HIGH** | ✅ | `curriculumTopicSchema` missing `source` field | Added `source: curriculumTopicSourceSchema.optional()` + fixed both topic mappers in `curriculum.ts` (getCurriculum + addCurriculumTopic) |

#### Stream B — Test Coverage Gaps (HIGH + MEDIUM) ✅

| # | Severity | Status | Issue | Resolution |
|---|----------|--------|-------|------------|
| H3 | **HIGH** | ✅ | `computeActiveSeconds` zero tests | Added 7-case `describe('computeActiveSeconds')` block — pure function tests, no mocks |
| M2 | MEDIUM | ✅ | Missing curriculum error-path tests | Added 3 service tests (subject 404, curriculum 404, LLM fallback) + 2 route tests (subject 404, curriculum 404) |
| L2 | LOW | ✅ | `curriculum-review.test.tsx` only happy path | Added 3 tests: error state, back navigation, cancel modal |
| L3 | LOW | ✅ | `recall-test.test.tsx` only one test | Added 3 tests: immediate remediation, successful recall, error handling. Extended ChatShell mock with onSend support |

#### Stream C — Logic & UX Polish (MEDIUM + LOW) ✅

| # | Severity | Status | Issue | Resolution |
|---|----------|--------|-------|------------|
| M1 | MEDIUM | ✅ | `dont_remember` bypasses cooldown | Removed `attemptMode === 'standard'` guard — cooldown now applies to all attempt modes |
| M3 | MEDIUM | ✅ | Learner `violet` preset misleading | Changed primary to actual violet (#7c3aed light, #a78bfa dark). Reordered: teal first (default), violet second |
| M4 | MEDIUM | ✅ | Parent `indigo` = duplicate of teal | Changed swatch + primary to actual indigo (#4f46e5 light, #818cf8 dark) |
| M5 | MEDIUM | ✅ | Homework opening message copy mismatch | Updated: "Tell me if you want..." → "Use the buttons below to choose." |
| M6 | MEDIUM | ✅ | `recall-test.tsx` reads persona | Removed `useTheme` import, hardcoded `isLearner` (always true in `(learner)/` route group) |
| L1 | LOW | ✅ | `resolveRounds` never resets | Added `setResolveRounds(0)` in `onNameChange` |
| L4 | LOW | ✅ | `streamMessage` body untyped | Changed `Record<string, unknown>` → `SessionMessageInput` from `@eduagent/schemas` |
| L5 | LOW | ✅ N/A | Double `border-t` in ChatShell | Already resolved — only single border exists |
| L6 | LOW | ✅ N/A | `_config` parameter unused | Already resolved — no `_config` in current `session-lifecycle.ts` |

**Exit criteria met:** All HIGH/MEDIUM findings fixed. `tsc --noEmit` clean. All related tests pass (402 API + 307 mobile). Migration file generated.

---

### Phase 3 — Homework Overhaul

**Goal:** Multi-problem homework sessions with OCR correction and learning extraction. Sequential chain.

```
14.9 (problem card preview + OCR correction)
  → 14.11 (multi-problem session flow — depends on 14.9 + 14.10)
    → 14.12 (homework learning extraction — Inngest step, depends on 14.11)
```

| Item | What | Depends on |
|------|------|------------|
| **Story 14.9** | Problem card preview — client-side heuristic split, editable cards per problem | Camera screen (frontend only) |
| **Story 14.11** | Multi-problem session flow — one session per homework sitting, "Next problem" chip | 14.9 + 14.10 |
| **Story 14.12** | Homework learning extraction — LLM reads exchanges → structured summary for parent dashboard | 14.11 (adds step to session-completed Inngest chain) |

**Exit criteria:** Student can photograph multiple problems, correct OCR, work through them sequentially, parent sees "Math homework — 5 problems, practiced linear equations."

---

### Phase 4 — Session Polish (Celebrations + Crash Recovery)

**Goal:** Build the celebration system and session resilience that Phase 5 needs.

```
13.4 (celebration library)    ──┐
13.3 (crash recovery)         ──┤── 13.4 parallel with 13.3 and 13.5
13.5 (adaptive silence)       ──┘
                                │
13.6 (summary + recap)        ──┤── after 13.4
13.7 (celebration queue)      ──┘── after 13.4 + 13.1
```

| Item | What | Depends on |
|------|------|------------|
| **Story 13.4** | Celebration library — 4 celestial animations + `useCelebration()` + `useMilestoneTracker()` + mastery + effort milestones + 3-level filtering | None (new components) |
| **Story 13.3** | Crash recovery — AsyncStorage markers + session resumption within 30 min + Inngest stale session cron | 13.1 (wallClockSeconds) |
| **Story 13.5** | Adaptive silence — LLM `expectedResponseMinutes` + per-session pace calibration + cross-session learned baseline | 13.2 (caps removed) |
| **Story 13.6** | "I'm Done" button + summary screen (wall-clock, milestone recap, 3-sec wait for fast celebrations) | 13.4 (celebrations) |
| **Story 13.7** | Post-session celebration queue on home card system + Inngest wiring + 3-level toggle | 13.4 + 13.1. **Note:** The current repo already ships a legacy 13.7 path backed by `coaching_card_cache`. Phase 5 Story 12.7 should migrate that queue onto the new home-card cache instead of re-implementing it. |

**Cross-epic touchpoints added by this phase:**
- `expectedResponseMinutes` in LLM response metadata (13.5)
- `medianResponseSeconds` + `celebrationLevel` on `teachingPreferences` (13.5, 13.4)
- Pace baseline step in session-completed Inngest chain (13.5)

**Exit criteria:** Celebrations animate in sessions, crash recovery works, adaptive silence replaces fixed thresholds, summary screen shows milestones.

---

### Phase 5 — Architecture Refactor (Epic 12) ⏳ IN PROGRESS

**Goal:** Remove persona concept, merge route groups, build prioritized home cards. The biggest single change.

**Current status (verified 2026-04-03):**

| Story | Status | Notes |
|-------|--------|-------|
| **12.1** (age voice) | ✅ Logic complete | `exchanges.ts` uses `getAgeVoice(ageBracket)`, zero `personaType` refs. DB migration not yet run (`birthYear` computed at runtime from `birthDate`). |
| **12.6** (big migration) | ⏳ ~20% done | Consent service + Sentry clean. **Factory, test-seed, schemas still use `personaType`** (~35 files). |
| **12.3** (theme decoupling) | ❌ Not started | |
| **12.7** (home cards) | ❌ Not started | |
| **12.2** (route merge) | ❌ Not started | |
| **12.5** (routing cleanup) | ❌ Not started | |
| **12.4** (DB migration) | ❌ Not started | |

**Note:** Story 14.1 (home card dismissal) was listed as depending on 12.7 (home cards), but **14.1 is already implemented** using the existing home card system with SecureStore-based dismissal tracking. When 12.7 ships the new multi-card home, the dismissal logic may need adjustment.

**Internal ordering (unchanged):**
```
12.1 (age voice)         ──┐
12.3 (theme decoupling)  ──┤── parallel
                            ├─→ 12.7 (home cards) ─→ 12.2 (route merge) ─→ 12.5 (routing cleanup) ──┐
12.6 (the big migration) ──┤                                                                          ├─→ 12.4 (DB migration)
                            └──────────────────────────────────────────────────────────────────────────┘
```

**Story 12.6 remaining work (FR206.1-206.8):**
1. **Test factory + test-seed** (FR206.8) — DO FIRST. `buildProfile()` default + 28 test-seed refs. Broken factory = ~1,443 broken tests.
2. ~~Consent service + middleware (FR206.7)~~ — ✅ Already clean (`checkConsentRequired(birthYear)` in place).
3. **Consent-web deep links** (FR206.6) — `mentomate://parent/dashboard` → post-merge route. Server-rendered HTML, not mobile router calls.
4. ~~Sentry age-gating (FR206.5)~~ — ✅ Already clean (no `personaType` refs in Sentry).
5. **Sentry tags, Inngest payloads, RevenueCat metadata** (FR206.1-206.3)
6. **Home card tap event type** (FR206.4)
7. **Full grep audit** — zero `personaType` and zero `birthDate` hits in source code.

**Zero-user simplifications applied:**
- FR203.4 (reversible migration): **SKIPPED** — no production data
- FR203.5 (2-release backwards-compat window): **SKIPPED** — just remove `personaType`
- FR203.2 (data migration from `birthDate`): **SKIPPED** — fresh schema, seed data updated directly

**Exit criteria:** No persona concept in codebase. Single `(app)/` route group. Home screen shows 2-3 ranked intent cards. All ~1,443 API tests + ~404 mobile tests pass. Consent pipeline works with `birthYear`.

---

### Phase 6 — New Feature Systems ⏳ PARTIALLY COMPLETE

**Goal:** Add prerequisite graph, full voice mode, and session agency features on the clean architecture.

| Item | What | Status | Notes |
|------|------|--------|-------|
| **Epic 8** (voice gaps) | Voice-first session mode, TTS pause/resume, haptics | ✅ **NEARLY COMPLETE** | 4/5 gaps done on `feat/epic-8-voice-gaps`. Gap 5 (VoiceOver/TalkBack) deferred v1.1. Needs merge to main. |
| **Story 14.1** | Home card dismissal (× button, tracking) | ✅ **DONE** | SecureStore-based dismissal, per-profile tracking, 3-card limit |
| **Story 14.5** | Per-message feedback ("Not helpful" / "That's incorrect") | ✅ **DONE** | 3-button feedback UI, event tracking, adaptive system prompt injection |
| **Story 14.6** | Quick-action chips (9 chip types) | ✅ **DONE** | "I know this", "Explain differently", "Too easy/hard", etc. Contextual display. |
| **Story 14.7** | Topic switch mid-session | ✅ **DONE** | Switch topic chip + toolbar button + topic switcher modal |
| **Story 14.8** | Escalation visibility + difficulty nudge | ✅ **DONE** | Agency badge ("Guided"/"Independent"), difficulty via too_easy/too_hard chips |
| **Epic 7** (all stories) | Concept map — advisory prerequisite DAG, graph-aware coaching, visual map | ❌ **NOT STARTED** | Depends on 13.7 (done). No code exists. |

**Remaining exit criteria:** Merge Epic 8 branch. Epic 7: concept map renders with retention-colored nodes.

---

### Phase 7 — Language Learning

**Goal:** Four Strands methodology for language-specific curricula.

| Item | What | Depends on |
|------|------|------------|
| **Epic 6** (all stories) | Language learning — Four Strands, CEFR tracking, vocabulary SR, explicit grammar | Epic 8.1-8.2 (voice infrastructure for SPEAK/LISTEN) |

**Exit criteria:** Language subjects auto-detected and use Four Strands methodology. CEFR progress tracked. SPEAK/LISTEN strands use voice mode.

---

## Hotspot Files (Multiple Phases Touch These)

These files are modified by 2+ phases. Agents working on these must read the current state — not assume prior knowledge.

| File | Lines | Touched by |
|------|-------|------------|
| `apps/mobile/src/app/(learner)/session/index.tsx` | ~388 | Phase 4 (celebrations, crash recovery, silence), Phase 5 (route move to `(app)/`), Phase 6 (feedback chips, voice) |
| `apps/api/src/inngest/functions/session-completed.ts` | ~256 | Phase 3 (homework extraction step), Phase 4 (pace baseline step) |
| `apps/mobile/src/app/(learner)/home.tsx` | ~552 | Phase 5 (replaced entirely by 12.7 multi-card home) |
| `apps/api/src/services/coaching-cards.ts` | ~308 | Phase 5 (replaced by `precomputeHomeCards()`) |
| `apps/api/src/services/exchanges.ts` | ~526 | Phase 1 (13.2 timer), Phase 4 (13.5 `expectedResponseMinutes`), Phase 5 (12.1 age voice) |
| `packages/database/src/schema/profiles.ts` | ~127 | Phase 5 (12.4 drops `personaType`, adds `birthYear`) |
| `apps/mobile/src/lib/design-tokens.ts` | ~573 | Phase 1 (Epic 11 brand colors), Phase 2.5 (M3/M4 preset fixes), Phase 5 (12.3 remove persona palettes) |
| `packages/factory/src/profiles.ts` | varies | Phase 5 (12.6 FR206.8 — remove `personaType` default, add `birthYear`) |

---

## Key Constraints

1. ~~Story 13.2 before Story 12.1~~ — ✅ Both done (13.2 complete, 12.1 logic complete).
2. **Story 12.6 FR206.8 (factory) before any other 12.x test updates** — broken factory breaks ~1,443 tests. Still applies.
3. ~~Story 12.7 before 14.1~~ — ⚠️ 14.1 was implemented ahead of 12.7 using existing home card system. May need adjustment when 12.7 ships multi-card home.
4. ~~Story 13.7 before Epic 7 Story 7.5~~ — ✅ 13.7 done. Epic 7 is unblocked.
5. ~~Epic 8.1-8.2 before Epic 6 SPEAK/LISTEN~~ — ✅ Epic 8 voice infra nearly complete. Epic 6 is unblocked once Epic 8 branch merges.
6. **No parallel agents on the same hotspot file** — sequential execution for session screen, Inngest chain, and home screen work. Still applies.

---

## Spec Documents

| Epic | Plan file | Master stories |
|------|-----------|---------------|
| 7 | `docs/plans/epic-7-revised-guide-dont-gate.md` | `docs/epics.md` Epic 7 stories |
| 8 | (no separate plan — spec in `docs/epics.md`) | `docs/epics.md` Epic 8 stories |
| 11 | (no separate plan — spec in `docs/epics.md`) | `docs/epics.md` Epic 11 section |
| 12 | `docs/plans/epic-12-persona-to-roles.md` | `docs/epics.md` Epic 12 stories |
| 13 | `docs/plans/epic-13-session-lifecycle-overhaul.md` | `docs/epics.md` Epic 13 stories |
| 14 | `docs/plans/epic-14-human-agency-feedback.md` | `docs/epics.md` Epic 14 stories |
| 6 | (no separate plan — spec in `docs/epics.md`) | `docs/epics.md` Epic 6 stories |

**`docs/epics.md` is the master document.** Plan files add detail but are not authoritative when they conflict with `epics.md`.
