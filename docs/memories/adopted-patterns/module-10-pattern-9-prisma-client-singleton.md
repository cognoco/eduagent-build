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
