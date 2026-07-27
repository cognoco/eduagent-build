# WI-2103 concurrent close and silence-prompt evidence

This transcript records the executed red-green-revert-restore proof for
**WI-2103 — Cancel silence prompts when a learning session ends**. The named
cases use separate real PostgreSQL transactions and a held
`learning_sessions` row lock. Each operation is tagged through
`application_name`; the test waits for PostgreSQL to report each transaction
blocked on a lock before releasing the queue.

## Command

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs \
  apps/api/src/services/session/session-crud.integration.test.ts \
  --runInBand --no-coverage -t 'WI-2103 AC-2'
```

The first RED was also isolated with:

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs \
  apps/api/src/services/session/session-crud.integration.test.ts \
  --runInBand --no-coverage \
  -t 'WI-2103 AC-2.*prompt transaction locks first'
```

## RED before the production change

The prompt-first case exited `1` against unchanged production code. PostgreSQL
admitted and committed the `silence_nudge` before close acquired the session
row; the final assertion expected zero persisted prompts and received one.

The preservation case also exited `1`: it expected the earlier answered nudge
to remain while the two trailing unanswered nudges were removed, but all three
nudge rows remained.

Relevant output:

```text
FAIL ... session-crud.integration.test.ts
✕ [WI-2103 AC-2] removes the prompt when the prompt transaction locks first
Expected length: 0
Received length: 1

✕ [WI-2103 AC-2] preserves answered nudges and removes every trailing unanswered nudge
Expected length: 1
Received length: 3
```

## GREEN with the production change

After close re-read the committed event tail while holding the session-row lock
and deleted only trailing server-authored silence nudges, the complete named set
exited `0`:

```text
PASS ... session-crud.integration.test.ts
✓ [WI-2103 AC-2] removes the prompt when the prompt transaction locks first
✓ [WI-2103 AC-2] rejects the prompt when the close transaction locks first
✓ [WI-2103 AC-2] preserves answered nudges and removes every trailing unanswered nudge
```

The first case proves prompt-lock-first compensation. The second proves that a
close-lock-first transaction still causes the queued prompt to reject with
`ConflictError`. The third proves that cleanup preserves an earlier nudge that
has a later learner message, retains a different server-authored system prompt,
and removes every trailing unanswered silence nudge.

## Production-only REVERT

The production cleanup block in
`apps/api/src/services/session/session-crud.ts` was removed with all tests left
unchanged. The complete named command exited `1`: prompt-first and trailing
cleanup both reproduced their RED results, while the close-first control still
passed.

```text
FAIL ... session-crud.integration.test.ts
✕ [WI-2103 AC-2] removes the prompt when the prompt transaction locks first
✓ [WI-2103 AC-2] rejects the prompt when the close transaction locks first
✕ [WI-2103 AC-2] preserves answered nudges and removes every trailing unanswered nudge
```

## RESTORE

The exact production block was restored and the complete named command exited
`0` again with all three named cases passing. This is the final source state.

Every run emitted the repository's existing ts-jest `esModuleInterop` warning,
the integration setup's Neon-driver notice, and Jest's post-result open-handle
advisory. None changed the command exits or the named assertions. No credential,
connection string, environment dump, or real learner content is recorded here.
