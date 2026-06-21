import {
  reportableFactKindSchema,
  type ReportableFact,
  type ReportableFactKind,
} from '@eduagent/schemas';

export class NonReportableFactError extends Error {
  readonly code = 'NON_REPORTABLE_FACT';

  constructor(readonly kind: string) {
    super(`Fact kind '${kind}' is not reportable to supporters.`);
    this.name = 'NonReportableFactError';
  }
}

export interface CandidateReportFact {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  occurredAt?: string;
  source: string;
  metadata?: Record<string, unknown>;
  safetyEscalation?: boolean;
}

export const REPORTABLE_FACT_KINDS: readonly ReportableFactKind[] =
  reportableFactKindSchema.options;

export function assertReportable(
  fact: CandidateReportFact,
): asserts fact is CandidateReportFact & { kind: ReportableFactKind } {
  if (fact.safetyEscalation) return;
  if (!reportableFactKindSchema.safeParse(fact.kind).success) {
    throw new NonReportableFactError(fact.kind);
  }
}

export function isReportable(fact: CandidateReportFact): boolean {
  try {
    assertReportable(fact);
    return true;
  } catch (error) {
    if (error instanceof NonReportableFactError) return false;
    throw error;
  }
}

export function filterToReportable(
  facts: readonly CandidateReportFact[],
): ReportableFact[] {
  return facts.flatMap((fact) => {
    if (!isReportable(fact)) return [];
    if (fact.safetyEscalation) {
      return [
        {
          ...fact,
          kind: 'observable_engagement' as const,
          metadata: {
            ...fact.metadata,
            safetyEscalation: true,
          },
        },
      ];
    }
    return [fact as ReportableFact];
  });
}

export function shouldDeliverSafetyEscalation(
  fact: CandidateReportFact,
): boolean {
  return fact.safetyEscalation === true;
}
