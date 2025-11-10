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
