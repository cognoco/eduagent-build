import { render, screen } from '@testing-library/react-native';

// Use the real en.json via the shared i18n mock so assertions reference the
// actual English strings (what users see), not bare translation keys.
jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const { ReturningSessionGreeting } = require('./ReturningSessionGreeting');

describe('ReturningSessionGreeting', () => {
  it('renders testID="returning-session-greeting" in all tiers', () => {
    render(<ReturningSessionGreeting />);
    screen.getByTestId('returning-session-greeting');
  });

  describe('Tier A — name + subject', () => {
    it('renders the withNameSubject template with interpolated values', () => {
      render(<ReturningSessionGreeting name="Alex" subject="Physics" />);

      // Distinctive continuity clause unique to this tier (names the subject)
      screen.getByText(/Welcome back, Alex\. Ready to pick up Physics/);
    });

    it('does NOT claim any win or mastery (honesty rule)', () => {
      render(<ReturningSessionGreeting name="Alex" subject="Physics" />);

      // No "you nailed / you mastered / great job" — neutral continuity only
      expect(
        screen.queryByText(/nailed|mastered|great job|well done/i),
      ).toBeNull();
    });
  });

  describe('Tier B — name only (no subject)', () => {
    it('renders the withName template', () => {
      render(<ReturningSessionGreeting name="Jordan" />);

      screen.getByText(/^Welcome back, Jordan\./);
    });

    it('does NOT render the subject continuity clause in tier B', () => {
      render(<ReturningSessionGreeting name="Jordan" />);

      expect(screen.queryByText(/Ready to pick up/)).toBeNull();
    });
  });

  describe('Tier C — generic (no name, no subject)', () => {
    it('renders the generic template when no props supplied', () => {
      render(<ReturningSessionGreeting />);

      screen.getByText(/^Welcome back\./);
      expect(screen.queryByText(/Ready to pick up/)).toBeNull();
    });

    it('treats empty-string name as absent and falls back to generic', () => {
      render(<ReturningSessionGreeting name="" subject="Math" />);
      // No name → cannot reach name+subject tier → generic (no subject clause)
      screen.getByText(/^Welcome back\./);
      expect(screen.queryByText(/Ready to pick up/)).toBeNull();
    });

    it('treats whitespace-only name as absent and falls back to generic', () => {
      render(<ReturningSessionGreeting name="   " subject="Math" />);
      screen.getByText(/^Welcome back\./);
      expect(screen.queryByText(/Ready to pick up/)).toBeNull();
    });
  });

  describe('Edge — name present, subject empty', () => {
    it('treats empty-string subject as absent and uses withName tier', () => {
      render(<ReturningSessionGreeting name="Lee" subject="" />);
      screen.getByText(/^Welcome back, Lee\./);
      expect(screen.queryByText(/Ready to pick up/)).toBeNull();
    });
  });
});
