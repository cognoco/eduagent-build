/**
 * Regression tests for PR-6 (reports dedup).
 *
 * Guard: each report screen must call useProfileReports and
 * useProfileWeeklyReports exactly ONCE per render.  Without this guard the
 * duplicate-fetch pattern this PR removes can silently regress.
 */
import { render } from '@testing-library/react-native';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../../../hooks/use-progress';

import ProgressReportsScreen from './index';

// ── External-boundary mocks (gc1-allow applies at the module level) ──────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock(
  '../../../../hooks/use-progress' /* gc1-allow: query-hook stub at unit-test boundary; real hooks need QueryClientProvider + API client */,
  () => ({
    useProfileReports: jest.fn(),
    useProfileWeeklyReports: jest.fn(),
  }),
);

jest.mock(
  '../../../../lib/profile' /* gc1-allow: ProfileProvider uses SecureStore (native) */,
  () => ({
    useProfile: () => ({
      activeProfile: { id: 'test-profile-id' },
    }),
  }),
);

jest.mock(
  '../../../../lib/navigation' /* gc1-allow: expo-router native side effects */,
  () => ({
    goBackOrReplace: jest.fn(),
  }),
);

jest.mock(
  '../../../../components/common' /* gc1-allow: barrel pulls native nativewind/react-native components */,
  () => ({
    ErrorFallback: () => null,
  }),
);

const emptyQueryResult = {
  data: [],
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};

describe('ProgressReportsScreen — fetch-once regression guard (PR-6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useProfileReports as jest.Mock).mockReturnValue(emptyQueryResult);
    (useProfileWeeklyReports as jest.Mock).mockReturnValue(emptyQueryResult);
  });

  it('calls useProfileReports exactly once per render', () => {
    render(<ProgressReportsScreen />);
    expect(useProfileReports).toHaveBeenCalledTimes(1);
  });

  it('calls useProfileWeeklyReports exactly once per render', () => {
    render(<ProgressReportsScreen />);
    expect(useProfileWeeklyReports).toHaveBeenCalledTimes(1);
  });

  it('renders the list correctly with mocked data', () => {
    const { getByTestId } = render(<ProgressReportsScreen />);
    // When both arrays are empty, ReportsList renders the empty state
    getByTestId('progress-reports-list');
  });
});
