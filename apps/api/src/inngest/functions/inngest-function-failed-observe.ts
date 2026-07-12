// @inngest-admin: no-db (PII-free fleet failure observability terminus)
import { captureException } from '../../services/sentry';
import { inngest } from '../client';

const FUNCTION_ID = 'inngest-function-failed-observe';

type FunctionFailedData = {
  function_id?: unknown;
  run_id?: unknown;
  error?: {
    name?: unknown;
  };
};

function boundedString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, 200)
    : fallback;
}

export const inngestFunctionFailedObserve = inngest.createFunction(
  {
    id: FUNCTION_ID,
    name: 'Observe terminal Inngest function failures',
    retries: 0,
  },
  { event: 'inngest/function.failed' },
  async ({ event }) => {
    const data = event.data as FunctionFailedData;
    const functionId = boundedString(data?.function_id, 'unknown');

    if (functionId === FUNCTION_ID) {
      return { status: 'skipped' as const, reason: 'self_failure' as const };
    }

    captureException(new Error('Inngest function failed after retries'), {
      tags: {
        surface: 'inngest-fleet',
        signal: 'function-failed',
        functionId,
      },
      extra: {
        runId: boundedString(data?.run_id, 'unknown'),
        errorName: boundedString(data?.error?.name, 'unknown'),
      },
    });

    return { status: 'captured' as const, functionId };
  },
);
