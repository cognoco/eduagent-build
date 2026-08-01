# WI-2994 verification

Date: 2026-08-01
Base: `764748015d460b08449d3b6898cd1188f8552d93`
Runtime: Node `22.16.0`

## Design decision

The installed Inngest SDK types define `onFailure` as a regular handler with
the same `step` tooling as the main handler. Inngest's primary documentation
states that `onFailure` is a separate Inngest function, that `step.sendEvent`
provides reliable event delivery from functions, and that stable step state is
memoized across replay. Therefore the repository's existing durable substrate
satisfies AC1 and the item does not authorize a new database migration.

The SDK's `Inngest.CreateFunction` declaration contextually types `onFailure`
as a `Handler` extended with `FailureEventArgs`, while `InngestStepTools`
declares `sendEvent` against `SendEventPayload<GetEvents<TClient>>`. Both
handlers therefore rely on contextual inference; a handwritten facade with an
`unknown` payload would discard the SDK's event contract rather than strengthen
it.

Primary sources:

- `node_modules/inngest/components/InngestFunction.d.ts`
- `node_modules/inngest/types.d.ts`
- <https://www.inngest.com/docs/reference/typescript/v4/functions/handling-failures>
- <https://www.inngest.com/docs/reference/typescript/v4/functions/step-send-event>
- <https://www.inngest.com/docs/events>

## Verification

- Focused red/green/revert/restore: see `red-green-revert.md`; final 2 / 2
  suites and 42 / 42 cases pass.
- Routed validation:
  `DATABASE_URL=postgresql://vetinari@localhost:5432/tests_v2 bash scripts/check-change-class.sh --run --fast`
  exited `0`; the full incremental TypeScript gate passed.
- ESLint passed for the four production/test files, apart from the repository's
  known uncached Nx project-graph warning.
- Prettier and `git diff --check` passed after formatting.
- The API TypeScript project passed with the inferred `onFailure` handler and
  `step.sendEvent` types.

The two event data objects retain exactly the existing fields: `accountId`,
`runId`, bounded `errorName`, and `timestamp`. The deterministic event ID is
event metadata, not a new payload field. No learner, provider, credential, or
raw error content is added. WI-2994 owns dispatch durability; WI-1916 remains
limited to downstream chat/pager delivery and production-console routing.
