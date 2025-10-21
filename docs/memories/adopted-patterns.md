---
title: Adopted Patterns
purpose: Monorepo-specific standards that override framework defaults
audience: AI agents, developers
created: 2025-10-21
last-updated: 2025-10-21
Created: 2025-10-21T14:39
Modified: 2025-10-21T18:10
---

# Adopted Patterns

## Purpose

This document defines **how WE do it in THIS monorepo**. These patterns override framework defaults and generator outputs to ensure consistency across all components.

**Critical Rule**: When these patterns conflict with framework defaults or generated code, **our patterns take precedence**.

---

## Pattern 1: Test File Location

**Our Standard**: Co-located tests in `src/` directory

### Pattern

- Test files live next to source code: `src/components/Button.tsx` → `src/components/Button.spec.tsx`
- Naming convention: `.spec.ts` or `.test.ts` suffix
- Jest configuration: `testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)']`

### Applies To

All apps and packages (web, server, mobile, libraries)

### Rationale

- Aligns with Next.js 15 App Router conventions
- Shorter import paths in tests
- Better developer experience (tests near code)
- Industry standard for component-based architectures (2025)

### When Adding New Apps/Packages

**⚠️ Generators may create different structures:**
- Some create `__tests__/` directories
- Some create `specs/` directories
- Some create `test/` directories

**Required action:**
1. Check if generator created different test location
2. Move all tests to `src/` directory
3. Update `jest.config.ts` testMatch pattern to only search `src/`
4. Delete empty test directories (`__tests__/`, `specs/`, etc.)

**Example fix:**
```bash
# After generation, if tests are in __tests__/
mv apps/my-app/__tests__/* apps/my-app/src/
rm -rf apps/my-app/__tests__/
```

### Last Validated

2025-10-21 (Next.js 15.2, Expo SDK 52, Nx 21.6)

---

## Pattern 2: TypeScript Module Resolution

**Our Standard**: `moduleResolution: "nodenext"` in all TypeScript configs

**Note:** This pattern is about the `moduleResolution` **compiler setting**. For framework-specific tsconfig **file structure** patterns (Project References vs single file), see Pattern 4.

### Pattern

All `tsconfig.json` and `tsconfig.spec.json` files must use:
```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
}
```

### Applies To

All projects (apps, packages, tests)

### Rationale

**Technical requirement**: Our workspace uses `customConditions: ["@nx-monorepo/source"]` in `tsconfig.base.json` for modern package resolution. This feature only works with:
- `moduleResolution: "node16"`
- `moduleResolution: "nodenext"` ✅ (our choice)
- `moduleResolution: "bundler"`

