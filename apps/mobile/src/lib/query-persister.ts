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
// [WI-1987, round 3 rework] Dehydration ALLOWLIST (default-deny, PII-broad)
//
// Original fix: without a `shouldDehydrateQuery` filter,
// `PersistQueryClientProvider` persists EVERY successful query to
// AsyncStorage (unencrypted on-device storage) — including session
// transcripts (sessionTranscriptSchema.exchanges), so real learner/mentor
// chat text was written to plaintext disk. Round 1 added a denylist; review
// bounced it (denylist fails open). Round 2 switched to this allowlist but
// STILL positively admitted PII: `profiles`/`profile`
// (publicProfileSchema — displayName/avatarUrl/birthMonth/birthDay/location/
// pronouns/consentStatus), `subscription-family`
// (familySubscriptionSchema.members[].displayName), and `vocabulary`
// (vocabularySchema.term/translation — user-created via the vocabulary
// create API). Round 2 also read "PII" narrowly (structured identity fields
// only), so it missed sibling leaks of the same shape.
//
// Round 3 re-read every currently-allowlisted family's response schema
// end-to-end against a BROAD PII definition — names, avatars, birth
// date parts, location, pronouns, consent status, AND any user-controlled
// string (vocabulary terms/translations, custom "other" language names,
// learner-typed subject/book titles) — and found the leak is systemic
// beyond the three named families:
//   - `usage` — usageSchema.byProfile[].name (family member display name).
//   - `settings` was allowlisted at segment-0 (queryKey[0] === 'settings'),
//     silently admitting EVERY settings.* sub-query. `settings.native-language`
//     (nativeLanguageResponseSchema / nativeLanguageUpdateSchema) is an
//     unconstrained `z.string().min(2).max(50)` — the mobile "other" custom
//     native-language picker (onboarding/language-setup.tsx) writes raw
//     learner-typed text through this exact shape.
//   - `retention` was allowlisted at segment-0, silently admitting
//     `retention.teaching-preference`
//     (teachingPreferenceResponseDataSchema.nativeLanguage: `z.string()`,
//     same free-text field family as settings.native-language).
//   - `subject-sessions` (subjectSessionSchema.bookTitle) — `bookTitle`
//     mirrors `curriculumBooks.title`, which the "focused book" subject-
//     creation path (services/subject.ts createSubjectWithStructure) sets
//     DIRECTLY to the learner's typed `focus`/`rawInput` text with no LLM
//     normalization — confirmed learner-controlled by the codebase's own
//     `[PROMPT-INJECT-8]` comment in services/book-generation.ts ("bookTitle
//     ... is learner- or LLM-generated stored text"). Book titles are NOT
//     reliably curriculum-authored the way topic titles are.
//   - Most of `progress`'s previously-allowed segment-2 values
//     (`subject`/`overview`/`continue`/`resume-target`/`review-summary`/
//     `overdue-topics`/`inventory`, plus the `topic`/`resolve` fixed
//     literal) embed `subjectName` / `subjectProgressSchema.name` —
//     the SUBJECT's name, which `subjectCreateSchema.name` and
//     `apps/mobile/src/app/create-subject.tsx` (`resolveState.result.
//     resolvedName ?? name.trim()`) prove is the learner's raw typed text
//     whenever LLM subject-name resolution is ambiguous/no-match. This is
//     the same user-controlled-string class as `vocabulary`'s term/
//     translation, not a "curriculum-authored title" (topic/book titles are
//     LLM-generated FROM a book/subject title, not typed by the learner
//     directly — genuinely distinct from subject names).
//   - `progress`'s `milestones` segment-2 value
//     (milestoneRecordSchema.metadata: `z.record(z.string(), z.unknown())`)
//     is an unconstrained open bag — no schema can prove it PII-free, and it
//     is documented (at its one call site) to carry `subjectName`, which is
//     now known-tainted per the point above.
//
// A denylist fails open: every new query family persists by default until
// someone remembers to add it here. An allowlist fails closed: an unlisted
// family just doesn't paint on cold start (mild, self-correcting) instead of
// silently writing PII/prose to disk. `shouldPersistQuery` denies by default
// and only persists query-key shapes verified end-to-end
// (packages/schemas/src/*.ts, read in full, PLUS the service/route code that
// populates each field — schema shape alone is not sufficient proof, see
// `bookTitle`/`subjectName` above) to carry ONLY structural metadata —
// numeric metrics, uuids, enums, dates/timestamps, and titles proven to be
// exclusively curriculum/LLM-authored (never a direct, un-normalized copy of
// learner-typed input). Add a new allow rule here ONLY after reading the
// response schema AND tracing every string field's write path to its
// source.
// ---------------------------------------------------------------------------

