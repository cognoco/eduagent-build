# Owner Impact Audit — Top 10 High-Impact Improvements

> **STATUS (2026-06-27):** 1 of 10 top items done (#5 eval gate). Runner-up #14 (migration immutability guard) already existed before the audit. Items #1, #6, #8 are the fast-win batch; #2 is the flagged launch-blocker. Items #3→#4→#7 form the correctness-chain epic, none started. #9 (prompt caching) and #10 (scope guard) unstarted. Runner-up #3 (streak_warning sender) still has no cron. NEXT: batch #1 + #6 + #8, then #2.

**Date:** 2026-06-03
**Status:** Backlog / not started
**Source:** Multi-agent codebase audit (9 dimensions: maintainability, teaching engine, review/mastery, feature surface, data/API architecture, test reality, LLM quality/cost, retention loops, compliance/auth gating). 51 raw findings distilled to this ranked top 10 + runners-up.
**Scope:** Highest-leverage product/engineering improvements — maintainability, correctness/logic, what the product offers, quality, cost, safety. **Excludes documentation work** by request.

> All evidence below is `file:line` cited and was verified by the auditing agents (caller-analysis, grep, and direct file reads). Re-verify against current code before implementing — code is ground truth and the tree moves.

---

## Headline: the engine is built, but half of it isn't plugged in

The dominant pattern across the codebase is **built-but-not-wired**, not missing features. Sophisticated systems exist, pass their tests, and are sometimes scheduled in production — but the single line that actually triggers them was never written. Four of the top ten (#1, #4, #6, #7) are exactly this. For a pre-launch product this is the cheapest, highest-return position to be in: the build cost is already paid; the work is connective tissue.

Per CLAUDE.md, **wired-but-untriggered code is worse than dead code** — it creates false confidence. These items either turn the systems on or remove them.

---

## Ranked top 10

### 1. Turn on the notification engine (it currently sends ~0 pushes)
- **Category:** engagement / functionality — **Effort:** small — **Impact:** high
- **Current state:** The entire out-of-app retention loop (recall nudge, daily reminder, review-due) is built, scheduled, and firing in production — but delivers ~0 pushes because the server-side master switch (`pushEnabled`) defaults to `false` and is never set to `true`, even when the user taps "Allow." `registerPushToken` writes only `expoPushToken`. The daily and review crons additionally gate on `dailyReminders`/`reviewReminders` flags that have no UI toggle, so they can never fire.
- **What to do:** In the "Allow" branch of `use-post-session-notification-ask.ts`, after OS permission resolves `granted`, call the update-notification-settings mutation with `pushEnabled=true` (and seed `dailyReminders`/`reviewReminders` true) alongside token registration — OR have `registerPushToken` set `pushEnabled=true` on insert/update. Add explicit "Daily reminder" and "Review reminders" toggles to `notifications.tsx` (or collapse all three crons to gate on `pushEnabled` only, matching recall-nudge). Add a break test asserting a profile that granted permission becomes eligible in recall-nudge's query.
- **Evidence:** `apps/api/src/services/settings.ts:476-485` (writes only `expoPushToken`, no `pushEnabled`); `packages/database/src/schema/progress.ts:104-105,113` (`pushEnabled`/`dailyReminders`/`reviewReminders` default false); `apps/mobile/src/hooks/use-post-session-notification-ask.ts:99-113`; `apps/api/src/inngest/functions/recall-nudge.ts:96-98`, `review-due-scan.ts:91-94`, `daily-reminder-scan.ts:53-56` (all gate on the flags); `apps/mobile/src/app/(app)/more/notifications.tsx:134-171` (no daily/review toggles).

### 2. Preserve GDPR consent audit proof before profile deletion
- **Category:** compliance / safety — **Effort:** medium — **Impact:** high — **(launch-blocker)**
- **Current state:** `consent_states` cascades on profile delete, and three delete paths (denial, GDPR-withdrawn, no-consent-after-30-days) hard-delete the profile exactly when the legal record — `policyVersion`, `requestIp`, `userAgent` proving lawful consent/withdrawal — is most needed. The app serves minors under GDPR-everywhere; it currently cannot answer a regulator's "show me proof this parent consented." The cascade-fk-guard test ironically enforces the destruction. No `retention_expires_at`/`legal_hold` preservation column exists (whole-tree grep = 0 matches).
- **What to do:** Before any of the three delete paths runs, copy the consent receipt + audit metadata (`policyVersion`, `requestIp`, `userAgent`, `status`, `requestedAt`, `respondedAt`, `consentType`, hashed parent email) into a new account-scoped (non-cascading) `consent_audit_log` table. Add it as a documented `CASCADE_EXCEPTIONS` entry, sweep all three delete paths in one PR, and add a forward-only guard test asserting an audit row survives a profile delete.
- **Evidence:** `packages/database/src/schema/profiles.ts:321` (`consent_states` `profileId` onDelete cascade) + `:347-349` (audit fields); `apps/api/src/services/consent.ts:898-901`; `apps/api/src/services/deletion.ts:301-314,350-359`; `apps/api/src/inngest/functions/consent-revocation.ts:139-143`.

### 3. Make the learning loop capture per-turn answer correctness (so escalation can de-escalate)
- **Category:** logic / core engine — **Effort:** large — **Impact:** high — **(foundational; unblocks #4 and #7)**
- **Current state:** The main teaching loop has no signal for whether a learner answered correctly. `metadata.correctAnswer` is never written by the conversational persistence path (only read), so `computeCorrectStreak` always returns 0 and `evaluateEscalation` only ever climbs the scaffolding rung or holds — there is no de-escalation branch. A learner who recovers stays maximally hand-held for the rest of the topic; the adaptive difficulty ramp is dead, and SM-2 has no per-session quality signal.
- **What to do:** Add a per-turn `answer_evaluation` signal to the learning envelope (`{ correctness: 'correct'|'partial'|'incorrect'|'na', concept? }`), parse it in `envelopeToParsedExchange`, and persist it as `metadata.correctAnswer` in `persistExchangeResult`. Add a de-escalation branch to `evaluateEscalation` that steps the rung down after a correct streak. Gate behind a flag and validate with the eval harness before/after.
- **Evidence:** `apps/api/src/services/session/session-exchange.ts:309-336` (`computeCorrectStreak` reads `metadata.correctAnswer`; verified only read at `:330-331`, `:2035`, never written); `escalation.ts:138-212` (only escalate/hold, no de-escalate); `packages/schemas/src/llm-envelope.ts:222-258` (no per-turn correctness signal).

### 4. Wire the built three-strike adaptive-teaching system into the live exchange loop
- **Category:** feature-gap / core engine — **Effort:** medium — **Impact:** high — **(builds on #3)**
- **Current state:** `adaptive-teaching.ts` fully implements the FR59–FR66 three-strike rule (continue Socratic → switch to direct instruction at strike 3 → flag needs-deepening) with tests, but **no production code calls the strike logic** — the only importer (`retention-data.ts`) pulls in just the post-session capacity math. "Explain directly once the learner is clearly stuck" is exactly the homework-helper-not-Socratic philosophy the product is built on.
- **What to do:** Drive the strike system off the new per-turn correctness signal: increment a per-concept strike on incorrect, inject `getDirectInstructionPrompt` at strike 3 instead of looping Socratic questions, and route to needs-deepening on the next failure. If the escalation ladder is meant to be the sole mechanism instead, **delete the stranded functions and their tests** — do not leave it half-present.
- **Evidence:** `apps/api/src/services/adaptive-teaching.ts:67-89,100-120,131-133`; verified importers — grep shows `adaptive-teaching.ts` + `retention-data.ts` only, and `retention-data` imports `canExitNeedsDeepening`/`checkNeedsDeepeningCapacity` (capacity math), not `recordWrongAnswer`/`getDirectInstructionPrompt`.

### 5. Add CI quality gating for real LLM behavior — seed the baseline and make the guard blocking
- **Category:** quality / safety — **Effort:** medium — **Impact:** high
- **Current state:** The product's core value (tutoring, mastery decisions, envelope signals that drive state machines) has **zero automated regression guard against real model behavior**. `baseline.json` is the placebo `{"flows":{}}`, the only behavioral guard runs `continue-on-error` AND is prompt-path-gated, and no workflow ever runs `eval:llm --live`. A prompt/model change that shifts `partial_progress` from 20% to 2% or drops `envelopeOk` ships silently. The infrastructure is already written.
- **What to do:** Seed `baseline.json` once via `doppler run -- pnpm eval:llm -- --live --update-baseline` and commit it; flip `api-quality-gate.yml`'s `--validate-baseline` step from `continue-on-error: true` to `false` so the placebo can never silently pass; add a scheduled (nightly/weekly) GitHub Actions job running `pnpm eval:llm -- --live --check-baseline` with Doppler secrets that fails on `qualityFailures > 0` or schema violations.
- **Evidence:** `apps/api/eval-llm/baseline.json` (verified = `version`/`updatedAt`/`ref` + `"flows":{}` placebo); `.github/workflows/api-quality-gate.yml:72-75` (`continue-on-error: true`, prompt-gated); `apps/api/eval-llm/runner/runner.ts:268-345` (live/quality checks only fire on `--live`); `providers/mock.ts:18-20` (canned empty signals).

### 6. Promote Challenge Round weak spots from `pending_review` to `active` so they reach the learner
- **Category:** logic / review backbone — **Effort:** small — **Impact:** high
- **Current state:** When a Challenge Round flags a weak concept it is written as `needs_deepening_topics` `status='pending_review'`, but every learner-facing read filters `status='active'`, and the only function that promotes pending→active (`promotePendingDeepening`) has **zero production callers** (referenced only by its own test and docs). The expiry cron then silently flips unpromoted rows to `resolved` after 7 days. The "route weak concepts to remediation" half of the documented mastery policy is dead in production.
- **What to do:** Add a corroborating-signal callsite for `promotePendingDeepening` — e.g. in session-completed's update-needs-deepening step, call it before/alongside `updateNeedsDeepeningProgress`; or, if a single CR failure is sufficient corroboration by design, write `reviewTargets` directly as `status='active'`. Add a break test: create a CR with a misconception, run the pipeline, assert `getSubjectNeedsDeepening` returns the concept.
- **Evidence:** `apps/api/src/services/session/session-exchange.ts:780`; `apps/api/src/services/needs-deepening/promotion.ts:23` (verified zero callers — grep shows only `promotion.test.ts` + docs); `apps/api/src/services/retention-data.ts:1079,1195,1444`; `apps/api/src/inngest/functions/needs-deepening-expire-pending.ts`.

### 7. Schedule spaced review for Challenge-Round-mastered topics (write `retention_cards.nextReviewAt`)
- **Category:** feature-gap / review backbone — **Effort:** medium — **Impact:** high
- **Current state:** On all-solid mastery the pipeline inserts an `assessments` row but never touches `retention_cards`, so `nextReviewAt` stays null and the topic is invisible to every review-scheduling path (`reviewDueScan`, `recallNudge`, the in-app `review_due` coaching card all INNER JOIN `retention_cards WHERE nextReviewAt < NOW`). The most rigorous mastery signal in the app produces no future retrieval practice — directly undercutting the spaced-repetition backbone.
- **What to do:** In the `markMasteryVerified` branch, also `ensureRetentionCard(db, profileId, topicId)` and advance it through SM-2 with quality 5 (reuse `updateRetentionFromSession` or `sm2()` directly) so the topic gets a forward `nextReviewAt`. Add a test asserting `nextReviewAt` is non-null after a verified CR.
- **Evidence:** `apps/api/src/services/session/session-exchange.ts:699-710` (mastery insert, no `retention_cards` write); `apps/api/src/inngest/functions/review-due-scan.ts:64-69`, `recall-nudge.ts:69-73`, `coaching-cards.ts:211` (all join `retention_cards.nextReviewAt`); contrast `review-calibration-grade.ts:102-130` (does set `nextReviewAt`).

### 8. Fix voice STT/TTS locale so non-English learners aren't transcribed/spoken in English
- **Category:** functionality / feature-gap — **Effort:** small — **Impact:** high — **(hits the Norway home market)**
- **Current state:** Voice is product-critical ("kids don't type") and the home market is Norway, yet the session screen only derives a voice locale for language-learning subjects. `languageVoiceLocale` is undefined for any normal subject (math, science, history), so STT defaults to `en-US` and TTS reads the conversation-language LLM prose with an English voice — a Norwegian child speaking Norwegian about science is transcribed by an English recognizer. `cs/ja/pl` have no voice-locale mapping at all.
- **What to do:** Fall back to the learner's conversation language for non-language subjects: `const voiceLocale = activeSubject?.pedagogyMode === 'four_strands' ? getVoiceLocaleForLanguage(activeSubject.languageCode) : getVoiceLocaleForLanguage(activeProfile?.conversationLanguage)`. Add `cs:'cs-CZ'`, `ja:'ja-JP'`, `pl:'pl-PL'` (and `en:'en-US'`) to `LANGUAGE_LOCALES`, plus a guard test asserting every `conversationLanguageSchema` value has a non-fallback entry.
- **Evidence:** `apps/mobile/src/app/(app)/session/index.tsx:610-612` (voice locale only set for `four_strands`), `:1258-1259` (passed to both STT+TTS); `apps/mobile/src/lib/language-locales.ts:20-24` (defaults to `'en-US'`, no cs/ja/pl entries); `use-speech-recognition.ts:193-197`.

### 9. Add Anthropic prompt caching to the multi-KB static system-prompt prefix
- **Category:** cost — **Effort:** medium — **Impact:** high — **(pure margin, scales with usage)**
- **Current state:** `buildSystemPrompt` assembles a large per-turn system prompt whose safety, anti-fabrication, private-source-contract, age-voice, and envelope-format blocks are byte-identical across every turn and session. There is **no `cache_control` anywhere** in the providers. Premium/advanced-rung turns route to Claude Sonnet and pay full input-token price on a prefix that never changes; Anthropic charges ~10% on cache hits.
- **What to do:** Split the system prompt into a stable prefix (safety, anti-fabrication, private-source contract, grounding, age-voice, envelope-format) and a volatile suffix (topic, memory, history). Send the prefix as a separate Anthropic system block with `cache_control: { type: 'ephemeral' }` and add the prompt-caching beta header. Follow on with Gemini context caching for the standard pool.
- **Evidence:** `apps/api/src/services/llm/providers/anthropic.ts:44-50,94-128` (no `cache_control` in any provider); `apps/api/src/services/exchange-prompts.ts:429-459,553-577` (static blocks); `router.ts:329,386-392` (premium → claude-sonnet).

### 10. Add a CI scope guard for profile-scoped service queries (cross-account isolation backstop)
- **Category:** safety / data layer — **Effort:** medium — **Impact:** high
- **Current state:** Cross-account isolation rests entirely on hand-written `profileId` predicates in open-coded parent-chain joins; the G1/G5 lint rules only relocate queries out of route files, they do not verify scoping. A single omitted `subjects.profileId` predicate in a new join leaks another account's data and nothing catches it — RLS is dormant (`withProfileScope` has zero source callers; no `SET ROLE app_user` in middleware). The team has already shipped exactly this class of leak (cross-account-leak incident, 2026-05-10).
- **What to do:** Add an AST guard test (mirroring `orphan-dispatcher.guard.test.ts`) that flags any `db.select()`/`update()`/`delete()` in `services/` touching a profile-scoped table or joining through `subjects`/`curriculum_books` that lacks a `profileId`/`ownerProfileId` predicate in its WHERE, with a `// scope-allow: <reason>` escape for legitimate cron scans. Pair as a fast-follow with activating RLS as the second layer (provision `app_user` role, FORCE ROW LEVEL SECURITY, wrap requests in `withProfileScope`).
- **Evidence:** `packages/database/src/repository.ts:625-688` (open-coded ownership joins); `apps/api/src/services/session/session-topic.ts:33-43`; `eslint.config.mjs:495` (relocates, does not assert scoping); RLS dormancy — `packages/database/src/rls.ts:46-66` `withProfileScope` has 0 source callers, `apps/api/src/middleware/database.ts:96-116` no GUC/role set; `apps/api/drizzle/0027_enable_rls.sql:1-8` (owner bypasses RLS).

---

## Suggested sequencing

- **Fast-wins batch (small effort, high impact):** #1 (notifications on), #6 (CR weak-spots reach learner), #8 (voice locale). Ship together — they change the launch-day experience most per unit of work.
- **Correctness-chain epic:** #3 → #4 → #7. Per-turn correctness is the keystone; the three-strike system and spaced-review scheduling both consume that signal. Treat as one coherent epic, not three PRs landed in isolation.
- **Compliance/safety (pre-launch):** #2 (consent audit preservation) is a launch-blocker; #10 (scope guard) is the cheapest durable defense against the leak class already shipped once.
- **Quality + cost:** #5 (live eval gate) and #9 (prompt caching) are independent and can run in parallel with the above.

---

## Runners-up (strong findings outside the top 10)

1. **Streaming shows unverified/fabricated factual text** to the learner before the source-provenance audit runs in `onComplete()` — `audit`+`applySourceAuditSafetyFallback` only run post-drain at `session-exchange.ts:3216-3221`. Route high-provenance-risk turns through non-streaming `processExchange`, or buffer the first sentence.
2. **`needs_deepening`/rung-5 exit has no server-side hard cap** (`escalation.ts:147-154,273-279`) — violates the engine's own envelope-cap rule. Track exchanges-at-rung-5 and force `needsDeepening` at threshold 3.
3. **No `streak_warning` sender cron** — verified zero senders in `inngest/` despite the enum value and grace-period math existing (`streaks.ts:134-181`). Highest single next-day-return lever, but depends on #1 landing first.
4. **Recall-test screen is built and production-triggered by `recallNudge` but unreachable** — no `router.push` and the nudge push has no deep-link payload (`recall-nudge-send.ts:159-168`). Add deep-link data + in-app CTA.
5. **Gemini safety thresholds hardcoded to `SAFETY_SETTINGS_FOR_MINORS` for all users including adults** (`gemini.ts:40-66,151`) — over-blocks legitimate adult history/toxicology answers. Thread `ageBracket` into `ModelConfig`.
6. **GDPR Art 15 export omits `memory_facts`** (0 references in `export.ts`) and several profile-scoped tables — add tables + a schema-vs-export diff guard test.
7. **No temperature control (~0.2) on structured/JSON envelope and mastery LLM calls** — no `temperature` field in `ModelConfig`, weakening envelope-format reliability on load-bearing signals.
8. **Cross-provider fallback drops premium/advanced-rung turns to `gpt-4o`** instead of a peer-class model (`router.ts:476-541`) — quality cliff during outages. Make `getFallbackConfig` rung/tier-aware.
9. **Free tier pinned to Gemini Flash at every rung** (`router.ts:394-414`) — allow `gemini-2.5-pro` on `rung>=4` for a bounded-cost teaching lift at the hardest moments.
10. **Anchor escalation "stuck" detection** (`escalation.ts:142-145` unanchored `.includes`) so engaged long answers don't false-escalate — small, testable correctness fix.
11. **Decompose the 3,334-line `session-exchange.ts` god-file** (`prepareExchangeContext` alone is ~1,000 lines) into `exchange/` sub-modules — large, but the hottest, most regression-sensitive path.
12. **Collapse the dead nav "flags-off" branch** and consolidate duplicated tab-set constants across `navigation-contract.ts`/`legacy-navigation-contract.ts` — biggest per-change tax in the mobile app. (Note: V0 5-tab mode must not regress — see nav-contract hard constraint before touching.)
13. **Tighten the GC1 `gc1-allow` escape to a closed external-boundary enum** (1,016 free-text stickers across 299 files) so the mock ratchet discriminates again, then burn down route/webhook internal-service mocks.
14. **Add a migration-immutability CI guard** (hash committed `drizzle/*.sql`) — the named fix for the documented staging/prod ledger-drift incident that `check-migration-rollback.sh` does not cover.
15. **Add per-route-group integration tests** for the ~10 highest-risk groups currently covered only by fully-mocked unit tests (challenge-round, dictation, recaps, onboarding, books, filing).
16. **Homework camera leaves the mic hot on unmount** (`camera.tsx:71`, no cleanup effect) — privacy/resource leak on a children's voice flow.
17. **Create `subject/index.tsx` redirect** (missing; `topic/index.tsx` exists) so cross-tab pushes to `/subject/[subjectId]` don't dead-end at Home on back.
18. **Re-surface or retire the fully-built milestones gallery** (no `router.push` to `progress/milestones`) — gamification surface currently invisible.
19. **Delete ~3,300 lines of one-off Python subscription-codegen scripts** (10 files, unreferenced in `package.json`) cluttering the automation-index directory.
20. **Add an EU AI Act Art 50 AI-interaction disclosure** (0 disclosure copy found) — small i18n addition for an unconditional, age-invariant obligation.
