import {
  fireEvent,
  screen,
  type RenderAPI,
  waitFor,
} from '@testing-library/react-native';

import { renderScreen } from '../../../test-utils/screen-render';
import ManualHomeworkScreen from './manual';

const ORIGINAL_E2E_FLAG = process.env.EXPO_PUBLIC_E2E;
const mockReplace = jest.fn();
const mockRedirect = jest.fn();
let mockSearchParams: Record<string, string | string[] | undefined> = {};

jest.mock(
  'react-i18next',
  () => require('../../../test-utils/mock-i18n').i18nMock,
);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    const { View } = require('react-native');
    mockRedirect(href);
    return <View testID="manual-route-redirect" />;
  },
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-camera', () => {
  throw new Error('The manual homework route imported expo-camera');
});

jest.mock('expo-image-picker', () => {
  throw new Error('The manual homework route imported expo-image-picker');
});

const SUBJECT_ID = '00000000-0000-7000-a000-000000000301';
const SUBJECT_NAME = 'Mathematics';
const PROBLEM = 'Solve 3x + 7 = 22';

describe('ManualHomeworkScreen', () => {
  const cleanups: Array<() => void> = [];

  function renderManual(): RenderAPI {
    const rendered = renderScreen(<ManualHomeworkScreen />);
    cleanups.push(rendered.cleanup);
    return rendered.result;
  }

  beforeEach(() => {
    process.env.EXPO_PUBLIC_E2E = 'true';
    mockSearchParams = {
      entrySource: 'mentor',
      returnTo: 'mentor',
      subjectId: SUBJECT_ID,
      subjectName: SUBJECT_NAME,
    };
  });

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    jest.clearAllMocks();
    if (ORIGINAL_E2E_FLAG === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = ORIGINAL_E2E_FLAG;
    }
  });

  it('fails closed to the camera route when the direct route is opened outside E2E', () => {
    process.env.EXPO_PUBLIC_E2E = 'false';

    renderManual();

    expect(screen.getByTestId('manual-route-redirect')).toBeTruthy();
    expect(mockRedirect).toHaveBeenCalledWith({
      pathname: '/(app)/homework/camera',
      params: mockSearchParams,
    });
  });

  it('opens the exact empty manual-entry case and cancels back to Mentor', () => {
    renderManual();

    expect(screen.getByTestId('homework-entry-mode-manual')).toBeTruthy();
    expect(screen.getByTestId('homework-manual-entry-empty')).toBeTruthy();
    expect(screen.getByTestId('result-text-input').props.value).toBe('');

    fireEvent.press(screen.getByTestId('manual-entry-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
  });

  it('starts one associated manual homework session without image or OCR data', () => {
    renderManual();

    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.press(screen.getByTestId('confirm-button'));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const destination = mockReplace.mock.calls[0]?.[0] as {
      pathname: string;
      params: Record<string, string | undefined>;
    };
    expect(destination.pathname).toBe('/(app)/session');
    expect(destination.params).toEqual(
      expect.objectContaining({
        mode: 'homework',
        subjectId: SUBJECT_ID,
        subjectName: SUBJECT_NAME,
        problemText: PROBLEM,
        entrySource: 'mentor',
        returnTo: 'mentor',
      }),
    );
    expect(JSON.parse(destination.params.homeworkProblems ?? '[]')).toEqual([
      expect.objectContaining({
        text: PROBLEM,
        originalText: null,
        source: 'manual',
        selectedMode: null,
      }),
    ]);
    expect(destination.params.captureSource).toBeUndefined();
    expect(destination.params.imageUri).toBeUndefined();
    expect(destination.params.imageMimeType).toBeUndefined();
    expect(destination.params.ocrText).toBeUndefined();
  });

  it('adopts the first active subject when Mentor routes before its subject index loads', async () => {
    mockSearchParams = { entrySource: 'mentor', returnTo: 'mentor' };
    const rendered = renderScreen(<ManualHomeworkScreen />, {
      routes: {
        subjects: {
          subjects: [
            {
              id: SUBJECT_ID,
              profileId: '00000000-0000-7000-a000-000000000201',
              name: SUBJECT_NAME,
              status: 'active',
              pedagogyMode: 'socratic',
              createdAt: '2026-07-20T00:00:00.000Z',
              updatedAt: '2026-07-20T00:00:00.000Z',
            },
          ],
        },
      },
    });
    cleanups.push(rendered.cleanup);

    await waitFor(() => {
      expect(
        screen.getByTestId('homework-subject-resolution-ready'),
      ).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId('result-text-input'), PROBLEM);
    fireEvent.press(screen.getByTestId('confirm-button'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: expect.objectContaining({
        subjectId: SUBJECT_ID,
        subjectName: SUBJECT_NAME,
        problemText: PROBLEM,
      }),
    });
  });
});
