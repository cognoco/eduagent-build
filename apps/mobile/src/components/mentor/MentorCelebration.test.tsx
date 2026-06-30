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
    } finally {
      spy.mockRestore();
    }
  });
});
