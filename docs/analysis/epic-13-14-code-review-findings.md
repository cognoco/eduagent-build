# Epic 13 + Epic 14 Code Review Findings

Date: 2026-04-02
Source: extracted from the retired mixed gap-analysis document on 2026-04-02

## Status

This is a review snapshot, not an active gap tracker.

## Main open areas

### 1. Parent-facing duration still uses the internal active-time metric in places

- The review flagged parent dashboard/session surfaces that still preferred `durationSeconds` instead of Epic 13's user-facing `wallClockSeconds`.

### 2. Session recovery markers are still global instead of profile-scoped

- The stored recovery marker was called out as a single shared key, which risks one learner or parent clearing another learner's resumable session.

### 3. Homework prompts still mix the new Epic 14 guidance with the older Socratic-only escalation rule

- The review noted contradictory prompt instructions between homework session guidance and escalation guidance.

### 4. Session quick chips and message feedback can still be tapped while a reply is streaming

- That was flagged as a misleading state because the UI can confirm the action even when no follow-up can reach the model during the in-flight turn.

### 5. Quick-chip / feedback telemetry is still stored as generic `system_prompt` events

- The review expected dedicated `quick_action` and `user_feedback` session event types, but found only generic prompt/flag storage.

## Notes

- Epic 13 milestone tracking, celebration queue wiring, and session summary flow were already assessed as materially present.
- Epic 14 add-topic, ambiguous-subject "Something else", multi-problem homework flow, and homework summary extraction were already assessed as materially present.
