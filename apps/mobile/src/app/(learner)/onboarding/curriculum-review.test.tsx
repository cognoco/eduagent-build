import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSkipMutate = jest.fn();
const mockUnskipMutate = jest.fn();
const mockChallengeMutateAsync = jest.fn();
const mockAddTopicMutateAsync = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const MockSafeAreaView = View;
  MockSafeAreaView.displayName = 'SafeAreaView';
  const MockSafeAreaProvider = ({ children }: { children: React.ReactNode }) =>
    children;
  MockSafeAreaProvider.displayName = 'SafeAreaProvider';
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: MockSafeAreaView,
    SafeAreaProvider: MockSafeAreaProvider,
    SafeAreaInsetsContext: { Consumer: View },
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactReq = require('react');
  return {
    __esModule: true,
    default: ({
      visible,
      children,
    }: React.PropsWithChildren<{ visible: boolean }>) =>
      visible
        ? ReactReq.createElement(ReactReq.Fragment, null, children)
        : null,
  };
});

jest.mock('../../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    textInverse: '#ffffff',
    primary: '#2563eb',
  }),
}));

jest.mock('../../../hooks/use-curriculum', () => ({
  useCurriculum: () => ({
    data: {
      id: 'curriculum-1',
      subjectId: 'subject-1',
      version: 1,
      topics: [
        {
          id: 'topic-1',
          title: 'Algebra Basics',
          description: 'Intro to expressions',
          sortOrder: 0,
          relevance: 'core',
          estimatedMinutes: 20,
          skipped: false,
        },
      ],
    },
    isLoading: false,
  }),
  useSkipTopic: () => ({ mutate: mockSkipMutate, isPending: false }),
  useUnskipTopic: () => ({ mutate: mockUnskipMutate, isPending: false }),
  useChallengeCurriculum: () => ({
    mutateAsync: mockChallengeMutateAsync,
    isPending: false,
  }),
  useAddCurriculumTopic: () => ({
    mutateAsync: mockAddTopicMutateAsync,
    isPending: false,
  }),
}));

const CurriculumReviewScreen = require('./curriculum-review').default;

describe('CurriculumReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews and confirms a user-added topic', async () => {
    mockAddTopicMutateAsync
      .mockResolvedValueOnce({
        mode: 'preview',
        preview: {
          title: 'Trigonometry Basics',
          description: 'Angles, sine, cosine, and triangles.',
          estimatedMinutes: 35,
        },
      })
      .mockResolvedValueOnce({
        mode: 'create',
        topic: {
          id: 'topic-2',
          title: 'Trigonometry Basics',
        },
      });

    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('add-topic-button'));
    fireEvent.changeText(screen.getByTestId('add-topic-title-input'), 'trig');
    fireEvent.press(screen.getByTestId('add-topic-preview'));

    await waitFor(() => {
      expect(mockAddTopicMutateAsync).toHaveBeenNthCalledWith(1, {
        mode: 'preview',
        title: 'trig',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('add-topic-description-input')).toBeTruthy();
      expect(screen.getByTestId('add-topic-minutes-input')).toBeTruthy();
    });

    expect(screen.getByTestId('add-topic-title-input').props.value).toBe(
      'Trigonometry Basics'
    );
    expect(screen.getByTestId('add-topic-description-input').props.value).toBe(
      'Angles, sine, cosine, and triangles.'
    );
    expect(screen.getByTestId('add-topic-minutes-input').props.value).toBe(
      '35'
    );

    fireEvent.changeText(
      screen.getByTestId('add-topic-description-input'),
      'Angles, unit circles, and triangle relationships.'
    );
    fireEvent.changeText(screen.getByTestId('add-topic-minutes-input'), '40');
    fireEvent.press(screen.getByTestId('add-topic-confirm'));

    await waitFor(() => {
      expect(mockAddTopicMutateAsync).toHaveBeenNthCalledWith(2, {
        mode: 'create',
        title: 'Trigonometry Basics',
        description: 'Angles, unit circles, and triangle relationships.',
        estimatedMinutes: 40,
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('add-topic-title-input')).toBeNull();
    });
  });

  it('shows error when preview fails', async () => {
    mockAddTopicMutateAsync.mockRejectedValueOnce(
      new Error('API error 500: Internal server error')
    );

    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('add-topic-button'));
    fireEvent.changeText(screen.getByTestId('add-topic-title-input'), 'trig');
    fireEvent.press(screen.getByTestId('add-topic-preview'));

    await waitFor(() => {
      expect(screen.getByText(/went wrong on our end/i)).toBeTruthy();
    });
  });

  it('navigates back when back button is pressed', () => {
    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('curriculum-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('cancels add-topic modal without creating', async () => {
    render(<CurriculumReviewScreen />);

    fireEvent.press(screen.getByTestId('add-topic-button'));
    expect(screen.getByTestId('add-topic-title-input')).toBeTruthy();

    fireEvent.press(screen.getByTestId('add-topic-cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('add-topic-title-input')).toBeNull();
    });
    expect(mockAddTopicMutateAsync).not.toHaveBeenCalled();
  });
});
