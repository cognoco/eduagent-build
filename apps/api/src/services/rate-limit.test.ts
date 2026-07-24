import {
  createSlidingWindowRateLimiter,
  resolveRateLimitIp,
} from './rate-limit';

const START = new Date('2026-07-23T12:00:00.000Z');
const WINDOW_MS = 60_000;

describe('sliding-window rate limiter public contract', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows exactly the configured ceiling before blocking the next attempt', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 3,
      maxEntries: 10,
    });

    expect(limiter.isLimited('client')).toBe(false);
    jest.setSystemTime(START.getTime() + 1);
    expect(limiter.isLimited('client')).toBe(false);
    jest.setSystemTime(START.getTime() + 2);
    expect(limiter.isLimited('client')).toBe(false);
    jest.setSystemTime(START.getTime() + 3);
    expect(limiter.isLimited('client')).toBe(true);
  });

  it('counts events inside the window and excludes an event exactly at the cutoff', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 1,
      maxEntries: 10,
    });

    expect(limiter.isLimited('client')).toBe(false);

    jest.setSystemTime(START.getTime() + WINDOW_MS - 1);
    expect(limiter.isLimited('client')).toBe(true);

    jest.setSystemTime(START.getTime() + WINDOW_MS);
    expect(limiter.isLimited('client')).toBe(false);
  });

  it('keeps allowances isolated between keys', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 1,
      maxEntries: 10,
    });

    expect(limiter.isLimited('client-a')).toBe(false);
    expect(limiter.isLimited('client-a')).toBe(true);
    expect(limiter.isLimited('client-b')).toBe(false);
  });

  it('restores a key allowance after its window has elapsed', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 2,
      maxEntries: 10,
    });

    expect(limiter.isLimited('client')).toBe(false);
    expect(limiter.isLimited('client')).toBe(false);
    expect(limiter.isLimited('client')).toBe(true);

    jest.setSystemTime(START.getTime() + WINDOW_MS);
    expect(limiter.isLimited('client')).toBe(false);
  });

  it('admits no more than the configured ceiling during a same-instant burst', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 3,
      maxEntries: 10,
    });

    const decisions = Array.from({ length: 6 }, () =>
      limiter.isLimited('client'),
    );

    expect(decisions).toEqual([false, false, false, true, true, true]);
  });

  it('retains a touched key and safely resets the evicted least-recently-used key', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 2,
      maxEntries: 2,
    });

    expect(limiter.isLimited('client-a')).toBe(false);
    expect(limiter.isLimited('client-b')).toBe(false);
    expect(limiter.isLimited('client-b')).toBe(false);

    expect(limiter.isLimited('client-a')).toBe(false);
    expect(limiter.isLimited('client-c')).toBe(false);

    expect(limiter.isLimited('client-a')).toBe(true);
    expect(limiter.isLimited('client-b')).toBe(false);
  });

  it('resets an evicted key instead of carrying its exhausted allowance forward', () => {
    const limiter = createSlidingWindowRateLimiter({
      windowMs: WINDOW_MS,
      max: 2,
      maxEntries: 1,
    });

    expect(limiter.isLimited('client-a')).toBe(false);
    expect(limiter.isLimited('client-a')).toBe(false);
    expect(limiter.isLimited('client-b')).toBe(false);

    expect(limiter.isLimited('client-a')).toBe(false);
  });
});

describe('rate-limit IP resolution public contract', () => {
  it('uses the trimmed trusted edge address for a direct request', () => {
    expect(resolveRateLimitIp(' 203.0.113.10 ', undefined)).toBe(
      '203.0.113.10',
    );
  });

  it('attributes a trusted proxy chain to its originating client', () => {
    expect(
      resolveRateLimitIp(undefined, ' 198.51.100.7, 10.0.0.2, 10.0.0.3 '),
    ).toBe('198.51.100.7');
  });

  it.each([
    [undefined, undefined],
    [null, null],
    ['', ''],
    ['   ', '   '],
    [undefined, ', 198.51.100.7'],
    [undefined, ' , '],
  ])(
    'maps empty or malformed forwarded identity values to the shared unknown bucket',
    (cfConnectingIp, xForwardedFor) => {
      expect(resolveRateLimitIp(cfConnectingIp, xForwardedFor)).toBe('unknown');
    },
  );

  it('does not let a client-supplied forwarding value override the trusted edge address', () => {
    expect(
      resolveRateLimitIp(
        '203.0.113.10',
        '198.51.100.99, 192.0.2.44, 192.0.2.45',
      ),
    ).toBe('203.0.113.10');
  });
});
