# WI-2009 — committed-write/lost-ack retry evidence

Date: 2026-07-20

## Scope and root cause

The PM-ratified guarantee is deliberately narrow: a retrieval-event write has
committed, but Inngest lost the completion acknowledgement for the combined
grade-and-record step. Before this correction, replay had no durable signal
that the write already existed, so it invoked the paid grader again and wrote
another UUID-keyed history row.

The correction reuses the existing committed `retrieval_events` row as the
only receipt in scope. `learnerMessageEventId` is its deterministic primary
key. A profile-scoped lookup validates the session, topic, answer-event, and
stored result shape before any transcript rehydration or paid grading. Insert
conflicts reload that same scoped canonical row. This adds no table, migration,
workflow payload, or external response field.

Two simultaneous first executions may both miss before primary-key
arbitration and both reach the paid boundary. That is outside the ratified
committed-write/lost-ack sequence; broader pre-commit idempotency design is
captured separately in WI-2513.

## Executed RED → GREEN

The integration fixture uses `@inngest/test`, the production Inngest function,
and a real database. Its only double is the external paid LLM provider. It
executes and retains the load and cooldown-claim checkpoints, executes the
grade/write step, verifies the database row committed, removes only the final
grade-step checkpoint, then replays that step with a fresh engine.

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs --runTestsByPath apps/api/src/inngest/functions/review-calibration-grade.integration.test.ts --runInBand --no-coverage --detectOpenHandles
```

Against unchanged production, both the graded and fallback variants exited 1:
the assertion expected one paid boundary call and received two. With the
deterministic committed-row lookup and idempotent insert, the same command
exited 0 for both variants.

For the production-revert check, only these production files were restored to
their baseline bytes while the new integration fixture remained:

- `apps/api/src/inngest/functions/review-calibration-grade.ts`
- `apps/api/src/services/retrieval-events.ts`
- `packages/database/src/repository.session.ts`

The same command again exited 1 with two paid calls in both variants.
Restoring the production correction returned the command to exit 0. This
isolates the replay fixture's dependency on the production change.

## Acceptance-criteria mapping

- AC-1 — the exact lost-ack replay variants demonstrate that a committed
  graded or fallback row is recognized before `evaluateRecallQuality`; one
  paid boundary call spans the original execution and replay. No pre-commit
  failure behavior is claimed.
- AC-2 — each replay variant queries the real database after replay and
  observes one row. The fallback result recomputes the existing EU-7 cap with
  profile/topic scoping, strict `lt(createdAt, eventAt)`, descending order,
  and the current receipt ID excluded defensively. The real-database
  retrieval-event suite separately exercises deterministic insert conflict.
- AC-3 — replay returns only the structured graded/fallback decision. The
  committed graded row retains `rubricRationale`, `misconception`, and routing
  rung; fallback retains null structured fields and the heuristic marker. The
  diff introduces no schema, migration, event-payload, or external-contract
  file.

## Final verification on current main

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs --runTestsByPath apps/api/src/inngest/functions/review-calibration-grade.integration.test.ts --runInBand --no-coverage --detectOpenHandles
pnpm exec jest --config apps/api/jest.integration.config.cjs --runTestsByPath apps/api/src/services/retrieval-events.integration.test.ts --runInBand --no-coverage --detectOpenHandles
pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/functions/review-calibration-grade.test.ts --runInBand --no-coverage
pnpm exec jest --config packages/database/jest.config.cjs packages/database/src/profile-isolation.test.ts packages/database/src/repository.test.ts --runInBand --no-coverage
pnpm exec nx run api:typecheck --skip-nx-cache
pnpm exec nx run @eduagent/database:typecheck --skip-nx-cache
```

Each command exited 0 after integrating current main. The real-database replay
covered graded and fallback receipts; the retrieval round-trip covered normal
append behavior plus deterministic conflict; unit coverage exercised the
existing calibration and repository/profile-isolation boundaries. The API
typecheck emitted the pre-existing `MaxListenersExceededWarning` without a
failed task.

Changed-file ESLint, Prettier, and diff checks also exited 0. The final test
diff adds no internal production-module mock (GC6 deferral: none), and a
token/private-key shape scan returned no matches. Independent adversarial
review approved the pre-integration implementation; a fresh integrated-diff
review verifies the upstream repository additions and this report before PR.
