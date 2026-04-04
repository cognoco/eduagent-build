# Master Implementation Plan — Remaining Epics

**Author:** Zuzka + Claude
**Date:** 2026-03-30 (original), 2026-04-03 (rewritten from code verification)
**Context:** App has zero users. All work delivered by LLM agents. Order optimized for least friction, minimal code duplication, and safe incremental delivery.

---

## Status Summary

*Verified against codebase: 2026-04-03. Every status below was confirmed by reading source files, not from prior documentation.*

| Epic / Phase | Status | Details |
|------|--------|-------|
| 0-5 | **COMPLETE** | Foundation, onboarding, learning, retention, progress, billing |
| 9 | **COMPLETE** | Native IAP (RevenueCat) |
| 10 | **COMPLETE** | Pre-launch UX polish — all Story 10.1-10.23 slices shipped (updated 2026-04-03). |
| 11 | **COMPLETE** | Brand identity — navy dark bg, teal/lavender tokens, light mode. Verified 2026-04-01. |
| 13 | **COMPLETE** | Session lifecycle — all 7 stories. Wall-clock, crash recovery, celebrations, adaptive silence. Verified 2026-04-01. |
| 14 | **COMPLETE** | Human agency — ALL stories (A+B+C). Verified in code 2026-04-03. |
| **8** | **COMPLETE** | Full voice mode — Stories 8.1-8.5 shipped; 8.6 remains optional stretch work |
| **12** | **PARTIAL** | Remove persona enum — 12.1 complete, 12.6 compatibility slice complete; route/theme/schema removal still pending |
| **7** | **TODO** | Concept map — advisory prerequisite learning (v1.1) |
| **6** | **TODO** | Language learning — Four Strands (v1.1) |

### Completed Phases (historical record)

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Epic 11 brand tokens + Story 13.1-13.2 wallClock/hard-cap | ✅ |
| Phase 2 | Stories 14.2, 14.3, 14.4, 14.10 (quick wins) | ✅ |
| Phase 2.5 | Code review remediation (3 HIGH, 6 MEDIUM, 6 LOW) — 13/15 fixed, 2 pre-resolved | ✅ |
| Phase 3 | Homework overhaul (14.9, 14.10, 14.11, 14.12) | ✅ |
| Phase 4 | Celebration system + crash recovery + adaptive silence (13.3-13.7) | ✅ |

---

## Epic 12 — Detailed Story Status

*Each row verified by reading source files on 2026-04-03.*

| Story | Status | Evidence |
|-------|--------|----------|
| **12.1** (age voice) | ✅ DONE | `exchanges.ts` uses `getAgeVoice(ageBracket)` via `resolveAgeBracket(context.birthYear)`. Zero `personaType` refs in exchanges. `birthYear` computed at runtime from `birthDate` in `profile.ts`. Note: `create-profile.tsx` still collects `personaType` — legacy UI, does not affect voice logic. |
| **12.7** (home cards) | ✅ DONE | `precomputeHomeCards()` in `home-cards.ts`, `HomeActionCard` component, `GET /v1/home-cards` + `POST /v1/home-cards/interactions` routes, ranking heuristics (time-of-day, session patterns, urgency, interaction history), SecureStore dismissal tracking, all wired into `home.tsx`. Card types: `study`, `homework`, `review`, `ask`, `restore_subjects`, `resume_session` (client-side). Missing: `family` and `link_child` cards (depend on persona removal). |
| **12.6** (big migration) | ⏳ ~40% | **Done:** Consent service uses `checkConsentRequired(birthYear)` ✅. Consent middleware uses `meta.birthYear` ✅. Sentry age-gating uses `birthYear` ✅. Inngest payloads use `profileId` not persona ✅. RevenueCat syncs `userId` only ✅. **Not done:** Factory (`buildProfile()` still has `personaType: 'LEARNER'`). Test-seed (9 refs, hardcoded `personaType: 'PARENT'`). Schemas (`personaTypeSchema` still exported). Consent-web deep links still use `mentomate://parent/dashboard`. |
| **12.3** (theme decoupling) | ❌ NOT STARTED | `_layout.tsx:118` derives persona from `activeProfile.personaType.toLowerCase()`. `design-tokens.ts` organizes tokens by `Record<Persona, Record<ColorScheme, ThemeTokens>>`. Color scheme still persona-derived (teen/learner → dark, parent → light). |
| **12.2** (route merge) | ❌ NOT STARTED | Routes still in separate `(learner)/` and `(parent)/` groups. No `(app)/` group exists. |
| **12.5** (routing cleanup) | ❌ NOT STARTED | Persona-based redirects active: `(learner)/_layout.tsx` redirects parent persona to `/(parent)/dashboard`; `(parent)/_layout.tsx` redirects non-parent to `/(learner)/home`. |
| **12.4** (DB migration) | ❌ NOT STARTED | Schema still has `personaType` enum + column and `birthDate` timestamp. No `birthYear` integer column. `birthYear` is computed at API layer from `birthDate`. |

