import type {
  ChildSession,
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import {
  formatReportDate,
  getLatestReport,
  sessionFocusTitle,
} from './progress-report-helpers';

const weeklyFixture = (reportWeek: string): WeeklyReportSummary =>
  ({
    reportWeek,
  }) as unknown as WeeklyReportSummary;

const monthlyFixture = (reportMonth: string): MonthlyReportSummary =>
  ({
    reportMonth,
  }) as unknown as MonthlyReportSummary;

describe('formatReportDate', () => {
  // Locale-independent assertions: we cannot reliably override the runtime
  // locale that Node's ICU honors, so assert on numeric / separator structure
  // instead of month names.

  it('weekly: 2026-05-04 spans 2026-05-04 .. 2026-05-10 (digits 4 and 10 present, separator " - ")', () => {
    const result = formatReportDate({
      kind: 'weekly',
      report: weeklyFixture('2026-05-04'),
    });
    expect(result).toContain(' - ');
    expect(result).toMatch(/\b4\b/);
    expect(result).toMatch(/\b10\b/);
  });

  it('monthly with YYYY-MM input contains the year', () => {
    const result = formatReportDate({
      kind: 'monthly',
      report: monthlyFixture('2026-05'),
    });
    expect(result).toContain('2026');
    expect(result.length).toBeGreaterThan(0);
  });

  it('monthly with YYYY-MM-DD input (defensive against schema drift) contains the year', () => {
    const result = formatReportDate({
      kind: 'monthly',
      report: monthlyFixture('2026-05-01'),
    });
    expect(result).toContain('2026');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('getLatestReport', () => {
  const weekly = weeklyFixture('2026-05-04');
  const monthly = monthlyFixture('2026-05');

  it('weekly present + monthly present → returns weekly', () => {
    const result = getLatestReport([weekly], [monthly]);
    expect(result).toEqual({ kind: 'weekly', report: weekly });
  });

  it('weekly empty + monthly present → returns monthly', () => {
    const result = getLatestReport([], [monthly]);
    expect(result).toEqual({ kind: 'monthly', report: monthly });
  });

  it('both empty → returns null', () => {
    expect(getLatestReport([], [])).toBeNull();
  });

  it('both undefined → returns null', () => {
    expect(getLatestReport(undefined, undefined)).toBeNull();
  });
});

describe('sessionFocusTitle', () => {
  const baseSession = {
    sessionId: 's1',
    startedAt: '2026-05-01T00:00:00Z',
  } as unknown as ChildSession;

  it('returns homeworkSummary.displayTitle when all fields present', () => {
    const session = {
      ...baseSession,
      homeworkSummary: { displayTitle: 'Homework focus' },
      topicTitle: 'Topic',
      subjectName: 'Subject',
      displayTitle: 'Display',
    } as unknown as ChildSession;
    expect(sessionFocusTitle(session)).toBe('Homework focus');
  });

  it('falls back to topicTitle when homeworkSummary missing', () => {
    const session = {
      ...baseSession,
      topicTitle: 'Topic',
      subjectName: 'Subject',
      displayTitle: 'Display',
    } as unknown as ChildSession;
    expect(sessionFocusTitle(session)).toBe('Topic');
  });

  it('falls back to subjectName when homeworkSummary and topicTitle missing', () => {
    const session = {
      ...baseSession,
      subjectName: 'Subject',
      displayTitle: 'Display',
    } as unknown as ChildSession;
    expect(sessionFocusTitle(session)).toBe('Subject');
  });

  it('falls back to "Learning session" when all four nullable fields missing', () => {
    expect(sessionFocusTitle(baseSession)).toBe('Learning session');
  });
});
