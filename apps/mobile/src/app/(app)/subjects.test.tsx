import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProfileContext, type Profile } from '../../lib/profile';
import { createTestProfile } from '../../test-utils/app-hook-test-utils';
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

// WI-1393: useEligibleManagedPersons is intentionally NOT mocked — the two
// WI-1393 tests below drive it with real linked-child profiles seeded through
// ProfileContext.Provider (its own computation is covered in
// use-eligible-supportees.test.ts), mirroring mentor.test.tsx.

jest.mock('../../hooks/use-library-search', () => ({
  ...jest.requireActual('../../hooks/use-library-search'),
  useLibrarySearch: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock(
  '../../components/support' /* gc1-allow: route branch test asserts delegation without coupling to support surface layout */,
  () => {
    const { Pressable, Text, View } = require('react-native');
    return {
      SupportHubSubjectsTab: ({
        personScopes,
        eligiblePersons,
        onSelectEligiblePerson,
        onAddChildFallback,
      }: {
        personScopes: Array<{ personId: string; displayName: string }>;
        eligiblePersons?: Array<{ id: string; displayName: string }>;
        onSelectEligiblePerson?: (person: {
          id: string;
          displayName: string;
        }) => void;
        onAddChildFallback?: () => void;
      }) => (
        <View testID="support-hub-subjects-tab">
          {personScopes.map((scope) => (
            <Text key={scope.personId}>{scope.displayName}</Text>
          ))}
          {(eligiblePersons ?? []).map((person) => (
            <Pressable
              key={person.id}
              testID={`support-hub-subjects-eligible-${person.id}`}
              onPress={() => onSelectEligiblePerson?.(person)}
            >
              <Text>{person.displayName}</Text>
            </Pressable>
          ))}
          <Pressable
            testID="support-hub-subjects-add-child-fallback"
            onPress={() => onAddChildFallback?.()}
          >
            <Text>Add a child</Text>
          </Pressable>
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

const OWNER: Profile = createTestProfile({
  id: 'owner-1',
  accountId: 'account-1',
  displayName: 'Parent',
  isOwner: true,
});

const LIAM: Profile = createTestProfile({
  id: 'child-new',
  accountId: 'account-1',
  displayName: 'Liam',
  isOwner: false,
});

function renderWithProfiles(
  profiles: Profile[],
  activeProfile: Profile,
): ReturnType<typeof render> {
  return render(
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        isExplicitProxyMode: false,
        switchProfile: jest.fn(),
        isLoading: false,
        profileLoadError: null,
        profileWasRemoved: false,
        acknowledgeProfileRemoval: jest.fn(),
      }}
    >
      <SubjectsScreen />
    </ProfileContext.Provider>,
  );
}

const SUBJECTS: SubjectIndexItem[] = [
  {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    subjectName: 'Spanish',
    status: 'active',
    urgencyBoostUntil: null,
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

  // WI-1393 A3: the Subjects empty-state anchor reaches /(app)/link/initiate with
  // a supporteePersonId when an eligible managed person exists.
  it('[WI-1393] pushes /(app)/link/initiate with supporteePersonId when the Subjects picker selects an eligible person', () => {
    // Real useEligibleManagedPersons: Liam is a linked child with no scope in
    // availableScopes (only Emma is), so he is the sole eligible person.
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };

    renderWithProfiles([OWNER, LIAM], OWNER);

    fireEvent.press(
      screen.getByTestId('support-hub-subjects-eligible-child-new'),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/link/initiate',
      params: {
        supporteePersonId: 'child-new',
        supporteeName: 'Liam',
        relation: 'parent',
      },
    });
  });

  // WI-1393 AC2: zero eligible managed persons must degrade to add-a-child,
  // never a param-less push to /(app)/link/initiate.
  it('[WI-1393] degrades to add-a-child when there are zero eligible managed persons', () => {
    // Real useEligibleManagedPersons: owner has no linked children → no
    // eligible managed persons.
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };

    renderWithProfiles([OWNER], OWNER);

    fireEvent.press(
      screen.getByTestId('support-hub-subjects-add-child-fallback'),
    );

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-profile',
      params: { for: 'child' },
    });
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/link/initiate' }),
    );
  });
});