### 12.6 Remaining Work (ordered)

1. **Factory + test-seed** (FR206.8) — DO FIRST. `buildProfile()` in `packages/factory/src/profiles.ts` still defaults `personaType: 'LEARNER'`. `test-seed.ts` has 9 `personaType` refs. Broken factory = ~1,443 broken tests.
2. **Schemas** — Remove `personaTypeSchema`, `PersonaType` type, and `personaType` field from profile schemas in `packages/schemas/src/profiles.ts`.
3. **Consent-web deep links** (FR206.6) — Update `mentomate://parent/dashboard` → post-merge route in server-rendered HTML.
4. **Full grep audit** — Zero `personaType` and zero `birthDate` hits in source code.

---

## Epic 10 — Gap Detail

*Verified against code 2026-04-03. Prior documentation claimed 7 partial + 1 unbuilt. Actual: 1 gap.*

| Story | Prior Claim | Actual Status | Evidence |
|-------|-------------|---------------|----------|
| 10.4 (actionable errors) | Partial | ✅ DONE | SSE error handler in `sse.ts` returns contextual messages |
| 10.5 (curriculum labels) | Partial | ✅ DONE | Relevance labels with colored pills in `curriculum-review.tsx` |
| 10.8 (session summary) | Partial | ✅ DONE | `SessionCloseSummary` component with headline, takeaways, next check-in |
| 10.10 (consent handoff animation) | Partial | ⚠️ **PARTIAL** | Flow works functionally. Transitions are instant state changes, no animated transition. |
| 10.14 (privacyPolicyUrl) | Partial | ✅ DONE | `app.json` line 104: `"privacyPolicyUrl": "https://mentomate.com/privacy-policy"` |
| 10.15 (Library empty state) | Partial | ✅ DONE | Multiple contextual empty states in `library.tsx` |
| 10.17 (email delivery feedback) | "Not built" | ✅ DONE | API returns `emailStatus: 'sent' | 'failed'`, mobile shows conditional messaging + resend |
| 10.18 (rating prompt) | Partial | ✅ DONE | `useRatingPrompt` hook with 5+ recalls, 7+ days, 90-day cooldown, wired to `expo-store-review` |
| 10.22 (ambiguous subject picker) | Partial | ✅ DONE | Disambiguation flow in session screen with candidate buttons |

---

## What Remains — Prioritized

### Immediate (merge existing work)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 1 | **Merge `feat/epic-8-voice-gaps` to main** | Small — review + merge | Nothing |
| 2 | **Fix sign-in bugs** | Unknown — needs investigation | Nothing |

### Short-term (launch readiness)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 3 | **Epic 10.10** — Add animated transition to consent handoff | Small | Nothing |
| 4 | **Pre-launch config** — Clerk staging key swap, Resend API key, RevenueCat store connections | Config, not code | Store account access |
| 5 | **Store blockers** — Apple enrollment (~pending since 2026-03-13), Google Play appeal | Administrative | External |

