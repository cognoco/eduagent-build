import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

// Filter out jsx-a11y/accessible-emoji rule (deprecated in v6.6.0, removed in later versions)
// @nx/eslint-plugin's flat/react config still references it
const reactConfig = nx.configs['flat/react'].map((config) => {
  if (config.rules && 'jsx-a11y/accessible-emoji' in config.rules) {
    const { 'jsx-a11y/accessible-emoji': _, ...rules } = config.rules;
    return { ...config, rules };
  }
  return config;
});

export default [
  ...baseConfig,
  ...reactConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  // Ban hardcoded hex colors in non-token source files.
  // Forces use of NativeWind theme classes or design-tokens instead.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/design-tokens.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/components/AnimatedSplash.tsx',
      'src/components/common/BrandCelebration.tsx',
      'src/components/MentomateLogo.tsx',
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
