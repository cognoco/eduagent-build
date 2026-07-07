import { useSyncExternalStore } from 'react';

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

export function completeMentorBornCeremony(requestId: number): void {
  if (activeRequest?.id !== requestId) return;
  activeRequest = null;
  emit();
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
  requestedProfileIds.clear();
  emit();
}
