import { act, render, screen } from '@testing-library/react-native';
import i18next from 'i18next';
import de from '../../../i18n/locales/de.json';

import { CelestialCelebration } from './CelestialCelebration';
import { PolarStar } from './PolarStar';
import { TwinStars } from './TwinStars';
import { Comet } from './Comet';
import { OrionsBelt } from './OrionsBelt';
import { useCelebration } from '../../../hooks/use-celebration';
import type { PendingCelebration } from '@eduagent/schemas';

/**
 * Controllable mock for useReducedMotion. Default: false (animations run).
 * Re-mock react-native-reanimated to replace the static `() => false` from
 * test-setup.ts with a jest.fn() that individual tests can override.
 */
const mockReduceMotion = jest.fn(() => false);
const mockDeferTimingCompletion = jest.fn(() => false);
const mockTimingCompletionCallbacks: Array<(finished: boolean) => void> = [];

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = { delay: () => chainable, duration: () => chainable };
  return {
    __esModule: true,
    default: {
      View,
      Text: View,
      ScrollView: View,
      createAnimatedComponent: (c: unknown) => c,
    },
    FadeIn: chainable,
    FadeInUp: chainable,
    FadeOutDown: chainable,
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useSharedValue: (v: unknown) => ({ value: v }),
    useReducedMotion: () => mockReduceMotion(),
    withTiming: (
      v: unknown,
      _opts?: unknown,
      cb?: (finished: boolean) => void,
    ) => {
      // Simulate the animation completing synchronously so tests can assert
      // on the withTiming callback (e.g., the runOnJS(onComplete) call that
      // fires after the fade-out). This models the external Reanimated
      // runtime's behaviour of calling the callback with finished=true.
      if (cb && mockDeferTimingCompletion()) {
        mockTimingCompletionCallbacks.push(cb);
      } else {
        cb?.(true);
      }
      return v;
    },
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[0],
    withDelay: (_d: number, v: unknown) => v,
    cancelAnimation: () => undefined,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: {
      linear: undefined,
      ease: undefined,
      bezier: () => undefined,
      inOut: () => undefined,
      out: () => undefined,
      in: () => undefined,
    },
  };
});

describe('CelestialCelebration', () => {
  afterEach(() => {
    mockReduceMotion.mockReturnValue(false);
    mockDeferTimingCompletion.mockReturnValue(false);
    mockTimingCompletionCallbacks.length = 0;
  });

  it('is hidden from assistive technology (decorative animation)', () => {
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />,
    );

    // accessibilityElementsHidden hides the subtree from a11y queries;
    // use includeHiddenElements:true to reach the element by testID.
    const element = screen.getByTestId('test-celebration', {
      includeHiddenElements: true,
    });
    expect(element.props.accessibilityElementsHidden).toBe(true);
    expect(element.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(element.props.accessibilityRole).toBeUndefined();
    expect(element.props.accessibilityLabel).toBeUndefined();
  });

  it('renders children inside the SVG', () => {
    const { toJSON } = render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />,
    );

    // Component should render without throwing
    expect(toJSON()).toBeTruthy();
  });

  it('keeps reduced-motion confirmation visible briefly before completing', () => {
    jest.useFakeTimers();
    mockReduceMotion.mockReturnValue(true);

    const onComplete = jest.fn();
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={onComplete}
        testID="test-celebration"
      />,
    );

    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1199);
    });
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('uses the latest callback at the reduced-motion boundary', () => {
    jest.useFakeTimers();
    mockReduceMotion.mockReturnValue(true);
    const firstCallback = jest.fn();
    const replacementCallback = jest.fn();
    const { rerender } = render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={firstCallback}
      />,
    );

    rerender(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={replacementCallback}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(replacementCallback).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('cleans up the reduced-motion timer on unmount', () => {
    jest.useFakeTimers();
    mockReduceMotion.mockReturnValue(true);
    const onComplete = jest.fn();
    const { unmount } = render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={onComplete}
      />,
    );

    unmount();
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(onComplete).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('calls onComplete via the animated path when withTiming callback fires', () => {
    mockReduceMotion.mockReturnValue(false);

    const onComplete = jest.fn();
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        onComplete={onComplete}
        testID="test-celebration"
      />,
    );

    // The animated path wires: withTiming(..., callback) → callback(finished=true)
    // → runOnJS(onComplete)(). The local mock fires withTiming callbacks
    // synchronously with finished=true, and runOnJS is identity, so onComplete
    // is called exactly once when the second withTiming (the fade-out) completes.
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('sets pointerEvents to none to avoid blocking touches', () => {
    render(
      <CelestialCelebration
        color="#f7c948"
        accentColor="#fce588"
        testID="test-celebration"
      />,
    );

    // accessibilityElementsHidden hides the subtree from a11y queries;
    // use includeHiddenElements:true to reach the element by testID.
    const element = screen.getByTestId('test-celebration', {
      includeHiddenElements: true,
    });
    const styles = [element.props.style].flat(Infinity);
    expect(styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointerEvents: 'none' }),
      ]),
    );
  });
});

