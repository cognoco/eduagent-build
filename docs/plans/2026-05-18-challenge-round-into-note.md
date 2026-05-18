# Sunset Challenge Mode Toggle + Add Challenge Round Into Note — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
Phase 0 — sunset the persistent "Challenge mode" / "Explorer" toggle that currently lives in the session header. All learners default to today's `casual` behavior (immediate XP, warm tone, no mastery gates, no mandatory summaries).
Phase 1 — replace what "Challenge mode" did emotionally with a contextual, learner-celebrated **Challenge Round** event the LLM offers mid-session when the learner shows readiness. The learner answers 2–3 deeper "explain-back" questions, the LLM evaluates each concept (`solid|partial|missing|misconception`), and a learner-owned note is drafted from their *own* correct answers. Note save is always explicit. Mastery is server-decided and conservative: any partial/misconception blocks the "challenge-verified" axis. The existing "Too easy" quick chip becomes a second entry path — it routes to the Challenge Round offer when readiness gates pass, otherwise behaves as today.

**Architecture:**
- Sunset by deletion, not deprecation (pre-launch, no users — see `feedback_pre_launch_no_users.md`). The `learningModes` table loses its `mode` and `consecutiveSummarySkips` columns; the enum value `'serious'` is removed from schemas + DB; XP + prompt + mastery + summary branches collapse to a single path.
- New feature is server-driven: trigger eligibility on the server, LLM proposes via envelope signals, server gates and decides mastery, Inngest fans out non-core side effects via `safeSend()`.
- Per-answer structured evaluation reuses the existing `parseEnvelope()` pipeline.
- Note drafting reuses the existing `topic_notes` table and `POST /subjects/:subjectId/topics/:topicId/notes` route — the only addition is a `source: 'user' | 'challenge_round'` column for provenance.
- Mobile UI follows the `fluency_drill` ui_hint pattern that's already proven (server emits ui_hint → mobile detects in `use-session-streaming.ts` → mobile renders widget).

**Tech Stack:** TypeScript, Drizzle ORM (Postgres/Neon), Hono (API), Zod (`@eduagent/schemas`), Inngest (post-round side effects), React Native / Expo (mobile), Jest, NativeWind semantic tokens, react-i18next.

---

## Adversarial Review Findings Applied (2026-05-18)

This plan was adversarially reviewed before execution. The following findings shaped the task list; finding IDs appear inline next to the amendments they triggered.

- **CRIT-1** — `topicProgress` table referenced in original plan does not exist. Mastery is computed at runtime in `services/progress.ts` and `services/escalation.ts`, not stored. Resolved by Task 0.0 spike + revised Task 9 column-placement.
- **CRIT-2** — `reviewTargets` table does not exist anywhere in the repo. Original plan treated it as ambient infra. Resolved by Task 0.0 spike + explicit "build vs. reuse" decision in Task 9.
- **CRIT-3** — `getSessionById` / `persistSessionMetadata` helpers do not exist. Original plan imports them from `session-crud`. Resolved by Task 0.0 spike that names the real helpers or extracts new ones with a profileId-protection break test.
- **CRIT-4** — `struggleStatusSchema` is not exported from `@eduagent/schemas` (only inline enum). Resolved by Task 3.0 export step before Task 3.
- **CRIT-5** — XP collapse must preserve `'pending'` and `'decayed'` READS even though writer becomes single-path. Multiple consumers (`progress.ts:346, 772`, `retention-data.ts:91, 107`, `retention.ts:15`, dashboard) branch on these. Resolved by amended Task 0.2 Step 4–7.
- **CRIT-6** — `consecutiveSummarySkips` deletion blast radius is 8 files, not 2. Resolved by amended Task 0.2 file list + mandatory grep step.
- **CRIT-7** — Every destructive migration must follow the CLAUDE.md `## Rollback` 3-line format. Resolved inline in Tasks 0.1, 2, 8, 9.
- **HIGH-1** — Note-draft lexical guard catches topic drift, not value substitution. Misconception substitution is caught earlier by `decideMasteryAndReview` rejecting non-`solid` concepts from the draft prompt. Guard claim downgraded in Task 6.
- **HIGH-2** — Race: server-initiated and chip-initiated offer paths can collide. Resolved by amended `/maybe-offer` route in Task 9 + Failure Modes row.
- **HIGH-3** — Streaming envelope may flush `challenge_round_offer` before server-side gate strips it. Resolved by Task 10 Step 5.0 (verify streaming protocol) + suppression-at-source mitigation if mid-stream signals leak.
- **HIGH-4** — `getContextualQuickChips` is unaware of `challengeRound.state`. Resolved by added Task 10 Step 8.5.
- **HIGH-5** — "Line ~XYZ" instructions are unsafe; line numbers drift. Resolved by replacing every "remove line ~X" instruction with "grep + enumerate + decide" in Tasks 0.3, 0.5.
- **MED-1** — `notes.source` requires sweep across 6 schema sites, not just `createNoteInputSchema`. Resolved in Task 8 Step 1.
- **MED-2** — Cooldown FK cascade semantics documented in Task 2.
- **MED-3** — `MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4` is a guess. Resolved by Task 6 calibration step + TODO marker.
- **MED-4** — Inngest event-name registration must be cited, not assumed. Resolved in Task 9 Step 5.
- **MED-5** — `topic-completion.ts` contract for the new column is not specified. Resolved in Task 9 Step 1.5.
- **MED-6** — Decline-cooldown smoke is impractical with a hardcoded 24h. Resolved in Final Validation Smoke 5.
- **MED-7** — `verifyXp` / `verifyPendingXp` left-in-place fate clarified in Task 0.2 Step 7.
- **LOW-1** — Rollback sections use the prescribed format even pre-launch (Task 0.1).
- **LOW-2** — State→prompt mapping table added in Task 7 Step 3.
- **CRIT-8** — The original plan allowed the partial/misconception path to degrade to Sentry-only logging if no review-target persistence was chosen. That violates the product requirement: keep correct learner work, remember the shaky concept, and do not mark mastered. Resolved by Task 0.0 Step 2: a durable weak-spot target is mandatory for v1.
- **HIGH-6** — Drafting from "solid concepts" alone is not enough; the note drafter must receive exact learner-owned answer snippets, not the full transcript and not vague concept labels. Resolved by Task 1 evaluation schema additions (`answerEventId`, `learnerQuote`) and Task 6 validation updates.
- **HIGH-7** — The partial-success flow was described but not asserted in integration tests. Resolved by Task 11: mixed outcome must save a note containing only the solid learner quotes, persist weak-spot review data, and leave mastery unset.
- **HIGH-8** — "Server-owned mastery" was overstated. The server owns policy and caps, but correctness still depends on LLM evaluation quality. Resolved by Task 5/7/11: add adversarial misconception false-positive tests and phrase the invariant as "server-owned conservative gating over structured LLM evidence."
- **MED-8** — `retentionStatus === 'strong'` only would make Challenge Rounds too rare for learners who are doing well in a first session. Resolved by Task 3: permit a current-session high-confidence path (`new|strong` retention with longer correct streak and no struggle).
- **MED-9** — Mid-round app close/session timeout was promised but not given an implementation task. Resolved by Task 8.5: persist pending draft recovery state and add an explicit integration test.

---

## Pre-Work Findings (codebase audit, 2026-05-18)

### Surfaces affected
- **Session header** — `useLearningModeControl` button + bottom sheet (`apps/mobile/src/app/(app)/session/_components/LearningModeControl.tsx`). To be removed.
- **More tab Learning Mode section** — copy keys `more.learningMode.*` (`apps/mobile/src/i18n/locales/en.json:278-295`). To be removed.
- **Active session chat** (`apps/mobile/src/app/(app)/session/index.tsx`) — render new Challenge Round components; remove `LearningModeControl` from header.
- **"Too easy" quick chip** (`apps/mobile/src/components/session/session-types.ts:121-126`, `getContextualQuickChips:271-282`) — extended: on tap, if readiness gates pass server-side, trigger Challenge Round offer; otherwise current behavior (LLM-nudged harder follow-up).
- **LLM exchange loop** (`apps/api/src/services/exchanges.ts → processExchange`) — dispatch challenge-round trigger evaluation + envelope handling.
- **Prompt builder** (`apps/api/src/services/exchange-prompts.ts:175-192`) — collapse `getLearningModeGuidance()` to single tone; inject challenge-round prompt block when active.
- **XP service** (`apps/api/src/services/xp.ts:108-113`) — collapse to single path (immediate `verified` for all, with an additional "verified by challenge round" axis available for analytics, not for XP delay).
- **Settings service** (`apps/api/src/services/settings.ts:459-486`) — delete `getLearningModeRules()`, `consecutiveSummarySkips` tracking, summary-skip warnings.
- **Schemas** (`packages/schemas/src/progress.ts:15, 107-110, 159-164`) — remove `learningModeSchema`, `learningModeUpdateSchema`, `getLearningModeResponseSchema`.
- **DB schema** (`packages/database/src/schema/progress.ts:166-188`) — drop `mode` + `consecutiveSummarySkips` columns from `learningModes` table; drop `learningModeEnum`.
- **API routes** — delete learning-mode GET/PUT endpoints.
- **Mobile hooks** — delete `useLearningMode()`, `useUpdateLearningMode()`.
- **Eval-harness flows** (`apps/api/eval-llm/flows/exchanges.ts:292, 538`, `flows/probes.ts:30, 182`, `flows/topic-probe-signals.ts:155-182`) — remove `learningMode` from context defaults and conditional logic.
- **Topic completion + mastery** (`apps/api/src/services/topic-completion.ts`, `services/snapshot-aggregation.ts`) — add `masteryChallengeVerifiedAt` axis.
- **Retention/review** (`apps/api/src/services/retention-data.ts`) — accept `source: 'challenge_round'` on review-target writes.
- **Notes** (`apps/api/src/services/notes.ts`, `apps/mobile/src/hooks/use-notes.ts`) — reused for drafted-note persistence; add `source` column.

**Out of scope:** Practice / recall / dictation / quiz / freeform/ask-anything sessions for v1 (trigger evaluator hard-gates these). Homework permanently excluded (`feedback_homework_not_socratic.md`). Parent dashboard badge for challenge-verified mastery (schema lands; UI badge is v2). Voice-only flow, rewards/streaks, multi-round per session, parent-challenges-child.

### What exists today (with line citations)
**Persistent Challenge mode toggle (to be removed):**
- `apps/mobile/src/app/(app)/session/_components/LearningModeControl.tsx:1-175` — header button + bottom-sheet picker with Explorer (compass icon) / Challenge mode (trophy icon).
- `apps/mobile/src/i18n/locales/en.json:278-295` — "Challenge mode" copy: *"Push yourself further. Your mentor keeps you on track. You earn points after proving you remember, and recaps help lock it in."*
- `packages/database/src/schema/progress.ts:166-188` — `learningModes` table with `mode (enum, default='serious')`, `consecutiveSummarySkips`, plus retained-utility fields `medianResponseSeconds`, `celebrationLevel`.
- `packages/database/src/schema/progress.ts:174` — `learningModeEnum = ['serious', 'casual']`.
- `packages/schemas/src/progress.ts:15` — `learningModeSchema`.
- `packages/schemas/src/progress.ts:107-110, 159-164` — `learningModeUpdateSchema`, `getLearningModeResponseSchema`.
- `apps/api/src/services/settings.ts:459-472` — `getLearningModeRules()` → `{masteryGates, verifiedXpOnly, mandatorySummaries}` by mode.
- `apps/api/src/services/settings.ts:476-486` — `consecutiveSummarySkips` counter + warn-at-5 logic.
- `apps/api/src/services/xp.ts:108-113` — XP status branching: casual → `'verified'` immediate; serious → `'pending'` until delayed-recall verification.
- `apps/api/src/services/exchange-prompts.ts:175-192` — `getLearningModeGuidance()` injects mode-tailored tone string into system prompt.
- `apps/api/eval-llm/flows/exchanges.ts:292, 538` — `learningMode: 'casual'` default in scenarios + `contextOverrides.learningMode === 'casual'` branch.
- `apps/api/eval-llm/flows/probes.ts:30, 182` — probe context conditional on `learningMode === 'casual'`.
- `apps/api/eval-llm/flows/topic-probe-signals.ts:155-182` — `profile.learningMode` passed into context with conditional override.
- Tests: `apps/api/src/services/xp.test.ts:15-17, 282-284`; `apps/api/src/services/settings.test.ts:312-314, 322-324`; `apps/mobile/src/app/(app)/session/index.test.tsx`; `apps/api/src/services/session/session-cache.test.ts`.

**Infrastructure reused by the new feature (kept untouched):**
- `packages/schemas/src/llm-envelope.ts:11-72` — envelope with `signals.*` + `ui_hints.*`. Pattern we extend.
- `apps/api/src/services/llm/envelope.ts:165-182` — `parseEnvelope()` with surface-tagged failure paths.
- `apps/api/src/services/llm/envelope.ts:51-62` — `fluency_drill` ui_hint as the canonical widget pattern.
- `apps/api/src/services/exchanges.ts → processExchange` — the dispatch + envelope-parse point.
- `apps/api/src/services/exchange-prompts.ts:79-184` — `buildSystemPrompt()` — challenge-round prompt block plugs in here after `getLearningModeGuidance()` is collapsed.
- `packages/schemas/src/notes.ts:3-39` — `topicNoteSchema` with nullable `sessionId`.
- `apps/api/src/services/notes.ts:48+` — `createNote()` with `dedupeExactSessionContent`.
- `apps/api/src/routes/notes.ts:56+` — `POST /subjects/:subjectId/topics/:topicId/notes`.
- `apps/mobile/src/components/library/Note*.tsx` + `apps/mobile/src/hooks/use-notes.ts` — `NoteInput` + `useCreateNote`.
- `packages/schemas/src/progress.ts:240, 256, 258, 259` — `retentionStatus`, `struggleStatus`, `masteryScore`. Read by trigger evaluator; mastery gains a new `masteryChallengeVerifiedAt` axis.
- `packages/schemas/src/sessions.ts:85-89, 224` — `sessionTypeSchema` (`learning|homework|interleaved`); `MIN_EXCHANGES_FOR_TOPIC_COMPLETION = 5`.
- `apps/mobile/src/components/session/use-session-streaming.ts` — existing ui_hint detection pattern.
- `apps/mobile/src/lib/strip-envelope.ts` — strips ui_hints from learner-visible reply.
- `apps/mobile/src/components/session/session-types.ts:121-126, 271-282` — `too_easy` chip definition + `getContextualQuickChips` (chips shown when last assistant message is a statement: `know_this, explain_differently, too_easy, example`).

### What does NOT exist (must build net-new)
- Any concept-by-concept LLM answer evaluator.
- Any AI-drafted note generator (all current notes are user-typed).
- Any in-session mode-switch state machine.
- Any review-target persistence with `source: 'challenge_round'` provenance.
- Any "Too easy chip → server-side eligibility → maybe Challenge Round" routing.

