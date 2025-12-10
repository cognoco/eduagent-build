## Pattern 13: Database Environment Management

**Our Standard**: Use dotenv-cli with environment-specific .env files for Prisma CLI commands

### Pattern

**Environment Files Structure:**
```
.env.development.local   # DEV Supabase - for local development (gitignored)
.env.test.local          # STAGING Supabase - loaded when NODE_ENV=test (gitignored)
.env.example             # Template for new developers (committed)
```

> **Naming Convention**: File names follow `NODE_ENV`, not database environment.
> `.env.test.local` connects to STAGING because tests run with `NODE_ENV=test`.

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
      `See: docs/project-config/supabase.md`
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
        `See: docs/project-config/supabase.md`
    );
  }

  config({ path: envPath });
  // Silent mode - no console output during tests
} catch (error) {
  console.error('❌ Failed to load environment variables for tests:');
  console.error(error.message);
  console.error('\nTests cannot run without environment configuration.');
  console.error('See: docs/project-config/supabase.md\n');
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
- docs/project-config/supabase.md (comprehensive Supabase configuration and environment setup)
- Research conducted: 2025-11-03 with 4 parallel research agents (Prisma patterns, dotenv-cli, Nx integration, Next.js community practices)

---
