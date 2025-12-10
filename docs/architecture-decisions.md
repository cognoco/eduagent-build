---
Created: 2025-10-21
Modified: 2025-10-28T20:29
Version: 1
---

# Architecture Decisions: API Framework Selection

## Executive Summary

**Recommendation: Adopt REST+OpenAPI for API layer**

After comprehensive evaluation of 5 API framework candidates (oRPC, tRPC, ts-rest, Hono RPC, REST+OpenAPI), **REST+OpenAPI emerges as the best fit** for this Nx monorepo project with Express backend, Next.js web app, and future Expo mobile app.

**Key Decision Factors:**
- ✅ **Maximum flexibility**: Zero vendor lock-in, framework-agnostic architecture
- ✅ **AI-agent friendly**: OpenAPI is MCP standard with vast LLM training data
- ✅ **React Native support**: Battle-tested in production with universal HTTP client support
- ✅ **Future-proof**: Industry standard with mature tooling ecosystem
- ✅ **Express compatible**: Works with existing backend (no framework replacement needed)

**Alternative: oRPC** is recommended if rapid prototyping velocity outweighs long-term flexibility and ecosystem maturity.

---

## Comparison Matrix

### Weighted Scoring

Criteria weights based on project requirements:
- **AI-Agent Friendliness** (⭐⭐⭐): 30% - Critical for 80% AI coding workflow
- **Mobile Support** (⭐⭐⭐): 30% - React Native/Expo is Phase 2 requirement
- **Migration Path** (⭐⭐⭐): 20% - Risk mitigation, flexibility for unknowns
- **Learning Curve** (⭐⭐): 8% - Team ramp-up time (architects/PMs, not pro devs)
- **Simplicity** (⭐⭐): 7% - Minimize troubleshooting complexity
- **Ecosystem** (⭐⭐): 5% - Community support, examples, plugins

### Candidate Scores (out of 10)

| Framework | AI-Agent | Mobile | Migration¹ | Learning² | Simplicity | Ecosystem | **Weighted Total** |
|-----------|----------|--------|------------|-----------|------------|-----------|-------------------|
| **REST+OpenAPI** | 10 | 10 | 8 | 7 | 6 | 10 | **9.2** ⭐ |
| **oRPC** | 6 | 10 | 4 | 6 | 8 | 4 | **6.5** |
| **tRPC** | 9 | 6 | 4 | 7 | 7 | 9 | **6.8** |
| **ts-rest** | 6 | 2 | 4 | 8 | 8 | 5 | **4.65** |
| ~~Hono RPC~~ | 6 | 4 | 2 | 8 | 7 | 7 | ❌ **ELIMINATED** |

¹ *Migration score = inverted difficulty (lower lock-in = higher score)*
² *Learning curve = inverted hours (faster learning = higher score)*

**Note:** Hono RPC eliminated due to Express incompatibility (requires replacing entire backend framework).

---

## Detailed Framework Analysis

### 1. oRPC - **VIABLE ALTERNATIVE**

**Summary:** Modern RPC framework (Sept 2024) with end-to-end type safety, built-in OpenAPI support, and first-class React Native adapter.

#### Strengths
- ✅ **React Native ready**: Documented adapter (`@orpc/client/fetch`) with production examples
- ✅ **OpenAPI native**: Auto-generates Swagger docs, enables REST interop
- ✅ **Express integration**: `@orpc/server/node` adapter with minimal setup
- ✅ **Monorepo-first**: TypeScript Project References documented
- ✅ **Type-safe errors**: Inferred error types on client
- ✅ **AI-friendly docs**: 746 code snippets, LLM-optimized markdown
- ✅ **Quick setup**: Minimal configuration needed for Express integration

#### Weaknesses
- ⚠️ **Young project**: Only 13 months old (created Sept 2024)
- ⚠️ **Small community**: 3.6k GitHub stars vs tRPC's 38k
- ⚠️ **Limited AI training data**: Too new for GPT-4 cutoff (April 2023)
- ⚠️ **Fewer Stack Overflow resources**: ~50 questions vs tRPC's 1,200+

#### Scoring Breakdown
- **AI-Agent Friendliness**: 8/10 - Excellent docs, but too new for broad AI training data
- **Mobile Support**: 10/10 - First-class React Native adapter, documented examples
- **Migration Path**: 6/10 - OpenAPI provides escape hatch, can run alongside REST
- **Learning Curve**: 8/10 - 4-8 hours to proficiency
- **Simplicity**: 8/10 - Minimal boilerplate, clear mental model
- **Ecosystem**: 6/10 - Growing but small (293 dependent projects)

#### When to Consider oRPC Instead of REST+OpenAPI
1. **Rapid prototyping priority**: When time-to-first-endpoint matters more than long-term flexibility
2. **TypeScript-only stack**: When certain you'll never need non-TypeScript backend or external API consumers
3. **RPC mental model preference**: Team strongly prefers function-call style over HTTP semantics
4. **Small project scope**: When API will remain simple and migration cost stays low
5. **Comfort with newer tech**: Team willing to accept smaller ecosystem for modern DX

---

### 2. REST+OpenAPI - **RECOMMENDED** ⭐

**Summary:** Traditional REST APIs with modern TypeScript tooling (openapi-typescript + openapi-fetch) for automated type generation.

#### Strengths
- ✅ **Perfect AI-agent support**: OpenAPI is MCP standard, vast LLM training data
- ✅ **Universal mobile support**: React Native native fetch, axios ecosystem
- ✅ **Maximum flexibility**: Zero vendor lock-in, framework-agnostic
- ✅ **Mature tooling**: openapi-typescript (1.7M weekly downloads), orval (490K)
- ✅ **Public API ready**: Automatic documentation, SDK generation
- ✅ **Multi-language backend**: Can rewrite server in Go/Python/Rust later

#### Weaknesses
- ⚠️ **Build-time dependency**: Requires code generation pipeline
- ⚠️ **Schema maintenance**: OpenAPI spec must stay in sync with implementation
- ⚠️ **More boilerplate**: Setup overhead vs RPC frameworks
- ⚠️ **Manual updates**: After API changes, regenerate types + update client code

#### Scoring Breakdown
- **AI-Agent Friendliness**: 10/10 - OpenAPI is the gold standard for LLM tool integration
- **Mobile Support**: 10/10 - Battle-tested for React Native
- **Migration Path**: 8/10 - Trivial to escape (industry standard)
- **Learning Curve**: 6/10 - 16-26 hours (OpenAPI spec + codegen learning)
- **Simplicity**: 6/10 - Indirection from code generation
- **Ecosystem**: 10/10 - Infinite (every HTTP client works)

#### Why REST+OpenAPI is Recommended
REST+OpenAPI is the best choice for:
- ✅ **Zero vendor lock-in**: Industry standard with infinite tooling options
- ✅ **Future-proof architecture**: Works with any backend language, any HTTP client
- ✅ **AI-agent optimized**: OpenAPI is MCP standard, vast training data
- ✅ **Production-proven**: Battle-tested at massive scale (Google, Microsoft, AWS APIs)
- ✅ **Public API ready**: Automatic documentation, SDK generation for any language
- ✅ **Mature ecosystem**: Extensive tooling for validation, testing, mocking, monitoring

---

### 3. tRPC - **VIABLE BUT SUBOPTIMAL**

**Summary:** Mature RPC framework (2020) with excellent Next.js integration but problematic React Native support.

#### Why Not tRPC
- ❌ **Mobile friction**: Requires manual polyfills for React Native (TextDecoder, Streams)
- ❌ **No native OpenAPI**: Requires third-party `trpc-openapi` plugin
- ❌ **Higher lock-in**: Migration difficulty 6/10 vs oRPC's 4/10
- ✅ **Best ecosystem**: 38k stars, 1.17M weekly downloads
- ✅ **Best AI training data**: Created 2020, widely used by 2022-2023

#### Verdict
tRPC would excel for **Next.js + Express only**, but React Native support gaps make it suboptimal for multi-platform vision. If mobile is truly deferred indefinitely, tRPC becomes more attractive.

---

### 4. ts-rest - **TOO RISKY FOR MOBILE**

**Summary:** Contract-first REST framework with excellent Nx integration but unvalidated React Native support.

#### Why Not ts-rest
- ❌ **CRITICAL GAP**: Zero React Native documentation, examples, or community validation
- ❌ **Small AI training data**: Only 3.1k stars, no Stack Overflow presence
- ✅ **Best Nx integration**: Dedicated monorepo docs, solves affected builds problem
- ⚠️ **Unknown mobile risk**: Fetch-based client *should* work but **zero production evidence**

#### Verdict
Excellent for **web-only Nx monorepos**, but mobile requirement makes ts-rest too risky. Would require pioneering React Native integration without community support.

---

### 5. Hono RPC - **ELIMINATED** ❌

**Summary:** Framework-specific RPC requiring full Hono server (incompatible with Express).

#### Why Eliminated
- ❌ **Dealbreaker**: Cannot work with Express - requires replacing entire backend
- ❌ **Mobile issues**: Unresolved module resolution errors in React Native
- ❌ **High migration cost**: Would need to rewrite existing server

#### Verdict
**Non-starter** - violates "use what we have" principle. Would require abandoning Express backend generated in Stage 1.

---

## Decision Rationale

### Why REST+OpenAPI Over oRPC?

**Context-Specific Factors:**

1. **Walking Skeleton Phase**: Currently validating infrastructure
   - REST+OpenAPI: Establishes industry-standard patterns from day one
   - oRPC: Faster initial setup but creates technical debt if migration needed later
   - **Winner: REST+OpenAPI** (avoids future rework)

