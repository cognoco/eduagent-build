---
title: Adopted Patterns
purpose: Monorepo-specific standards that override framework defaults
audience: AI agents, developers
created: 2025-10-21
last-updated: 2025-10-28
Created: 2025-10-21T14:39
Modified: 2025-10-28T20:29
---

# Adopted Patterns

## Purpose

This document defines **how WE do it in THIS monorepo**. These patterns override framework defaults and generator outputs to ensure consistency across all components.

**Critical Rule**: When these patterns conflict with framework defaults or generated code, **our patterns take precedence**.

---

## Pattern 1: Test File Location

**Our Standard**: Co-located tests in `src/` directory

### Pattern

- Test files live next to source code: `src/components/Button.tsx` → `src/components/Button.spec.tsx`
- Naming convention: `.spec.ts` or `.test.ts` suffix
- Jest configuration: `testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)']`

### Applies To

All apps and packages (web, server, mobile, libraries)

### Rationale

- Aligns with Next.js 15 App Router conventions
- Shorter import paths in tests
- Better developer experience (tests near code)
- Industry standard for component-based architectures (2025)

### When Adding New Apps/Packages

**⚠️ Generators may create different structures:**
- Some create `__tests__/` directories
- Some create `specs/` directories
- Some create `test/` directories

**Required action:**
1. Check if generator created different test location
2. Move all tests to `src/` directory
3. Update `jest.config.ts` testMatch pattern to only search `src/`
4. Delete empty test directories (`__tests__/`, `specs/`, etc.)

**Example fix:**
```bash
# After generation, if tests are in __tests__/
mv apps/my-app/__tests__/* apps/my-app/src/
rm -rf apps/my-app/__tests__/
```

### Last Validated

2025-10-21 (Next.js 15.2, Expo SDK 52, Nx 21.6)

---

## Pattern 2: TypeScript Module Resolution

**Our Standard**: `moduleResolution: "bundler"` in `tsconfig.base.json`, `"nodenext"` in test configs

**Note:** This pattern is about the `moduleResolution` **compiler setting**. For framework-specific tsconfig **file structure** patterns (Project References vs single file), see Pattern 4.

### Pattern

**Base configuration (`tsconfig.base.json`):**
```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "customConditions": ["@nx-monorepo/source"]
  }
}
```

**Test configurations (`tsconfig.spec.json`):**
```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
}
```

**Production configs** (tsconfig.app.json, tsconfig.lib.json): Inherit "bundler" from base (no override needed)

### Applies To

- Base config: Always "bundler"
- Production configs: Inherit "bundler" (recommended) or explicitly use "nodenext" (also valid)
- Test configs: Always "nodenext"

### Rationale

**Why "bundler" for base config:**
- Matches our bundler-everywhere architecture (Next.js, esbuild, Metro)
- Allows extension-less imports: `import { x } from './file'` (bundlers add extensions)
- More ergonomic developer experience (no `.js` extensions in TypeScript)
- Still supports `customConditions` (required for workspace package resolution)

**Why "nodenext" for test configs:**
- Jest runs in Node.js runtime with ts-jest transpilation
- "bundler" requires `module: "preserve"` which is incompatible with Jest's CommonJS mode
- "nodenext" is detection-based and works with both ESM and CJS
- Ensures tests resolve imports identically to production code

**Technical requirement**: Our workspace uses `customConditions: ["@nx-monorepo/source"]` in `tsconfig.base.json` for modern package resolution. This feature only works with:
- `moduleResolution: "node16"`
- `moduleResolution: "nodenext"`
- `moduleResolution: "bundler"` ✅ (our choice for base)

### When Adding New Projects

**⚠️ Nx generators default to outdated settings:**
- Generated `tsconfig.spec.json` often uses `moduleResolution: "node10"`
- Generated `module` setting may be `"commonjs"`

**Required action after generation:**
1. Open `<project>/tsconfig.spec.json`
2. Change `"moduleResolution": "node10"` → `"moduleResolution": "nodenext"`
3. Change `"module": "commonjs"` → `"module": "nodenext"`
4. Verify tests run: `pnpm exec nx run <project>:test`

**Production configs (tsconfig.app.json, tsconfig.lib.json):**
- No changes needed - inherit "bundler" from base (recommended)
- Or explicitly set "nodenext" if project needs strict Node.js ESM compatibility

**Why test configs need "nodenext":**
- TypeScript's `module` setting only affects type-checking, not runtime
- Jest uses ts-jest to transpile at runtime (always produces CommonJS)
- "nodenext" is detection-based - understands both ESM and CJS
- This prevents Jest/bundler incompatibility

### Known Issue

The `@nx/jest:configuration` generator in Nx 21.6 uses outdated TypeScript defaults (`node10`). This is a known limitation - not a bug in our config.

### Workspace dependency and imports (cross‑package)

- Do not use manual TypeScript `paths` in `tsconfig.base.json` for workspace packages.
- Consumers MUST declare workspace dependencies in their `package.json` when importing workspace packages, e.g.:
  ```json
  {
    "dependencies": {
      "@nx-monorepo/api-client": "workspace:*"
    }
  }
  ```
- When using `moduleResolution: "nodenext"` (Node apps/tests), use explicit `.js` extensions on relative imports.

### Last Validated

2025-10-20 (TypeScript 5.9, Nx 21.6, Jest 30.2)

