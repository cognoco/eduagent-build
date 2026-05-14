import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReportsList } from './ReportsList';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'parentView.index.firstReportSoon') return 'No reports yet';
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
  it('renders empty state copy when both arrays are empty', () => {
    render(
      <ReportsList
        monthlyReports={[]}
        weeklyReports={[]}
        onPressMonthly={jest.fn()}
        onPressWeekly={jest.fn()}
      />,
    );

    screen.getByTestId('reports-list-empty');
    screen.getByText('No reports yet');
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
