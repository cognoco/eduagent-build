## Pattern 6: OpenAPI Spec Generation

**Our Standard**: Runtime OpenAPI 3.1.0 generation from Zod schemas with Nx build artifacts

Policy note (authoritative source): Code-first is canonical in this monorepo. Zod schemas (in `packages/schemas`) are the single source of truth for both runtime validation and API documentation. The OpenAPI specification is generated from these schemas and treated as a build artifact. Any YAML files placed under `specs/*/contracts/` are reference-only and must not be used as an authoritative source.

### Pattern

**Schema Enhancement** (in `packages/schemas`):
```typescript
// packages/schemas/src/lib/health.schema.ts
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok').openapi({
      description: 'Server operational status',
      example: 'ok',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp',
      example: 1729800000000,
    }),
    message: z.string().openapi({
      description: 'Status message',
      example: 'Server is running',
    }),
  })
  .openapi('HealthCheckResponse', {
    description: 'Health check response',
  });
```

**OpenAPI Registry** (`apps/server/src/openapi/registry.ts`):
```typescript
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas31';

export const registry = new OpenAPIRegistry();

export function buildOpenApiDocument(): OpenAPIObject {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'API Title',
      version: '1.0.0',
      description: 'API description',
      contact: { name: 'Support', email: 'support@example.com' },
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: '/api', description: 'API base path' }],
    tags: [{ name: 'Health', description: 'Health endpoints' }],
  });
}
```

**Per-Feature Registration** (`apps/server/src/routes/health.openapi.ts`):
```typescript
import { registry } from '../openapi/registry';
import { HealthResponseSchema } from '@nx-monorepo/schemas';

export function registerHealthOpenApi() {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Get server health status',
    operationId: 'getHealthStatus',
    responses: {
      200: {
        description: 'Server is healthy',
        content: { 'application/json': { schema: HealthResponseSchema } },
      },
    },
  });
}
```

**Registration Aggregator** (`apps/server/src/openapi/register.ts`):
```typescript
import { registerHealthOpenApi } from '../routes/health.openapi';

let initialized = false;

export function initOpenApi() {
  if (initialized) return;
  initialized = true;
  registerHealthOpenApi();
  // Add more feature registrations here
}
```

**Main Export** (`apps/server/src/openapi/index.ts`):
```typescript
import type { OpenAPIObject } from 'openapi3-ts/oas31';
import { initOpenApi } from './register';
import { buildOpenApiDocument } from './registry';

export function getOpenApiSpec(): OpenAPIObject {
  initOpenApi();
  return buildOpenApiDocument();
}
```

**Server Integration** (`apps/server/src/main.ts`):
```typescript
import swaggerUi from 'swagger-ui-express';
import { getOpenApiSpec } from './openapi';

const app = express();
const openApiSpec = getOpenApiSpec();

// Serve OpenAPI JSON
app.get('/api/docs/openapi.json', (_req, res) => res.json(openApiSpec));

// Serve Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  explorer: true,
  customSiteTitle: 'API Docs',
}));
```

**Nx Build Artifact Target** (`apps/server/project.json`):
```json
{
  "targets": {
    "spec-write": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "node -e \"const fs = require('fs'); const path = require('path'); const specPath = path.join(process.cwd(), 'dist', 'apps', 'server'); fs.mkdirSync(specPath, { recursive: true }); const { getOpenApiSpec } = require('./dist/apps/server/apps/server/src/openapi/index.js'); const spec = getOpenApiSpec(); fs.writeFileSync(path.join(specPath, 'openapi.json'), JSON.stringify(spec, null, 2));\""
        ],
        "cwd": "{workspaceRoot}"
      },
      "dependsOn": ["build"],
      "outputs": ["{workspaceRoot}/dist/apps/server/openapi.json"]
    },
    "spec-validate": {
      "executor": "nx:run-commands",
      "options": {
        "command": "pnpm --filter @nx-monorepo/server exec spectral lint ../../dist/apps/server/openapi.json --ruleset ../../.spectral.yaml",
        "cwd": "apps/server"
      },
      "dependsOn": ["spec-write"]
    }
  }
}
```

