---
Created: 2025-10-21
Modified: 2025-10-24T13:08
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

**Generated Files Strategy:** ✅ **Commit to version control**

**Why commit generated files:**
- Faster CI builds (no generation step)
- Git diffs show API changes explicitly
- Works offline
- Deterministic builds
- Better Nx caching

**Workflow Diagram:**

```
Developer edits Zod schema (packages/schemas/src/health.schema.ts)
    ↓
Nx target: schemas:generate-openapi
    ↓
Output: apps/server/public/openapi.yaml ✅ COMMITTED
    ↓
Nx target: api-client:generate-types (depends on ^generate-openapi)
    ↓
Output: packages/api-client/src/generated/api.d.ts ✅ COMMITTED
    ↓
Apps import: import { api } from '@nx-monorepo/api-client'
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
  # Nx automatically runs generation in correct order

- name: Verify no uncommitted changes
  run: git diff --exit-code
  # Ensures developers committed generated files
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
- ✅ Git strategy: Commit generated files
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

**Decision:** **Commit generated files to version control**

**Files to Commit:**
- ✅ `apps/server/public/openapi.yaml` (generated OpenAPI spec)
- ✅ `packages/api-client/src/generated/api.d.ts` (generated TypeScript types)

**Rationale:**
- **Faster CI Builds**: No generation step required in CI pipeline
- **Deterministic Builds**: Types match exact schema version in git
- **Git Diffs Show API Changes**: Reviewers can see type changes in pull requests
- **Offline Development**: No build step required for consumers
- **Nx Caching**: Cached outputs are versioned, improving cache hit rates

**Alternatives Considered:**
- ❌ **Gitignore Generated Files**: Requires generation on every install, slower CI, can't work offline

**Consequences:**
- ✅ Faster development workflow
- ✅ Better code review experience (see API changes in diffs)
- ⚠️ Generated code in version control (minor downside)
- ⚠️ Developers must remember to regenerate and commit changes

**CI Validation:**
```yaml
# .github/workflows/ci.yml
- name: Verify no uncommitted changes
  run: git diff --exit-code || (echo "Generated files uncommitted!" && exit 1)
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
Output: apps/server/public/openapi.yaml ✅ COMMITTED
    ↓
Nx target: api-client:generate-types (dependsOn: ^generate-openapi)
    ↓
Output: packages/api-client/src/generated/api.d.ts ✅ COMMITTED
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

**Task 4.1.6-4.1.11: Configuration** (detailed in P1-plan.md)
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

## Changelog

- **2025-10-24**: Task 4.1.4 - Formalized REST+OpenAPI tooling decisions
  - Decided: @asteasolutions/zod-to-openapi for OpenAPI spec generation (code-first, Zod schemas as source of truth)
  - Decided: openapi-typescript for TypeScript type generation (type-only approach, zero runtime overhead)
  - Decided: openapi-fetch for HTTP client (5-6KB bundle, compile-time type safety, cross-platform)
  - Decided: Commit generated files to git (faster CI, better code review, offline support)
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
