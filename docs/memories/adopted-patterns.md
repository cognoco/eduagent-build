---
title: Adopted Patterns
purpose: Monorepo-specific standards that override framework defaults
audience: AI agents, developers
created: 2025-10-21
last-updated: 2025-11-06
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
// const client = createClient<paths>({ baseUrl: 'http://localhost:4000/api' })
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
  "command": "openapi-typescript http://localhost:4000/api/docs/openapi.json"
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

## Pattern 11: Format Check Target Configuration

**Our Standard**: Explicit `format:check` target in all project.json files to enable consistent formatting validation across the monorepo

### Pattern

**All projects must include a format:check target:**

```json
{
  "targets": {
    "format:check": {}
  }
}
```

The empty object `{}` inherits all configuration from `targetDefaults.format:check` in `nx.json`:
- Executor: `nx:run-commands`
- Command: `prettier --check "{projectRoot}/**/*.{ts,tsx,js,jsx,json,css,scss,html}"`
- Cache: `true`
- Inputs: `["default", "{workspaceRoot}/.prettierrc", "{workspaceRoot}/.prettierignore"]`

**TargetDefaults Configuration (`nx.json`):**

```json
{
  "targetDefaults": {
    "format:check": {
      "cache": true,
      "inputs": [
        "default",
        "{workspaceRoot}/.prettierrc",
        "{workspaceRoot}/.prettierignore"
      ],
      "executor": "nx:run-commands",
      "options": {
        "command": "prettier --check \"{projectRoot}/**/*.{ts,tsx,js,jsx,json,css,scss,html}\""
      }
    }
  }
}
```

### Applies To

All apps and packages (web, server, web-e2e, database, schemas, api-client, supabase-client)

### Rationale

**Why explicit targets are needed:**
- Unlike `lint`, `test`, and `typecheck`, **no Nx plugin exists for Prettier/formatting**
- Nx plugins (`@nx/eslint/plugin`, `@nx/jest/plugin`, `@nx/js/typescript`) auto-infer targets from config files
- Prettier has `@nx/js:setup-prettier` generator (one-time setup) but no plugin to infer targets
- Without a plugin, projects must explicitly declare targets to use `targetDefaults` configuration
- Empty target object `{}` is sufficient—all behavior comes from `targetDefaults`

**Benefits:**
- Enables `nx run-many -t format:check` across all projects
- Enables `nx affected -t format:check` for CI optimization
- Centralized configuration in `nx.json` (DRY principle)
- Consistent formatting verification across monorepo
- Integrates with Nx caching and task orchestration
- Per-project caching (unlike `nx format:check --all` workspace command)

**Architectural consistency:**
- All quality checks (`lint`, `test`, `typecheck`, `format:check`) work the same way
- Predictable developer experience: `nx run-many -t lint test typecheck format:check`
- Task graph integration: formatting becomes part of project dependency graphs
- Future-proof: Pattern scales as monorepo grows

### Relationship to Other Targets

| Target | Configuration Source | Nx Plugin | Requires project.json? |
|--------|---------------------|-----------|----------------------|
| `lint` | `eslint.config.mjs` | `@nx/eslint/plugin` | No (inferred) |
| `test` | `jest.config.ts` | `@nx/jest/plugin` | No (inferred) |
| `typecheck` | `tsconfig.json` | `@nx/js/typescript` | No (inferred) |
| `format:check` | `.prettierrc` | **None** | **Yes (explicit)** |

**Why this inconsistency exists:**
- Nx ecosystem decision: Prettier integration handled via CLI commands, not plugin
- Built-in `nx format:check` and `nx format:write` work at workspace level
- Per-project targets require manual configuration
- **Our choice**: Consistency over convenience—all quality checks should be per-project

### When Adding New Projects

**⚠️ Required action after project generation:**

1. **Create `project.json` if it doesn't exist**

   For applications:
   ```json
   {
     "name": "@nx-monorepo/<project>",
     "$schema": "../../node_modules/nx/schemas/project-schema.json",
     "sourceRoot": "apps/<project>/src",
     "projectType": "application",
     "targets": {
       "format:check": {}
     }
   }
   ```

   For libraries:
   ```json
   {
     "name": "@nx-monorepo/<project>",
     "$schema": "../../node_modules/nx/schemas/project-schema.json",
     "sourceRoot": "packages/<project>/src",
     "projectType": "library",
     "targets": {
       "format:check": {}
     }
   }
   ```

