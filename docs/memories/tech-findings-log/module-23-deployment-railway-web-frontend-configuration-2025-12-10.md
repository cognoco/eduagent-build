## [Deployment Configuration] - Railway Web Frontend Docker Build Configuration - 2025-12-10

**Decision:** Configure Railway web service (`@nx-monorepo/web`) with specific Docker build arguments to handle Next.js build-time vs runtime variable requirements.

**Context:** Deploying the Next.js web app to Railway alongside Vercel revealed critical differences in how environment variables are handled:

1. **Vercel** handles `NEXT_PUBLIC_*` variables automatically during build
2. **Railway Docker builds** require explicit `ARG` declarations for build-time variables
3. **Next.js rewrites** (configured in `next.config.js`) are baked at build time, not runtime
4. **`BACKEND_URL`** must be passed as a Docker build ARG, not just runtime env var

---

## Key Finding: Build-Time vs Runtime Variables

| Variable Type | Vercel | Railway Docker | When Evaluated |
|---------------|--------|----------------|----------------|
| `NEXT_PUBLIC_*` | Auto-injected at build | Must be Docker ARG | Build time |
| `BACKEND_URL` | Runtime env works | Must be Docker ARG | Build time (for rewrites) |
| `NODE_ENV` | Auto-set | Runtime env works | Runtime |

**Critical insight:** Even though Railway sets `BACKEND_URL` as an environment variable, Next.js can't use it for rewrites because `next.config.js` runs at build time. The rewrite config:

```javascript
// next.config.js
async rewrites() {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
  return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
}
```

...evaluates `process.env.BACKEND_URL` during `next build`, not when the server starts.

---

## Required Dockerfile Configuration

```dockerfile
# apps/web/Dockerfile (relevant section)

# Build arguments for environment variables needed at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG BACKEND_URL

# Set build-time environment variables
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV BACKEND_URL=$BACKEND_URL

# ... rest of build
```

---

## Required Railway Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_API_URL` | `/api` | **MUST be `/api`** - client uses same-origin proxy |
| `BACKEND_URL` | `https://nx-monoreposerver-[env].up.railway.app` | Target for Next.js rewrites |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Client-side Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Client-side auth |

**CRITICAL:** `NEXT_PUBLIC_API_URL` must be `/api`, NOT the direct server URL.

If set to direct URL (e.g., `https://nx-monoreposerver-staging.up.railway.app`):
- Client-side code bypasses Next.js proxy
- Hits `/health` instead of `/api/health`
- Returns 404 errors

---

## Railway Config-as-Code Pattern

For monorepos with multiple services, use **per-service** `railway.json` files:

```
apps/
  server/
    railway.json    # API server config
  web/
    railway.json    # Web frontend config
```

**Example `apps/web/railway.json`:**
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

**Important:** If a root `railway.json` exists, it may override per-service configs. Move root config to `apps/server/railway.json` when adding web service.

---

## Troubleshooting Symptoms

### Symptom: "Error Loading Health Checks" / "Failed to fetch"

**Cause:** Client-side code using wrong API URL.

**Check:** Network tab shows requests to server URL directly (e.g., `/health` instead of `/api/health`)

**Fix:** Set `NEXT_PUBLIC_API_URL=/api` and redeploy (requires rebuild)

### Symptom: "Failed to proxy http://localhost:4000/api/health"

**Cause:** `BACKEND_URL` not passed as build ARG.

**Check:** Deploy logs show `localhost:4000` in rewrite target

**Fix:** Add `ARG BACKEND_URL` to Dockerfile and redeploy

### Symptom: Railway uses wrong Dockerfile/health check

**Cause:** Root `railway.json` overriding per-service config.

**Check:** Railway dashboard shows `apps/server/Dockerfile` for web service

**Fix:** 
1. Move root `railway.json` to `apps/server/railway.json`
2. Ensure web service uses `apps/web/railway.json` in Railway dashboard

---

## Warning Signs (for AI agents)

❌ **Do not** set `NEXT_PUBLIC_API_URL` to direct server URL
- **Why:** Causes client-side CORS errors and wrong API paths
- **Instead:** Always use `/api` to leverage Next.js proxy

❌ **Do not** expect Railway runtime env vars to work for Next.js rewrites
- **Why:** `next.config.js` rewrites are evaluated at build time
- **Instead:** Pass `BACKEND_URL` as Docker build ARG

❌ **Do not** use a single root `railway.json` for multiple services
- **Why:** Overrides per-service config, causes wrong Dockerfile usage
- **Instead:** Use per-service `apps/*/railway.json` files

✅ **Do** add `BACKEND_URL` as both `ARG` and `ENV` in Dockerfile
- Required for Next.js to access during build

✅ **Do** rebuild after changing `NEXT_PUBLIC_*` variables
- These are baked into JavaScript bundles at build time

---

## Verification Commands

```bash
# Test Railway web staging
curl https://nx-monorepoweb-staging.up.railway.app/api/health | jq

# Test Railway web production
curl https://nx-monorepoweb-production.up.railway.app/api/health | jq

# Compare with Vercel
curl https://nx-monorepo-web.vercel.app/api/health | jq
```

All should return the same health check data from the shared database.

---

## References

- Story 5.9: Configure Railway Web Frontend
- Module 21: Vercel + Railway Nx Monorepo Configuration
- Related: Module 13 (API URL configuration)
- Next.js Rewrites: https://nextjs.org/docs/app/api-reference/next-config-js/rewrites
- Railway Config: https://docs.railway.app/reference/config-as-code

**Date Resolved:** 2025-12-10
**Resolved By:** AI Agent (Claude Opus 4.5) + User (Jørn Jørgensen)

---

### Manifest & Validation Checklist
1. ✅ Add chunk entry in `docs/memories/tech-findings-log/manifest.yaml`
2. ✅ Governing artefact: `docs/sprint-artifacts/5-9-configure-railway-web-frontend.md`
3. ✅ Set `validation_status: needs_review`, `last_updated_by: claude-opus-4-5`, `last_updated_at: 2025-12-10`
4. ⏳ Run Cogno sync pipeline when available

