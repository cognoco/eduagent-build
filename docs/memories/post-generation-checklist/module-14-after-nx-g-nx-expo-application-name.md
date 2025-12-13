# After: nx g @nx/expo:application \<name\>

**Generator**: `@nx/expo:application`
**Applies to**: Expo mobile applications in the monorepo

## Checklist

### 1. Verify Architecture Mode Setting

The generator defaults to `newArchEnabled: true`. **This is the recommended setting for most projects.**

**File**: `apps/<name>/app.json`

**Recommended (default):**
```json
{
  "expo": {
    "newArchEnabled": true
  }
}
```

**When to keep `true` (RECOMMENDED for most projects):**
- 75%+ of SDK 53/54 projects already use New Architecture successfully
- Major libraries (Reanimated v4, FlashList v2) now ONLY support New Architecture
- SDK 55 will REQUIRE New Architecture (no opt-out possible)
- New React/RN features only available in New Architecture

**When to set `false` (only for specific blockers):**
- Using NativeWind (requires Reanimated v3, which doesn't support New Arch)
- Using unmaintained third-party libraries with no New Arch support
- Explicitly following a staged migration strategy (upgrade SDK first, then architecture)

**Note**: SDK 54 is the LAST version supporting Legacy Architecture. Evaluate dependencies before setting to `false`—it only delays the inevitable migration.

**Sources**: [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54), [New Architecture Guide](https://docs.expo.dev/guides/new-architecture/)

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