2. **Add `format:check` target to existing `project.json`**

   If the project already has a `project.json` file:
   ```json
   {
     "targets": {
       // ... existing targets ...
       "format:check": {}
     }
   }
   ```

3. **Verify target works**

   ```bash
   pnpm exec nx run <project>:format:check
   ```

4. **Verify affected detection**

   ```bash
   pnpm exec nx affected -t format:check --base=main
   ```

**Why this pattern scales:**
- New projects automatically inherit formatting rules from `targetDefaults`
- One-time setup per project (add target entry)
- Configuration changes happen centrally in `nx.json`
- Pattern is documented and easy to teach to AI agents

### Alternative Approach (Not Recommended)

**Workspace-level commands** (`nx format:check --all`):
- ✅ Simpler (no per-project configuration)
- ✅ Official Nx recommendation
- ❌ Inconsistent with other quality checks
- ❌ Cannot use with `nx run-many -t format:check`
- ❌ Cannot use with `nx affected -t format:check`
- ❌ No per-project caching
- ❌ Not integrated into task graphs

**Our decision**: Gold standard template prioritizes consistency over convenience.

### Troubleshooting

**Issue**: `nx run-many -t format:check` returns "No tasks were run"
**Fix**: Verify all projects have `"format:check": {}` in their `targets` section

**Issue**: Format check doesn't find generated files to ignore
**Fix**: Update `.prettierignore` to exclude build artifacts (`**/dist`, `**/out-tsc`, `**/gen`)

**Issue**: Format check runs even though `.prettierignore` updated
**Fix**: Nx caches results—run `pnpm exec nx reset` to clear cache

**Issue**: New project missing format:check target
**Fix**: Follow "When Adding New Projects" steps above

### Last Validated

2025-11-03 (Nx 21.6, Prettier 3.x)

**References**:
- Nx format commands: https://nx.dev/nx-api/nx/documents/format-check
- Nx targetDefaults: https://nx.dev/reference/nx-json#target-defaults
- docs/memories/post-generation-checklist.md (format:check checklist)
- Research validation: 2025-11-03 Context7/Nx MCP investigation

---

## Pattern 12: Windows Jest Hanging - Per-Project Environment Variables

**Our Standard**: When Jest tests hang on Windows, add `NX_DAEMON=false` to the project's test target environment configuration (not globally).

### Pattern

**Problem**: On Windows, Jest tests may hang indefinitely with messages like:
- "Jest did not exit one second after the test run"
- Terminal shows "Terminate batch job (Y/N)?"

**Solution**: Add environment variable to the specific project's test target in `project.json`:

```json
{
  "name": "@nx-monorepo/web",
  "targets": {
    "test": {
      "options": {
        "env": {
          "NX_DAEMON": "false"
        }
      }
    }
  }
}
```

**How it works**:
- Uses Nx's native `env` option in target configuration
- Merges with inferred configuration from `@nx/jest/plugin`
- Automatically applies to all test invocations (manual, npm scripts, hooks)
- Does not affect other targets (build, serve, lint)

### Applies To

- **Confirmed**: `@nx-monorepo/web` (Next.js app)
- **Apply as needed**: Any project experiencing Windows Jest hanging

**Do NOT apply preemptively** - Only add when the problem manifests in a specific project.

### Rationale

**Why per-project configuration?**
1. **Surgical fix** - Only affects projects that exhibit the problem
2. **Documented pattern** - Other developers know how to fix if it happens elsewhere
3. **Nx-native approach** - Uses official, documented Nx functionality
4. **No platform detection needed** - Configuration is declarative and version-controlled

**Why not global targetDefaults?**
- Would disable daemon for ALL projects on ALL platforms
- Penalizes projects that don't have the issue
- Not aligned with "fix where broken" philosophy

