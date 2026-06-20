## Completion Summary

**What was done:** Replaced the brittle subject-limit recovery that string-matched on the API error message with a typed `SUBJECT_LIMIT_EXCEEDED` error ([SUBJECT-20]), so the mobile create-subject flow keys off a stable typed contract instead of a message regex.

**What changed:** New typed error in `packages/schemas/src/errors.ts`; the API emits it from `apps/api/src/routes/subjects.ts` + `apps/api/src/services/subject.ts`; mobile consumes it in `apps/mobile/src/app/create-subject.tsx`. Coverage updated in `subjects.test.ts`, `subject.test.ts`, and `create-subject.test.tsx`.

**Verification:** All required CI checks SUCCESS on the merged commit; claude-review check green (no blocking findings). The combined-main Deploy passed after merge, confirming no mobile consumer still relied on the old message string (the regression this change exists to prevent). Merged to main via PR #1250 (merge commit b4b1b878c).

**Caveats / Follow-ups:** This is the gating typed-error contract for the create-subject cluster — WI-857 / 858 / 860 / 865 build on it.
