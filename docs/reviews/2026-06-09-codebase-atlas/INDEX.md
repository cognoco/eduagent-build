# Codebase Review + Functional Atlas — 2026-06-09

**Branch:** `new-llm` (HEAD `df3e8e44b`) · **Method:** 30 read-only agents (15 bug-review lenses + 15 functional-atlas domain mappers), Opus+Sonnet mix · **Mutation:** none — no source file edited. Only these report docs were created.

**Surface measured:** 140 mobile screen/component files · 45 API route groups · ~200 service modules · 58 Inngest source files (72 registered fn objects) · 4 shared packages · 72 hooks.

---

## PART 1 — BUG REGISTER (record-only)

### Raw agent counts (before coordinator re-grade)

| Lens | Crit | High | Med | Low | Report |
|---|---|---|---|---|---|
| Correctness & logic | 0 | 1 | 3 | 6 | [bugs/correctness.md](bugs/correctness.md) |
| Security — authn/authz | 0 | 1 | 3 | 3 | [bugs/security-authz.md](bugs/security-authz.md) |
| Data integrity & scoping | 0 | 0 | 1 | 4 | [bugs/data-integrity-scoping.md](bugs/data-integrity-scoping.md) |
| Test quality | 0 | 4 | 6 | 2 | [bugs/test-quality.md](bugs/test-quality.md) |
| Architecture & conventions | 0 | 1 | 4 | 2 | [bugs/architecture.md](bugs/architecture.md) |
| UX & failure modes | 0 | 1 | 6 | 4 | [bugs/ux-failure-modes.md](bugs/ux-failure-modes.md) |
| Performance | 2 | 4 | 4 | 3 | [bugs/performance.md](bugs/performance.md) |
| Schema contract & API types | 1 | 5 | 7 | 4 | [bugs/schema-contract.md](bugs/schema-contract.md) |
| Background jobs & Inngest | 0 | 1 | 3 | 5 | [bugs/inngest-jobs.md](bugs/inngest-jobs.md) |
| DB & migration safety | 2 | 2 | 2 | 2 | [bugs/db-migration.md](bugs/db-migration.md) |
| Error handling & observability | 4 | 3 | 4 | 2 | [bugs/error-observability.md](bugs/error-observability.md) |
| Accessibility & i18n | 2 | 5 | 9 | 7 | [bugs/a11y-i18n.md](bugs/a11y-i18n.md) |
| Dependencies & supply chain | 0 | 5 | 10 | 10 | [bugs/deps-supply-chain.md](bugs/deps-supply-chain.md) |
| Configuration & secrets | 0 | 3 | 4 | 7 | [bugs/config-secrets.md](bugs/config-secrets.md) |
| LLM / AI surface | 0 | 1 | 4 | 4 | [bugs/llm-ai-surface.md](bugs/llm-ai-surface.md) |
| **TOTAL** | **11** | **37** | **70** | **65** | |

### Coordinator re-grade of the 11 "Criticals" (verified against code)

The agents' discovery was excellent (real files, real line numbers, real issues) but several severities were optimistic. Verified verdicts:

| # | Agent's Critical | Verified | True severity |
|---|---|---|---|
| 1 | Migrations `0106`/`0107` are in `_journal.json` (751,758); their DDL is **live SQL** under a `-- REFERENCE ONLY` comment → `drizzle-kit migrate` will execute them on any behind environment. 0107 FKs target `profiles` (reset renames to `person`) so it's also reset-incompatible. | ✅ confirmed live | **CRITICAL (latent deploy landmine)** — the only real Critical |
| 2 | Live challenge-round writes to non-existent `concepts`/`concept_mastery` | ✅ but wrapped in `safeWrite` (catches→Sentry→log) | High — silent dead feature + Sentry noise per round, not a crash |
| 3 | N+1: `useFailedFreeformLibraryFilingSessions` 1+50 fetches (use-sessions:653) | ✅ confirmed | High — edge recovery path, not hot |
| 4 | `getSnapshotsInRange` fetches all then JS-filters (snapshot-aggregation:934) | ✅ confirmed | High |
| 5 | `sessionDonePayloadSchema` 4 fields vs 12+ on wire (sessions:455) | ✅ schema is thin; Zod strips extras | High — silent data loss, not crash |
| 6–9 | 4× observability gaps (notifications x2, metering 500 no-Sentry, clerk-user) | ✅ real; metering+notifications are true gaps; clerk-user/notifications return **typed** failures to caller (graceful, just unlogged) | High (metering, push, email) / Medium (clerk-user) |
| 10 | Auth screens hardcoded English, no i18n (sign-in:1) | ✅ confirmed hardcoded English present | High — **already a known untracked gap** in CLAUDE.md |
| 11 | ~216 locale strings untranslated (de.json) | ✅ confirmed | High — i18n process gap |

