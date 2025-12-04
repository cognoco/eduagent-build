# Sentry Source Maps Configuration

## Overview

Source maps enable Sentry to display readable stack traces for production errors. This document explains the source map configuration for the Express server application.

## Current Configuration

### Build Configuration

Source maps are enabled for all build configurations:

- **Development**: `sourcemap: true` (default esbuildOptions)
- **Production**: `sourcemap: true` (explicitly configured)

This is configured in `apps/server/package.json` under the `build` target.

### Generated Files

When building the application, esbuild generates:

- `dist/apps/server/**/*.js` - Compiled JavaScript files
- `dist/apps/server/**/*.js.map` - Source map files

## Source Map Upload (CI/CD)

To enable readable stack traces in Sentry, source maps must be uploaded to Sentry during the build/deploy process.

### Prerequisites

1. **Sentry Auth Token**: Create at sentry.io → Settings → Auth Tokens
   - Required scopes: `project:releases`, `org:read`
   - Store in CI/CD secrets as `SENTRY_AUTH_TOKEN`

2. **Environment Variables** (already in `.env.example`):
   - `SENTRY_ORG` - Your Sentry organization slug
   - `SENTRY_PROJECT` - Your Sentry project slug
   - `SENTRY_AUTH_TOKEN` - Auth token for uploads

### Upload Methods

#### Option 1: Using Sentry CLI (Recommended)

Add to your CI/CD pipeline after the build step:

```bash
# Build the application
pnpm exec nx run server:build:production

# Upload source maps to Sentry
pnpm --filter @nx-monorepo/server exec sentry-cli sourcemaps upload \
  --org="$SENTRY_ORG" \
  --project="$SENTRY_PROJECT" \
  --release="$RELEASE_VERSION" \
  --dist="$DIST_TAG" \
  ../../dist/apps/server
```

#### Option 2: Using npm script

Add to `apps/server/package.json` scripts:

```json
{
  "scripts": {
    "sentry:sourcemaps": "sentry-cli sourcemaps upload --org=$SENTRY_ORG --project=$SENTRY_PROJECT --release=$npm_package_version ../../dist/apps/server"
  }
}
```

Then run in CI/CD:

```bash
pnpm exec nx run server:build:production
pnpm --filter @nx-monorepo/server run sentry:sourcemaps
```

### Release Tracking

The application automatically tags errors with the release version using:

```typescript
// In instrumentation.ts
release: process.env.npm_package_version || 'unknown'
```

Ensure your source map upload uses the same release version for matching.

## Local Development

Source maps are generated during development builds but are NOT uploaded to Sentry. This is intentional:

- Development errors are captured but source maps are already available locally
- No need to pollute Sentry with development releases
- Faster development cycle without upload overhead

## Testing Source Maps

To verify source maps work correctly:

1. **Trigger a test error**:
   ```bash
   curl http://localhost:4000/api/debug/sentry-test
   ```

2. **Check Sentry dashboard**:
   - Navigate to Issues → Select the test error
   - Verify stack traces show original TypeScript file paths
   - Verify line numbers match source code

3. **Production verification**:
   - Deploy to staging/production
   - Trigger an error
   - Verify stack traces are readable in Sentry

## Troubleshooting

### Stack traces show minified code

**Problem**: Sentry displays obfuscated/minified stack traces instead of original source code.

**Solutions**:
1. Verify source maps were uploaded: Check Sentry → Settings → Source Maps
2. Verify release version matches: Ensure `release` in Sentry.init() matches upload `--release` flag
3. Check file paths match: Source map paths must match error stack trace paths

### Source map upload fails

**Problem**: `sentry-cli` command fails during upload.

**Solutions**:
1. Verify `SENTRY_AUTH_TOKEN` is set and has correct permissions
2. Verify `SENTRY_ORG` and `SENTRY_PROJECT` match your Sentry configuration
3. Check network connectivity to sentry.io
4. Run with `--log-level debug` for detailed error information

### Wrong source code displayed

**Problem**: Sentry shows source code but from the wrong file or version.

**Solutions**:
1. Clear old releases: Remove outdated releases from Sentry
2. Verify release version uniqueness: Each deploy should have a unique release identifier
3. Check file paths: Ensure source map file paths match your build output structure

## Additional Resources

- [Sentry Source Maps Documentation](https://docs.sentry.io/platforms/node/sourcemaps/)
- [Sentry CLI Documentation](https://docs.sentry.io/cli/)
- [esbuild Source Map Options](https://esbuild.github.io/api/#sourcemap)

## Implementation Status

**Current Status:** Source maps are generated but NOT uploaded in CI.

**Rationale:** Deferred to Stage 9 (CI/CD Staging Deployment) because:
- No staging/production environment exists yet
- Uploading in CI provides no value until code is deployed
- Source maps should be uploaded during deployment, not every PR

**Planned Implementation (Stage 9):**
- Add source map upload to staging/production deployment pipeline
- Only upload on successful deployments
- See `docs/roadmap.md` Stage 9 for timeline

## Future Improvements

1. **Automated Upload**: Integrate source map upload into the deployment process
2. **Release Creation**: Automatically create Sentry releases with deploy metadata
3. **Source Map Validation**: Add pre-deploy validation to ensure source maps are correct
4. **Artifact Cleanup**: Automatically remove old releases and source maps
