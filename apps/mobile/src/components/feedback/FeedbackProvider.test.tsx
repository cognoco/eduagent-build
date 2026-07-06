import { Pressable, Text } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { cleanupScreen, renderScreen } from '../../test-utils/screen-render';
import { FeedbackProvider, useFeedbackContext } from './FeedbackProvider';

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

const mockAddListener = jest.fn();
const mockIsAvailableAsync = jest.fn();

jest.mock('expo-sensors', () => ({
  Accelerometer: {
    addListener: (...args: unknown[]) => mockAddListener(...args),
    isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
    setUpdateInterval: jest.fn(),
  },
}));

function FeedbackOpenButton(): React.ReactElement {
  const { openFeedback } = useFeedbackContext();
  return (
    <Pressable testID="open-feedback" onPress={openFeedback}>
      <Text>Open feedback</Text>
    </Pressable>
  );
}

describe('FeedbackProvider', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailableAsync.mockResolvedValue(true);
    mockAddListener.mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  it('opens FeedbackSheet through the context openFeedback path', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    active = renderScreen(
      <FeedbackProvider>
        <FeedbackOpenButton />
      </FeedbackProvider>,
    );

    expect(screen.queryByTestId('feedback-modal')).toBeNull();

    fireEvent.press(screen.getByTestId('open-feedback'));

    await waitFor(() => {
      expect(screen.getByTestId('feedback-modal')).toBeTruthy();
    });
  });

  it('opens the same FeedbackSheet from the shake detector callback', async () => {
    active = renderScreen(
      <FeedbackProvider>
        <Text>Child content</Text>
      </FeedbackProvider>,
    );

    await waitFor(() => {
      expect(mockAddListener).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('feedback-modal')).toBeNull();

    const onAccelerometerChange = mockAddListener.mock.calls[0]?.[0] as
      | ((reading: { x: number; y: number; z: number }) => void)
      | undefined;
    if (!onAccelerometerChange) {
      throw new Error('Expected shake detector to register a listener');
    }

    await act(async () => {
      onAccelerometerChange({ x: 3, y: 0, z: 0 });
      onAccelerometerChange({ x: 3, y: 0, z: 0 });
      onAccelerometerChange({ x: 3, y: 0, z: 0 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-modal')).toBeTruthy();
    });
  });
});
