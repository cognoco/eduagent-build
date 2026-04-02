# Epics vs Code Gap Analysis

Date: 2026-04-02

## Scope and method

- `docs/epics.md` was used only as the expected-state guide.
- Findings below are based on implemented code in `apps/mobile`, `apps/api`, and `packages/*`, plus tests where useful.
- Negative gap = the epic/story expectation is missing, only partially wired, or backend-only.
- Positive gap = the codebase is already ahead of the stories/status notes, so the PRD and stories should be updated to match reality.
- This is a summary document, not a line-by-line acceptance-criteria audit of every story in `epics.md`.

## Executive summary

The codebase is materially ahead of `epics.md` in several important areas: voice mode, homework flow, advanced verification (`EVALUATE` / `TEACH_BACK`), subject disambiguation, consent robustness, session recovery, and celebrations. In other words, the product surface described in the stories is no longer the full picture of what has actually been built.

The biggest negative gaps are mostly on learner-facing UX wiring rather than core backend capability: the multi-card home model is still not implemented on the mobile surface, several agency controls from Epic 14 are still missing or only partially wired, the parking lot feature is backend-only, and multi-subject / Learning Book behavior is not fully realized in the learner UI.

## Negative gaps

### 1. Home screen is still a single-card model, not the ranked multi-card surface in Epic 12 / Story 14.1

- Epic expectation: Epic 12 Story 12.7 and Epic 14 Story 14.1 describe a ranked 2-3 card home surface with per-card dismissal feeding the ranking algorithm.
- Code evidence:
  - `apps/mobile/src/hooks/use-coaching-card.ts` returns a single card object.
  - `apps/mobile/src/app/(learner)/home.tsx` renders one `AdaptiveEntryCard` / `CoachingCard`.
  - `apps/api/src/services/coaching-cards.ts` has priority logic, but the learner home screen is not consuming a ranked multi-card payload.
  - No `home_card_dismiss` event or equivalent dismissal tracking was found in `apps/mobile/src`, `apps/api/src`, or `packages/database/src`.
- Assessment: High-confidence negative gap. This should be implemented in code; the stories should not be downgraded to match the current single-card behavior.

### 2. Learner session agency controls are still incomplete relative to Epic 14

- Epic expectation: Epic 14 FR218-FR225 includes per-message feedback/flagging, quick-action chips (`I know this`, `Explain differently`, `Too easy`, `Too hard`), topic switching, and a visible guided/independent control model.
- Code evidence:
  - `apps/api/src/routes/sessions.ts` exposes `/sessions/:sessionId/flag`.
  - `apps/mobile/src/components/session/MessageBubble.tsx` shows escalation labels on messages.
  - `apps/mobile/src/app/(parent)/child/[profileId]/session/[sessionId].tsx` explains `Guided` in the parent transcript.
  - No learner-mobile references were found for `not helpful`, `incorrect`, `too hard`, `too easy`, `explain differently`, `switch topic`, or similar quick-chip affordances under `apps/mobile/src`.
- Assessment: Partial implementation only. The code has some backend plumbing and partial visibility, but the learner-facing agency controls described in Epic 14 are not fully present.

### 3. Parking lot exists in API/data layers but is not surfaced in learner mobile UX

- Epic expectation: FR38 expects users to park questions for later exploration during a session.
- Code evidence:
  - `apps/api/src/routes/parking-lot.ts`
  - `apps/api/src/services/parking-lot.ts`
  - `apps/api/src/services/parking-lot-data.ts`
  - `packages/database/src/schema/sessions.ts` includes parking-lot-related storage/events.
  - No corresponding learner-mobile parking-lot UI was found under `apps/mobile/src`.
- Assessment: Backend-only gap. The feature exists in service/data form but is not actually available to learners in the app.

### 4. Learning Book and subject lifecycle are incomplete for multi-subject use

