import type { ExchangeSourceAudit } from '../apps/api/src/services/exchanges';
import { sanitizeRecitationSourceAudit } from '../apps/api/src/services/session/session-recitation-setup';

export type RecitationEvidenceTextKind =
  | 'learner_input'
  | 'assistant_reply'
  | 'quality_snippet';

export interface PersistedEventEvidence {
  eventType: string | null;
  content: string;
  metadata: unknown;
  createdAt: string;
}

const EVIDENCE_LABELS: Record<RecitationEvidenceTextKind, string> = {
  learner_input: 'learner input',
  assistant_reply: 'assistant reply',
  quality_snippet: 'quality snippet',
};

/**
 * Recitation runs may inspect raw text in memory for quality checks, but the
 * evidence artifacts and console output retain presence markers only.
 */
export function redactRecitationTextForEvidence(
  mode: string,
  kind: RecitationEvidenceTextKind,
  value: string,
): string {
  if (mode !== 'recitation') return value;
  const presence = value.trim().length > 0 ? 'present' : 'absent';
  return `[redacted: ${EVIDENCE_LABELS[kind]} ${presence}]`;
}

export function redactPersistedEventForEvidence(
  mode: string,
  event: PersistedEventEvidence,
): PersistedEventEvidence {
  if (mode !== 'recitation') return event;
  return {
    ...event,
    content: `[redacted: persisted event content ${
      event.content.trim().length > 0 ? 'present' : 'absent'
    }]`,
    metadata: { present: event.metadata != null },
  };
}

export function redactSourceAuditForEvidence(
  mode: string,
  sourceAudit: ExchangeSourceAudit | undefined,
): ExchangeSourceAudit | undefined {
  return sanitizeRecitationSourceAudit(mode, sourceAudit);
}
