---
name: Expo Router treating helper files as routes
description: 10+ non-page files under apps/mobile/app/(app)/ trigger Expo Router "missing default export" warnings because every file in app/ is treated as a route. Violates CLAUDE.md rule "Default exports are only for Expo Router page components."
type: project
---

**Status (2026-04-17):** Real bug, not yet fixed. Surfaced via web preview console warnings.

**Files currently polluting the route tree:**

Under `apps/mobile/app/(app)/homework/`:
- `camera-reducer.ts`
- `problem-cards.ts`

Under `apps/mobile/app/(app)/session/`:
- `SessionAccessories.tsx`
- `SessionFooter.tsx`
- `SessionMessageActions.tsx`
- `SessionModals.tsx`
- `session-types.ts`
- `use-session-actions.ts`
- `use-session-streaming.ts`
- `use-subject-classification.ts`

**Console warning (repeats on every render):**
```
Route "./(app)/session/SessionFooter.tsx" is missing the required default export.
Ensure a React component is exported as default.
```

**Why this is a bug:**
- Expo Router's file-based routing treats every `.tsx`/`.ts` under `app/` as a route candidate.
- These are helpers, reducers, hooks, type files, and subcomponents — not pages.
- Violates `CLAUDE.md`: "Default exports are only for Expo Router page components."
- Each warning fires per-render; console noise hides real issues.

**Also flagged: ghost `<Stack.Screen>` entries**
```
[Layout children]: No route named "assessment" exists in nested children: ...
[Layout children]: No route named "session-summary" exists in nested children: ...
```
A `<Stack.Screen name="assessment" />` is declared somewhere, but the actual file lives at `assessment/index.tsx`. Same for `session-summary` (file at `session-summary/[sessionId].tsx`). Either drop the Stack.Screen declaration or fix the name.

**Fix options:**
1. **Underscore-prefix directories** — move helpers into `app/(app)/session/_components/`, `_hooks/`, etc. Expo Router ignores directories starting with `_`. Minimal move distance, no import path rewrites across the whole codebase.
2. **Move out of `app/` entirely** — into `apps/mobile/src/features/session/` or similar. Bigger refactor, but cleaner separation.

Option 1 is lower-risk for stabilization. Option 2 aligns with most Expo Router examples and is what we'd do in a greenfield.

**How to verify:** Start Expo web (`preview_start mobile` with `.claude/launch.json`) and check browser console. After fix, the "missing required default export" warnings should be zero.
