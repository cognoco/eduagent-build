import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

const mockPush = jest.fn();
let mockSubjectsIndex: {
  subjects: SubjectIndexItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../hooks/use-subjects-index' /* gc1-allow: route screen test pins hook state; hook behavior is covered in use-subjects-index.test.tsx */,
  () => ({
    useSubjectsIndex: () => mockSubjectsIndex,
  }),
);

const SubjectsScreen = require('./subjects').default;

const SUBJECTS: SubjectIndexItem[] = [
  {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    subjectName: 'Spanish',
    mastered: 4,
    learning: 2,
    total: 9,
    dueReviews: 3,
    books: [],
  },
];

describe('SubjectsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjectsIndex = {
      subjects: SUBJECTS,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    };
  });

  it('mounts the real browse list and routes rows to the V2 subject hub', () => {
    render(<SubjectsScreen />);

    screen.getByTestId('subjects-screen');
    screen.getByText('Show me everything');
    screen.getByText('Spanish');

    fireEvent.press(
      screen.getByTestId(`subjects-browse-row-${SUBJECTS[0]!.subjectId}`),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/subject-hub/[subjectId]',
      params: { subjectId: SUBJECTS[0]!.subjectId },
    });
  });

  it('renders retryable error state instead of a stub card', () => {
    mockSubjectsIndex = {
      subjects: [],
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    };

    render(<SubjectsScreen />);

    fireEvent.press(screen.getByTestId('subjects-browse-retry'));
    expect(mockSubjectsIndex.refetch).toHaveBeenCalledTimes(1);
  });
});
