---
title: Server Deployment Guide
purpose: Comprehensive guide for deploying the Express API server and web frontend applications
audience: DevOps engineers, developers deploying to production
last-updated: 2025-12-10
---

# Server Deployment Guide

This guide covers deploying the Express API server (`@nx-monorepo/server`) to production environments.

## Overview

The server application is built with:
- **Framework**: Express with REST + OpenAPI
- **Build system**: Nx + esbuild (unbundled mode)
- **Database**: Prisma + Supabase PostgreSQL
- **Workspace dependencies**: `@nx-monorepo/database`, `@nx-monorepo/schemas`

**Default configuration**:
- Port: 4000 (configurable via `PORT` environment variable)
- Node.js: 22.x or higher

---

## Understanding the Build Output

### The Nested Directory Structure

When you build the server with `pnpm exec nx run server:build`, the output structure is:

```
dist/apps/server/
├── main.js                        # ← Entry point (Nx wrapper - 44 lines)
├── package.json                   # Dependencies manifest
├── pnpm-lock.yaml                 # Lock file
├── apps/server/src/               # ← Transpiled application code
│   ├── main.js                    # Actual application entry (27 lines)
│   ├── app.js
│   ├── routes/
│   ├── controllers/
│   └── openapi/
├── packages/                      # Workspace dependency outputs
│   ├── database/src/
│   └── schemas/src/
└── workspace_modules/             # Symlinked workspace packages
    └── @nx-monorepo/
```

**Why is the path nested (`apps/server/src/`) instead of flat?**

This is **intentional Nx architecture** for unbundled builds with workspace dependencies. Nx generates a two-layer system:

1. **Root `main.js`**: Module resolution wrapper that patches Node.js's `require()` to handle workspace imports (`@nx-monorepo/*`)
2. **Nested code**: Actual transpiled application code from `apps/server/src/`

The root `main.js` sets up module resolution, then loads the nested `apps/server/src/main.js` (see line 44):
```javascript
module.exports = require("./apps/server/src/main.js");
```

This architecture enables:
- ✅ Unbundled builds (faster, better debugging)
- ✅ Workspace dependencies without bundling
- ✅ Nx caching benefits
- ✅ Clear separation for multi-app monorepo scaling

**Technical details**: See `docs/memories/tech-findings-log.md` - "Nx Unbundled Builds: Two-Layer Architecture"

---

### Critical: Entry Point Selection

**✅ CORRECT**:
```bash
node dist/apps/server/main.js
```

**❌ INCORRECT**:
```bash
node dist/apps/server/apps/server/src/main.js  # Will fail - module resolution not set up
```

Always use the **root `main.js`**, not the nested one.

---

## Local Deployment

### Quick Start

```bash
# 1. Build the application
pnpm exec nx run server:build

# 2. Ensure environment file exists
# (Required: .env.development.local or .env.production.local)
ls .env.development.local || echo "Create environment file first!"

# 3. Run the server
node dist/apps/server/main.js
```

The server will start on `http://localhost:4000` (or `PORT` from environment).

**Expected output**:
```
✅ Loaded environment variables from: .env.development.local
[ ready ] http://localhost:4000
[ health ] http://localhost:4000/api/health
[ hello ] http://localhost:4000/api/hello
[ docs ] http://localhost:4000/api/docs
[ spec ] http://localhost:4000/api/docs/openapi.json
```

### Environment Configuration

Create `.env.production.local` in the **workspace root**:

```bash
# Server Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=4000

# Database (Supabase)
DATABASE_URL="postgresql://user:pass@host:5432/db?pgbouncer=true"
DIRECT_URL="postgresql://user:pass@host:5432/db"

# CORS Configuration (comma-separated for multiple origins)
CORS_ORIGIN="https://your-domain.com,https://app.your-domain.com"
```

**Important environment variables**:
- `DATABASE_URL`: Pooled connection (via Supabase PgBouncer) for queries
- `DIRECT_URL`: Direct connection for migrations (required by Prisma)
- `CORS_ORIGIN`: Allowed origins for cross-origin requests

For complete environment setup, see: `docs/project-config/supabase.md`

---

## Production Deployment

### Step-by-Step Workflow

