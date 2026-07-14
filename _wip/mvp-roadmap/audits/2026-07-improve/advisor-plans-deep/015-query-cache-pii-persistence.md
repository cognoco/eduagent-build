# Plan 015: Stop persisting learner free-text to plaintext AsyncStorage, and purge the cache on sign-out

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8c049b93f..HEAD -- apps/mobile/src/lib/query-persister.ts apps/mobile/src/lib/sign-out-cleanup.ts apps/mobile/src/app/_layout.tsx apps/mobile/src/lib/query-keys.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security / privacy
- **Planned at**: commit `8c049b93f`, 2026-07-13

## Why this matters

Two independent defects combine into one privacy problem, in an app used by
**minors**:

1. **Everything successful is persisted.** The TanStack Query persister mirrors
   the query cache to `AsyncStorage` — which is **plaintext, unencrypted** device
   storage. No `dehydrateOptions.shouldDehydrateQuery` filter is configured
   anywhere in the app, so TanStack's default applies: *persist every query in
   `status: 'success'`*. That sweeps in `['session-transcript', …]` — the full
   learner↔AI chat transcript — alongside progress reports and homework data.

2. **The blob is never purged at sign-out.** Sign-out cleanup removes only the
   **legacy** un-scoped key (`eduagent-query-cache`). The *current*
   identity-scoped key (`eduagent-query-cache::<userId>`) is never removed, so a
   signed-out user's transcripts remain on disk indefinitely.

Note what is *already* correct and must not be undone: the per-user key scoping
(BUG-357) correctly prevents user A's cache rehydrating into user B's session.
That is a different bug, already fixed. This plan does not touch it. The problem
here is **plaintext at rest** and **no purge on sign-out** — of the user's *own*
data.

`maxAge` and `buster` do **not** solve this: they gate whether a blob is
*restored*, not whether the file exists on disk.

## Current state

### The files

- `apps/mobile/src/lib/query-persister.ts` — builds the persister; exports `buildPersisterKey`.
- `apps/mobile/src/app/_layout.tsx` — configures `PersistQueryClientProvider`.
- `apps/mobile/src/lib/sign-out-cleanup.ts` — the sign-out purge lists.
- `apps/mobile/src/lib/query-keys.ts` — the typed query-key factory.

### No dehydrate filter exists anywhere

`rg 'shouldDehydrateQuery|dehydrateOptions' apps/mobile/src` returns **zero
matches**. That is the bug.

`apps/mobile/src/lib/query-persister.ts:82-88`:

```ts
export function createScopedPersister(userId: string | null | undefined) {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: buildPersisterKey(userId),
    throttleTime: 2_000,
  });
}
```

`apps/mobile/src/app/_layout.tsx:423-435` — `persistOptions` has `persister`,
`maxAge`, and `buster`, but **no `dehydrateOptions`**:

```tsx
    <PersistQueryClientProvider
      key={userId}
      client={queryClient}
      persistOptions={{
        persister: createScopedPersister(userId),
        maxAge: 24 * 60 * 60_000,
        buster: getQueryCacheBuster(),
      }}
```

### Query keys are string-rooted arrays — this makes filtering easy

`apps/mobile/src/lib/query-keys.ts:300-316`:

```ts
  sessions: {
    detail: (mode, sessionId, profileId) =>
      ['session', mode, sessionId, profileId] as const,

    transcript: (mode, sessionId, profileId) =>
      ['session-transcript', mode, sessionId, profileId] as const,

    summary: (mode, sessionId, profileId) =>
      ['session-summary', mode, sessionId, profileId] as const,
```

So `query.queryKey[0]` is a stable string root you can deny-list against.

`apps/mobile/src/hooks/use-sessions.ts:355-356` confirms the transcript is a
plain `useQuery` with no persistence opt-out.

### Sign-out clears only the LEGACY key

