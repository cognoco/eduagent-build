## Nx Configuration - Nx 22 Upgrade Breaking Changes - 2025-12-12

**Decision:** Document breaking changes discovered during Nx 22.x upgrade (Epic 5b) to prevent future confusion and pattern drift.

**Context:** Upgrading from Nx 21.x to Nx 22.x introduced several breaking changes that required manual intervention. This entry consolidates all findings from the upgrade process for future reference.

**Governing Document:** `docs/roadmap.md` (Epic 5b: Nx 22.x Infrastructure Upgrade)

---

### Finding 1: TypeScript Project References Removal

**Change:** Cross-project TypeScript project references were removed from `apps/server/tsconfig.json`.

**Before (Nx 21.x):**
```json
{
  "references": [
    { "path": "../../packages/schemas" },
    { "path": "../../packages/database" },
    { "path": "../../packages/test-utils" },
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

**After (Nx 22.x):**
```json
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

**Rationale:**
- Nx 22.x uses its own project graph for dependency tracking, making manual TypeScript project references redundant
- Cross-project references caused incremental build complexity without benefit
- Local references (app/spec configs) are retained for TypeScript's internal project structure
- Path resolution continues to work via `tsconfig.base.json` path aliases managed by Nx

**Verification:** CI typecheck target passes, confirming path resolution works correctly.

**Warning Signs (for AI agents):**
- If you see import resolution errors after this change, check `tsconfig.base.json` paths first
- Do NOT re-add cross-project references; use Nx `dependsOn` in `project.json` instead

---

### Finding 2: Next.js 16 ESLint Flat Config Migration

**Change:** Next.js 16 requires ESLint 9 flat config format.

**Impact:**
- `.eslintrc.json` files must migrate to `eslint.config.js` (or `.mjs`)
- ESLint plugins must be updated to versions supporting flat config
- Some rule names and plugin prefixes changed

**Key Configuration Pattern:**
```javascript
// eslint.config.js (flat config)
import { FlatCompat } from '@eslint/eslintrc';
import nxPlugin from '@nx/eslint-plugin';

const compat = new FlatCompat();

export default [
  ...nxPlugin.configs['flat/base'],
  ...compat.extends('next/core-web-vitals'),
  // project-specific rules
];
```

**Warning Signs (for AI agents):**
- If you see ESLint errors about unknown rules, check if the rule exists in ESLint 9
- Do NOT use `.eslintrc.json` format in new Next.js 16 projects
- FlatCompat is required for plugins that haven't migrated to flat config yet

---

### Finding 3: Jest CommonJS Export Requirement

**Change:** Jest configs in Next.js 16 projects must use CommonJS export syntax.

**Problem:** Using ESM `export default` with `next/jest.js` causes:
```
TypeError: nextJest is not a function
```

**Root Cause:**
- `next/jest.js` exports differ between CJS and ESM contexts
- Jest's module resolution interacts poorly with Next.js's hybrid module system
- The workaround uses explicit CJS require with default fallback

**Working Pattern:**
```typescript
// jest.config.ts
const nextJestModule = require('next/jest.js');
const nextJest = nextJestModule.default ?? nextJestModule;

const createJestConfig = nextJest({ dir: './' });

const config: Config = { /* ... */ };

// CommonJS export required: Jest + Next.js 16 have ESM interop issues
module.exports = createJestConfig(config);
```

**Warning Signs (for AI agents):**
- If Jest tests fail with "nextJest is not a function", check the export syntax
- Do NOT convert to `export default` even if TypeScript suggests it
- The `require()` + fallback pattern handles both CJS and ESM contexts

---

### Finding 4: .tsbuildinfo in .gitignore

**Change:** Added `*.tsbuildinfo` to `.gitignore`.

**Rationale:**
- TypeScript incremental build info files are machine-specific
- Committing them causes git noise and merge conflicts
- Nx caches build artifacts separately via its own cache system

---

### Finding 5: Next.js Route Types Generation

**Change:** Added `.next/types/routes.d.ts` generation to web app typecheck target.

**Implementation:**
```json
// apps/web/project.json
{
  "targets": {
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "commands": [
          "next build --experimental-build-mode=compile",
          "tsc -p tsconfig.json --noEmit"
        ]
      }
    }
  }
}
```

**Verification:** CI passes on fresh clone, confirming route types are generated before typecheck.

---

**Alternatives Considered:**
1. Keep TypeScript project references — Rejected: redundant with Nx graph, adds complexity
2. Use ESM export in Jest config — Rejected: causes runtime errors with Next.js 16
3. Keep legacy ESLint config — Rejected: Next.js 16 requires flat config

**References:**
- [Nx 22.x Migration Guide](https://nx.dev/recipes/tips-n-tricks/eslint)
- [Next.js 16 Release Notes](https://nextjs.org/blog)
- [ESLint Flat Config Migration](https://eslint.org/docs/latest/use/configure/migration-guide)
- PR #41: feat(epic-5b): Nx 22.x infrastructure upgrade for Expo SDK 54

### Manifest & Validation Checklist
1. [ ] Add entry to `docs/memories/tech-findings-log/manifest.yaml`
2. [ ] Update `tech-findings-log.core.md` module index
3. [ ] Validation status: `needs_review`
