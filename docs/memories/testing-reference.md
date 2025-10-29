---
title: Testing Reference
purpose: Comprehensive Jest and testing configuration reference for the nx-monorepo
audience: AI agents, developers
tags: jest, testing, configuration, coverage, typescript, playwright
created: 2025-10-27
last-updated: 2025-10-27
Created: 2025-10-28T10:18
Modified: 2025-10-29T13:00
---

# Testing Reference

## Overview

This document provides comprehensive testing configuration patterns for the nx-monorepo. These patterns have been established through empirical testing and ensure consistency across all projects.

**⚠️ CRITICAL**: Testing (especially Jest) is a **very problematic area** with version compatibility issues and complex configuration interactions. Always follow the patterns documented here.

---

## Table of Contents

- [Test File Location](#test-file-location)
- [Unit Tests (Jest)](#unit-tests-jest)
- [Integration Tests](#integration-tests)
- [E2E Tests (Playwright)](#e2e-tests-playwright)
- [Jest Configuration Patterns](#jest-configuration-patterns)
  - [Workspace Preset](#workspace-preset)
  - [Project-Level Configuration](#project-level-configuration)
  - [TypeScript Test Configuration](#typescript-test-configuration)
  - [Adding Jest to New Projects](#adding-jest-to-new-projects)
- [Coverage Testing](#coverage-testing)
  - [Coverage Scripts](#coverage-scripts)
  - [Coverage Thresholds](#coverage-thresholds)
  - [Coverage Reports](#coverage-reports)
  - [Coverage Directory Structure](#coverage-directory-structure)
  - [Adding Coverage to New Projects](#adding-coverage-to-new-projects)
- [Related Documentation](#related-documentation)

---

## Test File Location

Tests are co-located with their source files in the `src/` directory, following Next.js 15 best practices.

**Pattern**: Place test files next to the code they test
- `src/app/page.tsx` → `src/app/page.spec.tsx`
- `src/components/Button.tsx` → `src/components/Button.spec.tsx`

**Naming**: Use `.spec.tsx` or `.test.tsx` suffix

**Jest Configuration** (`apps/web/jest.config.ts`):
```typescript
testMatch: [
  '<rootDir>/src/**/*.(spec|test).[jt]s?(x)',
],
collectCoverageFrom: [
  'src/**/*.{ts,tsx,js,jsx}',
  '!src/**/*.spec.{ts,tsx,js,jsx}',
  '!src/**/*.test.{ts,tsx,js,jsx}',
],
```

**Rationale**:
- Aligns with Next.js 15 App Router conventions
- Improves developer experience (tests near code)
- Simplifies imports (relative paths shorter)
- Industry standard for component-based architectures (2025)

---

## Unit Tests (Jest)

- Located in `*.spec.ts` files alongside source code
- Test individual functions, classes, and components in isolation
- Target: >= 80% code coverage
- Run fast (< 5 seconds per test suite)

**Example**:
```typescript
// packages/schemas/src/user.schema.spec.ts
import { userSchema } from './user.schema';

describe('userSchema', () => {
  it('should validate correct user data', () => {
    expect(() => userSchema.parse({ id: '123', name: 'Alice' })).not.toThrow();
  });
});
```

---

## Integration Tests

- Test interactions between layers (e.g., server endpoint → database)
- Located in `apps/server/src/**/*.spec.ts`
- May use test database or mocks
- Slower than unit tests but faster than E2E

---

## E2E Tests (Playwright)

- Full browser-based user journey tests
- Located in `apps/web-e2e/src/`
- Test complete flows: page load → interaction → data persistence
- Run in CI with headless browsers

**Example**:
```typescript
// apps/web-e2e/src/health-check.spec.ts
test('health check flow', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByText('Health Status')).toBeVisible();
  await page.click('button:has-text("Ping")');
  await expect(page.getByText('Pong')).toBeVisible();
});
```

---

## Jest Configuration Patterns

This project follows Nx best practices for Jest configuration with a workspace-level preset pattern.

### Workspace Preset

All projects extend a shared `jest.preset.js` at the workspace root:

```javascript
// jest.preset.js
const nxPreset = require('@nx/jest/preset').default;
module.exports = { ...nxPreset };
```

This ensures consistent Jest behavior across all projects while allowing per-project customization.

### Project-Level Configuration

Each project has its own `jest.config.ts` that extends the workspace preset:

```typescript
// apps/web/jest.config.ts
export default {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',  // Extend workspace preset
  testEnvironment: 'jsdom',         // or 'node' for Node.js projects
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
  // ... project-specific settings
};
```

**Note**: Next.js projects (like `apps/web`) use the `next/jest` wrapper with `testEnvironment: 'jsdom'` for browser-like testing. The Next.js Jest configuration also includes the `@nx/react/plugins/jest` transform for handling static assets and other Next.js-specific features.

### TypeScript Test Configuration

**Type Isolation Pattern**: Test types are separated from production types using `tsconfig.spec.json`:

```json
// apps/web/tsconfig.spec.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node"]  // Test-specific types
  },
  "include": [
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx"
  ],
  "references": [
    { "path": "./tsconfig.json" }  // Reference to production config
  ]
}
```

**Important**: Production `tsconfig.json` should NOT include test types. Keep test types isolated to `tsconfig.spec.json`.

### Adding Jest to New Projects

To add Jest testing to a new project:

```bash
# Generate Jest configuration for a project
pnpm exec nx g @nx/jest:configuration <project-name>
```

Nx automatically:
- Creates `jest.config.ts` extending the workspace preset
- Creates `tsconfig.spec.json` with proper type isolation
- Adds test target to `project.json`
- Configures coverage directory

**No manual setup required** - Nx handles all configuration automatically.

**Mandatory Testing Enhancements for UI Packages**: UI packages (web, mobile) MUST use jest-dom, user-event, and MSW as documented in Pattern 10 (`adopted-patterns.md`). This is constitutional requirement (Principle I) to ensure consistent testing quality and eliminate decision overhead for AI agents. See post-generation checklist for setup steps. Non-UI packages (Node.js libraries, pure logic) use basic Jest without these enhancements.

---

## Coverage Testing

### Coverage Scripts

The workspace provides convenient scripts for running tests with coverage reporting:

```bash
# Run coverage for all projects
pnpm run test:coverage

# Run coverage for specific projects
pnpm run test:coverage:web
pnpm run test:coverage:server
```

### Coverage Thresholds

All projects use standardized coverage thresholds to ensure code quality:

```typescript
// apps/web/jest.config.ts
coverageThreshold: {
  global: {
    branches: 10,    // Target: 80% (Phase 2+)
    functions: 10,   // Target: 80% (Phase 2+)
    lines: 10,       // Target: 80% (Phase 2+)
    statements: 10   // Target: 80% (Phase 2+)
  }
}
```

**Current thresholds (10%)**: Permissive during Phase 1 walking skeleton - establishes infrastructure without blocking development.

**Target thresholds (80%)**: Will be enforced starting in Phase 2 when feature development begins.

**Coverage metrics explained**:
- **Statements**: Individual lines of code executed
- **Lines**: Physical lines in the file that were executed
- **Functions**: Whether each function was called
- **Branches**: Decision points tested (if/else, switch, ternaries, &&, ||)

### Coverage Reports

After running coverage, HTML reports are generated in `coverage/<project>/index.html`:

```bash
# Run coverage for web app
pnpm run test:coverage:web

# Open the HTML report (manual)
# Windows: start coverage/apps/web/index.html
# Mac: open coverage/apps/web/index.html
# Linux: xdg-open coverage/apps/web/index.html
```

Reports show:
- Per-file coverage percentages
- Highlighted uncovered lines
- Branch coverage visualization
- Drilldown from project → file → line level

### Coverage Directory Structure

Coverage reports follow a consistent pattern across all projects:

```
coverage/
  apps/
    web/
      index.html          # HTML report entry point
      app/                # Per-directory coverage
      page.tsx.html       # Per-file coverage details
      lcov.info           # LCOV format for CI/tooling
      coverage-final.json # Raw coverage data
    server/
      index.html
      lcov.info
      coverage-final.json
  packages/
    database/
      index.html
      lcov.info
      coverage-final.json
```

**Pattern**: `coverageDirectory: '../../coverage/<type>/<name>'` in each project's `jest.config.ts`

The `/coverage` directory is gitignored - reports are generated locally and in CI but not committed.

### Adding Coverage to New Projects

When generating a new project with Jest:

```bash
pnpm exec nx g @nx/jest:configuration <project-name>
```

Then manually add coverage threshold to the generated `jest.config.ts`:

```typescript
coverageThreshold: {
  global: {
    branches: 10,    // Target: 80% (Phase 2+)
    functions: 10,   // Target: 80% (Phase 2+)
    lines: 10,       // Target: 80% (Phase 2+)
    statements: 10   // Target: 80% (Phase 2+)
  }
}
```

And ensure `coverageDirectory` follows the pattern: `'../../coverage/<apps|packages>/<project-name>'`

---

## Related Documentation

**MANDATORY READ before testing work**:
- `.ruler/AGENTS.md` - Critical Jest troubleshooting (Windows hanging issue)
- `docs/memories/adopted-patterns.md` - Test file location standards
- `docs/memories/post-generation-checklist.md` - Post-generation Jest fixes
- `docs/memories/troubleshooting.md` - General test failure troubleshooting

**Additional Resources**:
- `docs/testing-enhancements.md` - Optional advanced testing patterns
- `docs/tech-stack.md` - Jest and Playwright version compatibility
