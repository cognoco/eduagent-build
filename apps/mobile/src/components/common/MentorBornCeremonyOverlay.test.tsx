import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Sentry } from '../../lib/sentry';
import {
  __resetMentorBornCeremonyForTests,
  completeMentorBornCeremonyDurably,
  getMentorBornCeremonySnapshot,
  queueMentorBornCeremony,
  requestMentorBornCeremony,
} from '../../lib/mentor-born-ceremony';

process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??= 'pk_test_mock';

const {
  MENTOR_BORN_CEREMONY_CAP_MS,
  MentorBornCeremonyOverlay,
} = require('./MentorBornCeremonyOverlay');

describe('MentorBornCeremonyOverlay', () => {
  beforeEach(() => {
    const reanimated = require('react-native-reanimated');
    reanimated.useReducedMotion = () => false;
    __resetMentorBornCeremonyForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('clears the ceremony request on tap-to-skip', async () => {
    requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const { getByTestId, queryByTestId } = render(
      <MentorBornCeremonyOverlay />,
    );

    getByTestId('mentor-born-ceremony-overlay');
    fireEvent.press(getByTestId('mentor-birth-animation-skip'));

    await waitFor(() => {
      expect(queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    });
    expect(getMentorBornCeremonySnapshot()).toMatchObject({
      activeRequest: null,
      requestCount: 1,
    });
  });

  it('caps the ceremony so navigation is never blocked by a dropped animation callback', async () => {
    jest.useFakeTimers();
    requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const { queryByTestId } = render(<MentorBornCeremonyOverlay />);
    expect(queryByTestId('mentor-born-ceremony-overlay')).not.toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(MENTOR_BORN_CEREMONY_CAP_MS);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    expect(getMentorBornCeremonySnapshot().activeRequest).toBeNull();
  });

  it('[WI-2105 AC-2] restores the queued ceremony across an immediate root remount', async () => {
    await queueMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const first = render(<MentorBornCeremonyOverlay />);
    first.getByTestId('mentor-born-ceremony-overlay');
    first.unmount();

    __resetMentorBornCeremonyForTests();
    const remounted = render(<MentorBornCeremonyOverlay />);

    await waitFor(() => {
      remounted.getByTestId('mentor-born-ceremony-overlay');
    });
    const restored = getMentorBornCeremonySnapshot().activeRequest;
    if (!restored) throw new Error('expected restored ceremony request');
    await act(async () => {
      await completeMentorBornCeremonyDurably(restored.id);
    });
    expect(remounted.queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    remounted.unmount();
  });

  it('clears the ceremony and reports when the animation render crashes', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(require('./MentorBirthAnimation'), 'MentorBirthAnimation')
      .mockImplementation(() => {
        throw new Error('mentor birth overlay render failed');
      });
    requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const { queryByTestId } = render(<MentorBornCeremonyOverlay />);

    await waitFor(() => {
      expect(queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    });
    expect(getMentorBornCeremonySnapshot().activeRequest).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'mentor birth overlay render failed',
      }),
      {
        extra: { componentStack: expect.any(String) },
        tags: { component: 'MentorBornCeremony' },
      },
    );
  });
});
