import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import CameraScreen from './camera';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

// Mock expo-camera — CameraView as a simple View for testing
jest.mock('expo-camera', () => {
  const { forwardRef } = require('react');
  const { View } = require('react-native');
  return {
    CameraView: forwardRef(function MockCameraView(
      {
        children,
        testID,
        ...props
      }: {
        children?: React.ReactNode;
        testID?: string;
        [key: string]: unknown;
      },
      _ref: unknown
    ) {
      return (
        <View testID={testID ?? 'camera-view'} {...props}>
          {children}
        </View>
      );
    }),
    useCameraPermissions: jest.fn(),
  };
});

// Mock safe area
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest
    .fn()
    .mockReturnValue({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock the OCR hook
const mockProcess = jest.fn().mockResolvedValue(undefined);
const mockRetry = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../hooks/use-homework-ocr', () => ({
  useHomeworkOcr: jest.fn().mockReturnValue({
    text: null,
    status: 'idle',
    error: null,
    failCount: 0,
    process: mockProcess,
    retry: mockRetry,
  }),
}));

// Import mocks after jest.mock
const { useCameraPermissions } = require('expo-camera');
const { useHomeworkOcr } = require('../../../hooks/use-homework-ocr');

const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue(mockRouter);
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    subjectId: 'sub-123',
    subjectName: 'Mathematics',
  });
  useCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
  (useHomeworkOcr as jest.Mock).mockReturnValue({
    text: null,
    status: 'idle',
    error: null,
    failCount: 0,
    process: mockProcess,
    retry: mockRetry,
  });
});

describe('CameraScreen', () => {
  it('shows permission request when camera not granted', () => {
    useCameraPermissions.mockReturnValue([{ granted: false }, jest.fn()]);

    const { getByText, getByTestId } = render(<CameraScreen />);
    expect(getByText(/camera access/i)).toBeTruthy();
    expect(getByTestId('grant-permission-button')).toBeTruthy();
  });

  it('shows camera viewfinder when permission granted', () => {
    const { getByTestId } = render(<CameraScreen />);
    expect(getByTestId('camera-view')).toBeTruthy();
    expect(getByTestId('capture-button')).toBeTruthy();
  });

  it('shows close button that calls router.back()', () => {
    const { getByTestId } = render(<CameraScreen />);
    fireEvent.press(getByTestId('close-button'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('shows type-instead fallback after 2 OCR failures', async () => {
    (useHomeworkOcr as jest.Mock).mockReturnValue({
      text: null,
      status: 'error',
      error: 'Failed to read',
      failCount: 2,
      process: mockProcess,
      retry: mockRetry,
    });

    const { getByTestId, getByText } = render(<CameraScreen />);

    await waitFor(() => {
      expect(getByText(/type it out/i)).toBeTruthy();
      expect(getByTestId('manual-input')).toBeTruthy();
    });
  });

  it('navigates to session with correct params on confirm', async () => {
    (useHomeworkOcr as jest.Mock).mockReturnValue({
      text: 'Solve for x: 2x + 5 = 13',
      status: 'done',
      error: null,
      failCount: 0,
      process: mockProcess,
      retry: mockRetry,
    });

    const { getByTestId } = render(<CameraScreen />);

    await waitFor(() => {
      expect(getByTestId('confirm-button')).toBeTruthy();
    });

    fireEvent.press(getByTestId('confirm-button'));

    expect(mockRouter.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(learner)/session',
        params: expect.objectContaining({
          mode: 'homework',
          subjectId: 'sub-123',
          subjectName: 'Mathematics',
          problemText: 'Solve for x: 2x + 5 = 13',
        }),
      })
    );
  });
});
