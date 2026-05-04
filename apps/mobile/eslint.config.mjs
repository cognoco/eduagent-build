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
    // Override or add rules here
    rules: {},
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
  // Governance Rule 5 — ban hardcoded hex colors in non-token source files.
  // Forces use of NativeWind theme classes or design-tokens instead.
  // Promoted from 'warn' to 'error' on 2026-05-03; the 13 known violations
  // in session/index.tsx + _layout.tsx were migrated to design tokens
  // (incl. new dangerSoft token) in the same PR.
  //
  // Ignored files are render assets (SVG <Stop> fills, Reanimated worklet
  // colors, brand logo gradients) where NativeWind classes do not apply —
  // SVG attributes and worklet shared values require literal hex strings.
  // BookPageFlipAnimation, BrandCelebration, AnimatedSplash, MentomateLogo
  // all fit this exception.
  // See CLAUDE.md > Non-Negotiable Engineering Rules.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/design-tokens.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/components/AnimatedSplash.tsx',
      'src/components/common/BrandCelebration.tsx',
      'src/components/common/BookPageFlipAnimation.tsx',
      'src/components/MentomateLogo.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Property > Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Avoid hardcoded hex color values. Use NativeWind theme classes (bg-surface, text-primary) or design tokens from design-tokens.ts instead.',
        },
      ],
    },
  },
  // Governance Rule 2 — ban direct expo-secure-store imports outside the
  // wrapper. The wrapper at lib/secure-storage handles web fallback and
  // key sanitization; bypassing it crashes iOS Keychain on invalid chars.
  // Test files are excluded so jest.mock('expo-secure-store') still works
  // for the wrapper's own unit tests.
  // See CLAUDE.md > Repo-Specific Guardrails.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      'src/lib/secure-storage.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-secure-store',
              message:
                'Import from lib/secure-storage instead of expo-secure-store directly. The wrapper handles web fallback and key sanitization.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['.expo', 'web-build', 'cache', 'dist', '**/out-tsc'],
  },
];
