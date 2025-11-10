## [Web App Configuration] - API URL Configuration: Rewrites + Environment Variable Override - 2025-11-02

**Decision:** Use Next.js rewrites for development + NEXT_PUBLIC_API_URL override for production (Option 3)

**Context:** The web app had hardcoded API URL `http://localhost:4000/api`, which broke portability (different port configurations) and caused CORS issues. Need flexible configuration that works in development and production with minimal setup.

**Alternatives Considered:**

1. **Environment variable only**
   - Implementation: `NEXT_PUBLIC_API_URL` in .env.local, client uses `process.env.NEXT_PUBLIC_API_URL`
   - Rejected: Requires manual .env.local creation for all developers
   - Problem: CORS issues in development (browser → localhost:3000 → localhost:4000)
   - Problem: No automatic fallback if env var missing

2. **Next.js rewrites only**
   - Implementation: `rewrites()` in next.config.js proxying /api → http://localhost:4000/api
   - Rejected: Inflexible for production deployments
   - Problem: Can't override API URL for different deployment patterns (Docker, cloud hosting, etc.)
   - Problem: Hardcodes localhost assumptions

3. **Both: Rewrites for dev + env var override for production** ✅ **CHOSEN**
   - Implementation: next.config.js rewrites + `NEXT_PUBLIC_API_URL` optional override
   - Client code: `const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api'`
   - Development: Rewrites work immediately (no .env.local needed)
   - Production: Override via environment variable if needed

**Chosen Approach:** Rewrites + environment variable override

**Technical Rationale:**

**Why this combination works:**

**Development (default behavior):**
1. Developer runs `pnpm run dev` (web on :3000, server on :4000)
2. No .env.local configuration needed
3. Next.js rewrites `/api/*` → `http://localhost:4000/api/*` server-side
4. Client makes requests to `/api/health` (same-origin, no CORS)
5. Next.js proxy forwards to server
6. Result: Zero configuration, works immediately

**Production (environment variable override):**
1. Set `NEXT_PUBLIC_API_URL=https://api.example.com` in deployment environment
2. Client code uses env var: `process.env.NEXT_PUBLIC_API_URL || '/api'`
3. Requests go directly to production API URL (no proxy)
4. Supports any deployment pattern:
   - Docker Compose: Container-to-container networking
   - Cloud platforms: Separate API domain
   - Kubernetes: Service mesh routing
   - Edge deployments: CDN + API separation

**Implementation Details:**

**Location:** `apps/web/next.config.js`, `apps/web/.env.local.example`, client API code

**next.config.js configuration:**
```javascript
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://localhost:4000/api/:path*',
    },
  ];
}
```

**.env.local.example (template for developers):**
```env
# Optional: Override API URL for production or custom server port
# NEXT_PUBLIC_API_URL=http://localhost:4000/api
# NEXT_PUBLIC_API_URL=https://api.example.com
```

**Client code pattern:**
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Usage in API client
fetch(`${API_BASE_URL}/health`)
```

**CORS configuration (server):**
```typescript
// apps/server/src/main.ts
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
```

**Why rewrites solve CORS in development:**
- Browser request: `http://localhost:3000/api/health` (same-origin)
- Next.js server: Proxies to `http://localhost:4000/api/health` (server-to-server, no CORS)
- Response: Returns to browser with same-origin headers
- Result: No CORS preflight, no CORS headers needed for development

**Verification Commands:**
```bash
# Development (default, no env var)
pnpm run dev
curl http://localhost:3000/api/health  # Should proxy to server

# Production (with env var override)
NEXT_PUBLIC_API_URL=http://localhost:4000/api pnpm run dev
curl http://localhost:3000/api/health  # Should call server directly
```

**Success Criteria:**
✅ Development works without .env.local configuration
✅ No CORS errors in browser console
✅ Production deployments can override API URL via environment variable
✅ .env.local.example documents the override option
✅ Client code uses consistent pattern: `process.env.NEXT_PUBLIC_API_URL || '/api'`

**Warning Signs (for AI agents):**

❌ **Do not** hardcode API URLs in client code
- **Why**: Breaks portability and deployment flexibility
- **Instead**: Use `process.env.NEXT_PUBLIC_API_URL || '/api'` pattern

❌ **Do not** remove rewrites to "simplify" configuration
- **Why**: Forces all developers to create .env.local manually
- **Result**: Poor developer experience, CORS issues

❌ **Do not** rely only on environment variables
- **Why**: Requires manual setup for every developer
- **Result**: "Works on my machine" syndrome

✅ **Do preserve** rewrites in next.config.js for development
- Zero-config development experience
- Automatic CORS handling via proxy

✅ **Do support** NEXT_PUBLIC_API_URL override for production
- Deployment flexibility
- Different API URL patterns (cloud, containers, edge)

**Applies To:**
- Next.js applications in Nx monorepo
- Development with separate frontend/backend processes
- Production deployments with flexible API URL requirements
- Any scenario requiring CORS-free development + production override

**Symptom Patterns:**
- CORS errors in development → Missing rewrites configuration
- Hardcoded localhost URLs → Missing environment variable override pattern
- "API not found" after deployment → No NEXT_PUBLIC_API_URL set in production

**References:**
- Next.js Rewrites: https://nextjs.org/docs/app/api-reference/next-config-js/rewrites
- Next.js Environment Variables: https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
- Implementation: apps/web/next.config.js, apps/web/.env.local.example (2025-11-02)
- Related issue: Hardcoded API URL causing portability problems

**Date Resolved:** 2025-11-02
**Resolved By:** AI Agent (API URL configuration strategy design)

---
