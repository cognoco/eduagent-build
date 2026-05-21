# Learning Path Clarity Pass

**Date:** 2026-05-06
**Status:** Implemented
**Branch (origin):** `ux/emotional-retention-language`
**Related:** `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`, `docs/flows/learning-path-flows.md`

## Purpose

Five friction points in the current learning paths confuse the learner without producing offsetting value. This spec resolves all five with the smallest viable change in each case, reusing existing services and storage rather than reinventing or removing signal.

## Guiding Principle

**Reuse existing infrastructure.** This is the third attempt at the current product direction; two prior attempts shipped end-to-end and remain in the codebase. The fix for each item below moves trigger points or relabels surfaces — it does not delete services that downstream features (retention, dashboard, parent "Understanding," XP ledger) depend on.

## Audience Tone

All copy lands age-neutral. The go-to-market wedge is "homework helper" but the target audience is serious learners of any age; an adult reviewing a certification topic and a 14-year-old reviewing geography homework should both feel respected. Avoid kid-flavored phrasing ("homework," "practice time!"), excitement marks, and emojis in primary affordances.

---

## 1. "Practice" Disambiguation

### Problem
"Practice" today means two unrelated things:
- **Home quick action "Practice"** → opens a hub of standalone scored activities (Quiz, Dictation, Recite).
- **Topic detail "Start Review"** → opens a chat session with `mode=practice` (a conversation with the mentor).

The kid does a quiz on Monday, taps "Start Review" on a topic Tuesday expecting another quiz, and gets a conversation. Mental models collide.

### Resolution
Disambiguate at both ends.

**Home quick actions** (`apps/mobile/src/app/(app)/home.tsx` and i18n strings):
- `home-action-study-new` → **"Learn something new"**
- `home-action-homework` → **"Help with an assignment"** (replacing "Help with homework")
- `home-action-practice` → **"Test yourself"** (replacing "Practice")

**Topic detail "Start Review"** label is kept (already the right framing for what happens), but the **internal session mode rename** clears the code-level conflict:
- `mode=practice` → `mode=review` everywhere it appears (TS types, schemas in `packages/schemas`, route handlers in `apps/api/src/routes/sessions.ts`, mobile session hooks, prompt context, tests, testIDs, eval-harness fixtures).

### Reuse
No new services. Pure rename + copy change. The session orchestration and prompt context for review sessions are unchanged.

---

## 2. Topic Detail Buttons

### Problem (revised after code audit)
The audit doc describes "three buttons — Start Learning, Continue Learning, Start Review — all opening visually identical chat surfaces." The actual code (`apps/mobile/src/app/(app)/topic/[topicId].tsx`, redesigned in commit `855a632f`) already implements a **single sticky CTA** (`testID="study-cta"`) whose label is computed by `deriveStudyCTA(completionStatus, retentionStatus)` and cycles through "Start studying" / "Practice again" / "Review this topic." The handler picks `mode=learning` or `mode=practice` automatically based on state. This collapse already happened.

The remaining real complaint — "all session types look the same once you arrive in the chat" — is addressed by Q3 (conversational opener visibly distinguishes review from learning) and Q5 (verification overlay preambles). No additional differentiation is needed at the topic-detail entry point.

### Resolution
**No code change to the topic detail screen.** The existing single adaptive CTA stays. Q3's conversational opener is the differentiator that resolves the "looks identical once arrived" complaint.

### Reuse
Entire topic detail screen, `deriveStudyCTA`, e2e flow `topic-detail-adaptive-buttons.yaml` — all unchanged.

---

## 3. Relearn Flow — First Turn Teaches

### Problem (revised after code audit)
The audit describes "tap retention pill → topic detail → recall test → self-rate → method picker → session" as 3–4 decisions before learning starts. The actual code is already simpler:
- Retention pills (`RetentionPill.tsx`) are visual-only, not pressable.
- Tapping a topic row in Library v3 lands on topic detail; the single adaptive CTA opens a session directly with no intermediate decision screens.
- The standalone recall-test screen (`/(app)/topic/recall-test`) is reached **only** from (a) onboarding curriculum review and (b) push notifications — **not** from the relearn-from-library path.
- Self-rating and method-picker screens are part of the (deferred) original relearn UX, not on the live relearn path today.

The remaining real gap: a learner who taps "Review this topic" from topic detail enters a chat that looks visually identical to a fresh learning session for the first turn — the mentor doesn't signal that this is review vs. fresh learning. There's no conversational calibration probe today; SM-2 schedules a review session, but the session opener is generic.

### Resolution
Add a conversational calibration probe to the **review-mode session opener**, and feed the learner's first substantive answer back into the existing retention-scoring pipeline:

- Tap "Review this topic" from topic detail → opens session in `mode=review` (after Q1 rename) → mentor opens with a calibration question instead of a generic learning opener.
- Examples of the new opener (final wording in prompt files):
  - *"Last time we worked on X — what comes to mind when you think of Y?"*
  - *"Walk me through what you remember about Z."*
