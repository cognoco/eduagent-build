# ESLint – @nx/eslint-plugin Deprecated jsx-a11y Rule (2025-12-13)

## Context

When using `@nx/expo:application` generator with ESLint 9 flat config, ESLint fails with:

```
Definition for rule 'jsx-a11y/accessible-emoji' was not found
```

## Root Cause

1. `@nx/eslint-plugin`'s `flat/react` config includes `jsx-a11y/accessible-emoji` rule
2. `eslint-plugin-jsx-a11y` v6.6.0+ removed this rule (deprecated)
3. ESLint validates rule names exist before applying - setting `'off'` doesn't work
4. ESLint 9 flat config doesn't cascade like `.eslintrc` - root config must handle all projects

## Impact

- Any project using `nx.configs['flat/react']` fails ESLint
- lint-staged pre-commit hooks fail because they run ESLint from root
- `nx run <project>:lint` may work (project-specific config) but direct `eslint` calls fail

## Solution

Filter the deprecated rule from the config in root `eslint.config.mjs`:

```javascript
import nx from '@nx/eslint-plugin';

// Filter out deprecated rule
const reactConfigFiltered = nx.configs['flat/react'].map((config) => {
  if (config.rules && 'jsx-a11y/accessible-emoji' in config.rules) {
    const { 'jsx-a11y/accessible-emoji': _, ...rules } = config.rules;
    return { ...config, rules };
  }
  return config;
});

export default [
  // ... base configs ...

  // Apply filtered react config to mobile files
  ...reactConfigFiltered.map(config => ({
    ...config,
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx', 'apps/mobile/**/*.js', 'apps/mobile/**/*.jsx'],
  })),

  // ... other configs ...
];
```

## Key Insight: ESLint Flat Config Doesn't Cascade

Unlike `.eslintrc`, ESLint 9 flat config files in subdirectories are NOT automatically loaded. When running `eslint` from root (as lint-staged does), only the root config is used.

**Implication**: Project-specific ESLint configs (`apps/mobile/eslint.config.mjs`) are only used when:
- Running via Nx: `nx run mobile:lint`
- Explicitly specified: `eslint --config apps/mobile/eslint.config.mjs`

For lint-staged to work, all rules must be handled in root config.

## Verification

```bash
# Should pass without errors
pnpm exec eslint apps/mobile/src/app/App.tsx

# Full lint check
pnpm exec nx run mobile:lint
```

## Versions

| Package | Version | Notes |
|---------|---------|-------|
| @nx/eslint-plugin | 22.2.0 | Includes deprecated rule reference |
| eslint-plugin-jsx-a11y | 6.10.1 | Rule removed |
| eslint | 9.x | Flat config |

## Cross-References

- **post-generation-checklist PGC-14**: Expo generator checklist
