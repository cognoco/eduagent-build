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
});
