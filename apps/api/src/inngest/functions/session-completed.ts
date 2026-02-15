import { inngest } from '../client';

export const sessionCompleted = inngest.createFunction(
  { id: 'session-completed', name: 'Process session completion' },
  { event: 'app/session.completed' },
  async ({ event, step }) => {
    const {
      profileId,
      sessionId,
      topicId: _topicId,
      subjectId: _subjectId,
      summaryStatus: _summaryStatus,
      escalationRungs: _escalationRungs,
      timestamp: _timestamp,
    } = event.data;

    // Step 1: Update retention data (Epic 3 will implement SM-2)
    await step.run('update-retention', async () => {
      // TODO: Call SM-2 calculation when Epic 3 ships
      console.log(`Retention update for session ${sessionId}`);
    });

    // Step 2: Write coaching card to KV (Epic 4 will implement full logic)
    await step.run('write-coaching-card', async () => {
      // TODO: Compute and write coaching card to Workers KV
      console.log(`Coaching card write for profile ${profileId}`);
    });

    // Step 3: Update dashboard data
    await step.run('update-dashboard', async () => {
      // TODO: Update dashboard aggregates
      console.log(`Dashboard update for profile ${profileId}`);
    });

    // Step 4: Generate embeddings (Epic 3 will implement)
    await step.run('generate-embeddings', async () => {
      // TODO: Generate and store session summary embedding
      console.log(`Embedding generation for session ${sessionId}`);
    });

    return { status: 'completed', sessionId };
  }
);