We chose `nodenext` because:
- Works with all package types (ESM, CJS, dual builds)
- Future-proof (TypeScript's recommended modern setting)
- Compatible with Jest via ts-jest transpilation
- Supports package.json `exports` field properly

### When Adding New Projects

**⚠️ Nx generators default to outdated settings:**
- Generated `tsconfig.spec.json` often uses `moduleResolution: "node10"`
- Generated `module` setting may be `"commonjs"` instead of `"nodenext"`

**Required action after generation:**
1. Open `<project>/tsconfig.spec.json`
2. Change `"moduleResolution": "node10"` → `"moduleResolution": "nodenext"`
3. Change `"module": "commonjs"` → `"module": "nodenext"` (for consistency)
4. Verify workspace builds: `pnpm exec nx run <project>:build`

**Why this doesn't break Jest:**
- TypeScript's `module` setting only affects type-checking, not runtime
- Jest uses ts-jest to transpile at runtime (always produces CommonJS)
- `nodenext` is detection-based - understands both ESM and CJS

### Known Issue

The `@nx/jest:configuration` generator in Nx 21.6 uses outdated TypeScript defaults. This is a known limitation - not a bug in our config.

### Last Validated

2025-10-20 (TypeScript 5.9, Nx 21.6, Jest 30.2)

**Reference**: `docs/memories/tech-findings-log.md` - "Jest Test Module Resolution Strategy"

---

## Pattern 3: Jest Configuration

**Our Standard**: Workspace preset inheritance with proper type isolation

### Pattern

**Workspace-level preset** (`jest.preset.js`):
```javascript
const nxPreset = require('@nx/jest/preset').default;
module.exports = { ...nxPreset };
```

**Project-level config** (e.g., `apps/web/jest.config.ts`):
```typescript
export default {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',  // ✅ Extend workspace preset
  testEnvironment: 'jsdom',         // or 'node' for Node.js projects
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
};
```

**Type isolation** (`apps/web/tsconfig.spec.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node"]  // ✅ Test-specific types
  },
  "include": ["src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

**Production config must NOT include test types** (`apps/web/tsconfig.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": []  // ✅ No jest types in production
  }
}
```

### Applies To

All projects with Jest testing (apps, packages)

### Rationale

- **Workspace preset**: Ensures consistent Jest behavior across all projects
- **Type isolation**: Test types (jest, testing-library) don't pollute production code
- **Nx standard**: Follows official Nx best practices for monorepo testing

### When Adding Jest to Projects

**Use the Nx generator** (auto-configures everything):
```bash
pnpm exec nx g @nx/jest:configuration <project-name>
```

Nx automatically:
- Creates `jest.config.ts` extending workspace preset
- Creates `tsconfig.spec.json` with proper type isolation
- Adds test target to `project.json`
- Configures coverage directory

**⚠️ Post-generation validation:**
1. Verify `jest.config.ts` has `preset: '../../jest.preset.js'`
2. Verify `tsconfig.spec.json` has `"types": ["jest", "node"]`
3. Verify production `tsconfig.json` does NOT have `"jest"` in types array
4. If any of the above are incorrect, manually fix them

### Optional Testing Enhancements

For advanced testing patterns (jest-dom, user-event, MSW), see `docs/testing-enhancements.md`.

These are **optional** - only add when specific projects need them.

### Last Validated

2025-10-21 (Jest 30.2, Nx 21.6, @nx/jest 21.6)

**Reference**: `.ruler/AGENTS.md` - "Jest Configuration Patterns"

---

## Pattern 4: TypeScript Configuration for Applications

**Our Standard**: Framework-specific TypeScript configurations

**Note:** This pattern is about tsconfig.json **file structure** (Project References vs single file). For the `moduleResolution` compiler setting that applies to ALL projects, see Pattern 2.

### Pattern by Framework

#### Next.js Applications (web, future mobile)

**Structure**:
```
apps/web/
├── tsconfig.json          # Single file with noEmit: true
├── tsconfig.spec.json     # Test configuration
└── project.json           # Contains manual typecheck target
```

**Configuration**:
- Single `tsconfig.json` with `noEmit: true`
- Manual typecheck target in `project.json` (see post-generation-checklist.md for complete configuration)
- Command: `tsc --noEmit`

#### Node.js Applications (server, future APIs)

- Uses TypeScript Project References (standard Nx pattern)
- Typecheck target auto-inferred by `@nx/js/typescript` plugin
- No manual configuration needed

### Applies To

- All applications (current: web, server; future: mobile, additional APIs)
- Does NOT apply to libraries (they use buildable library pattern)

### Rationale

Different application frameworks have different compilation models:

- **Next.js**: Uses SWC/Turbopack for compilation. TypeScript is only used for type-checking, not code generation. Requires `noEmit: true`.
- **Node.js**: Uses TypeScript compiler for both type-checking and compilation. Compatible with TypeScript Project References.

This workspace uses TypeScript Project References (Nx 20+ recommended approach) for optimal build performance. Next.js apps cannot use this pattern due to `noEmit: true` requirement, so they use single tsconfig.json with manual typecheck configuration.

### When Adding New Applications

- **Next.js apps**: See post-generation-checklist.md for manual typecheck target setup
- **Node.js apps**: Generator handles everything automatically
- **React Native apps** (future): Follow Next.js pattern (will be validated in Phase 2)

### Last Validated

2025-10-21 (Next.js 15.2, Nx 21.6, TypeScript 5.9)

**Reference**:
- `docs/memories/tech-findings-log.md` - "Next.js TypeScript Project References Incompatibility"
- `docs/memories/post-generation-checklist.md` - After `nx g @nx/next:app`

---

## How to Update This Document

When should you add a new pattern?

✅ **DO add** when:
- You discover a framework default that conflicts with our monorepo standards
- You solve a problem that will apply to multiple similar components
- You establish a new convention that should be followed consistently
- Generators create code that needs to be changed to fit our architecture

❌ **DON'T add** when:
- It's a one-time fix for a specific file
- It's already well-documented in official framework docs
- It's a personal preference, not a technical requirement
- It applies to only one component

**Update process:**
1. Document the pattern using the template in this file
2. Update `docs/memories/post-generation-checklist.md` if it's a post-generation step
3. Test the pattern with a new component to verify it works
4. Update `last-updated` date in frontmatter

---

## Pattern Template

Use this template when adding new patterns:

```markdown
## Pattern N: [Pattern Name]

**Our Standard**: [One-sentence description]

### Pattern

[Code examples and configuration]

### Applies To

[Which apps/packages this affects]

### Rationale

[Why we chose this approach]
[What problem it solves]
[What alternatives we rejected]

### When Adding New [Components]

**⚠️ Generators may [what they do wrong]:**
[List of issues]

**Required action:**
1. [Step by step fixes]

### Last Validated

[Date] ([Relevant tool versions])

**Reference**: [Link to related docs if applicable]
```
