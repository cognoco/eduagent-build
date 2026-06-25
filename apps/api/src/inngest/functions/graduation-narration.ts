import {
  personGraduatedEventSchema,
  summarizeRawPayload,
} from '@eduagent/schemas';

import { inngest } from '../client';
import { getStepDatabase } from '../helpers';
import { restampGraduationContracts } from '../../services/graduation-narration';
import { createLogger } from '../../services/logger';
import { captureException } from '../../services/sentry';

const logger = createLogger();

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
    const parsedResult = personGraduatedEventSchema.safeParse(event.data);
    if (!parsedResult.success) {
      captureException(
        new Error(
          `graduation-narration: invalid payload - ${parsedResult.error.message}`,
        ),
        {
          extra: {
            site: 'graduationNarration.invalid_payload',
            issues: parsedResult.error.issues,
            rawData: summarizeRawPayload(event.data),
          },
        },
      );
      logger.warn('graduation_narration.invalid_payload', {
        issues: parsedResult.error.issues,
      });
      return {
        status: 'invalid_payload' as const,
        error: parsedResult.error.message,
      };
    }

    const parsed = parsedResult.data;
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
