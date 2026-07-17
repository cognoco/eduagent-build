// ---------------------------------------------------------------------------
// [BUG-357] Identity-scoped query persister
//
// PersistQueryClientProvider mirrors the in-memory react-query cache to
// AsyncStorage so a cold app start can paint cached screens before the
// network resolves. Pre-BUG-357 the persister used a single un-scoped
// AsyncStorage key (`eduagent-query-cache`), so any sign-out path that
// failed to wipe AsyncStorage (force-kill, OS reclaim, crash) left the
// previous user's cache on disk. The next sign-in then rehydrated user
// A's queries — including `['profiles', userA-id]` and every
// profileId-scoped query (subjects, sessions, notes, etc.) — into the
// next signed-in account's session. Real-world impact recorded in
// MEMORY.md: wife's metered LLM calls counted against Jørn's quota.
//
// Fix: derive the persister storage key from the Clerk userId. User B's
// persister loads from `eduagent-query-cache::<userB-id>` and never sees
// user A's data, regardless of whether signOutWithCleanup ran. This is
// fail-safe by design — even an unhandled crash mid-sign-out leaves the
// data partitioned per account on disk.
//
// LEGACY_CACHE_KEY is still cleared on sign-out (see sign-out-cleanup.ts)
// so devices upgrading from the un-scoped persister don't leave the
// orphaned blob behind forever.
// ---------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';
import * as Updates from 'expo-updates';

/**
 * Legacy un-scoped persister key used pre-BUG-357. Retained as a constant
 * so sign-out cleanup can purge it from devices that upgraded from a build
 * that wrote to this key.
 */
export const LEGACY_CACHE_KEY = 'eduagent-query-cache';

const SCOPED_CACHE_KEY_PREFIX = 'eduagent-query-cache::';

/**
 * Build the AsyncStorage key for a given identity. `userId` is the Clerk
 * userId for signed-in sessions. Callers pass `null`/`undefined` for the
 * signed-out window — anonymous sessions persist nothing of value, but we
 * still partition them under a sentinel key so an anonymous cache (e.g.
 * pre-sign-in preview screens) cannot leak into the next signed-in user.
 */
export function buildPersisterKey(userId: string | null | undefined): string {
  return `${SCOPED_CACHE_KEY_PREFIX}${userId ?? 'anon'}`;
}

/**
 * Cache buster keyed to the running JS bundle.
 *
 * `PersistQueryClientProvider` rehydrates the dehydrated cache from disk
 * **as-is** — it does not re-validate the shape of persisted query data. So
 * when an OTA changes the shape of a persisted query (e.g. WI-992 retyped the
 * now-feed / ledger / visibility payloads), the previous bundle's data stays on
 * disk and, on the next cold start, rehydrates into the new render code and
 * throws while painting the first screen. That is the root cause of the
 * 2026-06-26 "Something went wrong" boot crash: it only hits devices that
 * UPGRADED (fresh installs have no stale cache).
 *
 * Passing this value as `persistOptions.buster` makes react-query drop the
 * persisted cache whenever it changes. `Updates.updateId` is a fresh UUID for
 * every published OTA update **and** every native build, so the cache is
 * invalidated exactly when persisted shapes could have changed.
 *
 * `runtimeVersion` is deliberately NOT used as a fallback: consecutive OTAs
 * share a runtimeVersion (e.g. `1.0.1`), so it would not change between the
 * updates that caused this drift — defeating the whole guard. `updateId` is
 * `null` only in dev (Metro), where a stable constant is correct (we want the
 * cache to survive fast-refresh reloads).
 */
export function getQueryCacheBuster(): string {
  return Updates.updateId ?? 'dev';
}

/**
 * Factory: create a persister scoped to one identity. Each Clerk user gets
 * their own AsyncStorage partition so cross-account rehydration is
 * impossible by construction.
 */
export function createScopedPersister(userId: string | null | undefined) {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: buildPersisterKey(userId),
    throttleTime: 2_000,
  });
}

// ---------------------------------------------------------------------------
// [WI-1987] Dehydration denylist
//
// Without a `shouldDehydrateQuery` filter, `PersistQueryClientProvider`
// persists EVERY successful query to AsyncStorage — including session
// transcripts (`['session-transcript', mode, sessionId, profileId]`, see
// queryKeys.sessions.transcript in query-keys.ts), which hold real
// learner/mentor chat text (sessionTranscriptSchema.exchanges in
// packages/schemas/src/sessions.ts). AsyncStorage is unencrypted on-device
// storage, so this wrote full chat transcripts to plaintext disk. Add a new
// query-key prefix here for any future query whose data is a raw transcript
// or other sensitive PII that must never be written to disk.
//
// Also denylisted (same audit pass):
// - `session-summary` (queryKeys.sessions.summary, used by useSessionSummary
//   in use-sessions.ts) — AI paraphrase/quotes of the session (content,
//   aiFeedback, closingLine, learnerRecap).
// - `parking-lot` (queryKeys.sessions.parkingLot AND topicParkingLot, both
//   used in use-sessions.ts — they share the same first queryKey segment) —
//   verbatim child-typed questions.
// ---------------------------------------------------------------------------
export const NEVER_PERSIST_QUERY_KEY_PREFIXES: ReadonlySet<string> = new Set([
  'session-transcript',
  'session-summary',
  'parking-lot',
]);

/**
 * `dehydrateOptions.shouldDehydrateQuery` for the scoped persister. Excludes
 * denylisted query-key prefixes; otherwise defers to react-query's default
 * (persist successful queries only) so every other query's existing
 * offline-paint behavior is unchanged.
 */
export function shouldPersistQuery(query: Query): boolean {
  const [firstSegment] = query.queryKey;
  if (
    typeof firstSegment === 'string' &&
    NEVER_PERSIST_QUERY_KEY_PREFIXES.has(firstSegment)
  ) {
    return false;
  }
  return defaultShouldDehydrateQuery(query);
}
