import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { GateContent, GATE_WEB_MAX_WIDTH } from './GateContent';

// [BUG-986/987] Post-auth gate screens stretched full viewport width on
// web because their inner content had no maxWidth. GateContent wraps
// children in a constrained column on web only.
describe('GateContent', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => originalOS,
    });
  });

  function setPlatform(os: typeof Platform.OS): void {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => os,
    });
  }

  function gateStyle(): Record<string, unknown> {
    const gate = screen.getByTestId('gate-content') as unknown as {
      props: { style?: unknown };
    };
    return (StyleSheet.flatten(gate.props.style) ?? {}) as Record<
      string,
      unknown
    >;
  }

  it('applies maxWidth on web so buttons do not stretch the viewport', () => {
    setPlatform('web');
    render(
      <GateContent testID="gate-content">
        <Text>child</Text>
      </GateContent>,
    );

    expect(gateStyle().maxWidth).toBe(GATE_WEB_MAX_WIDTH);
  });

  it('does not constrain width on iOS', () => {
    setPlatform('ios');
    render(
      <GateContent testID="gate-content">
        <Text>child</Text>
      </GateContent>,
    );

    expect(gateStyle().maxWidth).toBeUndefined();
  });

  it('does not constrain width on Android', () => {
    setPlatform('android');
    render(
      <GateContent testID="gate-content">
        <Text>child</Text>
      </GateContent>,
    );

    expect(gateStyle().maxWidth).toBeUndefined();
  });

  it('renders children inside the wrapper View', () => {
    setPlatform('web');
    render(
      <GateContent testID="gate-content">
        <View testID="inner-child" />
      </GateContent>,
    );

    screen.getByTestId('gate-content');
    screen.getByTestId('inner-child');
  });
});
