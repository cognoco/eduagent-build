---
name: Coaching cards removed from home screen (2026-04-08)
description: Coaching cards removed from home screen per design spec. Commits d9d3413 + bfdf412. BaseCoachingCard component still exists but used only as card styling in dashboard/onboarding. Multi-card decision is moot.
type: project
---

**Status: REMOVED (2026-04-08)**

Coaching cards were removed from the home screen per design spec:
- `d9d3413 fix(mobile): remove coaching cards from home screen per design spec`
- `bfdf412 chore(mobile,api): remove coaching card artifacts from codebase`

The home screen now uses intent-driven cards (IntentCard, LearnerScreen, ParentGateway) instead of coaching cards.

`BaseCoachingCard` component still exists and is used as a styling wrapper in dashboard and onboarding interview screens (the `bg-coaching-card` CSS class). These are card styling uses, not the original coaching card system.

**LearnerScreen intent card copy (confirmed 2026-04-12):**
- Primary card: title `"Start learning"`, **no subtitle**. `useContinueSuggestion` not called from LearnerScreen. The dynamic subtitle ("Start a fresh session" / "Continue with X in Y") was removed on the `bugfix` branch — user explicitly preferred title-only.
- "Help with assignment?" and "Repeat & review" cards unchanged.
- "Continue where you left off" resume card (session recovery marker) is unaffected.

**Why:** The adaptive home screen (12.7) replaced coaching cards with intent-driven navigation.

**How to apply:** Do not re-introduce coaching cards on the home screen. Do not add a subtitle to the "Start learning" primary card. If card-style UI is needed elsewhere, `BaseCoachingCard` is available as a styling component.
