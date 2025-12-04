/**
 * Sentry Instrumentation Tests
 *
 * These tests verify Sentry initialization without sending real events.
 * Sentry SDK is mocked globally in jest.setup.ts
 */

import * as Sentry from '@sentry/node';
import { initSentry, getSentry } from './instrumentation';

describe('Sentry Instrumentation', () => {
  // Store original environment variables
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('initSentry', () => {
    it('should initialize Sentry with correct configuration when DSN is provided', () => {
      // Arrange
      process.env.SENTRY_DSN_SERVER = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      process.env.npm_package_version = '1.0.0';

      const mockInit = Sentry.init as jest.Mock;

      // Act
      initSentry();

      // Assert
      expect(mockInit).toHaveBeenCalledTimes(1);
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          environment: 'production',
          release: '1.0.0',
          tracesSampleRate: 0.1, // Production uses 10%
          debug: false,
          maxBreadcrumbs: 50,
          attachStacktrace: true,
        })
      );
    });

    it('should use development trace sample rate in non-production', () => {
      // Arrange
      process.env.SENTRY_DSN_SERVER = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'development';

      const mockInit = Sentry.init as jest.Mock;

      // Act
      initSentry();

      // Assert
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: 1.0, // Development uses 100%
          debug: true, // Debug enabled in development
        })
      );
    });

    it('should default to development environment when NODE_ENV is not set', () => {
      // Arrange
      process.env.SENTRY_DSN_SERVER = 'https://test@sentry.io/123';
      delete process.env.NODE_ENV;

      const mockInit = Sentry.init as jest.Mock;

      // Act
      initSentry();

      // Assert
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
        })
      );
    });

    it('should use "unknown" as release when package version is not available', () => {
      // Arrange
      process.env.SENTRY_DSN_SERVER = 'https://test@sentry.io/123';
      delete process.env.npm_package_version;

      const mockInit = Sentry.init as jest.Mock;

      // Act
      initSentry();

      // Assert
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          release: 'unknown',
        })
      );
    });

    it('should NOT initialize Sentry when DSN is not provided', () => {
      // Arrange
      delete process.env.SENTRY_DSN_SERVER;

      const mockInit = Sentry.init as jest.Mock;
      const mockWarn = jest.spyOn(console, 'warn').mockImplementation();

      // Act
      initSentry();

      // Assert
      expect(mockInit).not.toHaveBeenCalled();
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('Sentry DSN not configured')
      );

      // Cleanup
      mockWarn.mockRestore();
    });

    it('should log successful initialization', () => {
      // Arrange
      process.env.SENTRY_DSN_SERVER = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'test';

      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      // Act
      initSentry();

      // Assert
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Sentry initialized for environment: test')
      );

      // Cleanup
      mockLog.mockRestore();
    });

    it('should NOT configure manual integrations (automatic in v8+)', () => {
      // Arrange
      process.env.SENTRY_DSN_SERVER = 'https://test@sentry.io/123';

      const mockInit = Sentry.init as jest.Mock;

      // Act
      initSentry();

      // Assert - Sentry v8+ uses automatic OpenTelemetry integrations
      // No manual integration configuration should be present
      expect(mockInit).toHaveBeenCalledWith(
        expect.not.objectContaining({
          integrations: expect.anything(),
        })
      );
    });
  });

  describe('getSentry', () => {
    it('should return Sentry module', () => {
      // Act
      const sentry = getSentry();

      // Assert
      expect(sentry).toBeDefined();
      expect(sentry).toHaveProperty('init');
    });
  });
});
