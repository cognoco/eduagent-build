---
title: Troubleshooting Reference
purpose: Common troubleshooting solutions for nx-monorepo development issues
audience: AI agents, developers
tags: troubleshooting, nx, typescript, build, prisma, cache
created: 2025-10-27
last-updated: 2025-10-27
Created: 2025-10-28T10:18
Modified: 2025-10-28T20:30
---

# Troubleshooting Reference

## Overview

This document provides troubleshooting solutions for common development issues in the nx-monorepo. These solutions have been validated through empirical testing.

---

## Table of Contents

- [Jest Hanging on Windows](#jest-hanging-on-windows)
- [Nx Cache Issues](#nx-cache-issues)
- [TypeScript Path Resolution](#typescript-path-resolution)
- [Build Failures](#build-failures)
- [Test Failures](#test-failures)
- [Prisma Issues](#prisma-issues)
- [Related Documentation](#related-documentation)

---

## Jest Hanging on Windows

**Symptoms**: Jest prints "did not exit one second after the test run" or shows "Terminate batch job (Y/N)?". Tests hang indefinitely on Windows.

**✅ Fixed Projects**:
- **@nx-monorepo/web** (2025-11-03): Configuration applied via Pattern 12

**Solution for Fixed Projects**:
Projects with the fix applied will work automatically:
```bash
pnpm exec nx run web:test  # Works without hanging
```

**Solution for Unfixed Projects**:

**Option 1: Apply Pattern 12** (Recommended - Permanent Fix)

See **Pattern 12** in `docs/memories/adopted-patterns.md` for complete instructions.

Quick summary:
1. Add to `<project>/project.json`:
   ```json
   {
     "targets": {
       "test": {
         "options": {
           "env": {
             "NX_DAEMON": "false",
             "TS_NODE_COMPILER_OPTIONS": "{\"moduleResolution\":\"node10\",\"module\":\"commonjs\",\"customConditions\":null}"
           }
         }
       }
     }
   }
   ```

2. Ensure `<project>/tsconfig.spec.json` has:
   ```json
   {
     "compilerOptions": {
       "module": "nodenext",
       "moduleResolution": "nodenext"
     }
   }
   ```

**Option 2: Manual Workaround** (Temporary)

```bash
# Run with environment variable
NX_DAEMON=false pnpm exec nx run <project>:test
```

**Important Notes**:
- Root cause not fully understood - may vary by system state
- Fix has been empirically validated (2025-10-20, 2025-11-03)
- Apply per-project only when problem manifests (don't apply preemptively)
- For detailed troubleshooting steps, see `.ruler/AGENTS.md`

**Related**:
- Pattern 12: Windows Jest Hanging - Per-Project Environment Variables
- Pattern 2: TypeScript Module Resolution

---

## Nx Cache Issues

**Symptoms**: Stale build artifacts, unexpected behavior after code changes, tasks not running when expected.

**Solution**:
```bash
# Clear cache and reinstall
pnpm exec nx reset
rm -rf node_modules
pnpm install
```

---

## TypeScript Path Resolution

**Symptoms**: Import errors, "Cannot find module" errors for workspace packages.

**Solutions**:
- Ensure `tsconfig.base.json` includes paths for all packages
- Nx manages these automatically via generators
- If paths are missing, run `pnpm exec nx g @nx/js:library <name>` to regenerate

---

## Build Failures

**Symptoms**: Build fails, dependency order issues, compilation errors.

**Solutions**:

```bash
# Build in dependency order (Nx handles this automatically)
pnpm exec nx run-many -t build

# Build only affected projects
pnpm exec nx affected -t build

# Show affected dependency graph
pnpm exec nx affected:graph
```

---

## Test Failures

**Symptoms**: Tests fail, unexpected test behavior.

**Solutions**:

```bash
# Run single test file
pnpm exec nx run web:test --testFile=path/to/spec.ts

# Run tests in watch mode
pnpm exec nx run web:test --watch

# Clear Jest cache
pnpm exec nx run web:test --clearCache
```

**⚠️ For Jest hanging/slow exit on Windows**: See [Jest Hanging on Windows](#jest-hanging-on-windows) section above.

---

## Prisma Issues

**Symptoms**: Prisma client errors, schema sync issues, migration failures.

**Solutions**:

```bash
# Regenerate Prisma client after schema changes
pnpm --filter @nx-monorepo/database prisma generate

# Reset database (WARNING: deletes all data)
pnpm --filter @nx-monorepo/database prisma migrate reset

# View database schema
pnpm --filter @nx-monorepo/database prisma studio
```

---

## Related Documentation

**MANDATORY READ for specific issues**:
- `.ruler/AGENTS.md` - Jest hanging (Windows) - most frequent test issue
- `docs/memories/testing-reference.md` - Comprehensive Jest configuration and testing patterns
- `docs/memories/tech-findings-log.md` - Platform constraints and technical decisions
- `docs/tech-stack.md` - Version compatibility and platform-specific constraints