- Epic expectation: FR67 and FR79-FR85 describe Learning Book across all past topics, subject switching, and pause/resume/archive/restore flows.
- Code evidence:
  - `apps/mobile/src/app/(learner)/book.tsx` only loads retention data for the first three subjects via fixed `first`, `second`, and `third` hooks.
  - `packages/database/src/schema/subjects.ts` supports `active`, `paused`, and `archived`.
  - `apps/api/src/services/subject.ts` supports archive/auto-archive behavior.
  - No learner-mobile UI was found for pausing, archiving, resuming, or restoring subjects.
- Assessment: High-confidence negative gap. The backend/data model is ahead of the learner UI here, and the current Learning Book implementation does not scale cleanly beyond three subjects.

### 5. "Why this order?" exists in API/hooks but is not wired into learner UI

- Epic expectation: FR17 says users can request an explanation for curriculum sequencing.
- Code evidence:
  - `apps/api/src/routes/curriculum.ts`
  - `apps/api/src/services/curriculum.ts`
  - `apps/mobile/src/hooks/use-curriculum.ts` exports `useExplainTopic`.
  - No learner screen was found calling `useExplainTopic`.
- Assessment: Partial / backend-only gap. The capability exists, but the learner-facing affordance appears missing.

### 6. OpenAI OAuth is not implemented in auth flows

- Epic expectation: FR1 lists email/password, Google OAuth, Apple Sign-in, and OpenAI OAuth.
- Code evidence:
  - `apps/mobile/src/app/(auth)/sign-in.tsx` and `apps/mobile/src/app/(auth)/sign-up.tsx` implement Google and Apple SSO, plus email/password.
  - No OpenAI OAuth UI or auth wiring was found in the mobile auth flow.
- Assessment: Likely negative gap, but lower confidence than the items above because `epics.md` also contains later App Store/compliance notes that may affect long-term OAuth direction. This needs a product decision before code work is prioritized.

## Positive gaps

These are places where the implementation is ahead of the current stories/status notes. The right response is to update the PRD and stories, not to remove the feature from code.

### 1. Voice mode is already implemented across session surfaces

- Epic/story baseline: Epic 8 is still framed as deferred / v1.1 in parts of `epics.md`.
- Code evidence:
  - `apps/mobile/src/components/session/ChatShell.tsx`
  - `apps/mobile/src/components/session/VoiceToggle.tsx`
  - `apps/mobile/src/components/session/VoiceRecordButton.tsx`
  - `apps/mobile/src/components/session/VoicePlaybackBar.tsx`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
- Assessment: Positive gap. Voice is not just partially scaffolded; it is implemented with toggle, recording, playback, replay, and speed controls.

### 2. The homework overhaul from Epic 14 is largely implemented

- Epic/story baseline: Epic 14 Phase B is still treated as not started / future work in parts of `epics.md`.
- Code evidence:
  - `apps/mobile/src/app/(learner)/homework/camera.tsx` supports camera capture, OCR, retry, fallback, editable problem cards, and subject classification.
  - `apps/mobile/src/app/(learner)/homework/problem-cards.ts` supports multi-problem metadata.
  - `apps/mobile/src/app/(learner)/session/index.tsx` supports `Next problem`, `Help me solve it`, and `Check my answer`.
  - `apps/api/src/services/exchanges.ts` contains homework-specific prompting aligned with FR228.
  - `apps/api/src/services/homework-summary.ts` extracts structured homework learning summaries.
  - Parent-facing homework summaries appear in `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`.
- Assessment: Strong positive gap. The stories and PRD should be updated to reflect that the homework flow is far beyond "not started."

### 3. Advanced verification is already live in the codebase

