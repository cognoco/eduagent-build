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