2. **Team Composition**: Architects/PMs, not professional developers
   - REST+OpenAPI: HTTP semantics are universal knowledge, worth the initial learning investment
   - oRPC: Simpler initially but framework-specific patterns don't transfer to other projects
   - **Winner: REST+OpenAPI** (transferable knowledge)

3. **AI-Assisted Development**: 80% AI coding
   - REST+OpenAPI: OpenAPI is MCP standard, AI agents have extensive training data
   - oRPC: Too new (Sept 2024) for comprehensive AI training data
   - **Winner: REST+OpenAPI** (superior AI tooling support)

4. **Mobile Timeline**: Phase 2 (not immediate)
   - REST+OpenAPI: Battle-tested in production React Native apps with infinite HTTP client options
   - oRPC: Documented adapter but smaller community validation
   - **Winner: REST+OpenAPI** (proven at scale)

5. **Risk Mitigation**: Unknown unknowns
   - REST+OpenAPI: Maximum flexibility - no vendor lock-in, no migration needed
   - oRPC: Provides OpenAPI escape hatch but migration still requires work
   - **Winner: REST+OpenAPI** (zero lock-in risk)

**Weighted Decision:**
- **Long-term flexibility**: REST+OpenAPI wins decisively (zero lock-in)
- **AI tooling support**: REST+OpenAPI wins (MCP standard)
- **Ecosystem maturity**: REST+OpenAPI wins (industry standard)
- **Mobile support**: Tie (both work, REST more proven)
- **Setup complexity**: oRPC wins (simpler initial setup) - but this is short-term thinking

**Final Verdict:** REST+OpenAPI's **maximum flexibility** and **zero vendor lock-in** outweigh oRPC's short-term velocity gains. The walking skeleton phase is the ideal time to establish best practices - choosing REST+OpenAPI avoids accumulating technical debt that would require migration work later.

---

## Implementation Guidance

### Recommended Path: REST+OpenAPI

#### Stage 4.1 Next Steps

1. **Choose OpenAPI generation strategy** (30 minutes)
   - **Recommended**: Code-first with `@asteasolutions/zod-to-openapi` (leverages existing Zod schemas from Stage 2.2)
   - Alternative: Spec-first with manual YAML editing (more control, more maintenance)
   - Get team buy-in on REST+OpenAPI approach and tooling choices

2. **Install tooling** (30 minutes)
   ```bash
   # Server: OpenAPI generation from Zod schemas
   pnpm add @asteasolutions/zod-to-openapi swagger-ui-express --filter @nx-monorepo/server
   pnpm add -D @types/swagger-ui-express --filter @nx-monorepo/server

   # API Client: Type generation and HTTP client
   pnpm add openapi-fetch --filter @nx-monorepo/api-client
   pnpm add -D openapi-typescript --filter @nx-monorepo/api-client

   # Remove oRPC dependencies
   pnpm remove @orpc/client --filter @nx-monorepo/api-client
   ```

3. **Set up generation pipeline** (4-6 hours)
   - Configure OpenAPI spec generation in server (using zod-to-openapi)
   - Add Nx target: `generate-types` in api-client (runs openapi-typescript)
   - Set up Swagger UI at `/api-docs` endpoint
   - Serve OpenAPI spec at `/openapi.json`

4. **Create minimal proof-of-concept** (2-4 hours)
   - Define health check endpoint with Zod schema validation
   - Generate OpenAPI spec from endpoint + schema
   - Generate TypeScript types in api-client
   - Create type-safe client wrapper
   - Verify end-to-end type safety from server to client

5. **Document decision** (30 minutes)
   - Add this file to version control
   - Update `docs/memories/tech-findings-log.md` with REST+OpenAPI patterns
   - Note OpenAPI generation workflow in `adopted-patterns.md`

#### No Migration Needed

REST+OpenAPI is the destination architecture - no future migration required. This is the industry standard that will serve the project indefinitely.

---

### Historical Alternative: oRPC (Not Recommended)

> ⚠️ **DECISION UPDATE (2025-10-23)**: This alternative was **NOT chosen**. REST+OpenAPI is the official architecture decision. This section is preserved for historical context and to document the decision-making process. Do not use these implementation steps.

If choosing oRPC over REST+OpenAPI (for rapid prototyping):

#### Stage 4.1 Next Steps

1. **Validate oRPC tradeoffs** (30 minutes)
   - Confirm team accepts vendor lock-in risk
   - Accept smaller ecosystem and AI training data limitations
   - Understand migration to REST may be needed later

2. **Install server dependencies** (15 minutes)
   ```bash
   pnpm add @orpc/server --filter @nx-monorepo/server
   pnpm add @orpc/client --filter @nx-monorepo/api-client
   ```

3. **Create minimal proof-of-concept** (2-4 hours)
   - Set up basic oRPC router in Express server
   - Create health check endpoint
   - Configure api-client to consume router type
   - Verify type inference works across packages

4. **Plan migration path** (30 minutes)
   - Document how to migrate to REST+OpenAPI later using oRPC's OpenAPI generation
   - Accept migration cost of 2-3 weeks when/if needed
   - Note this as technical debt in project documentation

---

## Task 4.1.3: REST+OpenAPI Tooling Selection

**Research Date:** October 23, 2025
**Research Method:** Parallel sub-agents with Context7, EXA, and VibeCheck validation

### Executive Summary

After comprehensive research evaluating tooling options for REST+OpenAPI implementation, we recommend a **composable stack**:

1. **@asteasolutions/zod-to-openapi** (v8.1.0) - Generate OpenAPI specs from Zod schemas
2. **openapi-typescript** (v7.10.1) - Generate TypeScript types from OpenAPI specs
3. **openapi-fetch** (v0.14.0) - Type-safe HTTP client with minimal bundle size

**Key Finding**: We evaluated **orval** as a unified alternative (generates types + client + hooks from OpenAPI spec) but determined it doesn't align with our **Zod-first architecture**. Orval is OpenAPI-first (consumes specs) while we need code-first (generate specs from Zod). The composable stack provides better alignment, smaller bundle size (6KB vs 15-30KB), and a simpler mental model.

---

### Tooling Research Findings

#### 1. OpenAPI Spec Generation: @asteasolutions/zod-to-openapi

**Selected Tool:** `@asteasolutions/zod-to-openapi` v8.1.0

**Why This Tool:**
- ✅ **Perfect Zod Integration**: Designed specifically for Zod → OpenAPI workflow
- ✅ **Code-First Approach**: Aligns with our existing Zod schemas as single source of truth
- ✅ **Production-Ready**: 1,400+ stars, actively maintained by Astea Solutions, MIT license
- ✅ **Full OpenAPI Support**: Both 3.0 and 3.1 specs, complex schema support
- ✅ **Nx-Friendly**: Clean build integration, no special monorepo configuration needed

**How It Works:**
```typescript
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const UserSchema = z.object({
  id: z.string().openapi({ example: '123' }),
  name: z.string()
}).openapi('User');

const registry = new OpenAPIRegistry();
registry.registerPath({
  method: 'get',
  path: '/users/{id}',
  responses: {
    200: { content: { 'application/json': { schema: UserSchema } } }
  }
});

const spec = new OpenApiGeneratorV3(registry.definitions)
  .generateDocument({ openapi: '3.0.0', info: {...} });
```

**Alternatives Evaluated:**
- ❌ **tsoa**: Decorator-based, couples routing to OpenAPI, requires framework buy-in
- ❌ **swagger-jsdoc**: JSDoc comments, no type safety, manual sync required
- ❌ **Manual YAML**: High maintenance, no validation, type drift risk

**Fit Score:** 9/10 - Only minor limitation is transform/refinement mapping to OpenAPI (expected constraint)

---

#### 2. TypeScript Type Generation: openapi-typescript

**Selected Tool:** `openapi-typescript` v7.10.1

**Why This Tool:**
- ✅ **Type-Only Approach**: Zero runtime overhead, generates pure `.d.ts` files
- ✅ **Massive Adoption**: 7,500+ stars, 500,000+ weekly downloads, very active maintenance
- ✅ **Fast Generation**: 7-250ms for most schemas
- ✅ **Excellent Type Quality**: Strict types, great IDE autocomplete, clear error messages
- ✅ **OpenAPI 3.1 Support**: Full support for latest specification features
- ✅ **Nx Caching Friendly**: Deterministic output, perfect for Nx cache invalidation

**Generated Output:**
```typescript
export interface paths {
  "/users/{user_id}": {
    get: {
      parameters: { path: { user_id: string }; };
      responses: {
        200: {
          content: {
            "application/json": {
              id: string;
              name: string;
            };
          };
        };
      };
    };
  };
}
```

**Alternatives Evaluated:**
- ❌ **orval**: Full client generation (types + HTTP client + hooks), but OpenAPI-first philosophy conflicts with Zod-first workflow (see below)
- ❌ **openapi-generator (TypeScript)**: Java-based, large runtime code generation, slower
- ❌ **swagger-typescript-api**: Axios-specific, heavier bundle, less flexible

**Fit Score:** 10/10 - Perfect for our use case

---

#### 3. HTTP Client Library: openapi-fetch

**Selected Tool:** `openapi-fetch` v0.14.0

**Why This Tool:**
- ✅ **Best Type Safety**: Designed specifically for openapi-typescript, compile-time validation
- ✅ **Minimal Bundle**: 5-6KB gzipped (critical for future React Native app)
- ✅ **Cross-Platform**: Works on Next.js 15, React Native, Expo SDK 52+, Edge Runtime
- ✅ **Zero Dependencies**: Uses native fetch API (available in all modern environments)
- ✅ **Middleware Support**: Interceptors for auth, error handling, logging
- ✅ **Future-Proof**: Built on web standards, not tied to any framework

