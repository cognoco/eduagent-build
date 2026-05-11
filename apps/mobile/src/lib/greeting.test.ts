import { getGreeting, getTimeOfDay } from './greeting';

describe('getTimeOfDay', () => {
  it('returns morning between 5:00 and 11:59', () => {
    expect(getTimeOfDay(new Date('2026-04-08T05:00:00'))).toBe('morning');
    expect(getTimeOfDay(new Date('2026-04-08T11:59:00'))).toBe('morning');
  });

  it('returns afternoon between 12:00 and 16:59', () => {
    expect(getTimeOfDay(new Date('2026-04-08T12:00:00'))).toBe('afternoon');
    expect(getTimeOfDay(new Date('2026-04-08T16:59:00'))).toBe('afternoon');
  });

  it('returns evening from 17:00 onward and through the night', () => {
    expect(getTimeOfDay(new Date('2026-04-08T17:00:00'))).toBe('evening');
    expect(getTimeOfDay(new Date('2026-04-08T23:59:00'))).toBe('evening');
    expect(getTimeOfDay(new Date('2026-04-09T04:59:00'))).toBe('evening');
  });
});

describe('getGreeting', () => {
  describe('time-of-day titles', () => {
    it('returns morning greeting at 8am', () => {
      const now = new Date('2026-04-07T08:00:00');
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Good morning, Alex!',
        subtitle: 'Fresh mind, fresh start',
      });
    });

    it('returns afternoon greeting at 14:00', () => {
      const now = new Date('2026-04-08T14:00:00');
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Good afternoon, Alex!',
        subtitle: "Let's keep going",
      });
    });

    it('returns evening greeting at 19:00', () => {
      const now = new Date('2026-04-08T19:00:00');
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Good evening, Alex!',
        subtitle: 'Winding down or powering through?',
      });
    });

    it('returns night greeting at 23:00', () => {
      const now = new Date('2026-04-08T23:00:00');
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Hey, Alex!',
        subtitle: 'Burning the midnight oil?',
      });
    });
  });

  describe('boundary cases', () => {
    it('treats 4:59 as night', () => {
      const now = new Date('2026-04-08T04:59:00');
      expect(getGreeting('Alex', now).title).toBe('Hey, Alex!');
    });

    it('treats 5:00 as morning', () => {
      const now = new Date('2026-04-08T05:00:00');
      expect(getGreeting('Alex', now).title).toBe('Good morning, Alex!');
    });

    it('treats 11:59 as morning', () => {
      const now = new Date('2026-04-08T11:59:00');
      expect(getGreeting('Alex', now).title).toBe('Good morning, Alex!');
    });

    it('treats 12:00 as afternoon', () => {
      const now = new Date('2026-04-08T12:00:00');
      expect(getGreeting('Alex', now).title).toBe('Good afternoon, Alex!');
    });

    it('treats 16:59 as afternoon', () => {
      const now = new Date('2026-04-08T16:59:00');
      expect(getGreeting('Alex', now).title).toBe('Good afternoon, Alex!');
    });

    it('treats 17:00 as evening', () => {
      const now = new Date('2026-04-08T17:00:00');
      expect(getGreeting('Alex', now).title).toBe('Good evening, Alex!');
    });

    it('treats 20:59 as evening', () => {
      const now = new Date('2026-04-08T20:59:00');
      expect(getGreeting('Alex', now).title).toBe('Good evening, Alex!');
    });

    it('treats 21:00 as night', () => {
      const now = new Date('2026-04-08T21:00:00');
      expect(getGreeting('Alex', now).title).toBe('Hey, Alex!');
    });
  });

  describe('day-of-week subtitle overrides', () => {
    it('returns Monday override', () => {
      const now = new Date('2026-04-06T09:00:00');
      expect(getGreeting('Alex', now).subtitle).toBe('Fresh week ahead!');
    });

    it('returns Friday override', () => {
      const now = new Date('2026-04-10T15:00:00');
      expect(getGreeting('Alex', now).subtitle).toBe('Happy Friday!');
    });

    it('returns weekend override for Saturday', () => {
      const now = new Date('2026-04-11T10:00:00');
      expect(getGreeting('Alex', now).subtitle).toBe('Weekend learning? Nice!');
    });

    it('returns weekend override for Sunday', () => {
      const now = new Date('2026-04-12T22:00:00');
      expect(getGreeting('Alex', now).subtitle).toBe('Weekend learning? Nice!');
    });
  });

  it('uses current time when no date provided', () => {
    const result = getGreeting('Alex');
    expect(result.title).toContain('Alex');
    expect(result.subtitle).toBeTruthy();
  });
});
