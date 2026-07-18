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
import * as Sentry from '@sentry/react-native';
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
 * Pure filter: given every AsyncStorage key, return the persister-owned ones
 * (the pre-BUG-357 unscoped legacy key plus every `::`-scoped partition).
 * Extracted so both the purge paths and their tests share one definition of
 * "a persister cache key" — a sibling app key must never be swept.
 */
export function listScopedPersisterKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter(
    (key) =>
      key === LEGACY_CACHE_KEY || key.startsWith(SCOPED_CACHE_KEY_PREFIX),
  );
}

/**
 * [WI-1987] Remove the given persister cache key(s) and, on a storage
 * failure, ESCALATE rather than swallow. The repo Fix Development Rule bans
 * silent recovery in auth code (a swallowed removal here would leave a
 * plaintext learner-content cache on disk while sign-out reported success) —
 * so a failed purge emits a structured Sentry event (queryable metric via the
 * `purge` tag) carrying only the storage KEY NAMES, never the cached values.
 * It never throws: sign-out must always complete (session teardown is the
 * primary boundary); the survivor is re-attempted at the next definitively
 * signed-out moment via `reattemptPersisterPurgeIfSignedOut`.
 */
export async function purgePersisterKeys(
  keyNames: readonly string[],
): Promise<void> {
  if (keyNames.length === 0) return;
  try {
    await AsyncStorage.multiRemove([...keyNames]);
  } catch (err) {
    Sentry.captureMessage('sign-out: scoped persister purge failed', {
      level: 'error',
      tags: { feature: 'auth', purge: 'persister-scoped-cache' },
      // [WI-1987] KEY NAMES ONLY — never the cached values (which may hold
      // learner prose). Names identify which cache survived, for remediation.
      extra: { keyNames: [...keyNames], error: String(err) },
    });
  }
}

/**
 * [WI-1987] Fallback purge for sign-out paths without a `clerkUserId` to build
 * a targeted key from (auth-expired, profile-load-timeout — see sign-out.ts),
 * and the re-sweep entry point. Since we can't compute WHICH scoped key belongs
 * to the signing-out session, it removes every scoped persister key on disk
 * (plus the pre-BUG-357 unscoped legacy key). A device signed in as more than
 * one Clerk user loses every account's offline-paint cache when this runs — an
 * acceptable cost for guaranteeing no scoped cache (which may hold learner
 * prose) survives on disk. Enumeration and removal failures escalate (never
 * throw) via the same key-names-only Sentry path as `purgePersisterKeys`.
 */
export async function removeAllScopedPersisterCaches(): Promise<void> {
  let allKeys: readonly string[];
  try {
    allKeys = await AsyncStorage.getAllKeys();
  } catch (err) {
    Sentry.captureMessage('sign-out: scoped persister key enumeration failed', {
      level: 'error',
      tags: { feature: 'auth', purge: 'persister-scoped-cache' },
      extra: { error: String(err) },
    });
    return;
  }
  await purgePersisterKeys(listScopedPersisterKeys(allKeys));
}

/**
 * [WI-1987] Re-attempt a sign-out purge that a prior storage failure left
 * behind. Sweeps every scoped persister cache — but ONLY when the app is
 * DEFINITIVELY signed out (`isLoaded && !isSignedIn`), never during Clerk's
 * initial load. That guard is load-bearing: on a returning user's cold start
 * `useAuth()` reports `!isSignedIn` while still loading, and sweeping then
 * would destroy that user's own legitimate offline-paint cache before their
 * persister mounts. Gating on "definitively signed out" covers exactly the two
 * moments the failure contract requires — app start with no session, and the
 * window before the next sign-in — and no others. Returns whether it swept.
 */