**Usage Example:**
```typescript
import createClient from "openapi-fetch";
import type { paths } from "./api.d.ts";

const client = createClient<paths>({ baseUrl: "https://api.example.com" });

// Fully typed - autocomplete for paths, params, responses
const { data, error } = await client.GET("/users/{user_id}", {
  params: { path: { user_id: "123" } }
});

if (error) {
  console.error(error); // Typed error object
  return;
}

console.log(data.name); // TypeScript knows 'name' exists
```

**HTTP Client Comparison Matrix:**

| Feature | openapi-fetch | axios | native fetch |
|---------|---------------|-------|--------------|
| **Type Safety** | ★★★★★ Compile-time | ★★☆☆☆ Manual | ★☆☆☆☆ Manual |
| **Bundle Size** | 5-6KB | 13.5KB | 0KB |
| **OpenAPI Integration** | Native | Manual wrappers | Manual wrappers |
| **Interceptors** | ✅ Middleware | ✅ Built-in | ❌ Manual |
| **Error Handling** | ✅ Typed errors | ✅ Comprehensive | ⚠️ Manual |
| **React Native** | ✅ Excellent | ⚠️ Requires adapter | ✅ Excellent |
| **Expo SDK 52+** | ✅ Full support | ⚠️ Works | ✅ Enhanced |
| **Next.js 15** | ✅ Server Components | ✅ Works | ✅ Native |
| **Edge Runtime** | ✅ Excellent | ⚠️ Configuration | ✅ Excellent |

**Why Not axios:**
- Larger bundle (2-3x heavier)
- Requires manual type wrappers for type safety
- Less optimal for cross-platform (React Native requires adapter)

**Why Not native fetch:**
- No type safety without extensive manual wrappers
- Verbose configuration (interceptors, error handling, timeouts all manual)
- Would require building openapi-fetch ourselves

**Fit Score:** 10/10 - Optimal choice for cross-platform type-safe HTTP client

---

### Alternative Evaluation: orval

**VibeCheck identified a critical research gap**: Should we use **orval** (unified solution that generates types + client + React Query hooks + MSW mocks) instead of the composable stack?

#### Research Findings

**orval Overview:**
- Version: 7.14.0, actively maintained
- GitHub: 4,773 stars, 100k weekly downloads
- Generates: Types + HTTP client + React Query hooks + Zod validation + MSW mocks
- Bundle size: 15-30KB (vs. 6KB for openapi-fetch)

**Critical Finding: orval Does NOT Replace Our Workflow**

orval is **OpenAPI-first** (consumes OpenAPI specs), while our architecture is **Zod-first** (generates OpenAPI specs from Zod schemas).

**Workflow Comparison:**

```
Our Architecture (Code-First):
Zod schemas → [zod-to-openapi] → OpenAPI spec → [openapi-typescript] → Types
                                                → [openapi-fetch] → HTTP client

With orval (Still OpenAPI-First):
Zod schemas → [zod-to-openapi] → OpenAPI spec → [orval] → Types + Client + Hooks
                                                          → Generated Zod schemas (??)
```

**Problem**: Adding orval creates circular Zod generation:
1. We write Zod schemas (source of truth)
2. Generate OpenAPI spec from Zod
3. orval generates NEW Zod schemas from OpenAPI spec
4. Now we have Zod schemas in TWO places - which is the source of truth?

**Why Composable Stack Wins:**

| Aspect | Composable Stack | orval |
|--------|------------------|-------|
| **Philosophy** | Code-first (Zod → spec) | OpenAPI-first (spec → code) |
| **Bundle Size** | 6KB | 15-30KB |
| **Zod Integration** | Source of truth ✅ | Generates from spec ❌ |
| **Mental Model** | Linear flow ✅ | Circular (schemas → spec → schemas) ❌ |
| **Replaces zod-to-openapi?** | N/A (uses it) | ❌ No - still needed |
| **Walking Skeleton Fit** | Minimal, grows with needs ✅ | Batteries-included upfront ❌ |
| **React Query Hooks** | Manual or add later | Auto-generated ✅ |
| **Cross-Platform** | Excellent ✅ | Works but heavier |
| **Type Safety** | Same quality | Same quality |

**Decision: Stick with Composable Stack**

Rationale:
1. **Architecture Alignment**: Zod schemas remain single source of truth (no circular generation)
2. **Bundle Size**: Critical for React Native (6KB vs 15-30KB)
3. **Walking Skeleton**: Start simple, add React Query hooks later if needed via `openapi-react-query`
4. **Mental Model**: Clear linear flow without circular dependencies
5. **Future Flexibility**: Can add orval for CLIENT generation only in Phase 2+ if React Query hooks become valuable

---

### CI/CD Workflow

**Generated Files Strategy:** ✅ **Gitignore generated OpenAPI types; treat generated artifacts as build outputs**

**Why gitignore generated types:**
- Avoid PR noise and merge conflicts from machine-generated diffs
- Preserve clear source of truth (Zod schemas → OpenAPI → generated types)
- Nx targets generate artifacts deterministically during builds and in CI
- CI benefits from Nx caching; no need to commit generated files

**Workflow Diagram:**

```
Developer edits Zod schema (packages/schemas/src/health.schema.ts)
    ↓
Nx target: server:spec-write (from schemas registrations)
    ↓
Output: dist/apps/server/openapi.json
    ↓
Nx target: api-client:generate-types (depends on server:spec-write)
    ↓
Output: packages/api-client/src/gen/openapi.d.ts (gitignored)
    ↓
Apps import types from @nx-monorepo/api-client
    ↓
Full type safety across web + mobile!
```

**Nx Dependency Graph:**
```
packages/schemas (generate-openapi)
    ↓
packages/api-client (generate-types, depends on ^generate-openapi)
    ↓
apps/web + apps/mobile (build, depends on api-client)
```

**CI Validation:**
```yaml
# .github/workflows/ci.yml
- name: Build all projects
  run: pnpm exec nx run-many -t build
  # Nx automatically runs generation in correct order and produces artifacts
```

---

### Implementation Roadmap

**Task 4.1.5: Install Dependencies** (5 minutes)
```bash
# Server: OpenAPI generation
pnpm add @asteasolutions/zod-to-openapi swagger-ui-express
pnpm add -D @types/swagger-ui-express

# Client: Type generation and HTTP client
pnpm add -D openapi-typescript
pnpm add openapi-fetch
```

**Task 4.1.6-4.1.11: Configure Infrastructure** (4-6 hours)
1. Create `packages/openapi` library for spec generation
2. Configure Express routes structure (`apps/server/src/routes/`)
3. Set up OpenAPI spec generation with zod-to-openapi
4. Create endpoint to serve OpenAPI spec: `GET /api/docs/openapi.json`
5. Configure type generation in `packages/api-client`
6. Create API client factory with openapi-fetch
7. Test type-safe client functionality end-to-end

---

### Addressing VibeCheck Uncertainties

VibeCheck validation identified four uncertainties that were systematically addressed:

1. **✅ Alternative spec generators**: Evaluated tsoa, swagger-jsdoc, @nestjs/swagger - zod-to-openapi best fit for Zod-first architecture
2. **✅ Unified solution (orval)**: Comprehensive research determined it's OpenAPI-first (conflicts with Zod-first), adds bundle weight, creates circular generation
3. **✅ Emerging tools**: All selected tools are modern (2024-2025), actively maintained, production-ready - not at risk of obsolescence
4. **✅ CI/CD complexity**: Workflow documented - commit generated files, Nx handles orchestration, minimal maintenance burden

**Research Confidence: Very High** - All critical uncertainties addressed through parallel research agents, real-world usage examples, and metacognitive validation via VibeCheck.

---

### Selected Stack Summary

| Layer | Tool | Version | Bundle Size | Why |
|-------|------|---------|-------------|-----|
| **Spec Generation** | @asteasolutions/zod-to-openapi | 8.1.0 | N/A (build-time) | Zod-first, code generation from schemas |
| **Type Generation** | openapi-typescript | 7.10.1 | 0KB (types only) | Fast, type-only, excellent quality |
| **HTTP Client** | openapi-fetch | 0.14.0 | 5-6KB | Type-safe, cross-platform, minimal |
| **Total Runtime Bundle** | - | - | **5-6KB** | Critical for React Native |

**Alternative (Future Phase 2+):**
- Add `openapi-react-query` for auto-generated React Query hooks if needed
- Consider orval for CLIENT generation only (not spec generation)

---

### Next Steps

**Ready for Task 4.1.4**: With research complete, we can now confidently make selection decisions:
- ✅ OpenAPI spec generation approach: Code-first with @asteasolutions/zod-to-openapi
- ✅ TypeScript type generation: openapi-typescript
- ✅ HTTP client library: openapi-fetch
- ✅ Git strategy: Gitignore generated OpenAPI types (build artifacts)
- ✅ Build integration: Nx targets with dependency graph

**Proceed to Task 4.1.5**: Install dependencies and begin infrastructure configuration.

---

## Task 4.1.4: Formal Tooling Decisions

**Decision Date:** October 24, 2025

Based on comprehensive research in Task 4.1.3, we hereby formalize the following architectural decisions for REST+OpenAPI implementation.

---

### Decision 1: OpenAPI Spec Generation

**Decision:** Use **@asteasolutions/zod-to-openapi** for code-first OpenAPI spec generation