/**
 * Query-key roots (`queryKey[0]`) verified fully clean of PII, learner/mentor
 * prose, and `rawInput`. See file-level comment above for the standard each
 * entry must meet. Families that mix clean and PII-bearing sub-queries under
 * the same root are NOT here — they get a segment-aware predicate below
 * instead of a root-level allow.
 */
export const PERSISTABLE_QUERY_KEY_ROOTS: ReadonlySet<string> = new Set([
  'book-sessions', // bookSessionSchema — id/topicId/topicTitle(LLM-generated)/chapter(fixed labels)/exchangeCount/createdAt — no bookTitle field
  'topic-sessions', // topicSessionSchema — id/sessionType/durationSeconds/createdAt — no titles at all
  'language-progress', // languageProgressSchema — levels/milestone ids+titles from the static per-language milestone library (language-curriculum.ts), no learner text
  'subscription', // subscriptionSchema — billing tier/limits/dates
  'subscription-status', // subscriptionStatusResponseSchema — billing enums/counters
  'revenuecat', // RevenueCat SDK — NOT zod-validated (raw SDK types), verified by type inspection: customerInfo (entitlements/activeSubscriptions/originalAppUserId/dates) carries no name/free-text; offerings (serverDescription/metadata) is RevenueCat-dashboard-authored business config, not learner/family-typed. No learner PII on either shape.
]);

/**
 * `progress` (queryKeys.progress.*) mixes safe aggregate-metric queries with
 * PII/prose-bearing ones under the same `queryKey[0]`. `history` is the only
 * segment-2 value proven clean end-to-end (progressHistorySchema — dates +
 * numeric dataPoints only). Every other previously-allowed segment-2 value
 * embeds `subjectName`/`subjectProgressSchema.name` (learner-controlled, see
 * file-level comment) or an unconstrained metadata bag (`milestones`) and is
 * excluded by omission: `subject`, `overview`, `continue`, `resume-target`,
 * `review-summary`, `overdue-topics`, `inventory`, `milestones`. The
 * `'profile'`-scoped sub-queries (profileSessions/profileReports/etc — the
 * self-view mirror of the dashboard child queries) and the variable-topicId
 * shape of `'topic'` (topicProgress, `summaryExcerpt`) were already excluded
 * pre-round-3 and remain so.
 */