- The learner's **first substantive answer** (more than a one-word non-answer like "idk" or "no") is routed through `evaluateRecallQuality` (LLM 0–5 grader, `apps/api/src/services/retention-data.ts:123`) — the **same** function used by the dedicated recall-test screen today. If the first answer is non-substantive, the orchestrator may extend the calibration window by one more turn before falling back to existing prior `retention_cards` state. The resulting quality score feeds `processRecallResult` (`apps/api/src/services/retention.ts:74`) → updates `retention_cards` exactly as the dedicated recall-test endpoint does today.
- Mastery score (`calculateMasteryScore('recall', quality / 5)`), XP transitions (pending → verified), parent "Understanding" feed, retention pills, topic stability, EVALUATE eligibility — **all keep working with no schema or downstream changes.**

### Reuse
- **No new scoring infrastructure.** The conversational diagnostic feeds the same `evaluateRecallQuality` → `processRecallResult` → `retention_cards` pipeline.
- The 24-hour anti-cramming cooldown (`canRetestTopic`) continues to apply atomically — calling the diagnostic from a session does not bypass it.
- **The standalone recall-test screen stays.** It is reached from onboarding curriculum review and push notifications; removing it would break those entry points. The conversational diagnostic is *additive* — it adds review-mode session calibration without removing the dedicated screen used by other flows.
- The teaching-preference service (`getTeachingPreference`, `setTeachingPreference`) is unchanged.

### New Code Surface
- A **session-orchestrator hook** in the review-mode flow that:
  1. Identifies the first substantive learner answer (or, if the first is non-substantive, the next turn) as the calibration response.
  2. Calls `evaluateRecallQuality` with that answer plus the topic title.
  3. Calls `processRecallResult` with the resulting quality score, then proceeds with normal session flow.
- Prompt updates to the review-session opener so the mentor reliably asks a calibration question on turn 1.

---

## 4. Filing Prompt

### Problem
Today, freeform and homework sessions show an opt-in modal at session end ("Add to library? Yes / No thanks"). Other session types (guided, practice, relearn, recitation-with-topic) do not. Learners read this as random.

### Resolution
**No code change.** The current pattern is more thoughtful than it appears:
- Scoped sessions skip the modal because the topic linkage is implicit at session start; there is nothing to ask.
- Unscoped sessions (freeform, homework) gate the modal on `session-depth.ts` LLM-evaluated meaningfulness (`apps/api/src/services/session/session-depth.ts`), so the modal only appears when the session produced filable content.

This spec documents the rule so reviewers and future contributors stop reading the inconsistency as a bug:

> **Filing-prompt rule:** The "Add to library?" modal appears only on freeform and homework sessions, only when the session-depth evaluation marks the session as `meaningful: true`. Scoped sessions are implicitly filed by their existing topic linkage. The opt-in default ("No thanks" leaves the session unfiled) is intentional.

### Reuse
Entire filing pipeline is unchanged: `routes/filing.ts`, `services/filing.ts`, `learningSessions.filedAt`, `filing-stranded-backfill`, `filing-completed-observe`, `filing-timed-out-observe`, `session-depth.ts`.

---

## 5. Verification Overlay Transitions

### Problem
Devil's Advocate (`evaluate`) and Feynman (`teach_back`) are activated by SM-2 internally. From the learner's view, the mentor abruptly changes personality mid-conversation. The flows doc does not specify a transition moment; the actual user experience is "the mentor became someone else."

### Resolution
Add a **one-line conversational preamble** to the LLM prompts that drive each verification mode. The mentor itself signals the mode shift in-conversation rather than an out-of-band UI element.

Examples (final wording is for the implementer to tune in the prompt files):
- **Devil's Advocate:** *"Quick check — let me try to trip you up. Here's how I'd explain it..."*
- **Feynman:** *"Want to try something? Pretend I haven't learned this yet — explain it to me..."*

### Reuse
No new UI. No envelope changes. Pure prompt-side change, scoped to the prompt files for the two verification modes (search `apps/api/src/services/**/*-prompts.ts` for the existing prompt strings).

### Eval Coverage
Because the change is prompt-only, the eval harness (`pnpm eval:llm` and `pnpm eval:llm --live`) must be updated to cover that the preamble appears reliably on turn-1 of each verification mode. Add a snapshot scenario per mode and a Tier-2 schema check that the response begins with a transition phrase.

---

## Out of Scope

