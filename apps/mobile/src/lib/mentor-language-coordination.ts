import * as SecureStore from './secure-storage';
import { mentorLanguageExplicitOverrideKey } from './secure-store-keys';

interface CoordinationState {
  explicit: boolean;
  inFlightCount: number;
  persistencePending: boolean;
}

export interface ExplicitMentorLanguageOperation {
  profileId: string;
}

const coordinationByProfile = new Map<string, CoordinationState>();

export function beginExplicitMentorLanguageUpdate(
  profileId: string,
): ExplicitMentorLanguageOperation {
  const current = coordinationByProfile.get(profileId);
  if (current) {
    current.inFlightCount += 1;
  } else {
    coordinationByProfile.set(profileId, {
      explicit: false,
      inFlightCount: 1,
      persistencePending: false,
    });
  }
  return { profileId };
}

export function failExplicitMentorLanguageUpdate(
  operation: ExplicitMentorLanguageOperation,
): void {
  const current = coordinationByProfile.get(operation.profileId);
  if (!current) return;
  current.inFlightCount = Math.max(0, current.inFlightCount - 1);
  if (current.inFlightCount === 0 && !current.explicit) {
    coordinationByProfile.delete(operation.profileId);
  }
}

async function persistExplicitMarker(profileId: string): Promise<boolean> {
  try {
    const markerKey = mentorLanguageExplicitOverrideKey(profileId);
    await SecureStore.setItemAsync(markerKey, 'true');
    return true;
  } catch {
    return false;
  }
}

export async function completeExplicitMentorLanguageUpdate(
  operation: ExplicitMentorLanguageOperation,
): Promise<void> {
  const current = coordinationByProfile.get(operation.profileId);
  if (!current) return;

  current.inFlightCount = Math.max(0, current.inFlightCount - 1);
  current.explicit = true;
  current.persistencePending = true;
  current.persistencePending = !(await persistExplicitMarker(
    operation.profileId,
  ));
}

async function suppressFromCoordination(profileId: string): Promise<boolean> {
  const coordinated = coordinationByProfile.get(profileId);
  if (!coordinated) return false;
  if (coordinated.explicit && coordinated.persistencePending) {
    coordinated.persistencePending = !(await persistExplicitMarker(profileId));
  }
  return coordinated.explicit || coordinated.inFlightCount > 0;
}

export async function shouldSuppressMentorLanguageAutoSync(
  profileId: string,
): Promise<boolean> {
  if (await suppressFromCoordination(profileId)) return true;

  try {
    const explicitOverride = await SecureStore.getItemAsync(
      mentorLanguageExplicitOverrideKey(profileId),
    );
    // An explicit UI action can start while this async read is in flight.
    // Re-check memory before trusting the earlier unmarked result.
    if (await suppressFromCoordination(profileId)) return true;
    if (explicitOverride !== 'true') return false;
    coordinationByProfile.set(profileId, {
      explicit: true,
      inFlightCount: 0,
      persistencePending: false,
    });
    return true;
  } catch {
    // Skip only this attempt. Do not latch an unmarked profile in memory, so
    // the next language event can retry after local storage recovers.
    return true;
  }
}

export function clearMentorLanguageCoordination(
  profileIds: ReadonlyArray<string>,
): void {
  for (const profileId of profileIds) {
    coordinationByProfile.delete(profileId);
  }
}
