# Epics vs Code Gap Analysis

Date: 2026-04-02
Updated after a verification pass against the current codebase and a learner-session agency control update.

## Scope and method

- `docs/epics.md` was used as the expected-state guide.
- Findings below are based on implemented code in `apps/mobile`, `apps/api`, and `packages/*`, plus targeted tests where useful.
- Negative gap = the epic/story expectation is still missing, only partially wired, or implemented with a materially different architecture than the stories describe.
- Positive gap = the codebase is already ahead of the stories/status notes, so the docs should be updated to match reality.
- This is still a summary document, not a line-by-line acceptance-criteria audit of every story in `epics.md`.

## Executive summary

The previous draft overstated several learner-facing gaps. After re-checking the code, the mobile app already has:

- a ranked 2-3 card learner home surface with dismiss controls
- in-session parking lot UI
- Learning Book multi-subject browsing plus pause/resume/archive/restore controls
- a learner-facing "Why this order?" flow in curriculum review

The learner session surface is also stronger now than it was in the prior draft. It has per-message feedback, contextual quick chips (`I know this`, `Explain differently`, `Too easy`, `Too hard`, plus hint/example), a topic-switch sheet, parking lot access, and a visible `Guided` / `Independent` badge.

The biggest remaining negative gaps are now narrower than before:

- Epic 12 home-card architecture is still client-side rather than API-backed
- Epic 14 session-agency parity is close, but not fully story-complete
- OpenAI OAuth is still absent from auth flows

## Remaining negative gaps

### 1. Home cards are implemented in mobile UX, but Epic 12 backend parity is still missing

- Epic expectation: Epic 12 Story 12.7 and Epic 14 Story 14.1 expect `precomputeHomeCards(profileId)`, `GET /v1/home-cards`, server-ranked cards, and dismissal/tap telemetry feeding the ranking model.
- Code evidence:
  - `apps/mobile/src/app/(learner)/home.tsx` builds and ranks multiple learner home cards (`resume_session`, `review`, `study`, `homework`, `ask`, `restore_subjects`) and renders the top 3.
  - `apps/mobile/src/components/coaching/HomeActionCard.tsx` provides the dismiss affordance.
  - `apps/mobile/src/lib/home-card-dismissals.ts` persists dismissal counts per profile in SecureStore, and `home.tsx` deprioritizes cards after 3 dismissals.
  - The API still exposes the older single-card model in `apps/api/src/services/coaching-cards.ts` and `apps/api/src/routes/coaching-card.ts`.
  - No server-side `precomputeHomeCards()`, `/home-cards`, `home_card_tap`, or `home_card_dismiss` event was found.
- Assessment: Partial negative gap. The learner-facing UX exists, but the Epic 12 architecture and telemetry model are not fully implemented.

### 2. Session agency is mostly implemented, but not yet a perfect Story 14.5-14.8 match

- Epic expectation: Epic 14 Phase C calls for per-message feedback, contextual quick chips, topic switching, and visible guidance mode controls.
- Code evidence:
  - `apps/mobile/src/app/(learner)/session/index.tsx` now includes:
    - contextual quick chips under the latest AI message
    - per-message feedback (`Helpful`, `Not helpful`, `That's incorrect`)
    - `switch topic` and `park it` session tools
    - learner-side `Guided` / `Independent` badge with an explanation dialog
    - incorrect-answer flagging through `useFlagSessionContent`
  - `apps/api/src/routes/sessions.ts` and `apps/api/src/services/session.ts` already support `system-prompt` recording and message flagging.
- Remaining differences from the stories:
  - topic switching still uses `router.push()` into a fresh session route rather than resetting in place on the same screen
  - no explicit "Wrong subject" chip appears after suspected misclassification
  - feedback/chip confirmation is implicit rather than a dedicated toast pattern
- Assessment: Medium-confidence partial gap. This is no longer a broad missing-feature gap; it is now a smaller parity/polish gap.

### 3. OpenAI OAuth is still not implemented in the auth flow

- Epic expectation: FR1 lists email/password, Google OAuth, Apple Sign-in, and OpenAI OAuth.
- Code evidence:
  - `apps/mobile/src/app/(auth)/sign-in.tsx` and `apps/mobile/src/app/(auth)/sign-up.tsx` implement email/password, Google, and Apple flows.
  - No learner-mobile OpenAI OAuth UI or auth wiring was found.
- Assessment: Still a likely negative gap, but lower confidence as a build priority because later compliance/App Store notes in `epics.md` still make the long-term OAuth direction ambiguous.

## Resolved or stale findings from the previous draft

These were previously listed as negative gaps, but the codebase already implements them.

### 1. Multi-card learner home screen and dismissal already exist

- `apps/mobile/src/app/(learner)/home.tsx`
- `apps/mobile/src/components/coaching/HomeActionCard.tsx`
- `apps/mobile/src/lib/home-card-dismissals.ts`

The remaining gap is architectural parity with Epic 12, not absence of the learner-facing feature.

### 2. Parking lot is already surfaced in learner mobile UX

- `apps/mobile/src/app/(learner)/session/index.tsx`
- `apps/mobile/src/hooks/use-sessions.ts`
- `apps/api/src/routes/parking-lot.ts`
- `apps/api/src/services/parking-lot-data.ts`

This is not backend-only anymore. Learners can open a parking lot sheet, save questions, and view parked items during the session.

