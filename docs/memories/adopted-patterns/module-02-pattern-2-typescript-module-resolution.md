## Pattern 2: TypeScript Module Resolution

**Our Standard**: `moduleResolution: "bundler"` in `tsconfig.base.json`, `"nodenext"` in test configs

**Note:** This pattern is about the `moduleResolution` **compiler setting**. For framework-specific tsconfig **file structure** patterns (Project References vs single file), see Pattern 4.

### Pattern

**Base configuration (`tsconfig.base.json`):**
```json
{
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "customConditions": ["@nx-monorepo/source"]
  }
}
```

**Test configurations (`tsconfig.spec.json`):**
```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext"
  }
}
```

**Production configs** (tsconfig.app.json, tsconfig.lib.json): Inherit "bundler" from base (no override needed)

### Applies To

- Base config: Always "bundler"
- Production configs: Inherit "bundler" (recommended) or explicitly use "nodenext" (also valid)
- Test configs: Always "nodenext"

### Rationale

**Why "bundler" for base config:**
- Matches our bundler-everywhere architecture (Next.js, esbuild, Metro)
- Allows extension-less imports: `import { x } from './file'` (bundlers add extensions)
- More ergonomic developer experience (no `.js` extensions in TypeScript)
- Still supports `customConditions` (required for workspace package resolution)

**Why "nodenext" for test configs:**
- Jest runs in Node.js runtime with ts-jest transpilation
- "bundler" requires `module: "preserve"` which is incompatible with Jest's CommonJS mode
- "nodenext" is detection-based and works with both ESM and CJS
- Ensures tests resolve imports identically to production code

**Technical requirement**: Our workspace uses `customConditions: ["@nx-monorepo/source"]` in `tsconfig.base.json` for modern package resolution. This feature only works with:
- `moduleResolution: "node16"`
- `moduleResolution: "nodenext"`
- `moduleResolution: "bundler"` ✅ (our choice for base)

### When Adding New Projects

**⚠️ Nx generators default to outdated settings:**
- Generated `tsconfig.spec.json` often uses `moduleResolution: "node10"`
- Generated `module` setting may be `"commonjs"`

**Required action after generation:**
1. Open `<project>/tsconfig.spec.json`
2. Change `"moduleResolution": "node10"` → `"moduleResolution": "nodenext"`
3. Change `"module": "commonjs"` → `"module": "nodenext"`
4. Verify tests run: `pnpm exec nx run <project>:test`

**Production configs (tsconfig.app.json, tsconfig.lib.json):**
- No changes needed - inherit "bundler" from base (recommended)
- Or explicitly set "nodenext" if project needs strict Node.js ESM compatibility

**Why test configs need "nodenext":**
- TypeScript's `module` setting only affects type-checking, not runtime
- Jest uses ts-jest to transpile at runtime (always produces CommonJS)
- "nodenext" is detection-based - understands both ESM and CJS
- This prevents Jest/bundler incompatibility

### Known Issue

The `@nx/jest:configuration` generator in Nx 21.6 uses outdated TypeScript defaults (`node10`). This is a known limitation - not a bug in our config.

### Workspace dependency and imports (cross‑package)

- Do not use manual TypeScript `paths` in `tsconfig.base.json` for workspace packages.
- Consumers MUST declare workspace dependencies in their `package.json` when importing workspace packages, e.g.:
  ```json
  {
    "dependencies": {
      "@nx-monorepo/api-client": "workspace:*"
    }
  }
  ```
- When using `moduleResolution: "nodenext"` (Node apps/tests), use explicit `.js` extensions on relative imports.

### Last Validated

2025-10-20 (TypeScript 5.9, Nx 21.6, Jest 30.2)

**Reference**: `docs/memories/tech-findings-log.md` - "Jest Test Module Resolution Strategy"

---
