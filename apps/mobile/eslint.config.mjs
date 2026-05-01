import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import requireMutateErrorHandling from './eslint-rules/require-mutate-error-handling.mjs';

// Filter out jsx-a11y/accessible-emoji rule (deprecated in v6.6.0, removed in later versions)
// @nx/eslint-plugin's flat/react config still references it
const reactConfig = nx.configs['flat/react'].map((config) => {
  if (config.rules && 'jsx-a11y/accessible-emoji' in config.rules) {
    const { 'jsx-a11y/accessible-emoji': _, ...rules } = config.rules;
    return { ...config, rules };
  }
  return config;
});

// Local plugin for project-specific rules
const localPlugin = {
  rules: {
    'require-mutate-error-handling': requireMutateErrorHandling,
  },
};

export default [
  ...baseConfig,
  ...reactConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // jsx-a11y/aria-role inherits from nx flat/react and treats every
      // `role="..."` JSX prop as an ARIA attribute, which is wrong for
      // custom components that happen to expose a `role` prop (e.g.
      // `<MessageBubble role="assistant" />`). ignoreNonDOM scopes the
      // check to lowercase intrinsic elements where ARIA actually applies.
      'jsx-a11y/aria-role': ['warn', { ignoreNonDOM: true }],
    },
  },
  // Require visible error handling on every mutateAsync() call.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    plugins: { local: localPlugin },
    rules: {
      'local/require-mutate-error-handling': 'warn',
    },
  },
  // Ban hardcoded hex colors in non-token source files.
  // Forces use of NativeWind theme classes or design-tokens instead.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/design-tokens.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      // Brand graphics — hex IS the brand asset (precedent set by AnimatedSplash).
      'src/components/AnimatedSplash.tsx',
      'src/components/common/BrandCelebration.tsx',
      'src/components/common/MagicPenAnimation.tsx',
      'src/components/MentomateLogo.tsx',
      // Error-boundary fallbacks — render before ThemeProvider is mounted,
      // so they cannot use the React-Context-driven theme tokens.
      'src/app/_layout.tsx',
      'src/app/(app)/session/index.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Property > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Avoid hardcoded hex color values. Use NativeWind theme classes (bg-surface, text-primary) or design tokens from design-tokens.ts instead.',
        },
      ],
    },
  },
  {
    ignores: ['.expo', 'web-build', 'cache', 'dist', '**/out-tsc'],
  },
];
