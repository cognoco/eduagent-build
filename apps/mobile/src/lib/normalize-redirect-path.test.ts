import {
  normalizeRedirectPath,
  toInternalAppRedirectPath,
} from './normalize-redirect-path';

describe('normalizeRedirectPath', () => {
  it('returns fallback for undefined value', () => {
    expect(normalizeRedirectPath(undefined)).toBe('/home');
  });

  it('returns fallback for empty string', () => {
    expect(normalizeRedirectPath('')).toBe('/home');
  });

  it('returns fallback for value not starting with /', () => {
    expect(normalizeRedirectPath('home')).toBe('/home');
  });

  it('rejects // prefix (open-redirect guard)', () => {
    expect(normalizeRedirectPath('//evil.example.com')).toBe('/home');
  });

  it('rejects // prefix with path after host', () => {
    expect(normalizeRedirectPath('//evil.example.com/phish')).toBe('/home');
  });

  it('passes through a valid absolute path', () => {
    expect(normalizeRedirectPath('/progress')).toBe('/progress');
  });

  it('strips Expo route groups from path', () => {
    expect(normalizeRedirectPath('/(app)/progress')).toBe('/progress');
  });

  it('uses custom fallback when provided', () => {
    expect(normalizeRedirectPath(undefined, '/dashboard')).toBe('/dashboard');
  });

  it('falls back to /home when custom fallback is not absolute', () => {
    expect(normalizeRedirectPath(undefined, 'relative')).toBe('/home');
  });
});

describe('toInternalAppRedirectPath', () => {
  it('wraps a normalized path with /(app) prefix', () => {
    expect(toInternalAppRedirectPath('/progress')).toBe('/(app)/progress');
  });

  it('returns root as /(app)/home', () => {
    expect(toInternalAppRedirectPath('/')).toBe('/(app)/home');
  });

  it('does not double-wrap if already prefixed', () => {
    expect(toInternalAppRedirectPath('/(app)/home')).toBe('/(app)/home');
  });

  it('rejects open-redirect attempt and returns fallback', () => {
    expect(toInternalAppRedirectPath('//evil.example.com')).toBe('/(app)/home');
  });

  it('uses the provided fallback when value is missing', () => {
    expect(toInternalAppRedirectPath(undefined, '/(app)/quiz')).toBe(
      '/(app)/quiz',
    );
  });

  it('normalizes the provided fallback before wrapping it', () => {
    expect(
      toInternalAppRedirectPath(undefined, '/child/abc?mode=progress'),
    ).toBe('/(app)/child/abc?mode=progress');
  });
});

// [BUG-766] Direct deep-link to /child/{id}?mode=progress used to drop the
// query string during the sign-in → pendingAuthRedirect → replay round-trip,
// landing the user on the unfiltered child detail (or causing the layout to
// think it had arrived at /home). Query and hash must survive all
// normalize / wrap operations.
describe('normalizeRedirectPath — query string preservation [BUG-766]', () => {
  it('preserves a simple query string', () => {
    expect(normalizeRedirectPath('/child/abc?mode=progress')).toBe(
      '/child/abc?mode=progress',
    );
  });

  it('preserves a multi-key query string', () => {
    expect(normalizeRedirectPath('/progress?profileId=p1&mode=detail')).toBe(
      '/progress?profileId=p1&mode=detail',
    );
  });

  it('preserves the query string while stripping the route group', () => {
    expect(normalizeRedirectPath('/(app)/child/abc?mode=settings')).toBe(
      '/child/abc?mode=settings',
    );
  });

  it('preserves the hash fragment', () => {
    expect(normalizeRedirectPath('/library#section')).toBe('/library#section');
  });

  it('still rejects // open-redirect even when query is present', () => {
    expect(normalizeRedirectPath('//evil.example.com?ok=1')).toBe('/home');
  });
});

describe('toInternalAppRedirectPath — query string preservation [BUG-766]', () => {
  it('wraps path and keeps query string', () => {
    expect(toInternalAppRedirectPath('/child/abc?mode=progress')).toBe(
      '/(app)/child/abc?mode=progress',
    );
  });

  it('does not double-wrap when already prefixed and keeps query', () => {
    expect(toInternalAppRedirectPath('/(app)/child/abc?mode=settings')).toBe(
      '/(app)/child/abc?mode=settings',
    );
  });

  it('rejects open-redirect with query and falls back to /(app)/home', () => {
    expect(toInternalAppRedirectPath('//evil.example.com?x=1')).toBe(
      '/(app)/home',
    );
  });
});
