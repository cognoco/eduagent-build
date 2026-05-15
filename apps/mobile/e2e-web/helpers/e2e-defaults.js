/** Shared E2E defaults — imported by runtime.ts and serve-exported-web.mjs. */
const defaultApiUrl =
  process.env.PLAYWRIGHT_SKIP_LOCAL_API === '1'
    ? 'https://api-test.mentomate.com'
    : 'http://127.0.0.1:8787';

module.exports = { defaultApiUrl };
