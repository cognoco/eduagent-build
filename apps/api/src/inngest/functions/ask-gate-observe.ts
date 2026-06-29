// @inngest-admin: no-db (logging/Sentry observer; no DB access)
// ---------------------------------------------------------------------------
// Ask Gate Observe — observable terminus for the app/ask.gate_decision and
// app/ask.gate_timeout events emitted by the session depth-evaluation endpoint
// (apps/api/src/routes/sessions.ts). [AUDIT-INNGEST-1 / PR-17-P1 / 2026-05-12]
//
// Pre-fix: both events were emitted with no Inngest listener, described as
// "consumed by observability tooling" — in practice they fired into the void.
// Without a registered consumer the Inngest dashboard could not query them,
// making the ask-gate feature invisible to on-call monitoring and blocking
// any future retry / escalation strategy.
//
// This follows the same observer pattern as payment-failed-observe.ts and
// ask-classification-observe.ts: structured log + return-shape contract,
// no transformation or retry logic. Schema drift escalates to Sentry so the
// "silent recovery without escalation" rule (AGENTS.md) is honoured.
//
// Event payload shapes (shared with sender via `@eduagent/schemas`):
//   app/ask.gate_decision  → askGateDecisionEventSchema
//   app/ask.gate_timeout   → askGateTimeoutEventSchema
// ---------------------------------------------------------------------------

import {
  askGateDecisionEventSchema,
  askGateTimeoutEventSchema,
  // summarizeRawPayload: canonical home is @eduagent/schemas (pii-scrub),
  // shared by every observe handler's drift path.
  summarizeRawPayload,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeReason(reason: unknown) {
  return {
    reasonPresent: typeof reason === 'string' ? reason.length > 0 : false,
    reasonLength: typeof reason === 'string' ? reason.length : 0,
  };
}

function sanitizeDecisionRawData(rawData: unknown) {
  if (!isRecord(rawData)) {
    return summarizeRawPayload(rawData);
  }

  return {
    ...summarizeRawPayload(rawData),
    ...summarizeReason(rawData.reason),
  };
}

export const askGateDecisionObserve = inngest.createFunction(
  {
    id: 'ask-gate-decision-observe',
    name: 'Ask gate decision observability',
  },
  { event: 'app/ask.gate_decision' },
  async ({ event }) => {
    const parseResult = askGateDecisionEventSchema.safeParse(event.data);
    if (!parseResult.success) {
      const rawData = sanitizeDecisionRawData(event.data);
      logger.error('ask.gate_decision.schema_drift', {
        issues: parseResult.error.issues,
        rawData,
      });
      captureException(
        new Error(
          '[ask-gate-decision] invalid event payload — schema drift or bad event',
        ),
        { extra: { issues: parseResult.error.issues, rawData } },
      );
      return { status: 'schema_error' as const };
    }
    const data = parseResult.data;

    logger.info('ask.gate_decision.received', {
      sessionId: data.sessionId ?? null,
      meaningful: data.meaningful ?? null,
      ...summarizeReason(data.reason),
      method: data.method ?? null,
      exchangeCount: data.exchangeCount ?? null,
      learnerWordCount: data.learnerWordCount ?? null,
      topicCount: data.topicCount ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      meaningful: data.meaningful ?? null,
      method: data.method ?? null,
    };
  },
);

export const askGateTimeoutObserve = inngest.createFunction(
  {
    id: 'ask-gate-timeout-observe',
    name: 'Ask gate timeout observability',
  },
  { event: 'app/ask.gate_timeout' },
  async ({ event }) => {
    const parseResult = askGateTimeoutEventSchema.safeParse(event.data);
    if (!parseResult.success) {
      const rawData = summarizeRawPayload(event.data);
      logger.error('ask.gate_timeout.schema_drift', {
        issues: parseResult.error.issues,
        rawData,
      });
      captureException(
        new Error(
          '[ask-gate-timeout] invalid event payload — schema drift or bad event',
        ),
        { extra: { issues: parseResult.error.issues, rawData } },
      );
      return { status: 'schema_error' as const };
    }
    const data = parseResult.data;

    logger.warn('ask.gate_timeout.received', {
      sessionId: data.sessionId ?? null,
      exchangeCount: data.exchangeCount ?? null,
      receivedAt: new Date().toISOString(),
    });

    return {
      status: 'logged' as const,
      sessionId: data.sessionId ?? null,
      exchangeCount: data.exchangeCount ?? null,
    };
  },
);
