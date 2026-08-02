import {
  alignPlaywrightClerkAudience,
  assertDevelopmentClerkTokenAudience,
} from './clerk-audience';

function tokenWithPayload(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('alignPlaywrightClerkAudience', () => {
  it('fails fast when the local API audience binding is omitted', () => {
    expect(() => alignPlaywrightClerkAudience({}, () => undefined)).toThrow(
      /Local API CLERK_AUDIENCE is unavailable/i,
    );
  });

  it('fails fast when the local API audience binding is empty', () => {
    expect(() => alignPlaywrightClerkAudience({}, () => '   ')).toThrow(
      /Local API CLERK_AUDIENCE is unavailable/i,
    );
  });

  it('rejects a conflicting runner audience without disclosing either value', () => {
    const runnerAudience = 'runner-audience-sentinel';
    const localAudience = 'local-audience-sentinel';

    let thrown: unknown;
    try {
      alignPlaywrightClerkAudience(
        { CLERK_AUDIENCE: runnerAudience },
        () => localAudience,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toMatch(/does not match the local API audience/i);
    expect(String(thrown)).not.toContain(runnerAudience);
    expect(String(thrown)).not.toContain(localAudience);
  });

  it('binds the matching development audience for the local diagnostic', () => {
    const env: Record<string, string | undefined> = {
      CLERK_AUDIENCE: 'development-api',
    };

    expect(alignPlaywrightClerkAudience(env, () => 'development-api')).toBe(
      'development-api',
    );
    expect(env.CLERK_AUDIENCE).toBe('development-api');
  });

  it('does not read or alter local configuration in shared hosted mode', () => {
    const reader = jest.fn(() => {
      throw new Error('shared mode read local configuration');
    });
    const env = {
      PLAYWRIGHT_SKIP_LOCAL_API: '1',
      CLERK_AUDIENCE: 'hosted-audience',
    };

    expect(alignPlaywrightClerkAudience(env, reader)).toBe('hosted-audience');
    expect(reader).not.toHaveBeenCalled();
    expect(env.CLERK_AUDIENCE).toBe('hosted-audience');
  });
});

describe('assertDevelopmentClerkTokenAudience', () => {
  it('rejects an omitted token audience', () => {
    expect(() =>
      assertDevelopmentClerkTokenAudience(
        tokenWithPayload({ sub: 'user_1' }),
        'development-api',
      ),
    ).toThrow(/session token has no audience metadata/i);
  });

  it('rejects a non-matching token audience without disclosing values or token material', () => {
    const token = tokenWithPayload({
      sub: 'user_1',
      aud: 'wrong-audience-sentinel',
    });

    let thrown: unknown;
    try {
      assertDevelopmentClerkTokenAudience(token, 'development-api-sentinel');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toMatch(/does not match the local API audience/i);
    expect(String(thrown)).not.toContain('wrong-audience-sentinel');
    expect(String(thrown)).not.toContain('development-api-sentinel');
    expect(String(thrown)).not.toContain(token);
  });

  it.each(['development-api', ['another-audience', 'development-api']])(
    'accepts matching token audience metadata: %j',
    (aud) => {
      expect(() =>
        assertDevelopmentClerkTokenAudience(
          tokenWithPayload({ sub: 'user_1', aud }),
          'development-api',
        ),
      ).not.toThrow();
    },
  );
});
