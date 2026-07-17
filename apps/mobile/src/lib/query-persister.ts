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
 * [WI-1987 rework] Deterministic fallback purge for sign-out paths that
 * don't have a `clerkUserId` to build a targeted key from (auth-expired,
 * profile-load-timeout — see sign-out.ts). Since we can't compute WHICH
 * scoped key belongs to the signing-out session, this removes every scoped
 * persister key on disk (plus the pre-BUG-357 unscoped legacy key) rather
 * than falling back to `queryClient.clear()` + the persister's throttled
 * (2s) write — the fallback the previous version of this fix left in place,
 * which is exactly the crash-window race BUG-357 closed for the
 * known-clerkUserId case. A device that has signed in as more than one
 * Clerk user loses every account's offline-paint cache when this runs, not
 * just the signing-out one — an acceptable cost for guaranteeing no scoped
 * cache (which may hold learner prose) survives an auth-expired sign-out on
 * disk.
 */
export async function removeAllScopedPersisterCaches(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const targets = keys.filter(
    (key) =>
      key === LEGACY_CACHE_KEY || key.startsWith(SCOPED_CACHE_KEY_PREFIX),
  );
  if (targets.length > 0) {
    await AsyncStorage.multiRemove(targets);
  }
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
// [WI-1987, reworked] Dehydration ALLOWLIST (default-deny)
//
// Original fix: without a `shouldDehydrateQuery` filter,
// `PersistQueryClientProvider` persists EVERY successful query to
// AsyncStorage (unencrypted on-device storage) — including session
// transcripts (sessionTranscriptSchema.exchanges), so real learner/mentor
// chat text was written to plaintext disk. A first pass added a denylist for
// `session-transcript` / `session-summary` / `parking-lot` (matched on
// queryKey[0]). Review bounced that pass: it missed sibling prose-bearing
// families (`recaps`/`journal-recaps` — displaySummary/highlight/narrative/
// conversationPrompt/learner quote; `my-reports`/dashboard reports —
// highlights/nextSteps), and a re-audit of every family in query-keys.ts
// (plus the inline-literal keys outside it) found the leak is systemic:
// `rawInput` (the learner's verbatim raw text) and generated
// summary/narrative/guidance/quote fields are threaded through most
// progress/dashboard/session response shapes — including the ordinary
// `['subjects', profileId]` list query and the parent dashboard ROOT query,
// not just the screens named in review. A denylist fails open: every new
// query family is persisted by default until someone remembers to add it
// here, and this audit alone found four independent waves of misses in one
// pass. An allowlist fails closed: an unlisted family just doesn't paint
// on cold start (mild, self-correcting) instead of silently writing prose to
// disk (the actual bug, undetectable without an audit like this one).
//
// So: `shouldPersistQuery` now denies by default and only persists query-key
// roots verified end-to-end (packages/schemas/src/*.ts, read in full) to
// carry ONLY structural metadata — numeric metrics, uuids, enums, dates, and
// curriculum-authored titles (topic/subject/book names picked by the
// curriculum, not typed by the learner). Add a new root here ONLY after
// reading its response schema and confirming no field is learner-authored
// free text, mentor/LLM-generated prose, or a
// rawInput/summary/narrative/highlight/quote/guidance-shaped string.
// ---------------------------------------------------------------------------

/**
 * Query-key roots (`queryKey[0]`) verified fully clean of learner/mentor
 * prose and `rawInput`. See file-level comment above for the standard each
 * entry must meet.
 */
export const PERSISTABLE_QUERY_KEY_ROOTS: ReadonlySet<string> = new Set([
  'book-sessions', // bookSessionSchema — id/topicId/topicTitle/chapter/exchangeCount/createdAt
  'topic-sessions', // topicSessionSchema — id/sessionType/durationSeconds/createdAt
  'subject-sessions', // subjectSessionSchema — ids/titles/sessionType/durationSeconds/createdAt
  'retention', // retentionCardSchema(+topicTitle/bookId) + teachingPreferenceResponseDataSchema — scores/dates/enums
  'language-progress', // languageProgressSchema — levels/milestone ids+titles, no prose
  'vocabulary', // vocabularySchema — curated term/translation flashcard data, not learner narrative
  'subscription', // subscriptionSchema — billing tier/limits/dates
  'usage', // usageSchema — billing counters
  'subscription-family', // familySubscriptionSchema — billing counters + member displayName
  'subscription-status', // subscriptionStatusResponseSchema — billing enums/counters
  'revenuecat', // RevenueCat SDK CustomerInfo/Offerings — third-party billing entitlement data
  'profiles', // publicProfileSchema — identity fields (displayName, birthYear, ...), no free text beyond the profile's own name
  'profile', // same publicProfileSchema, singular "active profile" key
  'settings', // notification/celebration/withdrawal/analogy/language prefs — booleans/enums/locale strings
]);

/**
 * `progress` (queryKeys.progress.*) mixes safe aggregate-metric queries with
 * prose-bearing ones under the same `queryKey[0]`. The `'profile'`-scoped
 * sub-queries (profileSessions/profileReports/profileWeeklyReports/
 * profileReportDetail/profileWeeklyReportDetail) are the self-view mirror of
 * the dashboard child queries below and carry the same
 * displaySummary/highlight/narrative/conversationPrompt/highlights/nextSteps
 * fields; `topicProgress` carries `summaryExcerpt`. Only the segment-2
 * values below (and the two fixed-literal `'topic'` sub-queries that do NOT
 * carry summaryExcerpt) are allowed — everything else under `'progress'`,
 * including `'profile'` and the variable-topicId shape of `'topic'`, is
 * excluded by omission.
 */
const PERSISTABLE_PROGRESS_SEGMENT2: ReadonlySet<string> = new Set([
  'subject', // subjectProgressSchema — counts/enums/dates
  'overview', // progressOverviewResponseSchema — counts/enums, subjects: subjectProgressSchema[]
  'continue', // continueSuggestionSchema — ids/titles only
  'resume-target', // learningResumeTargetSchema — ids/titles/enum + short system `reason` string
  'review-summary', // reviewSummaryResponseSchema — counts + nextReviewTopicSchema (ids/titles)
  'overdue-topics', // overdueTopicsResponseSchema — counts + overdueTopicSchema (ids/titles/enums)
  'inventory', // knowledgeInventorySchema — counts + currentlyWorkingOn (topic titles)
  'history', // progressHistorySchema — dates + numeric dataPoints
  'milestones', // milestoneRecordSchema — enum/counts + metadata: { subjectName } only (verified at the one call site, milestone-detection.ts)
]);

function isPersistableProgressQuery(key: readonly unknown[]): boolean {
  if (key[0] !== 'progress') return false;
  const segment2 = key[2];
  if (
    typeof segment2 === 'string' &&
    PERSISTABLE_PROGRESS_SEGMENT2.has(segment2)
  ) {
    return true;
  }
  // activeSessionForTopic (['progress', mode, 'topic', topicId, 'active-session', profileId])
  // and resolveTopicSubject (segment4 'resolve') are clean; topicProgress
  // (['progress', mode, 'topic', subjectId, topicId, profileId], segment4 = a
  // variable topicId, never one of these two literals) carries
  // `summaryExcerpt` and must fall through to excluded.
  return (
    segment2 === 'topic' &&
    (key[4] === 'active-session' || key[4] === 'resolve')
  );
}

/**
 * `library.retention` (retentionCardWithMetaSchema — clean) shares
 * `queryKey[0]` with `library.conceptMastery`
 * (`mentorAdditions: z.array(z.string())` — mentor-generated prose about the
 * learner's demonstrated concept mastery). Only `retention` is allowed.
 */
function isPersistableLibraryQuery(key: readonly unknown[]): boolean {
  return key[0] === 'library' && key[1] === 'retention';
}

// `dashboard` (queryKeys.dashboard.* — the parent-facing child views) is
// excluded WHOLESALE, not surgically: `dashboard.root` and `childDetail`
// both embed the full `dashboardChildSchema`, which carries `summary`,
// per-subject `rawInput`, and (nested under `progress`) `guidance`; the
// explicitly-named `childSessions`/`childSessionDetail` carry
// displaySummary/highlight/narrative/conversationPrompt; `childReports*`
// carry highlights/nextSteps/childName; `childMemory` carries curated memory
// statements plus parent free-text contributions; `childVerifiedProof`
// carries a learner quote. With the family this saturated, a partial
// allowlist would be one schema-change away from silently regressing —
// nothing under `'dashboard'` is allowlisted.
//
// Likewise NOT allowlisted, by omission (all inline-literal or factory keys
// verified prose/PII-bearing, listed here only for reviewer traceability —
// none of this is enforced by name, only by absence from the allow rules
// above): `session-transcript`, `session-summary`, `parking-lot` (verbatim
// chat/questions), `session` (queryKeys.sessions.detail — learningSessionSchema
// carries `rawInput`), `recaps` / `journal-recaps` (recapListItemSchema —
// displaySummary/highlight/narrative/conversationPrompt/verifiedProof.quote),
// `my-reports` (self-scope mirror of dashboard reports — highlights/nextSteps),
// `learner-profile` (learningProfileSchema.communicationNotes — free-text
// notes), `subjects` (subjectSchema.rawInput — the learner's raw
// subject-creation text), `resume-nudge` (topicHint — not independently
// verified prose-free, excluded conservatively).

/**
 * `dehydrateOptions.shouldDehydrateQuery` for the scoped persister.
 * Default-deny: persists only query keys matching one of the allow rules
 * above; every other successful query — known-bad, unaudited, or a family
 * added after this file was last reviewed — is excluded by default.
 */
export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey;
  const firstSegment = key[0];
  const allowed =
    (typeof firstSegment === 'string' &&
      PERSISTABLE_QUERY_KEY_ROOTS.has(firstSegment)) ||
    isPersistableProgressQuery(key) ||
    isPersistableLibraryQuery(key);
  if (!allowed) return false;
  return defaultShouldDehydrateQuery(query);
}
