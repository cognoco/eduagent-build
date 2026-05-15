import {
  clearSessionExpiredNotice,
  consumeSessionExpiredNotice,
  markSessionExpired,
  peekSessionExpiredNotice,
} from './auth-expiry';

describe('auth-expiry notice state', () => {
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    clearSessionExpiredNotice();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    clearSessionExpiredNotice();
    nowSpy.mockRestore();
  });

  it('allows the sign-in screen to peek without consuming the notice', () => {
    markSessionExpired();

    expect(peekSessionExpiredNotice()).toBe(true);
    expect(peekSessionExpiredNotice()).toBe(true);
    expect(consumeSessionExpiredNotice()).toBe(true);
    expect(peekSessionExpiredNotice()).toBe(false);
  });

  it('keeps the notice available for five minutes', () => {
    markSessionExpired();

    nowSpy.mockReturnValue(1_000 + 5 * 60_000 - 1);

    expect(peekSessionExpiredNotice()).toBe(true);

    nowSpy.mockReturnValue(1_000 + 5 * 60_000);

    expect(peekSessionExpiredNotice()).toBe(false);
  });
});
