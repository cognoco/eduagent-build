import { render, fireEvent } from '@testing-library/react-native';
import type { DictationResult } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Mocks — all are external/native boundaries that cannot run in JSDOM.
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: useThemeColors reads React context + dark-mode native API; cannot resolve in JSDOM */,
  () => ({
    ...jest.requireActual('../../../lib/theme'),
    useThemeColors: () => ({ textPrimary: '#fff', primary: '#2563eb' }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type; goBackOrReplace calls router.back which requires native navigation context */,
  () => ({
    ...jest.requireActual('../../../lib/navigation'),
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockRefetch = jest.fn();
let mockHistoryState: {
  data: DictationResult[] | undefined;
  isPending: boolean;
  isError: boolean;
};
jest.mock(
  '../../../hooks/use-dictation-api' /* gc1-allow: wraps the api-client fetch boundary — no server/network in JSDOM unit tests */,
  () => ({
    ...jest.requireActual('../../../hooks/use-dictation-api'),
    useDictationHistory: () => ({ ...mockHistoryState, refetch: mockRefetch }),
  }),
);

const DictationHistoryScreen = require('./history')
  .default as React.ComponentType;

function entry(overrides: Partial<DictationResult> = {}): DictationResult {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    profileId: '00000000-0000-4000-8000-0000000000aa',
    completionKey: '00000000-0000-4000-8000-0000000000bb',
    date: '2026-06-29',
    sentenceCount: 2,
    mistakeCount: 1,
    mode: 'homework',
    reviewed: true,
    sentences: ['The cat sat on the mat.', 'Birds fly south in winter.'],
    ...overrides,
  };
}

describe('DictationHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHistoryState = { data: undefined, isPending: true, isError: false };
  });

  it('shows the loading state while the query is pending', () => {
    mockHistoryState = { data: undefined, isPending: true, isError: false };
    const { getByTestId } = render(<DictationHistoryScreen />);
    expect(getByTestId('dictation-history-loading')).toBeTruthy();
  });

  it('renders the error fallback with a retry that refetches', () => {
    mockHistoryState = { data: undefined, isPending: false, isError: true };
    const { getByTestId } = render(<DictationHistoryScreen />);
    fireEvent.press(getByTestId('dictation-history-retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no entries', () => {
    mockHistoryState = { data: [], isPending: false, isError: false };
    const { getByTestId } = render(<DictationHistoryScreen />);
    expect(getByTestId('dictation-history-empty')).toBeTruthy();
  });

  it('renders past entries with their full source sentences', () => {
    mockHistoryState = {
      data: [entry()],
      isPending: false,
      isError: false,
    };
    const { getByText, getAllByTestId } = render(<DictationHistoryScreen />);
    expect(getByText('The cat sat on the mat.')).toBeTruthy();
    expect(getByText('Birds fly south in winter.')).toBeTruthy();
    expect(getAllByTestId('dictation-history-sentence')).toHaveLength(2);
  });

  it('falls back to a no-sentences note for rows persisted without text', () => {
    mockHistoryState = {
      data: [entry({ sentences: null })],
      isPending: false,
      isError: false,
    };
    const { queryAllByTestId, getByTestId } = render(
      <DictationHistoryScreen />,
    );
    expect(queryAllByTestId('dictation-history-sentence')).toHaveLength(0);
    expect(getByTestId('dictation-history-entry')).toBeTruthy();
  });
});