**Why not wrapper scripts?**
- Adds indirection and maintenance burden
- Less discoverable than configuration in project.json
- Requires platform detection logic

**Why not .env files?**
- Requires manual setup by each developer
- Reactive (discover after problem) rather than proactive
- Easy to forget when switching machines

**Relationship to pre-commit hooks**:
- Pre-commit hook already uses `NX_DAEMON=false` globally (see `.husky/pre-commit`)
- This pattern fixes **manual test runs** (`nx run web:test`)
- Ensures consistent behavior across all execution contexts

### When Adding New Projects

**If Jest tests hang on Windows:**

1. **Verify the symptom**:
   ```bash
   pnpm exec nx run <project>:test
   # Hangs at "Test Suites: X passed, X total"
   ```

2. **Add environment variable** to `<project>/project.json`:
   ```json
   {
     "targets": {
       "test": {
         "options": {
           "env": {
             "NX_DAEMON": "false"
           }
         }
       }
     }
   }
   ```

3. **Verify the fix**:
   ```bash
   pnpm exec nx run <project>:test
   # Should complete without hanging
   ```

4. **Document** in project README or comments why this is needed

**Do NOT**:
- ❌ Add to nx.json targetDefaults (affects all projects)
- ❌ Add preemptively to projects that work fine
- ❌ Use wrapper scripts or platform detection for this issue

### Troubleshooting

**If adding env doesn't work:**
1. Check Nx version supports `env` in `nx:run-commands` executor (Nx 15+)
2. Try manual workaround: `NX_DAEMON=false pnpm exec nx run <project>:test`
3. Check for other Jest configuration issues (see troubleshooting.md)

**If problem spreads to other projects:**
- Apply the same pattern to each affected project
- Document in project-specific README
- Consider if there's a deeper root cause (Nx version bug, Jest config issue)

### Last Validated

2025-11-03 (Nx 21.6, Jest 30, Windows 11)

**References**:
- Nx env option: https://nx.dev/nx-api/nx/executors/run-commands#env
- docs/memories/troubleshooting.md - "Jest Exits Slowly or Hangs (Windows)"
- AGENTS.md - "Jest & Testing Configuration" section
- Research validation: 2025-11-03 (Sub-agent analysis of 5 approaches)

---

## Pattern 13: Database Environment Management

**Our Standard**: Use dotenv-cli with environment-specific .env files for Prisma CLI commands

### Pattern

**Environment Files Structure:**
```
.env.development.local   # Development database credentials (gitignored)
.env.test.local          # Test database credentials (gitignored)
.env.example             # Template for new developers (committed)
```

**Database Command Scripts** (`package.json`):
```json
{
  "scripts": {
    "db:push:dev": "dotenv -e .env.development.local -- npx prisma db push --schema=packages/database/prisma/schema.prisma",
    "db:push:test": "dotenv -e .env.test.local -- npx prisma db push --schema=packages/database/prisma/schema.prisma",
    "db:migrate:dev": "dotenv -e .env.development.local -- npx prisma migrate dev --schema=packages/database/prisma/schema.prisma",
    "db:migrate:test": "dotenv -e .env.test.local -- npx prisma migrate dev --schema=packages/database/prisma/schema.prisma",
    "db:migrate:deploy:dev": "dotenv -e .env.development.local -- npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma",
    "db:migrate:deploy:test": "dotenv -e .env.test.local -- npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma",
    "db:studio:dev": "dotenv -e .env.development.local -- npx prisma studio --schema=packages/database/prisma/schema.prisma",
    "db:studio:test": "dotenv -e .env.test.local -- npx prisma studio --schema=packages/database/prisma/schema.prisma",
    "db:generate": "dotenv -e .env.development.local -- npx prisma generate --schema=packages/database/prisma/schema.prisma"
  }
}
```

**Application Runtime Loading** (`apps/server/src/main.ts`):
```typescript
// Load environment variables FIRST, before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

const env = process.env.NODE_ENV || 'development';
const envFile = `.env.${env}.local`;
const envPath = resolve(process.cwd(), envFile);

if (!existsSync(envPath)) {
  throw new Error(
    `Environment file not found: ${envFile}\n` +
      `Expected location: ${envPath}\n` +
      `See: docs/environment-setup.md`
  );
}

config({ path: envPath });
console.log(`✅ Loaded environment variables from: ${envFile}`);

// Now import other modules that need env vars
import { createApp } from './app.js';
```

