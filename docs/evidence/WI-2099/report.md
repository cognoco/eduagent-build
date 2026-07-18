# WI-2099 Mentor opening-exchange persistence evidence

This report preserves the root-cause analysis, public-seam regression coverage,
red/green/revert/restore proof, validation, and adversarial review for
**WI-2099 — Preserve the opening Mentor exchange when starting a session;
BID-13 Mentor loop record-integrity bug; fixed on the WI branch**.

Candidate commands ran from
`/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2099`. Revert commands
ran from the disposable proof worktree
`/home/vetinari/nexus/_dev/eduagent-build/.worktrees/wi-2099-revert-proof`.

## Root cause and candidate

The V2 Mentor route passed `rawInput` into the session screen, but the screen
used it only to render a local assistant-style opening bubble. It never sent
the learner opener through subject resolution, session creation, the message
outbox, the stream route, or session-event persistence. The first later input
therefore called `ensureSession(..., text)`, and the old
`initialRawInput ?? rawInput` precedence stored that follow-up (for example,
`Yes`) in `learning_sessions.raw_input`. The canonical transcript began with
the follow-up and downstream transcript readers never saw the opening request
or its Mentor reply.

The candidate scopes opener behavior to V2 freeform Mentor entry. It carries
an internal `initialMentorOpener` marker through delayed subject resolution,
makes the route opener authoritative during session creation, backfills the
allocated session ID into route state, and uses
`mentor-opener:<sessionId>` as the outbox/server idempotency key. Restoration
checks the canonical transcript and deterministic outbox entry before sending,
replaying, or hydrating. A later input waits until the opener has a real
persisted Mentor reply, then appends without replacing `raw_input`.

Candidate implementation commit:
`33cb470b239c08bb45b6149c9c65ce7e95d39334`.

Baseline production commit:
`00a9db01dfffe77b6ef6add3322dcb84762b26a7`.

Immutable final regression-test blob:
`5bc48909387c9292752b707d2aeb047b1000f5a8`.

Disposable production-only revert commit:
`d3b03edcc1591bb1fa519452d536589f957f65a9`.

## Public-seam regression matrix

The six named tests in
`tests/integration/learning-session.integration.test.ts:616` mount the real
mobile streaming hook against the Hono application and integration database.
They retain the real message outbox, session-creation service, stream route,
idempotency middleware, session-event persistence, and transcript endpoint.
Only third-party native/runtime boundaries are mocked; no internal
`jest.mock` site was added.

Coverage includes:

- question opener, `Yes` follow-up, exact persisted ordering, and transcript
  rehydration;
- declarative opener;
- subject creation delayed until after Mentor entry;
- retry/restart replay of a pending deterministic outbox item;
- an already-created session with a missing opener;
- an already-persisted opener hydrated before a later input is appended.

Assertions query the real `learning_sessions.raw_input`, ordered
`session_events`, AsyncStorage-backed outbox entry, and real transcript route.
Every persisted assistant turn must contain the actual non-empty Mentor reply.

## Chronological RED

Before any production edit, baseline production
`00a9db01dfffe77b6ef6add3322dcb84762b26a7` plus the first new public-seam test
failed with `learning_sessions.raw_input` equal to `Yes` instead of the route
question. The test is retained unchanged in the immutable final test blob
named above.

```bash
rtk env CI=1 pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --testNamePattern='V2 Mentor opening exchange persistence'
```

Result: exit 1; 1 suite failed; 1 test failed, 16 skipped, 17 total. The exact
failure was `Expected: "Why do apples fall toward the ground?"; Received:
"Yes"` at the persisted-session `rawInput` assertion.

The durable RED replay below reconstructs baseline production with the entire
final regression suite and preserves Jest's full machine-readable output.

## Immutable proof matrix

