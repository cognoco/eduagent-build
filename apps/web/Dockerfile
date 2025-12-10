# =============================================================================
# Web App Dockerfile - Multi-stage build for Next.js production deployment
# =============================================================================
# Build context: Project root (for monorepo workspace access)
# Usage: docker build -f apps/web/Dockerfile -t nx-monorepo-web .
# =============================================================================
# Note: This Dockerfile is created for forward-compatibility with the secondary
# deployment target (Railway + Railway). For the primary target, the web app
# is deployed to Vercel which handles builds internally.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies - Install all dependencies
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy workspace configuration files first (for better layer caching)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy Nx and TypeScript configuration
COPY nx.json tsconfig.json tsconfig.base.json ./

# Copy the web app and its workspace dependencies
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

# Copy server source (needed to generate OpenAPI spec for api-client types)
COPY apps/server/ ./apps/server/

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Generate OpenAPI spec from server source (required for api-client type generation)
# This builds the server and runs spec-write to create dist/apps/server/openapi.json
ENV NX_DAEMON=false
ENV NX_SKIP_NX_CACHE=true
RUN pnpm exec nx sync
# Generate Prisma client (schema is at non-default location)
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN pnpm exec nx run server:spec-write

# -----------------------------------------------------------------------------
# Stage 2: Builder - Build the Next.js application
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy everything from deps stage
COPY --from=deps /app ./

# Disable Nx daemon in Docker (file watchers/IPC can be problematic in containers)
ENV NX_DAEMON=false

# Disable all Nx caching in Docker builds to avoid "File exists" race condition
# Root cause: Nx's cache.js tries to write task outputs after build completes,
# but Docker's overlay filesystem causes EEXIST errors during parallel cache writes.
# This is fine - Docker images are ephemeral, we don't need build caching inside them.
ENV NX_SKIP_NX_CACHE=true

# Sync workspace (required for non-interactive builds)
RUN pnpm exec nx sync

# Set environment for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build arguments for environment variables needed at build time
# These are baked into the Next.js build (rewrites, client-side bundle)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG BACKEND_URL

# Sentry build arguments (required for client-side error tracking and source maps)
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT

# Set build-time environment variables
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV BACKEND_URL=$BACKEND_URL

# Sentry environment variables for build
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

# Build the web application using Nx
# This produces a standalone output in apps/web/.next/standalone
# Build the Next.js application
RUN pnpm exec nx run web:build:production

# -----------------------------------------------------------------------------
# Stage 3: Production - Minimal runtime image
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets to the correct location
# Standalone preserves monorepo structure: apps/web/...
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy the standalone build output
# This includes the entire standalone folder which preserves monorepo paths
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy static files to the correct location within standalone structure
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Switch to non-root user
USER nextjs

# Expose the web server port (Next.js default: 3000)
EXPOSE 3000

# Set the port environment variable
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check - verify the web app is responding
# Note: Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues in Alpine
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Start the Next.js server
# The standalone output preserves monorepo structure, so server.js is in apps/web/
CMD ["node", "apps/web/server.js"]