function ReducedMotionMilestoneQueue({
  queue,
  profileId,
  audience = 'child',
  onAllComplete,
}: {
  queue: PendingCelebration[];
  profileId?: string;
  audience?: 'child' | 'adult';
  onAllComplete?: (profileId: string | null) => void;
}) {
  const { CelebrationOverlay } = useCelebration({
    queue,
    profileId,
    celebrationLevel: 'all',
    audience,
    onAllComplete,
  });
  return CelebrationOverlay;
}

function milestoneQueue(profile: string, count = 3): PendingCelebration[] {
  const queuedAt = '2026-01-01T10:00:00.000Z';
  return [
    {
      celebration: 'polar_star',
      reason: 'polar_star',
      detail: `${profile} first detail`,
      queuedAt,
    },
    {
      celebration: 'twin_stars',
      reason: 'twin_stars',
      detail: `${profile} second detail`,
      queuedAt,
    },
    {
      celebration: 'orions_belt',
      reason: 'orions_belt',
      detail: `${profile} third detail`,
      queuedAt,
    },
  ].slice(0, count) as PendingCelebration[];
}

function expectExactlyOneCelestialNode(testID: string): void {
  expect(
    screen.getAllByTestId(/^celebration-/, { includeHiddenElements: true }),
  ).toHaveLength(1);
  screen.getByTestId(testID, { includeHiddenElements: true });
}

describe('reduced-motion milestone queue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReduceMotion.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    mockReduceMotion.mockReturnValue(false);
  });

  it('mounts and drains three confirmations, then completes exactly once', () => {
    const onAllComplete = jest.fn();
    const queue = milestoneQueue('profile-A');
    render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queue}
        onAllComplete={onAllComplete}
      />,
    );

    expect(onAllComplete).not.toHaveBeenCalled();
    expectExactlyOneCelestialNode('celebration-polar-star');
    expect(
      screen.getByText('Polar Star - first independent answer'),
    ).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expectExactlyOneCelestialNode('celebration-twin-stars');
    expect(
      screen.getByText('Twin Stars - three strong answers in a row'),
    ).toBeTruthy();
    expect(onAllComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expectExactlyOneCelestialNode('celebration-orions-belt');
    expect(
      screen.getByText("Orion's Belt - 5 in a row without help!"),
    ).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(
      screen.queryAllByTestId(/^celebration-/, { includeHiddenElements: true }),
    ).toHaveLength(0);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenCalledWith('profile-A');

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  it('does not complete on an initial empty render or an ordinary rerender', () => {
    const onAllComplete = jest.fn();
    const { rerender } = render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={[]}
        onAllComplete={onAllComplete}
      />,
    );

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={[]}
        onAllComplete={onAllComplete}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onAllComplete).not.toHaveBeenCalled();
  });

  it('keeps delivery profile-owned across A to B to A switches', () => {
    const onAllComplete = jest.fn();
    const queueA = milestoneQueue('profile-A');
    const queueB = milestoneQueue('profile-B', 2);
    const { rerender } = render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queueA}
        onAllComplete={onAllComplete}
      />,
    );

    expectExactlyOneCelestialNode('celebration-polar-star');
    screen.getByText('profile-A first detail');

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-B"
        queue={queueB}
        onAllComplete={onAllComplete}
      />,
    );
    expect(screen.queryByText(/profile-A .* detail/)).toBeNull();
    screen.getByText('profile-B first detail');

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    screen.getByText('profile-B second detail');
    expect(screen.queryByText(/profile-A .* detail/)).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(onAllComplete).toHaveBeenCalledTimes(1);
    expect(onAllComplete).toHaveBeenLastCalledWith('profile-B');

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queueA}
        onAllComplete={onAllComplete}
      />,
    );
    screen.getByText('profile-A first detail');
    expect(screen.queryByText(/profile-B .* detail/)).toBeNull();

    act(() => {
      jest.advanceTimersByTime(1200);
    });
    screen.getByText('profile-A second detail');
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    screen.getByText('profile-A third detail');
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(onAllComplete).toHaveBeenCalledTimes(2);
    expect(onAllComplete).toHaveBeenLastCalledWith('profile-A');
  });

  it('admits one confirmation for exact duplicates in one snapshot', () => {
    const onAllComplete = jest.fn();
    const entry = milestoneQueue('profile-A', 1)[0]!;
    render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={[entry, entry]}
        onAllComplete={onAllComplete}
      />,
    );

    expectExactlyOneCelestialNode('celebration-polar-star');
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(
      screen.queryAllByTestId(/^celebration-/, { includeHiddenElements: true }),
    ).toHaveLength(0);
    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  it('uses fresh completion callback after rerender', () => {
    const firstCallback = jest.fn();
    const replacementCallback = jest.fn();
    const queue = milestoneQueue('profile-A', 1);
    const { rerender } = render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queue}
        onAllComplete={firstCallback}
      />,
    );

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queue}
        onAllComplete={replacementCallback}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(replacementCallback).toHaveBeenCalledTimes(1);
  });

  it('renders localized child and adult earned-context copy', async () => {
    const originalLanguage = i18next.language;
    i18next.addResourceBundle('de', 'translation', de, true, true);
    await i18next.changeLanguage('de');

    const queue = milestoneQueue('profile-A', 1);
    const { rerender, unmount } = render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queue}
        audience="child"
      />,
    );
    screen.getByText('Polarstern – deine erste selbstständige Antwort!');

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-B"
        queue={queue}
        audience="adult"
      />,
    );
    screen.getByText('Polarstern – erste selbstständige Antwort.');

    unmount();
    await act(async () => {
      await i18next.changeLanguage(originalLanguage);
    });
  });
});

