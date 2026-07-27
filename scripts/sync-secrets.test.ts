// [WI-1643] sync-secrets.js placeholder check false-positives on a comment,
// silently no-oping the local prd secret sync.
//
// The committed apps/api/wrangler.toml carries `account_id = "__CF_ACCOUNT_ID__"`
// plus explanatory comments that also mention the placeholder. After an operator
// renders the config (render-wrangler-kv.mjs), the assignment holds a real id
// but the comments still name the placeholder. The rendered-detection must read
// the actual top-level `account_id` assignment — not the whole file text — or
// the sync skips as "unrendered" and returns ok/results-empty silently.

const {
  buildWranglerBulkArgs,
  findMissingSecretNames,
  isRenderedWranglerToml,
  shouldSkipSync,
  validateApiSentryProject,
} = require('./sync-secrets.js') as {
  buildWranglerBulkArgs: (
    wranglerEnv: string | null,
    workerName: string,
    configPath?: string,
  ) => string[];
  findMissingSecretNames: (
    expectedNames: string[],
    actualNames: string[],
  ) => string[];
  isRenderedWranglerToml: (toml: string) => boolean;
  shouldSkipSync: (isRendered: boolean, configPath?: string) => boolean;
  validateApiSentryProject: (secrets: Record<string, string>) => {
    valid: boolean;
    expectedProjectId: string;
    actualProjectId?: string;
    reason?: string;
  };
};

describe('[WI-1920] API Worker Sentry project identity', () => {
  it('accepts the mentomate-api Sentry project', () => {
    expect(
      validateApiSentryProject({
        SENTRY_DSN:
          'https://public-key@example.ingest.sentry.io/4511717632704592',
      }),
    ).toMatchObject({
      valid: true,
      expectedProjectId: '4511717632704592',
      actualProjectId: '4511717632704592',
    });
  });

  it('rejects the mentomate-mobile Sentry project', () => {
    expect(
      validateApiSentryProject({
        SENTRY_DSN:
          'https://public-key@example.ingest.sentry.io/4511082906452048',
      }),
    ).toMatchObject({
      valid: false,
      expectedProjectId: '4511717632704592',
      actualProjectId: '4511082906452048',
      reason: 'wrong-project',
    });
  });

  it('rejects a malformed Sentry DSN without echoing it', () => {
    const result = validateApiSentryProject({ SENTRY_DSN: 'not-a-dsn' });

    expect(result).toMatchObject({
      valid: false,
      expectedProjectId: '4511717632704592',
      reason: 'invalid-dsn',
    });
    expect(JSON.stringify(result)).not.toContain('not-a-dsn');
  });

  it('allows an absent optional Sentry DSN', () => {
    expect(validateApiSentryProject({})).toEqual({
      valid: true,
      expectedProjectId: '4511717632704592',
    });
  });
});

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

describe('[WI-1641] explicit CI target', () => {
  it('does not silently skip an unrendered repo config when CI supplies an explicit config', () => {
    expect(shouldSkipSync(false, '/tmp/wrangler-secret-sync.jsonc')).toBe(
      false,
    );
  });

  it('keeps the intentional local skip when no explicit config is supplied', () => {
    expect(shouldSkipSync(false)).toBe(true);
  });

  it('targets the named production worker through the explicit config', () => {
    expect(
      buildWranglerBulkArgs(
        'production',
        'mentomate-api-prd',
        '/tmp/wrangler-secret-sync.jsonc',
      ),
    ).toEqual(
      expect.arrayContaining([
        'secret',
        'bulk',
        '--name',
        'mentomate-api-prd',
        '--config',
        '/tmp/wrangler-secret-sync.jsonc',
      ]),
    );
  });

  it('detects any Doppler-managed key stranded after bulk upload', () => {
    expect(
      findMissingSecretNames(
        ['DATABASE_URL', 'ANALYTICS_HASH_KEY'],
        ['DATABASE_URL'],
      ),
    ).toEqual(['ANALYTICS_HASH_KEY']);
  });

  it('allows unrelated Worker-only keys while verifying managed keys', () => {
    expect(
      findMissingSecretNames(
        ['DATABASE_URL'],
        ['DATABASE_URL', 'WORKER_ONLY_KEY'],
      ),
    ).toEqual([]);
  });
});
