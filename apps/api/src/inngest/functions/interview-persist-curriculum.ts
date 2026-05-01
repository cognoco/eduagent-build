import { NonRetriableError } from 'inngest';
import { eq, and } from 'drizzle-orm';
import { onboardingDrafts } from '@eduagent/database';
import {
  PersistCurriculumError,
  type PersistFailureCode,
} from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { createLogger } from '../../services/logger';
import { extractSignals, persistCurriculum } from '../../services/interview';
import { sendPushNotification } from '../../services/notifications';

const logger = createLogger();

function classifyError(err: unknown): PersistFailureCode {
  if (err instanceof PersistCurriculumError) return err.code;
  return 'unknown';
}

async function loadDraft(
  db: Parameters<typeof persistCurriculum>[0],
  profileId: string,
  draftId: string
) {
  return db.query.onboardingDrafts.findFirst({
    where: and(
      eq(onboardingDrafts.id, draftId),
      eq(onboardingDrafts.profileId, profileId)
    ),
  });
}

export const interviewPersistCurriculum = inngest.createFunction(
  {
    id: 'interview-persist-curriculum',
    name: 'Persist curriculum after interview completion',
    retries: 3,
    concurrency: { limit: 5, key: 'event.data.profileId' },
    idempotency: 'event.data.draftId',
    onFailure: async ({
      event,
      error,
    }: {
      event: Record<string, unknown>;
      error: unknown;
    }) => {
      const db = getStepDatabase();
      const code = classifyError(error);
      const data = (event.data ?? event) as {
        draftId: string;
        profileId: string;
      };
      await db
        .update(onboardingDrafts)
        .set({ status: 'failed', failureCode: code })
        .where(
          and(
            eq(onboardingDrafts.id, data.draftId),
            eq(onboardingDrafts.profileId, data.profileId)
          )
        );
      logger.error('interview-persist-curriculum exhausted retries', {
        profileId: data.profileId,
        draftId: data.draftId,
        failureCode: code,
        rawError: (error as Error)?.message,
      });
    },
  },
  { event: 'app/interview.ready_to_persist' },
  async ({ event, step }) => {
    const { draftId, profileId, subjectId, subjectName, bookId } =
      event.data as {
        draftId: string;
        profileId: string;
        subjectId: string;
        subjectName: string;
        bookId?: string;
      };

    type ExtractedSignals = {
      goals: string[];
      experienceLevel: string;
      currentKnowledge: string;
      interests: string[];
    };

    const signals = await step.run('extract-signals', async () => {
      const db = getStepDatabase();
      const draft = await loadDraft(db, profileId, draftId);
      if (!draft) throw new NonRetriableError('draft-disappeared');

      const cached = draft.extractedSignals as ExtractedSignals | null;
      if (
        cached &&
        ((cached.goals?.length ?? 0) > 0 || (cached.interests?.length ?? 0) > 0)
      ) {
        return cached;
      }

      try {
        const fresh = await extractSignals(
          draft.exchangeHistory as Parameters<typeof extractSignals>[0]
        );
        if (
          !fresh ||
          (fresh.goals.length === 0 && fresh.interests.length === 0)
        ) {
          throw new PersistCurriculumError('empty_signals');
        }
        return fresh;
      } catch (err) {
        if (err instanceof PersistCurriculumError) throw err;
        throw new PersistCurriculumError(
          'extract_signals_failed',
          (err as Error)?.message
        );
      }
    });

    await step.run('save-signals', async () => {
      const db = getStepDatabase();
      await db
        .update(onboardingDrafts)
        .set({ extractedSignals: signals })
        .where(
          and(
            eq(onboardingDrafts.id, draftId),
            eq(onboardingDrafts.profileId, profileId)
          )
        );
    });

    await step.run('persist-curriculum', async () => {
      const db = getStepDatabase();
      const draft = await loadDraft(db, profileId, draftId);
      if (!draft) throw new NonRetriableError('draft-disappeared');

      try {
        const draftForPersist = {
          ...draft,
          extractedSignals: signals,
          failureCode: draft.failureCode ?? null,
          expiresAt: draft.expiresAt?.toISOString() ?? null,
          createdAt: draft.createdAt.toISOString(),
          updatedAt: draft.updatedAt.toISOString(),
        } as unknown as Parameters<typeof persistCurriculum>[4];
        await persistCurriculum(
          db,
          profileId,
          subjectId,
          subjectName,
          draftForPersist,
          bookId
        );
        await db
          .update(onboardingDrafts)
          .set({ status: 'completed', failureCode: null })
          .where(
            and(
              eq(onboardingDrafts.id, draftId),
              eq(onboardingDrafts.profileId, profileId)
            )
          );
      } catch (err) {
        if (err instanceof PersistCurriculumError) throw err;
        throw new PersistCurriculumError(
          'persist_failed',
          (err as Error)?.message
        );
      }
    });

    await step.run('send-completion-push', async () => {
      try {
        const db = getStepDatabase();
        await sendPushNotification(db, {
          profileId,
          title: 'Your learning path is ready',
          body: `${subjectName} is set up — tap to review`,
          type: 'interview_ready',
        });
      } catch (err) {
        logger.warn('completion push failed', {
          profileId,
          draftId,
          error: (err as Error)?.message,
        });
        await inngest.send({
          name: 'app/interview.completion_push_failed',
          data: { profileId, draftId, subjectId, version: 1 as const },
        });
      }
    });
  }
);
