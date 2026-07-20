import * as SecureStore from './secure-storage';
import { mentorLanguageExplicitOverrideKey } from './secure-store-keys';

interface CoordinationState {
  explicit: boolean;
  inFlightCount: number;
  lifecycle: ProfileLifecycle;
  persistencePending: boolean;
}

interface ProfileLifecycle {
  closed: boolean;
}

interface MentorLanguageUpdateOperationBase {
  profileId: string;
}

export interface AutomaticMentorLanguageOperation extends MentorLanguageUpdateOperationBase {
  kind: 'automatic';
}

export interface ExplicitMentorLanguageOperation extends MentorLanguageUpdateOperationBase {
  kind: 'explicit';
}

export type MentorLanguageUpdateOperation =
  | AutomaticMentorLanguageOperation
  | ExplicitMentorLanguageOperation;

interface OperationMetadata {
  lifecycle: ProfileLifecycle;
  release: () => void;
  settled: boolean;
  tail: Promise<void>;
  waitForTurn: Promise<void>;
}

const coordinationByProfile = new Map<string, CoordinationState>();
const lifecycleByProfile = new Map<string, ProfileLifecycle>();
const pendingMarkerWritesByProfile = new Map<string, Set<Promise<void>>>();
const writeTailByProfile = new Map<string, Promise<void>>();
const operationMetadata = new WeakMap<
  MentorLanguageUpdateOperation,
  OperationMetadata
>();

function getOrCreateLifecycle(profileId: string): ProfileLifecycle {
  const current = lifecycleByProfile.get(profileId);
  if (current) return current;
  const created: ProfileLifecycle = { closed: false };
  lifecycleByProfile.set(profileId, created);
  return created;
}

function isLifecycleCurrent(
  profileId: string,
  lifecycle: ProfileLifecycle,
): boolean {
  return lifecycleByProfile.get(profileId) === lifecycle && !lifecycle.closed;
}

function enqueueMentorLanguageUpdate(
  profileId: string,
  kind: MentorLanguageUpdateOperation['kind'],
): MentorLanguageUpdateOperation {
  const lifecycle = getOrCreateLifecycle(profileId);
  const waitForTurn = writeTailByProfile.get(profileId) ?? Promise.resolve();
  let release!: () => void;
  const completion = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = waitForTurn.then(() => completion);
  const operation: MentorLanguageUpdateOperation = { profileId, kind };
  writeTailByProfile.set(profileId, tail);
  operationMetadata.set(operation, {
    lifecycle,
    release,
    settled: false,
    tail,
    waitForTurn,
  });
  return operation;
}

export function beginExplicitMentorLanguageUpdate(
  profileId: string,
): ExplicitMentorLanguageOperation {
  const lifecycle = getOrCreateLifecycle(profileId);
  const current = coordinationByProfile.get(profileId);
  if (current?.lifecycle === lifecycle && !lifecycle.closed) {
    current.inFlightCount += 1;
  } else if (!lifecycle.closed) {
    coordinationByProfile.set(profileId, {
      explicit: false,
      inFlightCount: 1,
      lifecycle,
      persistencePending: false,
    });
  }
  return enqueueMentorLanguageUpdate(
    profileId,
    'explicit',
  ) as ExplicitMentorLanguageOperation;
}

export function beginAutomaticMentorLanguageUpdate(
  profileId: string,
): MentorLanguageUpdateOperation | null {
  const lifecycle = getOrCreateLifecycle(profileId);
  if (lifecycle.closed) return null;
  const current = coordinationByProfile.get(profileId);
  if (current?.explicit || (current?.inFlightCount ?? 0) > 0) return null;
  return enqueueMentorLanguageUpdate(profileId, 'automatic');
}

export async function waitForMentorLanguageUpdateTurn(
  operation: MentorLanguageUpdateOperation,
): Promise<boolean> {
  const metadata = operationMetadata.get(operation);
  if (!metadata) return false;
  await metadata.waitForTurn;
  return isLifecycleCurrent(operation.profileId, metadata.lifecycle);
}

export function finishMentorLanguageUpdate(
  operation: MentorLanguageUpdateOperation,
): void {
  const metadata = operationMetadata.get(operation);
  if (!metadata || metadata.settled) return;
  metadata.settled = true;
  metadata.release();
  operationMetadata.delete(operation);
  void metadata.tail.then(() => {
    if (writeTailByProfile.get(operation.profileId) === metadata.tail) {
      writeTailByProfile.delete(operation.profileId);
    }
  });
}