**Jest Test Setup** (`jest.setup.js`):
```javascript
const { config } = require('dotenv');
const { resolve } = require('path');
const { existsSync } = require('fs');

try {
  const env = process.env.NODE_ENV || 'development';
  const envFile = `.env.${env}.local`;
  const envPath = resolve(process.cwd(), envFile);

  if (!existsSync(envPath)) {
    throw new Error(
      `Environment file not found: ${envFile}\n` +
        `Expected location: ${envPath}\n` +
        `See: docs/environment-setup.md`
    );
  }

  config({ path: envPath });
  // Silent mode - no console output during tests
} catch (error) {
  console.error('❌ Failed to load environment variables for tests:');
  console.error(error.message);
  console.error('\nTests cannot run without environment configuration.');
  console.error('See: docs/environment-setup.md\n');
  process.exit(1);
}
```

### Applies To

All Prisma-based database packages and applications that need multi-environment database support

### Rationale

**Why dotenv-cli:**
- ✅ **Officially recommended** by Prisma documentation for multi-environment setups
- ✅ **Industry standard** pattern used by Next.js, Nx, and Prisma communities
- ✅ **Explicit file selection**: Prisma CLI loads `.env` by default and ignores NODE_ENV; dotenv-cli explicitly specifies which file to load
- ✅ **Minimal complexity**: Simple CLI wrapper, no custom scripts or configuration needed
- ✅ **Excellent security posture**: Credentials remain in gitignored files, never in code or config

**Problem it solves:**
- Prisma CLI has its own .env loading mechanism separate from Node.js/Nx
- Prisma CLI loads `.env` from root directory by default
- Prisma CLI does NOT respect NODE_ENV or load environment-specific files automatically
- Without dotenv-cli, developers must manually manage which .env file is active (error-prone)

**Alternatives considered and rejected:**

1. **Nx-native environment configuration** (rejected):
   - ❌ Would require credentials in `project.json` or `nx.json` (security risk)
   - ❌ Not compatible with Prisma's .env file expectations
   - ❌ Does not work with Prisma CLI commands

2. **Shell scripts with inline variables** (rejected):
   - ❌ Major security risk (credentials visible in process list)
   - ❌ Platform-specific (different syntax for Windows/Linux)
   - ❌ Not officially documented by Prisma

3. **Symbolic link strategy** (rejected):
   - ❌ Stateful (must remember to switch links)
   - ❌ Error-prone (easy to run against wrong database)
   - ❌ Manual process (no automation)

4. **Keep .env as development default** (rejected):
   - ❌ Inconsistent pattern (dev implicit, test explicit)
   - ❌ Still requires dotenv-cli for test environment
   - ❌ Less explicit than environment-specific scripts

5. **dotenvx (modern alternative)** (considered but not chosen):
   - ✅ Modern, feature-rich alternative to dotenv-cli
   - ✅ Supports encryption, multiple environments
   - ❌ Less documentation, newer tool (less battle-tested)
   - ❌ Not specifically mentioned in Prisma docs
   - **Decision**: Chose dotenv-cli for alignment with official Prisma documentation

**2-environment architecture:**
- Development: Existing Supabase project (`pjbnwtsufqpgsdlxydbo` in ZIX-DEV org)
- Test: New Supabase project (`uvhnqtzufwvaqvbdgcnn` in ZIX-DEV org)
- Production: Deferred until needed (Supabase free tier limit: 2 projects per user)

**Runtime vs. CLI loading:**
- **Application runtime** (Express, Jest): Inline dotenv loading in entry points
- **Prisma CLI**: dotenv-cli wrapper in npm scripts
- **Why both?**: Different execution contexts require different loading mechanisms

### When Working with Database Commands

**Always use npm scripts, never raw Prisma commands:**