**Reference**: `docs/memories/tech-findings-log.md` - "Jest Test Module Resolution Strategy"

---

## Pattern 3: Jest Configuration

**Our Standard**: Workspace preset inheritance with proper type isolation

### Pattern

**Workspace-level preset** (`jest.preset.js`):
```javascript
const nxPreset = require('@nx/jest/preset').default;
module.exports = { ...nxPreset };
```

**Project-level config** (e.g., `apps/web/jest.config.ts`):
```typescript
export default {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',  // ✅ Extend workspace preset
  testEnvironment: 'jsdom',         // or 'node' for Node.js projects
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
};
```

**Type isolation** (`apps/web/tsconfig.spec.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node"]  // ✅ Test-specific types
  },
  "include": ["src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

**Production config must NOT include test types** (`apps/web/tsconfig.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": []  // ✅ No jest types in production
  }
}
```

### Applies To

All projects with Jest testing (apps, packages)

### Rationale

- **Workspace preset**: Ensures consistent Jest behavior across all projects
- **Type isolation**: Test types (jest, testing-library) don't pollute production code
- **Nx standard**: Follows official Nx best practices for monorepo testing

### When Adding Jest to Projects

**Use the Nx generator** (auto-configures everything):
```bash
pnpm exec nx g @nx/jest:configuration <project-name>
```

Nx automatically:
- Creates `jest.config.ts` extending workspace preset
- Creates `tsconfig.spec.json` with proper type isolation
- Adds test target to `project.json`
- Configures coverage directory

**⚠️ Post-generation validation:**
1. Verify `jest.config.ts` has `preset: '../../jest.preset.js'`
2. Verify `tsconfig.spec.json` has `"types": ["jest", "node"]`
3. Verify production `tsconfig.json` does NOT have `"jest"` in types array
4. If any of the above are incorrect, manually fix them

### Optional Testing Enhancements

For advanced testing patterns (jest-dom, user-event, MSW), see `docs/testing-enhancements.md`.

These are **optional** - only add when specific projects need them.

### Last Validated

2025-10-21 (Jest 30.2, Nx 21.6, @nx/jest 21.6)

**Reference**: `.ruler/AGENTS.md` - "Jest Configuration Patterns"

---

## Pattern 4: TypeScript Configuration for Applications

**Our Standard**: Framework-specific TypeScript configurations

**Note:** This pattern is about tsconfig.json **file structure** (Project References vs single file). For the `moduleResolution` compiler setting that applies to ALL projects, see Pattern 2.

### Pattern by Framework

#### Next.js Applications (web, future mobile)

**Structure**:
```
apps/web/
├── tsconfig.json          # Single file with noEmit: true
├── tsconfig.spec.json     # Test configuration
└── project.json           # Contains manual typecheck target
```

**Configuration**:
- Single `tsconfig.json` with `noEmit: true`
- Manual typecheck target in `project.json` (see post-generation-checklist.md for complete configuration)
- Command: `tsc --noEmit`

#### Node.js Applications (server, future APIs)

- Uses TypeScript Project References (standard Nx pattern)
- Typecheck target auto-inferred by `@nx/js/typescript` plugin
- No manual configuration needed

### Applies To

- All applications (current: web, server; future: mobile, additional APIs)
- Does NOT apply to libraries (they use buildable library pattern)

### Rationale

Different application frameworks have different compilation models:

- **Next.js**: Uses SWC/Turbopack for compilation. TypeScript is only used for type-checking, not code generation. Requires `noEmit: true`.
- **Node.js**: Uses TypeScript compiler for both type-checking and compilation. Compatible with TypeScript Project References.

This workspace uses TypeScript Project References (Nx 20+ recommended approach) for optimal build performance. Next.js apps cannot use this pattern due to `noEmit: true` requirement, so they use single tsconfig.json with manual typecheck configuration.

### When Adding New Applications

- **Next.js apps**: See post-generation-checklist.md for manual typecheck target setup
- **Node.js apps**: Generator handles everything automatically
- **React Native apps** (future): Follow Next.js pattern (will be validated in Phase 2)

### Last Validated

2025-10-21 (Next.js 15.2, Nx 21.6, TypeScript 5.9)

**Reference**:
- `docs/memories/tech-findings-log.md` - "Next.js TypeScript Project References Incompatibility"
- `docs/memories/post-generation-checklist.md` - After `nx g @nx/next:app`

---

## Pattern 5: Express Route Organization (Path-Agnostic Routers)

**Our Standard**: Three-layer path control with portable, testable Express routers

### Pattern

**Layer 1: Feature Routers** (Portable - relative paths)
```typescript
// apps/server/src/routes/health.ts
import { Router, type Router as RouterType } from 'express';
import { healthController } from '../controllers/health.controller';

export const healthRouter: RouterType = Router();

// ✅ Path-agnostic - relative to mount point
healthRouter.get('/', healthController.check);
healthRouter.get('/detailed', healthController.detailed);
```

**Layer 2: API Aggregator** (Feature mounting)
```typescript
// apps/server/src/routes/index.ts
import { Router, type Router as RouterType } from 'express';
import { healthRouter } from './health';

export const apiRouter: RouterType = Router();

// ✅ Mount feature routers at specific paths
apiRouter.use('/health', healthRouter);
apiRouter.use('/users', userRouter);
```

**Layer 3: Application** (API prefix/versioning)
```typescript
// apps/server/src/main.ts
import { apiRouter } from './routes';

