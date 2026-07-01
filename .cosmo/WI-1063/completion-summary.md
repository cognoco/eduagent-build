What was done:

Converted the three WI-1063 target Inngest handlers from throwing payload parses to terminal malformed-payload disposition:
- filing-timed-out-observe
- graduation-narration
- supportership-revocation

What changed:

Each handler now uses safeParse(event.data), captures the invalid payload via Sentry with summarized raw payload context, writes a structured warning log, and returns { status: 'invalid_payload', error: parsed.error.message } before any step.run, step.sleep, waitForEvent, or sendEvent work can execute.

Added apps/api/src/inngest/functions/malformed-payload-disposition.test.ts with one malformed payload regression for each converted function. The tests assert the invalid_payload result, retained error text, Sentry escalation, structured warning, and no durable step execution.

Verification:

- Red regression observed first: the new malformed-payload test failed with ZodError throws at all three original parse(event.data) sites.
- pnpm exec jest --config apps/api/jest.config.cjs apps/api/src/inngest/functions/malformed-payload-disposition.test.ts apps/api/src/inngest/functions/filing-timed-out-observe.test.ts --runInBand --no-coverage
  - PASS: 2 suites, 18 tests.
- pnpm exec nx run api:typecheck
  - PASS: api and dependencies typechecked.
- pnpm exec nx run api:lint
  - PASS: 0 errors; 8 pre-existing warnings in unrelated files.
- pnpm exec tsx scripts/check-gc1-pattern-a.ts
  - PASS.
- git diff --check and git diff --cached --check
  - PASS.
- Target-schema sweep:
  - rg -n 'filingTimedOutEventSchema\.parse\(event\.data\)|personGraduatedEventSchema\.parse\(event\.data\)|supportershipUnlinkedEventSchema\.parse\(event\.data\)' apps/api/src/inngest/functions -g '*.ts' -g '!*.test.ts'
  - Result: 0 hits.
- Pre-push hook during git push
  - PASS: tsc --build and surgical Jest set for the 4-file push delta.

Caveats / Follow-ups:

The broader parse(event.data) search still reports pre-existing out-of-scope text: an ask-silent-classify comment and daily-snapshot.ts, whose inline WI-985 comment intentionally keeps malformed snapshot refresh events retrying. Those were not part of WI-1063's named surface and were not changed.

No follow-ups for the WI-1063 scope.
