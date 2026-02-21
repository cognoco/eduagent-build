import { inngest } from '../client';
import { getStepDatabase, getStepVoyageApiKey } from '../helpers';
import {
  updateRetentionFromSession,
  updateNeedsDeepeningProgress,
} from '../../services/retention-data';
import { createPendingSessionSummary } from '../../services/summaries';
import { recordSessionActivity } from '../../services/streaks';
import {
  extractSessionContent,
  storeSessionEmbedding,
} from '../../services/embeddings';
import {
  precomputeCoachingCard,
  writeCoachingCardCache,
} from '../../services/coaching-cards';
import { insertSessionXpEntry } from '../../services/xp';
import {
  incrementSummarySkips,
  resetSummarySkips,
} from '../../services/settings';
import { captureException } from '../../services/sentry';

// ---------------------------------------------------------------------------
// Step error isolation — each step catches its own errors so that a failure
// in one step (e.g. Voyage AI down) never blocks the remaining steps.
// Errors are logged to Sentry and the step returns a degraded result.
// ---------------------------------------------------------------------------

interface StepOutcome {
  step: string;
  status: 'ok' | 'skipped' | 'failed';
  error?: string;
}

async function runIsolated(
  name: string,
  profileId: string,
  fn: () => Promise<void>
): Promise<StepOutcome> {
  try {
    await fn();
    return { step: name, status: 'ok' };
  } catch (err) {
    captureException(err, { profileId });
    console.error(`[session-completed] step "${name}" failed:`, err);
    return {
      step: name,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const sessionCompleted = inngest.createFunction(
  { id: 'session-completed', name: 'Process session completion' },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    const {
      profileId,
      sessionId,
      topicId,
      subjectId,
      summaryStatus,
      timestamp,
      interleavedTopicIds,
    } = event.data;

    const outcomes: StepOutcome[] = [];

    // FR92: Determine which topics need retention updates
    // Interleaved sessions update all practiced topics; others update the single topicId
    const retentionTopicIds: string[] = (
      interleavedTopicIds as string[] | undefined
    )?.length
      ? (interleavedTopicIds as string[])
      : topicId
      ? [topicId]
      : [];

    // Step 1: Update retention data via SM-2
    outcomes.push(
      await step.run('update-retention', async () => {
        if (retentionTopicIds.length === 0)
          return { step: 'update-retention', status: 'skipped' as const };
        return runIsolated('update-retention', profileId, async () => {
          const db = getStepDatabase();
          const quality = event.data.qualityRating ?? 3;
          for (const tid of retentionTopicIds) {
            await updateRetentionFromSession(db, profileId, tid, quality);
          }
        });
      })
    );

    // Step 1b: Update needs-deepening progress (FR63)
    outcomes.push(
      await step.run('update-needs-deepening', async () => {
        if (retentionTopicIds.length === 0)
          return { step: 'update-needs-deepening', status: 'skipped' as const };
        return runIsolated('update-needs-deepening', profileId, async () => {
          const db = getStepDatabase();
          const quality = event.data.qualityRating ?? 3;
          for (const tid of retentionTopicIds) {
            await updateNeedsDeepeningProgress(db, profileId, tid, quality);
          }
        });
      })
    );

    // Step 2: Write coaching card / session summary
    outcomes.push(
      await step.run('write-coaching-card', async () =>
        runIsolated('write-coaching-card', profileId, async () => {
          const db = getStepDatabase();
          await createPendingSessionSummary(
            db,
            sessionId,
            profileId,
            topicId ?? null,
            summaryStatus ?? 'pending'
          );

          // Precompute coaching card and write to cache (ARCH-11)
          const card = await precomputeCoachingCard(db, profileId);
          await writeCoachingCardCache(db, profileId, card);
        })
      )
    );

    // Step 3: Update dashboard — streaks + XP
    outcomes.push(
      await step.run('update-dashboard', async () =>
        runIsolated('update-dashboard', profileId, async () => {
          const db = getStepDatabase();
          const today = timestamp
            ? new Date(timestamp).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);

          await recordSessionActivity(db, profileId, today);

          await insertSessionXpEntry(db, profileId, topicId ?? null, subjectId);
        })
      )
    );

    // Step 4: Generate and store session embedding
    outcomes.push(
      await step.run('generate-embeddings', async () =>
        runIsolated('generate-embeddings', profileId, async () => {
          const db = getStepDatabase();
          const voyageApiKey = getStepVoyageApiKey();
          const content = await extractSessionContent(db, sessionId, profileId);
          await storeSessionEmbedding(
            db,
            sessionId,
            profileId,
            topicId ?? null,
            content,
            voyageApiKey
          );
        })
      )
    );

    // Step 5: Track consecutive summary skips (FR94 — Casual Explorer prompt)
    outcomes.push(
      await step.run('track-summary-skips', async () =>
        runIsolated('track-summary-skips', profileId, async () => {
          const db = getStepDatabase();
          if (summaryStatus === 'skipped') {
            await incrementSummarySkips(db, profileId);
          } else if (
            summaryStatus === 'submitted' ||
            summaryStatus === 'accepted'
          ) {
            await resetSummarySkips(db, profileId);
          }
        })
      )
    );

    const failed = outcomes.filter((o) => o.status === 'failed');
    return {
      status: failed.length > 0 ? 'completed-with-errors' : 'completed',
      sessionId,
      outcomes,
    };
  }
);
