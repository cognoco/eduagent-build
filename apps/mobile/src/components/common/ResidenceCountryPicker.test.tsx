import { render, fireEvent, screen } from '@testing-library/react-native';
import type { ResidenceCountryOption } from '@eduagent/schemas';
import { ResidenceCountryPicker } from './ResidenceCountryPicker';

const OPTIONS: ResidenceCountryOption[] = [
  { countryCode: 'AT', countryName: 'Austria' },
  { countryCode: 'DE', countryName: 'Germany' },
];

describe('ResidenceCountryPicker', () => {
  it('renders one option per registry country and reports the ISO code on press', () => {
    const onSelect = jest.fn();
    render(
      <ResidenceCountryPicker
        options={OPTIONS}
        value={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('residence-country-AT')).toBeTruthy();
    fireEvent.press(screen.getByTestId('residence-country-DE'));

    // The ISO code is the payload, never the display name — the display name is
    // effective-dated in the registry and can change without the code changing.
    expect(onSelect).toHaveBeenCalledWith('DE');
  });

  it('[WI-2743 AC-6] copy excludes nationality, billing country and store country BY NAME', () => {
    render(
      <ResidenceCountryPicker
        options={OPTIONS}
        value={null}
        onSelect={jest.fn()}
      />,
    );

    // AC-6 is about meaning, not phrasing, so this asserts the three
    // confusables are each ruled out explicitly. Each one is a plausible
    // misreading that would place a learner under the wrong jurisdiction, and
    // an implied exclusion is not an exclusion.
    const hint = screen.getByText(/where you usually live/i);
    expect(hint).toBeTruthy();
    expect(hint.props.children).toMatch(/nationality/i);
    expect(hint.props.children).toMatch(/billing country/i);
    expect(hint.props.children).toMatch(/app store country/i);
  });

  it('[WI-2743 AC-6] uses the child-voiced hint when the learner is someone else', () => {
    render(
      <ResidenceCountryPicker
        options={OPTIONS}
        value={null}
        onSelect={jest.fn()}
        audience="child"
      />,
    );

    const hint = screen.getByText(/where your child usually lives/i);
    expect(hint.props.children).toMatch(/nationality/i);
    expect(hint.props.children).toMatch(/billing country/i);
    expect(hint.props.children).toMatch(/app store country/i);
  });

  it('marks only the selected country as selected for assistive tech', () => {
    render(
      <ResidenceCountryPicker
        options={OPTIONS}
        value="DE"
        onSelect={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('residence-country-DE').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      screen.getByTestId('residence-country-AT').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('does not fire onSelect while disabled', () => {
    const onSelect = jest.fn();
    render(
      <ResidenceCountryPicker
        options={OPTIONS}
        value={null}
        onSelect={onSelect}
        disabled
      />,
    );

    fireEvent.press(screen.getByTestId('residence-country-DE'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('[BREAK] surfaces an error with a retry rather than rendering an empty picker', () => {
    // The failure mode this guards: an errored fetch rendering as a picker with
    // no countries, which reads as "no countries exist" and strands signup with
    // nothing to click and no indication anything went wrong.
    const onRetry = jest.fn();
    render(
      <ResidenceCountryPicker
        options={[]}
        value={null}
        onSelect={jest.fn()}
        isError
        onRetry={onRetry}
      />,
    );

    expect(screen.queryByTestId('residence-country-picker')).toBeNull();
    expect(screen.getByTestId('residence-country-error')).toBeTruthy();

    fireEvent.press(screen.getByTestId('residence-country-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('distinguishes a genuinely empty registry from an error', () => {
    render(
      <ResidenceCountryPicker options={[]} value={null} onSelect={jest.fn()} />,
    );

    expect(screen.getByTestId('residence-country-empty')).toBeTruthy();
    expect(screen.queryByTestId('residence-country-error')).toBeNull();
  });

  it('shows a loading indicator instead of an empty list while fetching', () => {
    render(
      <ResidenceCountryPicker
        options={[]}
        value={null}
        onSelect={jest.fn()}
        isLoading
      />,
    );

    expect(screen.getByTestId('residence-country-loading')).toBeTruthy();
    expect(screen.queryByTestId('residence-country-empty')).toBeNull();
  });
});
