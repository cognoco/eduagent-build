# Master Implementation Plan — Remaining Epics

**Author:** Zuzka + Claude
**Date:** 2026-03-30
**Context:** App has zero users. All work delivered by LLM agents. Order optimized for least friction, minimal code duplication, and safe incremental delivery.

---

## Status Summary

| Epic | Status | Scope |
|------|--------|-------|
| 0-5 | **COMPLETE** | Foundation, onboarding, learning, retention, progress, billing |
| 9 | **COMPLETE** | Native IAP (RevenueCat) |
| 10 | **COMPLETE** | Pre-launch UX polish |
| **11** | **TODO** | Brand identity — dark-first, logo-derived colors |
| **12** | **TODO** | Remove persona enum — age + role + intent-as-cards |
| **13** | **TODO** | Session lifecycle overhaul — honest time, milestones, graceful close |
| **14** | **TODO** | Human agency & feedback — the student always has a voice |
| **7** | **TODO** | Concept map — advisory prerequisite learning (v1.1) |
| **8** | **TODO** | Full voice mode (v1.1) |
| **6** | **TODO** | Language learning — Four Strands (v1.1) |

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
| **Story 13.7** | Post-session celebration queue on home card system + Inngest wiring + 3-level toggle | 13.4 + 13.1. **Note:** 13.7 targets the CURRENT coaching card system. It will be migrated to the home card system in Phase 5 (Story 12.7). |

**Cross-epic touchpoints added by this phase:**
- `expectedResponseMinutes` in LLM response metadata (13.5)
- `medianResponseSeconds` + `celebrationLevel` on `teachingPreferences` (13.5, 13.4)
- Pace baseline step in session-completed Inngest chain (13.5)

**Exit criteria:** Celebrations animate in sessions, crash recovery works, adaptive silence replaces fixed thresholds, summary screen shows milestones.

---

### Phase 5 — Architecture Refactor (Epic 12)

**Goal:** Remove persona concept, merge route groups, build prioritized home cards. The biggest single change.

**Internal ordering:**
```
12.1 (age voice)         ──┐
12.3 (theme decoupling)  ──┤── parallel
                            ├─→ 12.7 (home cards) ─→ 12.2 (route merge) ─→ 12.5 (routing cleanup) ──┐
12.6 (the big migration) ──┤                                                                          ├─→ 12.4 (DB migration)
                            └──────────────────────────────────────────────────────────────────────────┘
```

**Story 12.6 is the heaviest story in the entire epic.** It now covers FR206.1-206.8:
1. **Test factory + test-seed** (FR206.8) — DO FIRST. `buildProfile()` default + 28 test-seed refs. Broken factory = ~1,443 broken tests.
2. **Consent service + middleware** (FR206.7) — `checkConsentRequired(birthDate)` → `birthYear`. `ProfileMeta` interface change. GDPR-critical.
3. **Consent-web deep links** (FR206.6) — `mentomate://parent/dashboard` → post-merge route. Server-rendered HTML, not mobile router calls.
4. **Sentry age-gating** (FR206.5) — `evaluateSentryForProfile(birthDate)` → `birthYear`. Apple compliance function.
5. **Sentry tags, Inngest payloads, RevenueCat metadata** (FR206.1-206.3)
6. **Home card tap event type** (FR206.4)
7. **Full grep audit** — zero `personaType` and zero `birthDate` hits in source code.

**Zero-user simplifications applied:**
- FR203.4 (reversible migration): **SKIPPED** — no production data
- FR203.5 (2-release backwards-compat window): **SKIPPED** — just remove `personaType`
- FR203.2 (data migration from `birthDate`): **SKIPPED** — fresh schema, seed data updated directly

**Then immediately after 12.7:**
| Item | What | Depends on |
|------|------|------------|
| **Story 14.1** | Home card dismissal — × button, dismissal tracking feeds ranking algorithm | 12.7 (home cards) |

**Exit criteria:** No persona concept in codebase. Single `(app)/` route group. Home screen shows 2-3 ranked intent cards. All ~1,443 API tests + ~404 mobile tests pass. Consent pipeline works with `birthYear`.

---

### Phase 6 — New Feature Systems

**Goal:** Add prerequisite graph, full voice mode, and session agency features on the clean architecture.

| Item | What | Depends on | Parallelizable? |
|------|------|------------|-----------------|
| **Epic 7** (all stories) | Concept map — advisory prerequisite DAG, graph-aware coaching, visual map | 13.7 (celebrations for topic unlock) | Yes — independent of Epic 8 |
| **Epic 8** (all stories) | Full voice mode — voice-first for all session types, TTS playback, controls | Epic 3 Cluster G / Feynman (done) | Yes — independent of Epic 7 |
| **Story 14.5** | Per-message feedback ("Not helpful" / "That's incorrect") | Independent | |
| **Story 14.6** | Quick-action chips ("I know this", "Explain differently", "Too easy/hard") | 14.5 | |
| **Story 14.7** | Topic switch mid-session | Independent | |
| **Story 14.8** | Escalation visibility + difficulty nudge | 14.6 | |

**Exit criteria:** Concept map renders with retention-colored nodes. Voice mode works for all session types. Students can give per-message feedback and control difficulty.

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
| `apps/mobile/src/lib/design-tokens.ts` | ~573 | Phase 1 (Epic 11 brand colors), Phase 5 (12.3 remove persona palettes) |
| `packages/factory/src/profiles.ts` | varies | Phase 5 (12.6 FR206.8 — remove `personaType` default, add `birthYear`) |

---

## Key Constraints

1. **Story 13.2 before Story 12.1** — both modify `SessionTimerConfig`. 13.2 removes caps; if done first, 12.1's timer work is a no-op.
2. **Story 12.6 FR206.8 (factory) before any other 12.x test updates** — broken factory breaks ~1,443 tests.
3. **Story 12.7 before 14.1** — card dismissal needs the multi-card home screen to exist.
4. **Story 13.7 before Epic 7 Story 7.5** — topic unlock celebration uses `queueCelebration()`.
5. **Epic 8.1-8.2 before Epic 6 SPEAK/LISTEN** — voice infrastructure required.
6. **No parallel agents on the same hotspot file** — sequential execution for session screen, Inngest chain, and home screen work.

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