#### 1. Build for Production

```bash
# Clean previous builds
rm -rf dist/apps/server

# Build with production configuration
pnpm exec nx run server:build --configuration=production
```

**Configuration differences**:
- Development: Source maps enabled
- Production: Source maps disabled (smaller bundle)

#### 2. Navigate to Build Output

```bash
cd dist/apps/server
```

#### 3. Install Production Dependencies

**CRITICAL**: The build output includes a `package.json` with dependencies, but `node_modules` is not included. You must install dependencies in the output directory:

```bash
pnpm install --prod --ignore-workspace
```

**What this does**:
- Installs only production dependencies (no devDependencies)
- `--ignore-workspace`: Prevents pnpm from trying to link workspace packages
- Creates `node_modules/` with runtime dependencies (Express, Prisma, etc.)

#### 4. Generate Prisma Client

**CRITICAL**: Prisma Client must be generated in the deployed environment to match the target platform:

```bash
cd workspace_modules/@nx-monorepo/database
pnpm exec prisma generate
cd ../../..
```

**Why necessary**:
- Prisma generates platform-specific query engine binaries
- Build machine might differ from deployment target (e.g., macOS → Linux)
- This ensures correct binary for the deployment environment

#### 5. Set Environment Variables

```bash
export NODE_ENV=production
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."
export PORT=4000
export CORS_ORIGIN="https://your-domain.com"
```

**OR** place `.env.production.local` in the `dist/apps/server/` directory.

#### 6. Run the Server

```bash
node main.js
```

**For production with process management** (recommended):

```bash
# Using PM2
pm2 start main.js --name "api-server" --instances 2

# Using systemd (create service file)
# See: https://www.digitalocean.com/community/tutorials/how-to-set-up-a-node-js-application-for-production-on-ubuntu-22-04
```

---

### Complete Deployment Script

```bash
#!/bin/bash
set -e  # Exit on error

echo "Building server..."
pnpm exec nx run server:build --configuration=production

echo "Navigating to output directory..."
cd dist/apps/server

echo "Installing production dependencies..."
pnpm install --prod --ignore-workspace

echo "Generating Prisma Client..."
cd workspace_modules/@nx-monorepo/database
pnpm exec prisma generate
cd ../../..

echo "Setting environment variables..."
export NODE_ENV=production
export DATABASE_URL="${DATABASE_URL}"
export DIRECT_URL="${DIRECT_URL}"
export PORT="${PORT:-4000}"

echo "Starting server..."
node main.js
```

---

## Docker Deployment

### Dockerfile

```dockerfile
# Build stage
FROM node:22-alpine AS builder

WORKDIR /build

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY nx.json tsconfig.base.json ./

# Install dependencies
RUN npm install -g pnpm@9.15.0
RUN pnpm install --frozen-lockfile

# Build server
RUN pnpm exec nx run server:build --configuration=production

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /build/dist/apps/server /app

# Install production dependencies
RUN npm install -g pnpm@9.15.0
RUN pnpm install --prod --ignore-workspace

# Generate Prisma Client for production environment
RUN cd workspace_modules/@nx-monorepo/database && pnpm exec prisma generate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Environment variables (override at runtime)
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start server
CMD ["node", "main.js"]
```

### Build and Run with Docker

```bash
# Build image
docker build -t nx-monorepo-server:latest .

# Run container
docker run -d \
  --name api-server \
  -p 4000:4000 \
  -e DATABASE_URL="postgresql://..." \
  -e DIRECT_URL="postgresql://..." \
  -e CORS_ORIGIN="https://your-domain.com" \
  nx-monorepo-server:latest

# Check logs
docker logs -f api-server

# Test health endpoint
curl http://localhost:4000/api/health
```

### Docker Compose

```yaml
version: '3.8'

services:
  server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      DIRECT_URL: ${DIRECT_URL}
      CORS_ORIGIN: ${CORS_ORIGIN}
      PORT: 4000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:4000/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

---

## Railway Deployment

Railway is the recommended platform for deploying the API server in staging and production.

### Prerequisites

1. Railway account ([railway.app](https://railway.app))
2. Railway project created and linked to your GitHub repository
3. Dockerfile exists at `apps/server/Dockerfile`

### Configuration File

Create `railway.json` in the **repository root** (not `apps/server/`):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/server/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/api/hello",
    "healthcheckTimeout": 60,
    "restartPolicyMaxRetries": 3
  }
}
```

