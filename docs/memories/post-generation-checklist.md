---
title: Post-Generation Checklist
purpose: Mandatory steps after running Nx generators
audience: AI agents, developers
created: 2025-10-21
last-updated: 2025-10-21
Created: 2025-10-21T14:40
Modified: 2025-10-21T17:57
---

# Post-Generation Checklist

## Purpose

This document contains **mandatory steps** that must be executed immediately after running Nx generators. These steps fix known discrepancies between generator defaults and our monorepo's adopted patterns.

**⚠️ CRITICAL**: Skipping these steps causes pattern drift across components.

---

## After: `nx g @nx/jest:configuration <project>`

### Issue
Nx generator creates `tsconfig.spec.json` with outdated TypeScript module resolution settings that are incompatible with our workspace configuration.

### Required Actions

**1. Update TypeScript module resolution**

File: `<project>/tsconfig.spec.json`

Change:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node10"
  }
}
```

To:
```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
}
```

**2. Verify Jest types are included**

File: `<project>/tsconfig.spec.json`

Ensure types array exists:
```json
{
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

**3. Verify production config is clean**

File: `<project>/tsconfig.json`

Ensure production config does NOT include jest types:
```json
{
  "compilerOptions": {
    "types": []  // Should be empty or exclude "jest"
  }
}
```

### Validation

Run tests to verify configuration works:
```bash
pnpm exec nx run <project>:test
```

### Why This Matters

Our workspace uses `customConditions` in `tsconfig.base.json`, which requires modern module resolution (`nodenext`). The generator's default (`node10`) causes TypeScript compilation errors.

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 2

---

## After: `nx g @nx/js:lib <name>` or `nx g @nx/react:app <name>`

### Issue
Generators may create test directories that don't match our adopted pattern (co-located tests in `src/`).

### Required Actions

**1. Check for non-standard test directories**

Look for:
- `__tests__/`
- `specs/`
- `test/`

If any exist, tests need to be migrated.

**2. Move tests to `src/` directory**

```bash
# Example if tests are in __tests__/
mv <project>/__tests__/* <project>/src/
rm -rf <project>/__tests__/
```

**3. Update Jest configuration**

File: `<project>/jest.config.ts`

Ensure testMatch pattern searches only `src/`:
```typescript
export default {
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  // ... other config
};
```

**4. Update coverage configuration**

File: `<project>/jest.config.ts`

Ensure coverage excludes test files:
```typescript
export default {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
  ],
  // ... other config
};
```

### Validation

Run tests to verify they're discovered correctly:
```bash
pnpm exec nx run <project>:test
```

### Why This Matters

Different test locations across components creates confusion and inconsistency. We've adopted Next.js 15's co-located pattern as our standard.

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 1

---

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

## After: `nx g @nx/node:app <name>`

### Issue
Node.js apps may have version mismatches or missing configurations.

### Required Actions

**1. Verify TypeScript version matches workspace**

Check `package.json` in the generated app:
```json
{
  "devDependencies": {
    "typescript": "5.9.3"  // Should match workspace root
  }
}
```

If version differs, update to match workspace standard.

**2. Verify Node.js version compatibility**

Check that generated code doesn't use Node.js features incompatible with our target version (Node 22+).

**3. Add Jest configuration if needed**

If tests are required:
```bash
pnpm exec nx g @nx/jest:configuration <app-name>
```

Then follow "After: `nx g @nx/jest:configuration`" checklist above.

### Validation

Build and run the app:
```bash
pnpm exec nx run <app-name>:build
pnpm exec nx run <app-name>:serve
```

---

## After: `nx g @nx/next:app <name>` (Next.js applications)

### Issue
The `@nx/next` generator creates Next.js apps with single `tsconfig.json` (correct for Next.js), but does not create a typecheck target. Without manual configuration, Next.js apps are excluded from workspace-wide typecheck commands and CI pipeline validation.

### Required Actions

**1. Create manual typecheck target**

File: `apps/<app-name>/project.json` (create if doesn't exist)

```json
{
  "name": "@nx-monorepo/<app-name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/<app-name>/src",
  "projectType": "application",
  "targets": {
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/<app-name>",
        "command": "tsc --noEmit"
      },
      "cache": true,
      "inputs": [
        "default",
        "^production",
        {
          "externalDependencies": ["typescript"]
        }
      ],
      "metadata": {
        "technologies": ["typescript"],
        "description": "Runs type-checking for the project."
      }
    }
  }
}
```

### Validation

Run typecheck to verify configuration works:
```bash
pnpm exec nx run <app-name>:typecheck
```

Verify app is included in workspace-wide typecheck:
```bash
pnpm exec nx run-many -t typecheck
# Should list <app-name> in "Running target typecheck for N projects"
```

### Why This Matters

Without typecheck configuration, app is excluded from CI validation and creates type safety gap. See Pattern 4 in `adopted-patterns.md` for technical rationale.

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 4: TypeScript Configuration for Applications

---

## After: `nx g @nx/react:app <name>` (Future - mobile apps)

### Issue
React Native apps may default to different patterns than our Next.js web app.

### Required Actions

**1. Verify test location**

Follow "After: `nx g @nx/js:lib`" checklist to ensure tests are in `src/`.

**2. Verify TypeScript configuration**

Follow "After: `nx g @nx/jest:configuration`" checklist to ensure `moduleResolution: nodenext`.

**3. Check for platform-specific differences**

Document any necessary platform-specific patterns in this checklist if they differ from web standards.

### Notes

This section will be expanded when mobile app is added in Phase 2.

---

## How to Use This Checklist

### For AI Agents

**Before running `nx g` command:**
1. Note which generator you're about to run
2. Review the relevant section in this checklist

**Immediately after `nx g` completes:**
1. Execute ALL steps in the relevant checklist section
2. Do NOT skip steps - they are mandatory
3. Validate using the provided validation commands
4. Document any new issues discovered

### For Developers

**After running any generator:**
1. Find the relevant section in this checklist
2. Execute each required action step-by-step
3. Run validation commands to verify
4. If you discover a new post-generation issue, add it to this document

---

## How to Update This Document

When should you add a new checklist?

✅ **DO add** when:
- You discover a generator creates code that needs fixing
- The fix is required for consistency with adopted patterns
- The fix will apply to future uses of the same generator
- Skipping the fix would cause problems

❌ **DON'T add** when:
- It's a one-time edge case
- It's optional configuration (belongs in `docs/testing-enhancements.md`)
- It's already handled automatically by the generator

**Update process:**
1. Add new section using the template below
2. Test the checklist with a fresh generation
3. Update corresponding pattern in `adopted-patterns.md` if needed
4. Update `last-updated` date in frontmatter

---

## Checklist Template

Use this template when adding new post-generation steps:

```markdown
## After: `nx g <generator> <options>`

### Issue
[What problem does the generator create?]
[Why doesn't the generated code match our patterns?]

### Required Actions

**1. [Action title]**

File: `<location>`

[Detailed steps]
[Code examples if applicable]

**2. [Action title]**

[Repeat for each required action]

### Validation

[Commands to run to verify the fix worked]

### Why This Matters

[Consequences of skipping this step]

**Reference**: [Link to related docs]
```
