import { render, fireEvent } from '@testing-library/react-native';
import { PasswordInput } from './PasswordInput';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ muted: '#888' }),
}));

describe('PasswordInput', () => {
  it('hides password by default', () => {
    const { getByTestId } = render(
      <PasswordInput value="secret" onChangeText={jest.fn()} testID="pw" />
    );
    const input = getByTestId('pw');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('toggles password visibility on Show/Hide press', () => {
    const { getByTestId } = render(
      <PasswordInput value="secret" onChangeText={jest.fn()} testID="pw" />
    );
    const toggle = getByTestId('pw-toggle');
    expect(toggle).toBeTruthy();

    // Press Show
    fireEvent.press(toggle);
    const input = getByTestId('pw');
    expect(input.props.secureTextEntry).toBe(false);

    // Press Hide
    fireEvent.press(toggle);
    expect(getByTestId('pw').props.secureTextEntry).toBe(true);
  });

  it('shows requirements hint when showRequirements is true', () => {
    const { getByTestId } = render(
      <PasswordInput
        value="short"
        onChangeText={jest.fn()}
        testID="pw"
        showRequirements
      />
    );
    const hint = getByTestId('pw-hint');
    expect(hint.props.children).toBe('At least 8 characters');
  });

  it('does not show requirements hint by default', () => {
    const { queryByTestId } = render(
      <PasswordInput value="short" onChangeText={jest.fn()} testID="pw" />
    );
    expect(queryByTestId('pw-hint')).toBeNull();
  });

  it('calls onChangeText when typing', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <PasswordInput value="" onChangeText={onChange} testID="pw" />
    );
    fireEvent.changeText(getByTestId('pw'), 'hello');
    expect(onChange).toHaveBeenCalledWith('hello');
  });
});
