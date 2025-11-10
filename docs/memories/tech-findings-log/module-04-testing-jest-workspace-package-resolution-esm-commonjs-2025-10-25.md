## [Testing] - Jest Workspace Package Resolution (ESM/CommonJS) - 2025-10-25

**Problem:** Server tests (CommonJS) failed with "Unexpected token 'export'" when importing from `@nx-monorepo/schemas` package (ESM). Jest was loading compiled dist/index.js instead of source TypeScript files.

**Context:**
- Server builds as CommonJS (`format: "cjs"` in esbuild config)
- Schemas package is ESM (`"type": "module"` in package.json)
- Schemas package exports have `"@nx-monorepo/source": "./src/index.ts"` condition
- Jest's default resolver loaded from `dist/index.js` (ESM) which failed to parse in CommonJS context

**Root Cause:**
1. Jest resolved `@nx-monorepo/schemas` to dist/index.js (ESM output)
2. Jest's CommonJS runtime couldn't parse ESM export statements
3. ts-jest transformer only processed files included in tsconfig.spec.json
4. Nx's @nx-monorepo/source export condition wasn't being used by Jest's resolver

**Attempted Fixes (Failed):**
1. `transformIgnorePatterns: ['node_modules/(?!(@nx-monorepo)/)']` - Didn't change resolution path
2. `customExportConditions` in Jest config - Not a valid Jest option (only works in testEnvironmentOptions)
3. `moduleNameMapper` alone - Resolved to source but ts-jest didn't transform it
4. Adding workspace packages to tsconfig.spec.json includes - Source loaded but still not transformed

**Solution (3 Parts):**

1. **Configure Node export conditions** in jest.config.cjs:
```javascript
testEnvironmentOptions: {
  customExportConditions: ['@nx-monorepo/source', 'node', 'require', 'default'],
}
```
This tells Node's module resolver to prefer the `@nx-monorepo/source` export condition, loading `src/index.ts` instead of `dist/index.js`.

2. **Switch to @swc/jest transformer**:
```javascript
transform: {
  '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
}
```
@swc/jest transforms all TypeScript files uniformly without respecting tsconfig includes. This is simpler and more reliable for workspace packages than ts-jest.

3. **Convert jest.config to .cjs**:
- Renamed from `jest.config.ts` to `jest.config.cjs`
- Avoids ESM `__dirname is not defined` error
- Matches pattern used in api-client package

**Files Changed:**
- `apps/server/jest.config.cjs` - New config with swc/jest and export conditions
- `apps/server/.spec.swcrc` - New SWC configuration for test transformation
- `apps/server/tsconfig.spec.json` - Restored to include all src files (for proper type checking)

**Pattern for Future Projects:**

When a Node.js project needs to import workspace packages that are ESM:

1. Use `.cjs` extension for jest.config to avoid ESM issues
2. Configure testEnvironmentOptions with custom export conditions:
   ```javascript
   testEnvironmentOptions: {
     customExportConditions: ['@nx-monorepo/source', 'node', 'require', 'default'],
   }
   ```
3. Use @swc/jest instead of ts-jest for simpler transformation:
   ```javascript
   const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'));
   swcJestConfig.swcrc = false;

   transform: {
     '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
   }
   ```
4. Create `.spec.swcrc` with standard TypeScript parser config

**Why This Works:**
- `customExportConditions` makes Node load source files via `@nx-monorepo/source` condition
- @swc/jest transforms all .ts files it encounters (no tsconfig restrictions)
- Source TypeScript is transformed before Jest runs it
- No ESM/CommonJS mismatch because we never load the ESM dist output

**Validation:**
- ✅ Server tests pass (including integration tests with supertest)
- ✅ Type checking passes (tsconfig.spec.json includes all source files)
- ✅ All quality gates pass (lint, test, build, typecheck)

**References:**
- Node.js: [Conditional exports](https://nodejs.org/api/packages.html#conditional-exports)
- Jest: [testEnvironmentOptions](https://jestjs.io/docs/configuration#testenvironmentoptions-object)
- @swc/jest: [SWC Jest transformer](https://swc.rs/docs/usage/jest)
- Implementation: `apps/server/jest.config.cjs`, `apps/server/.spec.swcrc` (2025-10-25)
- Investigation: Sequential Thinking + troubleshooting session (2025-10-25)

---
