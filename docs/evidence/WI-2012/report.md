# WI-2012 memory-consent concurrency evidence

This report preserves the executed production-revert and restore proof for **WI-2012 — Add row lock to memory-consent toggle**. All commands ran from the canonical WI worktree on Lancre against a branch created from current `origin/main`. The tests use the real PostgreSQL integration database; neither service function is mocked.

## Source symptom and closure

The original audit finding at `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md:175` identifies an unlocked check-then-act race in the two memory-consent toggles. Both functions previously read the learner profile outside a transaction, derived `memoryEnabled` from that potentially stale row, and then wrote independently.

The landed source in `apps/api/src/services/learner-profile.ts` now wraps each toggle in a transaction, loads the scoped row through `getOrCreateLearningProfileTx`, and derives and writes the aggregate flag inside that transaction. The helper issues `SELECT ... FOR UPDATE` on both its existing-row and create-race paths.

The reciprocal cases in `apps/api/src/services/learner-profile.integration.test.ts` create a deterministic PostgreSQL wait queue, wait until each tagged writer is blocked on a database lock, release the control lock, and reread the committed row. Each case asserts both channel flags and `memoryEnabled === (memoryCollectionEnabled || memoryInjectionEnabled)`.

## Executed proof matrix

| Phase | Production state | Exit | Result | Saved result |
| --- | --- | ---: | --- | --- |
| Collection-lock REVERT | Only `toggleMemoryCollection` restored to the unlocked read/write path; tests unchanged | 1 | One suite failed; one selected case failed. The committed row was collection=false, injection=true, aggregate=false instead of true. | [collection-lock-revert-red.json](collection-lock-revert-red.json) |
| Injection-lock REVERT | Collection lock restored; only `toggleMemoryInjection` restored to the unlocked read/write path; tests unchanged | 1 | One suite failed; one selected case failed. The committed row was collection=true, injection=false, aggregate=false instead of true. | [injection-lock-revert-red.json](injection-lock-revert-red.json) |
| RESTORE GREEN | Both transaction and row-lock changes restored exactly; production diff from `origin/main` empty | 0 | One suite passed; both selected cases passed. | [restore-green.json](restore-green.json) |

The two revert failures independently demonstrate that each locked read is required. The restore run demonstrates that the original committed-row symptom is absent in both queue orders with the final production source.

## Exact commands

Collection-lock production revert:

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/learner-profile.integration.test.ts --runInBand --no-coverage -t "serializes injection=true before collection=false"
```

Injection-lock production revert:

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/learner-profile.integration.test.ts --runInBand --no-coverage -t "serializes collection=true before injection=false"
```

Exact production restore:

```bash
pnpm exec jest --config apps/api/jest.integration.config.cjs apps/api/src/services/learner-profile.integration.test.ts --runInBand --no-coverage -t "memory channel toggle concurrency"
```

The first two invocations exited nonzero on the expected deep-equality mismatch recorded in their JSON artifacts. The restore invocation exited zero after one suite ran both named cases. Jest emitted the suite's existing post-result open-handle advisory in every phase; it did not alter the recorded exit status or assertions.

## Evidence hygiene

The temporary production edits were applied one function at a time. Before the restore run, `git diff --exit-code origin/main -- apps/api/src/services/learner-profile.ts` returned no output, confirming that the production source was restored exactly. No environment dump, credential value, learner content, or database identifier is present in these artifacts.