**Spectral Validation** (`.spectral.yaml` at workspace root):
```yaml
extends: spectral:oas
rules:
  operation-success-response: error
  operation-operationId: error
  operation-description: warn
  info-contact: error
  info-license: error
  tag-description: warn
```

### Directory Structure

```
apps/server/src/
├── openapi/                    # OpenAPI infrastructure
│   ├── index.ts               # Main export (getOpenApiSpec)
│   ├── registry.ts            # Registry + document builder
│   ├── register.ts            # Aggregates feature registrations
│   └── responses.ts           # (Optional) Shared response schemas
├── routes/
│   ├── health.ts              # HTTP router (path-agnostic)
│   └── health.openapi.ts      # OpenAPI registration (per-feature)
└── main.ts                    # Express app + Swagger UI

packages/schemas/src/
├── lib/
│   ├── health.schema.ts       # Zod schema with OpenAPI decorations
│   └── responses/             # Shared response schemas
│       └── error.response.ts  # RFC 7807 error format (future)
└── index.ts                   # Export with gated walking skeleton section

.spectral.yaml                 # Workspace root - OpenAPI validation rules
```

### Gated Exports Pattern

Mark walking skeleton code for easy deletion:

```typescript
// packages/schemas/src/index.ts

// Production schemas (KEEP)
export * from './lib/user.schema';
export * from './lib/task.schema';

// ========================================
// Walking Skeleton (DELETE after Phase 1)
// ========================================
export * from './lib/health.schema';
// ========================================
```

### Applies To

All Express-based server applications that need OpenAPI documentation

### Rationale

**Runtime generation advantages:**
- ✅ **Single source of truth**: Schemas define both validation AND documentation
- ✅ **Zero drift**: Spec always matches implementation (generated at runtime)
- ✅ **Type safety**: Full TypeScript support for schemas and routes
- ✅ **No code generation step**: Simpler development workflow

**Nx build artifact pattern:**
- ✅ **Deterministic output**: `spec-write` target writes `dist/apps/server/openapi.json`
- ✅ **Cacheable**: Nx can cache spec generation
- ✅ **Task graph**: Type generation in 4.1.8 depends on `spec-write` output
- ✅ **Gold standard monorepo**: Explicit build dependencies, no runtime-only artifacts

**Per-feature registration:**
- ✅ **Scalable**: Each feature has its own `.openapi.ts` file
- ✅ **Easy to delete**: Walking skeleton code isolated per feature
- ✅ **Parallel with routes**: Route logic separate from documentation

**Spectral validation:**
- ✅ **Quality enforcement**: Catches missing operationIds, descriptions, etc.
- ✅ **CI-ready**: Can run in GitHub Actions
- ✅ **Gold standard template**: Production-quality specs from day one

**Why OpenAPI 3.1.0:**
- Latest stable version (2021+)
- Better JSON Schema alignment
- Industry standard for 2025

**Why relative server URLs:**
```yaml
servers: [{ url: '/api' }]  # ✅ Relative to deployment
paths: { '/health': ... }    # ✅ No /api duplication
```
- Cleaner configuration
- Works across all environments (dev/staging/prod)
- No hardcoded hostnames

### When Adding New API Endpoints

**Step-by-step process:**

1. **Create Zod schema** (in `packages/schemas`):
   ```typescript
   export const CreateTaskSchema = z.object({
     title: z.string().openapi({ example: 'Buy groceries' }),
     completed: z.boolean().openapi({ example: false }),
   }).openapi('CreateTaskRequest');
   ```

2. **Create OpenAPI registration** (`routes/tasks.openapi.ts`):
   ```typescript
   import { registry } from '../openapi/registry';
   import { CreateTaskSchema, TaskResponseSchema } from '@nx-monorepo/schemas';

   export function registerTasksOpenApi() {
     registry.registerPath({
       method: 'post',
       path: '/tasks',
       tags: ['Tasks'],
       summary: 'Create a new task',
       operationId: 'createTask',
       request: {
         body: { content: { 'application/json': { schema: CreateTaskSchema } } },
       },
       responses: {
         201: {
           description: 'Task created successfully',
           content: { 'application/json': { schema: TaskResponseSchema } },
         },
       },
     });
   }
   ```