**Configuration notes:**
- `dockerfilePath` — Must specify full path from repo root (required for monorepo)
- `healthcheckPath` — Use `/api/hello` (lightweight, no database query) instead of `/api/health`
- `healthcheckTimeout` — 60 seconds allows for cold starts

### Environment Variables (Railway Dashboard)

Set these in Railway → Project → Variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | Supabase pooler connection | `postgresql://postgres.[ref]:[pwd]@...` |
| `DIRECT_URL` | ✅ | Supabase direct connection (migrations) | `postgresql://postgres.[ref]:[pwd]@...` |
| `SUPABASE_URL` | ✅ | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key | `eyJhbGc...` |
| `PORT` | — | Auto-set by Railway | — |
| `NODE_ENV` | — | Defaults to production | `production` |

**Note:** The server does NOT need `SUPABASE_ANON_KEY` — it uses the service role key for admin operations.

### Critical: Server Host Binding

The server **must** bind to `0.0.0.0` (not `localhost`) for Railway's proxy to connect:

```typescript
// apps/server/src/main.ts
const host = process.env.HOST ?? '0.0.0.0';  // NOT 'localhost'
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
```

**Why**: In containers, `localhost` only accepts connections from inside the container. Railway's proxy connects from outside, so the server must listen on all interfaces (`0.0.0.0`).

### Health Check Endpoint Selection

| Endpoint | Use Case | Notes |
|----------|----------|-------|
| `/api/hello` | Infrastructure health check | Fast, no DB dependency |
| `/api/health` | Application health check | Queries database, may timeout on cold start |

**Recommendation**: Use `/api/hello` for Railway health checks. The `/api/health` endpoint queries the database, which can cause timeouts during cold starts.

### Deployment Workflow

1. **Link repository** in Railway Dashboard
2. **Set environment variables** (see table above)
3. **Deploy** — Railway auto-detects `railway.json` and builds from Dockerfile
4. **Generate domain** — Railway Dashboard → Service → Settings → Generate Domain
5. **Verify** — `curl https://your-service.up.railway.app/api/hello`

### Railway Domain

Your deployed server URL will look like:
```
https://[service-name]-[environment].up.railway.app
```

Example: `https://nx-monoreposerver-production.up.railway.app`

### Troubleshooting Railway

**Health check timeout (502 errors):**
- Check server binds to `0.0.0.0` (not `localhost`)
- Verify environment variables are set correctly
- Change health check to `/api/hello` (lighter than `/api/health`)
- Increase `healthcheckTimeout` in `railway.json`

**Build fails:**
- Verify `dockerfilePath` in `railway.json` points to correct location
- Check Dockerfile syntax
- Review Railway build logs

**Connection refused:**
- Server must bind to `HOST=0.0.0.0`
- Check `PORT` environment variable is being used

---

## Railway Web Frontend Deployment

In addition to the API server, we also deploy the Next.js web application to Railway as a **secondary frontend** (Vercel is primary).

### Why Dual Frontend?

| Platform | Purpose | Build Method |
|----------|---------|--------------|
| **Vercel** | Primary frontend (auto-preview, fast) | Vercel native builder |
| **Railway** | Secondary frontend (deployment portability) | Docker (`apps/web/Dockerfile`) |

This demonstrates that the same application can be deployed to different platforms without code changes.

### Configuration File

Create `apps/web/railway.json`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/web/Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 120,
    "restartPolicyMaxRetries": 3
  }
}
```

**Important:** If you have a root `railway.json`, move it to `apps/server/railway.json` to avoid config conflicts.

### Environment Variables (Railway Dashboard)

| Variable | Required | Value | Notes |
|----------|----------|-------|-------|
| `NEXT_PUBLIC_API_URL` | ✅ | `/api` | **MUST be `/api`** - not the server URL! |
| `BACKEND_URL` | ✅ | `https://nx-monoreposerver-[env].up.railway.app` | Target for Next.js rewrites |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://xxx.supabase.co` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `eyJ...` | Supabase anonymous key |
| `NEXT_PUBLIC_SENTRY_DSN` | — | `https://...` | Sentry DSN (optional) |

