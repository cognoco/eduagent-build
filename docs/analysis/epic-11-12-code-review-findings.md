# Epic 11 + Epic 12 Code Review Findings

Date: 2026-04-02
Source: extracted from the retired mixed gap-analysis document on 2026-04-02

## Status

This is a review snapshot, not an active gap tracker.

## Main open areas

### 1. Fixed-brand theming is still incomplete

- Persona defaults and accent presets still influence the mobile shell.
- Parent More still exposes persona switching and accent selection.

### 2. Route merge / persona-free navigation is still incomplete

- Separate `(learner)` and `(parent)` route groups still exist.
- Several auth and consent deep links still target the older split-shell structure.

### 3. `personaType` and `birthDate` are still first-class compatibility fields

- Schema, API, factories, seed data, and profile creation still rely on legacy persona/birth-date fields.
- Epic 12's zero-hit cleanup target is not yet met.

### 4. Client-side consent gating still disagrees with the server rule

- The client checks exact age `< 16`, while the server uses the conservative birth-year rule and can require consent for learners who are 16 this calendar year.

### 5. Home cards are live, but the Epic 12 migration is still partial

- `/home-cards` and interaction posting exist.
- Remaining architectural gaps called out in the review were parent-intent cards, event-pipeline parity, and legacy cache/storage cleanup.

## Notes

- The earlier claim that `/v1/home-cards` was missing is stale; the route exists.
- Epic 12.1's age-based voice refactor was already assessed as materially present.
