# Codebase Review + Functional Atlas — 2026-06-09

**Branch:** `new-llm` (HEAD `df3e8e44b`) · **Method:** 30 read-only agents (15 bug-review lenses + 15 functional-atlas domain mappers), Opus+Sonnet mix · **Mutation:** none — no source file edited. Only these report docs were created.

**Surface measured:** 140 mobile screen/component files · 45 API route groups · ~200 service modules · 58 Inngest source files (72 registered fn objects) · 4 shared packages · 72 hooks.

---

## PART 1 — BUG REGISTER → migrated to Notion (2026-06-10)

The bug register (the 15 `bugs/*.md` lens reports) has been **retired from the repo so bugs live in one place only.** Findings were re-verified against `new-llm` HEAD on 2026-06-10: ~36% were already fixed (pruned), the rest were triaged, de-duplicated against the existing tracker rows, and the still-live findings filed as **25 theme-grouped items** in the Notion **"Issue Tracker – Open"** database.

- **Notion DB:** https://www.notion.so/cognix/3598bce91f7c807086ebe012bd99f184
- **Excluded as already-tracked:** trial-expiry single-`step.run`; recall-nudge / review-due dedup races; RevenueCat `SUBSCRIBER_ALIAS` merge; `lodash`-via-detox; the 340 `gc1-allow` internal-mock backlog (228-jest.mock + GC6 rows); CI EAS / Worker-deploy approval gaps; `GET /usage` family leak; consent-page rate-limit.
- **Dropped as inert:** the data-integrity defense-in-depth Lows (self-rated negligible) + CANNOT-VERIFY cross-lens hand-offs.
- **Full original per-finding detail** (all severities, all 15 lenses, with the coordinator re-grade of the 11 "Criticals") remains in **git history** at `docs/reviews/2026-06-09-codebase-atlas/bugs/` — deleted from HEAD in the same change.

> The review's honest headline stands: **1 true Critical** (the `0106`/`0107` migration-journal landmine — since fixed and pruned) and **~46 High-class findings**. The prior-memory navcontract `isAdultOwner` null bug was confirmed fixed at `age.ts:60`.

---

## PART 2 — FUNCTIONAL ATLAS (the "too many levels" problem, quantified)

| Domain | Screens | User tasks | Max nav depth | Complexity signals | Report |
|---|---|---|---|---|---|
| Onboarding / consent / auth | 19 | 15 | **10** | 8 | [atlas/onboarding-consent-auth.md](atlas/onboarding-consent-auth.md) |
| Home / nav / tab-shapes | 12 | 12 | 4 | 11 | [atlas/home-nav-tabshapes.md](atlas/home-nav-tabshapes.md) |
| Core learning session | 5 | 14 | 4 | 10 | [atlas/learning-session.md](atlas/learning-session.md) |
| Subjects / curriculum / books | 8 | 9 | 4 | 9 | [atlas/subjects-curriculum-books.md](atlas/subjects-curriculum-books.md) |
| Topics / practice / assessment | 7 | 14 | 5 | 10 | [atlas/topics-practice-assessment.md](atlas/topics-practice-assessment.md) |
| Quiz / challenge / mastery | 7 | 15 | 4 | 9 | [atlas/quiz-challenge-mastery.md](atlas/quiz-challenge-mastery.md) |
| Progress / reports / streaks | 15 | 16 | 4 | 10 | [atlas/progress-reports-streaks.md](atlas/progress-reports-streaks.md) |
| Recaps / notes / memory | 7 | 12 | 5 | 9 | [atlas/recaps-notes-memory.md](atlas/recaps-notes-memory.md) |
| Dictation / homework / OCR | 6 | 13 | **7** | 13 | [atlas/dictation-homework-ocr.md](atlas/dictation-homework-ocr.md) |
| Vocabulary / language | 8 | 11 | 4 | 10 | [atlas/vocabulary-language.md](atlas/vocabulary-language.md) |
| Parent / family | 15 | 12 | 4 | 9 | [atlas/parent-family.md](atlas/parent-family.md) |
| Billing / subscription | 10 | 12 | 3 | 10 | [atlas/billing-subscription.md](atlas/billing-subscription.md) |
| Notifications / reminders | 5 | 12 | 5 | 12 | [atlas/notifications-reminders.md](atlas/notifications-reminders.md) |
| Settings / account / privacy | 15 | 20 | 4 | 13 | [atlas/settings-account-privacy.md](atlas/settings-account-privacy.md) |
| Inngest cross-cutting | 0 | 11 | n/a | 8 | [atlas/inngest-crosscutting.md](atlas/inngest-crosscutting.md) |

### Cross-cutting redesign themes (the raw material for "one screen")

1. **The session is already one screen.** `session/index.tsx` (1,335 lines) renders all 6 modes via a `mode` param. The product is structurally half-there — the pain is **invisible, context-gated affordances** and **stacked overlays**, not route count. The hard constraint: the backend loop (escalation × envelope × source-audit × challenge-round × the 17-step session-completed Inngest pipeline) does **not** simplify when the UI does.
2. **Pervasive redundancy / multiple front doors.** Progress shown in 3+ places; reports reachable from 4+ entry points; add-child from 3; session from 4+ paths; notes addable 4 ways; vocab across 3 surfaces; filing from 4 UI paths; quota/usage on 3 screens. Two near-duplicate report-detail screens, two ~700-line mentor-memory editors, two child-progress entry points.
3. **Buried & invisible features.** Onboarding = 12 sequential full-screen gate states (depth 10). Milestones gallery, XP system, teach-back, evaluate, dictation streak, native-language API, AI-upgrade add-on: **all built, zero or near-zero UI surface.** Dictation review is 5–7 taps deep.
4. **The #2 pillar (continuity/memory) has no home.** Recaps / My Notes / Mentor-memory live in 3 unrelated tabs/icons; one session yields 3 overlapping report types from the same rows.
5. **Two parallel nav engines + a hidden mode axis.** `resolveNavigationContract` (V1) vs legacy helpers (V0), both flags OFF in prod → legacy path runs; one family owner can yield 3/4/5 tabs. A Study/Family `ModeSwitcher` invisibly re-skins every tab root.
6. **The invisible machine.** 58 Inngest functions drive recaps, progress, pushes, reports, GDPR lifecycle — **zero UI, "result without origin,"** no in-app pending-actions view for multi-day timers.

### Full domain summaries
See each `atlas/*.md` for screen→task→backend(file:line) maps, navigation-depth tables, and per-domain consolidation targets. The 15 summaries are the substrate for the one-screen redesign.

### Redesign direction (2026-06-10)
- The canonical direction now lives in the [mentor-is-the-app spec](../../specs/2026-06-09-mentor-is-the-app-shell-redesign.md). Two interim records produced during the 2026-06-09/10 brainstorm — the parallel-session frequencies synthesis (`one-screen-second-opinion.md`) and the direction record (`DIRECTION-one-surface.md`) — were **fully dissolved into the spec** (§2 P5–P7, §2.1 noticing loop, §3.1/§3.2 cold starts, §4.2 pointer module, §13.7, §15.14–19, Annex D) and deleted on 2026-06-10; both are recoverable from git history. Open in the spec's §13: the assertiveness dial (13.7) plus six phase-gates.
