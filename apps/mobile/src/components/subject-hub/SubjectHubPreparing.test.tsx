import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectHubPreparing } from './SubjectHubPreparing';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SubjectHubPreparing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the building copy and a back affordance, with no retry yet', () => {
    render(<SubjectHubPreparing onRetry={jest.fn()} onBack={jest.fn()} />);

    screen.getByText('subjectHub.preparing.title');
    screen.getByTestId('subject-hub-preparing-back');
    // Pre-timeout: the building state must not offer retry — the hub poll is
    // still expected to resolve it on its own.
    expect(screen.queryByTestId('subject-hub-preparing-retry')).toBeNull();
  });

  it('renders the book-flip animation, not the magic-pen animation', () => {
    render(<SubjectHubPreparing onRetry={jest.fn()} onBack={jest.fn()} />);

    // The animation is hidden from screen readers (decorative), so it must be
    // queried with includeHiddenElements — see BookPageFlipAnimation.test.tsx.
    screen.getByTestId('subject-hub-preparing-animation', {
      includeHiddenElements: true,
    });
  });

  it('escalates to a retry affordance after the stall timeout and calls onRetry', () => {
    const onRetry = jest.fn();
    render(<SubjectHubPreparing onRetry={onRetry} onBack={jest.fn()} />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    fireEvent.press(screen.getByTestId('subject-hub-preparing-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not call onRetry while a retry is already in flight', () => {
    const onRetry = jest.fn();
    render(
      <SubjectHubPreparing onRetry={onRetry} onBack={jest.fn()} isRetrying />,
    );

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    fireEvent.press(screen.getByTestId('subject-hub-preparing-retry'));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('always allows going back', () => {
    const onBack = jest.fn();
    render(<SubjectHubPreparing onRetry={jest.fn()} onBack={onBack} />);

    fireEvent.press(screen.getByTestId('subject-hub-preparing-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the named title key when subjectName is provided', () => {
    render(
      <SubjectHubPreparing
        onRetry={jest.fn()}
        onBack={jest.fn()}
        subjectName="Biology"
      />,
    );

    // t() mock returns the key verbatim; the named-title branch must pick the
    // interpolated key, not the plain one.
    screen.getByText('subjectHub.preparing.titleNamed');
    expect(screen.queryByText('subjectHub.preparing.title')).toBeNull();
  });

  it('renders the plain title key when subjectName is absent', () => {
    render(<SubjectHubPreparing onRetry={jest.fn()} onBack={jest.fn()} />);

    screen.getByText('subjectHub.preparing.title');
    expect(screen.queryByText('subjectHub.preparing.titleNamed')).toBeNull();
  });

  it('slow-phase status text carries accessibilityLiveRegion polite', () => {
    render(<SubjectHubPreparing onRetry={jest.fn()} onBack={jest.fn()} />);

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    const slowText = screen.getByText('subjectHub.preparing.slow');
    expect(slowText.props.accessibilityLiveRegion).toBe('polite');
  });

  it('stalled-phase status text carries accessibilityLiveRegion polite', () => {
    render(<SubjectHubPreparing onRetry={jest.fn()} onBack={jest.fn()} />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    const stalledText = screen.getByText('subjectHub.preparing.stalledMessage');
    expect(stalledText.props.accessibilityLiveRegion).toBe('polite');
  });
});
