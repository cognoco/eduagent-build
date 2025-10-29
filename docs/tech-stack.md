---
title: Technology Stack Reference
purpose: Comprehensive version inventory, pinning strategy, and compatibility matrix for the nx-monorepo
audience: AI agents, developers, architects
tags: technology, versions, compatibility, dependencies, pinning
created: 2025-10-28
last-updated: 2025-10-28
Created: 2025-10-28T11:36
Modified: 2025-10-28T20:30
---

# Technology Stack Reference

## Overview

This document provides the complete technology stack inventory for the nx-monorepo with exact pinned versions, version pinning philosophy, compatibility matrix, and upgrade guidelines.

**CRITICAL**: This is the authoritative source for all version information. Agents must consult this file before suggesting any version changes.

---

## Table of Contents

- [Core Technology Stack](#core-technology-stack)
- [Version Pinning Philosophy](#version-pinning-philosophy)
- [Agent Permission Model](#agent-permission-model)
- [Compatibility Matrix](#compatibility-matrix)
- [Platform-Specific Constraints](#platform-specific-constraints)
- [Upgrade Guidelines](#upgrade-guidelines)
- [Version Change Approval Cycle](#version-change-approval-cycle)
- [Reference Documentation](#reference-documentation)

---

## Core Technology Stack

### Web Stack

| Package | Version | Pinning | Purpose |
|---------|---------|---------|---------|
| **next** | ~15.2.4 | Tilde (~) | React framework for web app |
| **react** | 19.0.0 | Exact | UI library |
| **react-dom** | 19.0.0 | Exact | React DOM renderer |
| **tailwindcss** | 3.4.3 | Exact | Utility-first CSS framework |
| **autoprefixer** | 10.4.13 | Exact | PostCSS plugin for vendor prefixes |
| **postcss** | 8.4.38 | Exact | CSS transformation tool |

**Rationale**:
- **Next.js 15.2**: Latest stable with App Router, RSC, and React 19 support
- **React 19**: Latest major version with improved concurrent features
- **Tilde (~) on Next.js**: Allows patch updates (15.2.x) for security fixes while preventing minor version bumps

### Server Stack

| Package | Version | Pinning | Purpose |
|---------|---------|---------|---------|
| **express** | ^4.21.2 | Caret (^) | HTTP server framework |
| **@types/express** | ^4.17.21 | Caret (^) | TypeScript types for Express |
| **openapi-typescript** | ^7.10.1 | Caret (^) | Generate TypeScript types from OpenAPI spec |

**Rationale**:
- **Express 4.x**: Mature, stable, widely-used server framework
- **Caret (^) on Express**: Allows minor + patch updates within v4 for security/features
- **REST+OpenAPI**: Type-safe API contract with auto-generated TypeScript types

### Database Stack

| Package | Version | Pinning | Purpose |
|---------|---------|---------|---------|
| **prisma** (CLI) | ^6.17.1 | Caret (^) | Database toolkit and migration tool |
| **@prisma/client** | ^6.17.1 | Caret (^) | Prisma runtime client |
| **Supabase** | PostgreSQL | N/A | Managed PostgreSQL database |

**Rationale**:
- **Prisma 6.x**: Latest major version with improved performance and type safety
- **Caret (^) on Prisma**: Allows minor + patch updates for bug fixes and improvements
- **CLI and Client version sync**: Must stay in sync (both use ^6.17.1)
- **Supabase**: Managed PostgreSQL with built-in auth, real-time, and storage

### Testing Stack

| Package | Version | Pinning | Purpose |
|---------|---------|---------|---------|
| **jest** | 30.2.0 | Exact | JavaScript testing framework |
| **babel-jest** | 30.2.0 | Exact | Babel transformer for Jest |
| **jest-environment-jsdom** | 30.2.0 | Exact | Browser-like environment for React tests |
| **jest-environment-node** | 30.2.0 | Exact | Node.js environment for server tests |
| **jest-util** | 30.2.0 | Exact | Jest utilities |
| **@types/jest** | ^30.0.0 | Caret (^) | TypeScript types for Jest |
| **@swc/jest** | ~0.2.38 | Tilde (~) | SWC transformer for Jest (faster than ts-jest) |
| **ts-jest** | ^29.4.0 | Caret (^) | TypeScript transformer for Jest (alternative) |
| **@testing-library/react** | 16.1.0 | Exact | React testing utilities |
| **@testing-library/dom** | 10.4.0 | Exact | DOM testing utilities |
| **@playwright/test** | 1.56.1 | Exact | E2E testing framework |

**Rationale**:
- **Jest 30**: Latest major version with improved performance and ESM support
- **Exact pins on core Jest packages**: Prevents version drift across Jest ecosystem packages
- **@swc/jest preferred**: Faster than ts-jest for TypeScript transformation
- **ts-jest as alternative**: Available but not mixed with @swc/jest in same project
- **Playwright 1.56.1**: Latest stable for E2E browser testing

### Tooling & Build

| Package | Version | Pinning | Purpose |
|---------|---------|---------|---------|
| **nx** | 21.6.5 | Exact | Monorepo build system |
| **@nx/*** | 21.6.5 | Exact | Nx plugins (must match core) |
| **typescript** | ~5.9.2 | Tilde (~) | TypeScript compiler |
| **eslint** | 9.37.0 | Exact | JavaScript/TypeScript linter |
| **prettier** | ^2.6.2 | Caret (^) | Code formatter |
| **husky** | ^9.1.7 | Caret (^) | Git hooks manager |
| **lint-staged** | ^16.2.5 | Caret (^) | Run linters on staged files |

**Rationale**:
- **Nx 21.6.5**: All Nx packages must use same exact version for compatibility
- **TypeScript ~5.9**: Allows patch updates (5.9.x) but not minor bumps (5.10.x)
- **ESLint 9**: Latest major version with flat config support
- **Exact pins on Nx**: Critical for task graph and caching to work correctly

### Node.js & Package Manager

| Tool | Version | Constraint | Purpose |
|------|---------|------------|---------|
| **Node.js** | 20.19.9 | >= 20.x | Runtime environment |
| **pnpm** | 10.19.0 | Exact (packageManager field) | Fast, disk-efficient package manager |

**Rationale**:
- **Node.js 20 LTS**: Long-term support version, compatible with all stack dependencies
- **pnpm 10.19.0**: Enforced via packageManager field for consistency across team

---

## Version Pinning Philosophy

### Pinning Strategy by Package Type

| Package Type | Pinning Strategy | Rationale |
|--------------|------------------|-----------|
| **Testing/Linting/Tooling** | Exact | Prevents CI failures from unexpected updates |
| **Core Framework (Nx)** | Exact | All Nx packages must match exactly |
| **TypeScript** | Tilde (~) | Allows patch fixes, blocks minor/major |
| **UI Framework (Next.js)** | Tilde (~) | Allows patch security fixes |
| **Runtime (React)** | Exact | Prevents unexpected behavior changes |
| **Server (Express)** | Caret (^) | Stable API, safe to allow minor updates |
| **Utilities/CLI tools** | Caret (^) | Flexibility for improvements |

### Pinning Symbols Explained

- **Exact (no symbol)**: `30.2.0` - Exact version only, no updates
- **Tilde (~)**: `~5.9.2` - Allows patch updates only (5.9.3, 5.9.4...) but not 5.10.0
- **Caret (^)**: `^4.21.2` - Allows minor + patch updates (4.22.0, 4.21.3...) but not 5.0.0

### Version Drift Prevention

**Critical Rule**: When Jest ecosystem packages are used, all must match exactly:
```json
{
  "jest": "30.2.0",
  "babel-jest": "30.2.0",
  "jest-environment-jsdom": "30.2.0",
  "jest-environment-node": "30.2.0"
}
```

**Critical Rule**: All `@nx/*` packages must match the core `nx` version:
```json
{
  "nx": "21.6.5",
  "@nx/jest": "21.6.5",
  "@nx/next": "21.6.5",
  "@nx/react": "21.6.5"
}
```

---

## Agent Permission Model

### Agents MUST

1. **Use exact versions specified in `package.json`**
   - Never suggest version changes without reading this file first
   - Never assume "latest" is safe to use

2. **Read this file before suggesting any version changes**
   - Understand pinning strategy for the package type
   - Check compatibility matrix for cross-package impacts

3. **Verify version compatibility using external resources**
   - Use Context7 MCP to fetch official documentation
   - Use web search to verify compatibility (e.g., "Next.js 15.2 with React 19")
   - Check for known issues with specific version combinations

4. **Respect the pinning strategy**
   - Exact pins: Never suggest updates without architectural review
   - Tilde (~) pins: Patch updates OK with compatibility verification
   - Caret (^) pins: Minor updates OK with compatibility verification

### Agents MAY

1. **Suggest version updates with rationale**
   - Security vulnerabilities in current version
   - Critical bug fixes in newer version
   - New features that solve existing problems
   - Performance improvements with measured impact

2. **Flag outdated dependencies**
   - Major versions behind (e.g., using React 17 when 19 is stable)
   - Security advisories for current versions
   - End-of-life notices for current versions

3. **Propose compatibility improvements**
   - Aligning related package versions
   - Resolving peer dependency warnings
   - Upgrading to resolve deprecation warnings

### Agents MUST NOT

1. **Update versions without approval**
   - No "helpful" automatic updates
   - No assuming compatibility without verification

2. **Mix incompatible transformers**
   - Never use both `ts-jest` and `@swc/jest` in same project

3. **Break Nx/Jest ecosystem version sync**
   - Never update one Nx plugin without updating all
   - Never update one Jest package without checking others

---

## Compatibility Matrix

### Critical Compatibility Rules

| Package Group | Compatibility Constraint |
|---------------|--------------------------|
| **Nx ecosystem** | All `@nx/*` packages must match `nx` core version exactly |
| **Jest ecosystem** | `jest`, `babel-jest`, `jest-environment-*`, `jest-util` must match exactly |
| **React ecosystem** | `react` and `react-dom` must match exactly |
| **TypeScript ecosystem** | `typescript` version must be compatible with all `@types/*` packages |
| **Prisma ecosystem** | `prisma` CLI and `@prisma/client` should match (both use ^6.17.1) |

### Verified Working Combinations

| Next.js | React | TypeScript | Node.js | Status |
|---------|-------|------------|---------|--------|
| ~15.2.4 | 19.0.0 | ~5.9.2 | 20.19.9 | ✅ Tested & Working |

| Jest | @swc/jest | TypeScript | Node.js | Status |
|------|-----------|------------|---------|--------|
| 30.2.0 | ~0.2.38 | ~5.9.2 | 20.19.9 | ✅ Tested & Working |

| Nx | @nx/jest | Jest | TypeScript | Status |
|----|----------|------|------------|--------|
| 21.6.5 | 21.6.5 | 30.2.0 | ~5.9.2 | ✅ Tested & Working |

| Playwright | Node.js | TypeScript | Status |
|------------|---------|------------|--------|
| 1.56.1 | 20.19.9 | ~5.9.2 | ✅ Tested & Working |

### Known Incompatibilities

- **Jest 30 + ts-jest + @swc/jest**: ❌ Do not mix `ts-jest` and `@swc/jest` in the same project (transformer conflict)
- **Nx plugins version mismatch**: ❌ Never run `nx` 21.6.5 with `@nx/jest` 21.5.x or different version
- **React 19 + older Next.js**: ❌ Next.js < 15 does not support React 19

---

## Platform-Specific Constraints

### Windows (Validated)

- **Windows 11**: ✅ Fully supported
- **Node.js 20.19.9**: ✅ Compatible
- **pnpm 10.19.0**: ✅ Recommended (faster than npm on Windows)
- **Jest hanging issue**: ⚠️ See `.ruler/AGENTS.md` Troubleshooting section for Windows-specific Jest workarounds (NX_DAEMON=false, --no-cloud)

### Windows ARM64

- **Not tested**: ⚠️ Some native dependencies may have limited ARM64 support
- **Recommendation**: Use x64 emulation or native x64 machine for development
- **Known issues**: Check individual package compatibility (esbuild, @swc/core, Playwright)

### macOS

- **macOS 13+**: ✅ Fully supported
- **Apple Silicon (M1/M2/M3)**: ✅ All dependencies have ARM64 binaries

### Linux

- **Ubuntu 22.04+**: ✅ Fully supported
- **Debian 11+**: ✅ Fully supported
- **CI Environment**: ✅ GitHub Actions Ubuntu runners fully supported

---

## Upgrade Guidelines

### When to Upgrade

**Security Patches** (High Priority):
1. Review security advisory details
2. Check if vulnerability affects our usage patterns
3. Test in isolated branch
4. Deploy after verification

**Bug Fixes** (Medium Priority):
1. Verify bug affects our codebase
2. Check for regressions in newer version
3. Test affected areas
4. Deploy in next release cycle

**Feature Additions** (Low Priority):
1. Evaluate feature value vs. risk
2. Check breaking changes in release notes
3. Create feature branch for testing
4. Coordinate with team for merge timing

### Upgrade Process

1. **Create isolated branch**: `git checkout -b upgrade/<package-name>`
2. **Update package.json**: Change version(s)
3. **Install and verify**: `pnpm install`
4. **Run full test suite**: `pnpm exec nx run-many -t test`
5. **Run build**: `pnpm exec nx run-many -t build`
6. **Run E2E tests**: `pnpm exec nx run-many -t e2e`
7. **Manual smoke testing**: Test critical paths manually
8. **Update this file**: Document new version and compatibility
9. **Create PR for review**: Include test results and rationale

### Major Version Upgrades (Special Attention)

Major version bumps (e.g., Jest 29 → 30, Next.js 14 → 15) require:
1. **Read migration guide**: Official docs for breaking changes
2. **Check all dependents**: What else needs updating?
3. **Extended testing period**: At least 1 week in staging
4. **Rollback plan**: Document how to revert if issues arise
5. **Team coordination**: Ensure all developers aware of changes

---

## Version Change Approval Cycle

### Approval Authority

| Change Type | Approver | Timeframe |
|-------------|----------|-----------|
| **Patch updates (within pinning strategy)** | Tech Lead | 1-2 days |
| **Minor updates (within caret/tilde range)** | Tech Lead + Architect | 3-5 days |
| **Major version bumps** | Full Team Review | 1-2 weeks |
| **Security patches (critical)** | Tech Lead (expedited) | Same day |

### Approval Checklist

Before approving version changes:
- [ ] Read official release notes and migration guide
- [ ] Check for breaking changes that affect our codebase
- [ ] Verify compatibility with other dependencies
- [ ] Run full test suite (unit + integration + E2E)
- [ ] Check for performance regressions
- [ ] Update `docs/tech-stack.md` with new version
- [ ] Document any new compatibility constraints discovered
- [ ] Ensure CI pipeline passes with new version

---

## Reference Documentation

**Official Documentation Links**:
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Nx Documentation](https://nx.dev)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Supabase Documentation](https://supabase.com/docs)

**Project Documentation**:
- `.ruler/AGENTS.md` - AI agent rules and monorepo overview
- `docs/memories/testing-reference.md` - Jest configuration and testing patterns
- `docs/memories/troubleshooting.md` - Common development issues
- `docs/memories/tech-findings-log.md` - Technical decisions and constraints
- `docs/memories/adopted-patterns.md` - Monorepo coding standards

**When researching version compatibility**:
- Use Context7 MCP to fetch latest official package documentation
- Use web search for community experiences with specific version combinations
- Check npm package page for peer dependency requirements
- Review GitHub issues for known compatibility problems

---

## Maintenance

**This file should be updated**:
- After every version change (update version number and date)
- When new compatibility constraints are discovered
- When platform-specific issues are identified
- When upgrade guidelines need refinement

**Last Updated**: 2025-10-28
**Last Major Audit**: 2025-10-28
**Next Review Due**: 2026-01-28 (quarterly review recommended)