### Critical: Build-Time vs Runtime Variables

**Next.js bakes `NEXT_PUBLIC_*` and rewrite configuration at build time**, not runtime.

For Docker builds, `BACKEND_URL` must be passed as a build ARG:

```dockerfile
# apps/web/Dockerfile (required section)
ARG BACKEND_URL
ENV BACKEND_URL=$BACKEND_URL
```

Railway automatically passes environment variables as build ARGs for `NEXT_PUBLIC_*` variables, but `BACKEND_URL` needs explicit handling in the Dockerfile.

### Common Mistake: Direct API URL

❌ **WRONG:**
```
NEXT_PUBLIC_API_URL=https://nx-monoreposerver-staging.up.railway.app
```
This causes:
- Client-side requests hit `/health` instead of `/api/health`
- 404 errors because the server expects `/api/` prefix

✅ **CORRECT:**
```
NEXT_PUBLIC_API_URL=/api
```
This ensures:
- Client-side uses same-origin proxy
- Next.js rewrites forward to `BACKEND_URL`
- No CORS issues

### Deployment URLs

| Environment | API URL | Web URL |
|-------------|---------|---------|
| **Staging** | `nx-monoreposerver-staging.up.railway.app` | `nx-monorepoweb-staging.up.railway.app` |
| **Production** | `nx-monoreposerver-production.up.railway.app` | `nx-monorepoweb-production.up.railway.app` |

### Verification

```bash
# Test Railway web staging via API proxy
curl https://nx-monorepoweb-staging.up.railway.app/api/health | jq

# Test Railway web production
curl https://nx-monorepoweb-production.up.railway.app/api/health | jq
```

Both should return the same data as Vercel deployments.

---

## Troubleshooting

### "Cannot find module '@nx-monorepo/database'"

**Symptom**: Runtime error when starting the server:
```
Error: Cannot find module '@nx-monorepo/database'
```

**Causes**:
1. Production dependencies not installed in `dist/apps/server/`
2. `workspace_modules/` directory missing or incomplete
3. Using wrong entry point (nested `main.js` instead of root)

**Solution**:
```bash
cd dist/apps/server
pnpm install --prod --ignore-workspace
# Verify workspace_modules/ exists
ls -la workspace_modules/@nx-monorepo/
```

---

### "Environment file not found"

**Symptom**:
```
Error: Environment file not found: .env.production.local
Expected location: /path/to/dist/apps/server/.env.production.local
```

**Causes**:
- Missing `.env.{NODE_ENV}.local` file
- File in wrong location (must be in same directory as `main.js`)

**Solution**:
```bash
# Option 1: Copy from workspace root
cp .env.production.local dist/apps/server/

# Option 2: Create in deployment location
cat > dist/apps/server/.env.production.local <<EOF
NODE_ENV=production
DATABASE_URL=postgresql://...
# ... other variables
EOF

# Option 3: Use environment variables directly (skip .env file check)
# Modify main.ts to make file check optional for production
```

---

### Entry Point Confusion

**Symptom**: Module resolution errors, or server starts but can't find routes/controllers

**Cause**: Running the nested `apps/server/src/main.js` instead of root `main.js`

**Solution**: Always run from the root:
```bash
# Correct
node dist/apps/server/main.js

# Incorrect
node dist/apps/server/apps/server/src/main.js
```

---

### Prisma Client Generation Fails

**Symptom**:
```
Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.
```

**Causes**:
1. Prisma Client not generated in deployment environment
2. Platform mismatch (generated on macOS, running on Linux)
3. `schema.prisma` not found

**Solution**:
```bash
cd dist/apps/server/workspace_modules/@nx-monorepo/database

# Verify schema exists
ls -la prisma/schema.prisma

# Generate for current platform
pnpm exec prisma generate

# Verify client was generated
ls -la node_modules/.prisma/client/
```

---

### Port Already in Use

**Symptom**:
```
Error: listen EADDRINUSE: address already in use :::4000
```

