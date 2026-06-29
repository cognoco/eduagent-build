// @inngest-admin: parent-chain (createScopedRepository(db, profileId); sessionEvents scoped by profileId)
// ---------------------------------------------------------------------------
// Post-display suitability judge (MMT-ADR-0016 §2/§7 phase 4).
//
// Consumes `app/judge.suitability_requested` (opaque session_events row ids
// only — no text), rehydrates the tutor reply + the immediately-preceding
// learner message from the DB (scoped by profileId), runs the vendor-independent
// judge, and emits a structured calibration metric (overall + flags only). This
// is calibration-first: a judge failure never affects the learner (fail-open,
// §5), and the verdict is logged for flag-rate calibration before any phase-5
// gating.
// ---------------------------------------------------------------------------

import { and, eq } from 'drizzle-orm';
import { createScopedRepository, sessionEvents } from '@eduagent/database';
import {
  suitabilityJudgeRequestedEventSchema,
  type JudgeVerdict,
  type SuitabilityJudgeRequestedEvent,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { runSuitabilityJudge } from '../../services/policy-engine/judge-suitability';

const logger = createLogger();

function parseEventData(data: unknown): SuitabilityJudgeRequestedEvent | null {
  const parsed = suitabilityJudgeRequestedEventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

type JudgeOutcome =
  | ({ status: 'judged' } & Pick<JudgeVerdict, 'overall' | 'flags'>)
  | { status: 'reply_not_found' }
  | { status: 'degraded' };

export async function handleSuitabilityJudge({
  event,
  step,
}: {
  event: { data: unknown };
  step: { run: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> };
}) {
  const payload = parseEventData(event.data);
  if (!payload) {
    // Malformed payload will never become valid — skip cleanly so Inngest does
    // not retry, mirroring ask-silent-classify's safeParse-fail branch.
    return { skipped: 'invalid_payload' as const };
  }

  const {
    profileId,
    sessionId,
    replyEventId,
    precedingLearnerMessageEventId,
    ageBracket,
    tutorVendor,
    tutorModel,
    flow,
    conversationLanguage,
  } = payload;

  // PII egress: rehydrate the reply + preceding learner message from the DB and
  // run the judge in ONE step closure, so the raw text stays a local variable
  // and only the non-PII verdict (overall + flags) crosses the step boundary
  // (Inngest memoizes step returns into its third-party state store). Both reads
  // are scoped by profileId via the scoped repository. A missing reply row
  // (transcript purged / stale ref) yields a skip rather than a guess.
  // [MMT-ADR-0016 §2; mirrors review-calibration-grade's single-closure pattern]
  const outcome = await step.run(
    'rehydrate-and-judge',
    async (): Promise<JudgeOutcome> => {
      const db = getStepDatabase();
      const repo = createScopedRepository(db, profileId);

      const replyRow = await repo.sessionEvents.findFirst(
        and(
          eq(sessionEvents.id, replyEventId),
          eq(sessionEvents.sessionId, sessionId),
          eq(sessionEvents.eventType, 'ai_response'),
        ),
      );
      if (!replyRow?.content) return { status: 'reply_not_found' };

      let precedingLearnerMessage: string | null = null;
      if (precedingLearnerMessageEventId) {
        const precedingRow = await repo.sessionEvents.findFirst(
          and(
            eq(sessionEvents.id, precedingLearnerMessageEventId),
            eq(sessionEvents.sessionId, sessionId),
            eq(sessionEvents.eventType, 'user_message'),
          ),
        );
        precedingLearnerMessage = precedingRow?.content ?? null;
      }

      const verdict = await runSuitabilityJudge({
        reply: replyRow.content,
        precedingLearnerMessage,
        ageBracket,
        conversationLanguage,
        tutorVendor,
        sessionId,
      });

      // Only overall + flags leave the closure — never the raw text, and never
      // the judge's free-text rationale (it can echo learner content).
      if (!verdict) return { status: 'degraded' };
      return {
        status: 'judged',
        overall: verdict.overall,
        flags: verdict.flags,
      };
    },
  );

  if (outcome.status === 'reply_not_found') {
    return { skipped: 'reply_not_found' as const };
  }

  if (outcome.status === 'degraded') {
    // Fail-open with alarm (§5): no verdict — emit the degraded calibration
    // metric so the flag-rate dashboard counts how often the judge could not
    // produce a verdict. Scores/flags absent by definition; no text.
    logger.warn('[judge-suitability] degraded — no verdict', {
      metric: 'judge.degraded',
      profileId,
      ageBracket,
      flow,
      tutorModel,
    });
    return { degraded: true as const };
  }

  // The calibration signal (§7 phase 4): overall + flags only, queryable for
  // flag-rate calibration. No conversation text, no rationale.
  logger.info('[judge-suitability] verdict', {
    metric: 'judge.verdict',
    overall: outcome.overall,
    flags: outcome.flags,
    profileId,
    ageBracket,
    flow,
    tutorModel,
    conversationLanguage,
  });

  return {
    judged: true as const,
    overall: outcome.overall,
    flags: outcome.flags,
  };
}

export const suitabilityJudge = inngest.createFunction(
  {
    id: 'judge-suitability',
    name: 'Post-display suitability judge (calibration)',
    retries: 2,
    // The reply row is immutable once persisted — one judgement per reply.
    idempotency: 'event.data.replyEventId',
  },
  { event: 'app/judge.suitability_requested' },
  handleSuitabilityJudge,
);
