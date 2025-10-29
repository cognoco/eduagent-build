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

**⚠️ For Jest hanging issues (Windows)**: See `.ruler/AGENTS.md` - this is the most frequent issue and requires special handling.

---

## Table of Contents

- [Nx Cache Issues](#nx-cache-issues)
- [TypeScript Path Resolution](#typescript-path-resolution)
- [Build Failures](#build-failures)
- [Test Failures](#test-failures)
- [Prisma Issues](#prisma-issues)
- [Related Documentation](#related-documentation)

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

**Symptoms**: Tests fail, unexpected test behavior (excluding Jest hanging - see AGENTS.md for that).

**Solutions**:

```bash
# Run single test file
pnpm exec nx run web:test --testFile=path/to/spec.ts

# Run tests in watch mode
pnpm exec nx run web:test --watch

# Clear Jest cache
pnpm exec nx run web:test --clearCache
```

**⚠️ For Jest hanging/slow exit on Windows**: See `.ruler/AGENTS.md` for comprehensive troubleshooting steps.

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
