import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import {
  ConsentRequiredError,
  ForbiddenError,
  NetworkError,
  RateLimitedError,
} from '../../lib/api-errors';
import { LearnerGuardianNudgeCard } from './LearnerGuardianNudgeCard';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockMutateAsync = jest.fn();

jest.mock(
  '../../hooks/use-nudges' /* gc1-allow: component test controls the network mutation boundary */,
  () => ({
    useSendNudge: () => ({ mutateAsync: mockMutateAsync }),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../lib/platform-alert' /* gc1-allow: wraps Alert.alert which is unavailable in JSDOM */,
  () => ({ platformAlert: (...args: unknown[]) => mockPlatformAlert(...args) }),
);

const mockCaptureException = jest.fn();
jest.mock(
  '../../lib/sentry' /* gc1-allow: Sentry SDK loads native module config at import - crashes Jest */,
  () => ({
    Sentry: {
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    },
  }),
);

describe('LearnerGuardianNudgeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('renders the fixed learner-to-guardian template buttons', () => {
    render(
      <LearnerGuardianNudgeCard
        guardianName="Alex"
        guardianProfileId="guardian-id"
      />,
    );

    screen.getByTestId('learner-guardian-nudge-card');
    screen.getByTestId('learner-guardian-nudge-template-thanks');
    screen.getByTestId('learner-guardian-nudge-template-need_help');
    screen.getByTestId('learner-guardian-nudge-template-proud_moment');
    screen.getByText('Thank you');
    screen.getByText('I need help');
    screen.getByText("I'm proud of what I did");
  });

  it('sends only the template key, recipient id, and typed direction', async () => {
    render(
      <LearnerGuardianNudgeCard
        guardianName="Alex"
        guardianProfileId="guardian-id"
      />,
    );

    fireEvent.press(
      screen.getByTestId('learner-guardian-nudge-template-need_help'),
    );

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        toProfileId: 'guardian-id',
        direction: 'learner_to_guardian',
        template: 'need_help',
      });
    });
    const payload = mockMutateAsync.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('message');
    expect(payload).not.toHaveProperty('body');
    expect(payload).not.toHaveProperty('freeText');
  });

  it('shows a sent confirmation after success', async () => {
    render(
      <LearnerGuardianNudgeCard
        guardianName="Alex"
        guardianProfileId="guardian-id"
      />,
    );

    fireEvent.press(
      screen.getByTestId('learner-guardian-nudge-template-thanks'),
    );

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith('Signal sent');
    });
  });

  it.each([
    [new RateLimitedError('rate limited'), 'Try again a little later.'],
    [
      new ConsentRequiredError('consent required'),
      'Signals work once your account is fully set up.',
    ],
    [
      new ForbiddenError('forbidden'),
      "We couldn't confirm that guardian link.",
    ],
    [
      new NetworkError(),
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    ],
  ])('shows inline error copy for %p', async (error, copy) => {
    mockMutateAsync.mockRejectedValue(error);
    render(
      <LearnerGuardianNudgeCard
        guardianName="Alex"
        guardianProfileId="guardian-id"
      />,
    );

    fireEvent.press(
      screen.getByTestId('learner-guardian-nudge-template-proud_moment'),
    );

    await waitFor(() => {
      screen.getByText(copy);
    });
  });

  it('captures unknown errors', async () => {
    const error = new Error('boom');
    mockMutateAsync.mockRejectedValue(error);
    render(
      <LearnerGuardianNudgeCard
        guardianName="Alex"
        guardianProfileId="guardian-id"
      />,
    );

    fireEvent.press(
      screen.getByTestId('learner-guardian-nudge-template-proud_moment'),
    );

    await waitFor(() => {
      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        tags: { component: 'LearnerGuardianNudgeCard' },
      });
      screen.getByText('Something unexpected happened. Please try again.');
    });
  });
});
