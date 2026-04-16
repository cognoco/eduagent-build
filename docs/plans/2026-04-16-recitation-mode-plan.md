# Recitation Mode — Design Note

**Status:** Beta (in progress, uncommitted)
**Date:** 2026-04-16

## Purpose

Recitation mode lets learners practice reciting memorised text — poems, song lyrics, multiplication tables, or other content — and receive AI feedback on accuracy, clarity, and delivery.

## User Flow

1. Learner taps "Recite" on the Practice screen.
2. Session opens with a prompt: "What would you like to recite?"
3. Learner says or types the title/description.
4. AI acknowledges and says it's ready to listen.
5. Learner recites from memory (voice or text).
6. AI provides feedback: quotes clear parts, notes missing/garbled sections, comments on delivery.
7. Learner can try again or end the session.

## Implementation Summary

| Layer | Changes |
|-------|---------|
| **Mobile — Practice screen** | New "Recite" IntentCard navigating to `/(app)/session` with `mode: 'recitation'` |
| **Mobile — Session mode config** | `recitation` entry with title, placeholder, opening messages for first/early/familiar sessions |
| **Mobile — Session types** | `recitation` added to conversation stage skip list (enters `teaching` stage immediately) |
| **API — System prompt** | Dedicated recitation prompt section in `buildSystemPrompt`. Disables: escalation ladder, curriculum scope boundaries, cognitive load management, knowledge capture, partial progress. Enables: listen-and-feedback flow |
| **API — Session exchange** | `effectiveMode` passed through `ExchangeContext` |

## Design Decisions

- **No teaching ladder:** Recitation is about recall, not learning new material. The escalation system is skipped.
- **No curriculum scoping:** Poems and songs are inherently cross-topic; scope boundaries would be counterproductive.
- **Beta label:** Feature is experimental. Title shows "(Beta)" in the session header.
- **Reuses existing session infrastructure:** No new routes, screens, or DB tables. Recitation is a mode variant of the standard session.

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| AI doesn't recognise the text | Obscure poem/text | "I don't recognise this text, but I can still give feedback on clarity" | AI adapts to delivery-only feedback |
| Voice recognition poor | Background noise | Garbled transcript | User can type instead |
| Session timeout | Idle > 30min | Standard session timeout | Start new session |
