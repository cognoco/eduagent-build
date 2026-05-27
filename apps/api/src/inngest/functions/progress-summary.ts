// @inngest-admin: parent-chain (learningSessions and familyLinks queried with profileId enforced)
import { and, desc, eq } from 'drizzle-orm';
import { familyLinks, learningSessions, profiles } from '@eduagent/database';
import { type ConversationLanguage } from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { buildKnowledgeInventory } from '../../services/snapshot-aggregation';
import {
  deterministicProgressSummaryFallback,
  findLatestCompletedLearningSession,
  generateProgressSummary,
  upsertProgressSummary,
} from '../../services/progress-summary';
import { isGdprProcessingAllowed } from '../../services/consent';
import { captureException } from '../../services/sentry';

export const progressSummaryGeneration = inngest.createFunction(
  {
    id: 'progress-summary-generation',
    name: 'Generate child progress summary after session',
    retries: 2,
    debounce: {
      key: 'progress-summary-{{ event.data.profileId }}',
      period: '5m',
    },
  },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    const profileId = event.data.profileId;
    const sessionId = event.data.sessionId;
    if (!profileId || !sessionId) {
      return { status: 'skipped', reason: 'missing profileId or sessionId' };
    }

    const context = await step.run('gather-context', async () => {
      const db = getStepDatabase();
      const parentLink = await db.query.familyLinks.findFirst({
        where: eq(familyLinks.childProfileId, profileId),
        columns: { id: true },
      });
      if (!parentLink) return null;

      // [WI-82] Re-check current GDPR consent at execution time. This job runs
      // outside the HTTP consent middleware; a queued event must not send learner
      // data to the LLM or persist derived data for a profile whose consent is
      // no longer granted.
      if (!(await isGdprProcessingAllowed(db, profileId))) {
        return { status: 'consent-blocked' as const };
      }

      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
        // i18n Phase 1 — read conversation_language for the summary LLM.
        columns: { displayName: true, conversationLanguage: true },
      });
      if (!profile) return null;

      let latestSession = await findLatestCompletedLearningSession(
        db,
        profileId,
      );
      if (!latestSession) {
        const rows = await db
          .select({
            id: learningSessions.id,
            startedAt: learningSessions.startedAt,
          })
          .from(learningSessions)
          .where(
            and(
              eq(learningSessions.id, sessionId),
              eq(learningSessions.profileId, profileId),
              eq(learningSessions.status, 'completed'),
            ),
          )
          .orderBy(desc(learningSessions.startedAt))
          .limit(1);
        latestSession = rows[0] ?? null;
      }
      if (!latestSession) return null;

      const inventory = await buildKnowledgeInventory(db, profileId);
      return {
        status: 'ok' as const,
        childName: profile.displayName,
        latestSessionId: latestSession.id,
        latestSessionAt: latestSession.startedAt,
        inventory,
        // DB returns string | null; cast to union before passing to LLM call.
        conversationLanguage:
          (profile.conversationLanguage as
            | ConversationLanguage
            | null
            | undefined) ?? undefined,
      };
    });

    if (!context) {
      return { status: 'skipped', reason: 'not a linked child or no session' };
    }
    if (context.status === 'consent-blocked') {
      return { status: 'skipped', reason: 'consent_not_granted' };
    }
    // `context.status === 'ok'` — narrowed cleanly, no cast needed.
    const ctx = context;

    const summary = await step.run('generate-summary', async () => {
      // [WI-82] Re-check consent here too: gather-context's gate is memoized by
      // Inngest, so on a retry of this step a withdrawal after the first run
      // must still block the LLM call (cross-step memoization gap).
      const db = getStepDatabase();
      if (!(await isGdprProcessingAllowed(db, profileId))) return null;
      try {
        return await generateProgressSummary({
          childName: ctx.childName,
          latestSessionId: ctx.latestSessionId,
          inventory: ctx.inventory,
          latestSessionAt: new Date(ctx.latestSessionAt),
          conversationLanguage: ctx.conversationLanguage,
        });
      } catch (error) {
        captureException(error, {
          profileId,
          extra: {
            step: 'generate-progress-summary',
            surface: 'progress-summary-generation',
            sessionId,
          },
        });
        return deterministicProgressSummaryFallback(
          ctx.childName,
          new Date(ctx.latestSessionAt),
        );
      }
    });

    if (summary === null) {
      return { status: 'skipped', reason: 'consent_not_granted' };
    }

    await step.run('persist-summary', async () => {
      const db = getStepDatabase();
      // [WI-82] Re-check before persisting derived data — defense-in-depth for
      // a withdrawal between generate and this (separately retried) step.
      if (!(await isGdprProcessingAllowed(db, profileId))) return;
      await upsertProgressSummary(db, {
        childProfileId: profileId,
        summary,
        basedOnLastSessionAt: new Date(ctx.latestSessionAt),
        latestSessionId: ctx.latestSessionId,
      });
    });

    return {
      status: 'generated',
      profileId,
      latestSessionId: ctx.latestSessionId,
    };
  },
);
