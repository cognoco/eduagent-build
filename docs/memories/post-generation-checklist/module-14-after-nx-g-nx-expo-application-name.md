# After: nx g @nx/expo:application \<name\>

**Generator**: `@nx/expo:application`
**Applies to**: Expo mobile applications in the monorepo

## Checklist

### 1. Set Legacy Architecture Mode

The generator defaults to `newArchEnabled: true`, but SDK 54 is the last version supporting Legacy Architecture.

**File**: `apps/<name>/app.json`

```json
{
  "expo": {
    "newArchEnabled": false
  }
}
```

**Why**: SDK 54 constraint - New Architecture will be required in SDK 55+, but for now we use Legacy Architecture for stability.

### 2. Add Workspace Dependencies for Shared Packages

The generator does NOT add workspace dependencies for shared packages. Without these, pnpm won't create symlinks and TypeScript/Metro can't resolve imports.

**File**: `apps/<name>/package.json`

```json
{
  "dependencies": {
    "@nx-monorepo/api-client": "workspace:*",
    "@nx-monorepo/schemas": "workspace:*"
  }
}
```

**Why**: pnpm requires explicit `workspace:*` protocol to link monorepo packages. Nx project references alone are insufficient.

**After adding**: Run `pnpm install` to create the symlinks.

### 3. Verify ESLint Configuration

The mobile app's ESLint config extends `nx.configs['flat/react']` which references a deprecated rule.

**Verify**: The root `eslint.config.mjs` should filter out `jsx-a11y/accessible-emoji` for mobile files.

**See**: tech-findings-log module TFL-25 for full rationale.

### 4. Validate Path Aliases

After adding workspace dependencies, verify TypeScript path aliases work:

```bash
pnpm exec nx run <name>:typecheck
```

## Verification Commands

```bash
# Verify all checks pass
pnpm exec nx run <name>:lint
pnpm exec nx run <name>:test
pnpm exec nx run <name>:typecheck

# Verify dev server starts
pnpm exec nx run <name>:start
```

## Cross-References

- **tech-findings-log TFL-25**: ESLint deprecated rule issue
- **adopted-patterns**: Test file co-location in `src/`
