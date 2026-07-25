import worker from './index';

interface CapturedLog {
  level: string;
  body: unknown;
  attributes?: Record<string, unknown>;
}

const ALERT_ATTRIBUTE_KEYS = [
  'count',
  'environment',
  'event',
  'provider',
  'surface',
  'threshold',
  'utc_date',
];

function createTestExecutionContext() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
      passThroughOnException: () => undefined,
    },
    async drain() {
      await Promise.allSettled(pending);
    },
  };
}

function findCapturedLogs(envelopeBodies: string[]): CapturedLog[] {
  const logs: CapturedLog[] = [];
  for (const body of envelopeBodies) {
    for (const line of body.split('\n').filter(Boolean)) {
      try {
        const parsed = JSON.parse(line) as { items?: CapturedLog[] };
        if (Array.isArray(parsed.items)) {
          logs.push(...parsed.items);
        }
      } catch {
        // Envelope and item headers are not log-container payloads.
      }
    }
  }
  return logs;
}

function unwrapSentryAttributes(
  attributes: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(attributes ?? {}).map(([key, attribute]) => [
      key,
      typeof attribute === 'object' &&
      attribute !== null &&
      'value' in attribute
        ? attribute.value
        : attribute,
    ]),
  );
}

describe('production Worker LLM volume-alert transport', () => {
  let originalFetch: typeof fetch;
  let envelopeBodies: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    envelopeBodies = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.includes('/envelope/')) {
        envelopeBodies.push(String(init?.body ?? ''));
      }
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('ships one canonical log with exactly the seven bounded attributes', async () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { ctx, drain } = createTestExecutionContext();

    try {
      const response = await worker.fetch(
        new Request(
          'https://api.example.com/v1/maintenance/llm-volume-alert-probe',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Maintenance-Secret': 'maintenance-secret',
            },
            body: JSON.stringify({
              rawInput: 'LEARNER_RAW_INPUT_SENTINEL',
              content: 'MODEL_OUTPUT_SENTINEL',
              sessionId: 'SESSION_ID_SENTINEL',
            }),
          },
        ),
        {
          SENTRY_DSN: 'https://public@o0.ingest.sentry.io/1',
          ENVIRONMENT: 'production',
          MAINTENANCE_SECRET: 'maintenance-secret',
        } as never,
        ctx as never,
      );
      const responseBody = (await response.json()) as {
        emitted: boolean;
        provider: string;
        emittedAt: string;
        utcDate: string;
      };
      await drain();

      expect(response.status).toBe(200);
      expect(responseBody).toEqual({
        emitted: true,
        provider: 'synthetic-operator-probe',
        emittedAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ),
        utcDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(envelopeBodies.length).toBeGreaterThan(0);

      const logs = findCapturedLogs(envelopeBodies);
      expect(logs).toHaveLength(1);
      expect(logs[0]?.level).toBe('warn');
      expect(logs[0]?.body).toBe('llm.volume.daily_threshold_exceeded');
      expect(Object.keys(logs[0]?.attributes ?? {}).sort()).toEqual(
        ALERT_ATTRIBUTE_KEYS,
      );
      expect(unwrapSentryAttributes(logs[0]?.attributes)).toEqual({
        event: 'llm.volume.daily_threshold_exceeded',
        surface: 'llm_volume_alert',
        provider: 'synthetic-operator-probe',
        environment: 'production',
        count: 1,
        threshold: 1,
        utc_date: responseBody.utcDate,
      });

      const shippedPayload = JSON.stringify(envelopeBodies);
      expect(shippedPayload).not.toContain('LEARNER_RAW_INPUT_SENTINEL');
      expect(shippedPayload).not.toContain('MODEL_OUTPUT_SENTINEL');
      expect(shippedPayload).not.toContain('SESSION_ID_SENTINEL');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
