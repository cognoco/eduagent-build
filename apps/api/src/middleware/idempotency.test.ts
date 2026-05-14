jest.mock('../services/sentry' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/sentry'),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('../services/logger' /* gc1-allow: pattern-a conversion */, () => ({
  ...jest.requireActual('../services/logger'),
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// prettier-ignore
jest.mock( // gc1-allow: pattern-a conversion
  '../services/idempotency-assistant-state' /* gc1-allow: pattern-a conversion */,
  () => ({
    ...jest.requireActual('../services/idempotency-assistant-state'),
    lookupAssistantTurnState: jest.fn(),
  }),
);

import { Hono } from 'hono';
import { idempotencyPreflight } from './idempotency';
import { lookupAssistantTurnState } from '../services/idempotency-assistant-state';
import { captureException, addBreadcrumb } from '../services/sentry';

const mockLookupAssistantTurnState =
  lookupAssistantTurnState as jest.MockedFunction<
    typeof lookupAssistantTurnState
  >;
const mockCaptureException = captureException as jest.MockedFunction<
  typeof captureException
>;
const mockAddBreadcrumb = addBreadcrumb as jest.MockedFunction<
  typeof addBreadcrumb
>;

function createApp(options: { profileId?: string } = {}) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    (c as any).set('db', {});
    if (options.profileId !== undefined) {
      (c as any).set('profileId', options.profileId);
    }
    await next();
  });

  app.use('*', idempotencyPreflight({ flow: 'session' }));

  app.post('/test', (c) => c.json({ ok: true }));

  return app;
}

function makeKv(overrides?: Partial<{ get: jest.Mock; put: jest.Mock }>) {
  return {
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('idempotencyPreflight middleware', () => {
  describe('no Idempotency-Key header', () => {
    it('passes through to downstream handler and returns 200', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kv = makeKv();

      const res = await app.request(
        '/test',
        { method: 'POST' },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(kv.get).not.toHaveBeenCalled();
    });
  });

  describe('key present but exceeds 256 characters', () => {
    it('returns 400 with INVALID_IDEMPOTENCY_KEY and does not hit KV', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kv = makeKv();
      const longKey = 'a'.repeat(257);

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': longKey },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key exceeds 256 characters',
      });
      expect(kv.get).not.toHaveBeenCalled();
    });

    it('accepts a key of exactly 256 characters', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kv = makeKv({ get: jest.fn().mockResolvedValue(null) });
      const exactKey = 'b'.repeat(256);

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': exactKey },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(kv.get).toHaveBeenCalled();
    });
  });

  describe('key present but profileId missing', () => {
    it('passes through to downstream handler and logs a breadcrumb', async () => {
      const app = createApp();
      const kv = makeKv();

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'abc-123' },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(kv.get).not.toHaveBeenCalled();
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        'idempotency preflight skipped: profile missing',
        'idempotency',
        'warning',
      );
    });
  });

  describe('key present but IDEMPOTENCY_KV binding missing', () => {
    it('passes through to downstream handler and logs a breadcrumb', async () => {
      const app = createApp({ profileId: 'profile-1' });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'abc-123' },
        },
        {},
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        'idempotency preflight skipped: binding missing',
        'idempotency',
        'warning',
      );
    });
  });

  describe('key present, KV returns null (cache miss)', () => {
    it('passes through to downstream handler', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kv = makeKv({ get: jest.fn().mockResolvedValue(null) });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'abc-123' },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(kv.get).toHaveBeenCalledWith('idem:profile-1:session:abc-123');
      expect(mockLookupAssistantTurnState).not.toHaveBeenCalled();
    });
  });

  describe('key present, KV.get throws', () => {
    it('passes through to downstream handler, calls captureException and addBreadcrumb', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kvError = new Error('KV network failure');
      const kv = makeKv({ get: jest.fn().mockRejectedValue(kvError) });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'abc-123' },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      expect(mockCaptureException).toHaveBeenCalledWith(
        kvError,
        expect.objectContaining({
          profileId: 'profile-1',
          extra: expect.objectContaining({
            context: 'idempotency.preflight.get',
            flow: 'session',
            key: 'abc-123',
          }),
        }),
      );
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        'idempotency preflight lookup failed',
        'idempotency',
      );
    });
  });

  describe('key present, KV cache hit, assistant turn ready', () => {
    it('returns replay response with Idempotency-Replay header and persisted state', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kv = makeKv({ get: jest.fn().mockResolvedValue('1') });

      mockLookupAssistantTurnState.mockResolvedValue({
        assistantTurnReady: true,
        latestExchangeId: 'ex-1',
      });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'abc-123' },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.headers.get('Idempotency-Replay')).toBe('true');
      const body = await res.json();
      expect(body).toEqual({
        replayed: true,
        clientId: 'abc-123',
        status: 'persisted',
        assistantTurnReady: true,
        latestExchangeId: 'ex-1',
      });
      expect(mockLookupAssistantTurnState).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-1',
          flow: 'session',
          key: 'abc-123',
        }),
      );
    });
  });

  describe('key present, KV cache hit, assistant turn pending', () => {
    it('returns replay response with assistantTurnReady false and null latestExchangeId', async () => {
      const app = createApp({ profileId: 'profile-1' });
      const kv = makeKv({ get: jest.fn().mockResolvedValue('1') });

      mockLookupAssistantTurnState.mockResolvedValue({
        assistantTurnReady: false,
        latestExchangeId: null,
      });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': 'abc-123' },
        },
        { IDEMPOTENCY_KV: kv },
      );

      expect(res.headers.get('Idempotency-Replay')).toBe('true');
      const body = await res.json();
      expect(body).toEqual({
        replayed: true,
        clientId: 'abc-123',
        status: 'persisted',
        assistantTurnReady: false,
        latestExchangeId: null,
      });
    });
  });
});
