import * as SecureStore from 'expo-secure-store';
import type { MilestoneTrackerState } from '../hooks/use-milestone-tracker';

const RECOVERY_KEY = 'session-recovery-marker';
export const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

export interface SessionRecoveryMarker {
  sessionId: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  mode?: string;
  milestoneTracker?: MilestoneTrackerState;
  updatedAt: string;
}

export async function writeSessionRecoveryMarker(
  marker: SessionRecoveryMarker
): Promise<void> {
  await SecureStore.setItemAsync(RECOVERY_KEY, JSON.stringify(marker));
}

export async function readSessionRecoveryMarker(): Promise<SessionRecoveryMarker | null> {
  const raw = await SecureStore.getItemAsync(RECOVERY_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessionRecoveryMarker;
    if (!parsed.sessionId || !parsed.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearSessionRecoveryMarker(): Promise<void> {
  await SecureStore.deleteItemAsync(RECOVERY_KEY);
}

export function isRecoveryMarkerFresh(
  marker: SessionRecoveryMarker,
  now = Date.now()
): boolean {
  const updatedAt = new Date(marker.updatedAt).getTime();
  return Number.isFinite(updatedAt) && now - updatedAt < RECOVERY_WINDOW_MS;
}