| Phase | Immutable revision | Production state | Result | Full raw result |
| --- | --- | --- | --- | --- |
| RED | `d3b03edcc1591bb1fa519452d536589f957f65a9` | All four production files are byte-identical to baseline `00a9db01dfffe77b6ef6add3322dcb84762b26a7`; final regression tests remain | 1 suite failed; 2 failed, 4 passed, 16 skipped, 22 total | [red-baseline-replay.json](red-baseline-replay.json) |
| GREEN | `33cb470b239c08bb45b6149c9c65ce7e95d39334` | Candidate production fix | 1 suite passed; 6 passed, 16 skipped, 22 total | [green-candidate.json](green-candidate.json) |
| REVERT | `d3b03edcc1591bb1fa519452d536589f957f65a9` | Disposable commit restores only the four production files to baseline; a separate invocation reproduces RED | 1 suite failed; 2 failed, 4 passed, 16 skipped, 22 total | [revert-production-only.json](revert-production-only.json) |
| RESTORE | `33cb470b239c08bb45b6149c9c65ce7e95d39334` | Untouched candidate worktree | 1 suite passed; 6 passed, 16 skipped, 22 total | [restore-green.json](restore-green.json) |

Both RED invocations fail on the original persisted `rawInput` defect. The
second final-suite failure is intentionally structural: baseline production
does not export the new deterministic-key helper used by the retry/restart
case. This is additional evidence that only the candidate supplies the
required replay contract.

The following command exits 0 with no diff, proving the revert commit contains
baseline versions of exactly the four production files while retaining the
new integration test:

```bash
rtk git -C /home/vetinari/nexus/_dev/eduagent-build/.worktrees/wi-2099-revert-proof diff --exit-code 00a9db01dfffe77b6ef6add3322dcb84762b26a7 d3b03edcc1591bb1fa519452d536589f957f65a9 -- 'apps/mobile/src/app/(app)/session/index.tsx' apps/mobile/src/components/session/session-types.ts apps/mobile/src/components/session/use-session-streaming.ts apps/mobile/src/components/session/use-subject-classification.ts
```

## Exact durable phase commands

RED:

```bash
rtk pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --testNamePattern='V2 Mentor opening exchange persistence' --silent --forceExit --json --outputFile=/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2099/docs/evidence/WI-2099/red-baseline-replay.json
```

GREEN:

```bash
rtk pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --testNamePattern='V2 Mentor opening exchange persistence' --silent --forceExit --json --outputFile=docs/evidence/WI-2099/green-candidate.json
```

REVERT:

```bash
rtk pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --testNamePattern='V2 Mentor opening exchange persistence' --silent --forceExit --json --outputFile=/home/vetinari/nexus/_dev/eduagent-build/.worktrees/WI-2099/docs/evidence/WI-2099/revert-production-only.json
```

RESTORE:

```bash
rtk pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --testNamePattern='V2 Mentor opening exchange persistence' --silent --forceExit --json --outputFile=docs/evidence/WI-2099/restore-green.json
```

## Final validation at the restored candidate

- `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --runTestsByPath apps/mobile/src/components/session/use-session-streaming.test.ts apps/mobile/src/components/session/use-subject-classification.test.ts 'apps/mobile/src/app/(app)/session/index.test.tsx' --silent` — exit 0; 3 suites passed; 139 tests passed.
- `pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --silent --forceExit` — exit 0; 1 suite passed; 22 tests passed.
- `pnpm exec nx run @eduagent/mobile:typecheck --skip-nx-cache` — exit 0; mobile and all six dependencies succeeded in a fresh run.
- `pnpm exec nx run @eduagent/mobile:lint --skip-nx-cache` — exit 0; 0 errors and the existing 51-warning repository baseline. No warning points at the changed streaming file or new integration tests; the pre-existing session-screen `t` dependency warning remains outside this change.
- `pnpm prepush` — exit 0; `tsc --build` succeeded.
- `pnpm format:check` — exit 0; all three configured package format targets succeeded.
- `git diff --check` — exit 0.