### Medium-term (v1.1 features)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 6 | **Epic 12 remainder** — 12.6 factory/test-seed/schemas, 12.3 theme, 12.2 route merge, 12.5 routing, 12.4 DB migration | Large (~35 files) | Nothing technical |
| 7 | **Epic 7** — Advisory prerequisite graph (6 stories) | Large (new system) | Nothing (13.7 done) |

### Long-term (post-launch)

| # | Action | Effort | Blocked by |
|---|--------|--------|------------|
| 8 | **Epic 6** — Language learning / Four Strands | Large | Epic 8 merge (#1) |

---

## Key Constraints (active)

1. **Story 12.6 FR206.8 (factory) before any other 12.x test updates** — broken factory breaks ~1,443 tests.
2. **No parallel agents on the same hotspot file** — sequential execution for session screen, Inngest chain, and home screen work.
3. **Epic 8 must merge before Epic 6** — voice infrastructure required for SPEAK/LISTEN strands.

### Resolved Constraints

- ~~Story 13.2 before Story 12.1~~ — Both done.
- ~~Story 12.7 before 14.1~~ — Both done and wired together.
- ~~Story 13.7 before Epic 7 Story 7.5~~ — 13.7 done. Epic 7 unblocked.
- ~~Epic 8 before Epic 6~~ — Epic 8 nearly complete, needs merge.

---

## Hotspot Files

These files are touched by remaining work. Agents must read current state before modifying.

| File | Remaining touches |
|------|-------------------|
| `packages/database/src/schema/profiles.ts` | 12.4 (drop `personaType` + `birthDate`) |
| `packages/schemas/src/profiles.ts` | 12.6 (remove `personaTypeSchema`) |
| `packages/factory/src/profiles.ts` | 12.6 FR206.8 (remove `personaType` default) |
| `apps/api/src/services/test-seed.ts` | 12.6 FR206.8 (remaining `personaType` refs) |
| `apps/mobile/src/app/_layout.tsx` | 12.3 (stop deriving persona from profile) |
| `apps/mobile/src/lib/design-tokens.ts` | 12.3 (remove persona-keyed token structure) |
| `apps/mobile/src/app/(learner)/_layout.tsx` | 12.2 + 12.5 (route merge + redirect removal) |
| `apps/mobile/src/app/(parent)/_layout.tsx` | 12.2 + 12.5 (route merge + redirect removal) |
| `apps/mobile/src/app/create-profile.tsx` | 12.6 (stop collecting personaType) |

### Phase Details (reference)

**Phase 5 — Architecture Refactor (Epic 12):**

```
12.1 (age voice)         ──┐
12.3 (theme decoupling)  ──┤── parallel
                            ├─→ 12.7 (home cards) ─→ 12.2 (route merge) ─→ 12.5 (routing cleanup) ──┐
12.6 (the big migration) ──┤                                                                          ├─→ 12.4 (DB migration)
                            └──────────────────────────────────────────────────────────────────────────┘
```

Story 12.6 is the heaviest — covers FR206.1-206.8. Compatibility slice complete (birthYear plumbing). Remaining: full grep audit for zero `personaType`/`birthDate` hits, then 12.4 drops columns.

**Phase 6 — New Feature Systems:** Epic 7 (concept map), Epic 14 Phase C (session agency). Epic 8 now complete.

**Phase 7 — Language Learning:** Epic 6 (Four Strands). Depends on Epic 8.1-8.2 (done).

## Key Constraints

1. **Story 12.6 FR206.8 (factory) before any other 12.x test updates** — broken factory breaks ~1,443 tests.
2. **Story 12.7 before 14.1** — card dismissal needs the multi-card home screen to exist.
3. **Story 13.7 before Epic 7 Story 7.5** — topic unlock celebration uses `queueCelebration()`.
4. **Epic 8.1-8.2 before Epic 6 SPEAK/LISTEN** — voice infrastructure required (now done).
5. **No parallel agents on the same hotspot file** — sequential execution for session screen, Inngest chain, and home screen work.

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
