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
    ignores: ['**/dist', '**/out-tsc', '**/coverage', '**/.nx', '**/.wrangler', 'design_handoff_ui_improvements/**'],
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
      // Non-null assertions (result!) are safe in tests.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test mocks and fixtures routinely use any.
      '@typescript-eslint/no-explicit-any': 'off',
      // Re-enabled with allowShortCircuit/allowTernary for common test patterns.
      // Bare function calls (screen.getByTestId etc.) are already exempt —
      // the rule only flags non-call expressions with no side effects.
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: true,
        allowTernary: true,
      }],
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
  // -------------------------------------------------------------------------
  // Governance Rule 1 — drizzle-orm primitives must not be imported in API
  // route files. Routes keep handlers inline for RPC inference but business
  // logic and DB access belong in services/* via createScopedRepository.
  // See CLAUDE.md > Non-Negotiable Engineering Rules.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              message:
                'Route files must not import drizzle-orm primitives. Move DB access to services/* and use createScopedRepository(profileId). See CLAUDE.md.',
            },
          ],
          patterns: [
            {
              group: ['drizzle-orm/*'],
              message:
                'Route files must not import drizzle-orm primitives. Move DB access to services/* and use createScopedRepository(profileId). See CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // Governance Rule 3 — direct LLM provider SDK imports are restricted to
  // the provider adapters under services/llm/providers/**. All other code
  // must call services/llm/router.ts (or its barrel) so the router's
  // retry/fallback/cost-metering logic stays the single chokepoint.
  // See CLAUDE.md > Non-Negotiable Engineering Rules.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/services/llm/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@anthropic-ai/sdk',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: 'openai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google-ai/generativelanguage',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google/generative-ai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google/genai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google-cloud/vertexai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
          ],
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // Governance Rule 4 — raw process.env reads are banned in API production
  // code. Use the typed config object in apps/api/src/config.ts. The
  // env-validation middleware and the test-only fallbacks in middleware/llm
  // and inngest/helpers are explicitly allow-listed below.
  // See CLAUDE.md > Repo-Specific Guardrails.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/config.ts',
      'apps/api/src/middleware/env-validation.ts',
      'apps/api/src/middleware/llm.ts',
      'apps/api/src/inngest/helpers.ts',
      'apps/api/src/**/*.test.ts',
      'apps/api/src/**/*.spec.ts',
      'apps/api/src/**/*.integration.test.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Use the typed config object from apps/api/src/config.ts instead of raw process.env. See CLAUDE.md.',
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // Governance Rule 5 — route files must not call .select/.insert/.update/
  // .delete directly on the typed-context db handle (`c.get('db')`).
  // Companion to Rule 1 (no drizzle-orm imports in routes): without this
  // rule, a route could still write `c.get('db').select().from(table)` and
  // satisfy the import-only check. Move the query into services/* and use
  // createScopedRepository(profileId).
  // See CLAUDE.md > Non-Negotiable Engineering Rules ("Reads must use
  // createScopedRepository(profileId)"; "Route files must not import ORM
  // primitives, schema tables, or createScopedRepository").
  //
  // Positioned AFTER Rule 4 so the routes-files override of
  // no-restricted-syntax wins for routes. Both selectors are included so
  // Rule 4 (raw process.env ban) still applies to routes too — flat config
  // re-specifying the same rule replaces the prior value, so we re-list the
  // process.env selector here.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/routes/**/*.ts'],
    ignores: [
      'apps/api/src/routes/**/*.test.ts',
      'apps/api/src/routes/**/*.spec.ts',
      'apps/api/src/routes/**/*.integration.test.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Use the typed config object from apps/api/src/config.ts instead of raw process.env. See CLAUDE.md.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(select|insert|update|delete)$/][callee.object.type='CallExpression'][callee.object.callee.object.name='c'][callee.object.callee.property.name='get'][callee.object.arguments.0.value='db']",
          message:
            "Route files must not call .select/.insert/.update/.delete directly on c.get('db'). Move the query into services/* and use createScopedRepository(profileId). See CLAUDE.md.",
        },
      ],
    },
  },
];