const app = express();
app.use(express.json());

// ✅ Mount API router with version/prefix
app.use('/api', apiRouter);
```

**Result**: Three independent path decisions combine:
- Router: `get('/')`
- Aggregator: `/health`
- App: `/api`
- **Final HTTP path**: `/api/health`
- **OpenAPI representation**: Path `/health` with `servers: [{ url: '/api' }]`

### Directory Structure

```
apps/server/src/
├── routes/               # Feature routers (path-agnostic)
│   ├── index.ts         # API aggregator (centralized mounting)
│   ├── health.ts        # Health check router
│   └── users.ts         # User resource router
├── controllers/         # HTTP request/response handlers
│   ├── health.controller.ts
│   └── users.controller.ts
├── middleware/          # Validation, auth, error handling
│   ├── validate.middleware.ts
│   └── error.middleware.ts
└── main.ts             # Express app setup
```

### Controller Pattern

Separate HTTP concerns from routing logic:

```typescript
// controllers/health.controller.ts
import { Request, Response } from 'express';

export const healthController = {
  check(_req: Request, res: Response): void {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      message: 'Server is running',
    });
  },
};
```

### Validation Middleware Pattern

Reusable Zod validation for routes:

```typescript
// middleware/validate.middleware.ts
import { z, ZodError } from 'zod';

export const validateBody = (schema: z.ZodType<any>) => {
  return async (req, res, next): Promise<void> => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  };
};

