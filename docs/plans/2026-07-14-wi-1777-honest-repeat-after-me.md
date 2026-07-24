---
title: WI-1777 Honest Repeat-After-Me Rework — Implementation Plan
date: 2026-07-14
profile: code
work_items: [WI-1777]
status: in-progress
---

# WI-1777 Honest Repeat-After-Me Rework — Implementation Plan

**Goal:** Make the MVP speaking-practice slice honestly implement repeat-after-me only, without selecting or advertising unimplemented simultaneous shadowing.
**Approach:** Keep the shipped attempt-persistence and deterministic scoring contracts intact. Narrow only the production activity selector and learner-facing instruction surface, while preserving the schema-level shadowing value for the separately tracked future device-audio implementation.

## Scope

In scope:
- `apps/api/src/services/language-session-engine.ts`
- `apps/api/src/services/language-session-engine.test.ts`
- `apps/mobile/src/components/session/SpeakingPracticeActivity.tsx`
- `apps/mobile/src/components/session/SpeakingPracticeActivity.test.tsx`
- `apps/mobile/src/components/session/SpeakingPracticeCard.tsx`
- `apps/mobile/src/components/session/SpeakingPracticeCard.test.tsx`
- `apps/mobile/src/i18n/locales/*.json`
- `apps/mobile/src/i18n/source-baseline.json`
- Cosmo acceptance criteria and follow-up tracking for `WI-1777`

Out of scope:
- Simultaneous playback and speech recognition
- Native iOS/Android audio-session changes
- Removing the schema or persistence representation for `shadowing`
- Changes to scoring, persistence, ownership scoping, or raw-audio policy

## Tasks

- [ ] T1: Narrow the server selection contract to repeat-after-me — done when a regression test first fails against the alternating selector and then proves all beginner fluency turn indices emit `repeat_after_me` while target sentences still rotate.
- [ ] T2: Remove the misleading shadowing instruction surface — done when mobile tests first fail against the mode-specific UI and then prove live activity rendering always uses the honest repeat-after-me instruction without a shadowing-copy key.
- [ ] T3: Synchronize i18n artifacts — done when the removed key is absent from all locale files and the repository i18n staleness/orphan checks pass with a regenerated baseline.
- [ ] T4: Align Cosmo scope and future work — done when `WI-1777` carries the operator-approved repeat-after-me-only acceptance criteria and true speak-along shadowing exists as a separate captured work item with device-audio concurrency and device-QA scope.
- [ ] T5: Verify and hand off — done when targeted API/mobile tests, type/lint/change-class checks pass; the diff contains only the listed scope; and lifecycle evidence is prepared for normal review.
