import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

const mockPush = jest.fn();
let mockSubjectsIndex: {
  subjects: SubjectIndexItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
};
let mockScopeContext: {
  activeScope:
    | { kind: 'me' }
    | { kind: 'supporter-hub' }
    | {
        kind: 'person';
        personId: string;
        edgeId: string;
        displayName: string;
      };
  availableScopes: Array<{
    kind: 'person';
    personId: string;
    edgeId: string;
    displayName: string;
  }>;
  setActiveScope: jest.Mock;
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

jest.mock(
  '../../lib/scope-context' /* gc1-allow: route branch test fixes the active V2 scope without exercising provider persistence */,
  () => ({
    useScopeContext: () => mockScopeContext,
  }),
);

jest.mock(
  '../../components/support' /* gc1-allow: route branch test asserts delegation without coupling to support surface layout */,
  () => {
    const { Text, View } = require('react-native');
    return {
      SupportHubSubjectsTab: ({
        personScopes,
      }: {
        personScopes: Array<{ personId: string; displayName: string }>;
      }) => (
        <View testID="support-hub-subjects-tab">
          {personScopes.map((scope) => (
            <Text key={scope.personId}>{scope.displayName}</Text>
          ))}
        </View>
      ),
      PersonScopeStructuralSubjects: ({
        scope,
      }: {
        scope: { displayName: string };
      }) => (
        <View testID="person-scope-structural-subjects">
          <Text>{scope.displayName}</Text>
        </View>
      ),
    };
  },
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
    mockScopeContext = {
      activeScope: { kind: 'me' },
      availableScopes: [
        {
          kind: 'person',
          personId: '550e8400-e29b-41d4-a716-446655440101',
          edgeId: '550e8400-e29b-41d4-a716-446655440201',
          displayName: 'Emma',
        },
      ],
      setActiveScope: jest.fn(),
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

  it('renders the Support hub Subjects variant without falling through to Me subjects', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };

    render(<SubjectsScreen />);

    screen.getByTestId('support-hub-subjects-tab');
    screen.getByText('Emma');
    expect(screen.queryByText('Spanish')).toBeNull();
  });

  it('renders a person-scope structural placeholder without supportee artifacts', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: {
        kind: 'person',
        personId: '550e8400-e29b-41d4-a716-446655440101',
        edgeId: '550e8400-e29b-41d4-a716-446655440201',
        displayName: 'Emma',
      },
    };

    render(<SubjectsScreen />);

    screen.getByTestId('person-scope-structural-subjects');
    screen.getByText('Emma');
    expect(screen.queryByText('Notes')).toBeNull();
  });
});
