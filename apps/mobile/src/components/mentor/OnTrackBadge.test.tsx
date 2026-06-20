import { render } from '@testing-library/react-native';

import { OnTrackBadge } from './OnTrackBadge';

describe('OnTrackBadge', () => {
  it('renders a calm on-track label and optional due review count', () => {
    const { getByTestId, getByText, queryByText } = render(
      <OnTrackBadge reviewsDue={3} />,
    );

    expect(getByTestId('mentor-on-track-badge')).toBeTruthy();
    expect(getByText('On track')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(queryByText(/streak|leaderboard|rank|lose|loss/i)).toBeNull();
  });
});
