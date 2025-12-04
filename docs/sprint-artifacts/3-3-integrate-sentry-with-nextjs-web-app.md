# Story 3.3: Integrate Sentry with Next.js Web App

Status: drafted

## Story

As a frontend developer,
I want Sentry error tracking in the Next.js web app,
so that client-side errors are captured and reported.

## Acceptance Criteria

1. **AC1**: Given Sentry project exists with web DSN, when I integrate `@sentry/nextjs` into `apps/web`, then client-side errors are captured and appear in Sentry dashboard
2. **AC2**: Server-side rendering (SSR) errors are captured
3. **AC3**: Performance metrics (Core Web Vitals) are tracked
4. **AC4**: Source maps are uploaded for stack trace resolution
5. **AC5**: Environment (staging/production) is correctly tagged
6. **AC6**: Unit tests verify Sentry initialization configuration

## Tasks / Subtasks

- [ ] Task 1: Install Sentry Next.js SDK (AC: #1)
  - [ ] 1.1: Run `pnpm add @sentry/nextjs --filter @nx-monorepo/web`
  - [ ] 1.2: Verify package.json updated in `apps/web`
  - [ ] 1.3: Check for peer dependency compatibility with Next.js 15

- [ ] Task 2: Run Sentry Wizard or Manual Config (AC: #1, #2)
  - [ ] 2.1: Option A: Run `npx @sentry/wizard@latest -i nextjs` in apps/web
  - [ ] 2.2: Option B: Manually create configuration files (preferred for control)
  - [ ] 2.3: Create `apps/web/sentry.client.config.ts`
  - [ ] 2.4: Create `apps/web/sentry.server.config.ts`
  - [ ] 2.5: Create `apps/web/sentry.edge.config.ts` (if using Edge runtime)

- [ ] Task 3: Configure Next.js Integration (AC: #1, #2, #4)
  - [ ] 3.1: Update `apps/web/next.config.js` with `withSentryConfig`
  - [ ] 3.2: Configure `sentry` options in next.config.js
  - [ ] 3.3: Enable source map uploads in production builds
  - [ ] 3.4: Configure `hideSourceMaps: true` for production

- [ ] Task 4: Configure Client-Side Tracking (AC: #1, #3)
  - [ ] 4.1: Configure DSN from `process.env.NEXT_PUBLIC_SENTRY_DSN`
  - [ ] 4.2: Enable `BrowserTracing` integration
  - [ ] 4.3: Configure `tracesSampleRate` for performance
  - [ ] 4.4: Enable replay integration for session recording (optional)

- [ ] Task 5: Configure Server-Side Tracking (AC: #2)
  - [ ] 5.1: Configure DSN in server config
  - [ ] 5.2: Set appropriate sample rates for server
  - [ ] 5.3: Configure `profilesSampleRate` if profiling needed

- [ ] Task 6: Configure Environment and Release (AC: #5)
  - [ ] 6.1: Set `environment` from `NEXT_PUBLIC_VERCEL_ENV` or `NODE_ENV`
  - [ ] 6.2: Set `release` using git SHA or build ID
  - [ ] 6.3: Configure `dist` for release artifact identification

- [ ] Task 7: Update Environment Templates (AC: #4, #5)
  - [ ] 7.1: Add `NEXT_PUBLIC_SENTRY_DSN` to `.env.example`
  - [ ] 7.2: Add `SENTRY_AUTH_TOKEN` for source map uploads
  - [ ] 7.3: Document environment variables in setup docs

- [ ] Task 8: Write Tests (AC: #6)
  - [ ] 8.1: Create test for Sentry client config initialization
  - [ ] 8.2: Mock Sentry to prevent real event sending in tests
  - [ ] 8.3: Test error boundary integration (if using)
  - [ ] 8.4: Run `pnpm exec nx run web:test` - all tests pass

- [ ] Task 9: Manual Verification (AC: #1, #2, #3)
  - [ ] 9.1: Create test component that throws error
  - [ ] 9.2: Build and run web app
  - [ ] 9.3: Trigger client-side error
  - [ ] 9.4: Verify error appears in Sentry dashboard
  - [ ] 9.5: Check Core Web Vitals appear in Performance tab

## Dev Notes

### Architecture Context

- **Next.js 15 App Router**: Uses new instrumentation pattern
- **Environment Variables**: Client-side needs `NEXT_PUBLIC_` prefix
- **Source Maps**: Uploaded during build, hidden from browser

### Project Structure Notes

- Web app root: `apps/web/`
- Config location: `apps/web/next.config.js`
- Sentry configs: `apps/web/sentry.*.config.ts`
- Test files: Co-located as `*.spec.tsx`

### Code Pattern - Sentry Client Config

```typescript
// apps/web/sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  integrations: [
    Sentry.browserTracingIntegration(),
    // Optional: Sentry.replayIntegration(),
  ],

  // Disable in development
  enabled: process.env.NODE_ENV === 'production',
});
```

### Code Pattern - Next.js Config

```javascript
// apps/web/next.config.js
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // existing config
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
});
```

### Next.js 15 Considerations

- Check Sentry SDK compatibility with Next.js 15
- App Router uses different error boundary patterns
- Server Components may require specific configuration

### Testing Strategy

- Mock Sentry in unit tests
- Test config initialization logic
- E2E verification in Story 3.4

### Dependencies

- **Requires**: Story 3.1 complete (DSN available)
- **Parallel**: Can be developed alongside Story 3.2

### References

- [Source: docs/epics.md#Story-3.3-Integrate-Sentry-with-Next.js-Web-App]
- [Source: docs/architecture.md#Integration-Architecture]
- [Sentry Next.js SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

claude-opus-4-5-20251101

### Debug Log References

### Completion Notes List

### File List

