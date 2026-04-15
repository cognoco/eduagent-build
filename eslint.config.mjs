import nx from '@nx/eslint-plugin';

// Filter out jsx-a11y/accessible-emoji rule from react config
// (deprecated in eslint-plugin-jsx-a11y v6.6.0, removed in later versions)
const reactConfigFiltered = nx.configs['flat/react'].map((config) => {
  if (config.rules && 'jsx-a11y/accessible-emoji' in config.rules) {
    const { 'jsx-a11y/accessible-emoji': _, ...rules } = config.rules;
    return { ...config, rules };
  }
  return config;
});

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/coverage', '**/.nx', '**/.wrangler'],
  },
  // React/Expo config for mobile app (with deprecated rule filtered out)
  {
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx', 'apps/mobile/**/*.js', 'apps/mobile/**/*.jsx'],
  },
  ...reactConfigFiltered.map(config => ({
    ...config,
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx', 'apps/mobile/**/*.js', 'apps/mobile/**/*.jsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$', '@eduagent/api'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      // Test files use jest.mock() with factories, which NX misinterprets as
      // lazy-loading. This taints the library and blocks static imports in
      // source files. Disable the rule for tests — they are not architectural.
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
];
