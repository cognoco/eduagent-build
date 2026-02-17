import { eq, and } from 'drizzle-orm';
import { inngest } from '../client';
import { sm2 } from '@eduagent/retention';
import {
  createDatabase,
  createScopedRepository,
  retentionCards,
  streaks,
  sessionSummaries,
  storeEmbedding,
} from '@eduagent/database';
import { recordDailyActivity } from '../../services/streaks';

/**
 * Returns a Database instance for use within Inngest step functions.
 *
 * TODO: Inject DATABASE_URL via Inngest middleware when wiring Neon (Layer 2).
 * See account-deletion.ts for rationale.
 */
function getStepDatabase() {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not configured');
  return createDatabase(url);
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
      escalationRungs: _escalationRungs,
      timestamp,
    } = event.data;

    // Step 1: Update retention data via SM-2
    await step.run('update-retention', async () => {
      const db = getStepDatabase();
      const repo = createScopedRepository(db, profileId);
      const card = await repo.retentionCards.findFirst(
        eq(retentionCards.topicId, topicId)
      );

      if (!card) return;

      const quality = event.data.qualityRating ?? 3;
      const result = sm2({
        quality,
        card: {
          easeFactor: Number(card.easeFactor),
          interval: card.intervalDays,
          repetitions: card.repetitions,
          lastReviewedAt:
            card.lastReviewedAt?.toISOString() ?? new Date().toISOString(),
          nextReviewAt:
            card.nextReviewAt?.toISOString() ?? new Date().toISOString(),
        },
      });

      // Scoped repo only provides reads — use raw db with defence-in-depth profileId filter
      await db
        .update(retentionCards)
        .set({
          easeFactor: String(result.card.easeFactor),
          intervalDays: result.card.interval,
          repetitions: result.card.repetitions,
          lastReviewedAt: new Date(result.card.lastReviewedAt),
          nextReviewAt: new Date(result.card.nextReviewAt),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(retentionCards.id, card.id),
            eq(retentionCards.profileId, profileId)
          )
        );
    });

    // Step 2: Write coaching card / session summary
    await step.run('write-coaching-card', async () => {
      const db = getStepDatabase();
      // Insert a pending session summary. The LLM-generated feedback
      // will be filled in when routeAndCall() is wired (Layer 2).
      await db.insert(sessionSummaries).values({
        sessionId,
        profileId,
        topicId: topicId ?? null,
        status: summaryStatus ?? 'pending',
        content: null,
        aiFeedback: null,
        // TODO: Generate coaching card content via routeAndCall() (Epic 4)
      });
    });

    // Step 3: Update dashboard — streaks + XP
    await step.run('update-dashboard', async () => {
      const db = getStepDatabase();
      const repo = createScopedRepository(db, profileId);
      const today = timestamp
        ? new Date(timestamp).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const streakRow = await repo.streaks.findFirst();

      if (streakRow) {
        const streakState = {
          currentStreak: streakRow.currentStreak,
          longestStreak: streakRow.longestStreak,
          lastActivityDate: streakRow.lastActivityDate,
          gracePeriodStartDate: streakRow.gracePeriodStartDate,
        };

        const update = recordDailyActivity(streakState, today);

        // Defence-in-depth: scope update by both ID and profileId
        await db
          .update(streaks)
          .set({
            currentStreak: update.newState.currentStreak,
            longestStreak: update.newState.longestStreak,
            lastActivityDate: update.newState.lastActivityDate,
            gracePeriodStartDate: update.newState.gracePeriodStartDate,
            updatedAt: new Date(),
          })
          .where(
            and(eq(streaks.id, streakRow.id), eq(streaks.profileId, profileId))
          );
      }

      // TODO: Insert XP ledger entry when mastery score is computed (Epic 3)
      void subjectId;
    });

    // Step 4: Generate and store session embedding
    await step.run('generate-embeddings', async () => {
      const db = getStepDatabase();
      // TODO: Replace placeholder with real embedding from LLM provider
      // when embedding generation is wired (Layer 2).
      // For now, store the session metadata as content with a zero vector.
      const placeholderEmbedding = new Array(1536).fill(0) as number[];
      const content = `Session ${sessionId} for topic ${topicId ?? 'unknown'}`;

      await storeEmbedding(db, {
        sessionId,
        profileId,
        topicId: topicId ?? undefined,
        content,
        embedding: placeholderEmbedding,
      });
    });

    return { status: 'completed', sessionId };
  }
);
