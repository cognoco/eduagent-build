import { clearClerkSessionCookies } from '../e2e-web/helpers/mentor-audit-storage-state';

describe('mentor-audit storage-state mutators', () => {
  it('clears all Clerk session cookie variants while preserving unrelated cookies', () => {
    const next = clearClerkSessionCookies({
      cookies: [
        { name: '__session', value: 'legacy-session' },
        { name: '__session_o7qfR7ot', value: 'instance-session' },
        { name: '__clerk_db_jwt', value: 'legacy-db-jwt' },
        { name: '__clerk_db_jwt_o7qfR7ot', value: 'instance-db-jwt' },
        { name: '__client_uat', value: 'legacy-uat' },
        { name: '__client_uat_o7qfR7ot', value: 'instance-uat' },
        { name: 'clerk_active_context', value: 'sess_123:' },
        { name: '__stripe_sid', value: 'keep-stripe' },
        { name: '__cf_bm', value: 'keep-cloudflare' },
      ],
      origins: [],
    });

    expect(next.cookies.map((cookie) => cookie.name)).toEqual([
      '__stripe_sid',
      '__cf_bm',
    ]);
  });
});