**Solution**:
```bash
# Find process using port 4000
lsof -i :4000

# Kill process
kill -9 <PID>

# OR use different port
PORT=4001 node dist/apps/server/main.js
```

---

## Architecture Notes

### Why Unbundled Mode?

The server uses `bundle: false` in the esbuild configuration, which creates the nested output structure. This approach was chosen for:

1. **Monorepo scaling**: As we add more applications (mobile backend, admin API, background workers), workspace dependencies can be cached and reused by Nx
2. **Development velocity**: Unbundled builds are faster and easier to debug (stack traces point to actual source files)
3. **Clear boundaries**: Workspace packages remain separate, making it easier to evolve them independently
4. **Nx optimization**: Leverages Nx's caching system for workspace dependencies

**Trade-off**: More complex deployment structure, but better long-term maintainability for a growing monorepo.

### Alternative: Bundled Mode

The server could be configured to use `bundle: true`, which would produce a simpler output structure:
- Single `dist/apps/server/main.js` file (~500KB-1MB)
- No nested directories
- Simpler deployment

However, this approach:
- Loses Nx caching benefits for workspace dependencies
- Requires Prisma driver adapter (newer, less proven technology)
- Duplicates shared code across multiple apps as the monorepo grows
- Slower builds (bundling overhead)

For a **single-app deployment**, bundled mode is simpler. For a **growing monorepo** (our case), unbundled mode scales better.

**Decision rationale**: See `docs/memories/tech-findings-log.md` and Issue #21 research discussion.

---

## Related Documentation

- **Environment Setup**: `docs/project-config/supabase.md` - Complete guide to environment variables
- **Database Setup**: `packages/database/README.md` - Prisma schema and migrations
- **API Documentation**: Server at `/api/docs` when running - OpenAPI/Swagger UI
- **Architecture Decisions**: `docs/architecture-decisions.md` - Why Express + REST + OpenAPI
- **Memory System**: `docs/memories/tech-findings-log.md` - Technical findings and patterns

---

## Security Considerations

### Environment Variables

- ✅ **NEVER** commit `.env.*.local` files to version control
- ✅ Use secret management systems in production (AWS Secrets Manager, HashiCorp Vault, etc.)
- ✅ Rotate database credentials regularly
- ✅ Use least-privilege database users

### CORS Configuration

- ✅ Set `CORS_ORIGIN` to specific domains in production (not `*`)
- ✅ Support multiple origins via comma-separated list: `CORS_ORIGIN="https://app.com,https://admin.com"`
- ✅ Review CORS configuration in `apps/server/src/app.ts`

### Database Connections

- ✅ Use pooled connections (`DATABASE_URL` via PgBouncer) for application queries
- ✅ Use direct connections (`DIRECT_URL`) only for migrations
- ✅ Configure connection pool limits appropriate for your Supabase plan

### Docker Security

- ✅ Run container as non-root user (see Dockerfile example)
- ✅ Scan images for vulnerabilities: `docker scan nx-monorepo-server:latest`
- ✅ Keep base image updated: `node:22-alpine` gets security patches
- ✅ Use multi-stage builds to minimize attack surface

---

## Performance Optimization

### Cold Start Time

Current architecture (unbundled):
- ~500ms cold start
- ~100+ file I/O operations

To optimize:
- Use containerization (image warmup)
- Implement connection pooling (already enabled via Supabase)
- Consider bundled mode for serverless deployments (if needed)

### Memory Usage

Typical server memory footprint:
- Base: ~50MB (Node.js + Express)
- Prisma Client: ~20MB
- Application code: ~10MB
- **Total**: ~80-100MB under load

Recommended resources:
- Development: 256MB RAM minimum
- Production: 512MB-1GB RAM (with headroom for traffic spikes)

### Database Connections

Prisma connection pool configured in `packages/database/src/client.ts`:
- Default: 10 connections
- Adjust based on Supabase plan limits
- Monitor connection usage via Supabase dashboard

---

## Support

For issues or questions:
- **GitHub Issues**: Repository issue tracker
- **Internal Docs**: `docs/memories/troubleshooting.md`
- **Nx Documentation**: https://nx.dev
- **Prisma Documentation**: https://www.prisma.io/docs
