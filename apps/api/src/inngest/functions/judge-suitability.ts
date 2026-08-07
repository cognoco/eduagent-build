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
import { shouldBlockSuitabilityVerdict } from '../../services/suitability-gate';
import {
  emitSuitabilityBlockedEvent,
  emitSuitabilityJudgeUnavailableEvent,
} from '../../services/exchanges';

const logger = createLogger();

function parseEventData(data: unknown): SuitabilityJudgeRequestedEvent | null {
  const parsed = suitabilityJudgeRequestedEventSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

type JudgeOutcome =
  | ({ status: 'judged' } & Pick<JudgeVerdict, 'overall' | 'flags'>)
  | { status: 'reply_not_found' }
  | { status: 'degraded' };

/**
 * [WI-1900] Injectable escalation emitters. Mirrors the `IngestDependencies`
 * pattern in blocked-safety-digest.ts — the production defaults are the real
 * `services/exchanges` emitters, and tests substitute fakes rather than
 * jest.mock-ing an internal module (GC1). Without this the adult-path
 * escalation added below would be unverifiable, since the rest of this handler
 * reaches the database.
 */
export interface SuitabilityJudgeDependencies {
  emitBlocked: typeof emitSuitabilityBlockedEvent;
  emitUnavailable: typeof emitSuitabilityJudgeUnavailableEvent;
}

const defaultSuitabilityJudgeDependencies: SuitabilityJudgeDependencies = {
  emitBlocked: emitSuitabilityBlockedEvent,
  emitUnavailable: emitSuitabilityJudgeUnavailableEvent,
};

export async function handleSuitabilityJudge(
  {
    event,
    step,
  }: {
    event: { data: unknown };
    step: { run: <T>(name: string, fn: () => Promise<T> | T) => Promise<T> };
  },
  dependencies: SuitabilityJudgeDependencies = defaultSuitabilityJudgeDependencies,
) {
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
    // [WI-1900] Adult-path escalation. Before this, a degraded judge on the
    // adult rail produced a log line and nothing queryable — silent recovery on
    // a safety path. Reuses the SAME structured alarm the minor enforcing gate
    // raises (operator ruling 2026-08-04).
    //
    // Adult-scoped deliberately: a minor's reply is ALSO covered by the
    // synchronous enforcing gate, which raises this alarm itself when enabled.
    // Emitting here for minors would double-alarm and would change the minor
    // path, which the ruling holds untouched.
    //
    // Memoized in its own step: this function runs with retries: 2, so any
    // retry re-executes non-step code after the last completed step. The
    // emitters mint a fresh crypto.randomUUID() per call, so an unmemoized
    // dispatch would raise a SECOND distinct alarm for one verdict — duplicate
    // operator pages on a safety path. Matches payment-failed-observe.ts.
    if (ageBracket === 'adult') {
      await step.run('emit-adult-suitability-unavailable', async () => {
        await dependencies.emitUnavailable({
          sessionId,
          profileId,
          flow,
          model: tutorModel,
          provider: tutorVendor,
        });
        return null;
      });
    }
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

  // [WI-1900] Adult-path escalation on a blocking-grade verdict. The reply is
  // ALREADY DISPLAYED — this rail is post-display, so nothing is blocked and
  // fail-closed is not available here. What AC-2 can mean for adults is the
  // escalation half: never silent recovery. `mode: 'observed'` tells the
  // operator digest not to count this as a block (see blocked-safety-digest.ts).
  //
  // Reuses shouldBlockSuitabilityVerdict so the adult rail inherits the SAME
  // over-block controls as the minor gate: 'concern' never alarms, and a
  // violation flagged only over_blocking/topic_drift never alarms.
  //
  // Adult-scoped for the same reason as the degraded branch above: minors are
  // covered by the synchronous enforcing gate, which raises its own event.
  if (
    ageBracket === 'adult' &&
    shouldBlockSuitabilityVerdict({
      overall: outcome.overall,
      flags: outcome.flags,
    })
  ) {
    // Memoized for the same reason as the degraded branch above — a retry must
    // not raise a second blocked alarm for one already-judged reply.
    await step.run('emit-adult-suitability-blocked', async () => {
      await dependencies.emitBlocked({
        sessionId,
        profileId,
        flow,
        model: tutorModel,
        provider: tutorVendor,
        flags: outcome.flags,
        mode: 'observed',
      });
      return null;
    });
  }

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