`apps/mobile/src/lib/sign-out-cleanup.ts:101-110` — `GLOBAL_ASYNCSTORAGE_KEYS`
contains the string `'eduagent-query-cache'`, explicitly commented as the
"Legacy un-scoped react-query persister blob". The scoped key
(`eduagent-query-cache::<userId>`) appears nowhere in this file.

### There is already a prefix-scan mechanism — use it

`apps/mobile/src/lib/sign-out-cleanup.ts:252-255`:

```ts
const ASYNCSTORAGE_PREFIX_WIPE: ReadonlyArray<string> = [
  'summary-draft-',
  'add_to_my_learning.tip_seen.',
];
```

`sign-out-cleanup.ts:286-303` runs a best-effort `AsyncStorage.getAllKeys()`
scan and `multiRemove`s everything matching any of those prefixes, with failures
isolated as non-fatal.

**This is the clean fix for defect 2**: add the scoped-cache prefix to that list
and every scoped persister blob is wiped on sign-out — no `userId` plumbing
required.

`apps/mobile/src/lib/query-persister.ts:38` already defines the prefix:

```ts
const SCOPED_CACHE_KEY_PREFIX = 'eduagent-query-cache::';
```

(It is currently module-private — you will need to export it.)

### Repo conventions

- Tests are co-located. No `__tests__/` folders.
- Do NOT add internal `jest.mock('./...')` — GC1 CI ratchet blocks new ones.
- `sign-out-cleanup.ts:152` carries an explicit instruction: any new key shape
  must be registered in the lists in that file rather than wiped ad hoc. Honor it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck mobile | `cd apps/mobile && pnpm exec tsc --noEmit` | exit 0 |
| Lint mobile | `pnpm exec nx lint mobile` | exit 0 |
| Targeted tests | `pnpm exec jest --config apps/mobile/jest.config.cjs --no-coverage apps/mobile/src/lib` | all pass |
| Full mobile suite | `pnpm test:mobile:unit` | all pass |

## Scope

**In scope:**
- `apps/mobile/src/lib/query-persister.ts` — export the prefix; add the deny-list predicate.
- `apps/mobile/src/app/_layout.tsx` — wire `dehydrateOptions`.
- `apps/mobile/src/lib/sign-out-cleanup.ts` — add the scoped prefix to `ASYNCSTORAGE_PREFIX_WIPE`.
- Co-located tests for the above.

**Out of scope (do NOT touch):**
- **The identity-scoped persister key (BUG-357).** `buildPersisterKey` and the
  per-user partitioning are a *fix* for a different, already-solved bug. Do not
  "simplify" them back to a single key. Read the header comment in
  `query-persister.ts:1-24` before touching that file.
- `maxAge` / `buster` (`getQueryCacheBuster`) — the OTA cache-buster is a
  boot-crash fix; leave it.
- Migrating auth tokens — Clerk already uses `expo-secure-store` correctly.
- Encrypting AsyncStorage wholesale. Tempting, but it is a much larger change
  (new native dep, migration of existing blobs) and is not what this plan buys.
  **Excluding the sensitive keys is the cheap, correct 90% fix.**

## Git workflow

- Branch from `main`: `advisor/015-query-cache-pii-persistence`
- Conventional commits (e.g. `fix(mobile): exclude learner free-text from persisted query cache`).
- Do NOT push or open a PR unless explicitly instructed.

## Steps

### Step 1: Enumerate the sensitive query-key roots

Read `apps/mobile/src/lib/query-keys.ts` in full and list every key factory whose
cached payload contains **learner free-text, chat content, homework content, or
report prose** — as opposed to IDs, counts, booleans, and enums.

Start from this set (verified present at plan time) and **extend it by reading**:

- `['session-transcript', …]` — the full chat transcript. **Definitely sensitive.**
- `['session-summary', …]` — LLM-written prose about the learner.
- `['session', …]` (`sessions.detail`) — check whether the payload embeds message
  content or only metadata. Include it only if it carries free-text.
