import type { SharedRecord } from '@eduagent/schemas';

import { filterToReportable, type CandidateReportFact } from './reportability';

export class RenderEquivalenceError extends Error {
  readonly code = 'RENDER_EQUIVALENCE_VIOLATION';

  constructor() {
    super('Supporter and supportee views must render the same fact ids.');
    this.name = 'RenderEquivalenceError';
  }
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function assertRenderEquivalent(record: SharedRecord): void {
  const supporterIds = sortedIds(record.supporterView.factIds);
  const supporteeIds = sortedIds(record.supporteeView.factIds);
  if (supporterIds.join('\n') !== supporteeIds.join('\n')) {
    throw new RenderEquivalenceError();
  }
}

export function projectSharedRecord(input: {
  supportershipId: string;
  facts: readonly CandidateReportFact[];
  generatedAt?: Date;
  supporteeDisplayName?: string;
}): SharedRecord {
  const facts = filterToReportable(input.facts);
  const factIds = facts.map((fact) => fact.id);
  const supporteeName = input.supporteeDisplayName ?? 'your learner';
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const record: SharedRecord = {
    supportershipId: input.supportershipId,
    generatedAt,
    factIds,
    supporterView: {
      audience: 'supporter',
      factIds,
      headline:
        facts.length > 0
          ? `${supporteeName} has ${facts.length} shareable update${facts.length === 1 ? '' : 's'}.`
          : `${supporteeName} has no shareable updates yet.`,
      facts,
    },
    supporteeView: {
      audience: 'supportee',
      factIds,
      headline:
        facts.length > 0
          ? `Your supporter can see ${facts.length} shareable update${facts.length === 1 ? '' : 's'}.`
          : 'There are no shareable updates yet.',
      facts,
    },
  };
  assertRenderEquivalent(record);
  return record;
}
