import { render } from '@testing-library/react-native';
import i18next from 'i18next';
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

  it('uses localized copy for the image accessibility label', async () => {
    const originalLanguage = i18next.language;
    i18next.addResourceBundle(
      'de',
      'translation',
      { common: { mentorImageAlt: 'Dein Mentor' } },
      true,
      true,
    );

    await i18next.changeLanguage('de');
    const { getByTestId, unmount } = render(
      <MentorMascot testID="mentor-mascot" />,
    );

    try {
      expect(getByTestId('mentor-mascot').props.accessibilityLabel).toBe(
        'Dein Mentor',
      );
    } finally {
      unmount();
      await i18next.changeLanguage(originalLanguage);
    }
  });

  it('accepts size prop in both poses', () => {
    const hero = render(<MentorMascot size={230} pose="hero" />);
    expect(hero.toJSON()).toBeTruthy();
    const badge = render(<MentorMascot size={56} pose="badge" />);
    expect(badge.toJSON()).toBeTruthy();
  });
});
