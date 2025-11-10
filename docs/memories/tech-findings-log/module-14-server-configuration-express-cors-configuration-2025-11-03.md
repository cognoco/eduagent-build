## [Server Configuration] - Express CORS Configuration - 2025-11-03

**Decision:** Use `cors` package with environment-variable-based origin configuration for Express API server

**Context:** The web application (localhost:3000) needs to make cross-origin requests to the API server (localhost:4000) per the documented architecture in `docs/architecture-decisions.md` (Decision 3). Browser security (CORS) blocks these requests by default unless the server explicitly allows them via Access-Control-Allow-Origin headers.

**Alternatives Considered:**

1. **No CORS configuration (rely solely on Next.js rewrites)**
   - Works: Development with rewrites proxies requests server-side (same-origin)
   - Problem: Breaks in production deployments, direct API access, or when NEXT_PUBLIC_API_URL is set
   - Rejected: Not flexible enough for all deployment scenarios

2. **Wildcard origin (`origin: '*'`)**
   - Works: Allows all origins
   - Problem: Security risk - any website could call our API
   - Problem: Incompatible with `credentials: true` (needed for auth)
   - Rejected: Violates security best practices

3. **Hardcoded origin array**
   - Works: Specific origins only
   - Problem: Requires code changes for different deployment environments
   - Problem: Less flexible than environment variable
   - Rejected: Environment variable pattern is more maintainable

**Chosen Approach:** Environment variable with sensible default (`process.env.CORS_ORIGIN || 'http://localhost:3000'`)

**Technical Rationale:**

**Why CORS is required by our architecture:**
- Architecture explicitly mandates: Browser → Express API → Prisma → PostgreSQL
- Never allow direct client → database access (security boundary)
- Web app (port 3000) and API server (port 4000) are different origins
- Browser blocks cross-origin requests without proper CORS headers

**Why the cors package:**
- Industry standard Express middleware (Trust Score: 9/10)
- Simple, well-documented API
- Maintained by Express.js team
- Handles preflight requests (OPTIONS) automatically

**Configuration choices:**

1. **Origin configuration:**
   ```typescript
   origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
   ```
   - Development: Defaults to web app origin (localhost:3000)
   - Production: Override via CORS_ORIGIN environment variable
   - No wildcard: Explicit origins only for security

2. **Credentials enabled:**
   ```typescript
   credentials: true
   ```
   - Required for future cookie-based authentication
   - Allows cookies, authorization headers, TLS client certificates
   - Incompatible with wildcard origin (security constraint)

**Implementation Details:**

- **Location**: `apps/server/src/app.ts`
- **Dependencies**: `cors` (runtime), `@types/cors` (dev)
- **Installation**:
  ```bash
  pnpm add cors --filter @nx-monorepo/server
  pnpm add -D @types/cors --filter @nx-monorepo/server
  ```

- **Configuration**:
  ```typescript
  import cors from 'cors';

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));
  ```

- **Environment variable**: Documented in `.env.example`
  ```env
  # CORS origin for API server (allows cross-origin requests from this domain)
  # Development: Defaults to http://localhost:3000
  # Production: Set to your deployed web app URL
  CORS_ORIGIN="http://localhost:3000"
  ```

**Relationship to Next.js Rewrites:**

The project uses both CORS and Next.js rewrites (documented in tech-findings entry "API URL Configuration"):
- **Development default**: Next.js rewrites proxy `/api/*` to server (no CORS needed, same-origin)
- **Production/override**: Direct API calls use CORS (when NEXT_PUBLIC_API_URL is set)
- **CORS provides flexibility** for various deployment patterns without changing code

**Verification:**

✅ Build passes: `pnpm exec nx run server:build`
✅ Lint passes: `pnpm exec nx run server:lint`
✅ Tests run: Database errors are pre-existing, not CORS-related
✅ Dependencies added to `apps/server/package.json`
✅ Documentation updated in `.env.example`

**Warning Signs (for AI agents):**

❌ **Do not remove** CORS middleware from Express app
- **Why**: Required by architecture for browser-to-API communication
- **What breaks**: Direct API calls fail with CORS errors, production deployments break

❌ **Do not use** wildcard origin (`'*'`)
- **Why**: Security risk, incompatible with credentials
- **What breaks**: Any website can call your API, credentials won't work

❌ **Do not assume** Next.js rewrites eliminate need for CORS
- **Why**: Rewrites only work in development, production needs CORS
- **What breaks**: Production deployments fail with CORS errors

✅ **Do preserve** environment variable pattern
- Allows deployment flexibility without code changes
- Documented in `.env.example` for all developers

✅ **Do keep** `credentials: true`
- Required for future authentication implementation
- Standard practice for APIs that will use cookies/auth

**Symptom Patterns:**

- "No 'Access-Control-Allow-Origin' header" → CORS not configured or wrong origin
- "Credentials flag is 'true', but the 'Access-Control-Allow-Origin' header is '*'" → Can't use wildcard with credentials
- Production API calls fail but development works → Check CORS_ORIGIN environment variable

**Applies To:**

- Express-based API servers in Nx monorepo
- Any browser-to-server communication across different ports/domains
- Production deployments requiring direct API access

**References:**

- Express CORS package: https://github.com/expressjs/cors (Trust Score: 9/10)
- Context7 MCP documentation: /expressjs/cors
- Architecture decision: `docs/architecture-decisions.md` (Decision 3)
- Related: tech-findings "[Web App Configuration] - API URL Configuration" (2025-11-02)

**Date Resolved:** 2025-11-03
**Resolved By:** AI Agent (Sequential Thinking + Vibe Check + Context7 research)

---
