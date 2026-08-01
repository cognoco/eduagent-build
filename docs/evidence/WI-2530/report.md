# WI-2530 — durable child session-detail async-render evidence

## Purpose

This is fresh, review-accessible verification for **WI-2530 — stabilize child
session-detail async render under full serialized mobile Jest load**. It records
the exact landed squash merge, its parent, a natural serialized-load run, a
delay-controlled red/green/revert/restore sequence, ten fresh focused processes,
and a final full serialized suite. No production or test behavior is changed by
this evidence-only revision.

## Immutable inputs

- Landed squash merge: `f9f904eb8726c94493115c848fa53531e97aaacb`
- Squash parent: `a0a2f161ee1d59ff9177598d62ae76a639eda3f2`
- Target test:
  `apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx`
- Parent target blob: `5a823b8eac409f418ab6f603932395d5dff524ec`
- Landed target blob: `3a4a7ced95cbaad67cf2f6ba98fd2360702e0fb7`

The disposable checkout was detached at the landed squash merge. Dependencies
were installed with `pnpm install --offline --frozen-lockfile` before testing.

## Historical occurrence provenance and limitation

The surviving durable occurrence record is [PR #2418](https://github.com/cognoco/eduagent-build/pull/2418),
for **WI-1443 — per-turn answer evaluation; full Nx run exposed the independent
mobile timeout**. The PR description's “Notes for reviewers” section states that
full repository Nx unit testing surfaced “one non-reproducing session-detail
loader timeout.” This supports the
historical occurrence only; it is not executable red/green evidence for WI-2530.

The historical Orion receipt
`.cosmo-artifacts/WI-1443/mobile-full.json` cannot be supplied. It is absent from
the reviewed landed revision (`git cat-file -e` exit `128`) and a path-limited
`git log --all` returned zero commits. This report does not reconstruct or
fabricate it. The fresh exact-landed receipts below replace the unverifiable raw
artifact citation for review purposes.

## Environment

| Item | Version |
|---|---|
| OS | Linux `6.8.0-134-generic` x86_64 |
| Repository-required test runtime | Node `v22.23.2` via `pnpm dlx node@22` |
| Host default Node (not used to execute Jest) | `v24.18.0` |
| pnpm | `10.19.0` |
| Jest package/lock at landed revision | `30.2.0` |
| Git | `2.43.0` |

## Sanitized command shape

`<local-repository>` and `<verification-checkout>` replace machine-specific
paths. The commands otherwise preserve the executed arguments.

```bash
LANDED=f9f904eb8726c94493115c848fa53531e97aaacb
PARENT=a0a2f161ee1d59ff9177598d62ae76a639eda3f2
TARGET='apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx'

git clone --shared --no-checkout <local-repository> <verification-checkout>
git -C <verification-checkout> checkout --detach "$LANDED"
cd <verification-checkout>
pnpm install --offline --frozen-lockfile

# Focused invocation; each repetition starts a fresh Node/Jest process.
CI=1 pnpm dlx node@22 --max-old-space-size=6144 \
  ./node_modules/jest/bin/jest.js \
  --config apps/mobile/jest.config.cjs --runInBand --forceExit \
  --runTestsByPath "$TARGET"

# Complete serialized mobile suite.
CI=1 pnpm dlx node@22 --max-old-space-size=6144 \
  ./node_modules/jest/bin/jest.js \
  --config apps/mobile/jest.config.cjs --runInBand --forceExit
```

## Natural serialized-load observation

The target file alone was restored from `$PARENT` on the detached landed
checkout, then the complete serialized mobile suite was run without an injected
delay. This natural run did **not** reproduce the timeout and is therefore not
called RED. That outcome is consistent with the historical symptom being a
timing flake.

| Source | UTC interval | Exit | Key output |
|---|---|---:|---|
| Parent target blob `5a823b8e…` | 2026-08-01 09:38:54–09:46:38 | 0 | `524 passed, 524 total`; `6973 passed, 6973 total`; `461.672 s` |

## Deterministic delay-controlled RGR

Chronology: an initial delay-controlled RGR ran at approximately 09:48 UTC, but
that run did not retain the exact patch and raw per-leg receipts. The sequence
below was re-executed at 10:42 UTC with the now-committed patch and raw-receipt
capture, and it supersedes that earlier uninstrumented run. These retained legs
therefore postdate the 09:51 focused repetitions, the 09:58 full serialized
suite, and its landed-checkout proof documented later in this report. Sections
are grouped by evidence type rather than execution order.

To test the changed wait-budget boundary deterministically, each leg applied the
same temporary test-only control after restoring the selected source blob. The
control delayed only the first test's routed session response by 1,100 ms. The
complete mutation is retained as
[`controlled-delay.patch`](controlled-delay.patch) (SHA-256
`f0a0bea6d9bbda6f0ca9782c47b60262ca0ba9327a8651e65110624c0df76d57`). It is
committed only as a passive evidence artifact and is not applied to the test
source in this revision.

The parent source retains the default 1-second `waitFor` budget; the landed
source has the explicit 5-second budget and exact route assertion. The same
patch applies cleanly to both source blobs and makes each controlled blob
independently reproducible:

```bash
SOURCE=a0a2f161ee1d59ff9177598d62ae76a639eda3f2 # parent RED
# SOURCE=f9f904eb8726c94493115c848fa53531e97aaacb # landed GREEN
PATCH=docs/evidence/WI-2530/controlled-delay.patch
TARGET='apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].test.tsx'
TEST_NAME='shows session metadata when displaySummary is present'

git restore --source="$SOURCE" -- "$TARGET"
git apply --check "$PATCH"
git apply "$PATCH"
git hash-object "$TARGET"
CI=1 FORCE_COLOR=0 pnpm dlx node@22 --max-old-space-size=6144 \
  ./node_modules/jest/bin/jest.js \
  --config apps/mobile/jest.config.cjs --runInBand --forceExit \
  --runTestsByPath "$TARGET" --testNamePattern="$TEST_NAME"
git restore --source=HEAD --staged --worktree -- "$TARGET"
git status --short
```

The test-name filter isolates the changed async boundary and prevents a RED
assertion from skipping cleanup and cascading into later tests. Each invocation
starts a fresh Node/Jest process.

| Leg | Source restored before control | Controlled blob | UTC interval | Exit | Result |
|---:|---|---|---|---:|---|
| 1 | Parent `a0a2f161…` | `b2f053bdf9115bcf95f13a6fa4261553656f7c75` | 10:42:32–10:42:36 | 1 | [**RED** — 1 failed, 14 skipped](rgr-leg-1-parent-red.txt) |
| 2 | Landed `f9f904eb…` | `6b50b04cde2b3a8018e70edef64b6e924f0fed65` | 10:42:36–10:42:40 | 0 | [**GREEN** — 1 passed, 14 skipped](rgr-leg-2-landed-green.txt) |
| 3 | Parent `a0a2f161…` | `b2f053bdf9115bcf95f13a6fa4261553656f7c75` | 10:42:40–10:42:44 | 1 | [**RED** — 1 failed, 14 skipped](rgr-leg-3-parent-red.txt) |
| 4 | Landed `f9f904eb…` | `6b50b04cde2b3a8018e70edef64b6e924f0fed65` | 10:42:44–10:42:48 | 0 | [**GREEN** — 1 passed, 14 skipped](rgr-leg-4-landed-green.txt) |

The controlled hashes attest that both RED legs used identical controlled
content and both GREEN legs used identical controlled content. A reviewer can
derive them independently by applying the retained patch to the corresponding
source blob.

The linked receipts preserve the complete Jest stdout/stderr plus commands,
exit codes, UTC timing, source/blob checks, patch checksum, and final clean-tree
proof. Sanitization is limited to replacing the exact temporary checkout root
with `<verification-checkout>`, replacing the exact evidence-worktree root with
`<workspace>`, and removing ANSI color-control bytes; no test or result text was
omitted. The `(app)../../child` segment in the RED stack paths is Jest message
formatting retained verbatim, not a sanitizer rewrite.

Each retained leg ends by restoring the target from `HEAD` and recording its own
cleanup and clean-tree proof (`status_lines=0`); the fourth receipt is the final
10:42 checkout proof for the retained sequence.

## Ten fresh focused processes at the landed revision

For these earlier 09:51 runs, the temporary control used by the now-superseded
09:48 sequence was removed with
`git restore --source="$LANDED" -- "$TARGET"`, the target hash matched the landed
blob, and both `git diff --exit-code` and `git status --short` were empty.

| Run | UTC interval | Exit | Jest output |
|---:|---|---:|---|
| 1 | 09:51:04–09:51:07 | 0 | 1 suite; 15 tests; 2.015 s |
| 2 | 09:51:07–09:51:11 | 0 | 1 suite; 15 tests; 2.028 s |
| 3 | 09:51:11–09:51:15 | 0 | 1 suite; 15 tests; 2.064 s |
| 4 | 09:51:15–09:51:18 | 0 | 1 suite; 15 tests; 2.048 s |
| 5 | 09:51:18–09:51:22 | 0 | 1 suite; 15 tests; 2.040 s |
| 6 | 09:51:22–09:51:26 | 0 | 1 suite; 15 tests; 2.007 s |
| 7 | 09:51:26–09:51:30 | 0 | 1 suite; 15 tests; 2.040 s |
| 8 | 09:51:30–09:51:33 | 0 | 1 suite; 15 tests; 2.029 s |
| 9 | 09:51:33–09:51:37 | 0 | 1 suite; 15 tests; 2.034 s |
| 10 | 09:51:37–09:51:41 | 0 | 1 suite; 15 tests; 2.018 s |

Aggregate: 10/10 fresh processes exited `0`; 150/150 test executions passed.

## Full serialized suite at the landed revision

| Source | UTC interval | Exit | Key output |
|---|---|---:|---|
| Landed `f9f904eb…`; target blob `3a4a7ced…` | 2026-08-01 09:51:53–09:58:38 | 0 | `524 passed, 524 total`; `6973 passed, 6973 total`; `402.616 s` |

## Landed-checkout proof after the 09:58 full suite

The following checks ran after the 09:58 full serialized suite and before the
later retained 10:42 RGR re-execution:

```bash
test "$(git rev-parse HEAD)" = "$LANDED"
test "$(git hash-object "$TARGET")" = "$(git rev-parse "$LANDED:$TARGET")"
git diff --exit-code
test -z "$(git status --short)"
```

Observed values:

```text
HEAD=f9f904eb8726c94493115c848fa53531e97aaacb
target_blob=3a4a7ced95cbaad67cf2f6ba98fd2360702e0fb7
diff_exit=0
status_lines=0
```

At this checkpoint, the temporary delay was fully removed and the verification
checkout was clean and byte-identical to the landed revision for every tracked
file. The later retained RGR receipts supersede the 09:48 sequence and each
carry their own restore and clean-tree proof, as described above.
