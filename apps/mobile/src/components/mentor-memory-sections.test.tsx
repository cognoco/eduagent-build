import { render, screen } from '@testing-library/react-native';
import { MemoryRow } from './mentor-memory-sections';

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