The integration runner required `--forceExit` because the existing integration
harness retains an open handle after Jest completes. Assertions and cleanup
completed, and the runner exited with the test results shown above.

## Independent review, latest-main merge, and final verification

The comprehensive independent Opus review returned **no actionable findings**.
It independently verified persisted opener ownership, deterministic
idempotency, opener-before-follow-up ordering, and isolation of non-Mentor
entry paths. Its optional suggestion to add another `index.test.tsx` case was
not implemented: the coordination instruction explicitly excluded it, and the
review identified no behavior defect requiring a production or test change. A
separate concurrency-focused Opus review also returned **no actionable
findings** after tracing simultaneous follow-up, delayed subject resolution,
remount and hydration, outbox drain, replay, stream failure and retry, and
cross-session and cross-profile isolation.

`origin/main` at `3b0fa9337fb60cef7bba8383314b7a61c0abc54b` was fetched and
merged history-preservingly with `--no-commit --no-ff`. The automatic merge had
no conflicts. Relative to that main revision, the WI changes remain limited to
four mobile production files, the persisted-session integration test, and WI
evidence/completion artifacts. `git diff --name-only origin/main` contains no
`apps/api`, `packages/schemas`, database schema, or migration path.

Post-merge verification on Node `v24.18.0` and pnpm `10.19.0`:

- Exact six-case command: `pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --testNamePattern='V2 Mentor opening exchange persistence' --silent --forceExit` — exit 0; 1 suite passed; 6 passed, 16 skipped, 22 total.
- Targeted mobile command: `pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --runTestsByPath apps/mobile/src/components/session/use-session-streaming.test.ts apps/mobile/src/components/session/use-subject-classification.test.ts 'apps/mobile/src/app/(app)/session/index.test.tsx' --silent` — exit 0; 3 suites passed; 139 tests passed.
- Full impacted integration file: `pnpm test:integration --runTestsByPath tests/integration/learning-session.integration.test.ts --runInBand --silent --forceExit` — exit 0; 1 suite passed; 22 tests passed.
- `pnpm exec nx run @eduagent/mobile:typecheck --skip-nx-cache` — exit 0; mobile and all six dependency targets succeeded in a fresh run.
- `pnpm exec nx run @eduagent/mobile:lint --skip-nx-cache` — exit 0; 0 errors and the existing 51-warning baseline.
- `pnpm prepush` — exit 0; `tsc --build` succeeded.
- `pnpm format:check` — exit 0; all three configured targets succeeded.

Final GREEN repeated the exact six-case selection with Jest JSON output: 1
suite passed; 6 passed, 16 skipped, 22 total. The full machine-readable result
is [final-green-main-3b0fa933.json](final-green-main-3b0fa933.json).

## Environment

Only Node `v24.18.0` and pnpm `10.19.0` were available; no Node 22 binary or
configured version manager was found. The repository requested Node 22 and
emitted the engine warning on pnpm commands. The public-seam tests, full
impacted integration file, mobile tests, fresh typecheck, fresh lint, pre-push
TypeScript build, and format checks all succeeded under Node 24, so no result
indicates that the mismatch affected this change.

## Adversarial runtime-assumption review

- **Navigation/routing:** opener behavior is gated by V2, Mentor entry source,
  freeform mode, and non-empty route `rawInput`. Other session entry modes and
  flags-off/V0/V1 paths retain their previous behavior. A newly allocated
  session ID is backfilled only for this opener path.
- **Timing/lifecycle:** a synchronous session-ID ref bridges the allocation to
  an opener/follow-up pair before React rerenders. A per-profile/opener launch
  key prevents effect reruns, and the server/outbox key prevents remount,
  retry, drain, or replay duplication.
- **Canonical data:** route `rawInput` wins only for a marked Mentor opener.
  Later messages retain existing fallback precedence. Follow-ups stop until
  the opener is confirmed with an actual assistant turn, preserving event
  order and the stored opener.