- The "topic detail launchpad for activities" idea (offering Quiz / Dictation as topic-scoped entry points from topic detail) is **deferred** — that's a feature, not a polish. Keep on backlog for after Library v3 settles.
- Full Library v3 redesign work — already shipped (PR #144).
- Onboarding flow changes — covered separately in the audit doc.
- Devil's Advocate / Feynman trigger logic — untouched. Only the in-conversation transition changes.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Review session — calibration parse fails | LLM returns unparseable response, or `evaluateRecallQuality` throws | Session continues normally; SM-2 state is **not** updated for this turn | Existing fallback in `evaluateRecallQuality` returns a length-based heuristic 0–5 score; if even that fails, the catch returns a heuristic score. Retention card is updated with the heuristic; lossless from the learner's view. |
| Review session — learner gives a non-answer ("idk") | Quality score → 0 or 1 from grader | Mentor receives the signal and pivots into re-teaching; retention card records a failure | Existing SM-2 logic handles low-quality recall; no UX recovery needed. |
| Review session — learner skips the calibration window (one-word answer, then drives the conversation) | Calibration window closes without enough signal | System falls back to existing prior `retention_cards` state for SM-2 scheduling | Acceptable degradation. Next review will retry calibration. |
| Verification overlay preamble is dropped by LLM | Prompt change does not consistently produce the preamble | Learner sees the abrupt transition (current behavior) | Eval harness Tier 2 catches drift; tune prompt. Acceptable in short-term because we are no worse than today. |
| `mode=practice` → `mode=review` rename leaves a stale reference | Missed one of the three call sites in the rename PR | Type errors at build time (TypeScript narrows the union); runtime: button taps but session opens in wrong mode | Forward-only sweep enforced by typecheck. The mode union in `session-types.ts` is the contract — narrowing it (removing `'practice'`) makes any leftover literal a build-time failure. |
| Resumed session has legacy `effectiveMode='practice'` in metadata | Session created before 2026-05-06 rename, resumed after | Same conversation stage and greeting copy as a `'review'` session | Code-side back-compat: `'practice'` is treated as a synonym for `'review'` in `session-types.ts` and the three `sessionModeConfig.ts` greeting maps for one release window. |
| Non-English learner uses native non-answer ("vet ikke", "weiß nicht", "わからない") | `conversationLanguage` is set, learner gives a locale non-answer | Calibration window stays open; no false-positive grade; mentor continues normally | `isSubstantiveCalibrationAnswer(text, conversationLanguage)` consults locale-keyed token sets in `review-calibration.ts`. |
| Two consecutive non-substantive turns close the calibration window without grading | Learner answers "idk" then "no" (or any two non-substantive turns) | Session continues normally; SM-2 state is not updated for this session | `metadata.reviewCalibrationFiredAt` is set with no card movement after attempt 2; next review session retries calibration. |
| Filing rule documentation drifts from code | Code change to `session-depth.ts` thresholds without spec update | Reviewers re-flag filing as "unpredictable" in future audits | Add a pointer comment at the top of `session-depth.ts` referencing this spec section. |

## Implementation Pointers

These are starting points for the implementation plan — the writing-plans step turns these into ordered tasks.

| Decision | Files / services touched (non-exhaustive) |
|---|---|
| Q1 home quick action labels | `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/i18n/locales/*.json` (all 7 locales: en, nb, de, es, pl, pt, ja), e2e flow YAML in `apps/mobile/e2e/flows/` referencing the old labels |
| Q1 mode rename | `apps/mobile/src/app/(app)/topic/[topicId].tsx:215` (the `mode: 'practice'` literal), `apps/mobile/src/components/session/session-types.ts:294` (mode union list), `apps/mobile/src/app/(app)/session/index.test.tsx:813` (test fixture). Verify no API references with `grep -r "'practice'" apps/api/src/`. |
| Q2 topic detail | **No code change.** Documented as resolved by current adaptive-CTA design. |
| Q3 conversational diagnostic | New session-orchestrator hook that calls `evaluateRecallQuality` (`apps/api/src/services/retention-data.ts:123`) and `processRecallResult` (`apps/api/src/services/retention.ts:74`) on turn 1 of review sessions; review-session opener prompt updates in the prompts file. |
| Q4 documentation only | Add a comment at the top of `apps/api/src/services/session/session-depth.ts` referencing the filing-prompt rule in this spec |
| Q5 prompt preambles | `apps/api/src/services/**/*-prompts.ts` for the two verification modes; eval-harness snapshot scenarios |

## Verification

Per `/commit` and `feedback_fix_verification_rules.md`, every behavior change ships with verification:

| Change | Verified by |
|---|---|
| Mode rename `practice → review` | `pnpm exec nx run-many -t typecheck` (build-time enforcement); existing session integration tests pass with new mode value; updated `topic-detail-adaptive-buttons.yaml` e2e asserts the route is hit with the new mode |
| Home quick action labels | Updated component tests + i18n key existence test for each new label |
| Q2 topic detail | `N/A: no code change` |
| Review session conversational diagnostic | Integration test that posts a review session, simulates a turn-1 learner answer, and asserts a `retention_cards` row update with the expected `easeFactor` / `repetitions` movement (using existing `processRecallTest` integration test as a template) |
| Verification preamble | Eval harness Tier-2 scenario per overlay mode asserting the response begins with a transition phrase |
| Filing rule documentation | `N/A: doc-only change` |

---

## Implementation Sequencing (recommended)

1. **Q1 mode rename** (`practice` → `review`) — small mechanical change (3 files), but unblocks Q3 by ensuring the review-mode session orchestrator targets the right mode key.
2. **Q1 home labels** + **Q5 prompt preambles** in parallel — both are small, isolated changes.
3. **Q3 conversational diagnostic** — the only meaningful new behavior. Lands after Q1 mode rename so the orchestrator hooks into the renamed `mode=review`.
4. **Q4** — doc-only, can ship at any point.
