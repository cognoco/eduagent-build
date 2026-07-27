import { render, screen } from '@testing-library/react-native';
import { SettingsRow, ToggleRow } from './settings-rows';

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

  it('visibly and accessibly names the exact mutation target', () => {
    render(
      <SettingsRow
        label="Mentor language"
        targetName="Mia"
        onPress={jest.fn()}
        testID="targeted-settings-row"
      />,
    );

    screen.getByText('Mia');
    expect(
      screen.getByTestId('targeted-settings-row').props.accessibilityLabel,
    ).toBe('Mentor language. Mia');
  });
});

describe('ToggleRow', () => {
  it('visibly and accessibly names the exact mutation target', () => {
    render(
      <ToggleRow
        label="Push notifications"
        targetName="Owner"
        value={false}
        onToggle={jest.fn()}
        testID="targeted-toggle"
      />,
    );

    screen.getByText('Owner');
    expect(
      screen.getByTestId('targeted-toggle-switch').props.accessibilityLabel,
    ).toBe('Push notifications. Owner');
  });
});
