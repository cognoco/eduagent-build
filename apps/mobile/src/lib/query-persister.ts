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
