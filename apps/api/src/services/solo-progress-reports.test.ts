import { isLocalHour9ForTimezone } from './solo-progress-reports';

describe('isLocalHour9ForTimezone', () => {
  it('falls back to UTC hour when timezone is missing or invalid', () => {
    const nineUtc = new Date('2026-05-11T09:00:00.000Z');
    expect(isLocalHour9ForTimezone(null, nineUtc)).toBe(true);
    expect(isLocalHour9ForTimezone('Not/AZone', nineUtc)).toBe(true);
  });
});
