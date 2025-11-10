## After: `nx g @nx/jest:configuration <project>`

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

**References**:
- `docs/memories/adopted-patterns.md` - Pattern 2 (Module Resolution)
- `docs/memories/adopted-patterns.md` - Pattern 10 (Testing Enhancement Libraries)

---
