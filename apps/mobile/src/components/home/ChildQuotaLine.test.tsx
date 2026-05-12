import { render, screen } from '@testing-library/react-native';

import { ChildQuotaLine } from './ChildQuotaLine';

const mockUseOverallProgress = jest.fn();

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  '../../hooks/use-progress' /* gc1-allow: ChildQuotaLine renders progress data; hook mocked to isolate rendering from network */,
  () => ({ useOverallProgress: () => mockUseOverallProgress() }),
);

function mockProgress(totalTopicsCompleted: number | undefined): void {
  if (totalTopicsCompleted === undefined) {
    mockUseOverallProgress.mockReturnValue({ data: undefined });
    return;
  }
  mockUseOverallProgress.mockReturnValue({
    data: { subjects: [], totalTopicsCompleted, totalTopicsVerified: 0 },
  });
}

describe('ChildQuotaLine (momentum)', () => {
  beforeEach(() => {
    mockUseOverallProgress.mockReset();
  });

  it('renders plural copy when several topics completed', () => {
    mockProgress(7);

    render(<ChildQuotaLine />);

    screen.getByText(/7 topics learned/);
  });

  it('renders singular copy when exactly one topic completed', () => {
    mockProgress(1);

    render(<ChildQuotaLine />);

    screen.getByText(/1 topic learned/);
    expect(screen.queryByText(/topics learned/)).toBeNull();
  });

  it('renders nothing when no topics completed yet', () => {
    mockProgress(0);
    const { queryByTestId } = render(<ChildQuotaLine />);

    expect(queryByTestId('home-momentum-line')).toBeNull();
  });

  it('renders nothing while progress query is loading', () => {
    mockProgress(undefined);
    const { queryByTestId } = render(<ChildQuotaLine />);

    expect(queryByTestId('home-momentum-line')).toBeNull();
  });
});
