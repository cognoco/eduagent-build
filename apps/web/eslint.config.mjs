import nx from '@nx/eslint-plugin';
import nextPlugin from '@next/eslint-plugin-next';
import baseConfig from '../../eslint.config.mjs';

const config = [
  // Use Next.js 16 flat config (ESLint 9 compatible)
  // API changed in 16.x: flatConfig.* → configs.*
  nextPlugin.configs.recommended,
  nextPlugin.configs['core-web-vitals'],
  ...baseConfig,
  ...nx.configs['flat/react-typescript'],
  {
    ignores: ['.next/**/*', '**/out-tsc'],
  },
];

export default config;
