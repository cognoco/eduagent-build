import { createLogger, type LogEntry, type LogLevel } from './logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureConsole(): {
  logs: string[];
  warns: string[];
  errors: string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: unknown[]) => logs.push(String(args[0]));
  console.warn = (...args: unknown[]) => warns.push(String(args[0]));
  console.error = (...args: unknown[]) => errors.push(String(args[0]));

  return {
    logs,
    warns,
    errors,
    restore: () => {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

function parseEntry(raw: string): LogEntry {
  return JSON.parse(raw) as LogEntry;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLogger', () => {
  let captured: ReturnType<typeof captureConsole>;

  beforeEach(() => {
    captured = captureConsole();
  });

  afterEach(() => {
    captured.restore();
  });

  // -------------------------------------------------------------------------
  // JSON structure
  // -------------------------------------------------------------------------

  describe('structured output', () => {
    it('emits valid JSON with required fields', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.info('hello');

      expect(captured.logs).toHaveLength(1);
      const entry = parseEntry(captured.logs[0]);
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('hello');
      expect(entry.timestamp).toBeDefined();
      // ISO 8601 format check
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    });

    it('includes context when provided', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.info('with context', { userId: 'u1', action: 'login' });

      const entry = parseEntry(captured.logs[0]);
      expect(entry.context).toEqual({ userId: 'u1', action: 'login' });
    });

    it('omits context key when context is empty', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.info('no context', {});

      const entry = parseEntry(captured.logs[0]);
      expect(entry.context).toBeUndefined();
    });

    it('omits context key when not provided', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.info('bare message');

      const entry = parseEntry(captured.logs[0]);
      expect(entry.context).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Console routing
  // -------------------------------------------------------------------------

  describe('console method routing', () => {
    it('routes error to console.error', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.error('fail');

      expect(captured.errors).toHaveLength(1);
      expect(captured.logs).toHaveLength(0);
      expect(captured.warns).toHaveLength(0);
    });

    it('routes warn to console.warn', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.warn('caution');

      expect(captured.warns).toHaveLength(1);
      expect(captured.logs).toHaveLength(0);
      expect(captured.errors).toHaveLength(0);
    });

    it('routes info to console.log', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.info('note');

      expect(captured.logs).toHaveLength(1);
      expect(captured.warns).toHaveLength(0);
      expect(captured.errors).toHaveLength(0);
    });

    it('routes debug to console.log', () => {
      const logger = createLogger({ level: 'debug', environment: 'test' });

      logger.debug('trace');

      expect(captured.logs).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Level filtering
  // -------------------------------------------------------------------------

  describe('level filtering', () => {
    it.each<{
      configLevel: LogLevel;
      callLevel: LogLevel;
      shouldEmit: boolean;
    }>([
      { configLevel: 'info', callLevel: 'debug', shouldEmit: false },
      { configLevel: 'info', callLevel: 'info', shouldEmit: true },
      { configLevel: 'info', callLevel: 'warn', shouldEmit: true },
      { configLevel: 'info', callLevel: 'error', shouldEmit: true },
      { configLevel: 'warn', callLevel: 'info', shouldEmit: false },
      { configLevel: 'warn', callLevel: 'warn', shouldEmit: true },
      { configLevel: 'error', callLevel: 'debug', shouldEmit: false },
      { configLevel: 'error', callLevel: 'warn', shouldEmit: false },
      { configLevel: 'error', callLevel: 'error', shouldEmit: true },
      { configLevel: 'debug', callLevel: 'debug', shouldEmit: true },
    ])(
      'config=$configLevel call=$callLevel => emits=$shouldEmit',
      ({ configLevel, callLevel, shouldEmit }) => {
        const logger = createLogger({
          level: configLevel,
          environment: 'test',
        });

        logger[callLevel]('test message');

        const totalEmitted =
          captured.logs.length + captured.warns.length + captured.errors.length;

        if (shouldEmit) {
          expect(totalEmitted).toBe(1);
        } else {
          expect(totalEmitted).toBe(0);
        }
      }
    );
  });
});
