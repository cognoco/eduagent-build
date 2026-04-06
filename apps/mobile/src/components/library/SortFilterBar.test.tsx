import { fireEvent, render, screen } from '@testing-library/react-native';
import { SortFilterBar } from './SortFilterBar';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textSecondary: '#525252',
    muted: '#a3a3a3',
    accent: '#0d9488',
    background: '#faf5ee',
    surface: '#ffffff',
    textPrimary: '#1a1a1a',
    primary: '#0d9488',
    border: '#e8e0d4',
  }),
}));

describe('SortFilterBar', () => {
  const sortOptions = [
    { key: 'name-asc', label: 'Name (A-Z)' },
    { key: 'name-desc', label: 'Name (Z-A)' },
    { key: 'progress', label: 'Progress' },
  ];
  const filterGroups = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { key: 'active', label: 'Active' },
        { key: 'paused', label: 'Paused' },
      ],
      selected: [],
    },
  ];

  const defaultProps = {
    sortOptions,
    activeSortKey: 'name-asc',
    onSortChange: jest.fn(),
    filterGroups,
    onFilterChange: jest.fn(),
    activeFilterCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders sort button with current sort label', () => {
    render(<SortFilterBar {...defaultProps} />);
    const sortButton = screen.getByTestId('library-sort-button');
    expect(sortButton).toBeTruthy();
    expect(screen.getByText('Name (A-Z)')).toBeTruthy();
  });

  it('renders filter button — "Filter" with zero, "Filter (2)" with 2 active', () => {
    const { rerender } = render(<SortFilterBar {...defaultProps} />);
    expect(screen.getByText('Filter')).toBeTruthy();

    rerender(<SortFilterBar {...defaultProps} activeFilterCount={2} />);
    expect(screen.getByText('Filter (2)')).toBeTruthy();
  });

  it('shows sort options when sort button pressed, calls onSortChange on selection', () => {
    const onSortChange = jest.fn();
    render(<SortFilterBar {...defaultProps} onSortChange={onSortChange} />);

    fireEvent.press(screen.getByTestId('library-sort-button'));

    // "Name (A-Z)" appears both in the button label and in the modal list
    expect(screen.getAllByText('Name (A-Z)').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Name (Z-A)')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();

    // Select a different sort option
    fireEvent.press(screen.getByText('Name (Z-A)'));
    expect(onSortChange).toHaveBeenCalledWith('name-desc');
  });

  it('shows filter groups/options when filter button pressed, calls onFilterChange on chip tap', () => {
    const onFilterChange = jest.fn();
    render(<SortFilterBar {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.press(screen.getByTestId('library-filter-button'));

    // Filter group label should be visible
    expect(screen.getByText('Status')).toBeTruthy();
    // Filter options should be visible as chips
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();

    // Tap a filter chip
    fireEvent.press(screen.getByText('Active'));
    expect(onFilterChange).toHaveBeenCalledWith('status', 'active');
  });

  it('filter chips show selected state via accessibilityState', () => {
    const filterGroupsWithSelection = [
      {
        key: 'status',
        label: 'Status',
        options: [
          { key: 'active', label: 'Active' },
          { key: 'paused', label: 'Paused' },
        ],
        selected: ['active'],
      },
    ];

    render(
      <SortFilterBar
        {...defaultProps}
        filterGroups={filterGroupsWithSelection}
        activeFilterCount={1}
      />
    );

    fireEvent.press(screen.getByTestId('library-filter-button'));

    const activeChip = screen.getByTestId('filter-chip-status-active');
    const pausedChip = screen.getByTestId('filter-chip-status-paused');

    expect(activeChip.props.accessibilityState).toEqual({ selected: true });
    expect(pausedChip.props.accessibilityState).toEqual({ selected: false });
  });
});
