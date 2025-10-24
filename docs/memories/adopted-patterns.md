---
title: Adopted Patterns
purpose: Monorepo-specific standards that override framework defaults
audience: AI agents, developers
created: 2025-10-21
last-updated: 2025-10-24
Created: 2025-10-21T14:39
Modified: 2025-10-24T14:14
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
- **Final path**: `/api/health`

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
