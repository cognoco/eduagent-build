import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';
import { Sentry } from './sentry';

const KEY_PREFIX = 'summary-draft';
// Drafts older than this are treated as stale and discarded on read.
// A reflection the user never resolved in a week is almost certainly
// abandoned context; keeping it around risks surfacing stale text as a
// "draft" a user doesn't remember writing.
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SummaryDraft {
  profileId: string;
  sessionId: string;
  content: string;
  updatedAt: string;
}

function getDraftKey(profileId: string, sessionId: string): string {
  // [I-5] Sanitize both components — iOS SecureStore keys must only contain
  // [a-zA-Z0-9._-]. Future sessionId formats (base64, timestamp+uuid) may
  // include characters that crash setItemAsync on iOS.
  return sanitizeSecureStoreKey(`${KEY_PREFIX}-${profileId}-${sessionId}`);
}

function reportDraftFailure(
  scope: 'read' | 'write' | 'clear',
  err: unknown
): void {
  console.warn(`[SummaryDraft] SecureStore ${scope} failed:`, err);
  Sentry.captureException(err, {
    tags: { feature: 'summary_draft', secure_store_scope: scope },
  });
}

export async function writeSummaryDraft(
  profileId: string,
  sessionId: string,
  content: string
): Promise<void> {
  const payload: SummaryDraft = {
    profileId,
    sessionId,
    content,
    updatedAt: new Date().toISOString(),
  };
  try {
    await SecureStore.setItemAsync(
      getDraftKey(profileId, sessionId),
      JSON.stringify(payload)
    );
  } catch (err) {
    reportDraftFailure('write', err);
  }
}

export async function readSummaryDraft(
  profileId: string,
  sessionId: string,
  now = Date.now()
): Promise<SummaryDraft | null> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(getDraftKey(profileId, sessionId));
  } catch (err) {
    reportDraftFailure('read', err);
    return null;
  }
  if (!raw) return null;

  let parsed: SummaryDraft;
  try {
    parsed = JSON.parse(raw) as SummaryDraft;
  } catch (err) {
    reportDraftFailure('read', err);
    return null;
  }

  if (
    !parsed ||
    typeof parsed.content !== 'string' ||
    typeof parsed.updatedAt !== 'string' ||
    parsed.profileId !== profileId ||
    parsed.sessionId !== sessionId
  ) {
    return null;
  }

  const updatedAt = new Date(parsed.updatedAt).getTime();
  if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) {
    void clearSummaryDraft(profileId, sessionId);
    return null;
  }

  return parsed;
}

export async function clearSummaryDraft(
  profileId: string,
  sessionId: string
): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(getDraftKey(profileId, sessionId));
  } catch (err) {
    reportDraftFailure('clear', err);
  }
}
