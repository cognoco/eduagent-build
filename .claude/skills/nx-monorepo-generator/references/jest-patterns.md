# Jest Patterns and Configuration Reference

This document contains detailed patterns extracted from the monorepo's memory system. It provides the rationale and examples behind the Jest configuration workflow.

---

## Pattern: Jest Configuration (Workspace Preset Inheritance)

**Our Standard**: Workspace preset inheritance with proper type isolation

### Configuration Structure

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

**⚠️ Post-generation validation**:
1. Verify `jest.config.ts` has `preset: '../../jest.preset.js'`
2. Verify `tsconfig.spec.json` has `"types": ["jest", "node"]`
3. Verify production `tsconfig.json` does NOT have `"jest"` in types array
4. If any of the above are incorrect, manually fix them

### Last Validated

2025-10-21 (Jest 30.2, Nx 21.6, @nx/jest 21.6)

---

## Pattern: Testing Enhancement Libraries (Mandatory)

**Our Standard**: UI packages MUST use jest-dom, user-event, and MSW for consistent, high-quality testing patterns

### Package Requirements by Type

| Package Type | jest-dom | user-event | MSW | Rationale |
|-------------|----------|------------|-----|-----------|
| **UI (web, future mobile)** | ✅ Required | ✅ Required | ✅ Required | Full testing stack for React components |
| **Node (server, APIs)** | ✅ Required | ❌ N/A | ⚠️ Conditional | Consistent assertions; MSW only if testing HTTP endpoints |
| **Pure Logic (schemas, utils)** | ❌ N/A | ❌ N/A | ❌ N/A | Basic Jest sufficient for logic tests |

### Installation

**UI packages (web, mobile)**:
```bash
pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
```

**Node packages (conditional MSW)**:
Only install MSW if package tests HTTP endpoints:
```bash
pnpm add --save-dev @testing-library/jest-dom msw
```

**Logic packages**:
No testing enhancements needed - use basic Jest.

### Setup Files After Env

**For UI packages** (`apps/web/jest.config.ts`):
```typescript
export default {
  // ... other config
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
```

**Jest Setup File** (`apps/web/jest.setup.ts`):
```typescript
import '@testing-library/jest-dom';
```

### Testing Standards

1. **Interactions**: Use `user-event` for ALL user interactions (clicks, typing, keyboard). NEVER use `fireEvent` directly.
   ```typescript
   // ✅ Correct
   await userEvent.click(screen.getByRole('button'));

   // ❌ Wrong
   fireEvent.click(screen.getByRole('button'));
   ```

2. **Assertions**: Use jest-dom matchers for semantic assertions
   ```typescript
   // ✅ Correct
   expect(element).toBeInTheDocument();
   expect(button).toBeDisabled();

   // ❌ Wrong
   expect(element).toBeTruthy();
   expect(button.disabled).toBe(true);
   ```

3. **API Mocking**: Use MSW for ALL API mocking in component tests. No fetch mocks, no axios mocks.
   ```typescript
   // ✅ Correct
   import { http, HttpResponse } from 'msw';
   import { setupServer } from 'msw/node';

   const server = setupServer(
     http.get('/api/users', () => HttpResponse.json([]))
   );

   beforeAll(() => server.listen());
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());
   ```

4. **Test IDs**: Use `data-testid` ONLY when semantic queries fail. Prefer `getByRole`, `getByLabelText`, `getByText`.
   ```typescript
   // ✅ Correct (semantic query)
   screen.getByRole('button', { name: /submit/i });

   // ⚠️ Use only when semantic query impossible
   screen.getByTestId('custom-widget');
   ```

5. **Async Operations**: Always use `await` with user-event. Always use `findBy*` for elements appearing after async operations.
   ```typescript
   // ✅ Correct
   await userEvent.click(button);
   const result = await screen.findByText(/success/i);

   // ❌ Wrong
   userEvent.click(button); // Missing await
   const result = screen.getByText(/success/i); // Should be findBy for async
   ```

### Applies To

- **Mandatory**: All UI packages (web, future mobile apps)
- **Conditional**: Node packages with HTTP endpoint testing (server APIs)
- **Not Applicable**: Pure logic packages (schemas, utilities)

### Rationale