// Usage in routes:
import { CreateUserSchema } from '@nx-monorepo/schemas';
router.post('/', validateBody(CreateUserSchema), userController.create);
```

### Applies To

All Express-based server applications in the monorepo

### Rationale

**Path-agnostic routers enable:**
- ✅ **Portability**: Routers can be mounted anywhere without code changes
- ✅ **Testability**: Test routers independently of mount paths
- ✅ **API Versioning**: Easy to add `/api/v1`, `/api/v2` by changing mount points only
- ✅ **Maintainability**: Centralized path decisions in one file (`routes/index.ts`)
- ✅ **Express.js Standard**: Aligns with official Express Router documentation

**Layered architecture enables:**
- ✅ **Nx Monorepo Best Practice**: Aggressive code sharing via packages
- ✅ **Separation of Concerns**: Routes → Controllers → Services
- ✅ **Shared Validation**: Import schemas from `@nx-monorepo/schemas` (never duplicate)
- ✅ **Type Safety**: Full TypeScript support with explicit Router types

**Template-ready design:**
- ✅ **Production patterns from day one**: No refactoring needed for scale
- ✅ **Walking skeleton principle**: Establishes structure with minimal implementation
- ✅ **Prevents technical debt**: Avoids 18-24 month "zombie death" pattern

### When Adding New Features

**Step-by-step process:**

1. **Create feature router** (`routes/users.ts`):
   ```typescript
   export const userRouter: RouterType = Router();
   userRouter.get('/', userController.list);     // Relative path
   userRouter.post('/', validateBody(CreateUserSchema), userController.create);
   ```

2. **Create controller** (`controllers/users.controller.ts`):
   ```typescript
   export const userController = {
     async create(req, res, next) {
       // HTTP concerns only - delegate to services for business logic
     }
   };
   ```

3. **Import schemas** from shared package:
   ```typescript
   import { CreateUserSchema, UpdateUserSchema } from '@nx-monorepo/schemas';
   ```

4. **Mount in aggregator** (`routes/index.ts`):
   ```typescript
   import { userRouter } from './users';
   apiRouter.use('/users', userRouter);  // Centralized mounting
   ```

5. **No changes to main.ts** - routing hierarchy handles it automatically

### Anti-Patterns to Avoid

❌ **Hardcoded paths in feature routers**:
```typescript
// WRONG - couples router to specific path
healthRouter.get('/api/health', ...)
```

✅ **Correct - path-agnostic**:
```typescript
// RIGHT - relative to mount point
healthRouter.get('/', ...)
```

❌ **Business logic in controllers**:
```typescript
// WRONG - business logic in HTTP layer
export const userController = {
  async create(req, res) {
    const user = await prisma.user.create({ data: req.body });
    res.json(user);
  }
};
```

✅ **Correct - delegate to services**:
```typescript
// RIGHT - controller handles HTTP, service handles business logic
import { userService } from '../services/users.service';
export const userController = {
  async create(req, res, next) {
    try {
      const user = await userService.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }
};
```

❌ **Defining schemas in server app**:
```typescript
// WRONG - duplicates validation logic
const userSchema = z.object({ name: z.string() });
```

✅ **Correct - import from shared package**:
```typescript
// RIGHT - single source of truth
import { CreateUserSchema } from '@nx-monorepo/schemas';
```

❌ **Mounting routes without aggregator**:
```typescript
// WRONG - scattered mounting decisions
app.use('/api/health', healthRouter);
app.use('/api/users', userRouter);
```

✅ **Correct - centralized in aggregator**:
```typescript
// RIGHT - single file shows all routes
apiRouter.use('/health', healthRouter);
apiRouter.use('/users', userRouter);
app.use('/api', apiRouter);
```

### Last Validated

2025-10-24 (Express 4.21, Nx 21.6, zod 3.24, TypeScript 5.9)

**References**:
- Express.js Router documentation (official pattern)
- `docs/memories/tech-findings-log.md` - Express best practices
- Research findings from Nx monorepo backend patterns (2025)

---

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
   # Visit http://localhost:3001/api/docs to see Swagger UI
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
servers: [{ url: 'http://localhost:3001/api' }]
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
# Visit http://localhost:3001/api/docs
```

**CI/CD:**
```yaml
# .github/workflows/ci.yml
- run: pnpm exec nx run server:spec-validate
```

**Online validation:**
1. Download spec: `curl http://localhost:3001/api/docs/openapi.json > spec.json`
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

## Pattern 7: OpenAPI Type Generation

**Our Standard**: Build-time TypeScript type generation from OpenAPI spec using file-based artifact

### Pattern

**Type Generation Flow:**
```
server:build → server:spec-write → api-client:generate-types → api-client:build
```

**Server Configuration** (`apps/server/project.json`):
```json
{
  "targets": {
    "spec-write": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx scripts/write-openapi.ts"
      },
      "dependsOn": ["build"],
      "outputs": ["{workspaceRoot}/dist/apps/server/openapi.json"]
    }
  }
}
```

**Spec Write Script** (`apps/server/scripts/write-openapi.ts`):
```typescript
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Load CommonJS module from ESM context
const { getOpenApiSpec } = require('../dist/apps/server/src/openapi/index.js');

const spec = getOpenApiSpec();
const specPath = path.join(process.cwd(), 'dist', 'apps', 'server');
fs.mkdirSync(specPath, { recursive: true });
fs.writeFileSync(
  path.join(specPath, 'openapi.json'),
  JSON.stringify(spec, null, 2)
);

console.log('✓ OpenAPI spec written to dist/apps/server/openapi.json');
```

**API Client Configuration** (`packages/api-client/project.json`):
```json
{
  "targets": {
    "generate-types": {
      "executor": "nx:run-commands",
      "options": {
        "command": "openapi-typescript ../../dist/apps/server/openapi.json -o src/gen/openapi.d.ts --export-type"
      },
      "dependsOn": [
        {
          "target": "spec-write",
          "projects": ["server"]
        }
      ],
      "outputs": ["{projectRoot}/src/gen/openapi.d.ts"],
      "cache": true
    },
    "build": {
      "dependsOn": ["generate-types"]
    }
  }
}
```

**Generated Types Gitignore** (`packages/api-client/.gitignore`):
```
src/gen/
```

**Importing Generated Types:**
```typescript
// Import from built package
import type { paths } from '@nx-monorepo/api-client/gen/openapi';

// Or relative import within api-client package
import type { paths } from '../gen/openapi';

// Extract operation types
type GetHealthOperation = paths['/health']['get'];
type GetHealthResponse = GetHealthOperation['responses']['200']['content']['application/json'];
```

### Directory Structure

```
apps/server/
├── scripts/
│   └── write-openapi.ts      # Spec write script
├── dist/                     # Build output (gitignored)
│   └── openapi.json         # Generated spec artifact
└── project.json             # Contains spec-write target

packages/api-client/
├── src/
│   └── gen/                 # Generated types (gitignored)
│       └── openapi.d.ts    # TypeScript declarations
└── project.json            # Contains generate-types target
```

### Applies To

All client packages that need type-safe access to server APIs

### Rationale

**Why `openapi-typescript`:**
- ✅ **TypeScript-first**: Generates native TypeScript types, not runtime code
- ✅ **Path-based types**: Extract types via `paths['/health']['get']` (matches OpenAPI structure exactly)
- ✅ **Lightweight**: Pure type generation, no framework coupling
- ✅ **Active maintenance**: 7.10+ versions support OpenAPI 3.1.0
- ✅ **Industry standard**: Most popular OpenAPI → TypeScript tool (2025)
- ❌ **Alternatives rejected**: swagger-codegen (Java-based, outdated), orval (runtime code generation, heavier)

**File-based generation advantages:**
- ✅ **Build-time dependency**: No server runtime required for type generation
- ✅ **Nx caching**: Type generation can be cached and reused
- ✅ **CI determinism**: No network calls, no timing issues
- ✅ **Explicit graph edge**: Clear dependency via `dependsOn` reference
- ✅ **Artifact-based**: Spec file becomes a build artifact like compiled JS

**Gitignore generated types:**
- ✅ **Avoid merge conflicts**: Generated code never conflicts in PRs
- ✅ **Reduce PR noise**: No auto-generated diffs to review
- ✅ **Build artifact pattern**: Types regenerated automatically like compiled output
- ✅ **Source of truth**: OpenAPI spec is the source, types are derived

**Type declarations only (`.d.ts` with `--export-type`):**
- ✅ **Pure types**: No runtime emissions, cleaner buildable library
- ✅ **TypeScript-only**: No need for additional build configuration
- ✅ **Tree-shakeable**: Type-only imports don't affect bundle size

**Explicit dependency reference:**
```json
"dependsOn": [
  {
    "target": "spec-write",
    "projects": ["server"]
  }
]
```
- ✅ **No project dependency needed**: `api-client` doesn't need to depend on `server` in workspace graph
- ✅ **Build-time only**: Dependency is for builds, not runtime
- ✅ **Clear intent**: Explicit reference shows why dependency exists

**Workspace-level tool installation:**
- ✅ **Available for all Nx commands**: No need to filter to specific package
- ✅ **Consistent versioning**: One version of `openapi-typescript` across workspace
- ✅ **Simpler scripts**: No pnpm filter needed in Nx targets

**ESM script with CommonJS require:**
- ✅ **Uses tsx**: Modern TypeScript execution
- ✅ **createRequire**: Load CommonJS built artifacts from ESM script
- ✅ **Works with Nx**: Compatible with Nx build outputs (CJS)

### When Adding New API Endpoints

**Automatic regeneration:**
```bash
# Build api-client (triggers entire chain automatically)
pnpm exec nx run api-client:build
```

**Manual regeneration (if needed):**
```bash
# Step 1: Generate spec artifact
pnpm exec nx run server:spec-write

# Step 2: Generate TypeScript types
pnpm exec nx run api-client:generate-types
```

**Using generated types:**
```typescript
import type { paths, components } from '@nx-monorepo/api-client/gen/openapi';

// Extract path operation types
type HealthCheckEndpoint = paths['/health']['get'];
type HealthCheckResponse = HealthCheckEndpoint['responses']['200']['content']['application/json'];

// Extract component schemas
type HealthCheck = components['schemas']['HealthCheckResponse'];

// Use in native fetch client (requires full HTTP path)
async function getHealth(): Promise<HealthCheckResponse> {
  const response = await fetch('/api/health');
  return response.json();
}

// Or with openapi-fetch (uses relative path + baseUrl)
// const client = createClient<paths>({ baseUrl: 'http://localhost:3001/api' })
// await client.GET('/health') // Resolves to /api/health automatically
```

### Dependencies Required

**Workspace root** (`package.json`):
```json
{
  "devDependencies": {
    "openapi-typescript": "^7.10.0",
    "tsx": "^4.19.2"
  }
}
```

**Server app** (`apps/server/package.json`):
```json
{
  "dependencies": {
    "@asteasolutions/zod-to-openapi": "^8.1.0",
    "openapi3-ts": "^4.5.0"
  }
}
```

**Note**: `openapi-typescript` is in workspace root devDependencies, NOT in api-client package.json.

### Anti-Patterns to Avoid

❌ **HTTP-based generation**:
```json
// WRONG - requires server to be running
{
  "command": "openapi-typescript http://localhost:3001/api/docs/openapi.json"
}
```

✅ **Correct - file-based**:
```json
// RIGHT - uses build artifact
{
  "command": "openapi-typescript ../../dist/apps/server/openapi.json"
}
```

❌ **Committing generated types**:
```bash
# WRONG - generated types in git
git add packages/api-client/src/gen/openapi.d.ts
```

✅ **Correct - gitignore generated types**:
```gitignore
# RIGHT - keep as build artifact
src/gen/
```

❌ **Implicit graph edge**:
```json
// WRONG - relies on workspace dependency
{
  "dependsOn": ["^build"]
}
```

✅ **Correct - explicit reference**:
```json
// RIGHT - clear cross-project dependency
{
  "dependsOn": [
    {
      "target": "spec-write",
      "projects": ["server"]
    }
  ]
}
```

❌ **Installing openapi-typescript in api-client package**:
```json
// WRONG - tool not available for Nx commands
// packages/api-client/package.json
{
  "devDependencies": {
    "openapi-typescript": "^7.10.0"
  }
}
```

✅ **Correct - workspace-level installation**:
```json
// RIGHT - available for all Nx targets
// package.json (workspace root)
{
  "devDependencies": {
    "openapi-typescript": "^7.10.0"
  }
}
```

❌ **Missing export-type flag**:
```bash
# WRONG - generates runtime code
openapi-typescript spec.json -o types.ts
```

✅ **Correct - type declarations only**:
```bash
# RIGHT - generates .d.ts file
openapi-typescript spec.json -o types.d.ts --export-type
```

### Maintenance

**When types are stale:**
```bash
# Clear Nx cache
pnpm exec nx reset

# Rebuild entire chain
pnpm exec nx run api-client:build
```

**Verify dependency chain:**
```bash
# View task graph
pnpm exec nx graph
```

**Debug spec generation:**
```bash
# Check spec artifact exists
ls dist/apps/server/openapi.json

# Validate spec format
cat dist/apps/server/openapi.json | jq .
```

**Debug type generation:**
```bash
# Check generated types
ls packages/api-client/src/gen/openapi.d.ts

# View generated types
cat packages/api-client/src/gen/openapi.d.ts
```

### Common Issues

**Issue**: `Cannot find module 'openapi-typescript'`
**Fix**: Install in workspace root, not in api-client package.json

**Issue**: Generated types missing after build
**Fix**: Verify `generate-types` is in build's `dependsOn` array

**Issue**: Stale types after server changes
**Fix**: Run `pnpm exec nx reset` to clear cache, then rebuild

**Issue**: `TS2307: Cannot find module '@nx-monorepo/api-client/gen/openapi'`
**Fix**: Run `pnpm exec nx run api-client:generate-types` to generate types

**Issue**: Spec write script can't find getOpenApiSpec
**Fix**: Ensure `server:build` completed successfully before `spec-write`

**Issue**: ESM/CommonJS module compatibility error
**Fix**: Use `createRequire` pattern in write-openapi.ts script

### Nx Affected Behavior

**Understanding Affected Detection:**

This pattern uses explicit dependency reference (`"dependsOn": ["server:spec-write"]`) rather than project-graph edges. This has important implications for `nx affected` commands.

**Expected Behavior:**

```bash
# Scenario 1: Server implementation change (no API contract change)
# Example: Update health check message string
nx affected -t build --base=main

# Result: api-client NOT in affected set ✅
# Rationale: Implementation changes don't affect the OpenAPI spec
```

```bash
# Scenario 2: API contract change (spec changes)
# Example: Add new endpoint or change response schema
nx run server:spec-write  # Generates new spec with different hash

# Result: generate-types cache invalidates → types regenerate ✅
# Rationale: Nx detects spec file changed, cache miss triggers regeneration
```

**Why This is Correct:**

- **Most server changes** don't affect the API contract (implementation details)
- **Only contract-breaking changes** require type regeneration
- **Nx caching automatically detects** when spec content changes via file hashing
- **No need for project-graph edge** - the dependency is on the build artifact, not the project

**Alternative Approach (Not Recommended):**

If you want api-client to ALWAYS rebuild when server changes (even without spec changes):

```json
// packages/api-client/project.json
{
  "implicitDependencies": ["server"]
}
```

**Why we don't use this:**
- Unnecessary rebuilds when server implementation changes without API changes
- Defeats the purpose of Nx's intelligent caching
- Current approach is more efficient and semantically correct

**For CI/CD Pipelines:**

Use `nx run-many` to build everything:
```bash
nx run-many -t build --projects=server,api-client
```

Or rely on build dependencies to cascade automatically:
```bash
nx run api-client:build  # Automatically runs server:spec-write first
```

### Last Validated

2025-10-24 (openapi-typescript 7.10.0, Nx 21.6, TypeScript 5.9, tsx 4.19.2)

**References**:
- openapi-typescript documentation: https://github.com/drwpow/openapi-typescript
- Task 4.1.8 execution notes
- Pattern 6 (OpenAPI Spec Generation) - prerequisite pattern

---

## How to Update This Document

When should you add a new pattern?

✅ **DO add** when:
- You discover a framework default that conflicts with our monorepo standards
- You solve a problem that will apply to multiple similar components
- You establish a new convention that should be followed consistently
- Generators create code that needs to be changed to fit our architecture

❌ **DON'T add** when:
- It's a one-time fix for a specific file
- It's already well-documented in official framework docs
- It's a personal preference, not a technical requirement
- It applies to only one component

**Update process:**
1. Document the pattern using the template in this file
2. Update `docs/memories/post-generation-checklist.md` if it's a post-generation step
3. Test the pattern with a new component to verify it works
4. Update `last-updated` date in frontmatter

---

## Pattern 8: Prisma Schema Conventions

**Our Standard**: Use PostgreSQL-specific types, snake_case plural table names, and disable RLS for API-secured applications

### Pattern

**Prisma Schema Configuration:**
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  // Supavisor connection pooler strategy:
  // - url: Transaction mode (port 6543) for queries
  // - directUrl: Session mode (port 5432) for migrations
}