### 3. Learning Book subject lifecycle is already implemented for multi-subject use

- `apps/mobile/src/app/(learner)/book.tsx`
- `apps/mobile/src/hooks/use-subjects.ts`
- `apps/api/src/routes/subjects.ts`
- `apps/api/src/services/subject.ts`
- `apps/api/src/inngest/functions/subject-auto-archive.ts`

The Learning Book now supports:

- multi-subject browsing with filter tabs
- loading retention data across all subjects via `useQueries`
- learner-side pause, resume, archive, and restore controls
- inactive-subject visibility in the book
- auto-archive infrastructure in the backend

### 4. "Why this order?" is already wired into learner UI

- `apps/mobile/src/app/(learner)/onboarding/curriculum-review.tsx`
- `apps/mobile/src/hooks/use-curriculum.ts`
- `apps/api/src/routes/curriculum.ts`
- `apps/api/src/services/curriculum.ts`

The previous claim that this existed only in API/hooks was stale. Learners can request an explanation from curriculum review and see the response in a modal.

## Positive gaps

These are places where the implementation is ahead of the stories/status notes. The right response is to update the docs, not to remove the feature from code.

### 1. Voice mode is already implemented across session surfaces

- Epic/story baseline: Epic 8 is still framed as deferred / v1.1 in parts of `epics.md`.
- Code evidence:
  - `apps/mobile/src/components/session/ChatShell.tsx`
  - `apps/mobile/src/components/session/VoiceToggle.tsx`
  - `apps/mobile/src/components/session/VoiceRecordButton.tsx`
  - `apps/mobile/src/components/session/VoicePlaybackBar.tsx`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
- Assessment: Positive gap. Voice is implemented with toggle, recording, playback, replay, and speed controls.

### 2. The homework overhaul from Epic 14 is largely implemented

- Epic/story baseline: Epic 14 Phase B is still treated as future work in parts of `epics.md`.
- Code evidence:
  - `apps/mobile/src/app/(learner)/homework/camera.tsx`
  - `apps/mobile/src/app/(learner)/homework/problem-cards.ts`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
  - `apps/api/src/services/exchanges.ts`
  - `apps/api/src/services/homework-summary.ts`
  - `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`
- Assessment: Strong positive gap. The homework flow is far beyond "not started."

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
- Assessment: Positive gap. The advanced verification model is already part of the product implementation.

### 4. Subject creation and curriculum agency are richer than the stories imply

- Epic/story baseline: Epic 14.3 and 14.4 describe add-topic and ambiguous-subject escape hatches.
- Code evidence:
  - `apps/mobile/src/app/create-subject.tsx`
  - `apps/mobile/src/app/(learner)/onboarding/curriculum-review.tsx`
  - `apps/mobile/src/hooks/use-curriculum.ts`
  - `apps/api/src/routes/curriculum.ts`
- Assessment: Positive gap. The implemented experience is richer than the minimum story text.

### 5. Consent is more robust than the baseline consent stories

- Epic/story baseline: the core consent stories focus on request/approve/deny and onboarding gating.
- Code evidence:
  - `apps/api/src/routes/consent-web.ts`
  - `apps/api/src/services/consent.ts`
  - `apps/api/src/routes/consent.ts`
  - `apps/mobile/src/app/consent.tsx`
  - `apps/mobile/src/app/(parent)/child/[profileId]/index.tsx`
- Assessment: Positive gap. The codebase has moved beyond the baseline stories.

### 6. Session lifecycle polish is ahead of the documented baseline

- Epic/story baseline: recovery, wrap-up polish, and fast post-session feedback are treated as later refinements in the docs.
- Code evidence:
  - `apps/mobile/src/app/(learner)/home.tsx`
  - `apps/mobile/src/app/(learner)/session/index.tsx`
  - `apps/mobile/src/app/session-summary/[sessionId].tsx`
  - `apps/api/src/services/session-lifecycle.ts`
- Assessment: Positive gap. Recovery, wrap-up, and celebration handling are more mature than the current epic narrative suggests.

### 7. Celebrations are implemented as a real system, not just a concept

- Epic/story baseline: celebration work is still described in several places as partial or future cleanup.
- Code evidence:
  - `apps/api/src/services/celebrations.ts`
  - `apps/api/src/routes/celebrations.ts`
  - `apps/mobile/src/hooks/use-celebration.tsx`
  - `apps/mobile/src/hooks/use-celebrations.ts`
  - `apps/mobile/src/app/(learner)/more.tsx`
- Assessment: Positive gap. Celebration behavior is already a concrete product capability.

## Recommended doc follow-up

- Update `epics.md` and any PRD/source-of-truth docs to reflect the features that are already live:
  - parking lot learner UI
  - Learning Book subject lifecycle controls
  - learner-facing `Why this order?`
  - current learner session agency controls
  - voice mode
  - homework flow maturity
  - advanced verification
  - consent robustness
  - session lifecycle polish
  - celebrations
- Keep the remaining implementation work focused on:
  - home-surface backend parity (`precomputeHomeCards`, `/home-cards`, tap/dismiss telemetry)
  - final Story 14.5-14.8 parity items
  - OpenAI OAuth product decision and, only if still desired, implementation

## Open question before prioritizing more auth work

- FR1 still mentions OpenAI OAuth, but the compliance/App Store direction in `epics.md` remains murky. That should be resolved at the product level before treating it as a must-build gap.
