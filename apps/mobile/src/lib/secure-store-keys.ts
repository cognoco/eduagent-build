/**
 * Centralized SecureStore key barrel — WI-1090.
 *
 * This is the single source of truth for all SecureStore key strings used
 * across the mobile app. Every site that calls SecureStore.getItemAsync /
 * setItemAsync / deleteItemAsync must import its key from here instead of
 * defining a local constant.
 *
 * Char-safety rule: all key strings must contain only [a-zA-Z0-9._-].
 * The companion test `secure-store-keys.test.ts` enforces this automatically.
 *
 * Registering a new key here is NOT a substitute for registering it in
 * `sign-out-cleanup.ts`. Both are required — the barrel is the key
 * definition; sign-out-cleanup.ts is the lifecycle declaration.
 */

import { sanitizeSecureStoreKey } from './secure-storage';

// ---------------------------------------------------------------------------
// Global keys — single static strings, no profileId.
// These survive sign-out only when explicitly allowed (see sign-out-cleanup.ts
// GLOBAL_KEYS for which ones are cleared).
// ---------------------------------------------------------------------------

/** Pre-auth welcome-intro seen flag (device-scoped, no profileId). */
export const PRE_AUTH_INTRO_KEY = 'preAuthIntroSeen.v1';

// ---------------------------------------------------------------------------
// Per-profile key constructors — take a profileId and return the full key.
// ---------------------------------------------------------------------------

/**
 * Bookmark nudge tooltip dismissal (current dot-separator form, post-2026-05-23).
 * Sanitized: dot between prefix and profileId is valid, colons are replaced.
 */
export const bookmarkNudgeKey = (profileId: string): string =>
  sanitizeSecureStoreKey(`bookmark-nudge-shown.${profileId}`);

/**
 * Legacy bookmark nudge key (colon-separator form, pre-2026-05-23).
 * Kept for migration reads — sanitized to `bookmark-nudge-shown_<id>`.
 */
export const bookmarkNudgeLegacyKey = (profileId: string): string =>
  sanitizeSecureStoreKey(`bookmark-nudge-shown:${profileId}`);

/**
 * EarlyAdopterCard dismissal flag.
 * Key: `earlyAdopterDismissed_<profileId>`
 */
export const earlyAdopterDismissedKey = (profileId: string): string =>
  `earlyAdopterDismissed_${profileId}`;

/**
 * Dictation speed/pace preference.
 * Key: `dictation-pace-<profileId>`
 */
export const dictationPaceKey = (profileId: string): string =>
  `dictation-pace-${profileId}`;

/**
 * Dictation punctuation preference.
 * Key: `dictation-punctuation-<profileId>`
 */
export const dictationPunctuationKey = (profileId: string): string =>
  `dictation-punctuation-${profileId}`;

/**
 * App-store rating recall success count.
 * Key: `rating-recall-success-count-<profileId>`
 */
export const ratingRecallCountKey = (profileId: string): string =>
  `rating-recall-success-count-${profileId}`;

/**
 * App-store rating last-prompted timestamp.
 * Key: `rating-last-prompt-<profileId>`
 */
export const ratingLastPromptKey = (profileId: string): string =>
  `rating-last-prompt-${profileId}`;

/**
 * Parent-home orientation seen flag (per-profile).
 * Key: `mentomate_parent_home_seen_<profileId>` (sanitized).
 */
export const parentHomeSeenKey = (profileId: string): string =>
  sanitizeSecureStoreKey(`mentomate_parent_home_seen_${profileId}`);

/**
 * Post-session notification primer shown flag (per-profile).
 * Key: `notificationFirstAskShown_<profileId>` (sanitized).
 */
export const notificationFirstAskKey = (profileId: string): string =>
  sanitizeSecureStoreKey(`notificationFirstAskShown_${profileId}`);

/**
 * Guardian (parent) notification ask shown flag (per-profile).
 * Key: `guardianNotificationAskShown_<profileId>` (sanitized).
 */
export const guardianNotificationAskKey = (profileId: string): string =>
  sanitizeSecureStoreKey(`guardianNotificationAskShown_${profileId}`);

/**
 * Summary draft key prefix.
 * Full key: `summary-draft-<profileId>-<sessionId>`.
 * Multi-component key — sessionId cannot be enumerated at sign-out time.
 * Registered in sign-out-cleanup.ts REGISTRY_EXCEPTIONS.
 *
 * NOTE: This is a KEY_PREFIX, not a full key. Use `summaryDraftKey(pid, sid)`
 * to get the full key.
 */
export const SUMMARY_DRAFT_KEY_PREFIX = 'summary-draft';

/**
 * Full summary draft key for a specific profile+session pair.
 */
export const summaryDraftKey = (profileId: string, sessionId: string): string =>
  sanitizeSecureStoreKey(
    `${SUMMARY_DRAFT_KEY_PREFIX}-${profileId}-${sessionId}`,
  );
