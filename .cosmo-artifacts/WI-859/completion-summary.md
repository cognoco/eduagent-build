## Completion Summary — WI-859 ([QA-03/04] deterministic chat classifier + subject-picker coverage)

**What was done:** Added deterministic route-layer and mobile coverage for chat
subject classification (QA-03) and the subject-picker / create-new escape hatch
(QA-04), and flipped the QA-03/04 flow rows to jest-closure proof.

**What changed:** `apps/api/src/routes/subjects.test.ts` (+73): proxy-mode 403 guards
on `POST /subjects/classify` and `POST /subjects/resolve`, multi-candidate +
`suggestedSubjectName` schema passthrough end-to-end (QA-03).
`apps/mobile/src/.../session/use-subject-classification.test.ts` (+181): single-subject
auto-match, multi-candidate picker choosing the intended (not first) subject,
resolve-fallback branch. `session/index.test.tsx` (+44): no-enrolled-subjects
create-new escape (QA-04). Flow docs updated; `docs/plans/plan-WI-859.md` added.

**Verification:** Delivered via PR #1252 (author `crowka`), squash-merged to `main`
as `ce8471b28`. `main` branch-protection required checks green at merge; claude-review
CONSIDER finding (plan file location) addressed by moving it under `docs/plans`.

**Caveats / Follow-ups:** Test + doc + plan only; YAML smoke entries kept as
historical/future reference. No follow-ups.
