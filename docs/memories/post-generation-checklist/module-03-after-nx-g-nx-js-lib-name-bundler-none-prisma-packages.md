## After: `nx g @nx/js:lib <name> --bundler=none` (Prisma packages)

### Issue
Packages containing Prisma require special setup that generators can't automate.

### Required Actions

**1. Install Prisma dependencies**

```bash
pnpm add -D prisma --filter @nx-monorepo/<package-name>
pnpm add @prisma/client --filter @nx-monorepo/<package-name>
```

**2. Create Prisma directory structure**

```bash
mkdir -p packages/<package-name>/prisma
```

**3. Initialize Prisma schema**

Create `packages/<package-name>/prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Add your models here
```

**4. Verify NO build target exists**

```bash
pnpm exec nx show project <package-name>
```

Should NOT show a `build` target (this is correct with `--bundler=none`).

**5. Generate Prisma client**

```bash
pnpm --filter @nx-monorepo/<package-name> prisma generate
```

### Validation

Verify package can be imported by dependent projects:
```bash
pnpm exec nx run-many -t build --projects=tag:type:app
```

### Why This Matters

Prisma generates code at runtime (`prisma generate`), not build time. Using `--bundler=tsc` or other bundlers breaks Prisma client imports due to path resolution issues.

**Reference**: `docs/memories/tech-findings-log.md` - "Database Package Bundler Strategy"

---
