import { useSyncExternalStore } from 'react';
import * as SecureStore from './secure-storage';
import {
  MENTOR_BORN_PENDING_KEY,
  mentorBirthSeenKey,
} from './secure-store-keys';

export type MentorBornCeremonyReason = 'first-profile-created';

export type MentorBornCeremonyRequest = {
  id: number;
  profileId: string;
  reason: MentorBornCeremonyReason;
};

type MentorBornCeremonyRequestInput = {
  profileId: string;
  reason: MentorBornCeremonyReason;
};

type Listener = () => void;

let activeRequest: MentorBornCeremonyRequest | null = null;
let nextRequestId = 0;
let requestCount = 0;
const requestedProfileIds = new Set<string>();
const listeners = new Set<Listener>();
let restorePromise: Promise<void> | null = null;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getActiveRequest() {
  return activeRequest;
}

export function requestMentorBornCeremony(
  input: MentorBornCeremonyRequestInput,
): MentorBornCeremonyRequest | null {
  if (requestedProfileIds.has(input.profileId)) {
    return activeRequest?.profileId === input.profileId ? activeRequest : null;
  }
  if (activeRequest) return activeRequest;

  const request = {
    id: ++nextRequestId,
    profileId: input.profileId,
    reason: input.reason,
  };
  activeRequest = request;
  requestedProfileIds.add(input.profileId);
  requestCount += 1;
  emit();
  return request;
}

function parsePendingRequest(
  raw: string,
): MentorBornCeremonyRequestInput | null {
  try {
    const value = JSON.parse(raw) as Partial<MentorBornCeremonyRequestInput>;
    if (
      typeof value.profileId !== 'string' ||
      value.reason !== 'first-profile-created'
    ) {
      return null;
    }
    return { profileId: value.profileId, reason: value.reason };
  } catch {
    return null;
  }
}

export async function queueMentorBornCeremony(
  input: MentorBornCeremonyRequestInput,
): Promise<MentorBornCeremonyRequest | null> {
  try {
    const seen = await SecureStore.getItemAsync(
      mentorBirthSeenKey(input.profileId),
    );
    if (seen === 'true') {
      await SecureStore.deleteItemAsync(MENTOR_BORN_PENDING_KEY);
      return null;
    }
    await SecureStore.setItemAsync(
      MENTOR_BORN_PENDING_KEY,
      JSON.stringify(input),
    );
  } catch (error) {
    console.warn('[MentorBorn] Durable queue unavailable:', error);
  }

  return requestMentorBornCeremony(input);
}

export function restorePendingMentorBornCeremony(): Promise<void> {
  if (activeRequest) return Promise.resolve();
  if (restorePromise) return restorePromise;

  restorePromise = (async () => {
    try {
      const raw = await SecureStore.getItemAsync(MENTOR_BORN_PENDING_KEY);
      if (!raw || activeRequest) return;
      const pending = parsePendingRequest(raw);
      if (!pending) {
        await SecureStore.deleteItemAsync(MENTOR_BORN_PENDING_KEY);
        return;
      }
      const seen = await SecureStore.getItemAsync(
        mentorBirthSeenKey(pending.profileId),
      );
      if (seen === 'true') {
        await SecureStore.deleteItemAsync(MENTOR_BORN_PENDING_KEY);
        return;
      }
      requestMentorBornCeremony(pending);
    } catch (error) {
      console.warn('[MentorBorn] Durable restore unavailable:', error);
    }
  })().finally(() => {
    restorePromise = null;
  });

  return restorePromise;
}

export function completeMentorBornCeremony(requestId: number): void {
  if (activeRequest?.id !== requestId) return;
  activeRequest = null;
  emit();
}

export async function completeMentorBornCeremonyDurably(
  requestId: number,
): Promise<void> {
  const request = activeRequest;
  if (!request || request.id !== requestId) return;

  // Do not let storage latency keep a full-screen ceremony mounted. The
  // captured request carries the identity needed for the durable latch.
  completeMentorBornCeremony(requestId);

  try {
    const seenKey = mentorBirthSeenKey(request.profileId);
    await SecureStore.setItemAsync(seenKey, 'true');
    await SecureStore.deleteItemAsync(MENTOR_BORN_PENDING_KEY);
  } catch (error) {
    console.warn('[MentorBorn] Durable completion unavailable:', error);
  }
}

export function useMentorBornCeremonyRequest(): MentorBornCeremonyRequest | null {
  return useSyncExternalStore(subscribe, getActiveRequest, getActiveRequest);
}

export function getMentorBornCeremonySnapshot(): {
  activeRequest: MentorBornCeremonyRequest | null;
  requestCount: number;
  requestedProfileIds: string[];
} {
  return {
    activeRequest,
    requestCount,
    requestedProfileIds: [...requestedProfileIds],
  };
}

export function __resetMentorBornCeremonyForTests(): void {
  activeRequest = null;
  nextRequestId = 0;
  requestCount = 0;
  restorePromise = null;
  requestedProfileIds.clear();
  emit();
}