### What this PR adds
- **Phase 0 (sunset):**
  - DB migration: drop `mode`, `consecutiveSummarySkips` columns from `learningModes`; drop `learningModeEnum`.
  - Code removals: `learningModeSchema`/`Update`/`Response`, `getLearningModeRules`, `getLearningModeGuidance`, learning-mode routes + hooks + UI + i18n keys + tests.
  - XP collapse: single `'verified'` path immediately; remove `'pending'`/`verifiedXpOnly` branch.
  - Prompt collapse: single warm-but-direct tone (today's `casual` tone is the new default — see Recommended scope below).
- **Phase 1 (feature):**
  - Envelope additions: `signals.challenge_round_offer`, `signals.challenge_round_evaluation`, `ui_hints.challenge_round`, `ui_hints.note_draft`.
  - `apps/api/src/services/challenge-round/` module: trigger evaluator, state machine, caps, prompt blocks, evaluation parser, note drafter, mastery decision.
  - `sessionMetadata.challengeRound` state field.
  - `challenge_round_cooldowns` table (per-profile/per-topic cooldown rows).
  - `notes.source` column with `'user' | 'challenge_round'`.
  - `topicProgress.masteryChallengeVerifiedAt` column.
  - `reviewTargets.source` column.
  - Mobile components: `ChallengeOfferCard`, `ChallengeRoundBanner`, `DraftedNoteReview` + `use-challenge-round` hook.
  - Inngest function: `challenge.round.completed` for fan-out.
  - "Too easy" chip handler extended: on tap, calls `POST /challenge-round/maybe-offer`; server-side `evaluateChallengeReadiness` decides; if eligible, transitions to `offered` and the LLM's next response includes the offer; otherwise, the chip dispatches today's `too_easy` system prompt.

### Walkthrough per entry
- **Session opens, learner sees no header toggle (was Explorer/Challenge mode dropdown):** Header is cleaner. No mode picker. Tone is consistent across all sessions (the new default = today's casual tone — warm + concrete examples). **Risk: low** (pre-launch, no muscle-memory to disrupt).
- **Learning session, learner answers 2 in a row correctly, topic in `strong` retention, ≥5 exchanges in:** Server-side trigger evaluator returns `eligible: true`. LLM is told it MAY offer in its next response. LLM emits `signals.challenge_round_offer: true` with a one-sentence pitch in `reply`. Mobile shows `ChallengeOfferCard` with `Try it` / `Not now` / `Don't ask again this session`. **Risk: low** (offer only, escapable).
- **Learner taps "Too easy" chip in eligible context:** Mobile calls `POST /challenge-round/maybe-offer`; server runs `evaluateChallengeReadiness`. If eligible, server flips `sessionMetadata.challengeRound.state = 'offered'` and returns `{ offered: true }`. Mobile shows `ChallengeOfferCard` immediately. The chip's traditional `too_easy` LLM-nudge does NOT fire (the offer card is the substitute). **Risk: low.**
- **Learner taps "Too easy" chip in ineligible context (e.g., on exchange 3, or during homework):** Server returns `{ offered: false, reason: '...' }`. Mobile falls back to today's behavior: dispatches the `too_easy` system prompt that nudges the AI to raise difficulty for the next response. The chip's traditional behavior is preserved. **Risk: low** (no UX regression).
- **Learner accepts, answers all 3 challenge questions well:** Server transitions `challengeRound = active → drafting`. LLM emits per-question evaluations + a drafted note in `ui_hints.note_draft`. Mobile shows `DraftedNoteReview` with `Save`, `Edit`, `Skip`. On Save, hits `POST /subjects/:subjectId/topics/:topicId/notes` with `sessionId` linkage and `source: 'challenge_round'`. Mastery gains `masteryChallengeVerifiedAt = now`. **Risk: low.**
- **Learner accepts, answers 2 of 3 well, 1 with a misconception:** Drafted note includes only the 2 solid concepts. Mobile copy: "You've got the strong pieces. I'll save those — we'll tighten the fuzzy bit next time." Misconception persisted to review targets with `source: 'challenge_round'` + the correction text. Mastery NOT flipped. **Risk: medium** — copy must never use failure framing (`feedback_positive_framing_no_struggle.md`).
- **Learner accepts, answers all 3 with misconceptions:** No note created. Mobile copy: "Let's revisit this together first." Server records `outcome: 'reteach_recommended'`; sets a next-session-hint. **Risk: medium.**
- **Homework session:** Trigger evaluator hard-gates `false`. Never offered, even if "Too easy" chip is tapped. **Risk: zero by design.**
- **Learner declines offer:** `challengeRound.state = 'declined'`. Trigger evaluator suppresses for the rest of this session. Persists cooldown row (`challenge_round_cooldowns`) for ≥24h on the topic. **Risk: low.**
- **Session ends mid-Challenge Round (back gesture, app close, timeout):** Server-side auto-completes: if ≥1 solid concept, drafted-note offered on next app open via the existing pending-note pattern (extend `ui_hints.note_prompt` to carry the drafted content for `post_session` variant). If zero solid, no artifact. **Risk: medium** — covered in Failure Modes.
- **Practice / recall / dictation / interleaved sessions:** Trigger evaluator hard-gates `false` for v1. Plumbing exists for future expansion.
- **Ask-anything / freeform:** No `topicId` → no note target → trigger hard-gated `false`.
- **Existing users with `learningMode = 'serious'` row in DB:** Migration overwrites all rows to one consistent default before column drop. Pre-launch — no real users to surprise.

### Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Migration fails mid-deploy | Drop column step errors on staging | n/a — staging only | Rollback the migration (forward-only after staging green; per CLAUDE.md schema rules, every destructive migration needs a Rollback section — included in Task 0.1 migration plan). |
| Existing user has `'serious'` row at deploy time | Old row exists when enum is dropped | n/a — pre-launch | Migration step 1 sets all rows to `'casual'`, step 2 drops the enum value, step 3 drops the column. Three explicit steps. |
| LLM emits malformed envelope mid-round | Parser fails | Mobile renders `reply` only; no challenge ui_hint advances | Server marks `outcome: 'parse_error'`, no note save, no mastery change. Sentry breadcrumb `challenge.envelope_parse`. |
| LLM emits `note_draft` with content not derivable from learner messages | Hallucination guard fires | Draft NOT shown | Lexical-overlap check (<40% with learner answers) rejects; falls back to `outcome: 'draft_rejected'` with reason persisted for eval review. |
| Learner taps Save, network drops | POST notes fails | `DraftedNoteReview` shows retry, draft preserved in component state | Reuses in-component state; offline queue not added in v1 (see Out of Scope). |
| Quota exhausted just before challenge-round LLM call | Monthly cap hit | Offer card never shown | Trigger evaluator suppresses when quota < 5% remaining; no degradation, falls back to normal session. |
| Evaluation false-positive (LLM marks `misconception` on correct answer) | Eval flake | Concept incorrectly filed to review targets | Learner can dismiss review targets from the existing review-targets affordance; eval-harness scenario tracks evaluation flakiness for prompt iteration. |
| Session timer expires mid-round | Auto-end | Drafted note offered on next app open via `note_prompt.post_session` | Same as "session ends mid-round." One explicit integration-test case. |
| Same topic offered Challenge Round immediately after a decline | Trigger forgets decline | None — guarded server-side | Decline state persists in `sessionMetadata` for this session + cooldown row (`challenge_round_cooldowns`) for 24h on the topic. |
| LLM emits `challenge_round_offer` mid-round | Confused state | None — server strips the signal | Server filters when `challengeRound.state ∈ {offered, accepted, active, drafting}`. |
| "Too easy" chip tapped while already in offered/active state | Re-tap | Chip does nothing (or surfaces a tiny "already in challenge round" toast) | Mobile guard: chip disabled when `challengeRound.state ∈ {offered, accepted, active, drafting}`. |
| Mastery race: snapshot-aggregation reads mid-round | Reader sees in-flight state | Parent dashboard could show partial state | Snapshot reader filters out rows where `challengeRound.state ∈ {accepted, active, drafting}`. |
| Concurrent offer race (HIGH-2): LLM emits `challenge_round_offer` while learner taps "Too easy" in the same window | Both paths call `transitionChallengeState({type:'offer'})`; the second throws "illegal: cannot offer from state=offered" | Mobile chip sees a 500; console error | `/maybe-offer` route checks current state BEFORE transitioning; if already `offered|accepted|active|drafting`, returns `{offered: true, alreadyOffered: true}` and mobile no-ops. Unit test in Task 9. |
| Stream race (HIGH-3): server strips `challenge_round_offer` after `parseEnvelope`; mobile streaming may have already surfaced it | Brief offer card flash, then disappears | Confusing flicker | Task 10 Step 5.0 verifies envelope is delivered as a single end-of-stream message (current pipeline). If streaming is incremental, suppression moves to system prompt: when not eligible, the offer prompt block is NOT injected, so the LLM cannot emit the signal in the first place. |
| Chip not filtered during round (HIGH-4): `getContextualQuickChips` ignores `sessionMetadata.challengeRound.state` | "Too easy" chip stays visible during an active round | Tap during round causes confused behavior | Task 10 Step 8.5 wires `challengeRound.state` into the chip filter; unit test asserts `too_easy` is filtered when state ∈ `{offered, active, drafting}`. |
| Drafted-note hallucination via value substitution (HIGH-1) | LLM swaps a correct word for an incorrect one within the learner's vocabulary (e.g. "mitochondria" instead of "chloroplast") | Misleading note saved | Primary defense: drafting prompt is fed ONLY the `solid` evaluations from `decideMasteryAndReview` — misconception text never reaches the drafter. Secondary lexical guard catches topic drift only, not substitution; this is documented in `note-draft.ts` jsdoc, not asserted as the substitution guard. |
| XP migration race: in-flight `'pending'` XP from old serious-mode session at deploy time | Existing pending XP records | n/a — pre-launch | Phase 0 migration step 4 promotes any `xp.status='pending'` rows to `'verified'` once and clears the column option. |
| LearningModeControl import remains in session/index.tsx after component delete | TypeScript compile error | n/a — pre-deploy | Caught by `pnpm exec nx run mobile:typecheck` in Task 0.4. |
| i18n key `more.learningMode.*` referenced elsewhere | Translation lookup misses | Missing string at runtime | Task 0.5 greps all `t('more.learningMode')` references and removes; CI lints would also catch via `i18next` linter if configured. |

### Recommended scope (v1)
- **Sunset Phase 0 is destructive but safe pre-launch.** Migration drops two columns + an enum. No backcompat shims. (`feedback_pre_launch_no_users.md`.)
- **Default tone is today's `casual`.** Warm + concrete examples. The "rigor + delayed XP + mandatory summaries" experience is NOT preserved as a setting; rigor is now expressed *through Challenge Rounds* per-topic per-moment, not as a global vibe.
- **Header button slot freed.** No replacement in this PR (decision: keep header lean; if we add a future button it gets its own design pass). The trophy/compass icons retire.
- **"Too easy" chip becomes the learner-initiated Challenge Round entry.** When server-side gates allow, tapping it triggers an offer card. When they don't, falls back to today's behavior. No new chip; no new icon.
- **Learning + interleaved sessions only.** Homework explicitly excluded. Freeform/ask-anything deferred.
- **3 challenge questions max per round, 1 round per session, 1 challenge offer per topic per 24h.**
- **Note save = explicit user action.** Never auto-save. Edit always available. Skip is non-destructive.
- **Mastery-verified is a NEW boolean axis** (`masteryChallengeVerifiedAt`), not a re-purposing of `masteryScore`. Keeps current consumers untouched.

---

## File Structure

### Phase 0 — Sunset Files

**Deleted:**
- `apps/mobile/src/app/(app)/session/_components/LearningModeControl.tsx`
- `apps/mobile/src/app/(app)/session/_components/LearningModeControl.test.tsx` (if present)
- All consumers of `useLearningMode` / `useUpdateLearningMode` — confirm via grep before delete.

**Modified:**
- `packages/database/src/schema/progress.ts` — drop `mode`, `consecutiveSummarySkips`, `learningModeEnum`.
- `packages/database/src/migrations/####_drop_learning_mode.sql` — generated.
- `packages/schemas/src/progress.ts` — remove `learningModeSchema`, `learningModeUpdateSchema`, `getLearningModeResponseSchema`.
- `apps/api/src/services/settings.ts` — remove `getLearningModeRules`, summary-skip warn logic; keep `celebrationLevel`, `medianResponseSeconds` accessors.
- `apps/api/src/services/settings.test.ts` — delete mode-rule tests.
- `apps/api/src/services/xp.ts` — collapse XP path (single `verified`); delete `'pending'` branch.
- `apps/api/src/services/xp.test.ts` — delete `serious` mode test cases; update snapshots.
- `apps/api/src/services/exchange-prompts.ts` — delete `getLearningModeGuidance()`; replace its call site with a single inline tone block (today's `casual` text, lifted verbatim).
- `apps/api/src/services/exchange-prompts.test.ts` — update snapshots.
- `apps/api/src/routes/settings.ts` (or wherever) — delete GET/PUT learning-mode endpoints.
- `apps/api/src/routes/settings.test.ts` — delete endpoint tests.
- `apps/mobile/src/hooks/use-settings.ts` — delete `useLearningMode`, `useUpdateLearningMode` (keep neighbors).
- `apps/mobile/src/hooks/use-settings.test.ts` — delete tests for removed hooks.
- `apps/mobile/src/app/(app)/session/index.tsx` — remove `useLearningModeControl()` import + button/sheet render.
- `apps/mobile/src/app/(app)/session/index.test.tsx` — delete mode-toggle test cases.
- `apps/mobile/src/app/(app)/more/` (find the file rendering `more.learningMode.*`) — delete the section + tests.
- `apps/mobile/src/i18n/locales/en.json` — delete `more.learningMode.*` keys.
- `apps/mobile/src/i18n/locales/{de,es,ja,nb,pl,pt}.json` — delete the same keys.
- `apps/api/eval-llm/flows/exchanges.ts:292, 538` — remove `learningMode` from defaults / overrides.
- `apps/api/eval-llm/flows/probes.ts:30, 182` — remove conditionals.
- `apps/api/eval-llm/flows/topic-probe-signals.ts:155-182` — remove `profile.learningMode` plumbing.
- `apps/api/src/services/session/session-cache.test.ts` — remove `learningMode` from test contexts.

### Phase 1 — New Feature Files

**Created (API):**
- `apps/api/src/services/challenge-round/index.ts` — barrel.
- `apps/api/src/services/challenge-round/trigger.ts` + `.test.ts` — `evaluateChallengeReadiness`.
- `apps/api/src/services/challenge-round/prompts.ts` + `.test.ts` — system-prompt fragments.
- `apps/api/src/services/challenge-round/evaluation.ts` + `.test.ts` — `decideMasteryAndReview`.
- `apps/api/src/services/challenge-round/note-draft.ts` + `.test.ts` — hallucination guard.
- `apps/api/src/services/challenge-round/state.ts` + `.test.ts` — state machine.
- `apps/api/src/services/challenge-round/caps.ts` + `.test.ts` — `MAX_CHALLENGE_QUESTIONS = 3`, cooldown const, overlap threshold.
- `apps/api/src/routes/challenge-round.ts` + `.test.ts` — accept/decline/abort/maybe-offer endpoints.
- `apps/api/src/inngest/functions/challenge-round-completed.ts` + `.test.ts` + `.integration.test.ts` — fan-out for metrics + review-target writes.
- `apps/api/eval-llm/scenarios/challenge-round.ts` — 6-scenario matrix.
- `packages/database/src/schema/challenge-round-cooldowns.ts` — per-profile/per-topic cooldown rows.
- `packages/database/src/migrations/####_challenge_round_cooldowns.sql` — generated.
- `packages/database/src/migrations/####_notes_source.sql` — generated.
- `packages/database/src/migrations/####_topic_progress_challenge_verified.sql` — generated.
- `packages/database/src/migrations/####_review_targets_source.sql` — generated.

**Created (Mobile):**
- `apps/mobile/src/hooks/use-challenge-round.ts` + `.test.tsx`.
- `apps/mobile/src/components/session/ChallengeOfferCard.tsx` + `.test.tsx`.
- `apps/mobile/src/components/session/ChallengeRoundBanner.tsx` + `.test.tsx`.
- `apps/mobile/src/components/session/DraftedNoteReview.tsx` + `.test.tsx`.

**Created (Integration):**
- `tests/integration/challenge-round.integration.test.ts` — end-to-end: offer → accept → 3 answers → drafted note → POST notes → mastery flag.

**Modified (Phase 1):**
- `packages/schemas/src/llm-envelope.ts` — add `challenge_round_offer`, `challenge_round_evaluation` signals; add `challenge_round`, `note_draft` ui_hints.
- `packages/schemas/src/llm-envelope.test.ts` — round-trip tests for new fields.
- `packages/schemas/src/sessions.ts` — extend `sessionMetadataSchema` with `challengeRound`.
- `packages/schemas/src/progress.ts` — add `masteryChallengeVerifiedAt` to `topicProgressSchema`.
- `packages/schemas/src/notes.ts` — add `source: 'user' | 'challenge_round'` discriminator on `createNoteInputSchema`.
- `packages/database/src/schema/notes.ts` — add `source` column (default `'user'`).
- `packages/database/src/schema/topic-progress.ts` (or equivalent) — add `masteryChallengeVerifiedAt`.
- `packages/database/src/schema/review-targets.ts` (or equivalent) — add `source` column.
- `apps/api/src/services/notes.ts` + `.test.ts` — accept and persist `source`.
- `apps/api/src/services/exchanges.ts` + integration test — wire challenge-round dispatch into `processExchange`.
- `apps/api/src/services/exchange-prompts.ts` — inject challenge-round prompt block when `sessionMetadata.challengeRound.state ∈ {offered, active, drafting}`.
- `apps/api/src/services/topic-completion.ts` + `.test.ts` — read `masteryChallengeVerifiedAt`.
- `apps/api/src/services/snapshot-aggregation.ts` + `.test.ts` — filter in-flight challenge-round rows.
- `apps/api/src/services/retention-data.ts` + `.test.ts` — accept `source` on review-target writes.
- `apps/mobile/src/components/session/use-session-streaming.ts` + `.test.tsx` — detect `ui_hints.challenge_round` + `ui_hints.note_draft` + `signals.challenge_round_offer`.
- `apps/mobile/src/app/(app)/session/index.tsx` — render new components based on streaming hook output.
- `apps/mobile/src/lib/strip-envelope.ts` + `.test.ts` — strip new ui_hint keys.
- `apps/mobile/src/components/session/SessionAccessories.tsx` (the chip strip) + `.test.tsx` — wire `too_easy` tap through `useChallengeRound.maybeOffer()` first; fall through to existing `too_easy` system-prompt dispatch on `{offered: false}`.
- `apps/mobile/src/i18n/locales/en.json` — add `session.challenge.*` keys (full list in Phase 1 tasks).
- `apps/mobile/src/i18n/locales/{de,es,ja,nb,pl,pt}.json` — add the same keys with English fallback (translations follow in a separate localization pass).
- `CLAUDE.md` — append one bullet under engineering rules about challenge-round mastery decisions being server-owned and conservative.

---

## Tasks

> **Convention:** Each task is one logical commit. TDD: write the failing test, run it red, implement, run it green, commit via `/commit` (the only authorized commit path — CLAUDE.md → Git Commits).

> **Phase boundary:** Tasks 0.1–0.6 are the sunset. Tasks 1–12 are the feature. Phase 1 depends on Phase 0 being green (the prompt-builder changes in 0.3 are the seam Phase 1 plugs into).

---

### Task 0.0 — Codebase-existence spike (gates CRIT-1, CRIT-2, CRIT-3, CRIT-4)

This task produces NO code. It produces a `docs/plans/2026-05-18-challenge-round-targets.md` decision doc that downstream tasks cite. Phase 1 (Tasks 8, 9, 11) cannot start until this is signed off, because the original plan references tables, modules, and exports that don't exist.

**Output:** a short decision doc with four sections — one per finding.

- [ ] **Step 1: Mastery-verified persistence target (CRIT-1)**

The plan needs to persist `masteryChallengeVerifiedAt`. The original plan said `topic-progress.ts` — that file does not exist. Decide between:
- (a) Add a column to `retentionCards` (already per-profile-per-topic, scoped). Lowest blast radius. Trade-off: conflates retention spaced-repetition state with challenge-mastery state.
- (b) Add a new `topic_mastery_state` table (profile_id, topic_id, mastery_challenge_verified_at, …). Clean separation, one more table.
- (c) Add a JSON column to `learningSessions.metadata` keyed by topicId. No migration of structured columns. Trade-off: can't index.

```
Grep "retentionCards|retention_cards" packages/database/src/schema
Read the matching file. Confirm scoping pattern.
Pick (a), (b), or (c) and document the rationale.
```

The chosen target is the canonical reference for Task 9 Step 1. Update Task 9 Step 1 to name the actual file + column placement before starting.

- [ ] **Step 2: Review-targets persistence target (CRIT-2)**

The plan needs to persist `partial`/`misconception` concepts for later surfacing. There is no `review_targets` table. Decide between:
- (a) Reuse `retentionCards` with a `source` discriminator. Already wired into `retention-data.ts` reads.
- (b) Net-new `review_targets` table (profile_id, topic_id, concept, misconception, correction, source, created_at). Clean, but new read surface.
- (c) Inject into the existing `learningSessions.metadata.gaps` array (already exists at `packages/schemas/src/sessions.ts:169`).

Document the chosen path. If (b), add a Task 9.0 with its own migration + `## Rollback` block + integration test. If (a) or (c), update Task 9 Step 1 and the Inngest function (Task 9 Step 4) accordingly.

**CRIT-8 — no Sentry-only fallback:** v1 must persist weak spots durably. A Challenge Round that saves the correct parts but forgets the partial/misconception concepts is not shippable, because it forces the learner to repeat good work later and can falsely imply mastery. If none of (a), (b), or (c) is chosen, stop the implementation before Task 8 and write a new plan revision. Do not ship Challenge Rounds with only telemetry for weak spots.

- [ ] **Step 3: Session CRUD helper names (CRIT-3)**

```
Read apps/api/src/services/session/session-crud.ts
List every exported function.
Find the closest equivalents to `getSessionById` and `persistSessionMetadata`.
```

Document the actual names. Update every plan reference (Tasks 8, 9, 11 — search for `getSessionById|persistSessionMetadata`) to use the real names. If the real helpers don't enforce `profileId` scoping the way the plan assumes (CLAUDE.md non-negotiable rule), add a Task 9.0 to either (i) extract `getSessionByIdScoped(sessionId, profileId)` with a break test that proves cross-profile access returns null, or (ii) inline the scoping check at every route handler. Decide which.

- [ ] **Step 4: Schema export of `struggleStatusSchema` (CRIT-4)**

```
Grep "struggleStatus" packages/schemas/src
```

Today the enum is inline in `progress.ts:258`. Either:
- (a) Extract to `packages/schemas/src/struggle-status.ts` mirroring `retention-status.ts`, export, re-import in `progress.ts`.
- (b) Inline the literal `z.enum(['normal', 'needs_deepening', 'blocked'])` at the trigger evaluator's import site instead of importing from schemas.

Pick (a) — consistency with `retentionStatusSchema`. Add the extraction as Task 3 Step 0 (before Step 1).

- [ ] **Step 5: Commit the decision doc**

```bash
/commit
```

> **Gate:** Tasks 8, 9, 11 do not begin until the decision doc is committed and the relevant inline task references are updated to match the chosen targets.

---

### Task 0.1 — Drop `learningMode` columns and enum (DB + migration)

**Files:**
- Modify: `packages/database/src/schema/progress.ts`
- Create: `packages/database/src/migrations/####_drop_learning_mode.sql` (generated)

**## Rollback (CRIT-7, LOW-1 — per CLAUDE.md schema rule, prescribed 3-line format):**
- **(a) Rollback possible?** Yes, technically. Revert the migration commit and re-apply schema from `git show HEAD~1:packages/database/src/schema/progress.ts`.
- **(b) Data lost?** Zero rows of consequence — pre-launch, no real user data exists in `learning_modes.mode` or `learning_modes.consecutive_summary_skips`. Any seeded dev rows are disposable.
- **(c) Recovery procedure?** Re-fixture the dev DB (`pnpm run db:push:dev` after revert) or re-run `drizzle-kit migrate` against staging once the revert lands. No backup restoration required.

- [ ] **Step 1: Capture current schema for reference**

```bash
git show HEAD:packages/database/src/schema/progress.ts > /tmp/progress-before.ts
```

- [ ] **Step 2: Remove enum + columns from schema**

In `packages/database/src/schema/progress.ts`, remove these definitions:
- `learningModeEnum`
- `learningModes.mode`
- `learningModes.consecutiveSummarySkips`

Keep the `learningModes` table itself (still hosts `medianResponseSeconds`, `celebrationLevel`). The table name is now slightly misleading; renaming is a follow-up.

- [ ] **Step 3: Generate migration**

```bash
pnpm run db:generate:dev
```

Expected: new SQL file. **Inspect it.** It should:
1. `UPDATE learning_modes SET mode = 'casual' WHERE mode = 'serious';` (defensive, even pre-launch)
2. `ALTER TABLE learning_modes DROP COLUMN mode;`
3. `ALTER TABLE learning_modes DROP COLUMN consecutive_summary_skips;`
4. `DROP TYPE IF EXISTS learning_mode_enum;`

If drizzle-kit doesn't emit the `UPDATE` step (it usually doesn't for column drops), prepend it manually.

- [ ] **Step 4: Apply locally**

```bash
pnpm run db:push:dev
```

- [ ] **Step 5: Verify with db studio**

```bash
pnpm run db:studio:dev
```

Visually confirm the columns are gone and the enum type is dropped.

- [ ] **Step 6: Commit**

```bash
/commit
```

---

### Task 0.2 — Remove schema types + service-layer rules

**Files (CRIT-6 — `consecutiveSummarySkips` sweep is 8 files, not 2):**
- Modify: `packages/schemas/src/progress.ts`
- Modify: `apps/api/src/services/settings.ts`
- Modify: `apps/api/src/services/settings.test.ts`
- Modify: `apps/api/src/services/xp.ts`
- Modify: `apps/api/src/services/xp.test.ts`
- Modify: `apps/api/src/services/session/session-crud.ts` — remove `consecutiveSummarySkips` reads/writes
- Modify: `apps/api/src/services/session/session-summary.ts` — remove `consecutiveSummarySkips` logic
- Modify: `apps/api/src/services/session-summary.integration.test.ts` — drop related cases
- Modify: `apps/api/src/inngest/functions/session-completed.ts` — remove `consecutiveSummarySkips` writes
- Modify: `apps/api/src/inngest/functions/session-completed.test.ts` — drop related cases
- Modify: `apps/api/src/routes/sessions.test.ts` — drop related cases

- [ ] **Step 0: Enumerate caller sites before deletion (CRIT-6)**

```
Grep "consecutiveSummarySkips|incrementSummarySkip|resetSummarySkip" apps/api/src
```

Cross-check the result against the file list above. If extra files turn up, add them. If the worker proceeds without this enumeration, mid-task cascading typecheck errors are guaranteed.

- [ ] **Step 1: Delete from schemas**

In `packages/schemas/src/progress.ts`, remove:
- `learningModeSchema` (line ~15)
- `learningModeUpdateSchema` (line ~107)
- `getLearningModeResponseSchema` (line ~159)
- All exports referencing these.

- [ ] **Step 2: Delete `getLearningModeRules` + summary-skip logic from settings service**

In `apps/api/src/services/settings.ts`:
- Delete `getLearningModeRules()` (lines ~459-472).
- Delete the summary-skip-warn block (lines ~476-486).
- Delete any helper `incrementSummarySkip()` / `resetSummarySkip()`.
- Keep `getCelebrationLevel`, `getMedianResponseSeconds` accessors and their tests.

- [ ] **Step 3: Update settings tests**

In `apps/api/src/services/settings.test.ts`:
- Delete the `getLearningModeRules` describe block (lines ~312-324).
- Run `cd apps/api && pnpm exec jest src/services/settings.test.ts` — green.

- [ ] **Step 4: Collapse XP path**

In `apps/api/src/services/xp.ts` lines ~108-113, the current code branches on mode:

```typescript
// BEFORE
const status = learningMode === 'serious' ? 'pending' : 'verified';
```

Replace with the single path:

```typescript
// AFTER
const status = 'verified';
```

Then sweep the file for any remaining `learningMode` references and remove them.

**CRIT-5 — DO NOT remove the `status` field, even as a follow-up.** `xpStatus` has three values: `pending | verified | decayed`. Decay is independent of the casual/serious split (see `xp.ts:68 decayXp`, plus `progress.ts:346, 772`, `retention-data.ts:91, 107`, `retention.ts:15`, `dashboard.integration.test.ts:298, 362`, `coaching-cards.test.ts:349`, `test-seed.ts:551`). We are collapsing the WRITER only; READS of `pending` and `decayed` must continue to function. Add a grep verification step (Step 6.5 below) confirming no read sites were broken.

**MED-7 — Fate of `verifyXp` and pending-verification flow.** `xp.ts:56 verifyXp` and the verification call sites in `inngest/functions/subject-prewarm-curriculum.ts` etc. become unreachable for *new* topics under single-path writes. They remain in place to handle two real cases: (i) any prod records that get retro-imported, (ii) the decayed-XP re-verification flow. Annotate `verifyXp` with `// Preserved for decayed-XP re-verification; new topics ship as 'verified' directly post-sunset.`

- [ ] **Step 5: Update XP tests**

In `apps/api/src/services/xp.test.ts`:
- Delete the `serious` mode test cases (~lines 15-17, 282-284).
- Snapshot updates: `cd apps/api && pnpm exec jest src/services/xp.test.ts -u`.
- Verify snapshots are sane (one path, no `'pending'`).

- [ ] **Step 6: Run API tests**

```bash
pnpm exec nx run api:test
```

Expected: green. Track and fix any other test that referenced the removed schemas.

- [ ] **Step 6.5: Verify pending/decayed read sites still compile and behave (CRIT-5)**

```
Grep "xpStatus.*pending|status.*pending|status.*decayed|xpStatus.*decayed" apps/api/src apps/mobile/src
```

Each match must be a READ (display, branching), not a WRITE. If any new code writes `pending`, it's a regression. Cross-check that dashboard pending/verified visualisations still render against seed data (`test-seed.ts:551` seeds both statuses).

- [ ] **Step 7: Commit**

```bash
/commit
```

---

### Task 0.3 — Collapse prompt builder to single tone + delete eval-harness mode plumbing

**Files:**
- Modify: `apps/api/src/services/exchange-prompts.ts`
- Modify: `apps/api/src/services/exchange-prompts.test.ts`
- Modify: `apps/api/eval-llm/flows/exchanges.ts`
- Modify: `apps/api/eval-llm/flows/probes.ts`
- Modify: `apps/api/eval-llm/flows/topic-probe-signals.ts`

- [ ] **Step 1: Capture today's casual tone string verbatim**

In `apps/api/src/services/exchange-prompts.ts:175-192`, `getLearningModeGuidance()` returns one of two strings based on mode. Lift the `casual` string out of the function as a `const DEFAULT_TONE_GUIDANCE = "...";` at module scope.

- [ ] **Step 2: Delete the function**

Delete `getLearningModeGuidance()` entirely. Replace every call site in `buildSystemPrompt()` with `DEFAULT_TONE_GUIDANCE`.

- [ ] **Step 3: Update tests + snapshots**

```bash
cd apps/api && pnpm exec jest src/services/exchange-prompts.test.ts -u
```

Manually review the snapshot diff: the `serious` snapshots should be gone, the `casual` snapshots should remain as the single tone.

- [ ] **Step 4: Strip `learningMode` from eval-harness flows (HIGH-5 — grep, not line numbers)**

Line numbers drift; grep first, then decide each site. Run:

```
Grep "learningMode" apps/api/eval-llm
```

For each match, decide its fate (delete the field, collapse the conditional, delete the parameter, etc.). Expected files: `flows/exchanges.ts`, `flows/probes.ts`, `flows/topic-probe-signals.ts` — plus any fixture composition or scenario types that pass `learningMode` through. The original cited line numbers (`~292, ~538, ~30, ~182, ~155-182`) are advisory only — do not trust them; the grep is authoritative.

Also grep parameter/return types for the field name:

```
Grep "learningMode\??:" apps/api/eval-llm
```

Each typed reference must be removed too, or downstream `noUnusedParameters` / `noImplicitAny` rules will surface.

- [ ] **Step 5: Run Tier 1 eval harness**

```bash
pnpm eval:llm
```

Expected: snapshots regenerate cleanly. If anything mode-related lingers in a fixture, the snapshot diff will surface it.

- [ ] **Step 6: Commit**

```bash
/commit
```

---

### Task 0.4 — Delete API routes + mobile hooks

**Files:**
- Modify: `apps/api/src/routes/settings.ts` (or wherever learning-mode routes live; locate via grep `learning.*mode` in routes)
- Modify: `apps/api/src/routes/settings.test.ts`
- Modify: `apps/mobile/src/hooks/use-settings.ts`
- Modify: `apps/mobile/src/hooks/use-settings.test.ts`

- [ ] **Step 1: Locate routes**

```bash
```

Use Grep tool: search `learningMode|learning-mode|getLearningMode` in `apps/api/src/routes`. Identify the file with the GET and PUT/PATCH endpoints.

- [ ] **Step 2: Delete the route handlers**

Remove `GET /settings/learning-mode` (or equivalent) and `PUT /settings/learning-mode`. Remove the schema imports.

- [ ] **Step 3: Delete route tests**

Remove the matching `describe` block in `routes/settings.test.ts`. Run the remaining tests green:

```bash
cd apps/api && pnpm exec jest src/routes/settings.test.ts
```

- [ ] **Step 4: Delete mobile hooks**

In `apps/mobile/src/hooks/use-settings.ts`:
- Delete `useLearningMode`.
- Delete `useUpdateLearningMode`.
- Keep neighbors untouched.

In `apps/mobile/src/hooks/use-settings.test.ts`:
- Delete the corresponding describe blocks.

- [ ] **Step 5: Commit**

```bash
/commit
```

---

### Task 0.5 — Delete `LearningModeControl` component + remove from session header + remove More tab section

**Files:**
- Delete: `apps/mobile/src/app/(app)/session/_components/LearningModeControl.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.test.tsx`
- Modify: the More-tab file rendering `more.learningMode.*` (locate via grep — likely `apps/mobile/src/app/(app)/more/index.tsx` or `apps/mobile/src/app/(app)/more/preferences.tsx`)
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,ja,nb,pl,pt}.json`

- [ ] **Step 1: Locate consumers of LearningModeControl**

Grep `useLearningModeControl|LearningModeControl` across `apps/mobile/src` — should be exactly the session screen.

- [ ] **Step 2: Remove from session/index.tsx**

In `apps/mobile/src/app/(app)/session/index.tsx`:
- Delete the import line: `import { useLearningModeControl } from './_components/LearningModeControl';`.
- Delete the hook call: `const { button, sheet } = useLearningModeControl();`.
- Delete the rendering of `{button}` from the header and `{sheet}` from the root.

- [ ] **Step 3: Delete the component file**

```bash
rm apps/mobile/src/app/(app)/session/_components/LearningModeControl.tsx
rm apps/mobile/src/app/(app)/session/_components/LearningModeControl.test.tsx 2>/dev/null || true
```

- [ ] **Step 4: Update session/index.test.tsx**

Delete any test cases that exercise the mode toggle: `learning-mode-header-button`, `learning-mode-modal`, `learning-mode-sheet`, `session-learning-mode-*`, `learning-mode-next-message-copy`. Run green:

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx --no-coverage
```

- [ ] **Step 5: Locate and remove the More tab learning-mode section**

Grep `more.learningMode|learningMode.casual|learningMode.serious` in `apps/mobile/src/app/(app)/more` to find the file. Remove the section (likely a `<Pressable>` or section block referencing the keys). Run that screen's test green.

- [ ] **Step 6: Strip i18n keys (HIGH-5)**

For each locale file (`en.json`, `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json`):

```
Grep "learningMode" apps/mobile/src/i18n/locales/<file>
```

Delete every match. The original "lines around 278-295" is advisory only — line numbers will have drifted by the time the worker reaches this step.

Then verify no consumer references the deleted keys:

```
Grep "t\\(['\"]more\\.learningMode|t\\(['\"]learningMode|i18nKey.*learningMode" apps/mobile/src
```

Expected: zero matches. If any turn up, they were missed in earlier steps; chase them down.

- [ ] **Step 7: Run mobile typecheck + lint + test**

```bash
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --no-coverage
```

Expected: green. Any dangling import or `t('more.learningMode.*')` reference surfaces here.

- [ ] **Step 8: Commit**

```bash
/commit
```

---

### Task 0.6 — Final sunset sweep + integration validation

- [ ] **Step 1: Whole-repo grep**

Use the Grep tool with pattern `learningMode|learning_mode|LearningMode|learning-mode|getLearningMode|useLearningMode` across the whole repo. Expected results: zero. If anything turns up, remove it and re-grep.

- [ ] **Step 2: Run integration tests**

```bash
pnpm exec nx run-many -t test
```

Expected: green. Pay attention to any DB-related integration test that previously inserted a `learning_modes.mode` value — should now error or be obsolete.

- [ ] **Step 3: Manual smoke on emulator**

Launch the app, start a session, confirm:
- No "Explorer / Challenge mode" button in the header.
- No "Learning Mode" section in More tab.
- Session behavior is consistent (warm tone, immediate XP, no mastery gates blocking progress).

- [ ] **Step 4: Commit (if any micro-fixes)**

```bash
/commit
```

> **Phase 0 complete.** Header is lean. XP is single-path. Tone is single-string. Phase 1 begins below.

---

### Task 1 — Extend envelope schema with challenge-round signals + ui_hints

**Files:**
- Modify: `packages/schemas/src/llm-envelope.ts`
- Test: `packages/schemas/src/llm-envelope.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/schemas/src/llm-envelope.test.ts (append)
import { llmResponseEnvelopeSchema } from './llm-envelope';

describe('challenge round envelope fields', () => {
  it('accepts challenge_round_offer signal', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: "You've got the basics — want a challenge round?",
      signals: { challenge_round_offer: true },
      confidence: 'medium',
    });
    expect(parsed.signals?.challenge_round_offer).toBe(true);
  });

  it('accepts challenge_round_evaluation per-concept results', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Strong work.',
      signals: {
        challenge_round_evaluation: [
          { concept: 'photosynthesis vs respiration', result: 'solid', evidence: 'learner described both directions of energy flow' },
          { concept: 'role of ATP', result: 'partial', evidence: 'mentioned energy currency, missed structure' },
          { concept: 'where it happens', result: 'misconception', evidence: 'said nucleus instead of chloroplast', correction: 'occurs in chloroplasts' },
        ],
      },
      confidence: 'high',
    });
    expect(parsed.signals?.challenge_round_evaluation).toHaveLength(3);
    expect(parsed.signals?.challenge_round_evaluation?.[2].correction).toBe('occurs in chloroplasts');
  });

  it('accepts challenge_round ui_hint', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: 'Question 2 of 3.',
      ui_hints: { challenge_round: { active: true, question_index: 1, total_questions: 3 } },
      confidence: 'high',
    });
    expect(parsed.ui_hints?.challenge_round?.active).toBe(true);
  });

  it('accepts note_draft ui_hint with content', () => {
    const parsed = llmResponseEnvelopeSchema.parse({
      reply: "Here's what you know now.",
      ui_hints: {
        note_draft: {
          content: 'Photosynthesis uses light to convert CO2 and water into glucose...',
          source_concepts: ['photosynthesis vs respiration', 'role of ATP'],
        },
      },
      confidence: 'high',
    });
    expect(parsed.ui_hints?.note_draft?.content).toMatch(/photosynthesis/i);
  });
});
```

- [ ] **Step 2: Run test red**

```bash
pnpm exec nx test schemas --testPathPattern='llm-envelope.test'
```

- [ ] **Step 3: Extend schema**

```typescript
// packages/schemas/src/llm-envelope.ts — append/extend

export const challengeRoundEvaluationItemSchema = z.object({
  concept: z.string().min(1).max(200),
  result: z.enum(['solid', 'partial', 'missing', 'misconception']),
  evidence: z.string().min(1).max(500),
  correction: z.string().min(1).max(500).optional(),
});

// In the existing signals object, add:
challenge_round_offer: z.boolean().optional(),
challenge_round_evaluation: z.array(challengeRoundEvaluationItemSchema).max(10).optional(),

// In the existing ui_hints object, add:
challenge_round: z
  .object({
    active: z.boolean(),
    question_index: z.number().int().min(0).max(9),
    total_questions: z.number().int().min(1).max(10),
  })
  .optional(),
note_draft: z
  .object({
    content: z.string().min(1).max(2000),
    source_concepts: z.array(z.string()).min(1).max(10),
  })
  .optional(),
```

- [ ] **Step 4: Run test green**

```bash
pnpm exec nx test schemas
```

- [ ] **Step 5: Commit**

```bash
/commit
```

---

### Task 2 — Add `sessionMetadata.challengeRound` state + cooldown DB table

**Files:**
- Modify: `packages/schemas/src/sessions.ts` + `.test.ts`
- Create: `packages/database/src/schema/challenge-round-cooldowns.ts`
- Create: `packages/database/src/migrations/####_challenge_round_cooldowns.sql` (generated)

- [ ] **Step 1: Write failing test for schema**

```typescript
// packages/schemas/src/sessions.test.ts (append)
import { sessionMetadataSchema } from './sessions';

describe('sessionMetadata.challengeRound', () => {
  it('defaults to undefined', () => {
    const m = sessionMetadataSchema.parse({});
    expect(m.challengeRound).toBeUndefined();
  });

  it('accepts state transitions', () => {
    const m = sessionMetadataSchema.parse({
      challengeRound: {
        state: 'active',
        startedAt: new Date().toISOString(),
        questionIndex: 1,
        totalQuestions: 3,
        offerCount: 1,
      },
    });
    expect(m.challengeRound?.state).toBe('active');
  });

  it('rejects invalid state', () => {
    expect(() =>
      sessionMetadataSchema.parse({ challengeRound: { state: 'frobnicated' } }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Extend sessionMetadataSchema**

```typescript
// packages/schemas/src/sessions.ts (additions)

export const challengeRoundStateEnum = z.enum([
  'offered',
  'accepted',
  'declined',
  'active',
  'drafting',
  'complete',
  'aborted',
]);

export const challengeRoundSessionStateSchema = z.object({
  state: challengeRoundStateEnum,
  startedAt: z.string().datetime().optional(),
  questionIndex: z.number().int().min(0).max(9).optional(),
  totalQuestions: z.number().int().min(1).max(10).optional(),
  offerCount: z.number().int().min(0).default(0),
  topicId: z.string().uuid().optional(),
  declinedDontAskAgain: z.boolean().default(false),
});

// extend existing sessionMetadataSchema:
export const sessionMetadataSchema = z.object({
  // ...existing fields...
  challengeRound: challengeRoundSessionStateSchema.optional(),
});
```

**## Rollback for the cooldown migration (CRIT-7):**
- **(a) Rollback possible?** Yes — pure additive table; reversible via `DROP TABLE challenge_round_cooldowns;`.
- **(b) Data lost?** Cooldown rows accumulated since deploy. Loss = re-offer of recently-declined challenge rounds. User-visible but non-destructive (no learning state lost).
- **(c) Recovery procedure?** Drop the table; old code path simply re-creates it on next migration cycle.

**MED-2 — Cascade semantics:** Both FKs (`profile_id`, `topic_id`) use `onDelete: 'cascade'`. Expected behaviour:
- Profile delete (GDPR export-delete) wipes their cooldown rows. Correct.
- Topic regeneration (curriculum rebuild generates a NEW topic UUID) effectively *resets* cooldown for the rebuilt topic — that's a desired behavior (regenerated topic = fresh start), but verify with the curriculum-rebuild flow owner. If unwanted, switch to `onDelete: 'set null'` on `topic_id` and treat null as "cooldown applies to historical topic, ignore on new topics."

- [ ] **Step 3: Add DB table for cooldown**

```typescript
// packages/database/src/schema/challenge-round-cooldowns.ts
import { pgTable, uuid, timestamp, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';
import { curriculumTopics } from './curriculum-topics';

export const challengeRoundCooldowns = pgTable(
  'challenge_round_cooldowns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').notNull().references(() => curriculumTopics.id, { onDelete: 'cascade' }),
    lastOfferedAt: timestamp('last_offered_at', { withTimezone: true }).notNull().defaultNow(),
    lastOutcome: integer('last_outcome'), // 0=declined, 1=accepted_partial, 2=verified, 3=reteach
  },
  (t) => ({
    profileTopicUniq: uniqueIndex('challenge_round_cooldowns_profile_topic_uniq').on(t.profileId, t.topicId),
  }),
);
```

- [ ] **Step 4: Generate + apply migration**

```bash
pnpm run db:generate:dev
pnpm run db:push:dev
```

- [ ] **Step 5: Run schemas tests green**

```bash
pnpm exec nx test schemas
```

- [ ] **Step 6: Commit**

```bash
/commit
```

---

### Task 3 — Trigger evaluator (`evaluateChallengeReadiness`)

**Files:**
- Create: `packages/schemas/src/struggle-status.ts` (CRIT-4)
- Modify: `packages/schemas/src/progress.ts` — import from new file
- Modify: `packages/schemas/src/index.ts` — export
- Create: `apps/api/src/services/challenge-round/trigger.ts`
- Create: `apps/api/src/services/challenge-round/trigger.test.ts`

- [ ] **Step 0: Extract `struggleStatusSchema` to its own module (CRIT-4)**

Today the enum is inline at `packages/schemas/src/progress.ts:258` (`z.enum(['normal', 'needs_deepening', 'blocked'])`) and not exported. Mirror the `retention-status.ts:3` pattern:

```typescript
// packages/schemas/src/struggle-status.ts
import { z } from 'zod';

