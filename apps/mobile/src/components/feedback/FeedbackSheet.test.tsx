import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  cleanupScreen,
  ERROR_RESPONSES,
  renderScreen,
} from '../../test-utils/screen-render';
import { FeedbackSheet } from './FeedbackSheet';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
}));

describe('FeedbackSheet', () => {
  let active: ReturnType<typeof renderScreen> | null = null;
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('clears submitted state when reopened', async () => {
    active = renderScreen(<FeedbackSheet visible onClose={onClose} />, {
      routes: { '/feedback': { id: 'feedback-1' } },
    });

    fireEvent.changeText(
      screen.getByTestId('feedback-message-input'),
      'The hint copy is stale.',
    );
    fireEvent.press(screen.getByTestId('feedback-submit'));
    await waitFor(() => {
      screen.getByText('Thank you!');
    });

    active.result.rerender(<FeedbackSheet visible={false} onClose={onClose} />);
    active.result.rerender(<FeedbackSheet visible onClose={onClose} />);

    expect(screen.queryByText('Thank you!')).toBeNull();
    expect(screen.getByTestId('feedback-message-input')).toBeTruthy();
  });

  it('clears submit error when the message changes', async () => {
    active = renderScreen(<FeedbackSheet visible onClose={onClose} />, {
      routes: {
        '/feedback': () => ERROR_RESPONSES.validation('Please add more detail'),
      },
    });

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Hi');
    fireEvent.press(screen.getByTestId('feedback-submit'));
    await waitFor(() => {
      screen.getByText('Please add more detail');
    });

    fireEvent.changeText(
      screen.getByTestId('feedback-message-input'),
      'Here is more detail.',
    );

    expect(screen.queryByText('Please add more detail')).toBeNull();
  });
});