generator client {
  provider = "prisma-client-js"
  // binaryTargets defaults to ["native"] for auto-detection
}

model HealthCheck {
  id        String   @id @default(uuid()) @db.Uuid
  message   String
  timestamp DateTime @default(now()) @db.Timestamptz

  @@map("health_checks")  // snake_case plural table names
}
```

**Key Conventions:**
- **Database types**: Use PostgreSQL-specific types (`@db.Uuid`, `@db.Timestamptz`)
- **Table naming**: snake_case plural (`health_checks`, not `HealthCheck` or `healthChecks`)
- **Connection**: Supavisor connection pooler (ports 6543 + 5432), `directUrl` required (updated 2025)
- **Binary targets**: Omit `binaryTargets` field to use implicit "native" (auto-detection)
- **RLS (Row Level Security)**: Enable for defense-in-depth on the API path (PostgREST). Prisma bypasses RLS via its SQL database role (superuser in Phase 1). The service_role key applies to PostgREST requests, not Prisma SQL connections.

### Applies To

All Prisma packages in the monorepo (currently `packages/database/`)

### Rationale

**PostgreSQL-specific types**:
- `@db.Uuid`: Ensures proper UUID validation at database level
- `@db.Timestamptz`: Timezone-aware timestamps, DST-safe

**snake_case plural table naming**:
- PostgreSQL convention (matches common practices)
- Explicit with `@@map()` prevents ambiguity
- Consistent with Supabase dashboard expectations

**Supavisor connection pooler strategy** (updated 2025):
- `url`: Transaction mode (port 6543) with connection pooling for better scalability
- `directUrl`: Session mode (port 5432) required for migrations
- Recommended by Supabase + Prisma official documentation (2025)
- See research: `specs/001-walking-skeleton/research-validation.md` - Agent 1 findings

**Implicit binaryTargets**:
- Prisma auto-detects platform ("native")
- Reduces bundle size
- Avoids version mismatch errors

**RLS enabled (scope clarified, updated 2025):**
- Defense-in-depth on API path: PostgREST calls with service_role bypass RLS
- Prisma path: bypass via SQL role (superuser in Phase 1), not via service_role
- Protects against accidental Data API exposure on the API path
- See research: `specs/001-walking-skeleton/research-validation.md`

### When Adding New Models

**Required actions:**
1. Use PostgreSQL-specific types (`@db.Uuid`, `@db.Timestamptz`, etc.)
2. Add `@@map("table_name")` with snake_case plural
3. Follow migration checklist (see post-generation-checklist.md)

**Validation:**
```bash
# Validate schema
npx prisma validate --schema=packages/database/prisma/schema.prisma

