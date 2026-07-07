import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import {
  __resetMentorBornCeremonyForTests,
  getMentorBornCeremonySnapshot,
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

  it('clears the ceremony request on tap-to-skip', () => {
    requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const { getByTestId, queryByTestId } = render(
      <MentorBornCeremonyOverlay />,
    );

    getByTestId('mentor-born-ceremony-overlay');
    fireEvent.press(getByTestId('mentor-birth-animation-skip'));

    expect(queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    expect(getMentorBornCeremonySnapshot()).toMatchObject({
      activeRequest: null,
      requestCount: 1,
    });
  });

  it('caps the ceremony so navigation is never blocked by a dropped animation callback', () => {
    jest.useFakeTimers();
    requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const { queryByTestId } = render(<MentorBornCeremonyOverlay />);
    expect(queryByTestId('mentor-born-ceremony-overlay')).not.toBeNull();

    act(() => {
      jest.advanceTimersByTime(MENTOR_BORN_CEREMONY_CAP_MS);
    });

    expect(queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    expect(getMentorBornCeremonySnapshot().activeRequest).toBeNull();
  });

  it('completes instantly for reduced-motion users', async () => {
    require('react-native-reanimated').useReducedMotion = () => true;
    requestMentorBornCeremony({
      profileId: 'learner-1',
      reason: 'first-profile-created',
    });

    const { queryByTestId } = render(<MentorBornCeremonyOverlay />);

    await waitFor(() => {
      expect(queryByTestId('mentor-born-ceremony-overlay')).toBeNull();
    });
    expect(getMentorBornCeremonySnapshot().activeRequest).toBeNull();
  });
});