**Rationale:**
- **Zod-First Architecture**: Zod schemas in `packages/schemas` are already the single source of truth (Stage 2.2)
- **Runtime Validation**: Zod provides built-in validation, eliminating drift between validation and documentation
- **Walking Skeleton Fit**: Rapid iteration via code changes (no manual YAML editing)
- **Production-Ready**: 1,400+ GitHub stars, actively maintained by Astea Solutions, supports OpenAPI 3.0 and 3.1

**Alternatives Considered:**
- ❌ **Manual YAML/JSON**: High maintenance, no type safety, drift risk
- ❌ **tsoa**: Decorator-based, couples routing to OpenAPI generation, requires framework buy-in
- ❌ **swagger-jsdoc**: JSDoc comments have no type safety, manual sync required

**Consequences:**
- ✅ Single source of truth (Zod schemas drive both validation and API docs)
- ✅ Fast iteration during walking skeleton phase
- ⚠️ OpenAPI spec is derivative (cannot edit spec directly, must change Zod schemas)
- ⚠️ Some advanced OpenAPI features may not have Zod schema equivalents

Policy note (canonical workflow): This repository uses a code-first approach. Zod schemas are the single source of truth; the OpenAPI document is generated from code and treated as a build artifact. Any design-first YAML kept under `specs/*/contracts/` is for reference only and is non-authoritative.

**Implementation:**
```bash
pnpm add @asteasolutions/zod-to-openapi swagger-ui-express
pnpm add -D @types/swagger-ui-express
```

---

### Decision 2: TypeScript Type Generation

**Decision:** Use **openapi-typescript** for generating TypeScript types from OpenAPI specifications

**Rationale:**
- **Type-Only Approach**: Zero runtime overhead, generates pure `.d.ts` files
- **Massive Adoption**: 7,500+ stars, 500,000+ weekly npm downloads, very active maintenance
- **Performance**: 7-250ms generation time for most schemas
- **Quality**: Excellent type inference, great IDE autocomplete, clear error messages
- **Nx Caching**: Deterministic output perfect for Nx cache invalidation

**Alternatives Considered:**
- ❌ **orval**: Full client generation (types + client + hooks), but OpenAPI-first philosophy conflicts with Zod-first architecture
- ❌ **openapi-generator (TypeScript)**: Java-based, generates runtime code (slower, larger output)
- ❌ **swagger-typescript-api**: Axios-specific, less flexible, heavier bundle

