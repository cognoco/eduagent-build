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
import { NudgeActionSheet } from './NudgeActionSheet';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockMutateAsync = jest.fn();

jest.mock(
  '../../hooks/use-nudges' /* gc1-allow: external hook boundary — wraps TanStack mutation that requires QueryClient */,
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
  '../../lib/sentry' /* gc1-allow: Sentry SDK loads native module config at import — crashes Jest */,
  () => ({
    Sentry: {
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    },
  }),
);

const defaultProps = {
  childName: 'Emma',
  childProfileId: 'child-profile-id',
  onClose: jest.fn(),
};

describe('NudgeActionSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('renders all 4 template buttons', () => {
    render(<NudgeActionSheet {...defaultProps} />);

    screen.getByTestId('nudge-template-you_got_this');
    screen.getByTestId('nudge-template-proud_of_you');
    screen.getByTestId('nudge-template-quick_session');
    screen.getByTestId('nudge-template-thinking_of_you');
    screen.getByText('You got this');
    screen.getByText('Proud of you');
    screen.getByText('Want to do a quick session?');
    screen.getByText('Just thinking of you');
  });

  it('pressing a template calls mutateAsync with correct params', async () => {
    render(<NudgeActionSheet {...defaultProps} />);

    fireEvent.press(screen.getByTestId('nudge-template-you_got_this'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        toProfileId: 'child-profile-id',
        template: 'you_got_this',
      });
    });
  });

  it('on success calls platformAlert and onClose', async () => {
    const onClose = jest.fn();
    render(<NudgeActionSheet {...defaultProps} onClose={onClose} />);

    fireEvent.press(screen.getByTestId('nudge-template-proud_of_you'));

    await waitFor(() => {
      expect(mockPlatformAlert).toHaveBeenCalledWith('Nudge sent');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('on RateLimitedError shows rate limit error copy', async () => {
    mockMutateAsync.mockRejectedValue(new RateLimitedError('rate limited'));

    render(<NudgeActionSheet {...defaultProps} childName="Emma" />);
    fireEvent.press(screen.getByTestId('nudge-template-you_got_this'));

    await waitFor(() => {
      screen.getByText(
        "You've sent enough encouragement for now - Emma will see it next time they open the app.",
      );
    });
  });

  it('on ConsentRequiredError shows consent error copy', async () => {
    mockMutateAsync.mockRejectedValue(
      new ConsentRequiredError('consent required'),
    );

    render(<NudgeActionSheet {...defaultProps} childName="Emma" />);
    fireEvent.press(screen.getByTestId('nudge-template-proud_of_you'));

    await waitFor(() => {
      screen.getByText(
        "Emma's consent is pending - encouragement will work once they're set up.",
      );
    });
  });

  it('on ForbiddenError shows forbidden error copy', async () => {
    mockMutateAsync.mockRejectedValue(
      new ForbiddenError('Not a parent of this child'),
    );

    render(<NudgeActionSheet {...defaultProps} childName="Emma" />);
    fireEvent.press(screen.getByTestId('nudge-template-you_got_this'));

    await waitFor(() => {
      screen.getByText("You don't have permission to send Emma a nudge.");
    });
  });

  it('on NetworkError shows network error copy', async () => {
    mockMutateAsync.mockRejectedValue(new NetworkError());

    render(<NudgeActionSheet {...defaultProps} />);
    fireEvent.press(screen.getByTestId('nudge-template-quick_session'));

    await waitFor(() => {
      screen.getByText(
        "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
      );
    });
  });

  it('on unknown error calls Sentry.captureException and shows generic error copy', async () => {
    const unknownError = new Error('unexpected');
    mockMutateAsync.mockRejectedValue(unknownError);

    render(<NudgeActionSheet {...defaultProps} />);
    fireEvent.press(screen.getByTestId('nudge-template-thinking_of_you'));

    await waitFor(() => {
      expect(mockCaptureException).toHaveBeenCalledWith(unknownError, {
        tags: { component: 'NudgeActionSheet' },
      });
      screen.getByText('Something unexpected happened. Please try again.');
    });
  });

  it('close button calls onClose', () => {
    const onClose = jest.fn();
    render(<NudgeActionSheet {...defaultProps} onClose={onClose} />);

    fireEvent.press(screen.getByTestId('nudge-action-sheet-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
