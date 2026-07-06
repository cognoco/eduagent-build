import { useEffect, useState } from 'react';

export type MentorBornCeremonyReason = 'first-profile-created';

export type MentorBornCeremonyRequest = {
  id: number;
  reason: MentorBornCeremonyReason;
};

type Listener = () => void;

let activeRequest: MentorBornCeremonyRequest | null = null;
let nextRequestId = 0;
let requestCount = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function requestMentorBornCeremony(
  reason: MentorBornCeremonyReason,
): MentorBornCeremonyRequest {
  if (activeRequest) return activeRequest;

  const request = {
    id: ++nextRequestId,
    reason,
  };
  activeRequest = request;
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
  const [request, setRequest] = useState(activeRequest);

  useEffect(() => {
    const listener = () => setRequest(activeRequest);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return request;
}

export function getMentorBornCeremonySnapshot(): {
  activeRequest: MentorBornCeremonyRequest | null;
  requestCount: number;
} {
  return {
    activeRequest,
    requestCount,
  };
}

export function __resetMentorBornCeremonyForTests(): void {
  activeRequest = null;
  nextRequestId = 0;
  requestCount = 0;
  listeners.clear();
}
