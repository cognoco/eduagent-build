import type { ScopedRepository } from '@eduagent/database';

import type { FactEmbedder } from './embed-fact';
import {
  appendMemoryFactToSnapshot,
  emptyMemorySnapshot,
  readMemorySnapshotFromFacts,
  type MemoryFactSnapshotRow,
  type MemorySnapshot,
} from './memory-facts';

export interface RelevanceWeights {
  relevance: number;
  recency: number;
  halflifeDays: number;
}

// Defaults match spec at docs/specs/2026-05-05-memory-architecture-upgrade.md
export const DEFAULT_WEIGHTS: RelevanceWeights = {
  relevance: 0.7,
  recency: 0.3,
  halflifeDays: 90,
};

export interface RelevanceResult {
  snapshot: MemorySnapshot;
  source: 'relevance' | 'recency_fallback' | 'consent_gate' | 'no_profile';
}

export interface GetRelevantMemoriesArgs {
  profileId: string;
  queryText?: string;
  queryVector?: number[];
  k: number;
  profile: {
    memoryConsentStatus?: string | null;
    memoryEnabled?: boolean;
    memoryInjectionEnabled?: boolean;
  } | null;
  scoped: ScopedRepository;
  embedder?: FactEmbedder;
  weights?: Partial<RelevanceWeights>;
  now?: Date;
}

type RelevantMemoryFactRow = Awaited<
  ReturnType<ScopedRepository['memoryFacts']['findRelevant']>
>[number];

export async function getRelevantMemories(
  args: GetRelevantMemoriesArgs
): Promise<RelevanceResult> {
  const weights = { ...DEFAULT_WEIGHTS, ...(args.weights ?? {}) };
  const now = args.now ?? new Date();

  if (args.profile === null) {
    return { snapshot: emptyMemorySnapshot(), source: 'no_profile' };
  }

  const consentGranted = args.profile.memoryConsentStatus === 'granted';
  const injectionEnabled =
    consentGranted &&
    args.profile.memoryEnabled !== false &&
    args.profile.memoryInjectionEnabled !== false;
  if (!injectionEnabled) {
    return { snapshot: emptyMemorySnapshot(), source: 'consent_gate' };
  }

  const queryVector = await resolveQueryVector(args);
  if (!queryVector) {
    return {
      snapshot: await readMemorySnapshotFromFacts(args.scoped, args.profile),
      source: 'recency_fallback',
    };
  }

  const candidates = await args.scoped.memoryFacts.findRelevant(
    queryVector,
    args.k
  );
  if (candidates.length === 0) {
    return {
      snapshot: await readMemorySnapshotFromFacts(args.scoped, args.profile),
      source: 'recency_fallback',
    };
  }

  const topRows = candidates
    .map((row) => ({ row, score: scoreRow(row, weights, now) }))
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
    .slice(0, args.k)
    .map(({ row }) => row);

  return { snapshot: rowsToSnapshot(topRows), source: 'relevance' };
}

async function resolveQueryVector(
  args: GetRelevantMemoriesArgs
): Promise<number[] | null> {
  if (args.queryVector && args.queryVector.length > 0) return args.queryVector;
  if (!args.queryText || !args.embedder) return null;

  const result = await args.embedder(args.queryText);
  return result.ok ? result.vector : null;
}

function scoreRow(
  row: RelevantMemoryFactRow,
  weights: RelevanceWeights,
  now: Date
): number {
  const observedAt =
    row.observedAt instanceof Date ? row.observedAt : new Date(row.observedAt);
  const ageDays = Math.max(
    0,
    (now.getTime() - observedAt.getTime()) / 86_400_000
  );
  const relevance = 1 - row.distance / 2;
  const recency = Math.exp(-ageDays / weights.halflifeDays);

  return relevance * weights.relevance + recency * weights.recency;
}

function rowsToSnapshot(
  rows: ReadonlyArray<RelevantMemoryFactRow>
): MemorySnapshot {
  const snapshot = emptyMemorySnapshot();
  for (const row of rows) {
    appendMemoryFactToSnapshot(snapshot, row as MemoryFactSnapshotRow);
  }
  return snapshot;
}
