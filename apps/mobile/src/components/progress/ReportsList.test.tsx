import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReportsList } from './ReportsList';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'parentView.index.firstReportSoon') {
        return 'The first report will arrive at the end of the month';
      }
      if (key === 'progress.latestReport.empty') {
        return 'Your next weekly or monthly report will appear here once there is enough learning to summarize.';
      }
      if (key === 'parentView.reports.weekOf') return 'Week of';
      if (key === 'parentView.reports.newBadge') return 'New';
      return key;
    },
  }),
}));

const weeklyReport = {
  id: 'weekly-1',
  reportWeek: '2026-05-04',
  createdAt: '2026-05-11T00:00:00.000Z',
  viewedAt: null,
  headlineStat: {
    value: 3,
    label: 'Topics explored',
    comparison: '3 new this week',
  },
};

const monthlyReport = {
  id: 'monthly-1',
  reportMonth: '2026-04',
  createdAt: '2026-05-01T00:00:00.000Z',
  viewedAt: null,
  headlineStat: {
    value: 8,
    label: 'Sessions',
    comparison: 'active month',
  },
};

const viewedMonthlyReport = {
  ...monthlyReport,
  id: 'monthly-2',
  viewedAt: '2026-05-02T10:00:00.000Z',
};

describe('ReportsList — empty state', () => {
  it('[WI-2186] does not promise month-end when a weekly report can arrive first', () => {
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    screen.getByRole('summary');
    screen.getByText(
      'Your next weekly or monthly report will appear here once there is enough learning to summarize.',
    );
    expect(
      screen.queryByText(
        'The first report will arrive at the end of the month',
      ),
    ).toBeNull();
  });

  it('[WI-2186] keeps compact-screen empty copy screen-reader discoverable and untruncated', () => {
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    const summary = screen.getByRole('summary');
    expect(summary).toHaveProp('testID', 'reports-list-empty');
    expect(summary.props.numberOfLines).toBeUndefined();
  });

  it('does NOT render empty state when only weekly is populated', () => {
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[weeklyReport as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('reports-list-empty')).toBeNull();
    screen.getByTestId('weekly-report-card-weekly-1');
  });

  it('does NOT render empty state when only monthly is populated', () => {
    render(
      <ReportsList
        monthlyReports={[monthlyReport as never]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('reports-list-empty')).toBeNull();
    screen.getByTestId('report-card-monthly-1');
  });
});

describe('ReportsList — mixed list', () => {
  it('renders both weekly and monthly rows sorted by date descending', () => {
    render(
      <ReportsList
        monthlyReports={[monthlyReport as never]}
        weeklyReports={[weeklyReport as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    // Both rows present
    screen.getByTestId('weekly-report-card-weekly-1');
    screen.getByTestId('report-card-monthly-1');
    // Verify weekly card appears before monthly (2026-05-04 > 2026-04)
    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(2);
    // First row is the weekly report (more recent date)
    expect(rows[0]).toHaveProp('testID', 'weekly-report-card-weekly-1');
    // Second row is the monthly report
    expect(rows[1]).toHaveProp('testID', 'report-card-monthly-1');
    screen.getByText(/Week of/);
    screen.getByText('Topics explored: 3');
    screen.getByText('Sessions: 8');
  });

  it('calls onPressWeekly with correct id when weekly row pressed', () => {
    const onPressWeekly = jest.fn();
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[weeklyReport as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={onPressWeekly}
      />,
    );

    fireEvent.press(screen.getByTestId('weekly-report-card-weekly-1'));
    expect(onPressWeekly).toHaveBeenCalledWith('weekly-1');
  });

  it('calls onPressMonthly with correct id when monthly row pressed', () => {
    const onPressMonthly = jest.fn();
    render(
      <ReportsList
        monthlyReports={[monthlyReport as never]}
        weeklyReports={[]}
        onPressMonthly={onPressMonthly}
        onPressWeekly={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('report-card-monthly-1'));
    expect(onPressMonthly).toHaveBeenCalledWith('monthly-1');
  });
});

describe('ReportsList — limit', () => {
  it('truncates combined list to the limit', () => {
    const weeklyReport2 = {
      ...weeklyReport,
      id: 'weekly-2',
      reportWeek: '2026-05-11',
    };
    const weeklyReport3 = {
      ...weeklyReport,
      id: 'weekly-3',
      reportWeek: '2026-04-27',
    };
    render(
      <ReportsList
        monthlyReports={[monthlyReport as never]}
        weeklyReports={[
          weeklyReport as never,
          weeklyReport2 as never,
          weeklyReport3 as never,
        ]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
        limit={2}
      />,
    );

    // Only 2 rows should appear
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });
});

describe('ReportsList — showNewBadge', () => {
  it('does not show "New" badge by default', () => {
    render(
      <ReportsList
        monthlyReports={[monthlyReport as never]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    expect(screen.queryByText('New')).toBeNull();
  });

  it('shows "New" badge for unviewed reports when showNewBadge=true', () => {
    render(
      <ReportsList
        monthlyReports={[monthlyReport as never]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
        showNewBadge
      />,
    );

    screen.getByText('New');
  });

  it('does not show "New" badge for already viewed reports', () => {
    render(
      <ReportsList
        monthlyReports={[viewedMonthlyReport as never]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
        showNewBadge
      />,
    );

    expect(screen.queryByText('New')).toBeNull();
  });

  it('can suppress row badges when the latest report is highlighted elsewhere', () => {
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[weeklyReport as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
        showNewBadge
        newReportId={null}
      />,
    );

    expect(screen.queryByText('New')).toBeNull();
  });

  it('can restrict the "New" badge to one report row', () => {
    const weeklyReport2 = {
      ...weeklyReport,
      id: 'weekly-2',
      reportWeek: '2026-05-11',
    };

    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[weeklyReport as never, weeklyReport2 as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
        showNewBadge
        newReportId="weekly-2"
      />,
    );

    expect(screen.getAllByText('New')).toHaveLength(1);
    screen.getByTestId('weekly-report-card-weekly-2');
  });
});

describe('ReportsList — mixed YYYY-MM and YYYY-MM-DD sort (B34)', () => {
  // Bug 34: lexicographic sort across mixed monthly (YYYY-MM) and weekly
  // (YYYY-MM-DD) formats is wrong because '2026-04' < '2026-04-01' in plain
  // string compare, even though they refer to the same calendar day.
  //
  // Expected (CORRECT) descending order after normalization (YYYY-MM → YYYY-MM-01):
  //   weekly  2026-04-15  → '2026-04-15'
  //   weekly  2026-04-01  → '2026-04-01'
  //   monthly 2026-04     → '2026-04-01'  (ties with weekly 2026-04-01)
  //   weekly  2026-03-31  → '2026-03-31'
  //
  // OLD (BROKEN) order — what the previous localeCompare produced:
  //   weekly  2026-04-15  > '2026-04'  → fine
  //   weekly  2026-04-01  > '2026-04'  → monthly sinks below the day-1 weekly (wrong-ish for a tie)
  //   monthly 2026-04     > '2026-03-31' → fine
  //   BUT '2026-04' < '2026-04-01' would have placed monthly AFTER all April weeklies,
  //   which is the lexicographic bug this fix addresses.
  it('sorts a mix of YYYY-MM and YYYY-MM-DD correctly (normalized compare)', () => {
    const wkLate = {
      ...weeklyReport,
      id: 'wk-late',
      reportWeek: '2026-04-15',
    };
    const wkEarly = {
      ...weeklyReport,
      id: 'wk-early',
      reportWeek: '2026-04-01',
    };
    const wkMarch = {
      ...weeklyReport,
      id: 'wk-march',
      reportWeek: '2026-03-31',
    };
    const monthApril = {
      ...monthlyReport,
      id: 'm-april',
      reportMonth: '2026-04',
    };

    render(
      <ReportsList
        monthlyReports={[monthApril as never]}
        weeklyReports={[wkLate as never, wkEarly as never, wkMarch as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(4);

    // Assert correct (normalized) descending order:
    // 2026-04-15 must be first, 2026-03-31 must be last.
    // The monthly 'm-april' (normalized to 2026-04-01) must appear AFTER
    // 2026-04-15 and BEFORE 2026-03-31 — i.e., not sunk to the bottom by
    // the old lexicographic bug.
    expect(rows[0]).toHaveProp('testID', 'weekly-report-card-wk-late');
    expect(rows[rows.length - 1]).toHaveProp(
      'testID',
      'weekly-report-card-wk-march',
    );

    const orderedIds = rows.map((r) => r.props.testID as string);
    const aprilMonthlyIdx = orderedIds.indexOf('report-card-m-april');
    const earlyAprilWeeklyIdx = orderedIds.indexOf(
      'weekly-report-card-wk-early',
    );
    const marchWeeklyIdx = orderedIds.indexOf('weekly-report-card-wk-march');

    // April monthly must NOT be the final row — the lexicographic bug
    // ('2026-04' < '2026-04-01') would have placed it after all April
    // weeklies, sinking toward 2026-03-31. After fix it sits in the
    // April cluster, ABOVE the March weekly.
    expect(aprilMonthlyIdx).toBeLessThan(marchWeeklyIdx);

    // April monthly and April-01 weekly tie under normalization
    // (both → 2026-04-01); both must appear ABOVE the March weekly.
    expect(earlyAprilWeeklyIdx).toBeLessThan(marchWeeklyIdx);
    expect(aprilMonthlyIdx).toBeLessThan(marchWeeklyIdx);
  });

  it("places a YYYY-MM monthly report ABOVE the previous month's last day", () => {
    // Direct regression for the exact CCR example:
    //   '2026-04' (monthly) should sort ABOVE '2026-03-31' (weekly).
    // Old behavior: '2026-04' > '2026-03-31' lexicographically — by
    // accident this case was correct. Kept as a regression guard so
    // future "simplifications" don't regress it.
    const monthApril = {
      ...monthlyReport,
      id: 'm-april-only',
      reportMonth: '2026-04',
    };
    const wkMarch31 = {
      ...weeklyReport,
      id: 'wk-mar31',
      reportWeek: '2026-03-31',
    };

    render(
      <ReportsList
        monthlyReports={[monthApril as never]}
        weeklyReports={[wkMarch31 as never]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveProp('testID', 'report-card-m-april-only');
    expect(rows[1]).toHaveProp('testID', 'weekly-report-card-wk-mar31');
  });
});

describe('ReportsList — custom testID', () => {
  it('applies custom testID to container', () => {
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
        testID="my-reports-list"
      />,
    );

    screen.getByTestId('my-reports-list');
  });
});
