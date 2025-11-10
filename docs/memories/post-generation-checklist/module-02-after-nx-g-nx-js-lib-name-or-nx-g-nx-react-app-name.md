## After: `nx g @nx/js:lib <name>` or `nx g @nx/react:app <name>`

### Issue
Generators may create test directories that don't match our adopted pattern (co-located tests in `src/`).

### Required Actions

**1. Check for non-standard test directories**

Look for:
- `__tests__/`
- `specs/`
- `test/`

If any exist, tests need to be migrated.

**2. Move tests to `src/` directory**

```bash
# Example if tests are in __tests__/
mv <project>/__tests__/* <project>/src/
rm -rf <project>/__tests__/
```

**3. Update Jest configuration**

File: `<project>/jest.config.ts`

Ensure testMatch pattern searches only `src/`:
```typescript
export default {
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  // ... other config
};
```

**5. Add workspace dependency for cross‑package imports**

When a project imports a workspace package (e.g., `@nx-monorepo/api-client`), add it to the consumer `package.json` with a workspace version and reinstall:

```json
{
  "dependencies": {
    "@nx-monorepo/api-client": "workspace:*"
  }
}
```

```bash
pnpm install
```

**6. Ensure import style under nodenext**

If the consumer uses `moduleResolution: "nodenext"` (Node apps or test configs), relative imports MUST include the `.js` extension at runtime (TypeScript ESM rule). Adjust local relative imports accordingly.

**7. Ensure Jest config compatibility with ESM packages**

If the package has `"type": "module"`, the Jest config file should use `.cjs` extension (e.g., `jest.config.cjs`).

**4. Update coverage configuration**

File: `<project>/jest.config.ts`

Ensure coverage excludes test files:
```typescript
export default {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
  ],
  // ... other config
};
```

### Validation

Run tests to verify they're discovered correctly:
```bash
pnpm exec nx run <project>:test
```

### Why This Matters

Different test locations across components creates confusion and inconsistency. We've adopted Next.js 15's co-located pattern as our standard.

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 1

---
