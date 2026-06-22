import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { InterestContextRow, MemoryRow } from './mentor-memory-sections';

jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary - resolves real en.json strings for user-copy assertions */,
  () => require('../test-utils/mock-i18n').i18nMock,
);

describe('MemoryRow', () => {
  it('renders label text', () => {
    render(<MemoryRow label="Visual examples" />);
    screen.getByText('Visual examples');
  });

  it('does not render remove button when onRemove is absent', () => {
    render(<MemoryRow label="Visual examples" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('remove Pressable has accessibilityRole="button"', () => {
    render(<MemoryRow label="Visual examples" onRemove={jest.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityRole).toBe('button');
  });

  it('remove Pressable accessibilityLabel includes item name (bug 174)', () => {
    render(<MemoryRow label="Visual examples" onRemove={jest.fn()} />);
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityLabel).toContain('Visual examples');
  });

  it('remove Pressable accessibilityLabel includes actionLabel', () => {
    render(
      <MemoryRow
        label="Visual examples"
        onRemove={jest.fn()}
        actionLabel="Remove"
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityLabel).toContain('Remove');
  });

  it('uses custom actionLabel when provided', () => {
    render(
      <MemoryRow
        label="Visual examples"
        onRemove={jest.fn()}
        actionLabel="Delete"
      />,
    );
    screen.getByText('Delete');
    const btn = screen.getByRole('button');
    expect(btn.props.accessibilityLabel).toContain('Delete');
    expect(btn.props.accessibilityLabel).toContain('Visual examples');
  });
});

describe('InterestContextRow', () => {
  it('[WI-945] rolls back a failed context change and shows retry feedback', async () => {
    const onContextChange = jest
      .fn<Promise<void>, [string, 'free_time' | 'school' | 'both']>()
      .mockRejectedValue(new Error('offline'));

    render(
      <InterestContextRow
        interest={{ label: 'Robotics', context: 'school' }}
        onContextChange={onContextChange}
      />,
    );

    fireEvent.press(screen.getByTestId('interest-context-Robotics-free_time'));

    await waitFor(() => {
      expect(onContextChange).toHaveBeenCalledWith('Robotics', 'free_time');
      expect(
        screen.getByTestId('interest-context-Robotics-school').props
          .accessibilityState.selected,
      ).toBe(true);
      expect(
        screen.getByTestId('interest-context-Robotics-free_time').props
          .accessibilityState.selected,
      ).toBe(false);
    });

    screen.getByText('Could not update memory');

    fireEvent.press(screen.getByRole('button', { name: 'Try Again' }));

    await waitFor(() => {
      expect(onContextChange).toHaveBeenCalledTimes(2);
      expect(onContextChange).toHaveBeenLastCalledWith('Robotics', 'free_time');
    });
  });
});