export async function reattemptPersisterPurgeIfSignedOut(auth: {
  isLoaded: boolean;
  // `boolean | undefined` matches Clerk's useAuth(): isSignedIn is undefined
  // while loading — treated as not-definitively-signed-out by the isLoaded
  // guard below, so no sweep runs mid-load.
  isSignedIn: boolean | undefined;
}): Promise<boolean> {
  if (!auth.isLoaded || auth.isSignedIn) return false;
  await removeAllScopedPersisterCaches();
  return true;
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
// `bookTitle`/`subjectName` above) to be STRUCTURALLY incapable of carrying
// learner content: every field in the response schema — and every nested
// schema — must be a uuid/id, a z.enum, a number, a boolean, or a branded
// date field (isoDateField / isoDateSchema). ANY bare z.string() that is not
// a uuid DISQUALIFIES the whole family, even one that "looks" curriculum- or
// LLM-authored (topicTitle, milestoneTitle, bookTitle, subjectName, a
// free-text sublevel). This is a mechanical rule ON PURPOSE: per-string
// provenance judgments ("this title is only ever LLM-generated") repeatedly
// proved wrong at review, and the repo's canonical PII classifier
// (packages/schemas/src/pii-scrub.ts) classifies topicTitle et al. as raw
// learner content. Over-exclusion has ZERO acceptance cost — no family is
// required to be cached — so when in doubt, exclude. Add a new allow rule
// here ONLY after confirming the response schema (and its nested schemas)
// contain no bare non-uuid string field.
// ---------------------------------------------------------------------------

/**
 * Query-key roots (`queryKey[0]`) verified fully clean of PII, learner/mentor
 * prose, and `rawInput`. See file-level comment above for the standard each
 * entry must meet. Families that mix clean and PII-bearing sub-queries under
 * the same root are NOT here — they get a segment-aware predicate below
 * instead of a root-level allow.
 */
export const PERSISTABLE_QUERY_KEY_ROOTS: ReadonlySet<string> = new Set([
  'topic-sessions', // topicSessionSchema — id(uuid)/sessionType(enum)/durationSeconds(number)/createdAt(branded date). No string field.
  'subscription', // subscriptionSchema — tier/status/billingAccess enums, branded dates, booleans, integer counters. No string field.
  'subscription-status', // subscriptionStatusResponseSchema — tier/status enums + integer counters. No string field.
  // EXCLUDED under the structural rule (bare non-uuid string field): book-sessions
  // (bookSessionSchema.topicTitle, chapter), language-progress
  // (languageProgressSchema.currentSublevel, nextMilestone.milestoneTitle, sublevel),
  // revenuecat (raw SDK — no zod schema to mechanically verify, so string-freeness is
  // unprovable; RevenueCat's own native SDK cache is unaffected by excluding it here).
]);

/**
 * `progress` (queryKeys.progress.*) — NO segment-2 family survives the
 * structural rule, so this set is empty. `history` (progressHistorySchema)
 * was previously allowed, but its nested progressDataPointSchema.date is a
 * bare z.string() (not a branded date field) — a bare string cannot be
 * mechanically distinguished from free text, so it is disqualified. Every
 * other segment-2 value embeds `subjectName`/`subjectProgressSchema.name` or
 * an unconstrained metadata bag and was already excluded. The only
 * persistable shape under `'progress'` is the active-session key below
 * (sessionId uuid only).
 */
const PERSISTABLE_PROGRESS_SEGMENT2: ReadonlySet<string> = new Set([]);

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
 * `library` — NOTHING under this root is persistable. `library.retention`
 * (retentionCardWithMetaSchema = retentionCardSchema + topicTitle) carries a
 * bare topicTitle string (raw learner content per pii-scrub.ts) and is now
 * EXCLUDED; `library.conceptMastery` (mentorAdditions: z.array(z.string()) —
 * mentor prose) was already excluded. There is no library allow rule.
 */

/**
 * `retention` (queryKeys.retention.*) — only `topic` survives the structural
 * rule:
 *   - `topic` (topicRetentionResponseSchema = { card: retentionCardSchema } —
 *     card is all uuid/number/enum/branded-date, no string) — PERSISTED.
 *   - `subject` (subjectRetentionResponseSchema — retentionCardWithMetaSchema[])
 *     and `evaluate-eligibility` (evaluateEligibilitySchema) both carry a bare
 *     topicTitle string (raw learner content per pii-scrub.ts) — EXCLUDED.
 *   - `teaching-preference` (teachingPreferenceResponseDataSchema.nativeLanguage,
 *     a free-text string) — EXCLUDED.
 */
function isPersistableRetentionQuery(key: readonly unknown[]): boolean {
  return key[0] === 'retention' && key[1] === 'topic';
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
    isPersistableRetentionQuery(key) ||
    isPersistableSettingsQuery(key);
  if (!allowed) return false;
  return defaultShouldDehydrateQuery(query);
}
