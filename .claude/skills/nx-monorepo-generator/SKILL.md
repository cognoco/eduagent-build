---
name: nx-monorepo-generator
description: Use when adding Jest testing configuration to Nx projects to ensure proper TypeScript settings, testing enhancements, and monorepo pattern adherence
---

# Nx Monorepo Generator - Jest Configuration Workflow

## Purpose

This skill guides you through adding Jest testing configuration to Nx projects while ensuring adherence to monorepo-specific patterns. The Nx Jest generator produces defaults that conflict with this workspace's adopted standards - this skill ensures all mandatory post-generation fixes are applied.

## When to Use

Use this skill when:
- Adding Jest to a new or existing Nx project
- Running `nx g @nx/jest:configuration`
- Setting up testing infrastructure for apps or libraries
- A user asks to "add tests", "setup Jest", or "configure testing"

**Critical**: Always use this skill BEFORE and AFTER running the Jest generator to prevent pattern drift.

## Workflow

### Phase 1: Pre-Generation (Determine Project Type)

Before generating Jest configuration, identify the project type to determine which testing enhancements are needed:

**Project Types**:
- **UI Projects** (web apps, future mobile): Need full testing stack (jest-dom, user-event, MSW)
- **Node Projects** (server, APIs): Need jest-dom and conditional MSW (only if testing HTTP endpoints)
- **Logic Projects** (schemas, utilities): Basic Jest only, no enhancements needed

**How to identify**:
- Check `project.json` for executor types (React/Next.js = UI, Node = server)
- Check package purpose (schema/utility libraries = Logic)
- When in doubt, ask the user

### Phase 2: Generate Configuration

Run the Nx Jest configuration generator:

```bash
pnpm exec nx g @nx/jest:configuration <project-name>
```

The generator will create:
- `jest.config.ts`
- `tsconfig.spec.json`
- Updates to `project.json`

**Note**: Generated configuration will have incorrect defaults that must be fixed.

### Phase 3: Post-Generation Fixes (MANDATORY)

Execute ALL steps below based on project type. Skipping steps causes pattern drift.

#### Step 1: Install Testing Enhancement Packages

**For UI Projects**:
```bash
cd apps/<project-name>  # or packages/<project-name>
pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
```

**For Node Projects with HTTP testing**:
```bash
cd apps/<project-name>
pnpm add --save-dev @testing-library/jest-dom msw
```

**For Logic Projects**:
Skip this step - no additional packages needed.

#### Step 2: Create Jest Setup File (UI Projects Only)

**For UI Projects only**, create `jest.setup.ts`:

```typescript
// <project-root>/jest.setup.ts
import '@testing-library/jest-dom';
```

**For Node and Logic Projects**: Skip this step.

#### Step 3: Update jest.config.ts (UI Projects Only)

**For UI Projects only**, add `setupFilesAfterEnv`:

```typescript
// <project-root>/jest.config.ts
export default {
  displayName: '@nx-monorepo/<project>',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'], // Add this line
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/<project>',
};
```

**For Node and Logic Projects**: Skip this step.

#### Step 4: Fix TypeScript Module Resolution (ALL Projects)

**CRITICAL**: The generator creates incorrect TypeScript settings. Fix immediately.

Edit `<project-root>/tsconfig.spec.json`:

**Change this**:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node10"
  }
}
```

**To this**:
```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
}
```

**Why**: The workspace uses `customConditions` in `tsconfig.base.json`, which requires modern module resolution. The generator's `node10` default causes TypeScript compilation errors.

#### Step 5: Verify Jest Types Configuration

Check `<project-root>/tsconfig.spec.json` includes Jest types:

```json
{
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

If missing, add the types array.

#### Step 6: Verify Production Config is Clean

Check `<project-root>/tsconfig.json` does NOT include jest types:

```json
{
  "compilerOptions": {
    "types": []  // Should be empty or exclude "jest"
  }
}
```

Remove `"jest"` if present - it pollutes production code.

### Phase 4: Validation

Run tests to verify configuration works:

```bash
pnpm exec nx run <project-name>:test
```

**Success indicators**:
- Tests run without TypeScript errors
- No module resolution warnings
- Testing enhancements work (if applicable)
- Coverage reports generate correctly

**If tests fail**: Consult `references/jest-patterns.md` for detailed troubleshooting.

## Success Criteria

You've successfully configured Jest when:
- ✅ All post-generation fixes applied (based on project type)
- ✅ TypeScript moduleResolution is `nodenext`
- ✅ Tests run with `nx run <project>:test`
- ✅ No configuration warnings or errors
- ✅ Pattern matches monorepo standards (see references)

## References

For detailed pattern explanations and troubleshooting:
- `references/jest-patterns.md` - Complete Jest configuration patterns, testing enhancement guidelines, and post-generation checklist details

## Key Principle

**Generated code rarely matches monorepo patterns out-of-the-box**. Post-generation fixes are MANDATORY, not optional. This skill ensures consistency across all projects and prevents the pattern drift that causes mysterious failures months later.
