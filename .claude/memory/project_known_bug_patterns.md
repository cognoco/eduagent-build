---
name: Known systemic bug patterns — silent fallbacks + React state timing gaps
description: Two recurring bug patterns found across the codebase in 2026-04-13 sweep. 20 instances found and fixed. Check for these when reviewing or writing new code.
type: project
---

## Pattern 1: Silent Fallbacks

Code that silently degrades to a "safe" default instead of surfacing an error. Found in API services and mobile query consumers.

**Variants:**
- `?? []` on TanStack Query `.data` — only catches null/undefined, not wrong object shapes. TanStack Query's `select` is bypassed when `enabled=false`, so `.data` can be an unexpected shape. **Fix:** Use `Array.isArray(query.data) ? query.data : []`.
- API/LLM catch blocks returning success-shaped objects (`isAccepted: true`, `status: 'direct_match'`) — masquerades a service failure as a valid result. **Fix:** Return error/no-match status so the UI shows a retry path.
- `void mutateAsync(...)` with no `.catch()` — the user gets no feedback when a mutation fails. **Fix:** Wrap in async handler with Alert.alert on catch.
- Raw LLM response text embedded in fallback strings (`response.slice(0,30)`) — error messages or safety refusals can leak into student-facing UI.

**Why:** Changed in 2026-04-13 sweep. Found 10 instances across summaries.ts, assessments.ts, subject-resolve.ts, subject-classify.ts, library.tsx, shelf/index.tsx, child/mentor-memory.tsx, session-summary.

**How to apply:** When writing any catch block or fallback path, ask: "Does this look like success to the caller?" If yes, it's a silent fallback bug.

## Pattern 2: React State Timing Gaps

`isPending` or `useState` booleans used as concurrency guards but vulnerable to React's async batching. Found in mobile screens with mutation + Alert retry patterns.

**The race:** When a TanStack Query mutation fails, `isPending` resets to `false` before the Alert callback fires. The user can then tap both the Alert "Try again" button AND a re-enabled UI button simultaneously, firing two concurrent mutations.

**Fix:** Add a `useRef(false)` lock alongside the `isPending` check. The ref is synchronous and not subject to React batching:
```ts
const inFlight = useRef(false);
if (mutation.isPending || inFlight.current) return;
inFlight.current = true;
// ... in catch/finally: inFlight.current = false;
```

**Related variant:** `setIsClosing(false)` in a catch block re-enables a button while the error Alert is still visible. **Fix:** Move the state reset into the Alert's button callback instead.

**Why:** Changed in 2026-04-13 sweep. Found in shelf/index.tsx, pick-book, session/index.tsx (handleEndSession), session-summary (handleSubmit + handleContinue).

**How to apply:** Any async handler that (a) checks `isPending` at the top, (b) calls `mutateAsync`, and (c) has an Alert with a retry callback — needs a ref lock. Also check: any `setState(false)` in a catch block that re-enables a button while an Alert is still on screen.
