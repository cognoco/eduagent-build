// [WI-1643] sync-secrets.js placeholder check false-positives on a comment,
// silently no-oping the local prd secret sync.
//
// The committed apps/api/wrangler.toml carries `account_id = "__CF_ACCOUNT_ID__"`
// plus explanatory comments that also mention the placeholder. After an operator
// renders the config (render-wrangler-kv.mjs), the assignment holds a real id
// but the comments still name the placeholder. The rendered-detection must read
// the actual top-level `account_id` assignment — not the whole file text — or
// the sync skips as "unrendered" and returns ok/results-empty silently.

const { isRenderedWranglerToml } = require('./sync-secrets.js') as {
  isRenderedWranglerToml: (toml: string) => boolean;
};

describe('[WI-1643] isRenderedWranglerToml', () => {
  it('treats a rendered account_id assignment as rendered even when comments mention the placeholder', () => {
    const toml = [
      '# The account_id is bound to a `__CF_ACCOUNT_ID__` placeholder so the',
      '# literal id never sits in the repo; render-wrangler-kv.mjs substitutes',
      '# __CF_ACCOUNT_ID__ at deploy time.',
      'name = "mentomate-api"',
      'account_id = "0123456789abcdef0123456789abcdef"',
    ].join('\n');

    expect(isRenderedWranglerToml(toml)).toBe(true);
  });

  it('treats the committed unrendered account_id assignment as unrendered (intentional local skip)', () => {
    const toml = [
      '# rendered at deploy time by render-wrangler-kv.mjs',
      'name = "mentomate-api"',
      'account_id = "__CF_ACCOUNT_ID__"',
    ].join('\n');

    expect(isRenderedWranglerToml(toml)).toBe(false);
  });

  it('does not block when no account_id assignment exists — wrangler surfaces its own error', () => {
    const toml = 'name = "mentomate-api"';

    expect(isRenderedWranglerToml(toml)).toBe(true);
  });
});
