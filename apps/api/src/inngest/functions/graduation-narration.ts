import { personGraduatedEventSchema } from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { restampGraduationContracts } from '../../services/graduation-narration';

export const graduationNarration = inngest.createFunction(
  {
    id: 'graduation-narration',
    name: 'Restamp visibility contracts after graduation',
    retries: 3,
    idempotency: 'event.data.personId + "-" + event.data.occurredAt',
    concurrency: { key: 'event.data.personId', limit: 1 },
  },
  { event: 'app/person.graduated' },
  async ({ event, step }) => {
    const parsed = personGraduatedEventSchema.parse(event.data);
    const result = await step.run('restamp-visibility-contracts', async () => {
      const db = getStepDatabase();
      return restampGraduationContracts(db, {
        personId: parsed.personId,
        occurredAt: new Date(parsed.occurredAt),
      });
    });

    return {
      status: 'restamped',
      personId: parsed.personId,
      restamped: result.restamped,
    };
  },
);