# Check generated migration
cat packages/database/prisma/migrations/*/migration.sql
```

### Last Validated

2025-10-27 (Prisma 6.17.1, Supabase PostgreSQL 15)

**References**:
- docs/architecture-decisions.md (Stage 4.2, Decision 4 - RLS strategy)
- docs_archive/research/stage-4.4a-research-findings.md (Track 1-3 research)
- packages/database/PLATFORM-NOTES.md (Windows ARM64 limitation)

---

## Pattern 9: Prisma Client Singleton

**Our Standard**: Use globalThis singleton pattern to prevent connection pool exhaustion in development hot-reload

### Pattern

**Prisma Client Singleton (`packages/database/src/lib/prisma-client.ts`):**
```typescript
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
```

**Export from package index (`packages/database/src/index.ts`):**
```typescript
export * from './lib/database.js';
export { prisma } from './lib/prisma-client.js';
```

### Applies To

All packages containing Prisma Client (`packages/database/` and any future database packages)

### Rationale

**Why globalThis singleton in development:**
- Next.js hot reload creates new module instances on every change
- Each new PrismaClient() creates a new connection pool
- Connection pools have limits (default: 10 connections)
- Hot reload without singleton exhausts connections quickly → "too many clients" errors

**Why fresh instances in production:**
- Production deployments don't have hot reload
- Fresh instance per deployment ensures clean state
- No memory leaks from persistent global variables

**Why this pattern over alternatives:**
- ✅ **Prisma official recommendation** for Next.js applications
- ✅ **Type-safe** with proper TypeScript declarations
- ✅ **Simple** - no complex dependency injection needed
- ✅ **Automatic** - works without manual initialization

**Alternatives rejected:**
- ❌ **No singleton**: Exhausts connection pool in development
- ❌ **Module-level singleton only**: Still creates new instances on hot reload
- ❌ **Class-based singleton**: More complex, same behavior
- ❌ **Dependency injection container**: Overkill for this use case

### When Adding New Database Packages

**Required actions:**
1. Create `src/lib/prisma-client.ts` with the singleton pattern
2. Export `prisma` from `src/index.ts`
3. Use `@nx/js:lib` with `--bundler=none` (see tech-findings-log.md)
4. Test hot reload behavior in development:
   ```bash
   # Start dev server
   pnpm exec nx dev web

   # Make changes and verify no "too many clients" errors
   # in server logs during hot reload
   ```

**Validation:**
```typescript
// Test import in consuming package
import { prisma } from '@nx-monorepo/database';

// Verify singleton behavior
const client1 = prisma;
const client2 = prisma;
console.assert(client1 === client2, 'Should be same instance');
```

### Last Validated

2025-10-27 (Prisma 6.17.1, Next.js 15.2, Node.js 22)

**References**:
- [Prisma Best Practices for Next.js](https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices)
- docs/memories/tech-findings-log.md (Database Package Bundler Strategy)
- packages/database/src/lib/prisma-client.ts (implementation)

---

## Pattern 10: Testing Enhancement Libraries (Mandatory)

**Our Standard**: UI packages MUST use jest-dom, user-event, and MSW for consistent, high-quality testing patterns

### Pattern

**Package Requirements by Type:**

| Package Type | jest-dom | user-event | MSW | Rationale |
|-------------|----------|------------|-----|-----------|
| **UI (web, future mobile)** | ✅ Required | ✅ Required | ✅ Required | Full testing stack for React components |
| **Node (server, APIs)** | ✅ Required | ❌ N/A | ⚠️ Conditional | Consistent assertions; MSW only if testing HTTP endpoints |
| **Pure Logic (schemas, utils)** | ❌ N/A | ❌ N/A | ❌ N/A | Basic Jest sufficient for logic tests |

**Installation (UI packages):**
```bash
pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
```

**Setup Files After Env (`apps/web/jest.config.ts`):**
```typescript
export default {
  // ... other config
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
```

**Jest Setup File (`apps/web/jest.setup.ts`):**
```typescript
import '@testing-library/jest-dom';
```

**Testing Standards:**

1. **Interactions**: Use `user-event` for ALL user interactions (clicks, typing, keyboard). NEVER use `fireEvent` directly.
   ```typescript
   // ✅ Correct
   await userEvent.click(screen.getByRole('button'));

   // ❌ Wrong
   fireEvent.click(screen.getByRole('button'));
   ```

2. **Assertions**: Use jest-dom matchers for semantic assertions
   ```typescript
   // ✅ Correct
   expect(element).toBeInTheDocument();
   expect(button).toBeDisabled();

   // ❌ Wrong
   expect(element).toBeTruthy();
   expect(button.disabled).toBe(true);
   ```

3. **API Mocking**: Use MSW 2.0 for ALL API mocking in component tests. No fetch mocks, no axios mocks.
   ```typescript
   // ✅ Correct (MSW 2.0 syntax)
   import { http, HttpResponse } from 'msw';  // Note: 'http' not 'rest', 'HttpResponse' not 'res'+'ctx'
   import { setupServer } from 'msw/node';

   // Define handlers
   const handlers = [
     http.get('/api/users', () => {
       return HttpResponse.json([  // HttpResponse.json() not res(ctx.json())
         { id: '1', name: 'Alice' },
         { id: '2', name: 'Bob' }
       ]);
     }),
     http.post('/api/users', async ({ request }) => {
       const body = await request.json();
       return HttpResponse.json(body, { status: 201 });  // Status in options
     }),
     // Error responses
     http.get('/api/error', () => {
       return HttpResponse.json(
         { error: 'Not found' },
         { status: 404 }
       );
     })
   ];

   // Create server
   const server = setupServer(...handlers);

   // Jest lifecycle hooks
   beforeAll(() => server.listen());
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());
   ```

   **MSW 2.0 Breaking Changes** (migrated from v1.x in 2024):
   - ❌ OLD: `import { rest } from 'msw'` → ✅ NEW: `import { http } from 'msw'`
   - ❌ OLD: `rest.get(url, (req, res, ctx) => res(ctx.json(data)))` → ✅ NEW: `http.get(url, () => HttpResponse.json(data))`
   - ❌ OLD: `res(ctx.status(404), ctx.json({...}))` → ✅ NEW: `HttpResponse.json({...}, { status: 404 })`
   - Handler signature: `({ request, params, cookies })` not `(req, res, ctx)`
   - Request body: `await request.json()` not `req.body`
   - No more `ctx.set()`, `ctx.delay()` - use HttpResponse options

4. **Test IDs**: Use `data-testid` ONLY when semantic queries fail. Prefer `getByRole`, `getByLabelText`, `getByText`.
   ```typescript
   // ✅ Correct (semantic query)
   screen.getByRole('button', { name: /submit/i });

   // ⚠️ Use only when semantic query impossible
   screen.getByTestId('custom-widget');
   ```

5. **Async Operations**: Always use `await` with user-event. Always use `findBy*` for elements appearing after async operations.
   ```typescript
   // ✅ Correct
   await userEvent.click(button);
   const result = await screen.findByText(/success/i);

   // ❌ Wrong
   userEvent.click(button); // Missing await
   const result = screen.getByText(/success/i); // Should be findBy for async
   ```

### Applies To

- **Mandatory**: All UI packages (web, future mobile apps)
- **Conditional**: Node packages with HTTP endpoint testing (server APIs)
- **Not Applicable**: Pure logic packages (schemas, utilities)

### Rationale

**Why mandatory for AI-driven development:**
- ✅ **Reduces AI decision overhead**: Eliminates "which testing approach?" questions on every test
- ✅ **Consistent test generation**: AI agents follow explicit patterns instead of making choices
- ✅ **Industry standard alignment**: React Testing Library official recommendations (2025)
- ✅ **Better test quality**: Semantic assertions, real user interactions, actual API contracts
- ✅ **Monorepo consistency**: All UI packages use identical testing patterns

**Why these specific libraries:**
- **jest-dom**: Semantic matchers provide better error messages for non-technical reviewers
- **user-event**: Simulates real browser interactions (click propagation, focus management)
- **MSW**: Tests actual HTTP contracts, not implementation details (fetch/axios internals)

**Why package-type conditionals:**
- **UI packages**: Need full stack (DOM assertions, user interactions, API mocking)
- **Node packages**: Need consistent assertions (jest-dom) but not browser interactions
- **Logic packages**: Complex patterns would be overkill for pure function tests

**Research validation:**
- All patterns verified as 2025 React best practices (Context7 MCP)
- Used in official React Testing Library examples
- Next.js official testing guide includes these by default
- AI agent testing standardization (AGENTS.md research, 2025)

### When Adding New Projects

**UI Packages (web, mobile):**

1. Install testing enhancements:
   ```bash
   pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
   ```

2. Create `jest.setup.ts`:
   ```typescript
   import '@testing-library/jest-dom';
   ```

3. Update `jest.config.ts`:
   ```typescript
   export default {
     // ... existing config
     setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
   };
   ```

4. Verify setup:
   ```bash
   pnpm exec nx run <project>:test
   ```

**Node Packages (conditional MSW):**

Only install MSW if package tests HTTP endpoints:
```bash
pnpm add --save-dev @testing-library/jest-dom msw
```

**Logic Packages:**

No testing enhancements needed - use basic Jest.

### Implementation Reference

For detailed setup instructions, API documentation, and examples:
- **Setup guide**: `docs/guides/testing-enhancements.md`
- **Baseline config**: `docs/memories/testing-reference.md`
- **Post-generation**: `docs/memories/post-generation-checklist.md`

### Last Validated

2025-10-28 (React Testing Library 15.0.0, user-event 14.5.0, jest-dom 6.6.3, MSW 2.0.0)

**References**:
- React Testing Library documentation (official patterns)
- Next.js testing guide (includes these by default)
- Testing patterns research (2025-10-28 Context7/Exa validation)
- AI-driven development best practices (AGENTS.md standard)

---

## Pattern Template

Use this template when adding new patterns:

```markdown
## Pattern N: [Pattern Name]

**Our Standard**: [One-sentence description]

### Pattern

[Code examples and configuration]

### Applies To

[Which apps/packages this affects]

### Rationale

[Why we chose this approach]
[What problem it solves]
[What alternatives we rejected]

### When Adding New [Components]

**⚠️ Generators may [what they do wrong]:**
[List of issues]

**Required action:**
1. [Step by step fixes]

### Last Validated

[Date] ([Relevant tool versions])

**Reference**: [Link to related docs if applicable]
```
