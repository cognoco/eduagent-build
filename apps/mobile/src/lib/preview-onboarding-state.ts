import * as SecureStore from './secure-storage';

export const PREVIEW_INTENT_KEY = 'mentomate_preview_intent';
export const PREVIEW_TTL_MS = 60 * 60_000; // 1 hour

export type PreviewIntent = 'self' | 'child' | 'both' | 'not_sure';
export type PreviewPath = 'learner_value_prop' | 'parent_value_prop';
export type SaveTarget = 'self' | 'child' | 'both';

export interface PreviewOnboardingStateV0 {
  intent: PreviewIntent;
  path: PreviewPath;
  topicText?: string;
  bothPriority?: 'child_first' | 'self_first';
  preferredSaveTarget?: SaveTarget;
  createdAt: string;
  // [HIGH-4] Set inside the save wizard after the owner POST succeeds, so a
  // wizard remount mid-flight (refresh, OOM-kill, app background) can resume
  // without double-creating profiles. Cleared by clearPreviewState() on
  // wizard completion or sign-out.
  createdOwnerProfileId?: string;
}

interface StoredRecord extends PreviewOnboardingStateV0 {
  savedAt: number;
}

let memoryRecord: StoredRecord | null = null;

function isFresh(savedAt: number): boolean {
  return Date.now() - savedAt < PREVIEW_TTL_MS;
}

export async function getPreviewState(): Promise<PreviewOnboardingStateV0 | null> {
  if (memoryRecord) {
    if (isFresh(memoryRecord.savedAt)) {
      const { savedAt: _ignored, ...state } = memoryRecord;
      return state;
    }
    memoryRecord = null;
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(
      () => undefined,
    );
    return null;
  }

  try {
    const raw = await SecureStore.getItemAsync(PREVIEW_INTENT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    if (
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.intent !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(
        () => undefined,
      );
      return null;
    }

    if (!isFresh(parsed.savedAt)) {
      await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY).catch(
        () => undefined,
      );
      return null;
    }

    const { savedAt: _ignored, ...state } = parsed as StoredRecord;
    memoryRecord = parsed as StoredRecord;
    return state as PreviewOnboardingStateV0;
  } catch {
    return null;
  }
}

export async function setPreviewState(
  state: PreviewOnboardingStateV0,
): Promise<void> {
  const record: StoredRecord = { ...state, savedAt: Date.now() };
  memoryRecord = record;
  try {
    // [SEC] WHEN_UNLOCKED_THIS_DEVICE_ONLY excludes from iCloud Keychain sync
    // and device-to-device backups; bounds the topic-text leak surface to
    // the originating device. Spec §Preview State (Minimal).
    await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(record), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Non-fatal; in-memory state still survives the warm session.
  }
}

export async function clearPreviewState(): Promise<void> {
  memoryRecord = null;
  try {
    await SecureStore.deleteItemAsync(PREVIEW_INTENT_KEY);
  } catch {
    // Non-fatal.
  }
}

/**
 * [LOW-1] Dev/E2E only. Writes a preview-state record whose `savedAt` is
 * artificially backdated by `staleMs` milliseconds, so Maestro flows can
 * simulate a TTL-expired record without waiting an hour.
 *
 * Mirrors `seedPendingAuthRedirectForTesting` (pending-auth-redirect.ts:115).
 * Throws in production builds or when EXPO_PUBLIC_E2E !== 'true'.
 */
export async function seedPreviewStateForTesting(
  state: PreviewOnboardingStateV0,
  staleMs: number,
): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.EXPO_PUBLIC_E2E !== 'true'
  ) {
    throw new Error('seedPreviewStateForTesting is dev-only');
  }
  const record: StoredRecord = { ...state, savedAt: Date.now() - staleMs };
  memoryRecord = record;
  await SecureStore.setItemAsync(PREVIEW_INTENT_KEY, JSON.stringify(record), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
