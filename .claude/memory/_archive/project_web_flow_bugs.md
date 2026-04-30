---
name: Web flow bug investigation (2026-04-13) — 7 bugs found, all code-level bugs FIXED
description: Expo web flow investigation found multiple independent root causes. WEB-01 (pointer events) FIXED. WEB-02 (bare router.back no-op) FIXED — full sweep complete. WEB-03 (cache shape crash) FIXED. WEB-04 (date picker) FIXED. WEB-07 (solo learner routing) FIXED. WEB-05/06/TEST-01 are stale remote deployment issues.
type: project
---

Investigation date: 2026-04-13. Source: `docs/flows/web-flow-bug-findings.md`.

**Key finding:** Initial symptoms looked like one systemic "web navigation is dead" failure. Live repro showed multiple independent root causes — NOT a global Expo Router or Pressable failure.

## All Code-Level Bugs — FIXED

- **WEB-01:** ParentGateway dropdown pointer events — restructured layout
- **WEB-02:** bare `router.back()` silent no-op — **FULL SWEEP COMPLETE**. `goBackOrReplace` helper applied to all 33 screens. Zero bare `router.back()` in production source.
- **WEB-03:** `books.find is not a function` cache shape crash — normalized cache
- **WEB-04:** Create-profile birth date control on web — web fallback input added
- **WEB-07:** Solo learners routed to "Add your first child" — tier check fixed

## Stale Remote Deployment Issues (not code bugs)

- **WEB-05:** book-suggestions 404 — route exists in repo, stale remote
- **WEB-06:** review-summary 404 — route exists in repo, stale remote
- **TEST-01:** Seed failures on remote — curriculum_topics.book_id constraint, works locally

## Going Forward

When adding new screens, use `goBackOrReplace(router, fallbackHref)` instead of bare `router.back()`. The `screen-navigation.test.ts` recognizes both patterns as valid exit navigation.

**Why:** Web is a secondary platform but the pattern is low-cost and prevents dead-ends on any route that can be deep-linked.

**How to apply:** Check if the screen can be reached via direct URL or `router.replace()`. If yes, use `goBackOrReplace`.
