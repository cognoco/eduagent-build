---
Created: 2025-10-19
Purpose: Document baseline package versions for Phase 1 walking skeleton
Status: Stage 0 baseline (before additional apps/packages)
Modified: 2025-10-28T20:30
---

# Package Versions Baseline

---
⚠️ **HISTORICAL SNAPSHOT - READ ONLY**

This document captures the exact package versions at **Phase 1, Stage 0 completion** (2025-10-18).

**Do NOT use these versions for new work.** For current versions and upgrade policy, see [../tech-stack.md](../tech-stack.md).

To view the original `pnpm-lock.yaml` from this milestone:
```bash
git show 464830451eb:pnpm-lock.yaml
```
---

This document captures the baseline package versions at the completion of Stage 0 (Current State Audit). These versions represent the validated, working configuration before adding server, mobile apps, and shared packages in subsequent stages.

## Environment

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v22.20.0 | LTS recommended: v20.x or later |
| pnpm | 10.18.3 | Workspace package manager |
| OS | Windows | Development environment |

## Core Framework Versions

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 15.2.5 | Web application framework (App Router) |
| React | 19.0.0 | UI library |
| React DOM | 19.0.0 | React renderer for web |
| TypeScript | 5.9.3 | Type-safe JavaScript |
| Nx | 21.6.5 | Monorepo build system |

## Build Tools

| Package | Version | Purpose |
|---------|---------|---------|
| @swc/core | 1.13.5 | Fast TypeScript/JavaScript compiler |
| @swc/cli | 0.6.0 | SWC command-line interface |
| @swc/helpers | 0.5.17 | SWC runtime helpers |
| PostCSS | 8.4.38 | CSS transformation tool |
| Autoprefixer | 10.4.13 | CSS vendor prefix automation |
| Tailwind CSS | 3.4.3 | Utility-first CSS framework |

## Nx Plugins

| Package | Version | Purpose |
|---------|---------|---------|
| @nx/next | 21.6.5 | Next.js integration for Nx |
| @nx/react | 21.6.5 | React integration for Nx |
| @nx/playwright | 21.6.5 | Playwright E2E testing integration |
| @nx/jest | 21.6.5 | Jest unit testing integration |
| @nx/eslint | 21.6.5 | ESLint integration for Nx |
| @nx/eslint-plugin | 21.6.5 | Nx-specific ESLint rules |
| @nx/js | 21.6.5 | JavaScript/TypeScript library support |
| @nx/devkit | 21.6.5 | Nx plugin development utilities |
| @nx/workspace | 21.6.5 | Workspace generators and utilities |

## Testing Frameworks

| Package | Version | Purpose |
|---------|---------|---------|
| Jest | 30.2.0 | Unit testing framework |
| @types/jest | 30.0.0 | TypeScript definitions for Jest |
| jest-environment-jsdom | 30.2.0 | Browser-like test environment |
| babel-jest | 30.2.0 | Babel transformer for Jest |
| ts-jest | 29.4.5 | TypeScript preprocessor for Jest |
| @testing-library/react | 16.1.0 | React component testing utilities |
| @testing-library/dom | 10.4.0 | DOM testing utilities |
| @playwright/test | 1.56.1 | E2E testing framework |
| Playwright | 1.56.1 | Browser automation library |

## Code Quality Tools

| Package | Version | Purpose |
|---------|---------|---------|
| ESLint | 9.37.0 | JavaScript/TypeScript linter |
| eslint-config-next | 15.5.6 | Next.js ESLint configuration |
| eslint-config-prettier | 10.1.8 | Disable ESLint rules conflicting with Prettier |
| typescript-eslint | 8.46.1 | TypeScript ESLint parser and plugin |
| @typescript-eslint/parser | 8.46.1 | TypeScript parser for ESLint |
| @typescript-eslint/eslint-plugin | 8.46.1 | TypeScript-specific ESLint rules |
| eslint-plugin-import | 2.31.0 | Import/export validation |
| eslint-plugin-jsx-a11y | 6.10.1 | Accessibility rules for JSX |
| eslint-plugin-react | 7.35.0 | React-specific ESLint rules |
| eslint-plugin-react-hooks | 5.0.0 | Rules for React Hooks |
| eslint-plugin-playwright | 1.8.3 | Playwright-specific ESLint rules |
| Prettier | 2.8.8 | Code formatter |

## Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| ts-node | 10.9.1 | TypeScript execution for Node.js |
| tslib | 2.8.1 | TypeScript runtime library |
| @types/node | 20.19.9 | Node.js TypeScript definitions |
| @types/react | 19.0.0 | React TypeScript definitions |
| @types/react-dom | 19.0.0 | React DOM TypeScript definitions |

## Stage 0 Status

This baseline represents a **validated, working configuration** with:

- ✅ Web app (Next.js 15.2) builds and runs successfully
- ✅ All tests pass (1/1 unit test, 3/3 E2E tests)
- ✅ Linting passes with no errors
- ✅ TypeScript compilation clean
- ✅ Production build successful (101 kB)
- ✅ CI pipeline passing
- ✅ Nx caching functional

## Package Manager Configuration

**Workspace**: pnpm workspace with `pnpm-workspace.yaml`

**Package Manager Field**: `"packageManager": "pnpm@10.18.3"` in `package.json`

**Installation**: All dependencies installed via `pnpm install`

## Version Strategy

- **Next.js**: Using v15.2.5 (latest stable with App Router)
- **React**: Using v19.0.0 (latest stable)
- **TypeScript**: Using v5.9.3 (latest stable)
- **Nx**: Using v21.6.5 (latest stable)
- **Jest**: Using v30.2.0 (latest stable)

## Notes

1. **Package Approval**: Build scripts for `nx` and `@swc/core` approved via `pnpm approve-builds`
2. **SWC Version**: Updated from ~1.5.29 to ^1.13.5 to resolve peer dependency warnings
3. **Test Location**: Tests co-located in `src/` directory following Next.js 15 conventions
4. **Coverage**: Coverage reporting configured with `collectCoverageFrom` in `jest.config.ts`

## Next Steps

When generating new applications in Stages 1-2:
- Server app will add: Express, oRPC, Prisma
- Mobile app will add: Expo, React Native
- Shared packages will add: Zod, Supabase client

Refer to `package-versions-baseline.txt` for complete dependency tree with all transitive dependencies.
