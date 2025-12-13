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
  {
    ignores: ['.expo', 'web-build', 'cache', 'dist', '**/out-tsc'],
  },
];
