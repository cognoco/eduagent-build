import type { AppealReport, ReportableFact } from '@eduagent/schemas';

import { filterToReportable, type CandidateReportFact } from './reportability';
import { projectSharedRecord } from './shared-record';

export const LEGACY_SUPPORTER_REPORT_SOURCES = new Set([
  'monthly_report_highlights',
  'monthly_report_next_steps',
  'recap_llm_summary',
  'session_summary_prose',
]);

export interface SupporterReportAuditWriter {
  (event: {
    supportershipId: string;
    eventType: 'appeal_requested';
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export function buildCuratedSupporterReport(input: {
  supportershipId: string;
  supporteeDisplayName?: string;
  facts: readonly CandidateReportFact[];
  generatedAt?: Date;
}): {
  supportershipId: string;
  generatedAt: string;
  facts: ReportableFact[];
  sharedRecord: ReturnType<typeof projectSharedRecord>;
} {
  const candidateFacts = input.facts.filter(
    (fact) => !LEGACY_SUPPORTER_REPORT_SOURCES.has(fact.source),
  );
  const sharedRecord = projectSharedRecord({
    supportershipId: input.supportershipId,
    facts: candidateFacts,
    generatedAt: input.generatedAt,
    supporteeDisplayName: input.supporteeDisplayName,
  });
  return {
    supportershipId: input.supportershipId,
    generatedAt: sharedRecord.generatedAt,
    facts: sharedRecord.supporterView.facts,
    sharedRecord,
  };
}

export async function buildAttentionReport(input: {
  supportershipId: string;
  facts: readonly CandidateReportFact[];
  requestedByPersonId: string;
  reason?: string;
  generatedAt?: Date;
  auditWriter: SupporterReportAuditWriter;
}): Promise<AppealReport> {
  const facts = filterToReportable(
    input.facts.filter(
      (fact) => !LEGACY_SUPPORTER_REPORT_SOURCES.has(fact.source),
    ),
  );
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  await input.auditWriter({
    supportershipId: input.supportershipId,
    eventType: 'appeal_requested',
    payload: {
      requestedByPersonId: input.requestedByPersonId,
      reason: input.reason,
      factIds: facts.map((fact) => fact.id),
      generatedAt,
    },
  });

  return {
    supportershipId: input.supportershipId,
    generatedAt,
    report:
      facts.length > 0
        ? `Detailed attention report: ${facts.map((fact) => fact.title).join('; ')}`
        : 'Detailed attention report: no shareable updates yet.',
    facts,
    artifactWall: true,
  };
}
