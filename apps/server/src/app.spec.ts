/**
 * App Tests
 *
 * Tests for the Express app creation and configuration.
 * Sentry is mocked globally in jest.setup.ts to prevent actual initialization.
 *
 * Note: Sentry v8+ uses setupExpressErrorHandler instead of Handlers.*
 */

import { createApp } from './app';
import * as Sentry from '@sentry/node';

describe('createApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create Express app', () => {
    const app = createApp();
    expect(app).toBeDefined();
  });

  it('should register Sentry error handler (v8+ API)', () => {
    createApp();
    // v8+ uses setupExpressErrorHandler instead of Handlers.errorHandler
    expect(Sentry.setupExpressErrorHandler).toHaveBeenCalled();
  });

  it('should pass Express app to Sentry setupExpressErrorHandler', () => {
    const app = createApp();
    expect(Sentry.setupExpressErrorHandler).toHaveBeenCalledWith(app);
  });
});
