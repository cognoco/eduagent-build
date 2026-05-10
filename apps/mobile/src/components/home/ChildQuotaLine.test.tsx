import { render, screen } from '@testing-library/react-native';

import { ChildQuotaLine } from './ChildQuotaLine';

const mockUseUsage = jest.fn();

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  '../../hooks/use-subscription' /* gc1-allow: ChildQuotaLine renders quota data; hook mocked to isolate rendering from network */,
  () => ({ useUsage: () => mockUseUsage() }),
);

function mockUseChildQuota(
  data:
    | {
        dailyRemainingQuestions: number | null;
        remainingQuestions: number;
        monthlyLimit: number | null;
      }
    | undefined,
): void {
  mockUseUsage.mockReturnValue({ data });
}

describe('ChildQuotaLine', () => {
  beforeEach(() => {
    mockUseUsage.mockReset();
  });

  it('shows daily and monthly remaining when both are bounded', () => {
    mockUseChildQuota({
      dailyRemainingQuestions: 7,
      remainingQuestions: 84,
      monthlyLimit: 100,
    });

    render(<ChildQuotaLine />);

    screen.getByText(/7 questions left today.*84 left this month/);
  });

  it('shows only monthly when daily is unlimited', () => {
    mockUseChildQuota({
      dailyRemainingQuestions: null,
      remainingQuestions: 84,
      monthlyLimit: 100,
    });

    render(<ChildQuotaLine />);

    screen.getByText(/84 questions left this month/);
    expect(screen.queryByText(/today/)).toBeNull();
  });

  it('shows neutral line when no caps apply', () => {
    mockUseChildQuota({
      dailyRemainingQuestions: null,
      remainingQuestions: 0,
      monthlyLimit: null,
    });

    render(<ChildQuotaLine />);

    screen.getByText(/Plenty of questions/);
  });

  it('renders nothing while quota query is loading', () => {
    mockUseChildQuota(undefined);
    const { queryByTestId } = render(<ChildQuotaLine />);

    expect(queryByTestId('child-quota-line')).toBeNull();
  });
});
