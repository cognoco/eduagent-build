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
});
