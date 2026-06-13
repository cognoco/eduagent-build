import { render } from '@testing-library/react-native';
import { MentorMascot } from './MentorMascot';

describe('MentorMascot', () => {
  it('renders the hero pose by default', () => {
    const { toJSON } = render(<MentorMascot />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders the badge pose', () => {
    const { toJSON } = render(<MentorMascot pose="badge" />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with testID', () => {
    const { getByTestId } = render(<MentorMascot testID="mentor-mascot" />);
    getByTestId('mentor-mascot');
  });

  it('accepts size prop in both poses', () => {
    const hero = render(<MentorMascot size={230} pose="hero" />);
    expect(hero.toJSON()).toBeTruthy();
    const badge = render(<MentorMascot size={56} pose="badge" />);
    expect(badge.toJSON()).toBeTruthy();
  });
});
