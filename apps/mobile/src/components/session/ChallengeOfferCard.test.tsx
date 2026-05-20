import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const { ChallengeOfferCard } = require('./ChallengeOfferCard');

describe('ChallengeOfferCard', () => {
  const defaultProps = {
    pitch: 'Want to explain this in your own words?',
    onAccept: jest.fn(),
    onDecline: jest.fn(),
    onDontAskAgain: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the card with the pitch text', () => {
    render(<ChallengeOfferCard {...defaultProps} />);
    screen.getByTestId('challenge-offer-card');
    screen.getByText('Want to explain this in your own words?');
  });

  it('renders the offer title from i18n', () => {
    render(<ChallengeOfferCard {...defaultProps} />);
    screen.getByText('Up for a challenge round?');
  });

  it('calls onAccept when the accept button is pressed', () => {
    render(<ChallengeOfferCard {...defaultProps} />);
    fireEvent.press(screen.getByTestId('challenge-offer-accept'));
    expect(defaultProps.onAccept).toHaveBeenCalledTimes(1);
  });

  it('calls onDecline when the decline button is pressed', () => {
    render(<ChallengeOfferCard {...defaultProps} />);
    fireEvent.press(screen.getByTestId('challenge-offer-decline'));
    expect(defaultProps.onDecline).toHaveBeenCalledTimes(1);
  });

  it('calls onDontAskAgain when the dont-ask button is pressed', () => {
    render(<ChallengeOfferCard {...defaultProps} />);
    fireEvent.press(screen.getByTestId('challenge-offer-dont-ask'));
    expect(defaultProps.onDontAskAgain).toHaveBeenCalledTimes(1);
  });
});