const PERSISTABLE_PROGRESS_SEGMENT2: ReadonlySet<string> = new Set([
  'history', // progressHistorySchema — dates + numeric dataPoints only
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
  // activeSessionForTopic (['progress', mode, 'topic', topicId,
  // 'active-session', profileId], activeSessionResponseSchema — sessionId
  // only) is clean. resolveTopicSubject (segment4 'resolve',
  // topicResolveResponseSchema) was previously allowed here too but its
  // response carries `subjectName` — same learner-controlled-string taint as
  // the excluded progress segment-2 values above — so it is EXCLUDED as of
  // round 3. topicProgress (['progress', mode, 'topic', subjectId, topicId,
  // profileId], segment4 = a variable topicId, never one of these literals)
  // carries `summaryExcerpt` and remains excluded.
  return segment2 === 'topic' && key[4] === 'active-session';
}

/**
 * `library.retention` (retentionCardWithMetaSchema — retentionCardSchema +
 * topicTitle/bookId, no bookTitle/subjectName — clean) shares `queryKey[0]`
 * with `library.conceptMastery` (`mentorAdditions: z.array(z.string())` —
 * mentor-generated prose about the learner's demonstrated concept mastery).
 * Only `retention` is allowed.
 */
function isPersistableLibraryQuery(key: readonly unknown[]): boolean {
  return key[0] === 'library' && key[1] === 'retention';
}

/**
 * `retention` (queryKeys.retention.*) mixes clean sub-queries with one
 * PII-bearing sub-query under the same `queryKey[0]`:
 *   - `subject` (subjectRetentionResponseSchema — retentionCardWithMetaSchema[]
 *     + reviewDueCount) — clean.
 *   - `topic` (topicRetentionResponseSchema — a single nullable
 *     retentionCardSchema, no title fields at all) — clean.
 *   - `evaluate-eligibility` (evaluateEligibilitySchema — topicTitle
 *     (LLM-generated) + scores/enums + a system `reason` string populated
 *     only with fixed server strings, never learner/LLM content) — clean.
 *   - `teaching-preference` (teachingPreferenceResponseDataSchema —
 *     `nativeLanguage: z.string().nullable()`, an unconstrained free-text
 *     field the settings PUT route accepts verbatim, same taint as
 *     `settings.native-language` below) — EXCLUDED.
 */
function isPersistableRetentionQuery(key: readonly unknown[]): boolean {
  return (
    key[0] === 'retention' &&
    (key[1] === 'subject' ||
      key[1] === 'topic' ||
      key[1] === 'evaluate-eligibility')
  );
}

/**
 * `settings` (queryKeys.settings.*) mixes clean boolean/enum preference
 * sub-queries with one free-text sub-query under the same `queryKey[0]`.
 * `native-language` (nativeLanguageResponseSchema /
 * nativeLanguageUpdateSchema — `z.string().min(2).max(50)`, no enum) is
 * genuinely learner-typed: the onboarding "other" native-language picker
 * (apps/mobile/src/app/(app)/onboarding/language-setup.tsx) and the
 * corresponding PUT route (routes/settings.ts) both accept and persist
 * arbitrary custom text through this exact shape. Every other settings
 * sub-key is a verified boolean/enum:
 *   - `notifications` (notificationPrefsResponseSchema — booleans + one
 *     bounded int) — clean.
 *   - `celebration-level` (celebrationLevelSchema — enum) — clean.
 *   - `withdrawal-archive` (withdrawalArchivePreferenceSchema — enum) — clean.
 *   - `family-pool-breakdown-sharing` (`{ value: z.boolean() }`) — clean.
 *   - `analogy-domain` (analogyDomainSchema — enum) — clean.
 */
const PERSISTABLE_SETTINGS_SEGMENT1: ReadonlySet<string> = new Set([
  'notifications',
  'celebration-level',
  'withdrawal-archive',
  'family-pool-breakdown-sharing',
  'analogy-domain',
]);

function isPersistableSettingsQuery(key: readonly unknown[]): boolean {
  const segment1 = key[1];
  return (
    key[0] === 'settings' &&
    typeof segment1 === 'string' &&
    PERSISTABLE_SETTINGS_SEGMENT1.has(segment1)
  );
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
// notes), `subjects` (subjectSchema.rawInput/name — the learner's raw
// subject-creation text), `resume-nudge` (topicHint — not independently
// verified prose-free, excluded conservatively), `profiles`/`profile`
// (publicProfileSchema — displayName/avatarUrl/birthMonth/birthDay/location/
// pronouns/consentStatus — PII), `subscription-family`
// (familySubscriptionSchema.members[].displayName — PII), `usage`
// (usageSchema.byProfile[].name — PII), `vocabulary` (vocabularySchema.term/
// translation — user-created via the vocabulary create API), `subject-sessions`
// (subjectSessionSchema.bookTitle — learner-controlled, see file-level
// comment).

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
    isPersistableLibraryQuery(key) ||
    isPersistableRetentionQuery(key) ||
    isPersistableSettingsQuery(key);
  if (!allowed) return false;
  return defaultShouldDehydrateQuery(query);
}
