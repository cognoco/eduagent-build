import { render, screen } from '@testing-library/react-native';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const { ChallengeRoundBanner } = require('./ChallengeRoundBanner');

describe('ChallengeRoundBanner', () => {
  it('renders the banner testID', () => {
    render(<ChallengeRoundBanner questionIndex={0} totalQuestions={3} />);
    screen.getByTestId('challenge-round-banner');
  });

  it('renders "Question 1 of 3" for index 0 / total 3', () => {
    render(<ChallengeRoundBanner questionIndex={0} totalQuestions={3} />);
    screen.getByText('Question 1 of 3');
  });

  it('renders "Question 2 of 3" for index 1 / total 3', () => {
    render(<ChallengeRoundBanner questionIndex={1} totalQuestions={3} />);
    screen.getByText('Question 2 of 3');
  });

  it('renders "Question 3 of 5" for index 2 / total 5', () => {
    render(<ChallengeRoundBanner questionIndex={2} totalQuestions={5} />);
    screen.getByText('Question 3 of 5');
  });
});