describe('animated milestone completion ownership', () => {
  beforeEach(() => {
    mockReduceMotion.mockReturnValue(false);
    mockDeferTimingCompletion.mockReturnValue(true);
    mockTimingCompletionCallbacks.length = 0;
  });

  afterEach(() => {
    mockDeferTimingCompletion.mockReturnValue(false);
    mockTimingCompletionCallbacks.length = 0;
  });

  it('defers a late completion until its owner is active again', () => {
    const onProfileAComplete = jest.fn();
    const onProfileBComplete = jest.fn();
    const queueA = milestoneQueue('profile-A', 1);
    const { rerender } = render(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queueA}
        onAllComplete={onProfileAComplete}
      />,
    );
    const completeProfileAAnimation = mockTimingCompletionCallbacks[0];
    expect(completeProfileAAnimation).toBeDefined();

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-B"
        queue={[]}
        onAllComplete={onProfileBComplete}
      />,
    );
    act(() => {
      completeProfileAAnimation?.(true);
    });

    expect(onProfileAComplete).not.toHaveBeenCalled();
    expect(onProfileBComplete).not.toHaveBeenCalled();

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queueA}
        onAllComplete={onProfileAComplete}
      />,
    );
    expect(onProfileAComplete).toHaveBeenCalledTimes(1);
    expect(onProfileAComplete).toHaveBeenCalledWith('profile-A');
    expect(onProfileBComplete).not.toHaveBeenCalled();

    rerender(
      <ReducedMotionMilestoneQueue
        profileId="profile-A"
        queue={queueA}
        onAllComplete={onProfileAComplete}
      />,
    );
    expect(onProfileAComplete).toHaveBeenCalledTimes(1);
  });
});

describe('PolarStar', () => {
  afterEach(() => {
    mockReduceMotion.mockReturnValue(false);
  });

  it('renders with default testID', () => {
    render(<PolarStar />);
    screen.getByTestId('celebration-polar-star', {
      includeHiddenElements: true,
    });
  });

  it('accepts custom testID', () => {
    render(<PolarStar testID="custom-polar" />);
    screen.getByTestId('custom-polar', { includeHiddenElements: true });
  });

  it('passes onComplete to CelestialCelebration', () => {
    jest.useFakeTimers();
    mockReduceMotion.mockReturnValue(true);

    const onComplete = jest.fn();
    render(<PolarStar onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(onComplete).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('TwinStars', () => {
  it('renders with default testID', () => {
    render(<TwinStars />);
    screen.getByTestId('celebration-twin-stars', {
      includeHiddenElements: true,
    });
  });

  it('accepts custom testID', () => {
    render(<TwinStars testID="custom-twins" />);
    screen.getByTestId('custom-twins', { includeHiddenElements: true });
  });
});

describe('Comet', () => {
  it('renders with default testID', () => {
    render(<Comet />);
    screen.getByTestId('celebration-comet', { includeHiddenElements: true });
  });

  it('accepts custom testID', () => {
    render(<Comet testID="custom-comet" />);
    screen.getByTestId('custom-comet', { includeHiddenElements: true });
  });
});

describe('OrionsBelt', () => {
  it('renders with default testID', () => {
    render(<OrionsBelt />);
    screen.getByTestId('celebration-orions-belt', {
      includeHiddenElements: true,
    });
  });

  it('accepts custom testID', () => {
    render(<OrionsBelt testID="custom-orion" />);
    screen.getByTestId('custom-orion', { includeHiddenElements: true });
  });
});
