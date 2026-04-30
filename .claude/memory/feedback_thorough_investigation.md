---
name: Thorough codebase investigation — never take shortcuts
description: When analyzing implementation status or searching for code, use multiple search strategies exhaustively — never declare something missing based on a single grep pattern
type: feedback
---

When investigating whether something is implemented, NEVER rely on a single grep pattern. Search exhaustively using multiple strategies before concluding something is missing.

**Why:** Searched for `session/analyze-learner` to find Epic 16's analysis pipeline and concluded it was "~20% done" — when it was actually ~85% done. The function was named `analyzeSessionTranscript` in `learner-profile.ts` and registered as a step called `'analyze-learner-profile'` inside `session-completed.ts`. A single narrow grep missed the entire feature because the naming didn't match assumptions.

**How to apply:**
1. Start broad: search for the *concept* (multiple synonyms, partial matches), not just one expected name
2. Search for related schema/types (if the table exists, something writes to it — find what)
3. Follow import chains: if a schema exists, grep for who imports it
4. Check Inngest functions, route files, AND service files — features span all three
5. Search mobile screens too (routes, hooks, components)
6. When a grep returns "no files found", that means your *pattern* is wrong — try different terms before concluding the code doesn't exist
7. NEVER declare an implementation percentage until you've confirmed from at least 3 independent search angles
8. This applies to ALL codebase analysis: spec audits, bug investigations, refactoring scope assessments
