import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  ShelvesTab,
  SHELVES_TAB_INITIAL_STATE,
  type ShelvesTabState,
} from './ShelvesTab';
import type { ShelfItem } from '../../lib/library-filters';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    accent: '#2563eb',
    textSecondary: '#888',
    muted: '#666',
    primary: '#0d9488',
    border: '#e8e0d4',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../progress', () => {
  const { Text: MockText } = require('react-native');
  return {
    RetentionSignal: ({ status }: { status: string }) => (
      <MockText>{status}</MockText>
    ),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mathShelf: ShelfItem = {
  subject: {
    id: 'sub-1',
    name: 'Mathematics',
    status: 'active',
    profileId: 'p1',
    pedagogyMode: 'four_strands',
    rawInput: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  progress: {
    subjectId: 'sub-1',
    name: 'Mathematics',
    topicsTotal: 20,
    topicsCompleted: 10,
    topicsVerified: 5,
    urgencyScore: 0.3,
    retentionStatus: 'fading',
    lastSessionAt: '2026-04-03T12:00:00Z',
  },
  reviewDueCount: 3,
};

const historyShelf: ShelfItem = {
  subject: {
    id: 'sub-2',
    name: 'History',
    status: 'paused',
    profileId: 'p1',
    pedagogyMode: 'four_strands',
    rawInput: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  progress: {
    subjectId: 'sub-2',
    name: 'History',
    topicsTotal: 15,
    topicsCompleted: 15,
    topicsVerified: 15,
    urgencyScore: 0,
    retentionStatus: 'strong',
    lastSessionAt: null,
  },
};

const defaultState: ShelvesTabState = {
  search: '',
  sortKey: 'name-asc',
  filters: { status: [], retention: [] },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShelvesTab', () => {
  const defaultProps = {
    shelves: [mathShelf, historyShelf],
    state: defaultState,
    onStateChange: jest.fn(),
    onShelfPress: jest.fn(),
    onAddSubject: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders shelf cards', () => {
    render(<ShelvesTab {...defaultProps} />);

    expect(screen.getByTestId('subject-card-sub-1')).toBeTruthy();
    expect(screen.getByTestId('subject-card-sub-2')).toBeTruthy();
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('shows progress label for subjects with topics', () => {
    render(<ShelvesTab {...defaultProps} />);
    expect(screen.getByText('10/20 topics completed')).toBeTruthy();
  });

  it('shows "all done" label when all topics completed', () => {
    render(<ShelvesTab {...defaultProps} />);
    expect(screen.getByText('15/15 topics completed')).toBeTruthy();
  });

  it('shows status pill for paused/archived subjects but not for active', () => {
    render(<ShelvesTab {...defaultProps} />);
    expect(screen.getByText('Paused')).toBeTruthy();
    // "Active" status pill should NOT be rendered
    expect(screen.queryByTestId('status-pill-active')).toBeNull();
  });

  it('shows RetentionSignal for active subjects with progress', () => {
    render(<ShelvesTab {...defaultProps} />);
    // Mocked RetentionSignal renders status text
    expect(screen.getByText('fading')).toBeTruthy();
  });

  it('shows per-subject review indicator when reviews are due', () => {
    render(<ShelvesTab {...defaultProps} />);

    expect(screen.getByTestId('subject-review-due-sub-1')).toBeTruthy();
    expect(screen.getByText('3 to review')).toBeTruthy();
  });

  it('shows search bar that propagates search via onStateChange', () => {
    const onStateChange = jest.fn();
    render(<ShelvesTab {...defaultProps} onStateChange={onStateChange} />);

    fireEvent.changeText(screen.getByTestId('library-search-input'), 'math');
    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultState,
      search: 'math',
    });
  });

  it('shows no-results state when search matches nothing', () => {
    const searchState: ShelvesTabState = {
      ...defaultState,
      search: 'physics',
    };
    render(<ShelvesTab {...defaultProps} state={searchState} />);

    expect(screen.getByTestId('library-no-results')).toBeTruthy();
    expect(screen.getByText('No shelves match your search')).toBeTruthy();
  });

  it('clear button in no-results resets search only', () => {
    const onStateChange = jest.fn();
    const searchState: ShelvesTabState = {
      ...defaultState,
      search: 'physics',
    };
    render(
      <ShelvesTab
        {...defaultProps}
        state={searchState}
        onStateChange={onStateChange}
      />
    );

    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith({
      ...searchState,
      search: '',
    });
  });

  it('calls onShelfPress when a shelf card is tapped', () => {
    const onShelfPress = jest.fn();
    render(<ShelvesTab {...defaultProps} onShelfPress={onShelfPress} />);

    fireEvent.press(screen.getByTestId('subject-card-sub-1'));
    expect(onShelfPress).toHaveBeenCalledWith('sub-1');
  });

  it('shows empty state when no shelves exist', () => {
    const onAddSubject = jest.fn();
    render(
      <ShelvesTab {...defaultProps} shelves={[]} onAddSubject={onAddSubject} />
    );

    expect(screen.getByTestId('library-no-content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-add-subject-empty'));
    expect(onAddSubject).toHaveBeenCalledTimes(1);
  });

  it('propagates sort changes via onStateChange', () => {
    const onStateChange = jest.fn();
    render(<ShelvesTab {...defaultProps} onStateChange={onStateChange} />);

    // Open sort modal
    fireEvent.press(screen.getByTestId('library-sort-button'));
    // Select "Name (Z-A)"
    fireEvent.press(screen.getByText('Name (Z-A)'));

    expect(onStateChange).toHaveBeenCalledWith({
      ...defaultState,
      sortKey: 'name-desc',
    });
  });

  it('shows "Clear all" when both search and filters are active with no results', () => {
    const onStateChange = jest.fn();
    const stateWithBoth: ShelvesTabState = {
      search: 'nonexistent',
      sortKey: 'name-asc',
      filters: { status: ['archived'], retention: [] },
    };
    render(
      <ShelvesTab
        {...defaultProps}
        state={stateWithBoth}
        onStateChange={onStateChange}
      />
    );

    expect(screen.getByText('Clear all')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith(SHELVES_TAB_INITIAL_STATE);
  });

  it('shows "Clear filters" when only filters cause no results', () => {
    const onStateChange = jest.fn();
    const filterOnlyState: ShelvesTabState = {
      search: '',
      sortKey: 'name-asc',
      filters: { status: ['archived'], retention: [] },
    };
    render(
      <ShelvesTab
        {...defaultProps}
        state={filterOnlyState}
        onStateChange={onStateChange}
      />
    );

    expect(screen.getByText('Clear filters')).toBeTruthy();
    fireEvent.press(screen.getByTestId('library-clear-search'));
    expect(onStateChange).toHaveBeenCalledWith({
      ...filterOnlyState,
      filters: { status: [], retention: [] },
    });
  });

  it('exports SHELVES_TAB_INITIAL_STATE with correct defaults', () => {
    expect(SHELVES_TAB_INITIAL_STATE).toEqual({
      search: '',
      sortKey: 'name-asc',
      filters: { status: [], retention: [] },
    });
  });
});