export const struggleStatusSchema = z.enum(['normal', 'needs_deepening', 'blocked']);
export type StruggleStatus = z.infer<typeof struggleStatusSchema>;
```

Re-import inside `progress.ts` and replace the inline enum at line 258 (verify line first; HIGH-5). Add to the schemas barrel export. Without this, the `trigger.ts` import at Step 3 below fails typecheck.

- [ ] **Step 1: Write failing test** *(11 cases — full table of hard gates)*

```typescript
// apps/api/src/services/challenge-round/trigger.test.ts
import { evaluateChallengeReadiness } from './trigger';

const baseInput = {
  sessionType: 'learning' as const,
  exchangeCount: 6,
  retentionStatus: 'strong' as const,
  struggleStatus: 'normal' as const,
  recentCorrectStreak: 2,
  quotaFractionRemaining: 0.5,
  challengeRoundState: undefined,
  cooldownLastOfferedAt: null,
  cooldownLastOutcome: null,
  now: new Date('2026-05-18T12:00:00Z'),
};

describe('evaluateChallengeReadiness', () => {
  it('eligible when learning + strong + ≥5 exchanges + streak ≥2 + no cooldown', () => {
    expect(evaluateChallengeReadiness(baseInput).eligible).toBe(true);
  });

  it('hard-gates homework sessions', () => {
    expect(evaluateChallengeReadiness({ ...baseInput, sessionType: 'homework' }).eligible).toBe(false);
  });

  it('eligible for interleaved sessions', () => {
    expect(evaluateChallengeReadiness({ ...baseInput, sessionType: 'interleaved' }).eligible).toBe(true);
  });

  it('hard-gates when struggling', () => {
    expect(evaluateChallengeReadiness({ ...baseInput, struggleStatus: 'needs_deepening' }).eligible).toBe(false);
    expect(evaluateChallengeReadiness({ ...baseInput, struggleStatus: 'blocked' }).eligible).toBe(false);
  });

  it('hard-gates under exchange threshold', () => {
    expect(evaluateChallengeReadiness({ ...baseInput, exchangeCount: 4 }).eligible).toBe(false);
  });

  it('hard-gates fading/weak/forgotten retention', () => {
    for (const status of ['fading', 'weak', 'forgotten'] as const) {
      expect(evaluateChallengeReadiness({ ...baseInput, retentionStatus: status }).eligible).toBe(false);
    }
  });

  it('hard-gates when streak below 2', () => {
    expect(evaluateChallengeReadiness({ ...baseInput, recentCorrectStreak: 1 }).eligible).toBe(false);
  });

  it('hard-gates when already in challenge state', () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: { state: 'active', offerCount: 1 },
      }).eligible,
    ).toBe(false);
  });

  it('hard-gates declined within 24h cooldown', () => {
    const oneHourAgo = new Date('2026-05-18T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        cooldownLastOfferedAt: oneHourAgo,
        cooldownLastOutcome: 0,
      }).eligible,
    ).toBe(false);
  });

  it('allows again after 24h cooldown', () => {
    const yesterday = new Date('2026-05-17T11:00:00Z');
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        cooldownLastOfferedAt: yesterday,
        cooldownLastOutcome: 0,
      }).eligible,
    ).toBe(true);
  });

  it('hard-gates when quota fraction below 5%', () => {
    expect(evaluateChallengeReadiness({ ...baseInput, quotaFractionRemaining: 0.03 }).eligible).toBe(false);
  });

  it("hard-gates 'don't ask again' for this session", () => {
    expect(
      evaluateChallengeReadiness({
        ...baseInput,
        challengeRoundState: { state: 'declined', offerCount: 1, declinedDontAskAgain: true },
      }).eligible,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run red**

```bash
cd apps/api && pnpm exec jest src/services/challenge-round/trigger.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/services/challenge-round/trigger.ts
import type { z } from 'zod';
import {
  sessionTypeSchema,
  retentionStatusSchema,
  struggleStatusSchema,
  challengeRoundSessionStateSchema,
} from '@eduagent/schemas';

const CHALLENGE_OFFER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_EXCHANGES = 5;
const MIN_CORRECT_STREAK = 2;
const MIN_QUOTA_FRACTION = 0.05;

export interface ChallengeReadinessInput {
  sessionType: z.infer<typeof sessionTypeSchema>;
  exchangeCount: number;
  retentionStatus: z.infer<typeof retentionStatusSchema>;
  struggleStatus: z.infer<typeof struggleStatusSchema>;
  recentCorrectStreak: number;
  quotaFractionRemaining: number;
  challengeRoundState: z.infer<typeof challengeRoundSessionStateSchema> | undefined;
  cooldownLastOfferedAt: Date | null;
  cooldownLastOutcome: number | null;
  now: Date;
}

export interface ChallengeReadinessResult {
  eligible: boolean;
  reason?: string;
}

export function evaluateChallengeReadiness(input: ChallengeReadinessInput): ChallengeReadinessResult {
  if (input.sessionType !== 'learning' && input.sessionType !== 'interleaved') {
    return { eligible: false, reason: 'session_type' };
  }
  if (input.struggleStatus !== 'normal') return { eligible: false, reason: 'struggle' };
  if (input.exchangeCount < MIN_EXCHANGES) return { eligible: false, reason: 'exchanges_below_min' };
  if (input.retentionStatus !== 'strong') return { eligible: false, reason: 'retention' };
  if (input.recentCorrectStreak < MIN_CORRECT_STREAK) return { eligible: false, reason: 'streak' };
  if (input.quotaFractionRemaining < MIN_QUOTA_FRACTION) return { eligible: false, reason: 'quota' };
  if (input.challengeRoundState && input.challengeRoundState.state !== 'complete' && input.challengeRoundState.state !== 'aborted') {
    if (input.challengeRoundState.declinedDontAskAgain) return { eligible: false, reason: 'session_decline' };
    if (['offered', 'accepted', 'active', 'drafting'].includes(input.challengeRoundState.state)) {
      return { eligible: false, reason: 'already_in_round' };
    }
    if (input.challengeRoundState.state === 'declined') return { eligible: false, reason: 'session_decline' };
  }
  if (input.cooldownLastOfferedAt && input.cooldownLastOutcome === 0) {
    const elapsed = input.now.getTime() - input.cooldownLastOfferedAt.getTime();
    if (elapsed < CHALLENGE_OFFER_COOLDOWN_MS) return { eligible: false, reason: 'cooldown' };
  }
  return { eligible: true };
}
```

- [ ] **Step 4: Run green**

```bash
cd apps/api && pnpm exec jest src/services/challenge-round/trigger.test.ts
```

- [ ] **Step 5: Commit**

```bash
/commit
```

---

### Task 4 — Caps + state-machine helpers

**Files:**
- Create: `apps/api/src/services/challenge-round/caps.ts` + `.test.ts`
- Create: `apps/api/src/services/challenge-round/state.ts` + `.test.ts`

- [ ] **Step 1: caps test**

```typescript
// apps/api/src/services/challenge-round/caps.test.ts
import {
  MAX_CHALLENGE_QUESTIONS,
  MAX_CHALLENGE_ANSWER_CHARS,
  CHALLENGE_OFFER_COOLDOWN_HOURS,
  MIN_LEXICAL_OVERLAP_NOTE_DRAFT,
  enforceChallengeQuestionCap,
} from './caps';

describe('caps', () => {
  it('exposes MAX_CHALLENGE_QUESTIONS = 3', () => expect(MAX_CHALLENGE_QUESTIONS).toBe(3));
  it('exposes MAX_CHALLENGE_ANSWER_CHARS = 2000', () => expect(MAX_CHALLENGE_ANSWER_CHARS).toBe(2000));
  it('exposes COOLDOWN_HOURS = 24', () => expect(CHALLENGE_OFFER_COOLDOWN_HOURS).toBe(24));
  it('exposes MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4', () => expect(MIN_LEXICAL_OVERLAP_NOTE_DRAFT).toBe(0.4));
  it('caps 5 to 3', () => expect(enforceChallengeQuestionCap(5)).toBe(3));
  it('passes 2 through', () => expect(enforceChallengeQuestionCap(2)).toBe(2));
  it('floor 1', () => expect(enforceChallengeQuestionCap(0)).toBe(1));
});
```

- [ ] **Step 2: caps impl**

```typescript
// apps/api/src/services/challenge-round/caps.ts
export const MAX_CHALLENGE_QUESTIONS = 3;
export const MAX_CHALLENGE_ANSWER_CHARS = 2000;
export const CHALLENGE_OFFER_COOLDOWN_HOURS = 24;
export const MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4;

export function enforceChallengeQuestionCap(requested: number): number {
  if (requested < 1) return 1;
  if (requested > MAX_CHALLENGE_QUESTIONS) return MAX_CHALLENGE_QUESTIONS;
  return requested;
}
```

- [ ] **Step 3: state machine test**

```typescript
// apps/api/src/services/challenge-round/state.test.ts
import { transitionChallengeState } from './state';

describe('challenge-round state transitions', () => {
  it('undefined -> offered', () => {
    expect(transitionChallengeState(undefined, { type: 'offer', topicId: 't1' })?.state).toBe('offered');
  });
  it('offered -> accepted', () => {
    expect(transitionChallengeState({ state: 'offered', offerCount: 1 }, { type: 'accept' })?.state).toBe('accepted');
  });
  it('offered -> declined preserves dontAskAgain', () => {
    const next = transitionChallengeState({ state: 'offered', offerCount: 1 }, { type: 'decline', dontAskAgain: true });
    expect(next?.state).toBe('declined');
    expect(next?.declinedDontAskAgain).toBe(true);
  });
  it('accepted -> active sets questionIndex=0 + totalQuestions capped to 3', () => {
    const next = transitionChallengeState({ state: 'accepted', offerCount: 1 }, { type: 'start', totalQuestions: 5 });
    expect(next?.state).toBe('active');
    expect(next?.questionIndex).toBe(0);
    expect(next?.totalQuestions).toBe(3);
  });
  it('active -> drafting when last question answered', () => {
    const next = transitionChallengeState(
      { state: 'active', offerCount: 1, questionIndex: 2, totalQuestions: 3 },
      { type: 'answer_complete' },
    );
    expect(next?.state).toBe('drafting');
  });
  it('active -> active advances when more questions remain', () => {
    const next = transitionChallengeState(
      { state: 'active', offerCount: 1, questionIndex: 0, totalQuestions: 3 },
      { type: 'answer_complete' },
    );
    expect(next?.state).toBe('active');
    expect(next?.questionIndex).toBe(1);
  });
  it('rejects illegal transition (complete -> active)', () => {
    expect(() =>
      transitionChallengeState({ state: 'complete', offerCount: 1 }, { type: 'start', totalQuestions: 3 }),
    ).toThrow(/illegal/i);
  });
  it('abort can run from any state', () => {
    expect(transitionChallengeState({ state: 'active', offerCount: 1 }, { type: 'abort' })?.state).toBe('aborted');
  });
});
```

- [ ] **Step 4: state machine impl**

```typescript
// apps/api/src/services/challenge-round/state.ts
import type { z } from 'zod';
import { challengeRoundSessionStateSchema } from '@eduagent/schemas';
import { enforceChallengeQuestionCap, MAX_CHALLENGE_QUESTIONS } from './caps';

type State = z.infer<typeof challengeRoundSessionStateSchema>;

export type StateTransition =
  | { type: 'offer'; topicId: string }
  | { type: 'accept' }
  | { type: 'decline'; dontAskAgain: boolean }
  | { type: 'start'; totalQuestions: number }
  | { type: 'answer_complete' }
  | { type: 'draft_ready' }
  | { type: 'complete' }
  | { type: 'abort' };

export function transitionChallengeState(prev: State | undefined, ev: StateTransition): State | undefined {
  switch (ev.type) {
    case 'offer':
      if (prev && prev.state !== 'complete' && prev.state !== 'aborted') {
        throw new Error(`illegal: cannot offer from state=${prev.state}`);
      }
      return {
        state: 'offered',
        offerCount: (prev?.offerCount ?? 0) + 1,
        topicId: ev.topicId,
        declinedDontAskAgain: false,
      };
    case 'accept':
      if (prev?.state !== 'offered') throw new Error('illegal: accept requires offered');
      return { ...prev, state: 'accepted' };
    case 'decline':
      if (prev?.state !== 'offered') throw new Error('illegal: decline requires offered');
      return { ...prev, state: 'declined', declinedDontAskAgain: ev.dontAskAgain };
    case 'start':
      if (prev?.state !== 'accepted') throw new Error('illegal: start requires accepted');
      return {
        ...prev,
        state: 'active',
        questionIndex: 0,
        totalQuestions: enforceChallengeQuestionCap(ev.totalQuestions),
        startedAt: new Date().toISOString(),
      };
    case 'answer_complete': {
      if (prev?.state !== 'active') throw new Error('illegal: answer_complete requires active');
      const next = (prev.questionIndex ?? 0) + 1;
      if (next >= (prev.totalQuestions ?? MAX_CHALLENGE_QUESTIONS)) return { ...prev, state: 'drafting' };
      return { ...prev, questionIndex: next };
    }
    case 'draft_ready':
      if (prev?.state !== 'drafting') throw new Error('illegal: draft_ready requires drafting');
      return prev;
    case 'complete':
      if (prev?.state !== 'drafting' && prev?.state !== 'active') {
        throw new Error('illegal: complete from state=' + prev?.state);
      }
      return { ...prev, state: 'complete' };
    case 'abort':
      return prev ? { ...prev, state: 'aborted' } : undefined;
  }
}
```

- [ ] **Step 5: Run green**

```bash
cd apps/api && pnpm exec jest src/services/challenge-round/caps.test.ts src/services/challenge-round/state.test.ts
```

- [ ] **Step 6: Commit**

```bash
/commit
```

---

### Task 5 — Per-answer evaluation + mastery decision

**Files:**
- Create: `apps/api/src/services/challenge-round/evaluation.ts` + `.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/services/challenge-round/evaluation.test.ts
import { decideMasteryAndReview, summarizeEvaluation } from './evaluation';

const allSolid = [
  { concept: 'a', result: 'solid' as const, evidence: 'x' },
  { concept: 'b', result: 'solid' as const, evidence: 'y' },
  { concept: 'c', result: 'solid' as const, evidence: 'z' },
];
const mixed = [
  { concept: 'a', result: 'solid' as const, evidence: 'x' },
  { concept: 'b', result: 'partial' as const, evidence: 'y' },
  { concept: 'c', result: 'misconception' as const, evidence: 'z', correction: 'C' },
];
const allMissing = [
  { concept: 'a', result: 'missing' as const, evidence: 'x' },
  { concept: 'b', result: 'missing' as const, evidence: 'y' },
];

describe('decideMasteryAndReview', () => {
  it('all solid -> verified, no review targets', () => {
    const d = decideMasteryAndReview(allSolid);
    expect(d.outcome).toBe('verified');
    expect(d.markMasteryVerified).toBe(true);
    expect(d.reviewTargets).toEqual([]);
    expect(d.solidConcepts).toEqual(['a', 'b', 'c']);
  });
  it('mixed -> partial, review targets for partial+misconception, NOT mastered', () => {
    const d = decideMasteryAndReview(mixed);
    expect(d.outcome).toBe('partial');
    expect(d.markMasteryVerified).toBe(false);
    expect(d.reviewTargets.map(r => r.concept).sort()).toEqual(['b', 'c']);
    expect(d.solidConcepts).toEqual(['a']);
  });
  it('all missing -> reteach, no note, no review targets', () => {
    const d = decideMasteryAndReview(allMissing);
    expect(d.outcome).toBe('reteach');
    expect(d.solidConcepts).toEqual([]);
    expect(d.markMasteryVerified).toBe(false);
  });
  it('any misconception blocks mastery even if majority solid', () => {
    const mostlySolid = [
      { concept: 'a', result: 'solid' as const, evidence: 'x' },
      { concept: 'b', result: 'solid' as const, evidence: 'y' },
      { concept: 'c', result: 'misconception' as const, evidence: 'z', correction: 'C' },
    ];
    expect(decideMasteryAndReview(mostlySolid).markMasteryVerified).toBe(false);
  });
});

describe('summarizeEvaluation', () => {
  it('counts per result bucket', () => {
    expect(summarizeEvaluation(mixed)).toEqual({ solid: 1, partial: 1, missing: 0, misconception: 1, total: 3 });
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// apps/api/src/services/challenge-round/evaluation.ts
import type { z } from 'zod';
import { challengeRoundEvaluationItemSchema } from '@eduagent/schemas';

type Eval = z.infer<typeof challengeRoundEvaluationItemSchema>;

export interface ReviewTarget {
  concept: string;
  misconception?: string;
  correction?: string;
  source: 'challenge_round';
}

export interface MasteryDecision {
  outcome: 'verified' | 'partial' | 'reteach';
  markMasteryVerified: boolean;
  solidConcepts: string[];
  reviewTargets: ReviewTarget[];
}

export function decideMasteryAndReview(evals: Eval[]): MasteryDecision {
  const solid = evals.filter(e => e.result === 'solid').map(e => e.concept);
  const hasMisconception = evals.some(e => e.result === 'misconception');
  const hasPartial = evals.some(e => e.result === 'partial');
  const allMissing = evals.length > 0 && evals.every(e => e.result === 'missing');
  const reviewTargets: ReviewTarget[] = evals
    .filter(e => e.result === 'partial' || e.result === 'misconception')
    .map(e => ({
      concept: e.concept,
      misconception: e.result === 'misconception' ? e.evidence : undefined,
      correction: e.correction,
      source: 'challenge_round' as const,
    }));

  if (allMissing) return { outcome: 'reteach', markMasteryVerified: false, solidConcepts: [], reviewTargets };
  if (solid.length === evals.length && !hasMisconception && !hasPartial) {
    return { outcome: 'verified', markMasteryVerified: true, solidConcepts: solid, reviewTargets: [] };
  }
  return { outcome: 'partial', markMasteryVerified: false, solidConcepts: solid, reviewTargets };
}

export function summarizeEvaluation(evals: Eval[]) {
  return {
    solid: evals.filter(e => e.result === 'solid').length,
    partial: evals.filter(e => e.result === 'partial').length,
    missing: evals.filter(e => e.result === 'missing').length,
    misconception: evals.filter(e => e.result === 'misconception').length,
    total: evals.length,
  };
}
```

- [ ] **Step 3: Run green + commit**

```bash
cd apps/api && pnpm exec jest src/services/challenge-round/evaluation.test.ts
/commit
```

---

### Task 6 — Note-draft hallucination guard

**Scope (HIGH-1):** This guard catches *topic drift* (LLM produces content lexically unrelated to learner answers, e.g. switches from photosynthesis to Krebs cycle). It does NOT catch *value substitution* within shared vocabulary (e.g. swapping "chloroplast" for "mitochondria") — those tokens are in the learner's vocabulary, so overlap stays high. Value-substitution defense lives upstream: the drafting prompt is fed ONLY concepts marked `solid` by `decideMasteryAndReview`; misconception text never reaches the drafter. The `note-draft.ts` jsdoc must state this scope explicitly so future readers don't mistake the lexical guard for a correctness check.

**Files:**
- Create: `apps/api/src/services/challenge-round/note-draft.ts` + `.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/services/challenge-round/note-draft.test.ts
import { validateNoteDraft } from './note-draft';

const learnerAnswers = [
  'Photosynthesis happens in chloroplasts. The plant uses light energy to convert carbon dioxide and water into glucose.',
  'ATP is the energy currency of the cell.',
];

describe('validateNoteDraft', () => {
  it('accepts draft that overlaps with learner content', () => {
    const draft = 'Photosynthesis takes place in chloroplasts. Light energy converts carbon dioxide and water into glucose. ATP is the cell energy currency.';
    expect(validateNoteDraft(draft, learnerAnswers).ok).toBe(true);
  });
  it('rejects draft that invents content with low overlap', () => {
    const draft = 'The Krebs cycle is essential for cellular respiration and produces NADH and FADH2 electron carriers.';
    expect(validateNoteDraft(draft, learnerAnswers).ok).toBe(false);
  });
  it('rejects empty draft', () => {
    expect(validateNoteDraft('', learnerAnswers).ok).toBe(false);
  });
  it('reports overlap ratio in result', () => {
    const r = validateNoteDraft('Photosynthesis happens in chloroplasts. ATP is energy currency.', learnerAnswers);
    expect(r.ok).toBe(true);
    expect(r.overlapRatio).toBeGreaterThan(0.4);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// apps/api/src/services/challenge-round/note-draft.ts
import { MIN_LEXICAL_OVERLAP_NOTE_DRAFT } from './caps';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'and', 'or', 'of', 'to', 'in', 'on', 'for',
  'with', 'as', 'by', 'at', 'it', 'its', 'this', 'that', 'be', 'was', 'were',
  'has', 'have', 'had', 'do', 'does', 'did', 'i', 'you', 'they', 'we', 'he', 'she',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOPWORDS.has(t)),
  );
}

export interface DraftValidationResult {
  ok: boolean;
  overlapRatio: number;
  reason?: string;
}

export function validateNoteDraft(draft: string, learnerAnswers: string[]): DraftValidationResult {
  if (!draft.trim()) return { ok: false, overlapRatio: 0, reason: 'empty' };
  const draftTokens = tokenize(draft);
  const learnerTokens = tokenize(learnerAnswers.join(' '));
  if (draftTokens.size === 0) return { ok: false, overlapRatio: 0, reason: 'no_content_tokens' };
  let overlap = 0;
  for (const tok of draftTokens) if (learnerTokens.has(tok)) overlap += 1;
  const ratio = overlap / draftTokens.size;
  if (ratio < MIN_LEXICAL_OVERLAP_NOTE_DRAFT) return { ok: false, overlapRatio: ratio, reason: 'low_lexical_overlap' };
  return { ok: true, overlapRatio: ratio };
}
```

- [ ] **Step 3: Run green + commit**

```bash
cd apps/api && pnpm exec jest src/services/challenge-round/note-draft.test.ts
/commit
```

- [ ] **Step 4: Calibrate `MIN_LEXICAL_OVERLAP_NOTE_DRAFT` against the eval harness (MED-3)**

The 0.4 threshold in `caps.ts` is a guess. After Task 8 (Tier 2 eval harness wired), run the 6-scenario suite and emit the overlap ratio for each `note_draft`. Log a histogram. If 0.4 produces false rejects on the `draft-note-uses-learner-words` scenario, lower; if it accepts the obviously-hallucinated drafts in adversarial scenarios (add 2 such scenarios to `challenge-round.ts` for this calibration), raise.

Annotate the constant in `caps.ts`:

```typescript
// MIN_LEXICAL_OVERLAP_NOTE_DRAFT: initial guess 0.4. TODO calibrate after first
// 100 production challenge rounds — re-tune based on ratio histogram.
export const MIN_LEXICAL_OVERLAP_NOTE_DRAFT = 0.4;
```

This step does NOT block the PR; it is a TODO tracked in Notion for follow-up.

---

### Task 7 — Prompt blocks + eval-harness scenarios

**Files:**
- Create: `apps/api/src/services/challenge-round/prompts.ts` + `.test.ts`
- Modify: `apps/api/src/services/exchange-prompts.ts` — inject block based on state
- Create: `apps/api/eval-llm/scenarios/challenge-round.ts`
- Modify: `apps/api/eval-llm/scenarios/index.ts`

- [ ] **Step 1: Write prompts module**

```typescript
// apps/api/src/services/challenge-round/prompts.ts
import { MAX_CHALLENGE_QUESTIONS } from './caps';

export const challengeOfferPrompt = `
The learner has shown solid grasp of this topic across several exchanges and the system rules them ELIGIBLE for a Challenge Round.

If — and only if — the learner's last message reads as confident and complete, you MAY offer a Challenge Round.
Emit the offer by setting "signals.challenge_round_offer": true and writing a single-sentence invitation in "reply", e.g.:
  "You've got the basics — want a challenge round where you explain this in depth, and I'll turn your answers into a note?"

Never offer if the learner sounds tired, confused, or is mid-question. Do not offer twice in the same session.
`.trim();

export const challengeRoundActivePrompt = `
You are now running a Challenge Round. The learner accepted. Ask ONE deeper question at a time that requires them to:
- explain WHY something works (not what it is)
- compare/contrast two related ideas
- apply the idea to a new context
- teach the concept back in their own words

Constraints:
- Maximum ${MAX_CHALLENGE_QUESTIONS} questions per round (do not exceed; the server will cap).
- One question per turn. No multi-part questions.
- Match the learner's age and energy. Do not use academic jargon.
- After EACH learner answer, emit "signals.challenge_round_evaluation" with ONE item describing the concept assessed and result in {solid, partial, missing, misconception}.
- When all questions are answered, set "ui_hints.challenge_round.active": false and proceed to drafting.

Failure framing is banned. Never use "failed", "wrong", "incorrect", "struggle", "weak". Use "got it", "close", "let's tighten this", "not quite yet".
`.trim();

export const challengeRoundDraftingPrompt = `
The Challenge Round is complete. Draft a learner-owned note in "ui_hints.note_draft.content".

Hard rules:
- Use ONLY content the learner actually said in their challenge answers. Do not invent facts they did not state.
- Pull from concepts the evaluation marked "solid". Do NOT include partial or misconception concepts.
- 2-5 short sentences. Written in the learner's voice ("I learned that...", "in my own words...").
- Title is NOT included; the note system handles that.

In "reply", briefly tell the learner what you've drafted, e.g.:
  "Here's what you now know — based on your own words. You can save it, edit it, or skip."

If no concepts were solid, do NOT emit a note_draft. Instead set "reply" to something supportive like:
  "We're close on this — let's revisit it next time and tighten one piece together."
`.trim();
```

- [ ] **Step 2: Snapshot test (Tier 1, no LLM call)**

```typescript
// apps/api/src/services/challenge-round/prompts.test.ts
import { challengeOfferPrompt, challengeRoundActivePrompt, challengeRoundDraftingPrompt } from './prompts';

describe('challenge-round prompts', () => {
  it('offer prompt is stable', () => expect(challengeOfferPrompt).toMatchSnapshot());
  it('active prompt declares cap', () => {
    expect(challengeRoundActivePrompt).toMatch(/3 questions/);
    expect(challengeRoundActivePrompt).toMatchSnapshot();
  });
  it('drafting prompt forbids invention', () => {
    expect(challengeRoundDraftingPrompt).toMatch(/do not invent/i);
    expect(challengeRoundDraftingPrompt).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Wire into exchange-prompts.ts**

In `apps/api/src/services/exchange-prompts.ts`, inside `buildSystemPrompt()`, after the existing tone/guidance blocks:

```typescript
import {
  challengeOfferPrompt,
  challengeRoundActivePrompt,
  challengeRoundDraftingPrompt,
} from './challenge-round/prompts';

// at the appropriate spot in buildSystemPrompt:
const cr = sessionMetadata?.challengeRound;
if (cr?.state === 'offered' || (!cr && challengeEligible)) {
  prompt += '\n\n' + challengeOfferPrompt;
} else if (cr?.state === 'active') {
  prompt += '\n\n' + challengeRoundActivePrompt;
} else if (cr?.state === 'drafting') {
  prompt += '\n\n' + challengeRoundDraftingPrompt;
}
```

`challengeEligible` is a new param passed in from `processExchange` based on `evaluateChallengeReadiness` (wired in Task 8). Add it to the `BuildSystemPromptArgs` type with a default `false`.

**LOW-2 — state → prompt mapping (canonical):**

| `cr.state`    | `challengeEligible` | Prompt block injected           | Notes |
|---------------|----------------------|---------------------------------|-------|
| undefined     | true                 | `challengeOfferPrompt`          | First-time eligible; LLM may emit `challenge_round_offer`. |
| undefined     | false                | none                            | Normal session, no challenge content in prompt. |
| `offered`     | (ignored)            | `challengeOfferPrompt`          | LLM sees offer is pending; do not re-offer. The offer prompt itself includes "Do not offer twice in the same session." |
| `accepted`    | (ignored)            | `challengeRoundActivePrompt`    | Bridge from accept → first question. Server transitions to `active` on the same turn it dispatches the active prompt. |
| `active`      | (ignored)            | `challengeRoundActivePrompt`    | Ongoing Q&A. |
| `drafting`    | (ignored)            | `challengeRoundDraftingPrompt`  | Last evaluation + note draft. |
| `complete`    | (ignored)            | none                            | Round done; back to default tone. |
| `declined`    | (ignored)            | none                            | Trigger evaluator suppresses re-offer this session. |
| `aborted`     | (ignored)            | none                            | Same as declined for prompt purposes. |

Match the conditional in code to this table 1:1, including the `accepted` → `active` prompt bridge (the original conditional omitted `accepted`).

- [ ] **Step 4: Eval-harness scenarios**

```typescript
// apps/api/eval-llm/scenarios/challenge-round.ts
import type { Scenario } from '../types';

export const challengeRoundScenarios: Scenario[] = [
  {
    name: 'offer-after-strong-answers',
    profileAge: 14,
    sessionType: 'learning',
    history: [
      { role: 'user', content: 'so photosynthesis turns sunlight into food for the plant' },
      { role: 'assistant', content: 'Right — and that food is glucose. What does the plant need besides light?' },
      { role: 'user', content: 'water and carbon dioxide' },
      { role: 'assistant', content: 'Exactly. So you have light, water, CO2 -> glucose + oxygen.' },
      { role: 'user', content: 'got it' },
    ],
    sessionMetadata: { challengeRound: undefined },
    challengeEligible: true,
    expected: {
      signalsMustInclude: ['challenge_round_offer'],
      replyMustNotInclude: ['fail', 'wrong'],
    },
  },
  {
    name: 'do-not-offer-when-confused',
    profileAge: 12,
    sessionType: 'learning',
    history: [{ role: 'user', content: "I don't really get it" }],
    sessionMetadata: { challengeRound: undefined },
    challengeEligible: false,
    expected: { signalsMustNotInclude: ['challenge_round_offer'] },
  },
  {
    name: 'evaluation-mixed',
    profileAge: 15,
    sessionType: 'learning',
    history: [
      { role: 'assistant', content: 'In your own words, why does photosynthesis need CO2?' },
      { role: 'user', content: 'because the carbon in CO2 ends up in the glucose molecule' },
    ],
    sessionMetadata: { challengeRound: { state: 'active', offerCount: 1, questionIndex: 1, totalQuestions: 3 } },
    expected: { signalsMustInclude: ['challenge_round_evaluation'], evaluationResultIn: ['solid', 'partial'] },
  },
  {
    name: 'draft-note-uses-learner-words',
    profileAge: 13,
    sessionType: 'learning',
    history: [
      { role: 'user', content: 'photosynthesis happens in the chloroplast and makes glucose from CO2 and water' },
      { role: 'user', content: 'and the cell uses ATP for energy' },
      { role: 'user', content: 'mitochondria does the opposite — breaks glucose down with oxygen' },
    ],
    sessionMetadata: { challengeRound: { state: 'drafting', offerCount: 1, questionIndex: 3, totalQuestions: 3 } },
    expected: { uiHintsMustInclude: ['note_draft'], noteDraftLexicalOverlapAtLeast: 0.4 },
  },
  {
    name: 'no-draft-on-all-missing',
    profileAge: 16,
    sessionType: 'learning',
    history: [
      { role: 'user', content: 'idk' },
      { role: 'user', content: 'no idea' },
      { role: 'user', content: 'pass' },
    ],
    sessionMetadata: { challengeRound: { state: 'drafting', offerCount: 1, questionIndex: 3, totalQuestions: 3 } },
    expected: { uiHintsMustNotInclude: ['note_draft'] },
  },
  {
    name: 'no-offer-in-homework',
    profileAge: 14,
    sessionType: 'homework',
    history: [{ role: 'user', content: 'this answer correct?' }],
    sessionMetadata: { challengeRound: undefined },
    challengeEligible: false,
    expected: { signalsMustNotInclude: ['challenge_round_offer'] },
  },
];
```

- [ ] **Step 5: Wire into harness index**

```typescript
// apps/api/eval-llm/scenarios/index.ts
export { challengeRoundScenarios } from './challenge-round';
// add to the default export array
```

- [ ] **Step 6: Run Tier 1**

```bash
pnpm eval:llm
```

Expected: new snapshots written under `apps/api/eval-llm/__snapshots__/`. Review them.

- [ ] **Step 7: Commit**

```bash
/commit
```

> Tier 2 (`pnpm eval:llm --live`) runs after Task 8 wires `challengeEligible` through `processExchange`.

---

### Task 8 — Wire trigger evaluator + envelope handling + `notes.source` migration into `processExchange`

**Files:**
- Modify: `packages/schemas/src/notes.ts` — add `source` field
- Modify: `packages/database/src/schema/notes.ts` — add column (generated migration)
- Modify: `apps/api/src/services/notes.ts` + `.test.ts` — accept/persist `source`
- Modify: `apps/api/src/services/exchanges.ts`
- Create/modify: `apps/api/src/services/exchanges.integration.test.ts` — end-to-end with mocked `routeAndCall` (external boundary only)

- [ ] **Step 0: Confirm Task 0.0 spike is committed (CRIT-3)**

Task 8 references `getSessionById` / `persistSessionMetadata`. Substitute the real names from the Task 0.0 spike decision doc before writing code. If the spike concluded a new `getSessionByIdScoped` helper needs extracting, do that as Step 0.5 here.

- [ ] **Step 1: Add `source` to notes schema (MED-1 — sweep all 6 sites, not just `createNoteInputSchema`)**

The original plan only mentioned `createNoteInputSchema`. The full list (verify with `Grep "noteSchema|noteResponseSchema|allNoteSchema|_noteDbRowSchema|_noteGetRowSchema" packages/schemas/src/notes.ts`):

```typescript
// packages/schemas/src/notes.ts — add the discriminator
export const noteSourceSchema = z.enum(['user', 'challenge_round']);
```

Then add `source: noteSourceSchema.default('user')` (or `noteSourceSchema` non-optional in response shapes) to:
- `topicNoteSchema` (line ~3-11)
- `createNoteInputSchema` (line ~14-17)
- `noteResponseSchema` (line ~31-39)
- `_noteDbRowSchema` (line ~46-53)
- `_noteGetRowSchema` (line ~66-71) — read sites; decide if surfaced or not
- `allNoteSchema` (line ~97-110)

Validate line numbers via grep before editing (HIGH-5). Any consumer reading the response shape gets `source: 'user'` by default; existing reads keep working. If `source` is NOT surfaced on a particular read (e.g. `_noteGetRowSchema`), document why in a code comment.

**## Rollback for the `notes.source` migration (CRIT-7):**
- (a) Rollback possible: yes — drop the column.
- (b) Data lost: source attribution on existing notes. Pre-launch ≈ no notes of consequence. Post-launch: notes revert to indistinguishable provenance.
- (c) Recovery: `ALTER TABLE topic_notes DROP COLUMN source;` then `git revert` the schema commit.

- [ ] **Step 2: Add column to DB schema + migration**

```typescript
// packages/database/src/schema/notes.ts (additions inside topicNotes table definition)
source: text('source').notNull().default('user'),
```

```bash
pnpm run db:generate:dev
pnpm run db:push:dev
```

- [ ] **Step 3: Update notes service + test**

```typescript
// apps/api/src/services/notes.ts (inside createNote)
const inserted = await tx.insert(topicNotes).values({
  // ...existing fields...
  source: input.source ?? 'user',
});
```

Add test case: `it('persists source = challenge_round', ...)`.

- [ ] **Step 4: Wire trigger into processExchange**

```typescript
// apps/api/src/services/exchanges.ts (inside processExchange)
import { evaluateChallengeReadiness } from './challenge-round/trigger';
import { transitionChallengeState } from './challenge-round/state';
import { safeSend } from './safe-non-core';

// after loading session/profile/topic state, before calling routeAndCall:
const readiness = evaluateChallengeReadiness({
  sessionType: session.sessionType,
  exchangeCount: session.exchangeCount,
  retentionStatus: topicProgress?.retentionStatus ?? 'forgotten',
  struggleStatus: topicProgress?.struggleStatus ?? 'normal',
  recentCorrectStreak: computeRecentCorrectStreak(session),
  quotaFractionRemaining: quota.fractionRemaining,
  challengeRoundState: session.metadata?.challengeRound,
  cooldownLastOfferedAt: cooldown?.lastOfferedAt ?? null,
  cooldownLastOutcome: cooldown?.lastOutcome ?? null,
  now: new Date(),
});

const systemPrompt = buildSystemPrompt({
  ...existingArgs,
  challengeEligible: readiness.eligible,
  sessionMetadata: session.metadata,
});

// after parseEnvelope succeeds:
const envelope = parseResult.envelope;

// server-side gate: strip challenge_round_offer if not eligible or already in round
if (envelope.signals?.challenge_round_offer) {
  const crState = session.metadata?.challengeRound?.state;
  const blocked = !readiness.eligible || (crState && !['complete', 'aborted'].includes(crState));
  if (blocked) delete envelope.signals.challenge_round_offer;
}

// state transition on offer
if (envelope.signals?.challenge_round_offer && topicProgress?.topicId) {
  session.metadata = {
    ...session.metadata,
    challengeRound: transitionChallengeState(session.metadata?.challengeRound, {
      type: 'offer',
      topicId: topicProgress.topicId,
    }),
  };
  await persistSessionMetadata(session.id, session.metadata);
}

// state transition on each evaluation in active state
if (envelope.signals?.challenge_round_evaluation && session.metadata?.challengeRound?.state === 'active') {
  session.metadata = {
    ...session.metadata,
    challengeRound: transitionChallengeState(session.metadata.challengeRound, { type: 'answer_complete' }),
  };
  await persistSessionMetadata(session.id, session.metadata);
}

// dispatch Inngest fan-out on completion (drafting -> with evaluation array)
if (
  envelope.signals?.challenge_round_evaluation &&
  session.metadata?.challengeRound?.state === 'drafting'
) {
  await safeSend('challenge.round.completed', {
    sessionId: session.id,
    profileId: session.profileId,
    topicId: session.metadata.challengeRound.topicId!,
    evaluation: envelope.signals.challenge_round_evaluation,
  });
}
```

- [ ] **Step 5: Integration test**

```typescript
// apps/api/src/services/exchanges.integration.test.ts (append; uses real DB, external-boundary mock only)
import { processExchange } from './exchanges';
import { setupTestDb, seedEligibleSession } from '@/test-utils';

describe('processExchange — challenge round dispatch', () => {
  it('strips challenge_round_offer when not eligible (homework)', async () => {
    const { session, profile } = await seedEligibleSession({ sessionType: 'homework' });
    const spy = jest.spyOn(require('./llm/routeAndCall'), 'routeAndCall').mockResolvedValue({
      content: JSON.stringify({ reply: '...', signals: { challenge_round_offer: true }, confidence: 'medium' }),
    });
    const result = await processExchange({ sessionId: session.id, profileId: profile.id, userMessage: 'is this right?' });
    expect(result.envelope.signals?.challenge_round_offer).toBeUndefined();
    spy.mockRestore();
  });

  it('transitions session metadata to offered when eligible and signal emitted', async () => {
    const { session, profile } = await seedEligibleSession();
    jest.spyOn(require('./llm/routeAndCall'), 'routeAndCall').mockResolvedValue({
      content: JSON.stringify({ reply: 'try a challenge?', signals: { challenge_round_offer: true }, confidence: 'medium' }),
    });
    await processExchange({ sessionId: session.id, profileId: profile.id, userMessage: 'got it' });
    const refetched = await getSessionById(session.id, profile.id);
    expect(refetched.metadata.challengeRound.state).toBe('offered');
  });
});
```

- [ ] **Step 6: Run Tier 2 eval harness**

```bash
pnpm eval:llm --live
```

Expected: all 6 challenge-round scenarios pass schema validation.

- [ ] **Step 7: Commit**

```bash
/commit
```

---

### Task 9 — Accept/decline/abort/maybe-offer routes + Inngest fan-out + new mastery/review columns

**Files:**
- Modify: `packages/schemas/src/progress.ts` — add `masteryChallengeVerifiedAt` to `topicProgressSchema`
- Modify: `packages/database/src/schema/topic-progress.ts` (locate exact file) — add column
- Modify: `packages/database/src/schema/review-targets.ts` (locate exact file) — add `source` column
- Migrations: generated for both
- Create: `apps/api/src/routes/challenge-round.ts` + `.test.ts`
- Create: `apps/api/src/inngest/functions/challenge-round-completed.ts` + `.test.ts` + `.integration.test.ts`
- Modify: `apps/api/src/services/topic-completion.ts` + `.test.ts` — read the new column
- Modify: `apps/api/src/services/snapshot-aggregation.ts` + `.test.ts` — filter in-flight rows + surface new column
- Modify: `apps/api/src/services/retention-data.ts` + `.test.ts` — accept `source` on writes

- [ ] **Step 0: Re-read the Task 0.0 spike decision doc (CRIT-1, CRIT-2)**

The original plan referenced `topicProgress` and `reviewTargets` tables that do not exist. Task 0.0 picked the actual targets. Update this step to name the chosen tables/columns BEFORE editing schemas. Examples for each spike outcome:

- If CRIT-1 chose `retentionCards`: add `masteryChallengeVerifiedAt` column to that table.
- If CRIT-1 chose net-new `topic_mastery_state`: build the schema + barrel export here.
- If CRIT-2 chose net-new `review_targets`: add Task 9.0 with full migration + integration test BEFORE Step 2 below.
- If CRIT-2 chose `learningSessions.metadata.gaps`: extend `sessionMetadataSchema.gaps` to accept richer objects (concept, correction, source) and update Step 4 Inngest writes accordingly.

- [ ] **Step 1: Extend the chosen schemas + migrations**

Per spike outcome, add the columns / table. Sample for CRIT-1 path (a) (retentionCards):

```typescript
masteryChallengeVerifiedAt: timestamp('mastery_challenge_verified_at', { withTimezone: true }),
```

Generate + apply migrations:

```bash
pnpm run db:generate:dev
pnpm run db:push:dev
```

**## Rollback for each new column / table in this task (CRIT-7):**
- (a) Rollback possible: yes — drop columns/tables.
- (b) Data lost: per-table — mastery-verified timestamps, review-target rows. Pre-launch ≈ none.
- (c) Recovery: `ALTER TABLE ... DROP COLUMN ...;` or `DROP TABLE ...;` then `git revert`.

- [ ] **Step 1.5: Define what `masteryChallengeVerifiedAt` *does* downstream (MED-5)**

The original plan said "Modify: `topic-completion.ts` … read the new column" without specifying behavior. Decide one of:
- (a) **Surface only.** Column is read by Parent Dashboard for the v2 challenge-verified badge; no change to existing topic-completion gates. Lowest blast radius for v1.
- (b) **Strengthen completion.** Topic completion (current gate: `MIN_EXCHANGES_FOR_TOPIC_COMPLETION = 5`) now ALSO marks the topic as "challenge-verified" when set. Existing `completed` semantics unchanged; the badge is additive.
- (c) **New axis on the topic-completion response.** `topicProgressSchema` gains `masteryChallengeVerifiedAt: z.string().datetime().nullable()`; clients render conditionally.

Pick (c) for v1 — additive schema, no behavior coupling. Update `topic-completion.ts` to include the field in its return value; existing consumers ignore it harmlessly.

- [ ] **Step 2: Add routes**

```typescript
// apps/api/src/routes/challenge-round.ts
import { Hono } from 'hono';
import { z } from 'zod';
import { transitionChallengeState } from '@/services/challenge-round/state';
import { evaluateChallengeReadiness } from '@/services/challenge-round/trigger';
import { recordCooldown } from '@/services/challenge-round/cooldown';
import { getSessionById, persistSessionMetadata } from '@/services/session/session-crud';
import { safeSend } from '@/services/safe-non-core';

const maybeOfferSchema = z.object({ sessionId: z.string().uuid(), topicId: z.string().uuid() });
const acceptSchema = z.object({ sessionId: z.string().uuid(), topicId: z.string().uuid() });
const declineSchema = z.object({ sessionId: z.string().uuid(), dontAskAgain: z.boolean(), topicId: z.string().uuid() });
const abortSchema = z.object({ sessionId: z.string().uuid() });

export const challengeRoundRoutes = new Hono()
  .post('/maybe-offer', async (c) => {
    const body = maybeOfferSchema.parse(await c.req.json());
    const profileId = c.get('profileId');
    const session = await getSessionById(body.sessionId, profileId);

    // HIGH-2: pre-flight state check to avoid double-offer race with server-initiated path
    const currentState = session.metadata?.challengeRound?.state;
    if (currentState && ['offered', 'accepted', 'active', 'drafting'].includes(currentState)) {
      return c.json({ offered: true, alreadyOffered: true });
    }

    const readinessInput = await loadReadinessInput({ session, profileId, topicId: body.topicId });
    const readiness = evaluateChallengeReadiness(readinessInput);
    if (!readiness.eligible) return c.json({ offered: false, reason: readiness.reason });
    session.metadata = {
      ...session.metadata,
      challengeRound: transitionChallengeState(session.metadata?.challengeRound, { type: 'offer', topicId: body.topicId }),
    };
    await persistSessionMetadata(session.id, session.metadata);
    return c.json({ offered: true });
  })
  .post('/accept', async (c) => {
    const body = acceptSchema.parse(await c.req.json());
    const session = await getSessionById(body.sessionId, c.get('profileId'));
    session.metadata = {
      ...session.metadata,
      challengeRound: transitionChallengeState(session.metadata?.challengeRound, { type: 'accept' }),
    };
    await persistSessionMetadata(session.id, session.metadata);
    return c.json({ ok: true });
  })
  .post('/decline', async (c) => {
    const body = declineSchema.parse(await c.req.json());
    const session = await getSessionById(body.sessionId, c.get('profileId'));
    session.metadata = {
      ...session.metadata,
      challengeRound: transitionChallengeState(session.metadata?.challengeRound, { type: 'decline', dontAskAgain: body.dontAskAgain }),
    };
    await persistSessionMetadata(session.id, session.metadata);
    await recordCooldown({ profileId: c.get('profileId'), topicId: body.topicId, outcome: 0 });
    await safeSend('challenge.round.declined', { sessionId: body.sessionId, topicId: body.topicId });
    return c.json({ ok: true });
  })
  .post('/abort', async (c) => {
    const body = abortSchema.parse(await c.req.json());
    const session = await getSessionById(body.sessionId, c.get('profileId'));
    session.metadata = {
      ...session.metadata,
      challengeRound: transitionChallengeState(session.metadata?.challengeRound, { type: 'abort' }),
    };
    await persistSessionMetadata(session.id, session.metadata);
    return c.json({ ok: true });
  });
```

Helper `loadReadinessInput` queries the same data `processExchange` uses (session, topic progress, quota, cooldown). Extract to `apps/api/src/services/challenge-round/readiness-input.ts` if it's used from two callers; otherwise inline.

- [ ] **Step 3: Cooldown service**

```typescript
// apps/api/src/services/challenge-round/cooldown.ts
import { db } from '@/db';
import { challengeRoundCooldowns } from '@eduagent/database';

export async function recordCooldown(input: { profileId: string; topicId: string; outcome: number }): Promise<void> {
  await db
    .insert(challengeRoundCooldowns)
    .values({ profileId: input.profileId, topicId: input.topicId, lastOutcome: input.outcome })
    .onConflictDoUpdate({
      target: [challengeRoundCooldowns.profileId, challengeRoundCooldowns.topicId],
      set: { lastOfferedAt: new Date(), lastOutcome: input.outcome },
    });
}
```

- [ ] **Step 4: Inngest function**

```typescript
// apps/api/src/inngest/functions/challenge-round-completed.ts
import { inngest } from '../client';
import { decideMasteryAndReview } from '@/services/challenge-round/evaluation';
import { upsertReviewTargets } from '@/services/retention-data';
import { markMasteryChallengeVerified } from '@/services/topic-completion';
import { recordCooldown } from '@/services/challenge-round/cooldown';

export const challengeRoundCompleted = inngest.createFunction(
  { id: 'challenge-round-completed', name: 'Challenge Round Completed' },
  { event: 'challenge.round.completed' },
  async ({ event, step }) => {
    const { sessionId, profileId, topicId, evaluation } = event.data;
    const decision = decideMasteryAndReview(evaluation);
    await step.run('persist-review-targets', () => upsertReviewTargets(profileId, topicId, decision.reviewTargets));
    if (decision.markMasteryVerified) {
      await step.run('mark-mastery-verified', () => markMasteryChallengeVerified(profileId, topicId, new Date()));
    }
    await step.run('record-cooldown', () =>
      recordCooldown({
        profileId,
        topicId,
        outcome: decision.markMasteryVerified ? 2 : decision.outcome === 'reteach' ? 3 : 1,
      }),
    );
    return { outcome: decision.outcome, solidConcepts: decision.solidConcepts.length };
  },
);
```

- [ ] **Step 5: Register the Inngest function (MED-4 — cite the actual index file, don't assume)**

```
Grep "createFunction" apps/api/src/inngest/functions/index.ts
```

Confirm the file exists and the registration pattern. Add `challengeRoundCompleted` to the exported array. Also verify the event names `challenge.round.completed` and `challenge.round.declined` do not collide with existing events:

```
Grep "challenge\\.round" apps/api/src
```

Expected: only the call sites added in this PR. If anything else exists (unlikely, but worth checking), rename to `challenge.round.v1.completed` etc.

- [ ] **Step 6: Tests**

Write tests for:
- Routes: accept/decline/maybe-offer/abort all transition session metadata correctly, decline persists cooldown.
- Inngest function: verified outcome → mastery flag set, no review targets; partial outcome → review targets, no mastery flag; reteach outcome → cooldown=3, no review targets.

```bash
pnpm exec nx run api:test
```

- [ ] **Step 7: Commit**

```bash
/commit
```

---

### Task 10 — Mobile components + `useChallengeRound` hook + session-streaming integration + chip wiring

**Files:**
- Create: `apps/mobile/src/hooks/use-challenge-round.ts` + `.test.tsx`
- Create: `apps/mobile/src/components/session/ChallengeOfferCard.tsx` + `.test.tsx`
- Create: `apps/mobile/src/components/session/ChallengeRoundBanner.tsx` + `.test.tsx`
- Create: `apps/mobile/src/components/session/DraftedNoteReview.tsx` + `.test.tsx`
- Modify: `apps/mobile/src/components/session/use-session-streaming.ts` + `.test.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Modify: `apps/mobile/src/lib/strip-envelope.ts` + `.test.ts`
- Modify: `apps/mobile/src/components/session/SessionAccessories.tsx` + `.test.tsx` — chip wiring
- Modify: `apps/mobile/src/i18n/locales/{en,de,es,ja,nb,pl,pt}.json`

- [ ] **Step 1: Hook + test**

```typescript
// apps/mobile/src/hooks/use-challenge-round.ts
import { useMutation } from '@tanstack/react-query';
import { useCreateNote } from './use-notes';
import { useApiClient } from '../lib/api-client';

export function useChallengeRound(opts: {
  sessionId: string;
  topicId: string;
  subjectId: string;
  bookId: string;
}) {
  const api = useApiClient();
  const createNote = useCreateNote(opts.subjectId, opts.bookId);
  const maybeOffer = useMutation({
    mutationFn: () => api.post<{ offered: boolean; reason?: string }>('/challenge-round/maybe-offer', { sessionId: opts.sessionId, topicId: opts.topicId }),
  });
  const accept = useMutation({
    mutationFn: () => api.post('/challenge-round/accept', { sessionId: opts.sessionId, topicId: opts.topicId }),
  });
  const decline = useMutation({
    mutationFn: (dontAskAgain: boolean) => api.post('/challenge-round/decline', { sessionId: opts.sessionId, topicId: opts.topicId, dontAskAgain }),
  });
  const abort = useMutation({
    mutationFn: () => api.post('/challenge-round/abort', { sessionId: opts.sessionId }),
  });
  return {
    maybeOffer: () => maybeOffer.mutateAsync(),
    accept: () => accept.mutateAsync(),
    decline: (dontAskAgain = false) => decline.mutateAsync(dontAskAgain),
    abort: () => abort.mutateAsync(),
    saveNote: (content: string) => createNote.mutateAsync({ topicId: opts.topicId, sessionId: opts.sessionId, content, source: 'challenge_round' }),
    skipNote: () => Promise.resolve(),
  };
}
```

Hook test asserts: action functions exist, accept calls the right endpoint, saveNote includes `source: 'challenge_round'`.

- [ ] **Step 2: ChallengeOfferCard**

```tsx
// apps/mobile/src/components/session/ChallengeOfferCard.tsx
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function ChallengeOfferCard({
  pitch, onAccept, onDecline, onDontAskAgain,
}: {
  pitch: string;
  onAccept: () => void;
  onDecline: () => void;
  onDontAskAgain: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="rounded-2xl bg-surface-elevated p-4 border border-accent-soft" testID="challenge-offer-card">
      <Text className="text-text-primary text-base font-semibold mb-1">{t('session.challenge.offerTitle')}</Text>
      <Text className="text-text-secondary mb-3">{pitch}</Text>
      <View className="flex-row gap-2 flex-wrap">
        <Pressable onPress={onAccept} className="bg-accent rounded-xl px-4 py-2" testID="challenge-offer-accept">
          <Text className="text-on-accent font-medium">{t('session.challenge.tryIt')}</Text>
        </Pressable>
        <Pressable onPress={onDecline} className="bg-surface rounded-xl px-4 py-2" testID="challenge-offer-decline">
          <Text className="text-text-primary">{t('session.challenge.notNow')}</Text>
        </Pressable>
        <Pressable onPress={onDontAskAgain} className="rounded-xl px-4 py-2" testID="challenge-offer-dont-ask">
          <Text className="text-text-muted">{t('session.challenge.dontAskAgain')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 3: ChallengeRoundBanner**

```tsx
// apps/mobile/src/components/session/ChallengeRoundBanner.tsx
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function ChallengeRoundBanner({ questionIndex, totalQuestions }: { questionIndex: number; totalQuestions: number }) {
  const { t } = useTranslation();
  return (
    <View className="px-4 py-2 bg-accent-soft border-b border-accent" testID="challenge-round-banner">
      <Text className="text-on-accent-soft text-sm">
        {t('session.challenge.banner.question', { index: questionIndex + 1, total: totalQuestions })}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: DraftedNoteReview**

```tsx
// apps/mobile/src/components/session/DraftedNoteReview.tsx
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function DraftedNoteReview({
  initialContent, onSave, onSkip,
}: {
  initialContent: string;
  onSave: (content: string) => Promise<unknown>;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);
  const [editing, setEditing] = useState(false);
  return (
    <View className="rounded-2xl bg-surface-elevated p-4 border border-accent-soft" testID="drafted-note-review">
      <Text className="text-text-primary text-base font-semibold mb-2">{t('session.challenge.draft.title')}</Text>
      {editing ? (
        <TextInput multiline value={content} onChangeText={setContent} className="text-text-primary min-h-[120px] rounded-xl bg-surface p-3" testID="drafted-note-input" />
      ) : (
        <Text className="text-text-primary" testID="drafted-note-preview">{content}</Text>
      )}
      <View className="flex-row gap-2 mt-3 flex-wrap">
        <Pressable onPress={() => onSave(content)} className="bg-accent rounded-xl px-4 py-2" testID="drafted-note-save">
          <Text className="text-on-accent font-medium">{t('session.challenge.draft.save')}</Text>
        </Pressable>
        <Pressable onPress={() => setEditing(true)} className="bg-surface rounded-xl px-4 py-2" testID="drafted-note-edit">
          <Text className="text-text-primary">{t('session.challenge.draft.edit')}</Text>
        </Pressable>
        <Pressable onPress={onSkip} className="rounded-xl px-4 py-2" testID="drafted-note-skip">
          <Text className="text-text-muted">{t('session.challenge.draft.skip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 5.0: Verify the envelope is delivered as a single end-of-stream message (HIGH-3)**

```
Read apps/mobile/src/components/session/use-session-streaming.ts
```

Confirm whether `parseEnvelope` runs on the FULL response (single end-of-stream message) or on STREAMING tokens. The current API pipeline (`apps/api/src/services/llm/envelope.ts:165-182`) parses post-stream — meaning the mobile gets a fully-formed envelope, after the server-side gate has had a chance to strip ineligible signals. Document this assumption inline in `use-session-streaming.ts`:

```typescript
// HIGH-3: relies on parseEnvelope running post-stream. If the streaming protocol ever
// switches to per-token incremental envelopes, the server-side suppression of
// challenge_round_offer (in processExchange) must move into the system prompt so the LLM
// never emits the signal in the first place.
```

If the verification reveals that streaming IS incremental (or might become so), bail out of this approach and replace it with prompt-level suppression: when `evaluateChallengeReadiness` returns `{eligible: false}`, do NOT inject `challengeOfferPrompt`. The LLM never knows to emit the signal. This is the safer architecture regardless; consider switching now.

- [ ] **Step 5: use-session-streaming.ts extension**

Locate the existing `ui_hints.fluency_drill` / `note_prompt` detection in `apps/mobile/src/components/session/use-session-streaming.ts`. Add:

```typescript
if (envelope.signals?.challenge_round_offer) setChallengeOfferPitch(envelope.reply);
if (envelope.ui_hints?.challenge_round) setChallengeRoundActive(envelope.ui_hints.challenge_round);
if (envelope.ui_hints?.note_draft) setNoteDraft(envelope.ui_hints.note_draft);
```

Expose `challengeOfferPitch`, `challengeRoundActive`, `noteDraft` from the hook return.

- [ ] **Step 6: Strip new ui_hints from learner reply**

```typescript
// apps/mobile/src/lib/strip-envelope.ts — extend the existing UI_HINT_KEYS_TO_STRIP constant
const UI_HINT_KEYS_TO_STRIP = ['note_prompt', 'fluency_drill', 'challenge_round', 'note_draft'];
```

- [ ] **Step 7: Render in session/index.tsx**

Above the chat scroll area or as an inline message slot, conditionally render the three new components based on session-streaming state. Wire to `useChallengeRound` hook actions.

- [ ] **Step 8: Wire "Too easy" chip through `maybeOffer`**

In `apps/mobile/src/components/session/SessionAccessories.tsx` (the chip strip), locate the `too_easy` chip handler. Today it directly dispatches the `too_easy` system prompt via the message-send pipeline. Change it to:

```typescript
const handleTooEasy = async () => {
  const result = await challengeRound.maybeOffer();
  if (result.offered) {
    // Server flipped state to 'offered'. The session-streaming pipeline will pick up the offer on
    // the next assistant message via challengeOfferPitch — but we want immediate UX feedback so
    // render the offer card based on the maybe-offer round-trip too.
    setChallengeOfferPitchLocal(t('session.challenge.offerBody'));
    return;
  }
  // Fall through to today's behavior — dispatch the too_easy system prompt
  dispatchQuickChip('too_easy');
};
```

Update the chip's tests to cover both branches.

- [ ] **Step 8.5: Filter the "Too easy" chip when a challenge round is in flight (HIGH-4)**

`apps/mobile/src/components/session/session-types.ts:271-282` `getContextualQuickChips` returns `['know_this', 'explain_differently', 'too_easy', 'example']` based only on the last assistant message — it's unaware of `sessionMetadata.challengeRound.state`.

Extend the function signature to accept `challengeRoundState?: ChallengeRoundState` and filter:

```typescript
if (challengeRoundState?.state &&
    ['offered', 'accepted', 'active', 'drafting'].includes(challengeRoundState.state)) {
  return chips.filter(c => c !== 'too_easy');
}
```

Add unit test: `it('filters too_easy when challenge round is active', ...)`. Update every caller of `getContextualQuickChips` to pass the state.

- [ ] **Step 9: i18n keys (en.json, then copy-as-fallback to other locales)**

Add to `apps/mobile/src/i18n/locales/en.json` under `session.challenge`:

```json
"session": {
  "challenge": {
    "offerTitle": "Up for a challenge round?",
    "offerBody": "You've got the basics — want to try explaining it in your own words and turn that into a note?",
    "tryIt": "Try it",
    "notNow": "Not now",
    "dontAskAgain": "Don't ask again",
    "banner": {
      "active": "Challenge round in progress",
      "question": "Question {{index}} of {{total}}"
    },
    "draft": {
      "title": "Here's what you know now",
      "save": "Save note",
      "edit": "Edit first",
      "skip": "Skip"
    },
    "partial": {
      "body": "You've got the strong pieces. I'll save those — we'll tighten the fuzzy bit next time."
    },
    "allMissing": {
      "body": "Let's revisit this together first."
    }
  }
}
```

Copy the same `session.challenge.*` block into `de.json`, `es.json`, `ja.json`, `nb.json`, `pl.json`, `pt.json` (English fallback; translation in a follow-up localization pass).

- [ ] **Step 10: Run mobile tests + typecheck**

```bash
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/ChallengeOfferCard.tsx src/components/session/ChallengeRoundBanner.tsx src/components/session/DraftedNoteReview.tsx src/hooks/use-challenge-round.ts src/lib/strip-envelope.ts src/components/session/SessionAccessories.tsx --no-coverage
```

- [ ] **Step 11: Commit**

```bash
/commit
```

---

### Task 11 — End-to-end integration test

**Files:**
- Create: `tests/integration/challenge-round.integration.test.ts`

- [ ] **Step 1: Write three end-to-end cases**

```typescript
// tests/integration/challenge-round.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createApp } from '@eduagent/api';
import { setupTestDb, seedEligibleSession, mockRouteAndCall, runInngestEvent } from '../utils/db-helpers';

describe('challenge round end-to-end', () => {
  it('all-solid: offer -> accept -> 3 answers -> drafted note saved -> mastery verified', async () => {
    const { db, app, profile, topic, session } = await seedEligibleSession();

    // Step 1: send a message; LLM responds with offer
    mockRouteAndCall({ reply: 'want a challenge round?', signals: { challenge_round_offer: true }, confidence: 'medium' });
    let r = await app.request(`/sessions/${session.id}/exchanges`, { method: 'POST', body: JSON.stringify({ message: 'got it' }) });
    expect(r.status).toBe(200);
    let refetched = await db.query.sessions.findFirst({ where: eq(sessions.id, session.id) });
    expect(refetched!.metadata.challengeRound.state).toBe('offered');

    // Step 2: accept
    r = await app.request('/challenge-round/accept', { method: 'POST', body: JSON.stringify({ sessionId: session.id, topicId: topic.id }) });
    expect(r.status).toBe(200);

    // Step 3: three answers, all solid
    for (let i = 0; i < 3; i++) {
      const isLast = i === 2;
      mockRouteAndCall({
        reply: isLast ? 'great' : 'next question',
        signals: { challenge_round_evaluation: [{ concept: `c${i}`, result: 'solid', evidence: 'said it correctly' }] },
        ui_hints: isLast
          ? { note_draft: { content: 'I learned that X, Y, and Z based on what I said.', source_concepts: ['c0', 'c1', 'c2'] } }
          : { challenge_round: { active: true, question_index: i + 1, total_questions: 3 } },
        confidence: 'high',
      });
      await app.request(`/sessions/${session.id}/exchanges`, { method: 'POST', body: JSON.stringify({ message: `answer ${i}` }) });
    }

    // Step 4: drafted-note save (mobile would call POST notes)
    const saveRes = await app.request(`/subjects/${topic.subjectId}/topics/${topic.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content: 'I learned that X, Y, and Z based on what I said.', sessionId: session.id, source: 'challenge_round' }),
    });
    expect(saveRes.status).toBe(200);

    // Step 5: drive inngest handler
    await runInngestEvent('challenge.round.completed', {
      sessionId: session.id,
      profileId: profile.id,
      topicId: topic.id,
      evaluation: [
        { concept: 'c0', result: 'solid', evidence: 'x' },
        { concept: 'c1', result: 'solid', evidence: 'y' },
        { concept: 'c2', result: 'solid', evidence: 'z' },
      ],
    });

    // Step 6: assertions
    const tp = await db.query.topicProgress.findFirst({ where: and(eq(topicProgress.profileId, profile.id), eq(topicProgress.topicId, topic.id)) });
    expect(tp?.masteryChallengeVerifiedAt).toBeTruthy();
    const notes = await db.query.topicNotes.findMany({ where: and(eq(topicNotes.profileId, profile.id), eq(topicNotes.topicId, topic.id)) });
    expect(notes).toHaveLength(1);
    expect(notes[0].source).toBe('challenge_round');
    expect(notes[0].sessionId).toBe(session.id);
    const rts = await db.query.reviewTargets.findMany({ where: and(eq(reviewTargets.profileId, profile.id), eq(reviewTargets.source, 'challenge_round')) });
    expect(rts).toHaveLength(0);
  });

  it('partial: 2 solid + 1 misconception saves only the 2 concepts, persists 1 review target, no mastery flip', async () => {
    const { db, profile, topic } = await seedEligibleSession();
    await runInngestEvent('challenge.round.completed', {
      sessionId: 'sid', profileId: profile.id, topicId: topic.id,
      evaluation: [
        { concept: 'c0', result: 'solid', evidence: 'x' },
        { concept: 'c1', result: 'solid', evidence: 'y' },
        { concept: 'c2', result: 'misconception', evidence: 'said wrong thing', correction: 'right thing' },
      ],
    });
    const tp = await db.query.topicProgress.findFirst({ where: and(eq(topicProgress.profileId, profile.id), eq(topicProgress.topicId, topic.id)) });
    expect(tp?.masteryChallengeVerifiedAt).toBeNull();
    const rts = await db.query.reviewTargets.findMany({ where: and(eq(reviewTargets.profileId, profile.id), eq(reviewTargets.topicId, topic.id), eq(reviewTargets.source, 'challenge_round')) });
    expect(rts).toHaveLength(1);
    expect(rts[0].correction).toBe('right thing');
  });

  it('homework session never offers, even if LLM emits the signal', async () => {
    const { app, session, profile } = await seedEligibleSession({ sessionType: 'homework' });
    mockRouteAndCall({ reply: 'yes', signals: { challenge_round_offer: true }, confidence: 'high' });
    const r = await app.request(`/sessions/${session.id}/exchanges`, { method: 'POST', body: JSON.stringify({ message: 'is this right?' }) });
    const body = await r.json();
    expect(body.envelope.signals?.challenge_round_offer).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm exec jest tests/integration/challenge-round.integration.test.ts
```

- [ ] **Step 3: Commit**

```bash
/commit
```

---

### Task 12 — CLAUDE.md + project_context.md updates

**Files:**
- Modify: `CLAUDE.md` — append one bullet under engineering rules
- Modify: `docs/project_context.md` — short paragraph

- [ ] **Step 1: Append to CLAUDE.md "Non-Negotiable Engineering Rules"**

```markdown
- Challenge Round mastery decisions are server-owned and conservative. The LLM proposes per-concept evaluations via `signals.challenge_round_evaluation`; the server runs `decideMasteryAndReview()` and sets `masteryChallengeVerifiedAt` only when EVERY concept evaluates `solid`. Any `partial`, `missing`, or `misconception` blocks mastery and routes the weak concepts to review targets with `source: 'challenge_round'`. Notes drafted from Challenge Rounds must pass the lexical-overlap hallucination guard in `services/challenge-round/note-draft.ts` before being shown to the learner. The Challenge mode toggle (`learningMode: 'serious' | 'casual'`) was removed; today's `casual` is the single default tone and rigor is now expressed per-Challenge-Round rather than globally.
```

- [ ] **Step 2: Add a short section to `docs/project_context.md`**

Document: trigger evaluator location, prompt module, envelope signal names, mobile component names, the "Too easy chip → maybe-offer route" path, the conservative-mastery rule.

- [ ] **Step 3: Commit**

```bash
/commit
```

---

## Final Validation

After Task 12, run the full validation matrix before declaring the feature complete:

- [ ] `pnpm exec nx run-many -t lint` — green
- [ ] `pnpm exec nx run-many -t typecheck` — green
- [ ] `pnpm exec nx run-many -t test` — green
- [ ] `pnpm eval:llm --live` — all 6 challenge-round scenarios pass schema validation
- [ ] `pnpm exec jest tests/integration/challenge-round.integration.test.ts` — green
- [ ] **Manual smoke 1 — sunset:** Launch the app on emulator. Open a session. Confirm: no Explorer/Challenge mode header button; no Learning Mode section in More; tone is consistent.
- [ ] **Manual smoke 2 — system-initiated CR:** Complete a learning session with 6+ exchanges, strong answers, in `strong` retention. Accept the offer. Answer 3 challenge questions correctly. Save the drafted note. Verify it appears under the topic in Library with `source: 'challenge_round'`. Verify mastery shows challenge-verified.
- [ ] **Manual smoke 3 — Too easy chip path:** In an eligible session, tap "Too easy". Verify the offer card appears immediately. Accept. In an ineligible session (e.g., exchange 3 of 5), tap "Too easy". Verify the chip behaves as before (LLM nudges harder).
- [ ] **Manual smoke 4 — partial outcome:** Run a Challenge Round with 1 solid + 1 misconception. Verify saved note contains only the solid concept text; verify a review target was persisted with the correction.
- [ ] **Manual smoke 5 — decline cooldown (MED-6 — impractical at 24h, manually expire):** Decline an offer with "Don't ask again". Finish the session. In Postgres (`db:studio:dev`), manually UPDATE the `challenge_round_cooldowns` row for that profile+topic, setting `last_offered_at = NOW() - INTERVAL '23 hours'`. Start a new session on the same topic with the same readiness conditions — verify no offer appears. Then UPDATE `last_offered_at = NOW() - INTERVAL '25 hours'` and verify the offer DOES appear. Alternatively, gate `CHALLENGE_OFFER_COOLDOWN_HOURS` on `process.env.NODE_ENV === 'test' ? 0.01 : 24` for smokes — but the manual UPDATE is simpler and doesn't change production code.
- [ ] Sentry: zero errors tagged `challenge.envelope_parse` or `challenge.state_illegal` in smoke runs.

---

## Out of Scope (Explicitly)

These are valid concerns that this plan does NOT address. Each is a tracked follow-up, not part of this PR.

- **Offline queueing of note saves.** v1 requires online. In-component draft state survives backgrounding but not app kill.
- **Voice-only flow for challenge answers.** Reuses existing voice input; no special handling.
- **Parent dashboard badge for challenge-verified mastery.** Schema lands; UI badge is v2.
- **Multi-round per session.** One round per session in v1; cooldown is per topic per 24h.
- **Rewards / streaks / badges.** Intentionally excluded — the reward is "I see what I now know."
- **Ask-anything / freeform Challenge Round.** Requires a topic anchor for the note; deferred.
- **Homework-mode Challenge Round.** Homework is explain+verify, not Socratic. Permanently excluded.
- **Parent-challenges-child.** Deferred.
- **Rename `learning_modes` DB table** to something matching its post-sunset contents (`user_preferences` or `profile_pace_settings`). Worthwhile cleanup; separate small PR.
- **Repurpose the freed header button slot.** No replacement in this PR.
- **Translated copy for `session.challenge.*` keys** in non-en locales. Stub with English fallback in v1; localization pass follows.
