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
