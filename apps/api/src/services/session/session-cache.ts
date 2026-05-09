// ---------------------------------------------------------------------------
// Session Static Context Cache — in-process LRU cache for per-session data
// ---------------------------------------------------------------------------

import { type profiles, type Database } from '@eduagent/database';
import type { LearningSession } from '@eduagent/schemas';
import { getSubject } from '../subject';
import { loadProfileRowById } from '../profile';
import { fetchPriorTopics } from '../prior-learning';
import { getTeachingPreference } from '../retention-data';
import { getLearningMode } from '../settings';
import { getLearningProfile } from '../learner-profile';
import { fetchCrossSubjectHighlights } from '../prior-learning';
import {
  buildHomeworkLibraryContext,
  buildBookLearningHistoryContext,
} from './session-context-builders';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CachedProfileRow = typeof profiles.$inferSelect | null;
type CachedSubject = Awaited<ReturnType<typeof getSubject>>;

// BUG-70: Extended cache to include session-scoped supplementary lookups
// that are static within a session but were re-queried on every exchange.
export interface SessionSupplementaryData {
  priorTopics: Awaited<ReturnType<typeof fetchPriorTopics>>;
  teachingPref: Awaited<ReturnType<typeof getTeachingPreference>>;
  learningMode: Awaited<ReturnType<typeof getLearningMode>>;
  learningProfile: Awaited<ReturnType<typeof getLearningProfile>>;
  crossSubjectHighlights: Awaited<
    ReturnType<typeof fetchCrossSubjectHighlights>
  >;
}

export interface SessionStaticContextCacheEntry {
  profileId: string;
  sessionId: string;
  subjectId: string;
  topicId: string | null;
  expiresAt: number;
  profile: CachedProfileRow;
  subject: CachedSubject;
  homeworkLibraryContextLoaded: boolean;
  homeworkLibraryContext?: string;
  bookLearningHistoryContexts: Map<string, string | undefined>;
  // Supplementary data: lazily populated on first exchange, reused for duration
  supplementary?: SessionSupplementaryData;
}

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

const SESSION_STATIC_CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_SESSION_STATIC_CONTEXT_ENTRIES = 200;

// Process-local cache — each API replica holds an independent copy.
// Acceptable because: (1) cached data is profile name + subject metadata, not
// authorization decisions; (2) 5-min TTL bounds staleness; (3) cache misses
// fall through to DB reads; (4) current deployment is single-instance (CF
// Worker). If multi-instance deployment is introduced, evaluate whether stale
// display names for up to 5 minutes are acceptable or replace with KV.
const sessionStaticContextCache = new Map<
  string,
  SessionStaticContextCacheEntry
>();

// [BUG-667 / S-10] Per-session in-flight mutex for supplementary fetches.
// Two concurrent first exchanges previously both saw `supplementary===undefined`
// and both kicked off the same 5-query parallel fan-out, doubling cold-path
// DB load. The mutex collapses the second caller onto the first caller's
// already-running promise.
const supplementaryInflight = new Map<
  string,
  Promise<SessionSupplementaryData>
>();

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

export function getSessionStaticContextCacheKey(
  profileId: string,
  sessionId: string,
): string {
  return `${profileId}:${sessionId}`;
}

export function pruneSessionStaticContextCache(now = Date.now()): void {
  for (const [key, entry] of sessionStaticContextCache.entries()) {
    if (entry.expiresAt <= now) {
      sessionStaticContextCache.delete(key);
    }
  }

  while (sessionStaticContextCache.size > MAX_SESSION_STATIC_CONTEXT_ENTRIES) {
    const oldestKey = sessionStaticContextCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    sessionStaticContextCache.delete(oldestKey);
  }
}

export function touchSessionStaticContextCacheEntry(
  key: string,
  entry: SessionStaticContextCacheEntry,
): SessionStaticContextCacheEntry {
  entry.expiresAt = Date.now() + SESSION_STATIC_CONTEXT_TTL_MS;
  sessionStaticContextCache.delete(key);
  sessionStaticContextCache.set(key, entry);
  pruneSessionStaticContextCache();
  return entry;
}

export async function getSessionStaticContext(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
): Promise<SessionStaticContextCacheEntry> {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  const now = Date.now();

  pruneSessionStaticContextCache(now);

  const cached = sessionStaticContextCache.get(key);
  if (
    cached &&
    cached.subjectId === session.subjectId &&
    cached.topicId === (session.topicId ?? null) &&
    cached.expiresAt > now
  ) {
    return touchSessionStaticContextCacheEntry(key, cached);
  }

  const [subject, profile] = await Promise.all([
    getSubject(db, profileId, session.subjectId),
    loadProfileRowById(db, profileId),
  ]);

  const entry: SessionStaticContextCacheEntry = {
    profileId,
    sessionId,
    subjectId: session.subjectId,
    topicId: session.topicId ?? null,
    expiresAt: now + SESSION_STATIC_CONTEXT_TTL_MS,
    profile,
    subject,
    homeworkLibraryContextLoaded: false,
    homeworkLibraryContext: undefined,
    bookLearningHistoryContexts: new Map(),
  };

  sessionStaticContextCache.set(key, entry);
  pruneSessionStaticContextCache(now);
  return entry;
}

