---
title: Epic 5b - Nx 22.x Infrastructure Upgrade Analysis
purpose: Comprehensive analysis of Expo SDK 53 vs 54 upgrade implications for the Nx monorepo
author: Vimes (Architect Agent)
date: 2025-12-11
epic: 5b
status: analysis-complete
branch: e5b/expo-prep
---

# Epic 5b: Nx 22.x Infrastructure Upgrade Analysis

## Executive Summary

This document captures the comprehensive architectural analysis performed on 2025-12-11 to evaluate upgrading from Expo SDK 53 to SDK 54 in the nx-monorepo project. The analysis determined that **SDK 54 is required** (not optional) due to @nx/expo plugin requirements.

### Key Finding

| Aspect | Finding | Impact |
|--------|---------|--------|
| **@nx/expo requirement** | Current plugin requires `expo >= 54.0.0` | SDK 53 not viable with @nx/expo |
| **Nx version required** | 22.2.0+ for SDK 54 support | Major Nx upgrade required |
| **React alignment** | SDK 54 uses React 19.1.0 | Minor bump from web's 19.0.1 |

### Recommendation

**Proceed with SDK 54 + Nx 22.2.0+ upgrade** - This is not optional if we want proper @nx/expo integration.

---

## Research Methodology

### MCP Servers Used

1. **Sequential Thinking MCP** - Structured planning approach
2. **Vibe-Check MCP** - Validated assumptions and approach
3. **Expo MCP** - Official SDK 54 documentation
4. **Context7 MCP** - React Native/React compatibility docs
5. **NX MCP** - Workspace analysis and plugin compatibility
6. **Exa MCP** - Community experiences and real-world issues

### Research Agents Deployed

Four parallel sub-agents gathered independent research:
1. Expo SDK 54 Official Documentation
2. React 19 + Expo Compatibility
3. Nx Monorepo Integration
4. Community Experiences

---

## Current State Analysis

### Baseline (Before Upgrade)

| Component | Current Version | Source |
|-----------|----------------|--------|
| **Nx** | 21.6.5 | package.json |
| **React** | 19.0.1 | package.json |
| **React DOM** | 19.0.1 | package.json |
| **TypeScript** | ~5.9.2 | package.json |
| **Node.js** | 22.x | package.json engines |
| **@nx/expo** | Not installed | - |
| **Expo SDK** | Not installed | Epic 6 will add |

### Workspace Structure

```
apps/
  web/           → Next.js 15.2, React 19.0.1
  server/        → Express, REST+OpenAPI
  web-e2e/       → Playwright E2E tests
packages/
  api-client/    → Type-safe REST client
  database/      → Prisma + Supabase
  schemas/       → Zod schemas
  supabase-client/
  test-utils/
```

---

## Expo SDK 54 Analysis

### Release Information

| Attribute | Value |
|-----------|-------|
| **Release Status** | Stable |
| **Release Date** | September 2025 |
| **Beta Period** | ~2 weeks (August 2025) |
| **React Native** | 0.81 |
| **React** | 19.1.0 |

### Key Features

1. **Precompiled React Native for iOS** - Significantly faster build times
2. **Reanimated v4** - Requires New Architecture
3. **Android 16 Support** - Edge-to-edge mandatory
4. **expo-router v6** - No breaking changes for basic routing
5. **Last SDK with Legacy Architecture support** - SDK 55 will require New Architecture

### Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| Reanimated v4 requires New Architecture | Medium | Can use v3 if needed |
| Android edge-to-edge mandatory | Low | Design for insets from start |
| expo-file-system API change | Low | Use legacy import path |
| SDK 54 is last Legacy Architecture support | Medium | Use New Architecture from start |

---

## React Version Compatibility

### Version Matrix

| Platform | Current | After Upgrade | Gap |
|----------|---------|---------------|-----|
| **Web (Next.js)** | React 19.0.1 | React 19.1.0 | +0.0.1 (patch) |
| **Mobile (Expo)** | N/A | React 19.1.0 | New |

### Alignment Strategy

