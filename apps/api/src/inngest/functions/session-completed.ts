import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { updateRetentionFromSession } from '../../services/retention-data';
import { createPendingSessionSummary } from '../../services/summaries';
import { recordSessionActivity } from '../../services/streaks';
import { storeSessionEmbedding } from '../../services/embeddings';

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
      const content = `Session ${sessionId} for topic ${topicId ?? 'unknown'}`;
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
