import worker, { app } from './index';
import { createLogger } from './services/logger';

interface CapturedLog {
  level: string;
  body: unknown;
  attributes?: Record<string, unknown>;
}

const TEST_ROUTE = '/health/wi2717-llm-volume-alert-transport';
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

describe('production Worker LLM volume-alert transport', () => {
  let originalFetch: typeof fetch;
  let envelopeBodies: string[];

  beforeAll(() => {
    app.get(TEST_ROUTE, (c) => {
      const logger = createLogger();
      logger.warn('llm.volume.daily_threshold_exceeded', {
        event: 'llm.volume.daily_threshold_exceeded',
        surface: 'llm_volume_alert',
        provider: 'openai',
        environment: 'production',
        count: 5000,
        threshold: 5000,
        utc_date: '2026-07-24',
        rawInput: 'LEARNER_RAW_INPUT_SENTINEL',
        content: 'MODEL_OUTPUT_SENTINEL',
        sessionId: 'SESSION_ID_SENTINEL',
      });
      logger.warn('llm.provider.fallback', {
        event: 'llm.provider.fallback',
        rawInput: 'UNRELATED_LOG_SENTINEL',
      });
      return c.text('ok');
    });
  });

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

    const response = await worker.fetch(
      new Request(`https://api.example.com/v1${TEST_ROUTE}`),
      {
        SENTRY_DSN: 'https://public@o0.ingest.sentry.io/1',
        ENVIRONMENT: 'production',
      } as never,
      ctx as never,
    );
    const responseBody = await response.text();
    await drain();
    warnSpy.mockRestore();

    expect(response.status).toBe(200);
    expect(responseBody).toBe('ok');
    expect(envelopeBodies.length).toBeGreaterThan(0);

    const logs = findCapturedLogs(envelopeBodies);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe('warn');
    expect(logs[0]?.body).toBe('llm.volume.daily_threshold_exceeded');
    expect(Object.keys(logs[0]?.attributes ?? {}).sort()).toEqual(
      ALERT_ATTRIBUTE_KEYS,
    );

    const shippedPayload = JSON.stringify(envelopeBodies);
    expect(shippedPayload).not.toContain('LEARNER_RAW_INPUT_SENTINEL');
    expect(shippedPayload).not.toContain('MODEL_OUTPUT_SENTINEL');
    expect(shippedPayload).not.toContain('SESSION_ID_SENTINEL');
    expect(shippedPayload).not.toContain('UNRELATED_LOG_SENTINEL');
  });
});
