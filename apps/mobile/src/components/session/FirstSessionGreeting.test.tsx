import { render, screen } from '@testing-library/react-native';

// Use the real en.json via the shared i18n mock so assertions reference the
// actual English strings (what users see), not bare translation keys.
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const { FirstSessionGreeting } = require('./FirstSessionGreeting');

describe('FirstSessionGreeting', () => {
  it('renders testID="first-session-greeting" in all tiers', () => {
    render(<FirstSessionGreeting />);
    screen.getByTestId('first-session-greeting');
  });

  describe('Tier A — name + subject + interest', () => {
    it('renders the withNameSubjectInterest template with interpolated values', () => {
      render(
        <FirstSessionGreeting
          name="Alex"
          subject="Physics"
          interest="football"
        />,
      );

      // Distinctive prefix unique to this tier (contains interest clause)
      screen.getByText(
        /Hi Alex\. You're here to work on Physics.*football.*Where should we start with Physics/s,
      );
      // Quota copy is present
      screen.getByText(/10 free questions a day, 100 a month/);
    });
  });

  describe('Tier B — name + subject (no interest)', () => {
    it('renders the withNameSubject template with interpolated values', () => {
      render(<FirstSessionGreeting name="Jordan" subject="Chemistry" />);

      screen.getByText(
        /Hi Jordan\. You're here to work on Chemistry\. Ask me anything/,
      );
      screen.getByText(/Where should we start with Chemistry\?/);
    });

    it('does NOT render the interest clause in tier B', () => {
      render(<FirstSessionGreeting name="Jordan" subject="Chemistry" />);

      expect(screen.queryByText(/since you're into/)).toBeNull();
    });
  });

  describe('Tier C — name only (no subject, no interest)', () => {
    it('renders the withName template', () => {
      render(<FirstSessionGreeting name="Sam" />);

      screen.getByText(/Hi Sam\. I'm your mentor/);
      screen.getByText(/10 free questions a day, 100 a month/);
      screen.getByText(/What would you like to start with\?/);
    });
  });

  describe('Tier D — no data (generic)', () => {
    it('renders the generic template when no props supplied', () => {
      render(<FirstSessionGreeting />);

      screen.getByText(/^Hi\. I'm your mentor/);
      screen.getByText(/10 free questions a day, 100 a month/);
      screen.getByText(/What would you like to start with\?/);
    });

    it('treats empty-string name as absent and falls back to generic', () => {
      render(<FirstSessionGreeting name="" subject="Math" interest="music" />);
      // No salutation with name — falls through to generic
      screen.getByText(/^Hi\. I'm your mentor/);
    });

    it('treats whitespace-only name as absent and falls back to generic', () => {
      render(<FirstSessionGreeting name="   " />);
      screen.getByText(/^Hi\. I'm your mentor/);
    });

    it('treats empty-string subject as absent and uses withName tier', () => {
      render(<FirstSessionGreeting name="Lee" subject="" interest="gaming" />);
      // subject is empty → withName tier (no subject clause, no interest clause)
      screen.getByText(/Hi Lee\. I'm your mentor/);
    });
  });
});
