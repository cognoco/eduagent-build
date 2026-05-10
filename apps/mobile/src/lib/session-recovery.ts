import * as SecureStore from './secure-storage';
import { sanitizeSecureStoreKey } from './secure-storage';
import type { MilestoneTrackerState } from '../hooks/use-milestone-tracker';

const RECOVERY_KEY = 'session-recovery-marker';
export const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

export interface SessionRecoveryMarker {
  sessionId: string;
  profileId?: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName?: string;
  mode?: string;
  milestoneTracker?: MilestoneTrackerState;
  updatedAt: string;
}

function getRecoveryKey(profileId?: string | null): string {
  // [I-4] Sanitize profileId before interpolating into a SecureStore key.
  return profileId
    ? sanitizeSecureStoreKey(`${RECOVERY_KEY}-${profileId}`)
    : RECOVERY_KEY;
}

export async function writeSessionRecoveryMarker(
  marker: SessionRecoveryMarker,
  profileId?: string | null,
): Promise<void> {
  await SecureStore.setItemAsync(
    getRecoveryKey(profileId),
    JSON.stringify(marker),
  );
}

export async function readSessionRecoveryMarker(
  profileId?: string | null,
): Promise<SessionRecoveryMarker | null> {
  const raw = await SecureStore.getItemAsync(getRecoveryKey(profileId));

  // Legacy fallback: if no marker found under the profileId-scoped key,
  // check the old unscoped key for pre-migration markers.
  const effectiveRaw =
    raw ??
    (profileId
      ? await SecureStore.getItemAsync(RECOVERY_KEY).catch(() => null)
      : null);
  if (!effectiveRaw) return null;

  try {
    const parsed = JSON.parse(effectiveRaw) as SessionRecoveryMarker;
    if (!parsed.sessionId || !parsed.updatedAt) return null;
    // Drop any marker that is not explicitly scoped to the active profile.
    // This rejects two cases:
    //   1. scoped marker for a different profile (cross-profile contamination)
    //   2. unscoped legacy marker with no profileId field — on a shared
    //      device, profile A's legacy marker would otherwise be silently
    //      claimed (and migrated) by profile B on first read.
    // The one-time UX cost of legacy markers being lost on upgrade is
    // accepted; security on shared devices is non-negotiable.
    if (profileId && parsed.profileId !== profileId) {
      // Best-effort: drop the unscoped legacy key so this rejection path
      // only fires once per device/upgrade.
      if (!raw) {
        await SecureStore.deleteItemAsync(RECOVERY_KEY).catch(() => undefined);
      }
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn('[SessionRecovery] Failed to parse recovery marker:', err);
    return null;
  }
}

export async function clearSessionRecoveryMarker(
  profileId?: string | null,
): Promise<void> {
  await SecureStore.deleteItemAsync(getRecoveryKey(profileId));
  // Also clean up the legacy unscoped key if it exists, preventing orphaned entries.
  if (profileId) {
    await SecureStore.deleteItemAsync(RECOVERY_KEY).catch(() => undefined);
  }
}

export function isRecoveryMarkerFresh(
  marker: SessionRecoveryMarker,
  now = Date.now(),
): boolean {
  const updatedAt = new Date(marker.updatedAt).getTime();
  return Number.isFinite(updatedAt) && now - updatedAt < RECOVERY_WINDOW_MS;
}
