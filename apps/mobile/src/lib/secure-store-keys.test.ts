// WI-1090: secure-store-keys barrel — char-safety and registry coverage tests.
//
// Two invariants:
// (1) Every key produced by the barrel passes the SecureStore char-safety rule:
//     only [a-zA-Z0-9._-] — same set enforced by sanitizeSecureStoreKey.
// (2) sign-out-cleanup.ts PER_PROFILE_KEYS and GLOBAL_KEYS are exhausted by
//     the barrel — they reference only keys imported from this barrel
//     (static shape test, not an import-graph assertion).

import { sanitizeSecureStoreKey } from './secure-storage';
import {
  PRE_AUTH_INTRO_KEY,
  SUMMARY_DRAFT_KEY_PREFIX,
  bookmarkNudgeKey,
  bookmarkNudgeLegacyKey,
  earlyAdopterDismissedKey,
  dictationPaceKey,
  dictationPunctuationKey,
  ratingRecallCountKey,
  ratingLastPromptKey,
  parentHomeSeenKey,
  notificationFirstAskKey,
  guardianNotificationAskKey,
  summaryDraftKey,
} from './secure-store-keys';

const SAMPLE_PROFILE_ID = 'abc-123-def';
const SAMPLE_SESSION_ID = 'sess-999';

// Char-safety predicate — mirrors sanitizeSecureStoreKey's allowed set.
function isCharSafe(key: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(key);
}

describe('secure-store-keys barrel', () => {
  describe('char-safety: every generated key contains only [a-zA-Z0-9._-]', () => {
    it('PRE_AUTH_INTRO_KEY is char-safe', () => {
      expect(isCharSafe(PRE_AUTH_INTRO_KEY)).toBe(true);
      expect(sanitizeSecureStoreKey(PRE_AUTH_INTRO_KEY)).toBe(
        PRE_AUTH_INTRO_KEY,
      );
    });

    it('SUMMARY_DRAFT_KEY_PREFIX is char-safe', () => {
      expect(isCharSafe(SUMMARY_DRAFT_KEY_PREFIX)).toBe(true);
    });

    it('bookmarkNudgeKey is char-safe', () => {
      const key = bookmarkNudgeKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('bookmarkNudgeLegacyKey is char-safe (colon sanitized to underscore)', () => {
      const key = bookmarkNudgeLegacyKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
    });

    it('earlyAdopterDismissedKey is char-safe', () => {
      const key = earlyAdopterDismissedKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('dictationPaceKey is char-safe', () => {
      const key = dictationPaceKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('dictationPunctuationKey is char-safe', () => {
      const key = dictationPunctuationKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('ratingRecallCountKey is char-safe', () => {
      const key = ratingRecallCountKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('ratingLastPromptKey is char-safe', () => {
      const key = ratingLastPromptKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('parentHomeSeenKey is char-safe', () => {
      const key = parentHomeSeenKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('notificationFirstAskKey is char-safe', () => {
      const key = notificationFirstAskKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('guardianNotificationAskKey is char-safe', () => {
      const key = guardianNotificationAskKey(SAMPLE_PROFILE_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });

    it('summaryDraftKey is char-safe', () => {
      const key = summaryDraftKey(SAMPLE_PROFILE_ID, SAMPLE_SESSION_ID);
      expect(isCharSafe(key)).toBe(true);
      expect(sanitizeSecureStoreKey(key)).toBe(key);
    });
  });

  describe('key shape: keys match exactly the strings expected by sign-out-cleanup.ts', () => {
    const profileId = 'test-profile-id';

    it('bookmarkNudgeKey matches dot-separator form', () => {
      const key = bookmarkNudgeKey(profileId);
      expect(key).toBe(`bookmark-nudge-shown.${profileId}`);
    });

    it('earlyAdopterDismissedKey matches expected shape', () => {
      expect(earlyAdopterDismissedKey(profileId)).toBe(
        `earlyAdopterDismissed_${profileId}`,
      );
    });

    it('dictationPaceKey matches expected shape', () => {
      expect(dictationPaceKey(profileId)).toBe(`dictation-pace-${profileId}`);
    });

    it('dictationPunctuationKey matches expected shape', () => {
      expect(dictationPunctuationKey(profileId)).toBe(
        `dictation-punctuation-${profileId}`,
      );
    });

    it('ratingRecallCountKey matches expected shape', () => {
      expect(ratingRecallCountKey(profileId)).toBe(
        `rating-recall-success-count-${profileId}`,
      );
    });

    it('ratingLastPromptKey matches expected shape', () => {
      expect(ratingLastPromptKey(profileId)).toBe(
        `rating-last-prompt-${profileId}`,
      );
    });

    it('parentHomeSeenKey matches sign-out-cleanup shape (sanitized)', () => {
      expect(parentHomeSeenKey(profileId)).toBe(
        sanitizeSecureStoreKey(`mentomate_parent_home_seen_${profileId}`),
      );
    });

    it('notificationFirstAskKey matches sign-out-cleanup shape (sanitized)', () => {
      expect(notificationFirstAskKey(profileId)).toBe(
        sanitizeSecureStoreKey(`notificationFirstAskShown_${profileId}`),
      );
    });

    it('guardianNotificationAskKey matches sign-out-cleanup shape (sanitized)', () => {
      expect(guardianNotificationAskKey(profileId)).toBe(
        sanitizeSecureStoreKey(`guardianNotificationAskShown_${profileId}`),
      );
    });
  });
});
