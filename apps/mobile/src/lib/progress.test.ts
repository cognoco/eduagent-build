import { isProfileStale } from './progress';

const NOW = new Date('2026-05-05T12:00:00.000Z');

describe('isProfileStale', () => {
  it('treats profiles with no sessions as stale', () => {
    expect(
      isProfileStale({ sessionCount: 0, lastSessionAt: null, now: NOW }),
    ).toBe(true);
  });

  it('treats low-activity old profiles as stale', () => {
    expect(
      isProfileStale({
        sessionCount: 1,
        lastSessionAt: '2026-04-01T12:00:00.000Z',
        now: NOW,
      }),
    ).toBe(true);
  });

  it('treats low-activity recent profiles as active enough', () => {
    expect(
      isProfileStale({
        sessionCount: 2,
        lastSessionAt: '2026-05-01T12:00:00.000Z',
        now: NOW,
      }),
    ).toBe(false);
  });

  it('treats profiles with three or more sessions as active enough', () => {
    expect(
      isProfileStale({
        sessionCount: 3,
        lastSessionAt: '2026-04-01T12:00:00.000Z',
        now: NOW,
      }),
    ).toBe(false);
  });
});
