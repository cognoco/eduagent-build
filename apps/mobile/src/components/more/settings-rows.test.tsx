import { render, screen } from '@testing-library/react-native';
import { SettingsRow } from './settings-rows';

describe('SettingsRow', () => {
  it('renders label text', () => {
    render(<SettingsRow label="Language" />);
    screen.getByText('Language');
  });

  it('has accessibilityRole="button" when onPress is provided', () => {
    render(<SettingsRow label="Language" onPress={jest.fn()} />);
    const row = screen.getByText('Language').parent?.parent;
    // Walk up to find the Pressable with accessibilityRole
    function findRole(el: typeof row): string | undefined {
      if (!el) return undefined;
      if (el.props?.accessibilityRole)
        return el.props.accessibilityRole as string;
      return findRole(el.parent);
    }
    expect(findRole(row)).toBe('button');
  });

  it('does NOT have accessibilityRole when onPress is absent (bug 182)', () => {
    render(<SettingsRow label="Language" testID="settings-row-lang" />);
    const el = screen.getByTestId('settings-row-lang');
    expect(el.props.accessibilityRole).toBeUndefined();
  });

  it('shows value text when provided', () => {
    render(<SettingsRow label="Language" value="Norwegian" />);
    screen.getByText('Norwegian');
  });

  it('keeps value text shrink-safe for narrow screens', () => {
    render(
      <SettingsRow
        label="Language"
        value="A very long language value that should not push the chevron away"
      />,
    );

    expect(
      screen.getByText(
        'A very long language value that should not push the chevron away',
      ).props.numberOfLines,
    ).toBe(1);
  });

  it('shows description when provided', () => {
    render(<SettingsRow label="Language" description="Select your language" />);
    screen.getByText('Select your language');
  });
});
