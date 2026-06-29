**What was done:**
Fixed the GC1 Pattern-A guard so newly added multiline typed `jest.mock<typeof import(...)>(...)` calls are detected instead of slipping past the diff scanner.

**What changed:**
Updated `scripts/check-gc1-pattern-a.ts` to parse staged TypeScript source with the TypeScript AST when available, while preserving the existing diff-only fallback and `gc1-allow` handling. Added regression coverage in `scripts/check-gc1-pattern-a.test.ts`.

**Verification:**
Pushed commit `2d1415d8c700528d2f47003cffbdeef89b6a3434` on branch `WI-323`. Worker verification reported: red reproduction confirmed for typed multiline `jest.mock`; focused GC1 guard suite passed `23/23`; staged GC1 guard command passed; `lint-staged` passed; focused TypeScript check passed; pre-push validation passed including incremental `tsc --build`. Coordinator review confirmed the diff is limited to the guard and its regression test.

**Caveats / Follow-ups:**
Coordinator could not reproduce the focused Jest command via direct CLI selector because this worktree's Jest discovery did not match script tests, but the pre-commit guard command and hook path were reported green and the pushed diff is scoped. No PR was created in this step.