- **Subject resolution:** the opener marker survives all pending subject
  choices and silent creation paths. Restored sessions pass their known
  subject and pending outbox entry without reclassifying.
- **Recovery:** canonical transcript state wins over local UI state. Missing
  openers send, pending openers replay with the same key, and complete opener
  pairs hydrate without another write.
- **Platform/contracts:** no backend wire shape, database schema, migration,
  or native platform API changed. Test mocks are limited to external native
  boundaries.

One pre-existing server idempotency edge remains explicit: if replay reports
`assistantTurnReady=false`, the client leaves the deterministic opener in the
outbox and blocks later turns rather than confirming an incomplete exchange.
Subsequent replay can hydrate the assistant once it exists. Recovering a
server-side turn that permanently stopped after only its learner event would
require a backend idempotency contract change, which this item forbids.

## Reviewer rework cycle 2 — focused-route backfill reset

Independent review of PR #2226 identified a screen-boundary gap that the six
persisted-session cases could not observe. After the streaming hook allocated a
new Mentor session, `router.setParams({ sessionId })` changed
`routeSessionId` while the session screen remained focused. That dependency
change recreated the `useFocusEffect` callback and ran the full focus reset
mid-opener, clearing `isStreaming`, `classifiedSubject`,
`pendingSubjectResolution`, and `showWrongSubjectChip`. A first follow-up such
as `Yes` was consequently classified again without the opener's subject and
could overwrite the local recovery marker without that context.

The production change is deliberately narrow. The session screen records the
internally allocated session ID immediately before `setParams`. When the focus
callback reruns for that exact ID, it consumes the marker and skips that one
dependency-triggered reset. Any later focus, external route change, or genuine
navigation has no marker and retains the complete existing reset behavior.
No backend wire contract, shared schema, database schema, migration, or
non-Mentor entry behavior changed.

The new regression in
`apps/mobile/src/app/(app)/session/index.test.tsx` mounts the actual session
screen, runs the real subject-classification and session-streaming hooks against
the routed API boundary, holds the opener stream open, applies the internal
session-ID route backfill, completes the Mentor reply, and sends `Yes`. It
asserts all of the following together:

- streaming remains active across the internal route update;
- the opener is the only text classified, so `Yes` retains the opener's
  Physics subject instead of being reclassified;
- session creation keeps the route opener as `rawInput` and includes the
  Gravity topic;
- opener then `Yes` stream in that order on the same allocated session;
- the post-follow-up recovery marker still contains the Physics subject and
  Gravity topic.

### Immutable rework proof

| Phase | Immutable revision | Production state | Result | Raw result |
| --- | --- | --- | --- | --- |
| RED | `bb6248ee285ff2c784e652ab084546763148b001` | Screen regression committed before any rework production edit | 1 selected test failed; 49 skipped; 50 total. Backfill observed `idle`, `Yes` was classified again, and recovery subject became absent. | [rework2-red-screen-route-backfill.json](rework2-red-screen-route-backfill.json) |
| GREEN | `6d12a1d9745ed1f01d58590e1dd252efe2793f26` | One-shot internal-backfill focus-reset guard | 1 selected test passed; 49 skipped; 50 total | [rework2-green-screen-route-backfill.json](rework2-green-screen-route-backfill.json) |
| REVERT | `3401d7aedcf1e0ee9176fc908731366d830500ea` | Production session screen only restored to the RED revision; regression unchanged | Same 1 selected test failed with the same three differences; 49 skipped; 50 total | [rework2-revert-production-only.json](rework2-revert-production-only.json) |
| RESTORE | `6b020eebb678ba6dea7c3a175b7506db5ce9cbde` | Production session screen byte-identical to GREEN; regression unchanged | 1 selected test passed; 49 skipped; 50 total | [rework2-restore-screen-route-backfill.json](rework2-restore-screen-route-backfill.json) |