- Anything under `recaps`, `dashboard`, and `progress` that returns narrative
  text (coaching cards, recap prose) rather than numbers.
- Any homework/OCR query returning recognized text.

For each candidate, confirm by reading the hook that consumes it and the
response schema in `packages/schemas`. **Do not guess** — a key that returns only
IDs and counts should stay persisted, because excluding it costs cold-start UX
for no privacy gain.

Record your final list in the PR description with one line of justification each.

**Verify**: you can state, for every key you exclude, the specific free-text
field that made it sensitive.

### Step 2: Add the deny-list predicate

In `apps/mobile/src/lib/query-persister.ts`, add and export:

```ts
/**
 * Query-key roots whose cached payloads carry learner free-text (chat
 * transcripts, LLM prose, homework content). AsyncStorage is plaintext on
 * device, so these are never written to disk — they are re-fetched on cold
 * start instead. IDs/counts/enums stay persisted so the cache still paints
 * most screens offline.
 */
export const NON_PERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set([
  'session-transcript',
  // ...the roots you confirmed in Step 1
]);

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root !== 'string' || !NON_PERSISTED_QUERY_ROOTS.has(root);
}
```

Also export the scoped prefix (currently module-private at `query-persister.ts:38`)
so sign-out cleanup can reuse it:

```ts
export const SCOPED_CACHE_KEY_PREFIX = 'eduagent-query-cache::';
```

**Verify**: `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0.

### Step 3: Wire `dehydrateOptions` into the provider

In `apps/mobile/src/app/_layout.tsx:423-435`, add `dehydrateOptions` to
`persistOptions`. Compose with TanStack's default rather than replacing it — the
default also checks `status === 'success'`, which you still want:

```tsx
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';
import { shouldPersistQueryKey } from '../lib/query-persister';

// ...
      persistOptions={{
        persister: createScopedPersister(userId),
        maxAge: 24 * 60 * 60_000,
        buster: getQueryCacheBuster(),
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) &&
            shouldPersistQueryKey(query.queryKey),
        },
      }}
```

If `defaultShouldDehydrateQuery` is not exported by the installed
`@tanstack/react-query` version, fall back to replicating its condition
(`query.state.status === 'success'`) and say so in the PR description.

**Verify**: `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0.

### Step 4: Purge the scoped cache on sign-out

In `apps/mobile/src/lib/sign-out-cleanup.ts`, add the scoped prefix to the
existing prefix-wipe list (`sign-out-cleanup.ts:252-255`):

```ts
import { SCOPED_CACHE_KEY_PREFIX } from './query-persister';

const ASYNCSTORAGE_PREFIX_WIPE: ReadonlyArray<string> = [
  'summary-draft-',
  'add_to_my_learning.tip_seen.',
  // Identity-scoped react-query persister blobs
  // (`eduagent-query-cache::<userId>`). The legacy un-scoped key is handled
  // in GLOBAL_ASYNCSTORAGE_KEYS; this catches the current scoped form, which
  // was previously never purged on sign-out.
  SCOPED_CACHE_KEY_PREFIX,
];
```

This reuses the existing `getAllKeys()` prefix scan, so it wipes the blob for
**every** scoped user on the device — including the `anon` sentinel — with no
`userId` plumbing. Leave `'eduagent-query-cache'` in `GLOBAL_ASYNCSTORAGE_KEYS`;
it still handles devices upgrading from the pre-BUG-357 build.

**Verify**: `pnpm exec jest --config apps/mobile/jest.config.cjs --no-coverage apps/mobile/src/lib/sign-out-cleanup.test.ts` → passes.

### Step 5: Validate

