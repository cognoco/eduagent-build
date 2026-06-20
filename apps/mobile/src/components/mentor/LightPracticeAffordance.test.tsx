import { render, fireEvent } from '@testing-library/react-native';

import { LightPracticeAffordance } from './LightPracticeAffordance';

describe('LightPracticeAffordance', () => {
  it('renders supported light-practice actions and calls navigation with route ids', () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText, queryByText } = render(
      <LightPracticeAffordance
        reason="thin_feed"
        supportedRoutes={['capitals', 'guess_who']}
        onSelect={onSelect}
      />,
    );

    expect(getByText('Prefer something light?')).toBeTruthy();
    fireEvent.press(getByTestId('light-practice-capitals'));
    fireEvent.press(getByTestId('light-practice-guess_who'));

    expect(onSelect).toHaveBeenNthCalledWith(1, 'capitals');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'guess_who');
    expect(queryByText(/leaderboard|rank|streak|loss/i)).toBeNull();
  });

  it('hides cleanly when no supported routes exist', () => {
    const { queryByTestId } = render(
      <LightPracticeAffordance supportedRoutes={[]} onSelect={jest.fn()} />,
    );

    expect(queryByTestId('mentor-light-practice')).toBeNull();
  });
});
