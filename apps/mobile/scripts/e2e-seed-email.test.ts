const ORIGINAL_EMAIL_PREFIX = process.env.PLAYWRIGHT_EMAIL_PREFIX;
const ORIGINAL_RUN_ID = process.env.PLAYWRIGHT_RUN_ID;

afterEach(() => {
  if (ORIGINAL_EMAIL_PREFIX === undefined) {
    delete process.env.PLAYWRIGHT_EMAIL_PREFIX;
  } else {
    process.env.PLAYWRIGHT_EMAIL_PREFIX = ORIGINAL_EMAIL_PREFIX;
  }

  if (ORIGINAL_RUN_ID === undefined) {
    delete process.env.PLAYWRIGHT_RUN_ID;
  } else {
    process.env.PLAYWRIGHT_RUN_ID = ORIGINAL_RUN_ID;
  }

  jest.resetModules();
});

function loadRuntimeWithPrefix(
  prefix: string,
): typeof import('../e2e-web/helpers/runtime') {
  jest.resetModules();
  process.env.PLAYWRIGHT_EMAIL_PREFIX = prefix;
  delete process.env.PLAYWRIGHT_RUN_ID;

  return jest.requireActual('../e2e-web/helpers/runtime');
}

describe('buildSeedEmail', () => {
  it('leaves short seed aliases readable', () => {
    const { buildSeedEmail } = loadRuntimeWithPrefix('pw-short-');

    expect(buildSeedEmail('j01')).toBe('pw-short-j01@example.com');
  });

  it('keeps long seed aliases within Clerk local-part limits', () => {
    const prefix = 'pw-playwright-1748338830000-abcd-';
    const { buildSeedEmail } = loadRuntimeWithPrefix(prefix);

    const email = buildSeedEmail('mentor-audit-consent-pending-child-ffff');
    const [localPart, domain] = email.split('@');

    expect(domain).toBe('example.com');
    expect(localPart).toHaveLength(64);
    expect(localPart?.startsWith(prefix)).toBe(true);
  });

  it('keeps shortened long aliases distinct', () => {
    const prefix = 'pw-playwright-1748338830000-abcd-';
    const { buildSeedEmail } = loadRuntimeWithPrefix(prefix);

    const pending = buildSeedEmail('mentor-audit-consent-pending-child-ffff');
    const withdrawn = buildSeedEmail(
      'mentor-audit-consent-withdrawn-child-ffff',
    );

    expect(pending).not.toBe(withdrawn);
    expect(pending.split('@')[0]).toHaveLength(64);
    expect(withdrawn.split('@')[0]).toHaveLength(64);
  });
});