**Why mandatory for AI-driven development:**
- ✅ **Reduces AI decision overhead**: Eliminates "which testing approach?" questions on every test
- ✅ **Consistent test generation**: AI agents follow explicit patterns instead of making choices
- ✅ **Industry standard alignment**: React Testing Library official recommendations (2025)
- ✅ **Better test quality**: Semantic assertions, real user interactions, actual API contracts
- ✅ **Monorepo consistency**: All UI packages use identical testing patterns

**Why these specific libraries:**
- **jest-dom**: Semantic matchers provide better error messages for non-technical reviewers
- **user-event**: Simulates real browser interactions (click propagation, focus management)
- **MSW**: Tests actual HTTP contracts, not implementation details (fetch/axios internals)

**Why package-type conditionals:**
- **UI packages**: Need full stack (DOM assertions, user interactions, API mocking)
- **Node packages**: Need consistent assertions (jest-dom) but not browser interactions
- **Logic packages**: Complex patterns would be overkill for pure function tests

### Last Validated

2025-10-28 (React Testing Library 15.0.0, user-event 14.5.0, jest-dom 6.6.3, MSW 2.0.0)

---

## Post-Generation Checklist: After `nx g @nx/jest:configuration`

### Issue

Nx generator creates `tsconfig.spec.json` with outdated TypeScript module resolution settings that are incompatible with our workspace configuration.

### Required Actions

**1. Install testing enhancement packages (UI projects only)**

For UI projects (web, future mobile):
```bash
pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
```

For Node projects with HTTP endpoint testing:
```bash
pnpm add --save-dev @testing-library/jest-dom msw
```

For pure logic packages (schemas, utils):
```bash
# No additional packages needed - skip this step
```

**2. Create Jest setup file (UI projects only)**

File: `<project>/jest.setup.ts`

```typescript
import '@testing-library/jest-dom';
```

**3. Update jest.config.ts (UI projects only)**

File: `<project>/jest.config.ts`

Add `setupFilesAfterEnv`:
```typescript
export default {
  displayName: '@nx-monorepo/<project>',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'], // ✅ Add this
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/<project>',
};
```

**4. Update TypeScript module resolution**

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

**5. Verify Jest types are included**

File: `<project>/tsconfig.spec.json`

Ensure types array exists:
```json
{
  "compilerOptions": {
    "types": ["jest", "node"]
  }
}
```

**6. Verify production config is clean**

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

**Testing enhancements**: Our monorepo uses mandatory testing patterns (jest-dom, user-event, MSW) for consistent, high-quality tests across all UI packages. This eliminates AI decision overhead and ensures industry-standard testing practices.

**Module resolution**: Our workspace uses `customConditions` in `tsconfig.base.json`, which requires modern module resolution (`nodenext`). The generator's default (`node10`) causes TypeScript compilation errors.

---

## Additional Context

### TypeScript Module Resolution Deep Dive

**Why "nodenext" for test configs:**
- Jest runs in Node.js runtime with ts-jest transpilation
- "bundler" requires `module: "preserve"` which is incompatible with Jest's CommonJS mode
- "nodenext" is detection-based and works with both ESM and CJS
- Ensures tests resolve imports identically to production code

**Technical requirement**: Our workspace uses `customConditions: ["@nx-monorepo/source"]` in `tsconfig.base.json` for modern package resolution. This feature only works with:
- `moduleResolution: "node16"`
- `moduleResolution: "nodenext"`
- `moduleResolution: "bundler"` ✅ (our choice for base)

### Known Issue

The `@nx/jest:configuration` generator in Nx 21.6 uses outdated TypeScript defaults (`node10`). This is a known limitation - not a bug in our config.

**Last Validated**: 2025-10-20 (TypeScript 5.9, Nx 21.6, Jest 30.2)

---

## Summary

The key to successful Jest configuration in this monorepo:

1. **Always run post-generation fixes** - Generator defaults are incompatible
2. **Match project type to enhancements** - UI/Node/Logic have different needs
3. **Fix TypeScript moduleResolution** - node10 → nodenext (CRITICAL)
4. **Validate immediately** - Run tests before proceeding

Following these patterns prevents pattern drift and ensures all projects test consistently.
