import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { updateRetentionFromSession } from '../../services/retention-data';
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
    } = event.data;

    // Step 1: Update retention data via SM-2
    await step.run('update-retention', async () => {
      if (!topicId) return;
      const db = getStepDatabase();
      const quality = event.data.qualityRating ?? 3;
      await updateRetentionFromSession(db, profileId, topicId, quality);
    });

    // Step 2: Write coaching card / session summary
    await step.run('write-coaching-card', async () => {
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
    });

    // Step 3: Update dashboard — streaks + XP
    await step.run('update-dashboard', async () => {
      const db = getStepDatabase();
      const today = timestamp
        ? new Date(timestamp).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      await recordSessionActivity(db, profileId, today);

      // TODO: Insert XP ledger entry when mastery score is computed (Epic 3)
      void subjectId;
    });

    // Step 4: Generate and store session embedding
    await step.run('generate-embeddings', async () => {
      const db = getStepDatabase();
      const content = await extractSessionContent(db, sessionId, profileId);
      await storeSessionEmbedding(
        db,
        sessionId,
        profileId,
        topicId ?? null,
        content
      );
    });

    return { status: 'completed', sessionId };
  }
);
