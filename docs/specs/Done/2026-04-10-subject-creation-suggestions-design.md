# SUBJECT-01: Subject Creation Starter Suggestions

**Date:** 2026-04-10
**Status:** Approved
**Finding:** `flow-improvements.md` SUBJECT-01

## Problem

The subject creation screen (`create-subject.tsx`) opens with a blank `TextInput` and the placeholder "e.g. Calculus, World History, 'learn about ants'..." The only guidance is one paragraph of instructional copy. First-time users who don't have a specific subject in mind face blank-page paralysis.

The resolve system (`POST /subjects/resolve`) is powerful for disambiguation but requires the user to type something first.

## Solution

### 1. Starter suggestion chips

Add a row of tappable suggestion chips below the text input, visible only when the input is empty (chips disappear as the user starts typing). Chips pre-fill the text input on tap, then the user can submit or edit.

**Static chip list (no API call needed):**

```
Math · Science · English · History · Spanish · Geography · Art · Music · Programming
```

These cover the most common school subjects. The list is intentionally short (9 items, wrapping to 2 rows max) to avoid overwhelming.

**Why static, not AI-generated:** Dynamic suggestions would require an API call on screen mount, adding latency to a screen that should feel instant. The placeholder text already provides creative examples. The chips serve a different purpose — reducing the "what can I even type here?" anxiety.

### 2. "Your subjects" quick section (returning users)

When the user already has subjects (`useSubjects()` returns non-empty), show a small section above the chips:

- Header: "Or continue with"
- Horizontal scroll of existing subject pills (name only, tappable)
- Tapping one navigates directly to that subject's learning flow (skips creation entirely): `router.push('/(app)/library/{subjectId}')`

This handles the case where a returning user opens subject creation from the home card but actually wanted to continue an existing subject.

### 3. Broader category entry point

Below the chips, add a subtle text link: "Not sure? Just describe what interests you — like 'I want to understand how plants grow'"

This reinforces that the input accepts natural language, not just formal subject names. It's copy-only, no new component needed.

## Scope Exclusions

- **AI-powered subject recommendations** — deferred. Would require user profile analysis, adds latency, and first-time users have no history to recommend from.
- **Popular/trending subjects** — requires usage analytics infrastructure. Not justified for launch.
- **Category browsing screen** — too much UI for the current need. Chips are sufficient.

## Files Touched

- `apps/mobile/src/app/create-subject.tsx` — suggestion chips, returning-user section, descriptive copy
- `apps/mobile/src/app/create-subject.test.tsx` — tests for chip tap behavior, returning-user section visibility

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Chip tapped but resolve fails | Network error during `POST /subjects/resolve` | Same error handling as manual input | Retry or edit text |
| Existing subjects slow to load | `useSubjects` query pending | Chips visible, "Your subjects" section not shown until loaded | No flash — section appears when ready |
| All subject chips feel wrong | User's interest isn't in the list | Text input is still primary, chips are supplementary | Type freely, placeholder guides natural language |
