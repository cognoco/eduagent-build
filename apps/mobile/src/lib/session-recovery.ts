import * as SecureStore from 'expo-secure-store';
import type { MilestoneTrackerState } from '../hooks/use-milestone-tracker';

const RECOVERY_KEY = 'session-recovery-marker';
export const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

export interface SessionRecoveryMarker {
  sessionId: string;
  profileId?: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  mode?: string;
  milestoneTracker?: MilestoneTrackerState;
  updatedAt: string;
}

function getRecoveryKey(profileId?: string | null): string {
  return profileId ? `${RECOVERY_KEY}:${profileId}` : RECOVERY_KEY;
}

export async function writeSessionRecoveryMarker(
  marker: SessionRecoveryMarker,
  profileId?: string | null
): Promise<void> {
  await SecureStore.setItemAsync(
    getRecoveryKey(profileId),
    JSON.stringify(marker)
  );
}

export async function readSessionRecoveryMarker(
  profileId?: string | null
): Promise<SessionRecoveryMarker | null> {
  const raw =
    (await SecureStore.getItemAsync(getRecoveryKey(profileId))) ??
    (profileId ? await SecureStore.getItemAsync(RECOVERY_KEY) : null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessionRecoveryMarker;
    if (!parsed.sessionId || !parsed.updatedAt) return null;
    if (profileId && parsed.profileId && parsed.profileId !== profileId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSessionRecoveryMarker(
  profileId?: string | null
): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(getRecoveryKey(profileId)),
    ...(profileId ? [SecureStore.deleteItemAsync(RECOVERY_KEY)] : []),
  ]);
}

export function isRecoveryMarkerFresh(
  marker: SessionRecoveryMarker,
  now = Date.now()
): boolean {
  const updatedAt = new Date(marker.updatedAt).getTime();
  return Number.isFinite(updatedAt) && now - updatedAt < RECOVERY_WINDOW_MS;
}
