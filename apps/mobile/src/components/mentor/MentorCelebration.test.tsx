import { render } from '@testing-library/react-native';

import { MentorCelebration } from './MentorCelebration';

describe('MentorCelebration', () => {
  it('wraps mentor copy in the celebratory one-shot surface', () => {
    const onMarkSeen = jest.fn();
    const { getByTestId, getByText } = render(
      <MentorCelebration
        eventId="event-1"
        messageKey="mentorHome.celebration.ownChoice"
        seenEventIds={new Set()}
        onMarkSeen={onMarkSeen}
      />,
    );

    expect(getByTestId('mentor-celebration')).toBeTruthy();
    expect(getByText('You chose the next step.')).toBeTruthy();
    expect(onMarkSeen).toHaveBeenCalledWith('event-1');
  });

  it('keeps an exit animation on the removable celebration surface', () => {
    const { getByTestId } = render(
      <MentorCelebration
        eventId="event-1"
        messageKey="mentorHome.celebration.ownChoice"
        seenEventIds={new Set()}
      />,
    );

    expect(getByTestId('mentor-celebration').props.exiting).toBeTruthy();
    expect(getByTestId('mentor-celebration').props.collapsable).toBe(false);
  });

  it('does not retrigger celebratory styling for an already seen event', () => {
    const { queryByTestId, getByTestId } = render(
      <MentorCelebration
        eventId="event-1"
        messageKey="mentorHome.celebration.ownChoice"
        seenEventIds={new Set(['event-1'])}
      />,
    );

    expect(queryByTestId('mentor-celebration')).toBeNull();
    expect(getByTestId('mentor-celebration-static')).toBeTruthy();
  });

  it('still shows the celebration surface and marks seen under reduced motion', () => {
    const reanimated = require('react-native-reanimated');
    const spy = jest
      .spyOn(reanimated, 'useReducedMotion')
      .mockReturnValue(true);
    // Spy (not mock) on useSharedValue so it still delegates to the real
    // mock implementation — this lets us see what initial value the
    // component requested (scale/opacity rest state) without changing it.
    const sharedValueSpy = jest.spyOn(reanimated, 'useSharedValue');
    try {
      const onMarkSeen = jest.fn();
      const { getByTestId, getByText } = render(
        <MentorCelebration
          eventId="event-2"
          messageKey="mentorHome.celebration.ownChoice"
          seenEventIds={new Set()}
          onMarkSeen={onMarkSeen}
        />,
      );

      expect(getByTestId('mentor-celebration')).toBeTruthy();
      expect(getByText('You chose the next step.')).toBeTruthy();
      expect(onMarkSeen).toHaveBeenCalledWith('event-2');

      // Reduced motion: scale and opacity are initialised straight to their
      // rest values (1) instead of the burst's start values (0.8 / 0), and
      // the exit transition is skipped entirely.
      const initialSharedValues = sharedValueSpy.mock.calls.map(([v]) => v);
      expect(initialSharedValues).toEqual([1, 1]);
      expect(getByTestId('mentor-celebration').props.exiting).toBeUndefined();
    } finally {
      spy.mockRestore();
      sharedValueSpy.mockRestore();
    }
  });
});