**Recommendation: Use React 19.1.0 across entire monorepo**

```json
// Root package.json after upgrade
{
  "dependencies": {
    "react": "19.1.0",
    "react-dom": "19.1.0"
  }
}
```

**Benefits:**
- Maximum code sharing between web and mobile
- Single React version (no dual package hazard)
- Consistent hooks/context behavior
- Simplified testing

---

## Nx Plugin Compatibility

### Critical Discovery

From NX MCP documentation:

```
#### Requires
| Name   | Version     |
| ------ | ----------- |
| `expo` | `>= 54.0.0` |
```

**This means:**
- Current @nx/expo plugin **requires** Expo SDK 54.0.0 or higher
- SDK 53 is **not supported** by the current @nx/expo plugin
- Nx 22.2.0+ is required for SDK 54 support

### Nx Migration Reference

```
### `update-22-2-0-add-expo-system-ui`
**Version**: 22.2.0-beta.3
Add expo-system-ui dependency for Expo SDK 54
```

### Upgrade Path

| From | To | Command |
|------|-----|---------|
| Nx 21.6.5 | Nx 22.2.0+ | `pnpm exec nx migrate 22.2.0` |

### Affected Packages

All @nx/* packages must upgrade together (version pinning policy):
- @nx/devkit
- @nx/esbuild
- @nx/eslint
- @nx/eslint-plugin
- @nx/jest
- @nx/js
- @nx/next
- @nx/node
- @nx/playwright
- @nx/react
- @nx/workspace
- @nx/expo (new)

---

## Community Research Summary

### SDK 54 Maturity Assessment

**Status: STABLE/MATURE**
- 2+ months in production use since September 2025
- Active community support
- Clear upgrade guides and video tutorials

### Reported Issues

| Issue | Severity | Status |
|-------|----------|--------|
| React 19 web build `createContext` error | High | Tracked (#40769) |
| NativeWind ref prop with React 19 | Medium | Tracked (#39657) |
| iOS `useFrameworks: static` issues | Medium | Tracked |
| Monorepo setup in SDK 54.0.19 | Medium | Fixed in 54.0.20+ |
| expo-router version conflicts | Low | Workarounds available |

### Community Consensus

- **For new projects:** SDK 54 recommended
- **For upgrades from SDK 53:** Straightforward path
- **For monorepos:** Use SDK 54.0.20+ to avoid early issues

---

## Risk Assessment

### Upgrade Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Nx upgrade breaks existing builds | Medium | High | Isolated branch, full regression |
| Jest configuration issues | Medium | Medium | Nx 22.2 migration handles this |
| React 19.1 compatibility | Low | Low | Patch version, minimal changes |
| CI/CD pipeline disruption | Low | Medium | Validate in draft PR first |
| @nx/* version drift | Low | High | Strict version pinning |

### Blast Radius

```
                    ┌─────────────────────────────────────┐
                    │     NX CORE UPGRADE BLAST RADIUS    │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
    ┌─────▼─────┐              ┌──────▼──────┐             ┌──────▼──────┐
    │  BUILD    │              │   TESTING   │             │    CI/CD    │
    │  SYSTEM   │              │   INFRA     │             │   PIPELINE  │
    ├───────────┤              ├─────────────┤             ├─────────────┤
    │ @nx/next  │              │ @nx/jest    │             │ GitHub      │
    │ @nx/js    │              │ Jest 30     │             │ Actions     │
    │ @nx/node  │              │ Playwright  │             │ Nx Cloud    │
    │ @nx/react │              │ ts-jest     │             │ Caching     │
    └───────────┘              └─────────────┘             └─────────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │  EXISTING APPS & PACKAGES (7)     │
                    │  web, server, api-client,         │
                    │  database, schemas, supabase,     │
                    │  test-utils, web-e2e              │
                    └───────────────────────────────────┘
```

---

## Decision Matrix

### Option Comparison

| Option | Nx Version | Expo SDK | @nx/expo | Viability |
|--------|------------|----------|----------|-----------|
| **A: Full Integration** | 22.2.0+ | 54+ | Yes | **Recommended** |
| **B: Stay on Nx 21.x** | 21.6.5 | 53 | Old version only | Limited |
| **C: Manual Expo** | 21.6.5 | 53/54 | None | Not recommended |

### Why Option A is Required

1. **@nx/expo current version requires SDK 54+** - Non-negotiable
2. **Nx 22.2.0+ required for SDK 54 migrations** - Technical requirement
3. **React 19.1.0 alignment** - Enables maximum code sharing
4. **New Architecture preparation** - SDK 55 will require it

---

## Target State

### After Epic 5b Completion

| Component | Target Version |
|-----------|---------------|
| **Nx** | 22.2.0+ (latest 22.x) |
| **@nx/expo** | 22.2.0+ (matching Nx) |
| **React** | 19.1.0 |
| **React DOM** | 19.1.0 |
| **Expo SDK** | 54.0.20+ |
| **React Native** | 0.81 (bundled with Expo) |

### New Workspace Structure

```
apps/
  web/           → Next.js 15.2, React 19.1.0
  server/        → Express, REST+OpenAPI
  web-e2e/       → Playwright E2E tests
  mobile/        → Expo SDK 54, React Native 0.81 (Epic 6)
packages/
  api-client/    → Shared by web AND mobile
  database/      → Prisma + Supabase
  schemas/       → Shared by all platforms
  supabase-client/
  test-utils/
```

---

## Implementation Plan

### Epic 5b Stories

| Story | Title | Risk |
|-------|-------|------|
| 5b.1 | Create Upgrade Branch and Run Nx Migrate | Medium |
| 5b.2 | Execute Migrations and Update All @nx/* Plugins | Medium |
| 5b.3 | Run Full Test Suite and Fix Breaking Changes | High |
| 5b.4 | Update React to 19.1.0 | Low |
| 5b.5 | Validate CI/CD Pipeline | Medium |
| 5b.6 | Install @nx/expo Plugin | Low |
| 5b.7 | Install and Configure Expo CLIs | Low |
| 5b.8 | Update Documentation | Low |
| 5b.9 | Final Validation and Merge to Main | High |

### Branch Strategy

```
main ──────────────────────────────────────────────────────▶
       │
       └──▶ e5b/expo-prep ────────────────────────────────▶ (PR to main)
                │
                ├── Story 5b.1: nx migrate
                ├── Story 5b.2: plugin updates
                ├── Story 5b.3: test fixes
                ├── Story 5b.4: React 19.1
                ├── Story 5b.5: CI validation
                ├── Story 5b.6: @nx/expo install
                ├── Story 5b.7: Expo CLI + EAS CLI
                ├── Story 5b.8: docs update
                └── Story 5b.9: final validation + merge
```

---

## Conclusion

### Final Recommendation

**Proceed with Expo SDK 54 + Nx 22.2.0+ upgrade.**

This is not a choice between SDK 53 and SDK 54 - it's a requirement for proper @nx/expo integration. The upgrade path is well-defined, risks are manageable with the isolated branch approach, and the React version alignment is excellent for code sharing goals.

### Success Criteria

- [ ] All existing tests pass after Nx upgrade
- [ ] All existing builds succeed
- [ ] CI/CD pipeline green
- [ ] @nx/expo plugin installed and functional
- [ ] Documentation updated
- [ ] Epic 6 unblocked for mobile development

---

## References

### Documentation
- [Expo SDK 54 Release Notes](https://expo.dev/changelog/sdk-54)
- [Nx Expo Plugin Documentation](https://nx.dev/docs/technologies/react/expo/introduction)
- [React 19.1 Release Notes](https://react.dev/blog)

### Related Documents
- `docs/epics.md` - Epic 5b definition and stories
- `docs/tech-stack.md` - Version inventory (to be updated)
- `docs/architecture-decisions.md` - SDK 54 decision record

### Research Session
- **Date:** 2025-12-11
- **Agent:** Vimes (Architect)
- **Tools:** Sequential Thinking, Vibe-Check, Expo MCP, Context7, NX MCP, Exa MCP
