import { isSchoolDayEvening } from './school-day-evening';

// Helper: build a Date on a known weekday/weekend at a chosen hour.
// 2026-06-15 is a Monday; 2026-06-13 is a Saturday; 2026-06-14 is a Sunday.
function at(dateIso: string, hour: number): Date {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setHours(hour, 0, 0, 0);
  return d;
}

describe('isSchoolDayEvening', () => {
  it('is true on a weekday afternoon', () => {
    expect(isSchoolDayEvening(at('2026-06-15', 14))).toBe(true); // Monday 14:00
  });

  it('is true on a weekday evening', () => {
    expect(isSchoolDayEvening(at('2026-06-17', 19))).toBe(true); // Wednesday 19:00
  });

  it('is false on a weekday morning', () => {
    expect(isSchoolDayEvening(at('2026-06-15', 8))).toBe(false); // Monday 08:00
  });

  it('is false on a weekday late night', () => {
    expect(isSchoolDayEvening(at('2026-06-15', 23))).toBe(false); // Monday 23:00
  });

  it('is false on a weekend afternoon', () => {
    expect(isSchoolDayEvening(at('2026-06-13', 15))).toBe(false); // Saturday 15:00
    expect(isSchoolDayEvening(at('2026-06-14', 15))).toBe(false); // Sunday 15:00
  });
});