```bash
# ✅ Correct - uses environment-specific credentials
pnpm run db:push:dev          # Push schema to development
pnpm run db:push:test         # Push schema to test
pnpm run db:migrate:dev       # Create migration in development
pnpm run db:migrate:deploy:dev # Apply migrations to development
pnpm run db:studio:dev        # Open Prisma Studio for development

# ❌ Wrong - loads default .env (if it exists) or fails
npx prisma db push
npx prisma migrate dev
```

**Why always use scripts:**
- Ensures correct environment credentials are loaded
- Prevents accidental operations on wrong database
- Self-documenting (script names clearly show which environment)
- Consistent team workflow

### Dependencies Required

**Workspace root** (`package.json`):
```json
{
  "dependencies": {
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "dotenv-cli": "^11.0.0"
  }
}
```

**Why dotenv in dependencies:**
- Used in application runtime code (`apps/server/src/main.ts`)
- Needed in production deployments

**Why dotenv-cli in devDependencies:**
- Only used during development for Prisma CLI commands
- Not needed in production (environment variables provided by platform)

### Anti-Patterns to Avoid

❌ **Running Prisma commands without dotenv-cli**:
```bash
# WRONG - may load wrong .env or fail
npx prisma db push
```

✅ **Correct - use npm scripts**:
```bash
# RIGHT - loads correct environment
pnpm run db:push:dev
```

❌ **Creating .env file alongside .env.*.local files**:
```bash
# WRONG - causes confusion about which file is used
touch .env
```

✅ **Correct - only environment-specific files**:
```bash
# RIGHT - explicit environment selection
ls .env.*.local
# .env.development.local  .env.test.local
```

❌ **Committing environment files with credentials**:
```bash
# WRONG - credentials in git
git add .env.development.local
```

✅ **Correct - only commit example file**:
```bash
# RIGHT - template without credentials
git add .env.example
```

❌ **Using NODE_ENV without dotenv-cli for Prisma**:
```bash
# WRONG - Prisma CLI ignores NODE_ENV
NODE_ENV=test npx prisma db push
```

✅ **Correct - explicit file with dotenv-cli**:
```bash
# RIGHT - dotenv-cli explicitly loads file
pnpm run db:push:test
```

### Troubleshooting

**Issue**: Prisma command fails with "Environment variable not found: DATABASE_URL"
**Fix**: Verify `.env.*.local` file exists and contains DATABASE_URL. Use npm scripts, not raw Prisma commands.

**Issue**: Prisma connects to wrong database
**Fix**: Delete any `.env` or `.env.local` files in root directory. Only keep `.env.*.local` files.

**Issue**: Application starts but can't connect to database
**Fix**: Verify inline dotenv loading happens BEFORE any imports that use Prisma client.

**Issue**: Tests fail with database connection errors
**Fix**: Verify `jest.setup.js` is loaded via `setupFiles` in `jest.preset.js`.

### Last Validated

2025-11-03 (Prisma 6.17.1, dotenv 16.4.5, dotenv-cli 11.0.0, Supabase PostgreSQL 15)