export function failExplicitMentorLanguageUpdate(
  operation: ExplicitMentorLanguageOperation,
): void {
  const metadata = operationMetadata.get(operation);
  const current = coordinationByProfile.get(operation.profileId);
  if (metadata && current?.lifecycle === metadata.lifecycle) {
    current.inFlightCount = Math.max(0, current.inFlightCount - 1);
    if (current.inFlightCount === 0 && !current.explicit) {
      coordinationByProfile.delete(operation.profileId);
    }
  }
  finishMentorLanguageUpdate(operation);
}

async function persistExplicitMarker(
  profileId: string,
  lifecycle: ProfileLifecycle,
): Promise<boolean> {
  if (!isLifecycleCurrent(profileId, lifecycle)) return false;
  const markerKey = mentorLanguageExplicitOverrideKey(profileId);
  const write = SecureStore.setItemAsync(markerKey, 'true');
  const pendingWrites =
    pendingMarkerWritesByProfile.get(profileId) ?? new Set<Promise<void>>();
  pendingWrites.add(write);
  pendingMarkerWritesByProfile.set(profileId, pendingWrites);
  try {
    await write;
    return isLifecycleCurrent(profileId, lifecycle);
  } catch {
    return false;
  } finally {
    pendingWrites.delete(write);
    if (pendingWrites.size === 0) {
      pendingMarkerWritesByProfile.delete(profileId);
    }
  }
}

export async function completeExplicitMentorLanguageUpdate(
  operation: ExplicitMentorLanguageOperation,
): Promise<void> {
  const metadata = operationMetadata.get(operation);
  const current = coordinationByProfile.get(operation.profileId);
  if (!metadata || current?.lifecycle !== metadata.lifecycle) {
    finishMentorLanguageUpdate(operation);
    return;
  }

  current.inFlightCount = Math.max(0, current.inFlightCount - 1);
  current.explicit = true;
  current.persistencePending = true;
  current.persistencePending = !(await persistExplicitMarker(
    operation.profileId,
    metadata.lifecycle,
  ));
  finishMentorLanguageUpdate(operation);
}

async function suppressFromCoordination(
  profileId: string,
  lifecycle: ProfileLifecycle,
): Promise<boolean> {
  const coordinated = coordinationByProfile.get(profileId);
  if (!coordinated || coordinated.lifecycle !== lifecycle) return false;
  if (coordinated.explicit && coordinated.persistencePending) {
    coordinated.persistencePending = !(await persistExplicitMarker(
      profileId,
      lifecycle,
    ));
    if (!isLifecycleCurrent(profileId, lifecycle)) return true;
  }
  return coordinated.explicit || coordinated.inFlightCount > 0;
}

export async function shouldSuppressMentorLanguageAutoSync(
  profileId: string,
): Promise<boolean> {
  const lifecycle = getOrCreateLifecycle(profileId);
  if (lifecycle.closed) return true;
  if (await suppressFromCoordination(profileId, lifecycle)) return true;
  if (!isLifecycleCurrent(profileId, lifecycle)) return true;

  try {
    const explicitOverride = await SecureStore.getItemAsync(
      mentorLanguageExplicitOverrideKey(profileId),
    );
    if (!isLifecycleCurrent(profileId, lifecycle)) return true;
    // An explicit UI action can start while this async read is in flight.
    // Re-check memory before trusting the earlier unmarked result.
    if (await suppressFromCoordination(profileId, lifecycle)) return true;
    if (!isLifecycleCurrent(profileId, lifecycle)) return true;
    if (explicitOverride !== 'true') return false;
    coordinationByProfile.set(profileId, {
      explicit: true,
      inFlightCount: 0,
      lifecycle,
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
    lifecycleByProfile.delete(profileId);
    writeTailByProfile.delete(profileId);
  }
}

export function clearMentorLanguageStateOnSignOut(
  profileIds: ReadonlyArray<string>,
): Promise<void> {
  const cleanups = Array.from(new Set(profileIds.filter(Boolean))).map(
    async (profileId) => {
      const lifecycle = getOrCreateLifecycle(profileId);
      lifecycle.closed = true;
      coordinationByProfile.delete(profileId);
      const pendingWrites = Array.from(
        pendingMarkerWritesByProfile.get(profileId) ?? [],
      );
      await Promise.allSettled(pendingWrites);
      try {
        await SecureStore.deleteItemAsync(
          mentorLanguageExplicitOverrideKey(profileId),
        );
      } catch {
        // Sign-out cleanup is best-effort; the central cleanup applies the
        // same per-key failure policy to every registered key.
      } finally {
        if (lifecycleByProfile.get(profileId) === lifecycle) {
          lifecycleByProfile.delete(profileId);
        }
      }
    },
  );
  return Promise.all(cleanups).then(() => undefined);
}