**Verify**, all of:
- `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- `pnpm exec nx lint mobile` → exit 0
- `pnpm test:mobile:unit` → all pass

## Test plan

New/extended co-located tests:

1. **`apps/mobile/src/lib/query-persister.test.ts`** (create if absent):
   - `shouldPersistQueryKey(['session-transcript', 'solo', 's1', 'p1'])` → `false`
   - `shouldPersistQueryKey(['subjects', 'p1'])` → `true` (a non-sensitive key still persists)
   - `shouldPersistQueryKey([])` and `shouldPersistQueryKey([123])` → `true` (non-string root does not throw)
   - `buildPersisterKey('u1')` still returns `eduagent-query-cache::u1` (proves BUG-357 scoping is intact)

2. **`apps/mobile/src/lib/sign-out-cleanup.test.ts`** (extend): mock
   `AsyncStorage.getAllKeys` to return
   `['eduagent-query-cache::u1', 'eduagent-query-cache::anon', 'app-ui-language']`
   and assert `multiRemove` is called with **both** scoped cache keys and **not**
   with `app-ui-language` (a device preference that must survive sign-out — the
   file's comments say so explicitly).

3. **Regression guard**: a test asserting `NON_PERSISTED_QUERY_ROOTS` contains
   `'session-transcript'`. This is the one that matters — it stops a future
   refactor silently re-persisting chat content.

Follow the structure of the existing tests in `apps/mobile/src/lib/`. Do not add
internal `jest.mock('./...')`.

## Done criteria

ALL must hold:

- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm exec nx lint mobile` exits 0
- [ ] `pnpm test:mobile:unit` exits 0
- [ ] `rg 'shouldDehydrateQuery' apps/mobile/src` returns at least one match (it returned **zero** before this plan)
- [ ] `NON_PERSISTED_QUERY_ROOTS` contains `'session-transcript'`, and a test asserts it
- [ ] `ASYNCSTORAGE_PREFIX_WIPE` contains the scoped cache prefix, and a test proves sign-out removes `eduagent-query-cache::<id>` keys
- [ ] `buildPersisterKey` is unchanged (BUG-357 scoping intact)
- [ ] The PR description lists every excluded key root with its free-text justification
- [ ] `_wip/mvp-roadmap/audits/2026-07-improve/advisor-plans-deep/README.md` status row updated

## STOP conditions

Stop and report — do not improvise — if:

- Excluding `session-transcript` visibly breaks a screen that **depends** on the
  cached transcript to render offline (rather than merely re-fetching it). That
  would mean transcripts are load-bearing for an offline flow, which is a product
  decision — surface it rather than deciding alone.
- You find yourself needing to change `buildPersisterKey` or the per-user
  partitioning. That is BUG-357's fix and is out of scope.
- `defaultShouldDehydrateQuery` is not exported and you are unsure how to
  replicate the default. Report rather than guessing — silently dropping the
  `status === 'success'` check would persist error/pending states.
- The set of sensitive keys turns out to be most of the cache, such that
  excluding them makes persistence pointless. In that case the right answer is
  probably encrypted storage, not a deny-list — stop and say so.

## Maintenance notes

- **What a reviewer should scrutinize**: the exclusion list. Too narrow and
  learner text still hits disk; too broad and cold-start UX degrades for no
  privacy gain. Every entry should trace to a named free-text field.
- **The rule for future work**: any new query returning learner free-text must be
  added to `NON_PERSISTED_QUERY_ROOTS` in the same PR. The `session-transcript`
  regression test is the tripwire, but it only guards that one key — consider
  whether a lint rule or a schema-level marker would scale better if the list
  grows past ~6 entries.
- **Deferred**: full at-rest encryption of AsyncStorage. This plan reduces the
  exposed surface to non-free-text data; it does not encrypt what remains
  (progress numbers, IDs). If a threat model later demands it, that is a separate,
  much larger change.
- **Related**: homework photos are *also* never cleaned up (a separate finding,
  `use-homework-ocr.ts:102-106`, no `deleteAsync` anywhere in the app). It is not
  in this plan's scope but it is the same data-minimization theme and is worth
  scheduling alongside it.
