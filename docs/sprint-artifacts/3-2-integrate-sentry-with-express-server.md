# Story 3.2: Integrate Sentry with Express Server

Status: drafted

## Story

As a backend developer,
I want Sentry error tracking in the Express server,
so that server-side errors are captured and reported.

## Acceptance Criteria

1. **AC1**: Given Sentry project exists with server DSN, when I integrate `@sentry/node` into `apps/server`, then runtime errors are captured and appear in Sentry dashboard
2. **AC2**: Performance transactions are tracked for API endpoints
3. **AC3**: Environment (staging/production) is correctly tagged in Sentry events
4. **AC4**: Source maps are uploaded for stack trace resolution
5. **AC5**: Unit tests verify Sentry initialization without sending real events

## Tasks / Subtasks

- [ ] Task 1: Install Sentry SDK (AC: #1)
  - [ ] 1.1: Run `pnpm add @sentry/node --filter @nx-monorepo/server`
  - [ ] 1.2: Verify package.json updated in `apps/server`
  - [ ] 1.3: Check for peer dependency warnings

- [ ] Task 2: Initialize Sentry Early (AC: #1, #2)
  - [ ] 2.1: Create `apps/server/src/instrumentation.ts` for Sentry init
  - [ ] 2.2: Initialize Sentry at the top of `apps/server/src/main.ts` (before Express)
  - [ ] 2.3: Configure DSN from `process.env.SENTRY_DSN_SERVER`
  - [ ] 2.4: Enable performance tracing with `tracesSampleRate`
  - [ ] 2.5: Set `environment` from `process.env.NODE_ENV` or custom var

- [ ] Task 3: Configure Error Handler Middleware (AC: #1)
  - [ ] 3.1: Add Sentry request handler middleware (must be first middleware)
  - [ ] 3.2: Add Sentry tracing handler middleware (after request handler)
  - [ ] 3.3: Add Sentry error handler middleware (must be before any other error handlers)
  - [ ] 3.4: Ensure error handler is placed correctly in middleware chain

- [ ] Task 4: Configure Environment Tagging (AC: #3)
  - [ ] 4.1: Set `environment` option in Sentry.init()
  - [ ] 4.2: Add `release` option using git SHA or package version
  - [ ] 4.3: Configure `serverName` for multi-instance identification

- [ ] Task 5: Configure Source Maps (AC: #4)
  - [ ] 5.1: Install `@sentry/cli` as devDependency
  - [ ] 5.2: Create `.sentryclirc` or configure via environment
  - [ ] 5.3: Add source map upload to build process
  - [ ] 5.4: Configure `include` and `urlPrefix` for correct mapping

- [ ] Task 6: Write Tests (AC: #5)
  - [ ] 6.1: Create `apps/server/src/instrumentation.spec.ts`
  - [ ] 6.2: Mock `@sentry/node` to prevent real event sending
  - [ ] 6.3: Test Sentry.init() is called with correct options
  - [ ] 6.4: Test error handler captures exceptions
  - [ ] 6.5: Run `pnpm exec nx run server:test` - all tests pass

- [ ] Task 7: Manual Verification (AC: #1, #2)
  - [ ] 7.1: Create test endpoint that throws intentional error
  - [ ] 7.2: Start server and trigger error
  - [ ] 7.3: Verify error appears in Sentry dashboard
  - [ ] 7.4: Verify performance transaction appears
  - [ ] 7.5: Document verification steps

## Dev Notes

### Architecture Context

- **Express Middleware Order**: Sentry handlers have specific ordering requirements
  - Request handler: FIRST (captures request context)
  - Tracing handler: After request handler
  - Error handler: LAST (catches unhandled errors)
- **Correlation ID**: Existing `correlationIdMiddleware` should work alongside Sentry

### Project Structure Notes

- Server entry: `apps/server/src/main.ts`
- Middleware location: `apps/server/src/middleware/`
- Test files: Co-located as `*.spec.ts`

### Code Pattern - Sentry Init

```typescript
// apps/server/src/instrumentation.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (process.env.SENTRY_DSN_SERVER) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN_SERVER,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      release: process.env.npm_package_version,
    });
  }
}
```

### Testing Strategy

- Mock Sentry SDK in unit tests
- Test initialization logic without sending events
- Integration testing deferred to Story 3.4

### Dependencies

- **Requires**: Story 3.1 complete (DSN available)

### References

- [Source: docs/epics.md#Story-3.2-Integrate-Sentry-with-Express-Server]
- [Source: docs/architecture.md#Integration-Architecture]
- [Sentry Node SDK Docs](https://docs.sentry.io/platforms/javascript/guides/node/)

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

claude-opus-4-5-20251101

### Debug Log References

### Completion Notes List

### File List

