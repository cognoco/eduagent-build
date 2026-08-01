import { and, eq } from 'drizzle-orm';

import {
  generateUUIDv7,
  memoryFacts,
  type Database,
  type MemoryFactRow,
} from '@eduagent/database';

import { normalizeMemoryValue } from '../learner-profile';
import {
  isContentSafe,
  type LearningTextGateResult,
} from '../learning-text-safety/gate';
import type { DedupResponse } from './dedup-prompt';

type DedupActionDb = Pick<Database, 'delete' | 'insert' | 'update'>;

const CONFIDENCE_RANK: Record<'low' | 'medium' | 'high', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'with',
  'of',
  'to',
  'in',
  'on',
  'at',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'their',
  'they',
  'them',
]);

export type DedupActionOutcome =
  | { kind: 'merge'; newFactId: string; supersededIds: [string, string] }
  | { kind: 'supersede'; supersededId: string }
  | { kind: 'keep_both' }
  | { kind: 'discard_new'; deletedId: string }
  | { kind: 'merge_rejected_new_content'; offendingTokens: string[] }
  | { kind: 'merge_rejected_clinical_inference' }
  | { kind: 'merge_rejected_metadata_mismatch' };

export interface ApplyDedupActionArgs {
  action: DedupResponse;
  candidate: MemoryFactRow;
  neighbour: MemoryFactRow;
  /**
   * [WI-2628] Content-addressed decisions for the candidate merge text,
   * pre-computed by the caller BEFORE it opened the transaction this function
   * runs in — the gate can make an LLM round-trip and must never do so with a
   * pooled connection held.
   *
   * REQUIRED, deliberately not optional. An optional gate would let a caller
   * omit it and silently persist ungated merge text; the type makes the
   * evaluation a precondition of calling at all. A merge text absent from the
   * batch resolves unsafe, so passing a stale or unrelated gate fails closed
   * rather than opening a hole.
   */
  learningTextGate: LearningTextGateResult;
}

function maxConfidence(
  a: 'low' | 'medium' | 'high',
  b: 'low' | 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function unionUnique<T>(a: T[], b: T[]): T[] {
  return Array.from(new Set([...a, ...b]));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

export function findNewContentTokens(
  merged: string,
  candidateText: string,
  neighbourText: string,
): string[] {
  const allowed = new Set([
    ...tokenize(candidateText),
    ...tokenize(neighbourText),
  ]);
  return Array.from(new Set(tokenize(merged))).filter(
    (token) => !STOPWORDS.has(token) && !allowed.has(token),
  );
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataIndexKeysAgree(
  candidate: Record<string, unknown>,
  neighbour: Record<string, unknown>,
): boolean {
  return (
    (candidate.subject ?? '') === (neighbour.subject ?? '') &&
    (candidate.context ?? '') === (neighbour.context ?? '')
  );
}

export async function applyDedupAction(
  tx: DedupActionDb,
  args: ApplyDedupActionArgs,
): Promise<DedupActionOutcome> {
  const { action, candidate, neighbour } = args;

  if (action.action === 'keep_both') return { kind: 'keep_both' };

  if (action.action === 'discard_new') {
    await tx
      .delete(memoryFacts)
      .where(
        and(
          eq(memoryFacts.id, candidate.id),
          eq(memoryFacts.profileId, candidate.profileId),
        ),
      );
    return { kind: 'discard_new', deletedId: candidate.id };
  }

  const now = new Date();
  if (action.action === 'supersede') {
    await tx
      .update(memoryFacts)
      .set({ supersededBy: candidate.id, supersededAt: now, updatedAt: now })
      .where(
        and(
          eq(memoryFacts.id, neighbour.id),
          eq(memoryFacts.profileId, neighbour.profileId),
        ),
      );
    return { kind: 'supersede', supersededId: neighbour.id };
  }

  const offendingTokens = findNewContentTokens(
    action.merged_text,
    candidate.text,
    neighbour.text,
  );
  if (offendingTokens.length > 0) {
    return { kind: 'merge_rejected_new_content', offendingTokens };
  }
  // [WI-2628] The shared multilingual gate, consumed as a PRE-COMPUTED decision.
  // This function runs inside the CALLER's transaction (`dedup-pass.ts` opens it),
  // and the gate can make an LLM round-trip to the independent judge — holding a
  // pooled connection across one is a connection-exhaustion hazard. So the caller
  // evaluates `merged_text` before opening the transaction and hands the result in.
  //
  // The lookup is CONTENT-ADDRESSED: `isContentSafe` hashes the exact string, so a
  // decision cannot be misapplied to different text, and a string the batch never
  // evaluated returns false. The outcome kind is unchanged, so the caller's
  // handling of a rejected merge is untouched — only the gate behind it changed,
  // from an English-only regex to the ten-language gate.
  if (!isContentSafe(args.learningTextGate, action.merged_text)) {
    return { kind: 'merge_rejected_clinical_inference' };
  }

  const candidateMetadata = metadataRecord(candidate.metadata);
  const neighbourMetadata = metadataRecord(neighbour.metadata);
  if (!metadataIndexKeysAgree(candidateMetadata, neighbourMetadata)) {
    return { kind: 'merge_rejected_metadata_mismatch' };
  }

  const newFactId = generateUUIDv7();
  await tx.insert(memoryFacts).values({
    id: newFactId,
    profileId: candidate.profileId,
    category: candidate.category,
    text: action.merged_text,
    textNormalized: normalizeMemoryValue(action.merged_text),
    metadata: { ...neighbourMetadata, ...candidateMetadata },
    sourceSessionIds: unionUnique(
      candidate.sourceSessionIds,
      neighbour.sourceSessionIds,
    ),
    sourceEventIds: unionUnique(
      candidate.sourceEventIds,
      neighbour.sourceEventIds,
    ),
    observedAt:
      candidate.observedAt > neighbour.observedAt
        ? candidate.observedAt
        : neighbour.observedAt,
    confidence: maxConfidence(candidate.confidence, neighbour.confidence),
    embedding: null,
    createdAt: now,
    updatedAt: now,
  });

  for (const id of [candidate.id, neighbour.id]) {
    await tx
      .update(memoryFacts)
      .set({ supersededBy: newFactId, supersededAt: now, updatedAt: now })
      .where(
        and(
          eq(memoryFacts.id, id),
          eq(memoryFacts.profileId, candidate.profileId),
        ),
      );
  }

  return {
    kind: 'merge',
    newFactId,
    supersededIds: [candidate.id, neighbour.id],
  };
}
