import { NonRetriableError } from 'inngest';
import { streakRecordEventSchema } from '@eduagent/schemas';
import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { recordSessionActivity } from '../../services/streaks';

export const streakRecord = inngest.createFunction(
  {
    id: 'streak-record',
    name: 'Durable streak activity recording',
    retries: 3,
    // [INNGEST-IDEMPOTENCY] Defence-in-depth: a cron re-fire or operator replay
    // can deliver the same (profileId, date) twice. recordSessionActivity is
    // already date-keyed/idempotent at the data layer, but an explicit
    // function-level key dedups duplicate events within the Inngest runtime
    // before the handler runs, matching the rest of the codebase's
    // defence-in-depth posture (review-due-send, recall-nudge-send,
    // dailySnapshotRefresh).
    idempotency: 'event.data.profileId + "-" + event.data.date',
  },
  { event: 'app/streak.record' },
  async ({ event, step }) => {
    const parsed = streakRecordEventSchema.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError('invalid-streak-record-payload');
    }
    const { profileId, date } = parsed.data;

    const result = await step.run('record-activity', async () => {
      const db = getStepDatabase();
      return recordSessionActivity(db, profileId, date);
    });

    return { step: 'streak-record', status: 'ok' as const, streak: result };
  },
);