Both of these repository comparisons exit 0, proving the REVERT production
file equals RED and RESTORE equals GREEN:

```bash
git diff --exit-code bb6248ee285ff2c784e652ab084546763148b001 3401d7aedcf1e0ee9176fc908731366d830500ea -- 'apps/mobile/src/app/(app)/session/index.tsx'
git diff --exit-code 6d12a1d9745ed1f01d58590e1dd252efe2793f26 6b020eebb678ba6dea7c3a175b7506db5ce9cbde -- 'apps/mobile/src/app/(app)/session/index.tsx'
```

The phase command was the same at every revision, changing only the output
artifact name:

```bash
pnpm exec jest --config apps/mobile/jest.config.cjs --runInBand --runTestsByPath 'apps/mobile/src/app/(app)/session/index.test.tsx' --testNamePattern='preserves Mentor opener context while its allocated session ID is backfilled into the focused route' --silent --forceExit --json --outputFile=docs/evidence/WI-2099/<phase>.json
```

### Rework validation before latest-main reconciliation

- New focused-screen regression — 1 passed, 49 skipped, 50 total.
- Original six persisted-session scenarios — 6 passed, 16 skipped, 22 total;
  raw result: [rework2-six-persisted-sessions.json](rework2-six-persisted-sessions.json).
- Full impacted integration file — 22 passed, 22 total; raw result:
  [rework2-full-learning-session-integration.json](rework2-full-learning-session-integration.json).
- Affected mobile unit suites — 3 suites passed, 140 tests passed; raw
  result: [rework2-mobile-unit-suites.json](rework2-mobile-unit-suites.json).
- Mobile typecheck — the mobile target and all six dependency targets passed
  with cache skipped.
- Mobile lint — 0 errors and the existing 51-warning repository baseline; no
  new warning points at the regression or reset guard.

One discarded full-integration invocation was accidentally overlapped with a
detached copy of the same Neon-backed file. Their shared database cleanup
collided, producing unrelated owner-person, authorization, and missing-event
failures. After confirming no duplicate Jest process remained, the file was
rerun alone and passed 22/22 as recorded above. The integration harness and
screen regression both require `--forceExit` for their existing retained open
handles. Node `v24.18.0` remains the only available runtime despite the repo's
Node 22 engine declaration.

The canonical BID-13 refinement plan at
`_wip/mvp-roadmap/refinements/refine-BID-13-mentor.md` remains unchanged: this
rework strengthens its required real-boundary regression and does not alter the
single acceptance-criteria unit, six persisted-session variants, sequencing,
or scope.

### Latest-main reconciliation and final verification

The final fetch found `origin/main` at
`6dce228a9892ae6f90e87863bb18983d2ef75d5e`, one commit ahead of the supplied
`ba9775edba0eaafa95f65ee1ccd072e744bc757c` base. That intervening quiz-results
accessibility change did not touch the session implementation, session tests,
or WI-2099 evidence. It was merged history-preservingly without conflict in
`c981d3767435a53c5ba59e88243bc8eab6ccb6d6`.

Every impacted gate was then rerun on the merged tree:

- focused-screen route-backfill regression — 1 passed, 49 skipped, 50 total;
- six persisted-session scenarios — 6 passed, 16 skipped, 22 total;
- complete impacted integration file — 22 passed, 22 total;
- three affected mobile suites — 3 suites and 140 tests passed;
- mobile typecheck — the mobile target and all six dependency targets passed
  with cache skipped;
- mobile lint — exit 0 with 0 errors and the existing 51-warning baseline;
- `pnpm prepush` — exit 0; the repository TypeScript build passed.
- `pnpm format:check` — exit 0; all three configured project targets passed;
- `git diff --check` — exit 0;
- sanctioned `complete --validate` — exit 0; all four completion-summary
  sections, trip wires, evidence presence, and the single-AC coverage check
  passed, with no Notion write.
