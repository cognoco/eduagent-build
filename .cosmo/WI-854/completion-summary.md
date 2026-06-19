## Completion Summary

**What was done:** Fixed [HOME-15] — pending consent notices were dropped on dashboards with no linked children. The empty-child dashboard path now preserves and renders pending consent notices instead of discarding them.

**What changed:** `apps/mobile/src/hooks/use-dashboard.ts` carries the fix; regression coverage added in `apps/mobile/src/hooks/use-dashboard.test.ts` and `apps/mobile/src/app/(app)/home.test.tsx`.

**Verification:** Red→green regression test that fails without the fix and passes with it. All required CI checks SUCCESS on the merged commit; claude-review verdict APPROVED (0 must-fix / 0 should-fix, read from the review body); CodeRabbit reported no actionable comments. Merged to main via PR #1244 (merge commit 4d6da3368).

**Caveats / Follow-ups:** None. Scoped strictly to the empty-child dashboard consent-notice path; independent of the create-subject cluster ordering.
