import { alignPlaywrightClerkSecret } from './clerk-secret-identity';

describe('alignPlaywrightClerkSecret', () => {
  it('never consults the local API secret reader in shared mode', () => {
    const readLocalApiSecret = jest.fn(() => {
      throw new Error('shared mode consulted the local API secret');
    });
    const env = {
      CLERK_SECRET_KEY: 'sk_test_external',
      PLAYWRIGHT_SKIP_LOCAL_API: '1',
    };

    expect(alignPlaywrightClerkSecret(env, readLocalApiSecret)).toBe(
      'sk_test_external',
    );
    expect(readLocalApiSecret).not.toHaveBeenCalled();
    expect(env.CLERK_SECRET_KEY).toBe('sk_test_external');
  });
});