export async function getCachedHomeworkLibraryContext(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
): Promise<string | undefined> {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  const entry = await getSessionStaticContext(
    db,
    profileId,
    sessionId,
    session,
  );

  if (entry.homeworkLibraryContextLoaded) {
    return entry.homeworkLibraryContext;
  }

  entry.homeworkLibraryContext = await buildHomeworkLibraryContext(
    db,
    session.subjectId,
  );
  entry.homeworkLibraryContextLoaded = true;
  touchSessionStaticContextCacheEntry(key, entry);
  return entry.homeworkLibraryContext;
}

export async function getCachedBookLearningHistoryContext(
  db: Database,
  profileId: string,
  sessionId: string,
  session: LearningSession,
  currentTopicId: string,
  bookId: string,
): Promise<string | undefined> {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  const entry = await getSessionStaticContext(
    db,
    profileId,
    sessionId,
    session,
  );
  const historyKey = `${bookId}:${currentTopicId}`;

  if (entry.bookLearningHistoryContexts.has(historyKey)) {
    return entry.bookLearningHistoryContexts.get(historyKey);
  }

  const context = await buildBookLearningHistoryContext(
    db,
    profileId,
    currentTopicId,
    bookId,
  );
  entry.bookLearningHistoryContexts.set(historyKey, context);
  touchSessionStaticContextCacheEntry(key, entry);
  return context;
}

export function clearSessionStaticContext(
  profileId: string,
  sessionId: string,
): void {
  const key = getSessionStaticContextCacheKey(profileId, sessionId);
  sessionStaticContextCache.delete(key);
  supplementaryInflight.delete(key);
}

// NOTE: This clears only the in-memory Map of the running Worker isolate.
// Other same-region isolates retain their caches until TTL expiry — stale
// context can be served for up to that window after a learning-mode change.
// Folding learningMode into the cache key would give hard invalidation but
// also busts supplementary data that is unrelated to mode.
export function clearSessionStaticContextForProfile(profileId: string): void {
  const prefix = `${profileId}:`;
  for (const key of sessionStaticContextCache.keys()) {
    if (key.startsWith(prefix)) {
      sessionStaticContextCache.delete(key);
    }
  }
  for (const key of supplementaryInflight.keys()) {
    if (key.startsWith(prefix)) {
      supplementaryInflight.delete(key);
    }
  }
}

export function resetSessionStaticContextCache(): void {
  sessionStaticContextCache.clear();
  supplementaryInflight.clear();
}

// ---------------------------------------------------------------------------
// [BUG-667 / S-10] Supplementary data loader + in-flight de-dup
// ---------------------------------------------------------------------------

async function loadSessionSupplementary(
  db: Database,
  profileId: string,
  subjectId: string,
  isFreeform: boolean,
): Promise<SessionSupplementaryData> {
  const [
    priorTopics,
    teachingPref,
    learningMode,
    crossSubjectHighlights,
    learningProfile,
  ] = await Promise.all([
    isFreeform
      ? Promise.resolve([])
      : fetchPriorTopics(db, profileId, subjectId),
    isFreeform
      ? Promise.resolve(null)
      : getTeachingPreference(db, profileId, subjectId),
    getLearningMode(db, profileId),
    isFreeform
      ? Promise.resolve([])
      : fetchCrossSubjectHighlights(db, profileId, subjectId),
    getLearningProfile(db, profileId),
  ]);
  return {
    priorTopics,
    teachingPref,
    learningMode,
    learningProfile,
    crossSubjectHighlights,
  };
}

/**
 * Returns the supplementary data for a session, deduplicating concurrent
 * cold-path fetches via a per-cache-key in-flight promise map.
 *
 * Contract:
 * - First caller registers a Promise; subsequent callers await the same one.
 * - On success, the cache entry is populated and the in-flight slot is freed.
 * - On failure, the in-flight slot is freed so the next caller can retry
 *   (we do NOT cache the rejection).
 */
export async function getOrLoadSessionSupplementary(
  db: Database,
  profileId: string,
  sessionId: string,
  subjectId: string,
  isFreeform: boolean,
  cacheEntry: SessionStaticContextCacheEntry,
): Promise<SessionSupplementaryData> {
  if (cacheEntry.supplementary) return cacheEntry.supplementary;

  const cacheKey = getSessionStaticContextCacheKey(profileId, sessionId);
  const inflight = supplementaryInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = loadSessionSupplementary(db, profileId, subjectId, isFreeform)
    .then((supp) => {
      // Re-read the cache entry. If a profile/session invalidation evicted or
      // replaced our entry while the fan-out was in flight, do not resurrect it
      // with stale supplementary data.
      const live = sessionStaticContextCache.get(cacheKey);
      if (live === cacheEntry) {
        live.supplementary = supp;
        touchSessionStaticContextCacheEntry(cacheKey, live);
      }
      return supp;
    })
    .finally(() => {
      // Always clear the in-flight slot — both on success (so a future TTL
      // miss can retry) and on failure (so the rejection isn't cached).
      supplementaryInflight.delete(cacheKey);
    });

  supplementaryInflight.set(cacheKey, promise);
  return promise;
}

// Test-only: surface the size of the in-flight map for assertions.
export function _supplementaryInflightSize(): number {
  return supplementaryInflight.size;
}

export function _sessionStaticContextCacheSize(): number {
  return sessionStaticContextCache.size;
}
