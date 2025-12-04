//@ts-check

const { composePlugins, withNx } = require('@nx/next');
const { withSentryConfig } = require('@sentry/nextjs');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},

  // Note: instrumentation.ts is automatically loaded in Next.js 15+
  // No experimental flag needed - it's a stable feature now

  // Proxy /api/* requests to the backend server in development
  // This allows the frontend to use relative URLs (/api/...) instead of hardcoded localhost URLs
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
    ];
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

// Compose all plugins first, then wrap with Sentry
const config = composePlugins(...plugins)(nextConfig);

// Sentry configuration options
// See: https://github.com/getsentry/sentry-webpack-plugin#options
const sentryWebpackPluginOptions = {
  // Organization and project slugs for source map uploads
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Authentication token for uploading source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress all logs during build (change to false for debugging)
  silent: true,

  // Hide source maps from public distribution
  // Source maps are uploaded to Sentry but not served to browsers
  hideSourceMaps: true,

  // Disable source map upload telemetry to Sentry
  telemetry: false,

  // Only upload source maps in production builds
  disableServerWebpackPlugin: process.env.NODE_ENV !== 'production',
  disableClientWebpackPlugin: process.env.NODE_ENV !== 'production',

  // Wipe Sentry-related files from build output to reduce bundle size
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to prevent ad-blockers
  tunnelRoute: '/monitoring',

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
};

// Wrap with Sentry configuration
// This must be the last export wrapper
module.exports = withSentryConfig(config, sentryWebpackPluginOptions);
