/**
 * Unit tests for Sentry client configuration (instrumentation-client.ts)
 *
 * These tests verify that Sentry is initialized with correct configuration
 * without actually sending events to Sentry servers.
 *
 * Note: Tests import from instrumentation-client.ts (the Next.js 15+ standard pattern)
 * which replaced sentry.client.config.ts for Turbopack compatibility.
 */

// Mock Sentry before importing the config
jest.mock('@sentry/nextjs', () => ({
  init: jest.fn(),
  browserTracingIntegration: jest.fn(() => ({ name: 'BrowserTracing' })),
  replayIntegration: jest.fn(() => ({ name: 'Replay' })),
  captureRouterTransitionStart: jest.fn(),
}));

describe('Sentry Client Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules(); // Clear module cache
    // Reset environment using Object.assign instead of reassignment
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original environment
    Object.keys(process.env).forEach((key) => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  it('should initialize Sentry with DSN when NEXT_PUBLIC_SENTRY_DSN is set', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'development';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://test-key@test-org.ingest.sentry.io/test-project',
        enabled: true,
      })
    );
  });

  it('should use production sample rate when NODE_ENV is production', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'production';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.1, // 10% in production
      })
    );
  });

  it('should use development sample rate when NODE_ENV is not production', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'development';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1.0, // 100% in development
      })
    );
  });

  it('should set environment from NEXT_PUBLIC_VERCEL_ENV when available', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    process.env.NODE_ENV = 'production';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
      })
    );
  });

  it('should set environment from NODE_ENV when NEXT_PUBLIC_VERCEL_ENV is not available', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'development',
      })
    );
  });

  it('should set release from VERCEL_GIT_COMMIT_SHA when available', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc123def456';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        release: 'nx-monorepo@abc123def456',
      })
    );
  });

  it('should include browserTracingIntegration', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'development';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.browserTracingIntegration).toHaveBeenCalled();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: expect.arrayContaining([
          expect.objectContaining({ name: 'BrowserTracing' }),
        ]),
      })
    );
  });

  it('should be disabled when NODE_ENV is not production and no DSN is provided', async () => {
    // Arrange
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    );
  });

  it('should be disabled in production when DSN is not set (avoids silent failure)', async () => {
    // Arrange
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert - Sentry should be disabled without DSN to avoid overhead with no destination
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    );
  });

  it('should have debug disabled', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'development';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        debug: false,
      })
    );
  });

  it('should configure breadcrumbs', async () => {
    // Arrange
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://test-key@test-org.ingest.sentry.io/test-project';
    process.env.NODE_ENV = 'development';

    const Sentry = require('@sentry/nextjs');

    // Act
    await import('../../instrumentation-client');

    // Assert
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBreadcrumbs: 50,
        attachStacktrace: true,
      })
    );
  });
});
