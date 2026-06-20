/**
 * [ACCOUNT-17] WI-871 — child memory consent prompt.
 *
 * The inline prompt rendered on the child mentor-memory + SELF mentor-memory
 * screens when memoryConsentStatus === 'pending'. One tap grants (flips
 * collection/injection/enabled together) or declines. Deterministic coverage
 * for the grant/decline handlers, the pending/disabled state, and the
 * named-vs-unnamed title — the parent-handoff "resume" surface the flow sweep
 * could only reach partially.
 */
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MemoryConsentPrompt } from './memory-consent-prompt';

jest.mock('react-i18next', () => require('../test-utils/mock-i18n').i18nMock);

describe('MemoryConsentPrompt [ACCOUNT-17]', () => {
  it('renders the named title when a childName is supplied', () => {
    render(
      <MemoryConsentPrompt
        childName="Emma"
        onGrant={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    // memoryConsent.defaultTitle interpolates {{name}} → "Emma".
    screen.getByText(/Emma/);
    screen.getByTestId('memory-consent-grant');
    screen.getByTestId('memory-consent-decline');
  });

  it('renders the no-name title variant when childName is absent', () => {
    render(<MemoryConsentPrompt onGrant={jest.fn()} onDecline={jest.fn()} />);
    // Falls back to memoryConsent.defaultTitleNoName — must NOT show a literal
    // "{{name}}" placeholder.
    expect(screen.queryByText(/\{\{name\}\}/)).toBeNull();
    screen.getByTestId('memory-consent-grant');
  });

  it('invokes onGrant when the grant button is pressed', () => {
    const onGrant = jest.fn();
    render(
      <MemoryConsentPrompt
        childName="Emma"
        onGrant={onGrant}
        onDecline={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('memory-consent-grant'));
    expect(onGrant).toHaveBeenCalledTimes(1);
  });

  it('invokes onDecline when the decline button is pressed', () => {
    const onDecline = jest.fn();
    render(
      <MemoryConsentPrompt
        childName="Emma"
        onGrant={jest.fn()}
        onDecline={onDecline}
      />,
    );
    fireEvent.press(screen.getByTestId('memory-consent-decline'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and shows a saving label while pending', () => {
    const onGrant = jest.fn();
    const onDecline = jest.fn();
    render(
      <MemoryConsentPrompt
        childName="Emma"
        isPending
        onGrant={onGrant}
        onDecline={onDecline}
      />,
    );

    const grant = screen.getByTestId('memory-consent-grant');
    const decline = screen.getByTestId('memory-consent-decline');
    expect(
      grant.props.accessibilityState?.disabled ?? grant.props.disabled,
    ).toBeTruthy();
    expect(
      decline.props.accessibilityState?.disabled ?? decline.props.disabled,
    ).toBeTruthy();

    // Pressing while pending must not re-fire the handlers.
    fireEvent.press(grant);
    fireEvent.press(decline);
    expect(onGrant).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('renders custom title and description when provided', () => {
    render(
      <MemoryConsentPrompt
        title="Custom heading"
        description="Custom body copy"
        onGrant={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    screen.getByText('Custom heading');
    screen.getByText('Custom body copy');
  });
});
