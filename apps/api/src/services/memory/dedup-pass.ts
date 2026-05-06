import { and, eq, sql } from 'drizzle-orm';

import {
  memoryDedupDecisions,
  memoryFacts,
  type Database,
  type MemoryFactRow,
  type ScopedRepository,
} from '@eduagent/database';

import { applyDedupAction } from './dedup-actions';
import { runDedupLlm } from './dedup-llm';
import type { DedupResponse } from './dedup-prompt';
import { isSuppressedFact } from './suppressed-prewrite';

export type DedupPassReport = {
  candidatesProcessed: number;
  memoHits: number;
  suppressedSkips: number;
  skippedNoEmbedding: number;
  llmCalls: number;
  capHit: boolean;
  cappedSkipped: number;
  merges: number;
  supersedes: number;
  keptBoth: number;
  discarded: number;
  keptAsNew: number;
  failures: number;
};

export interface DedupEventTuple {
  name: string;
  data: Record<string, unknown>;
}

export interface DedupPassArgs {
  db: Database;
  scoped: ScopedRepository;
  profileId: string;
  candidateIds?: string[];
  llm?: typeof runDedupLlm;
  llmDeps?: Parameters<typeof runDedupLlm>[1];
  threshold: number;
  cap: number;
}

export function dedupPairKey(a: string, b: string): string {
  const [low, high] = a < b ? [a, b] : [b, a];
  return JSON.stringify([low, high]);
}

function emptyReport(): DedupPassReport {
  return {
    candidatesProcessed: 0,
    memoHits: 0,
    suppressedSkips: 0,
    skippedNoEmbedding: 0,
    llmCalls: 0,
    capHit: false,
    cappedSkipped: 0,
    merges: 0,
    supersedes: 0,
    keptBoth: 0,
    discarded: 0,
    keptAsNew: 0,
    failures: 0,
  };
}

function decisionFromMemo(row: {
  decision: 'merge' | 'supersede' | 'keep_both' | 'discard_new';
  mergedText: string | null;
}): DedupResponse | null {
  if (row.decision === 'merge') {
    return row.mergedText
      ? { action: 'merge', merged_text: row.mergedText }
      : null;
  }
  return { action: row.decision } as DedupResponse;
}

export interface DedupPassResult {
  report: DedupPassReport;
  events: DedupEventTuple[];
}

