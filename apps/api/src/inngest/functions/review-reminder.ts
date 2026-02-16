import { inngest } from '../client';

export const reviewReminder = inngest.createFunction(
  { id: 'review-reminder', name: 'Send review reminder when topics are due' },
  { event: 'app/retention.review-due' },
  async ({ event, step }) => {
    const { profileId, topicIds, timestamp: _timestamp } = event.data;

    await step.run('send-review-notification', async () => {
      // TODO: Send push notification via Expo Push SDK (ARCH-18)
      // "You have X topics ready for review!"
      console.log(
        `Review reminder for profile ${profileId}: ${topicIds.length} topics due`
      );
    });

    return { status: 'sent', profileId, topicCount: topicIds.length };
  }
);
