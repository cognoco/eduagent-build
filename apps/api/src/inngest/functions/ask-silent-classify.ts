import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { learningSessions } from '@eduagent/database';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { classifySubject } from '../../services/subject-classify';
import { createLogger } from '../../services/logger';
import { SILENT_CLASSIFY_CONFIDENCE_THRESHOLD } from '../../services/session/session-depth.config';

const classifySilentlyEventDataSchema = z.object({
  sessionId: z.string(),
  profileId: z.string(),
  classifyInput: z.string(),
  exchangeCount: z.number(),
});

const logger = createLogger();

export const askSilentClassify = inngest.createFunction(
  {
    id: 'ask-silent-classify',
    name: 'Silently classify freeform ask sessions',
    retries: 2,
    // [BUG-845 / F-SVC-014] Idempotency key (24h window) ensures two events
    // for the same session are deduped at the Inngest queue level instead of
    // racing through the concurrency=1 lane. Concurrency limits serialize
    // execution but do NOT prevent two events from both passing the
    // `check-existing` step before either writes — the second classification
    // call burns an LLM tokens budget for nothing and last-write-wins on the
    // metadata. The idempotency key short-circuits the second event entirely.
    // Concurrency=1 is kept as defence-in-depth in case the dedup window
    // misses (e.g., 24h+1s late retry).
    idempotency: 'event.data.sessionId',
    concurrency: { key: 'event.data.sessionId', limit: 1 },
  },
  { event: 'app/ask.classify_silently' },
  async ({ event, step }) => {
    // [BUG-697 / J-8] Use safeParse so a malformed event payload does NOT
    // throw. The previous .parse(event.data) at the top of the handler
    // executed BEFORE any step.run, so Inngest treated the ZodError as a
    // transient function failure and retried 2× — burning quota on a
    // permanently-bad payload that will never become valid. With safeParse,
    // we record the issue and exit cleanly so retries do not fire.
    const validated = classifySilentlyEventDataSchema.safeParse(event.data);
    if (!validated.success) {
      const issues = validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      logger.warn('[ask-silent-classify] invalid payload — skipping retries', {
        issues,
      });
      // [BUG-697 / J-8] Emit a structured failure event so the invalid-payload
      // branch is queryable, not invisible. Mirrors askSilentClassifyOnFailure's
      // emit shape and is consumed by ask-classification-observe.ts. Without
      // this, returning `{ skipped: true }` makes Inngest mark the run as
      // succeeded — the onFailure handler never fires and there is no metric
      // counting how often this fallback ran. Best-effort extract sessionId /
      // exchangeCount from the raw payload so dashboards have something to key
      // on even when the rest of the payload is malformed.
      const rawData = (event.data ?? {}) as Record<string, unknown>;
      const rawSessionId =
        typeof rawData.sessionId === 'string' ? rawData.sessionId : undefined;
      const rawExchangeCount =
        typeof rawData.exchangeCount === 'number'
          ? rawData.exchangeCount
          : undefined;
      await step.sendEvent('classification-invalid-payload', {
        name: 'app/ask.classification_failed',
        data: {
          sessionId: rawSessionId,
          exchangeCount: rawExchangeCount,
          error: `invalid_payload: ${issues
            .map((i) => `${i.path}: ${i.message}`)
            .join('; ')}`,
        },
      });
      return {
        skipped: true,
        reason: 'invalid_payload',
        issues,
      };
    }
    const { sessionId, profileId, classifyInput, exchangeCount } =
      validated.data;
    const db = getStepDatabase();

    const existing = await step.run('check-existing', async () => {
      const [row] = await db
        .select({ metadata: learningSessions.metadata })
        .from(learningSessions)
        .where(
          and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId)
          )
        )
        .limit(1);

      const metadata = ((row?.metadata as
        | Record<string, unknown>
        | undefined) ?? {}) as Record<string, unknown>;
      return Boolean(metadata['silentClassification']);
    });

    if (existing) {
      await step.sendEvent('already-classified', {
        name: 'app/ask.classification_skipped',
        data: {
          sessionId,
          exchangeCount,
          reason: 'already_classified',
          topConfidence: 1,
        },
      });
      return { skipped: true, reason: 'already_classified' };
    }

    const classification = await step.run('classify', async () =>
      classifySubject(db, profileId, classifyInput)
    );

    const topCandidate = [...classification.candidates]
      .sort((left, right) => right.confidence - left.confidence)
      .find(
        (candidate) =>
          candidate.confidence >= SILENT_CLASSIFY_CONFIDENCE_THRESHOLD
      );

    if (!topCandidate) {
      await step.sendEvent('classification-skipped', {
        name: 'app/ask.classification_skipped',
        data: {
          sessionId,
          exchangeCount,
          reason:
            classification.candidates.length === 0
              ? 'no_match'
              : 'below_threshold',
          topConfidence: classification.candidates[0]?.confidence ?? 0,
        },
      });
      return { skipped: true, reason: 'no_match_above_threshold' };
    }

    const payload = {
      subjectId: topCandidate.subjectId,
      subjectName: topCandidate.subjectName,
      confidence: topCandidate.confidence,
    };

    await step.run('write-metadata', async () => {
      await db
        .update(learningSessions)
        .set({
          metadata: sql`jsonb_set(
            COALESCE(${learningSessions.metadata}, '{}'::jsonb),
            '{silentClassification}',
            ${JSON.stringify(payload)}::jsonb,
            true
          )`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(learningSessions.id, sessionId),
            eq(learningSessions.profileId, profileId)
          )
        );
    });

    await step.sendEvent('classification-completed', {
      name: 'app/ask.classification_completed',
      data: {
        sessionId,
        exchangeCount,
        subjectId: topCandidate.subjectId,
        subjectName: topCandidate.subjectName,
        confidence: topCandidate.confidence,
      },
    });

    return {
      skipped: false,
      subjectId: topCandidate.subjectId,
      confidence: topCandidate.confidence,
    };
  }
);

export const askSilentClassifyOnFailure = inngest.createFunction(
  { id: 'ask-silent-classify-on-failure', name: 'Ask silent classify failure' },
  {
    event: 'inngest/function.failed',
    if: 'event.data.function_id == "ask-silent-classify"',
  },
  async ({ event, step }) => {
    const data = event.data as {
      error?: { message?: string };
      event?: { data?: { sessionId?: string; exchangeCount?: number } };
    };

    logger.warn('[ask-silent-classify] terminal failure', {
      sessionId: data.event?.data?.sessionId,
      error: data.error?.message ?? 'unknown',
    });

    await step.sendEvent('classification-failed', {
      name: 'app/ask.classification_failed',
      data: {
        sessionId: data.event?.data?.sessionId,
        exchangeCount: data.event?.data?.exchangeCount,
        error: data.error?.message ?? 'unknown',
      },
    });

    return { ok: true };
  }
);