3. **Register in aggregator** (`openapi/register.ts`):
   ```typescript
   import { registerTasksOpenApi } from '../routes/tasks.openapi';

   export function initOpenApi() {
     if (initialized) return;
     initialized = true;
     registerHealthOpenApi();
     registerTasksOpenApi();  // Add new registration
   }
   ```

4. **Verify**:
   ```bash
   pnpm exec nx run server:spec-write    # Generate artifact
   pnpm exec nx run server:spec-validate # Validate with Spectral
   pnpm exec nx run server:serve         # Start server
   # Visit http://localhost:4000/api/docs to see Swagger UI
   ```

### Dependencies Required

```json
{
  "dependencies": {
    "@asteasolutions/zod-to-openapi": "^8.1.0",
    "openapi3-ts": "^4.5.0",
    "swagger-ui-express": "^5.0.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@stoplight/spectral-cli": "^6.15.0",
    "@types/swagger-ui-express": "^4.1.8"
  }
}
```

**Important**: Add `@asteasolutions/zod-to-openapi` to BOTH:
- `packages/schemas/package.json` (for schema decorations)
- `apps/server/package.json` (for spec generation)

### Anti-Patterns to Avoid

❌ **Defining schemas in server app**:
```typescript
// WRONG - schemas belong in packages/schemas
const HealthSchema = z.object({ ... });
```

✅ **Correct - import from shared package**:
```typescript
// RIGHT - single source of truth
import { HealthResponseSchema } from '@nx-monorepo/schemas';
```

❌ **Registering routes in main.ts**:
```typescript
// WRONG - scattered registration
registry.registerPath({ ... }); // in main.ts
```

✅ **Correct - per-feature registration files**:
```typescript
// RIGHT - modular, scalable pattern
// routes/health.openapi.ts contains all health registrations
```

❌ **Hardcoding server URLs**:
```yaml
# WRONG - environment-specific
servers: [{ url: 'http://localhost:4000/api' }]
```

✅ **Correct - relative URLs**:
```yaml
# RIGHT - works everywhere
servers: [{ url: '/api' }]
```

❌ **Missing return type annotations**:
```typescript
// WRONG - TypeScript portability error
export function getOpenApiSpec() { ... }
```

✅ **Correct - explicit OpenAPIObject type**:
```typescript
// RIGHT - prevents TS2742 errors
export function getOpenApiSpec(): OpenAPIObject { ... }
```

### Validation Workflow

**Local development:**
```bash
# Build and generate spec
pnpm exec nx run server:spec-write

# Validate spec quality
pnpm exec nx run server:spec-validate

# View in Swagger UI
pnpm exec nx run server:serve
# Visit http://localhost:4000/api/docs
```

**CI/CD:**
```yaml
# .github/workflows/ci.yml
- run: pnpm exec nx run server:spec-validate
```

**Online validation:**
1. Download spec: `curl http://localhost:4000/api/docs/openapi.json > spec.json`
2. Validate at: https://editor.swagger.io/
3. Or use: https://ratemyopenapi.com/

### Common Issues

**Issue**: `TS2307: Cannot find module '@asteasolutions/zod-to-openapi'`
**Fix**: Install in both `packages/schemas` AND `apps/server`

**Issue**: `TS2742: The inferred type cannot be named`
**Fix**: Add explicit `OpenAPIObject` return type to `getOpenApiSpec()` and `buildOpenApiDocument()`

**Issue**: Spectral can't find ruleset
**Fix**: Use `--ruleset ../../.spectral.yaml` with correct relative path from cwd

**Issue**: `spec-write` target not found
**Fix**: Avoid colons in target names - use `spec-write` not `spec:write` (Nx interprets colons as configurations)

### Last Validated

2025-10-24 (OpenAPI 3.1.0, @asteasolutions/zod-to-openapi 8.1.0, Nx 21.6, Spectral 6.15.0)

**References**:
- OpenAPI 3.1.0 Specification: https://spec.openapis.org/oas/v3.1.0
- @asteasolutions/zod-to-openapi documentation
- Spectral OpenAPI ruleset: spectral:oas
- Task 4.1.7 execution plan and research

---
