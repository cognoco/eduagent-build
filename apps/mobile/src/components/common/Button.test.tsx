import { fireEvent, render } from '@testing-library/react-native';
import { tokens } from '../../lib/design-tokens';
import { Button } from './Button';

describe('Button', () => {
  it('keeps primary defaults accessible and pressable', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <Button label="Save" onPress={onPress} testID="save-button" />,
    );

    const button = getByTestId('save-button');
    expect(button.props.className).toContain(
      'rounded-button items-center py-3 px-6 bg-primary',
    );
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Save');
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
    expect(getByText('Save').props.className).toContain('text-text-inverse');

    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress while disabled', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <Button
        label="Disabled"
        onPress={onPress}
        disabled
        testID="disabled-button"
      />,
    );

    const button = getByTestId('disabled-button');
    expect(button.props.className).toContain('bg-surface-elevated');
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: false,
    });
    expect(getByText('Disabled').props.className).toContain('text-muted');

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('surfaces loading as a disabled busy button', () => {
    const onPress = jest.fn();
    const { getByTestId, getAllByLabelText } = render(
      <Button
        label="Submit"
        onPress={onPress}
        loading
        testID="loading-button"
      />,
    );

    const button = getByTestId('loading-button');
    expect(button.props.accessibilityLabel).toBe('Loading...');
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(getAllByLabelText('Loading...')).toHaveLength(2);

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('supports the danger variant for destructive actions', () => {
    const { getByTestId, getByText } = render(
      <Button
        label="Delete account"
        onPress={jest.fn()}
        variant="danger"
        testID="danger-button"
      />,
    );

    const button = getByTestId('danger-button');
    expect(button.props.className).toContain('bg-danger');
    expect(getByText('Delete account').props.className).toContain(
      'text-text-inverse',
    );
  });

  it('uses inverse loading indicator color for danger buttons', () => {
    const { getAllByLabelText } = render(
      <Button
        label="Delete"
        onPress={jest.fn()}
        variant="danger"
        loading
      />,
    );

    expect(
      getAllByLabelText('Loading...').some(
        (element) => element.props.color === tokens.light.colors.textInverse,
      ),
    ).toBe(true);
  });

  it('appends bounded container className overrides', () => {
    const { getByTestId } = render(
      <Button
        label="Compact"
        onPress={jest.fn()}
        className="mt-2 self-start min-w-[160px]"
        testID="compact-button"
      />,
    );

    expect(getByTestId('compact-button').props.className).toBe(
      'rounded-button items-center py-3 px-6 bg-primary mt-2 self-start min-w-[160px]',
    );
  });

  it('composes style overrides with pressed opacity', () => {
    const { getByTestId } = render(
      <Button
        label="Wide"
        onPress={jest.fn()}
        style={{ minWidth: 180 }}
        testID="wide-button"
      />,
    );

    expect(getByTestId('wide-button')).toHaveStyle({
      opacity: 1,
      minWidth: 180,
    });
  });
});