**References**:
- [Prisma Multi-Environment Guide](https://www.prisma.io/docs/orm/more/development-environment/environment-variables/using-multiple-env-files)
- docs/environment-setup.md (comprehensive environment configuration guide)
- docs/supabase-projects.md (Supabase project credentials)
- Research conducted: 2025-11-03 with 4 parallel research agents (Prisma patterns, dotenv-cli, Nx integration, Next.js community practices)

---

## Pattern 14: Migration Management and Rollback

**Our Standard**: Use `prisma migrate deploy` for production-safe migrations; manual rollback process documented

### Pattern

**Migration Application** (Forward):
```bash
# Development database
pnpm run db:migrate:deploy:dev

# Test database
pnpm run db:migrate:deploy:test

# Production database (future)
pnpm run db:migrate:deploy:prod
```

**Migration Rollback** (Manual Process):

Prisma does not have a built-in rollback command. To revert a migration:

1. **Identify the migration to rollback**:
   ```bash
   # List all migrations
   ls packages/database/prisma/migrations/
   ```

2. **Create a new migration that reverses the changes**:
   ```bash
   # For development (creates new migration)
   pnpm run db:migrate:dev

   # Manually edit the generated migration.sql to reverse the schema changes
   # Example: If migration added a table, the rollback drops that table
   ```

3. **Example rollback migration**:
   ```sql
   -- Rollback for: 20251027072808_create_health_check
   -- This migration would drop the table created by that migration
   DROP TABLE IF EXISTS "health_checks";
   ```

4. **Apply the rollback migration**:
   ```bash
   pnpm run db:migrate:deploy:dev    # Apply to development
   pnpm run db:migrate:deploy:test   # Apply to test
   ```

**Best Practices**:

- **Never rollback in production** unless absolutely necessary - prefer forward-only migrations
- **Test rollback locally first** - Always test on development/test databases before production
- **Data loss warning** - Rollbacks that drop columns/tables will permanently delete data
- **Migration naming** - Name rollback migrations clearly: `20251104_rollback_health_check`
- **Version control** - Commit rollback migrations to git like any other migration
- **Database backups** - Always backup production database before applying any migration or rollback

**Emergency Rollback** (Production):

If a production migration causes critical issues:

1. **Backup the database immediately**:
   ```bash
   # Via Supabase dashboard: Database > Backups > Create backup
   ```

2. **Create and test rollback migration locally**:
   ```bash
   # On local dev database
   pnpm run db:migrate:dev  # Create rollback migration
   # Edit migration.sql to reverse changes
   pnpm run db:migrate:deploy:dev  # Test locally
   ```

3. **Apply to test database**:
   ```bash
   pnpm run db:migrate:deploy:test  # Verify on test
   ```

4. **Apply to production** (only after local + test verification):
   ```bash
   pnpm run db:migrate:deploy:prod
   ```

### Applies To

All environments (development, test, production) and all Prisma-managed databases

### Rationale

**Why `migrate deploy` instead of `migrate dev`:**
- `migrate deploy` is production-safe (non-interactive, fails on conflicts)
- `migrate dev` is interactive and can make assumptions (not safe for CI/CD)
- Aligns with Prisma's recommended deployment workflow

**Why manual rollback process:**
- Prisma philosophy: forward-only migrations are safer
- Rollbacks risk data loss and schema inconsistencies
- Manual process forces deliberate review of rollback safety
- Industry standard: Django, Rails, Laravel all use manual rollbacks

**Why document emergency procedures:**
- Production incidents require clear, tested procedures
- Reduces panic-driven mistakes during outages
- Ensures rollbacks are tested before production application

### When Adding New Migrations

**⚠️ Common migration pitfalls:**
- Forgetting to test rollback procedures locally
- Not considering data migration during rollback
- Applying migrations directly to production without testing
- Not backing up production database before migrations

**Required workflow:**
1. Create migration on development database
2. Test forward migration on dev/test
3. Create and test rollback migration on dev/test
4. Verify data integrity after rollback
5. Only then apply to production (if applicable)

### Last Validated

2025-11-04 (Prisma 6.17.1, Supabase PostgreSQL 15)

**References**:
- [Prisma Migration Deployment Guide](https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-troubleshooting)
- [Prisma Migrate Deploy Documentation](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy)
- docs/environment-setup.md - Environment-specific migration commands
- Pattern 13 (this document) - Database environment management

---

## Pattern 15: Per-Project Jest Setup Files (Principle of Least Privilege)

**Our Standard**: Projects load environment variables only when needed via per-project `setupFiles` configuration

### Pattern

**Test utilities package (`@nx-monorepo/test-utils`):**
```typescript
// packages/test-utils/src/lib/load-database-env.ts
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

export function loadDatabaseEnv(workspaceRoot: string): void {
  // If DATABASE_URL already exists (CI, Docker, cloud platforms), skip file loading
  if (process.env.DATABASE_URL) {
    console.log('✅ DATABASE_URL already set (CI or pre-configured environment)');
    return;
  }

  // Otherwise, load from .env file (local development)
  try {
    const env = process.env.NODE_ENV || 'development';
    const envFile = `.env.${env}.local`;
    const envPath = resolve(workspaceRoot, envFile);

    if (!existsSync(envPath)) {
      throw new Error(`Environment file not found: ${envFile}\nSee: docs/environment-setup.md`);
    }

    config({ path: envPath });
    console.log(`✅ Loaded environment variables from: ${envFile}`);
  } catch (error) {
    console.error('❌ Failed to load environment variables for tests');
    process.exit(1);
  }
}
```

**Per-project setup file (database package example):**
```typescript
// packages/database/jest.setup.ts
import { loadDatabaseEnv } from '@nx-monorepo/test-utils';
import { resolve } from 'path';

// __dirname = packages/database, so ../.. = workspace root
loadDatabaseEnv(resolve(__dirname, '../..'));
```

**Per-project Jest configuration:**
```javascript
// packages/database/jest.config.cjs
const { join } = require('path');

module.exports = {
  displayName: '@nx-monorepo/database',
  preset: '../../jest.preset.js',
  setupFiles: [join(__dirname, 'jest.setup.ts')],  // ← Add this line only
  // ... preserve ALL other existing configuration
};
```

**Workspace-level preset (clean):**
```javascript
// jest.preset.js
const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  // NO setupFiles here - projects configure their own
};
```

### Applies To

**Projects that NEED database credentials:**
- `packages/database` - Direct Prisma access
- `apps/server` - Uses database package for integration tests

**Projects that should NOT have credentials:**
- `packages/schemas` - Pure validation logic
- `packages/api-client` - REST client (mocked in tests)
- `packages/supabase-client` - Client wrapper (no direct DB access)
- `apps/web` - Frontend (uses API client)
- Future mobile app - Frontend (uses API client)

### Rationale

**Security (Principle of Least Privilege):**
- Loading `DATABASE_URL` for all 7+ projects violates PoLP
- Frontend packages should never have direct database credentials
- Limits blast radius if credentials leak from test logs/artifacts

**Architectural clarity:**
- Makes dependencies explicit (database package needs credentials, schemas don't)
- Prevents accidental direct database access from non-database packages
- Enforces proper architectural boundaries (use API client, not direct DB)

**Rejected alternatives:**
1. **Workspace-level setupFiles (original approach)** - Violates PoLP, gives credentials to all projects
2. **Conditional loading in workspace setup** - Still exposes credentials, just doesn't fail; violates PoLP
3. **Duplicate code in each project** - Code duplication, harder to maintain

**Why shared utility package:**
- DRY principle - single source of truth for environment loading logic
- Consistent error messages across projects
- Preserves `__dirname` pattern (prevents process.cwd() bugs)
- Easy to extend if more setup utilities needed

### When Adding New Projects

**⚠️ Default behavior after nx g:**
- New projects inherit workspace preset
- Workspace preset does NOT load environment variables (clean state)
- Projects must explicitly opt-in to loading credentials

**For projects that need database credentials:**

1. **Add test-utils dependency:**
```bash
# In project package.json
{
  "devDependencies": {
    "@nx-monorepo/test-utils": "workspace:*"
  }
}
```

2. **Create per-project setup file:**
```typescript
// <project>/jest.setup.ts
import { loadDatabaseEnv } from '@nx-monorepo/test-utils';
import { resolve } from 'path';

loadDatabaseEnv(resolve(__dirname, '../..'));
```

3. **Update Jest configuration:**
```javascript
// <project>/jest.config.cjs (or .ts)
const { join } = require('path');

module.exports = {
  // ... existing config
  setupFiles: [join(__dirname, 'jest.setup.ts')],  // ← Add this line
  // ... preserve ALL other settings (transform, testEnvironment, etc.)
};
```

4. **Run pnpm install and nx sync:**
```bash
pnpm install
pnpm exec nx sync
```

5. **Verify tests pass:**
```bash
pnpm exec nx run <project>:test
```

**For projects that DON'T need database credentials:**
- No action required
- Tests run without environment variables (correct behavior)

### Last Validated

2025-11-05 (Nx 21.6, Jest 30, Node 22)

**References:**
- GitHub Issue #22 - Original security concern
- Pattern 13 (this document) - Database environment management
- `docs/memories/tech-findings-log.md` - "Per-Project Jest Setup Files" entry
- `docs/memories/testing-reference.md` - Jest configuration guidelines

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
