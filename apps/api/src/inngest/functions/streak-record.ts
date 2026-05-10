import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { recordSessionActivity } from '../../services/streaks';

export const streakRecord = inngest.createFunction(
  {
    id: 'streak-record',
    name: 'Durable streak activity recording',
    retries: 3,
  },
  { event: 'app/streak.record' },
  async ({ event, step }) => {
    const { profileId, date } = event.data as {
      profileId: string;
      date: string;
    };

    const result = await step.run('record-activity', async () => {
      const db = getStepDatabase();
      return recordSessionActivity(db, profileId, date);
    });

    return { step: 'streak-record', status: 'ok' as const, streak: result };
  },
);