export async function runDedupForProfile(
  args: DedupPassArgs
): Promise<DedupPassResult> {
  const report = emptyReport();
  const events: DedupEventTuple[] = [];
  function emit(name: string, data: Record<string, unknown>): void {
    events.push({ name, data });
  }
  const candidateRows =
    args.candidateIds && args.candidateIds.length > 0
      ? await Promise.all(
          args.candidateIds.map((id) =>
            args.scoped.memoryFacts.findFirstActive(eq(memoryFacts.id, id))
          )
        )
      : await args.scoped.memoryFacts.findActiveCandidatesWithEmbedding();

  for (const candidate of candidateRows) {
    report.candidatesProcessed += 1;
    if (!candidate || candidate.embedding === null) {
      report.skippedNoEmbedding += 1;
      emit('memory.dedup.skipped_no_embedding', {
        profileId: args.profileId,
        candidateId: candidate?.id ?? null,
      });
      continue;
    }

    if (await isSuppressedFact(args.scoped, candidate.text)) {
      // Defence-in-depth: candidate should not appear here because
      // findActiveCandidatesWithEmbedding excludes category='suppressed'.
      // If it somehow leaked through (e.g. candidateIds list), skip and warn
      // rather than deleting — the prewrite layer is the authoritative guard.
      report.suppressedSkips += 1;
      emit('memory.fact.suppressed_skip', {
        profileId: args.profileId,
        candidateId: candidate.id,
        warning: 'suppressed_fact_reached_dedup_pass',
      });
      continue;
    }

    const neighbours = await args.scoped.memoryFacts.findRelevant(
      candidate.embedding,
      2,
      and(
        eq(memoryFacts.category, candidate.category),
        sql`${memoryFacts.id} <> ${candidate.id}`
      )
    );
    const best = neighbours.find((row) => row.distance <= args.threshold);
    if (!best) {
      report.keptAsNew += 1;
      continue;
    }

    const pairKey = dedupPairKey(candidate.textNormalized, best.textNormalized);
    const memo = await args.db
      .select()
      .from(memoryDedupDecisions)
      .where(
        and(
          eq(memoryDedupDecisions.profileId, args.profileId),
          eq(memoryDedupDecisions.pairKey, pairKey)
        )
      )
      .limit(1);

    let decision = memo[0] ? decisionFromMemo(memo[0]) : null;
    let modelVersion = memo[0]?.modelVersion ?? 'memo';
    if (decision) report.memoHits += 1;

    if (!decision) {
      if (report.llmCalls >= args.cap) {
        report.capHit = true;
        report.cappedSkipped += 1;
        report.keptAsNew += 1;
        emit('memory.dedup.capped_skip', {
          profileId: args.profileId,
          candidateId: candidate.id,
          neighbourId: best.id,
        });
        continue;
      }

      report.llmCalls += 1;
      const llmResult = await (args.llm ?? runDedupLlm)(
        {
          candidate: { text: candidate.text, category: candidate.category },
          neighbour: { text: best.text, category: best.category },
        },
        args.llmDeps
      );
      if (!llmResult.ok) {
        report.failures += 1;
        report.keptBoth += 1;
        emit('memory.dedup.failed', {
          profileId: args.profileId,
          candidateId: candidate.id,
          neighbourId: best.id,
          reason: llmResult.reason,
        });
        continue;
      }

      decision = llmResult.decision;
      modelVersion = llmResult.modelVersion;
      await args.db
        .insert(memoryDedupDecisions)
        .values({
          profileId: args.profileId,
          pairKey,
          decision: decision.action,
          mergedText: decision.action === 'merge' ? decision.merged_text : null,
          modelVersion,
        })
        .onConflictDoNothing();
    }

    const outcome = await args.db.transaction(async (tx) => {
      const [freshCandidate] = await tx
        .select()
        .from(memoryFacts)
        .where(
          and(
            eq(memoryFacts.id, candidate.id),
            eq(memoryFacts.profileId, args.profileId)
          )
        )
        .limit(1);
      const [freshNeighbour] = await tx
        .select()
        .from(memoryFacts)
        .where(
          and(
            eq(memoryFacts.id, best.id),
            eq(memoryFacts.profileId, args.profileId)
          )
        )
        .limit(1);
      if (
        !freshCandidate ||
        !freshNeighbour ||
        freshCandidate.supersededBy !== null ||
        freshNeighbour.supersededBy !== null
      ) {
        return null;
      }
      return applyDedupAction(tx, {
        action: decision,
        candidate: freshCandidate as MemoryFactRow,
        neighbour: freshNeighbour as MemoryFactRow,
      });
    });

    if (!outcome) continue;
    switch (outcome.kind) {
      case 'merge':
        report.merges += 1;
        emit('memory.fact.merged', {
          profileId: args.profileId,
          newFactId: outcome.newFactId,
          mergedFromIds: outcome.supersededIds,
          modelVersion,
        });
        break;
      case 'supersede':
        report.supersedes += 1;
        emit('memory.fact.merged', {
          profileId: args.profileId,
          newFactId: candidate.id,
          mergedFromIds: [outcome.supersededId],
          modelVersion,
        });
        break;
      case 'keep_both':
        report.keptBoth += 1;
        break;
      case 'discard_new':
        report.discarded += 1;
        break;
      case 'merge_rejected_new_content':
      case 'merge_rejected_metadata_mismatch':
        report.failures += 1;
        report.keptBoth += 1;
        emit('memory.dedup.failed', {
          profileId: args.profileId,
          candidateId: candidate.id,
          neighbourId: best.id,
          reason: outcome.kind,
        });
        break;
    }
  }

  if (report.capHit) {
    emit('memory.dedup.cap_hit', {
      profileId: args.profileId,
      cappedSkipped: report.cappedSkipped,
    });
  }

  return { report, events };
}