**Consequences:**
- ✅ Zero runtime overhead (types are compile-time only)
- ✅ Fast generation integrated with Nx build pipeline
- ✅ Generated types match OpenAPI spec exactly
- ⚠️ No runtime validation (types don't validate at runtime - use Zod for that)
- ⚠️ Requires build step to regenerate types after schema changes

**Implementation:**
```bash
pnpm add -D openapi-typescript
```

**Nx Target Configuration:**
```json
// packages/api-client/project.json
{
  "targets": {
    "generate-types": {
      "executor": "nx:run-commands",
      "options": {
        "command": "openapi-typescript ../../apps/server/public/openapi.yaml -o src/generated/api.d.ts --export-type"
      },
      "dependsOn": ["^generate-openapi"],
      "inputs": ["{workspaceRoot}/apps/server/public/openapi.yaml"],
      "outputs": ["{projectRoot}/src/generated"]
    }
  }
}
```

---

### Decision 3: HTTP Client Library

**Decision:** Use **openapi-fetch** as the type-safe HTTP client

**Rationale:**
- **Best Type Safety**: Designed specifically for openapi-typescript, provides compile-time validation of all API calls
- **Minimal Bundle**: 5-6KB gzipped (critical for future React Native app)
- **Cross-Platform**: Native fetch-based, works on Next.js 15, React Native, Expo SDK 52+, Edge Runtime
- **Zero Dependencies**: Uses native fetch API (available in Node.js 18+, all modern browsers, React Native)
- **Future-Proof**: Built on web standards, not tied to any framework

**Alternatives Considered:**
- ❌ **axios**: Larger bundle (13.5KB), requires manual type wrappers for type safety, React Native requires adapter
- ❌ **native fetch**: Zero bundle but no type safety without extensive manual wrappers, verbose configuration

**Comparison Matrix:**

| Feature | openapi-fetch ⭐ | axios | native fetch |
|---------|------------------|-------|--------------|
| Type Safety | Compile-time | Manual generics | Fully manual |
| Bundle Size | 5-6KB | 13.5KB | 0KB |
| React Native | ✅ Excellent | ⚠️ Requires adapter | ✅ Excellent |
| Expo SDK 52+ | ✅ Full support | ⚠️ Works | ✅ Enhanced |
| Interceptors | ✅ Middleware | ✅ Built-in | ❌ Manual |
| OpenAPI Integration | Native | Manual wrappers | Manual wrappers |

**Consequences:**
- ✅ Compile-time type safety prevents entire classes of runtime errors
- ✅ Minimal bundle size (critical for mobile app in Phase 2)
- ✅ Universal compatibility across all target platforms
- ⚠️ No built-in retry logic (implement via middleware if needed)
- ⚠️ Timeout handling requires manual AbortController usage

**Implementation:**
```bash
pnpm add openapi-fetch
```

**Usage Example:**
```typescript
import createClient from "openapi-fetch";
import type { paths } from "./generated/api";

const client = createClient<paths>({ baseUrl: process.env.API_URL });

// Fully typed - autocomplete for paths, params, responses
const { data, error } = await client.GET("/health");
```

---

### Decision 4: Git Strategy for Generated Files

**Decision:** **Gitignore generated OpenAPI types; treat generated artifacts as build outputs**

**Files generated (not committed):**
- `dist/apps/server/openapi.json` (OpenAPI spec artifact)
- `packages/api-client/src/gen/openapi.d.ts` (TypeScript types)

**Rationale:**
- Prevent PR noise and merge conflicts from generated diffs
- Preserve clear source of truth (Zod schemas drive spec and types)
- Deterministic outputs via Nx task graph + caching; CI regenerates consistently
- Aligns with `docs/memories/adopted-patterns.md` Pattern 7

**Alternatives Considered:**
- ❌ Commit generated files: increases PR noise; requires extra CI guardrails

**Consequences:**
- ✅ Cleaner reviews and simpler developer workflow
- ✅ Artifacts reproducible on demand via Nx targets
- ⚠️ Requires generation in CI and local builds (handled by Nx)

**CI Validation:**
```yaml
# .github/workflows/ci.yml
- name: Build all projects
  run: pnpm exec nx run-many -t build
```

---

### Decision 5: Build Integration Strategy

**Decision:** Use **Nx dependency graph** to orchestrate generation pipeline

**Workflow:**
```
Developer edits Zod schema (packages/schemas/src/*.schema.ts)
    ↓
Nx target: schemas:generate-openapi
    ↓
Output: dist/apps/server/openapi.json
    ↓
Nx target: api-client:generate-types (dependsOn: ^generate-openapi)
    ↓
Output: packages/api-client/src/gen/openapi.d.ts (gitignored)
    ↓
Apps import from @nx-monorepo/api-client
    ↓
Full type safety across web + mobile!
```

**Nx Configuration:**
```json
// packages/schemas/project.json
{
  "targets": {
    "generate-openapi": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx src/generate-openapi.ts",
        "cwd": "packages/schemas"
      },
      "outputs": ["{workspaceRoot}/apps/server/public/openapi.yaml"]
    }
  }
}

// packages/api-client/project.json
{
  "targets": {
    "generate-types": {
      "executor": "nx:run-commands",
      "options": {
        "command": "openapi-typescript ../../apps/server/public/openapi.yaml -o src/generated/api.d.ts --export-type"
      },
      "dependsOn": ["^generate-openapi"]
    },
    "build": {
      "dependsOn": ["generate-types"]
    }
  }
}
```

**Consequences:**
- ✅ Automatic build ordering (Nx handles dependency graph)
- ✅ Nx caching works correctly (inputs/outputs configured)
- ✅ Single command rebuilds everything: `pnpm exec nx run-many -t build`

---

### Selected Stack Summary

| Layer | Tool | Version | Bundle Size | Purpose |
|-------|------|---------|-------------|---------|
| **Spec Generation** | @asteasolutions/zod-to-openapi | 8.1.0 | N/A (build-time) | Generate OpenAPI from Zod schemas |
| **Type Generation** | openapi-typescript | 7.10.1 | 0KB (types only) | Generate TypeScript types from OpenAPI |
| **HTTP Client** | openapi-fetch | 0.14.0 | 5-6KB | Type-safe fetch client |
| **API Docs UI** | swagger-ui-express | Latest | N/A (dev only) | Serve interactive API docs |

**Total Runtime Bundle:** 5-6KB (openapi-fetch only)

---

### Implementation Checklist (Task 4.1.5+)

**Task 4.1.5: Install Dependencies**
```bash
# Server: OpenAPI generation
pnpm add @asteasolutions/zod-to-openapi swagger-ui-express
pnpm add -D @types/swagger-ui-express

# Client: Type generation and HTTP client
pnpm add -D openapi-typescript
pnpm add openapi-fetch

# Verification
pnpm list | grep -E "(openapi|swagger)"
```

**Task 4.1.6-4.1.11: Configuration** (detailed in roadmap.md)
1. Configure Express routes structure
2. Set up OpenAPI spec generation with zod-to-openapi
3. Create `/api/docs/openapi.json` endpoint
4. Configure type generation in api-client
5. Create API client factory with openapi-fetch
6. Test type-safe client end-to-end

---

### Migration Path (Future)

If requirements change and OpenAPI-first becomes necessary:

**Option 1: Keep Zod-First, Treat OpenAPI as Deliverable**
- Continue generating OpenAPI from Zod
- Commit generated spec as "official" API contract
- Share spec with external teams, but don't edit it manually

**Option 2: Switch to OpenAPI-First**
- Freeze current generated OpenAPI spec
- Make spec the source of truth going forward
- Generate Zod validation from spec (using orval with `client: 'zod'`)
- More work, but enables design-first workflow

**Option 3: Hybrid (Not Recommended)**
- Maintain both Zod and OpenAPI manually
- Use contract testing to ensure they match
- High maintenance burden, only for rare edge cases

**Current Decision:** Zod-first with generated OpenAPI spec is optimal for walking skeleton phase.

---

## Appendices

### A. Research Methodology

**Tools Used:**
- Context7 MCP: Latest official documentation
- Exa Code Search: Real-world monorepo examples
- Perplexity AI: Recent framework comparisons (2025)
- Web Search: Community sentiment, mobile support issues
- Nx MCP: Nx-specific integration patterns

**Evaluation Timeline:** October 21, 2025 (2 hours comprehensive research)

---

### B. Key Research Sources

**oRPC:**
- Official docs: https://orpc.unnoq.com/
- GitHub: https://github.com/unnoq/orpc (3.6k stars)
- v1 Announcement: https://orpc.unnoq.com/blog/v1-announcement
- Mobile adapter: https://orpc.unnoq.com/docs/adapters/react-native

**tRPC:**
- Official docs: https://trpc.io/
- GitHub: https://github.com/trpc/trpc (38k stars)
- React Native polyfills: Community Discord threads, GitHub issues

**ts-rest:**
- Official docs: https://ts-rest.com/
- Nx guide: https://ts-rest.com/docs/guides/nx
- GitHub: https://github.com/ts-rest/ts-rest (3.1k stars)

**REST + OpenAPI:**
- openapi-typescript: https://openapi-ts.pages.dev/
- openapi-fetch: https://openapi-ts.pages.dev/openapi-fetch/
- @asteasolutions/zod-to-openapi: https://github.com/asteasolutions/zod-to-openapi

---

### C. Decision Change Protocol

**When to Revisit This Decision:**

Trigger events:
1. oRPC ceases active maintenance (no releases for 6+ months)
2. Mobile Phase 2 discovers critical oRPC React Native issues
3. Public API requirement emerges (may need REST + OpenAPI)
4. Backend rewrite in non-TypeScript language planned

**Review Cadence:**
- After Phase 1 completion (walking skeleton done)
- After Phase 2 completion (mobile app integrated)
- Annually or when major framework updates released

---

### D. Alternative Frameworks Not Evaluated

**Excluded from evaluation:**
- **GraphQL** (Apollo, Relay): Too complex for walking skeleton, schema management overhead
- **gRPC**: Not HTTP-friendly for web/mobile browsers, requires protobuf
- **Elysia**: Built specifically for Bun runtime, not compatible with Node.js/Express
- **Feathers.js**: Real-time focus, heavier than needed
- **NestJS built-in REST**: NestJS adoption requires replacing Express

**Rationale:** These frameworks either don't fit the Express + Next.js + React Native stack or add unnecessary complexity for the walking skeleton phase.

---

## Stage 4.2: Supabase & Database Architecture Decisions

**Decision Date:** October 26, 2025

After completing REST+OpenAPI infrastructure (Stage 4.1), we now formalize architectural decisions for Supabase and Prisma integration in the monorepo.

---

### Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Development Environment** | Cloud Supabase Project | Faster setup, lower barrier to entry, production-like from day one |
| **Schema Management** | Prisma Migrate | Production-ready patterns, full migration history, reproducible schemas |
| **Database Connection** | Prisma (server) + Supabase SDK (client auth only) | Clear separation of concerns, security boundary at API layer |
| **RLS Policy** | Disabled for Phase 1 | API server is security boundary, defer RLS complexity to Phase 2+ |

---

### Decision 1: Development Environment - Cloud Supabase Project

**Decision:** Use **Supabase Cloud** (supabase.com hosted project) for Phase 1 walking skeleton

**Alternatives Considered:**
- ❌ **Local Supabase CLI** (Docker containers): Requires Docker Desktop, more setup complexity, uses ~2GB RAM

**Rationale:**

1. **Phase 1 Priority = Validate Infrastructure**
   - Goal: Prove Supabase + Prisma + REST API work together
   - Cloud project achieves this faster (5 min setup vs 15-30 min for local)

2. **Lower Barrier to Entry**
   - No Docker knowledge required
   - Works on Windows/Mac/Linux without configuration
   - Template users can clone and run immediately

3. **Production-Like Environment**
   - Cloud is where real app will live
   - No "local works, cloud broken" surprises later

4. **Template Flexibility**
   - Document cloud setup (quick start)
   - Add local CLI instructions later as "Advanced Setup"

**Migration Path:**
- Can switch to local Supabase CLI in Phase 2+ if offline development becomes critical
- Environment variables stay the same, just swap connection URL

**Consequences:**
- ✅ Faster Phase 1 completion
- ✅ Better template documentation (quick start guide)
- ⚠️ Requires internet connection for development
- ⚠️ Free tier performance limits (acceptable for walking skeleton)

---

### Decision 2: Schema Management - Prisma Migrate

**Decision:** Use **Prisma Migrate** for all schema changes (migration-based workflow)

**Alternatives Considered:**
- ❌ **db push** (schema sync): Faster iteration but no history, not production-safe

**Rationale:**

1. **Gold Standard Template = Production Patterns**
   - Migrations are industry standard for schema management
   - Teaching `db push` would undermine "production-ready" goal

2. **Walking Skeleton Validates the RIGHT Workflow**
   - Even though walking skeleton code is throwaway, infrastructure patterns are permanent
   - Prove that schema changes → migrations → git → CI/CD works seamlessly

3. **Minimal Overhead for Phase 1**
   - Health check table requires 2-3 migrations total
   - Small price for establishing best practices

4. **Full Audit Trail**
   - Every schema change documented in SQL migration files
   - Can see how database evolved over time
   - Reproducible: anyone can recreate database from scratch

5. **No Future Migration Cost**
   - Start with migrations, keep migrations forever
   - No "prototype with db push, switch to migrate for production" confusion

**Workflow:**
```bash
# Edit schema
vim packages/database/prisma/schema.prisma

# Generate migration
pnpm --filter @nx-monorepo/database prisma migrate dev --name create_health_check

# Commit migration file
git add packages/database/prisma/migrations/
git commit -m "feat: add HealthCheck table"
```

**Consequences:**
- ✅ Production-ready patterns from day one
- ✅ Full schema history in version control
- ✅ Team collaboration (migrations visible in PRs)
- ⚠️ Slightly more ceremony than db push (acceptable tradeoff)

---

### Decision 3: Database Connection Approach - Clear Separation

**Decision:**
- **Server** uses **Prisma** (via `DATABASE_URL`) for all database operations
- **Web/Mobile** use **Supabase SDK** (via `SUPABASE_URL` + keys) for authentication ONLY
- **Data operations** flow through Express API (never direct client → database)

**Architecture Diagram:**
```
┌─────────────────────────────────────────────────────────┐
│ Supabase Cloud Project                                  │
│  ├─ PostgreSQL Database (data storage)                 │
│  └─ Auth Service (login/signup/sessions)               │
└─────────────────────────────────────────────────────────┘
           ↑                           ↑
           │                           │
    DATABASE_URL               SUPABASE_URL + Keys
    (PostgreSQL)               (HTTP API)
           │                           │
    ┌──────┴─────┐            ┌────────┴──────┐
    │   Prisma   │            │ Supabase SDK  │
    │    (ORM)   │            │   (Auth)      │
    └──────┬─────┘            └────────┬──────┘
           │                           │
    ┌──────┴──────────┐       ┌────────┴──────────┐
    │  apps/server    │       │  apps/web         │
    │  (Express API)  │       │  (Next.js)        │
    │                 │       │                   │
    │  CRUD via       │←──────│  Calls API via    │
    │  Prisma         │  HTTP │  openapi-fetch    │
    └─────────────────┘       └───────────────────┘
```

**Connection Methods Explained:**

#### 1. DATABASE_URL (Prisma → PostgreSQL)

**What it is:** Supavisor connection pooler with dual-connection strategy (recommended 2025)

**Format:**
```bash
# Transaction Mode (Port 6543) - Used by Prisma Client for queries
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[password]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# Session Mode (Port 5432) - Used by Prisma Migrate for schema changes
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[password]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

**Connection Strategy (Updated 2025-10-30):**
- Uses **Supavisor connection pooler** (recommended by Supabase + Prisma official documentation)
- `DATABASE_URL` (port 6543): Transaction mode with connection pooling for all queries
- `DIRECT_URL` (port 5432): Session mode for migrations (direct connection required)
- Prisma schema includes `directUrl = env("DIRECT_URL")` field
- **Rationale**: Better scalability, connection pooling, follows 2025 best practices
- **Research**: See `specs/001-walking-skeleton/research-validation.md` - Agent 1 findings

**Used by:**
- `apps/server` (Express API)
- `packages/database` (Prisma client)

**Purpose:**
- All CRUD operations (Create, Read, Update, Delete)
- Complex queries, joins, transactions
- Database migrations

**Important:** This is a **PostgreSQL database credential** (username/password), NOT the Supabase service role key.

---

#### 2. SUPABASE_URL + SUPABASE_ANON_KEY (Supabase SDK)

**What it is:** HTTP API credentials for Supabase services

**Format:**
```bash
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."  # JWT token
```

**Used by:**
- `apps/web` (Next.js)
- `apps/mobile` (Expo - Phase 2)
- `packages/supabase-client` (client factory)

**Purpose:**
- **Authentication only** (login, signup, password reset, session management)
- NOT for data operations (those go through Express API)

**Important:** The anon key and service role key are **Supabase HTTP API keys** (JWT tokens), completely separate from `DATABASE_URL` PostgreSQL credentials.

---

**Rationale:**

1. **Security**
   - ❌ Never give browsers direct database access (huge risk)
   - ✅ All database logic in server API (controlled environment)
   - ✅ Supabase SDK in browser is safe (designed for client-side auth)

2. **Architecture**
   - ✅ Single source of truth for business logic (server API)
   - ✅ Web and mobile apps identical (both call same API)
   - ✅ Easy to add validation, rate limiting, caching at API layer

3. **Flexibility**
   - ✅ Can switch databases without touching client apps
   - ✅ Testing is easier (mock API, not database)

**Example Flow:**
```
User wants health check data:

1. Web app → GET /api/health (via openapi-fetch)
2. Server API → Prisma query: prisma.healthCheck.findMany()
3. Server → JSON response to web app
4. Web app displays data
```

**Environment Variables Required:**

**Server** (`.env` in workspace root):
```bash
DATABASE_URL="postgresql://postgres.xxx:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

**Web** (`.env.local` in workspace root):
```bash
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

**Consequences:**
- ✅ Clear security boundary at API layer
- ✅ Consistent data access pattern for web and mobile
- ✅ Easy to test and mock
- ⚠️ Requires understanding of two separate authentication systems

---

### Decision 4: RLS Policy Approach - Enabled with Service Role Bypass (Updated 2025-10-30)

**Decision:** **Enable Row Level Security (RLS)** with service_role key bypass for defense-in-depth protection

**Alternatives Considered:**
- ❌ **Disable RLS entirely**: Simpler but no protection against accidental Data API exposure
- ❌ **Enable RLS with complex policies**: Adds unnecessary complexity for server-side architecture
- ✅ **Enable RLS + service_role bypass**: Defense-in-depth without complexity (chosen approach)

**What is RLS:**

Row Level Security is a PostgreSQL feature that enforces access control at the database row level.

**Example:** With RLS enabled + policies, Alice sees only her posts, Bob sees only his posts, even if both query the same table.

**Why Supabase Emphasizes RLS:**

Supabase's default architecture assumes **clients talk directly to database**:
```
Browser → Supabase SDK → PostgreSQL
                         ↑
                    RLS protects here
```

In this model, RLS is critical because browsers have database credentials.

---

**Why Our Architecture is Different:**

**Our architecture has API server as security boundary**:
```
Browser → Express API → Prisma → PostgreSQL
          ↑
     Security enforced HERE
     - Authentication checks
     - Authorization logic
     - Validation
```

**Key difference:**
- ❌ Browser does NOT have direct database access
- ✅ Browser calls Express API only
- ✅ API server validates before querying database

---

**Rationale for Enabling RLS with Service Role Bypass (API path):**

1. **Defense-in-Depth Security (Updated 2025-10-30)**
   - Protects against accidental exposure via Supabase Data API
   - RLS acts as database-level safety net if API keys leak
   - Follows Supabase + Prisma best practices (research validated)

2. **Architecture Still Uses API Server as Primary Security Boundary**
   - API server validates all requests before database operations
   - On the API path (PostgREST), the service_role key bypasses RLS
   - No complex RLS policies needed for the API path (RLS enabled, no policy logic)

3. **Minimal Complexity Increase**
   - Simply enable RLS (one line: `ENABLE ROW LEVEL SECURITY`)
   - No policy syntax to learn (service_role bypasses all policies)
   - Best of both worlds: protection without complexity

4. **Production-Ready Template**
   - Demonstrates security best practices from Phase 1
   - Supabase dashboard won't show RLS warnings
   - Template users inherit defense-in-depth by default

**Research Source:** See `specs/001-walking-skeleton/research-validation.md` - Agent 1 findings (Supabase official docs + Prisma best practices validate this approach)

---

**Important Technical Clarification:**

**Two Separate Authentication Systems Exist:**

1. **Prisma (SQL connection)**
   - Uses `DATABASE_URL` with PostgreSQL credentials (username/password)
   - Connects as database role (typically `postgres` superuser)
   - Superusers bypass RLS by default in PostgreSQL
   - RLS policies with `TO authenticated`, `TO anon` don't apply here

2. **Supabase SDK (HTTP API)**
   - Uses `SUPABASE_URL` + anon/service role keys (JWT tokens)
   - Goes through Supabase's PostgREST layer
   - RLS policies DO apply to PostgREST connections (when enabled)

**Why this matters for our RLS strategy:**
- **Prisma (server-side)**: Connects as superuser → bypasses RLS automatically → full access ✅
- **Supabase Data API (if accidentally exposed)**: Goes through PostgREST → RLS blocks access ✅
- **Service role key (when needed)**: Bypasses RLS through PostgREST → full access ✅
- Result: API server gets full access, but accidental Data API exposure is blocked by RLS

---

**Implementation (API path):**

```sql
-- Enable RLS on walking skeleton table (defense-in-depth)
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;

-- No policies needed for PostgREST when using service_role
-- Protects against accidental Data API exposure on the API path
```

**Configuration Note (scope):**

When using the Supabase SDK (HTTP API path via PostgREST), you may initialize a server-side client with the service_role key to bypass RLS for API operations. This does not apply to Prisma, which connects via PostgreSQL and uses a SQL database role.
```typescript
// packages/supabase-client/src/index.ts (API path only)
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

Prisma uses a PostgreSQL role (typically superuser in Phase 1), which bypasses RLS at the SQL layer. The service_role key does not affect Prisma connections.

**When to Add RLS Policies Later:**

Consider adding explicit RLS policies in Phase 2+ if you add:
- Real user authentication (login system with multi-user data)
- Direct client database access (Supabase Realtime subscriptions)
- Row-level multi-tenant data isolation (user A shouldn't see user B's data)

**Policy Example (Phase 2+):**
```sql
-- Create policy for authenticated users
CREATE POLICY "Users can read own posts"
ON user_posts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

**Consequences:**
- ✅ Defense-in-depth security from Phase 1
- ✅ No RLS warnings in Supabase dashboard
- ✅ Minimal complexity (no policy logic needed)
- ✅ API server still has full access via service_role key
- ✅ Protection against accidental Data API exposure
- ⚠️ Must use service_role key (not anon key) for API server

---

## Implementation Checklist for Stage 4.2-4.5

Based on the decisions above, here's the execution plan:

### Stage 4.3: Set up Supabase Project (Cloud)

- [ ] Create free Supabase project at supabase.com
- [ ] Copy `DATABASE_URL` from project settings
- [ ] Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` from project settings
- [ ] Create `.env` in workspace root with `DATABASE_URL`
- [ ] Create `.env.local` in workspace root with Supabase public keys
- [ ] Add `.env` and `.env.local` to `.gitignore` (if not already)
- [ ] Create `.env.example` template for other developers
- [ ] Test connectivity: `psql $DATABASE_URL -c "SELECT 1"`

### Stage 4.4: Configure Prisma in Database Package

- [ ] Create `packages/database/prisma/schema.prisma`
- [ ] Configure PostgreSQL datasource with `env("DATABASE_URL")`
- [ ] Define minimal HealthCheck model:
  ```prisma
  model HealthCheck {
    id        String   @id @default(uuid())
    message   String
    timestamp DateTime @default(now())
  }
  ```
- [ ] Run: `pnpm --filter @nx-monorepo/database prisma generate`
- [ ] Run: `pnpm --filter @nx-monorepo/database prisma migrate dev --name create_health_check`
- [ ] Verify migration file created in `packages/database/prisma/migrations/`
- [ ] Verify table exists in Supabase dashboard
- [ ] Disable RLS: Run SQL in Supabase SQL Editor: `ALTER TABLE "HealthCheck" DISABLE ROW LEVEL SECURITY;`
- [ ] Commit migration files to git

### Stage 4.5: Configure Supabase Client Factory

- [ ] Implement `createSupabaseBrowserClient()` in `packages/supabase-client/src/lib/supabase-client.ts`
- [ ] Implement `createSupabaseServerClient()` for Next.js Server Components
- [ ] Export client factories from `packages/supabase-client/src/index.ts`
- [ ] Add placeholder documentation: "Auth only, data operations go through API"
- [ ] Test client initialization with dummy environment variables

---

## Changelog

- **2025-10-26**: Stage 4.2 - Supabase & Database Architecture Decisions
  - **Decision 1**: Cloud Supabase project (not local CLI) for Phase 1
  - **Decision 2**: Prisma Migrate (not db push) for schema management
  - **Decision 3**: Prisma for server database operations, Supabase SDK for client auth only
  - **Decision 4**: Enable RLS with service_role bypass for defense-in-depth (updated 2025-10-30)
  - Rationale: Walking skeleton validates production-ready patterns with minimal complexity
  - Documented: Implementation checklist for Stage 4.3-4.5 with exact steps
  - Clarified: Two separate authentication systems (PostgreSQL credentials vs Supabase API keys)
  - Corrected: Technical details about RLS policy scope and Prisma connection behavior

---

## Changelog

- **2025-10-24**: Task 4.1.4 - Formalized REST+OpenAPI tooling decisions
  - Decided: @asteasolutions/zod-to-openapi for OpenAPI spec generation (code-first, Zod schemas as source of truth)
  - Decided: openapi-typescript for TypeScript type generation (type-only approach, zero runtime overhead)
  - Decided: openapi-fetch for HTTP client (5-6KB bundle, compile-time type safety, cross-platform)
  - Decided: Gitignore generated OpenAPI types (build artifacts; Nx regenerates deterministically)
  - Decided: Nx dependency graph for build orchestration (automatic ordering, caching)
  - Documented: Implementation checklist for Task 4.1.5+ with exact commands and configurations
  - Rationale: Zod-first architecture with minimal bundle size and maximum type safety

- **2025-10-23**: Task 4.1.3 - Comprehensive REST+OpenAPI tooling research
  - Researched: @asteasolutions/zod-to-openapi, openapi-typescript, openapi-fetch vs axios vs native fetch
  - Evaluated: orval as unified alternative (determined OpenAPI-first philosophy conflicts with Zod-first architecture)
  - Methodology: Parallel sub-agents with Context7, EXA, and VibeCheck metacognitive validation
  - Result: High-confidence recommendations with all uncertainties addressed

- **2025-10-23**: Task 4.1.1-4.1.2 - Decision reversed to REST+OpenAPI after removing sunk cost bias and re-evaluating architecture goals
  - Recommendation: REST+OpenAPI (primary), oRPC (alternative for rapid prototyping)
  - Rationale: Maximum flexibility and zero vendor lock-in outweigh short-term velocity gains
  - Updated: All scoring, decision rationale, and implementation guidance

- **2025-10-21**: Initial decision document created (Stage 4.1 research)
  - Evaluated: oRPC, tRPC, ts-rest, Hono RPC, REST+OpenAPI
  - Initial recommendation: oRPC (influenced by sunk cost bias)
  - Eliminated: Hono RPC (Express incompatibility)

---

## Stage 6: E2E Testing Strategy - Hybrid Approach

**Decision Date:** December 4, 2025
**Story Reference:** Story 2.1 - Evaluate TestSprite MCP for E2E Testing

---

### Decision Summary

| Aspect | Decision |
|--------|----------|
| **Primary E2E Tool** | Playwright (for CI/CD and committed tests) |
| **Development Tool** | TestSprite MCP (for PRD validation and smoke testing) |
| **Strategy** | Hybrid - tools are complementary, not competing |

---

### Decision 1: Hybrid E2E Testing Approach

**Decision:** Use **Playwright** for production E2E tests (committed to repository, run in CI) and **TestSprite MCP** for development-time PRD validation and smoke testing.

**Rationale:**

TestSprite evaluation (15 frontend tests, 66.67% pass rate) demonstrated clear strengths and limitations:

#### TestSprite Strengths
- ✅ **PRD Validation**: Generates tests from PRDs, catches ambiguities before implementation
- ✅ **API Contract Verification**: 100% pass rate on API tests (TC006-TC008)
- ✅ **Fast Feedback Loop**: Cloud execution against local servers during development
- ✅ **Zero Test Code Maintenance**: Tests are ephemeral, regenerated from PRD

#### TestSprite Limitations
- ❌ Cannot manipulate database state (can't test empty state UI)
- ❌ Cannot inject network failures (can't test error state UI)
- ❌ Cannot access external systems (CI/CD, Sentry, pre-commit hooks)
- ❌ Cloud-based execution means no test environment control

#### Playwright Strengths (Complementary)
- ✅ Network interception and failure injection
- ✅ Database fixture control via test setup/teardown
- ✅ CI/CD integration (committed tests, GitHub Actions)
- ✅ Visual regression testing and screenshot comparison
- ✅ Complex multi-step user flow orchestration

**Alternatives Considered:**
- ❌ **Playwright Only**: Loses PRD validation capability during development
- ❌ **TestSprite Only**: Can't cover edge cases or integrate with CI

**Consequences:**
- ✅ Best of both worlds: fast development feedback + comprehensive CI coverage
- ✅ Clear separation of concerns (development vs production testing)
- ⚠️ Two testing tools to understand (acceptable learning curve)
- ⚠️ `testsprite_tests/` is gitignored (ephemeral, not part of committed test suite)

---

### Decision 2: Test Artifact Location Strategy

**Decision:**
- **Playwright tests**: `apps/web-e2e/src/*.spec.ts` (committed to repository)
- **TestSprite artifacts**: `testsprite_tests/` (gitignored, development-only)

**Rationale:**
- Playwright tests are stable, version-controlled regression tests
- TestSprite tests are regenerated on-demand from PRDs, no value in committing

---

### Use Case Matrix

| Use Case | Tool | Rationale |
|----------|------|-----------|
| PRD validation before implementation | TestSprite | Fast feedback on spec accuracy |
| Quick smoke testing during development | TestSprite | No test code to maintain |
| API contract verification | TestSprite | Validates documented behavior |
| Edge cases (empty state, error state) | Playwright | Requires state manipulation |
| Network interception/failure injection | Playwright | TestSprite can't inject failures |
| Visual regression testing | Playwright | Screenshot comparison |
| CI/CD integration | Playwright | Committed tests for automation |
| Complex multi-step user flows | Playwright | Better orchestration control |

---

### Implementation Reference

**Operational Guide:** `docs/tooling/testsprite-workflow.md`
- Complete workflow: PRD → Code Summary → Bootstrap → Test Plan → Execute
- Troubleshooting guide for common issues
- Integration with existing test infrastructure

**Evaluation Report:** `testsprite_tests/testsprite-frontend-test-report.md`
- Full test execution results with pass/fail analysis
- Root cause analysis for each failure
- Recommendations for test scoping

---

### Migration Path

**Current State:** Hybrid approach established
**Future Considerations:**
- If TestSprite adds state manipulation capabilities, re-evaluate edge case coverage
- If Playwright gains AI-assisted test generation, re-evaluate development workflow
- Annual review or when major tool updates released

---

### Changelog

- **2025-12-04**: Stage 6 - E2E Testing Strategy Decision
  - Evaluated: TestSprite MCP vs Playwright
  - Decision: Hybrid approach - complementary tools for different purposes
  - Documented: Use case matrix, artifact locations, workflow guide
  - Artifacts: testsprite-workflow.md, frontend test report
  - Story 2.1 complete, Story 2.2 decision formalized

---

## Epic 5: CI/CD Staging Deployment - Platform Selection

**Decision Date:** December 4, 2025
**Story Reference:** Story 5.1 - Select Staging Platform

---

### Decision Summary (Updated 2025-12-08)

| Aspect | Decision |
|--------|----------|
| **Architecture** | Dual Frontend (Vercel + Railway) → Single Backend (Railway) |
| **Web Frontend 1** | Vercel (auto-deploy on push, native Next.js builder) |
| **Web Frontend 2** | Railway (controlled via Actions, Docker container) |
| **API Backend** | Railway (Docker container, serves both frontends) |
| **Database** | Supabase STAGING project |
| **Strategy** | Deploy BOTH frontends simultaneously, not choose between them |

---

### Decision 1: Dual Frontend Deployment Architecture (Updated 2025-12-08)

**Decision:** Implement **dual frontend architecture** - both Vercel AND Railway host the web frontend, pointing to the same Railway backend.

**Architecture:**
```
┌────────────────────┐     ┌────────────────────┐
│  Vercel Frontend   │     │  Railway Frontend  │
│  (auto-deploy)     │     │  (controlled)      │
│  Vercel builder    │     │  Docker container  │
└─────────┬──────────┘     └─────────┬──────────┘
          │    Same BACKEND_URL      │
          └────────────┬─────────────┘
                       ▼
            ┌──────────────────┐
            │  Railway Backend │
            └────────┬─────────┘
                     ▼
            ┌──────────────────┐
            │ Supabase STAGING │
            └──────────────────┘
```

**Key Insight:** We're NOT choosing between deployment targets - we deploy to BOTH simultaneously. This proves deployment portability more effectively than a decision gate.

**Rationale:**

1. **Deployment Portability Proof (PRD FR19)**
   - Two frontends prove the same app runs on different platforms
   - Validates "no vendor lock-in" architecture principle
   - Demonstrates both Vercel's optimized builder AND Docker containerization

2. **Vercel Frontend Rationale**
   - Best Next.js DX (created by Vercel), instant preview URLs
   - Auto-deploys on every push (fast developer feedback)
   - Edge network for global performance

3. **Railway Frontend Rationale**
   - Pure Docker approach (production-realistic containers)
   - Validates container portability (could move to Fly.io, Render, etc.)
   - Controlled deployments via GitHub Actions

4. **Single Backend Simplicity**
   - One API to manage, one set of environment variables
   - Both frontends share the same data
   - CORS configuration accepts both origins

**Alternatives Considered:**
- ❌ **Choose one target**: Doesn't prove deployment portability
- ❌ **Separate backends per frontend**: Unnecessary complexity, data sync issues
- ❌ **Vercel for API**: Express requires serverless adaptation, cold starts

**Consequences:**
- ✅ Proves deployment portability with both approaches simultaneously
- ✅ Best DX for Vercel (auto-deploy) + Railway flexibility (controlled)
- ✅ Single backend simplifies operations
- ✅ CORS configuration enables both frontends
- ⚠️ Two frontend deployments to monitor (acceptable for template demonstration)

---

### Decision 2: Platform Selection Details

#### Vercel (Web App - Primary Target)

**Rationale:**
- Native Next.js 15 App Router support (Vercel creates Next.js)
- Auto-detection of Nx monorepo structure
- Preview deployments for every PR
- Edge network for global performance
- Free tier generous for staging workloads

**Configuration:**
- Root Directory: `apps/web`
- Build Command: `pnpm exec nx build web`
- Framework: Next.js (auto-detected)
- Environment Variables: Via Vercel dashboard or GitHub integration

**Nx Integration:**
- Uses `nx-ignore` for selective builds
- Respects Nx dependency graph
- Can use Vercel Remote Cache OR Nx Cloud (we have Nx Cloud)

#### Railway (API Server - Both Targets)

**Rationale:**
- Full Docker support with Nixpacks auto-detection
- Long-running process (no cold starts)
- Simple GitHub integration with auto-deploy
- Stable public URLs (`*.railway.app`)
- $5/month Hobby plan includes $5 usage credit

**Configuration:**
- Dockerfile: `apps/server/Dockerfile` (created in Story 5-3)
- Build Context: Monorepo root (for workspace dependencies)
- Environment Variables: Via Railway dashboard
- Health Check: `/api/health` endpoint

**Pricing (Staging Workload):**
- Hobby: $5/month + usage ($5 credit included)
- Expected cost: ~$0-5/month for staging (within credit)
- Pay-per-use: ~$0.000231/min for 0.5 vCPU

---

### Decision 3: Mobile Compatibility Requirements

**Critical for Expo/React Native Development:**

| Requirement | Vercel | Railway | Status |
|-------------|--------|---------|--------|
| HTTPS with valid SSL | ✅ Auto | ✅ Auto | ✅ |
| Stable public URLs | ✅ `*.vercel.app` | ✅ `*.railway.app` | ✅ |
| No API cold starts | N/A (web only) | ✅ Long-running | ✅ |
| CORS for mobile origins | App-level | App-level | ✅ |
| Reachable from Expo Go | ✅ | ✅ | ✅ |
| Physical device access | ✅ | ✅ | ✅ |

**Mobile Development Scenarios:**

| Scenario | API URL Configuration |
|----------|----------------------|
| Expo Go development | Railway staging URL (public HTTPS) |
| Development build (simulator) | Railway staging URL or localhost |
| Development build (device) | Railway staging URL (must be public) |
| EAS Build (preview/production) | Railway staging URL (env var injection) |

**CORS Configuration Required:**
```javascript
// apps/server/src/main.ts
app.use(cors({
  origin: [
    'https://your-app.vercel.app',     // Staging web
    'http://localhost:3000',            // Local web dev
    /^exp:\/\/.*/,                      // Expo Go
    // Add custom scheme for dev builds if needed
  ]
}));
```

---

### Decision 4: Environment Strategy (Updated 2025-12-08)

**Decision:** Use **Supabase STAGING project** (renamed from TEST) for staging AND temporary production.

**Environment Mapping:**

| Environment | Supabase Project | Hosting | Purpose |
|-------------|------------------|---------|---------|
| Development | DEV (`pjbnwtsufqpgsdlxydbo`) | localhost | Local development |
| CI/Testing | **Local PostgreSQL** | GitHub Actions | Automated tests (isolated) |
| **Staging** | **STAGING** (`uvhnqtzufwvaqvbdgcnn`) | **Vercel Preview + Railway staging** | **Demo, validation, mobile dev** |
| **Production** | **STAGING** (temp) → **PROD** | **Vercel Production + Railway production** | **Live system** |

**Key Updates (2025-12-08):**
1. **CI uses local PostgreSQL**, not Supabase - for test isolation, speed, and cost
2. **Production pipeline enabled NOW** - uses STAGING database temporarily
3. **Renamed TEST → STAGING** - clearer naming reflecting actual purpose
4. **Full documentation** - See `docs/environment-strategy.md` and `docs/environment-variables-matrix.md`

**Rationale:**
- CI must be hermetic (parallel PRs can't conflict)
- Production infrastructure needed for MVP (not Phase 2 deferred)
- STAGING serves dual purpose until PROD Supabase is created
- Easy migration: just update env vars when PROD exists

**Environment Variables (Staging):**

```bash
# Vercel (apps/web)
NEXT_PUBLIC_SUPABASE_URL="https://uvhnqtzufwvaqvbdgcnn.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
NEXT_PUBLIC_API_URL="https://your-api.railway.app/api"

# Railway (apps/server)
DATABASE_URL="postgresql://postgres.uvhnqtzufwvaqvbdgcnn:...@pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.uvhnqtzufwvaqvbdgcnn:...@pooler.supabase.com:5432/postgres"
SUPABASE_URL="https://uvhnqtzufwvaqvbdgcnn.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
NODE_ENV="production"
```

---

### Implementation Sequence

**Week 1: Primary Target (Vercel + Railway)**

1. **Story 5-1** ✅ (this decision document)
2. **Story 5-2**: Configure GitHub Actions deployment workflow
   - Create `staging` GitHub environment with secrets
   - Create `.github/workflows/deploy-staging.yml`
   - Deploy web to Vercel (no Docker needed)
   - Deploy API to Railway (needs Dockerfile)
3. **Story 5-3**: Create `apps/server/Dockerfile` only (web uses Vercel's builder)
4. **Story 5-4**: Validate staging deployment

**Week 2 (Optional): Secondary Target (Railway + Railway)**

1. Add `apps/web/Dockerfile` for Next.js standalone output
2. Deploy both to Railway
3. Compare operational experience
4. Document findings

---

### Docker Strategy (Forward-Compatible)

**Primary Target:**
- Only `apps/server/Dockerfile` needed (Vercel handles web)

**Secondary Target Preparation:**
- `apps/web/Dockerfile` created during Story 5-3 anyway
- Both Dockerfiles ready for Railway + Railway deployment
- Same Dockerfiles work for Fly.io, Render, or self-hosted

**Next.js Standalone Output:**
```javascript
// apps/web/next.config.js
module.exports = {
  output: 'standalone',  // Required for Docker deployment
  // ... other config
};
```

---

### Cost Analysis (Staging)

| Platform | Tier | Expected Monthly Cost |
|----------|------|----------------------|
| **Vercel** | Hobby (free) | $0 |
| **Railway** | Hobby ($5/mo) | $0-5 (within credit) |
| **Supabase** | Free tier | $0 |
| **Total (Primary)** | - | **$0-5/month** |

| Platform | Tier | Expected Monthly Cost |
|----------|------|----------------------|
| **Railway** (both) | Hobby ($5/mo) | $5-10 |
| **Supabase** | Free tier | $0 |
| **Total (Secondary)** | - | **$5-10/month** |

---

### Comparison Matrix

| Criterion | Primary (Vercel+Railway) | Secondary (Railway+Railway) |
|-----------|--------------------------|----------------------------|
| **Web DX** | ✅ Best (native Next.js) | ✅ Good (Docker) |
| **API DX** | ✅ Pure Express | ✅ Pure Express |
| **Cold Starts** | None | None |
| **Ops Complexity** | Medium (2 platforms) | Low (1 platform) |
| **Docker Required** | API only | Both apps |
| **Cost** | $0-5/mo | $5-10/mo |
| **Mobile Compat** | ✅ Excellent | ✅ Excellent |
| **Deployment Portability Proof** | ✅ Cross-platform | ✅ Container-portable |

---

### References

- [PRD FR16-FR19]: CI/CD and deployment requirements
- [PRD FR20-FR22]: Mobile platform requirements
- [Architecture.md - Deployment Targets]: Deployment architecture context
- [Story 5.1]: Platform selection story
- [Epic 6]: Mobile Walking Skeleton (depends on this decision)

---

### Story 5.10: Dual Frontend Validation Results

**Validation Date:** December 10, 2025

**All Frontends Validated Successfully:**

| Platform | Environment | URL | Status |
|----------|-------------|-----|--------|
| Vercel | Staging | `nx-monorepo-web-git-e5-2-zwizzly.vercel.app` | ✅ Working |
| Vercel | Production | `nx-monorepo-web-zwizzly.vercel.app` | ✅ Working |
| Railway | Staging | `nx-monorepoweb-staging.up.railway.app` | ✅ Working |
| Railway | Production | `nx-monorepoweb-production.up.railway.app` | ✅ Working |

**Shared Database Verification:**
- Records created on Vercel appear on Railway ✅
- Records created on Railway appear on Vercel ✅
- Both platforms share the same STAGING database ✅

**Performance Comparison:**

| Metric | Vercel | Railway | Notes |
|--------|--------|---------|-------|
| Initial page load | Fast | Fast | Both under 2s |
| Health check API response | ~100ms | ~100ms | Same backend |
| Record creation (Ping) | ~200ms | ~200ms | Same database |

**Platform Differences (Observations):**
- **Build system**: Vercel uses native Next.js builder; Railway uses Docker
- **Deploy triggers**: Vercel auto-deploys on push; Railway via GitHub Actions
- **Output artifacts**: Both produce identical functionality
- **No functional differences detected** between platforms

**Conclusion:** Dual frontend architecture successfully proves deployment portability (PRD FR19).

---

### Changelog

- **2025-12-10**: Story 5.10 - Dual Frontend Architecture Validation
  - Validated: All 4 frontends (Vercel staging/prod, Railway staging/prod)
  - Verified: Cross-platform database sync working correctly
  - Documented: Performance comparison (no significant differences)
  - Evidence: Screenshots and network logs captured during validation
  - Updated: README.md with correct deployment URLs

- **2025-12-04**: Epic 5 - CI/CD Staging Platform Selection
  - Decision: Two-target strategy (Vercel+Railway primary, Railway+Railway secondary)
  - Rationale: Proves deployment portability, best DX for each platform
  - Mobile compatibility: Both targets provide stable HTTPS URLs, no cold starts
  - Environment: Supabase STAGING project for staging (renamed from TEST)
  - Cost: $0-10/month acceptable for staging
  - Implementation: Primary first, secondary if time permits