**Honest headline: 1 true Critical (the migration journal landmine), ~46 High-class findings.** Full per-finding detail with fix directions in the 15 lens reports.

### High + (re-graded Critical) findings — quick register

| Sev | Lens | Location | Finding |
|---|---|---|---|
| **CRIT** | db-migration | `apps/api/drizzle/_journal.json:746-760` + `0106/0107.sql` | Reference-only migrations are journaled with live DDL; `drizzle-kit migrate` will apply them. Only a comment + manual discipline stops it. |
| High | correctness | `use-post-session-notification-ask.ts:39` | Push-primer guard latched **before** async work → transient throw permanently suppresses the prompt |
| High | security-authz | `middleware/profile-scope.ts:113-166` | Owner-only account/billing routes bypassable by **omitting** `X-Profile-Id` (auto-resolve elevates caller to owner). Header-omission path untested. |
| High | architecture | `routes/assessments.ts:135-248` | Terminal-assessment orchestration (txn + SM-2 + XP/retention) lives in the route handler, not a service |
| High | ux | `child/[profileId]/index.tsx:552,638` | Raw `err.message` leaked to parents on consent withdraw/restore |
| High | performance | `ChatShell.tsx:120-156` | `animateResponse` does O(n·m) work every 40ms tick (full array map + token slice) |
| High | performance | `ChatShell.tsx:233-284` | `renderMessageItem` captures `failedImages` Set in closure → defeats FlatList memoization |
| High | performance | ~101 hook files | ~101 `useQuery` hooks missing `staleTime` → refetch storms on app-foreground |
| High | schema | 77 mobile call sites | `(await res.json()) as {...}` bypasses runtime validation across 18 hook files |
| High | schema | `routes/challenge-round.ts`, `sessions.ts:545`, `session-crud.ts:1552` | Multiple endpoints return `c.json` with no schema parse; shapes not in `@eduagent/schemas` |
| High | inngest | `filing-timed-out-observe.ts:303` | `step.sendEvent` nested inside a `step.run` callback — **illegal Inngest step nesting, throws at runtime** |
| High | db | `deploy.yml:251` | No migration-immutability guard; pipeline trusts journal hashes with no drift detection |
| High | db | `0088_bug363_*.sql:37` | TRUNCATE + PK swap with no explicit BEGIN/COMMIT wrapper |
| High | error-obs | `notifications.ts:134,332` / `metering.ts:748` | Push/email HTTP errors + Metering 500 with no `captureException` |
| High | error-obs | `_layout.tsx:81` | No `MutationCache.onError` → mobile mutation failures not globally reported |
| High | error-obs | `use-revenuecat.ts:83` | RevenueCat identity-sync exhaustion is breadcrumb-only |
| High | a11y | `relearn.tsx`, `create-profile.tsx:230`, `profiles.tsx:278`, `ModeSwitcher.tsx:126` | Multiple screens with hardcoded English (role labels, validation, errors) |
| High | a11y | `i18n/index.ts:122` | `accessibilityLanguage` never set → screen-reader mispronounces non-EN content |
| High | deps | `mobile/package.json:32,43` | Deprecated `@clerk/clerk-expo` (no more security patches); outdated `@sentry/react-native@8.1.0` |
| High | deps | `pnpm-lock.yaml` | `ws@6.2.3`, `@xmldom/xmldom@0.8.11` (self-described "critical"), `@ungap/structured-clone` (CWE-502) |
| High | config | `wrangler.toml:142` | Staging API reachable via `*.workers.dev`, bypassing WAF + rate-limiting |
| High | config | `index.ts:93` / `wrangler.toml:121` | Stale `Bindings` type (20+ missing); `IDEMPOTENCY_KV` commented out in all envs — replay dedup not operational |
| High | llm | `memory.ts:122` → `exchange-prompts.ts:898` | pgvector memory injected into system prompt unescaped → second-order prompt-injection vector |

### Notable cross-lens items (handed off in agent reports)
- **Billing refund edge:** `metering.ts:1006-1029` top-up refund decrements `usedToday` even when the credit UPDATE matches 0 rows → refunds a daily slot without refunding the credit.
- **Safety tripwire:** `safety-tripwire.ts:43` doesn't normalize homoglyphs/zero-width/leetspeak before regex → trivial obfuscation bypass (documented precision-over-recall tradeoff).
- **Duplicated 402 classifiers:** `api-client.ts:285` and `sse.ts:408` classify quota separately → drift risk.
- **Hand-written invalidation key tuples** must stay byte-aligned with `query-keys.ts` → silent stale-UI on drift.
- **Stranded guard:** `validateNoteDraft` (note-draft.ts:117) hallucination guard is fully built but **UNWIRED** — no production caller (notes.ts:237) — in the #2 product pillar.

*Confirmed already-fixed: the prior-memory navcontract `isAdultOwner` null bug is fixed at `age.ts:60`.*

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
