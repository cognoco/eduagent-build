import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { withLock } from './async-mutex';

export type OutboxFlow = 'session' | 'interview';

export const MAX_OUTBOX_ATTEMPTS = 3;

export interface OutboxEntry {
  id: string;
  flow: OutboxFlow;
  surfaceKey: string;
  content: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: 'pending' | 'permanently-failed';
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

interface EnqueueInput {
  profileId: string;
  flow: OutboxFlow;
  surfaceKey: string;
  content: string;
  metadata?: Record<string, unknown>;
  id?: string;
}

function storageKey(profileId: string, flow: OutboxFlow): string {
  return `outbox-${profileId}-${flow}`;
}

async function readEntries(
  profileId: string,
  flow: OutboxFlow
): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(storageKey(profileId, flow));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeEntries(
  profileId: string,
  flow: OutboxFlow,
  entries: OutboxEntry[]
): Promise<void> {
  await AsyncStorage.setItem(
    storageKey(profileId, flow),
    JSON.stringify(entries)
  );
}

export async function listEntries(
  profileId: string,
  flow: OutboxFlow
): Promise<OutboxEntry[]> {
  return withLock(storageKey(profileId, flow), async () => {
    const entries = await readEntries(profileId, flow);
    return [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

export async function listPending(
  profileId: string,
  flow: OutboxFlow
): Promise<OutboxEntry[]> {
  const entries = await listEntries(profileId, flow);
  return entries.filter((entry) => entry.status === 'pending');
}

export async function listPermanentlyFailed(
  profileId: string,
  flow: OutboxFlow
): Promise<OutboxEntry[]> {
  const entries = await listEntries(profileId, flow);
  return entries.filter((entry) => entry.status === 'permanently-failed');
}

export async function getOutboxEntry(
  profileId: string,
  flow: OutboxFlow,
  id: string
): Promise<OutboxEntry | null> {
  const entries = await listEntries(profileId, flow);
  return entries.find((entry) => entry.id === id) ?? null;
}

export async function enqueue(input: EnqueueInput): Promise<OutboxEntry> {
  return withLock(storageKey(input.profileId, input.flow), async () => {
    const entries = await readEntries(input.profileId, input.flow);
    if (input.id) {
      const existing = entries.find((entry) => entry.id === input.id);
      if (existing) {
        return existing;
      }
    }

    const entry: OutboxEntry = {
      // [I6] expo-crypto's randomUUID() is RFC4122 v4 — the dedup key the
      // server stores against sessionEvents.clientId / KV idempotency. The
      // global `crypto` is NOT defined in Hermes (RN engine), so use the
      // expo-crypto polyfill. Date.now()+Math.random has a realistic
      // collision risk under burst-replay: ~36 bits of randomness in 8
      // base36 chars, and Math.random is not collision-safe across tabs/JS
      // contexts. RFC4122 v4 gives ~122 bits and zero collision risk.
      id: input.id ?? Crypto.randomUUID(),
      flow: input.flow,
      surfaceKey: input.surfaceKey,
      content: input.content,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      status: 'pending',
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    await writeEntries(input.profileId, input.flow, [...entries, entry]);
    return entry;
  });
}

export async function beginAttempt(
  profileId: string,
  flow: OutboxFlow,
  id: string
): Promise<OutboxEntry | null> {
  return withLock(storageKey(profileId, flow), async () => {
    const entries = await readEntries(profileId, flow);
    const nextEntries = entries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            attempts: entry.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
          }
        : entry
    );
    await writeEntries(profileId, flow, nextEntries);
    return nextEntries.find((entry) => entry.id === id) ?? null;
  });
}

export async function markConfirmed(
  profileId: string,
  flow: OutboxFlow,
  id: string
): Promise<void> {
  await withLock(storageKey(profileId, flow), async () => {
    const entries = await readEntries(profileId, flow);
    await writeEntries(
      profileId,
      flow,
      entries.filter((entry) => entry.id !== id)
    );
  });
}

export async function recordFailure(
  profileId: string,
  flow: OutboxFlow,
  id: string,
  reason: string
): Promise<OutboxEntry | null> {
  return withLock(storageKey(profileId, flow), async () => {
    const entries = await readEntries(profileId, flow);
    const nextEntries = entries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            failureReason: reason,
            status:
              entry.attempts >= MAX_OUTBOX_ATTEMPTS
                ? ('permanently-failed' as const)
                : entry.status,
          }
        : entry
    );
    await writeEntries(profileId, flow, nextEntries);
    return nextEntries.find((entry) => entry.id === id) ?? null;
  });
}

export async function deletePermanentlyFailed(
  profileId: string,
  flow: OutboxFlow,
  id: string
): Promise<void> {
  await withLock(storageKey(profileId, flow), async () => {
    const entries = await readEntries(profileId, flow);
    await writeEntries(
      profileId,
      flow,
      entries.filter((entry) => entry.id !== id)
    );
  });
}

export async function drain(
  profileId: string,
  flow: OutboxFlow,
  handler: (entry: OutboxEntry) => Promise<void>
): Promise<number> {
  const entries = await listPending(profileId, flow);
  for (const entry of entries) {
    try {
      await handler(entry);
    } catch {
      // Handler errors are non-fatal — continue draining remaining entries.
      // Callers that need per-entry error handling (e.g. recordFailure + Sentry)
      // should catch inside their handler; this catch prevents a single throw
      // from aborting the entire drain loop.
    }
  }
  return entries.length;
}

export async function escalate(
  profileId: string,
  flow: OutboxFlow,
  postToSupport: (body: {
    entries: Array<{
      id: string;
      flow: OutboxFlow;
      surfaceKey: string;
      content: string;
      attempts: number;
      firstAttemptedAt: string;
      failureReason?: string;
    }>;
  }) => Promise<void>
): Promise<{ escalated: number }> {
  const failed = await listPermanentlyFailed(profileId, flow);
  if (failed.length === 0) {
    return { escalated: 0 };
  }

  await postToSupport({
    entries: failed.map((entry) => ({
      id: entry.id,
      flow: entry.flow,
      surfaceKey: entry.surfaceKey,
      content: entry.content,
      attempts: entry.attempts,
      firstAttemptedAt: entry.createdAt,
      ...(entry.failureReason ? { failureReason: entry.failureReason } : {}),
    })),
  });

  for (const entry of failed) {
    await deletePermanentlyFailed(profileId, flow, entry.id);
  }

  return { escalated: failed.length };
}