- Epic/story baseline: `EVALUATE`, `TEACH_BACK`, and analogy-domain preferences are still treated as extensions or future-facing in the story set.
- Code evidence:
  - `apps/api/src/services/evaluate.ts`
  - `apps/api/src/services/evaluate-data.ts`
  - `apps/api/src/services/teach-back.ts`
  - `apps/api/src/services/verification-completion.ts`
  - `packages/database/src/schema/assessments.ts`
  - `apps/mobile/src/app/(learner)/onboarding/analogy-preference.tsx`
  - `apps/mobile/src/app/(learner)/subject/[subjectId].tsx`
- Assessment: Positive gap. The advanced verification model is already part of the product implementation and should be reflected in the source-of-truth docs.

### 4. Subject-creation and curriculum agency are richer than the current stories imply

- Epic/story baseline: Epic 14.3 and 14.4 describe add-topic and ambiguous-subject escape hatches.
- Code evidence:
  - `apps/mobile/src/app/create-subject.tsx` includes ambiguous-subject clarification, `Something else`, and `Just use my words`.
  - `apps/mobile/src/app/(learner)/onboarding/curriculum-review.tsx` includes skip, restore, challenge, and add-topic flows.
  - `apps/mobile/src/hooks/use-curriculum.ts`
  - `apps/api/src/routes/curriculum.ts`
- Assessment: Positive gap. The stories should be updated to reflect the richer implemented experience, not just the minimum accepted behavior.

### 5. Consent is more robust than the baseline consent stories

- Epic/story baseline: the core consent stories focus on request/approve/deny and onboarding gating.
- Code evidence:
  - `apps/api/src/routes/consent-web.ts` provides a dedicated web consent flow and deny-confirmation step.
  - `apps/api/src/services/consent.ts` cascade-deletes the child profile on denied consent.
  - `apps/api/src/routes/consent.ts` supports revoke and restore with a 7-day grace period.
  - `apps/mobile/src/app/consent.tsx` provides the child-to-parent handoff flow.
  - Parent controls are surfaced in `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`.
- Assessment: Positive gap. The code has moved beyond the baseline stories and the docs should catch up.

### 6. Session lifecycle polish is ahead of the documented baseline

- Epic/story baseline: recovery, wrap-up polish, and fast post-session feedback are treated as secondary or later refinements in the docs.
- Code evidence:
  - `apps/mobile/src/app/(learner)/home.tsx` shows a recovery card (`Pick up where you left off?`).
  - `apps/mobile/src/app/(learner)/session/index.tsx` handles recovery markers, resumed state, wrap-up, and a fast celebration fetch before navigation.
  - `apps/mobile/src/app/session-summary/[sessionId].tsx` renders fast celebrations.
  - `apps/api/src/services/session-lifecycle.ts` implements session-lifecycle behavior.
- Assessment: Positive gap. The actual session lifecycle is more mature than the current epic narrative suggests.

### 7. Celebrations are implemented as a real system, not just a concept

- Epic/story baseline: celebration work is still described in several places as partial or future cleanup.
- Code evidence:
  - `apps/api/src/services/celebrations.ts`
  - `apps/api/src/routes/celebrations.ts`
  - `apps/mobile/src/hooks/use-celebration.tsx`
  - `apps/mobile/src/hooks/use-celebrations.ts`
  - `apps/mobile/src/app/(learner)/more.tsx` exposes celebration-level settings.
- Assessment: Positive gap. Celebration behavior is already a concrete product capability and the docs should describe it as such.

## Recommended doc follow-up

- Update `prd.md` and `epics.md` to reflect the positive gaps above, especially voice mode, homework flow maturity, advanced verification, consent robustness, and session lifecycle polish.
- Keep the negative gaps as implementation work, not documentation edits.
- Treat Epic 14 learner-agency work, Epic 12 multi-card home, and Epic 4 multi-subject / Learning Book completion as the clearest remaining product-surface gaps.

## Open question to resolve before prioritizing work

- FR1 includes OpenAI OAuth, but later compliance/app-store notes in `epics.md` complicate the long-term OAuth direction. That should be resolved at the product level before treating OpenAI OAuth as a must-build gap.
