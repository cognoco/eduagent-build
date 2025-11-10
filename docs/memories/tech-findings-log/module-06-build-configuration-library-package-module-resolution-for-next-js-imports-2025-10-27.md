## [Build Configuration] - Library Package Module Resolution for Next.js Imports - 2025-10-27

**Finding:** Library packages (tsconfig.lib.json) that import from Next.js must inherit `moduleResolution: "bundler"` from base config, not override with `"nodenext"`.

**Context:**
During PR #10 remediation, the `supabase-client` package failed to build with errors:
- `TS2307: Cannot find module 'next/headers'` (after adding 'next' dependency)
- `TS2304: Cannot find name 'window'`

The package imported from `next/headers` but TypeScript couldn't resolve the module even though 'next' was properly installed as a dependency.

**Root Cause:**
The package's `tsconfig.lib.json` explicitly set `"moduleResolution": "nodenext"`, overriding the base config's `"bundler"` setting. Next.js 15 uses legacy package structure (files at root like `headers.js`, `headers.d.ts`) without modern package.json "exports" field. The `"nodenext"` resolution is stricter and couldn't resolve Next.js's structure, while `"bundler"` resolution is more lenient and compatible.

**Technical Details:**

**What didn't work:**
```typescript
// packages/supabase-client/tsconfig.lib.json (BEFORE)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",           // ❌ Override
    "moduleResolution": "nodenext", // ❌ Override
    "types": ["node"]
  }
}
```

**What works:**
```typescript
// packages/supabase-client/tsconfig.lib.json (AFTER)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // ✅ Inherit "bundler" from base
    // (no module/moduleResolution override)
    "types": ["node"]
  }
}
```

**Why "bundler" resolution works:**
- More lenient with package structures
- Compatible with both modern exports and legacy file-based packages
- Matches our bundler-everywhere architecture (Next.js, esbuild, Metro)
- Allows extension-less imports

**Why "nodenext" resolution failed:**
- Stricter about ESM package structure
- Expects modern package.json "exports" field
- Next.js 15 uses legacy structure → resolution fails

**Additional Fix Required:**
Added type declaration for browser global:
```typescript
// Type declaration for browser global (package runs in both contexts)
declare const window: unknown | undefined;
```

This was needed because `"types": ["node"]` doesn't include DOM types, but the code checks `typeof window` for server/client detection.

**Pattern Alignment:**
This fix aligns with our documented Pattern 2 in `adopted-patterns.md`:
- **Base config**: `moduleResolution: "bundler"`
- **Production configs** (tsconfig.lib.json): Inherit from base (no override)
- **Test configs** (tsconfig.spec.json): `moduleResolution: "nodenext"`

**Applies To:**
Any library package that imports from Next.js or other packages with legacy structure:
- `packages/supabase-client/` (uses `next/headers`)
- Any future packages that import from Next.js APIs

**Warning Signs (for AI agents):**

❌ **Do not override** moduleResolution in tsconfig.lib.json unless there's specific need
- **Why**: Base "bundler" setting works for vast majority of cases

❌ **Do not add** DOM lib types to fix 'window' errors in library packages
- **Why**: Pollutes Node.js environment with browser globals
- **Instead**: Add local `declare const window` type declaration

✅ **Do inherit** moduleResolution from base config in production type configs
- Consistent with documented Pattern 2
- Compatible with modern and legacy package structures

✅ **Do add** 'next' as dependency if importing from Next.js
- Nx dependency-checks will enforce this
- Required even if 'next' exists in workspace root

**References:**
- PR #10 Issue #1 and #2 remediation
- docs/memories/adopted-patterns.md - Pattern 2 (TypeScript Module Resolution)
- packages/supabase-client/tsconfig.lib.json (corrected configuration)
- packages/supabase-client/src/lib/client.ts (window type declaration)

---
