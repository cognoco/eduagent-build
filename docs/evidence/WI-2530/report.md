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

To test the changed wait-budget boundary deterministically, each leg applied the
same temporary test-only control after restoring the selected source blob. The
control delayed only the first test's routed session response by 1,100 ms:

```diff
-function setRoutes(session: unknown): void {
+function setRoutes(session: unknown, delayMs = 0): void {
   mockFetch.setRoute(
     '/dashboard/children/child-profile-001/sessions/session-001',
-    () => {
+    async () => {
+      if (delayMs > 0) {
+        await new Promise((resolve) => setTimeout(resolve, delayMs));
+      }
       // existing response body unchanged
   );
 }

 setRoutes(
   makeSession({
     displaySummary: 'Practiced light reactions',
     // existing fixture fields unchanged
   }),
+  1_100,
 );
```

The delay was never committed. The parent source retains the default 1-second
`waitFor` budget; the landed source has the explicit 5-second budget and exact
route assertion. An initial malformed application of the temporary control
failed during parsing with zero tests executed; it was discarded and is not a
leg below. The valid sequence began only after the control compiled and tests
executed.

| Leg | Source restored before control | Controlled blob | UTC interval | Exit | Result |
|---:|---|---|---|---:|---|
| 1 | Parent `a0a2f161…` | `b2f053bdf9115bcf95f13a6fa4261553656f7c75` | 09:48:16–09:48:21 | 1 | **RED** — `Unable to find an element with text: Practiced light reactions`; 1 failed, 14 passed |
| 2 | Landed `f9f904eb…` | `6b50b04cde2b3a8018e70edef64b6e924f0fed65` | 09:48:45–09:48:50 | 0 | **GREEN** — 15 passed |
| 3 | Parent `a0a2f161…` | `b2f053bdf9115bcf95f13a6fa4261553656f7c75` | 09:49:09–09:49:13 | 1 | **RED** — same missing-summary assertion; 1 failed, 14 passed |
| 4 | Landed `f9f904eb…` | `6b50b04cde2b3a8018e70edef64b6e924f0fed65` | 09:49:33–09:49:38 | 0 | **GREEN** — 15 passed |

The controlled hashes attest within this run that both RED legs used an
identical controlled file and both GREEN legs used an identical controlled
file. Because these are uncommitted blob IDs, they are not independently
re-derivable from Git history.

## Ten fresh focused processes at the landed revision

Before these runs, the control was removed with
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

## Final checkout proof

The following checks ran after the final full suite:

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

The temporary delay was fully removed; the verification checkout ended clean
and byte-identical to the landed revision for every tracked file.
