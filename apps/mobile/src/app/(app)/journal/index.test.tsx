import { render, screen } from '@testing-library/react-native';
import { unstable_settings } from './_layout';

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
};

jest.mock(
  '../../../components/journal/JournalTabView' /* gc1-allow: route smoke test verifies the page mounts the real landing component boundary */,
  () => ({
    JournalTabView: () => {
      const { Text, View } = require('react-native');
      return (
        <View testID="journal-tab-view">
          <Text>Journal landing</Text>
        </View>
      );
    },
  }),
);

jest.mock(
  '../../../lib/scope-context' /* gc1-allow: route branch test fixes the active V2 scope without exercising provider persistence */,
  () => ({
    useScopeContext: () => mockScopeContext,
  }),
);

jest.mock(
  '../../../components/support' /* gc1-allow: route branch test asserts delegation without coupling to support surface layout */,
  () => {
    const { Text, View } = require('react-native');
    return {
      SupportHubJournalTab: () => <View testID="support-hub-journal-tab" />,
      PersonScopeJournalPlaceholder: ({
        scope,
      }: {
        scope: { displayName: string };
      }) => (
        <View testID="person-scope-journal-placeholder">
          <Text>{scope.displayName}</Text>
        </View>
      ),
    };
  },
);

const JournalScreen = require('./index').default;

describe('JournalScreen', () => {
  beforeEach(() => {
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
    };
  });

  it('mounts the Journal tab landing instead of the old stub', () => {
    render(<JournalScreen />);

    screen.getByTestId('journal-tab-view');
    expect(
      screen.queryByText('Your saved learning record will live here.'),
    ).toBeNull();
  });

  it('seeds the journal stack with the index route for cross-stack deep pushes', () => {
    // The nested Journal layout will gain deeper dynamic children (e.g. a
    // report/recap detail leaf); per the cross-stack-push guardrail the layout
    // must export unstable_settings.initialRouteName === 'index' as the back-stack
    // safety net (AGENTS.md → Repo-Specific Guardrails).
    expect(unstable_settings.initialRouteName).toBe('index');
  });

  it('renders the Support hub Journal variant without supportee artifacts', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: { kind: 'supporter-hub' },
    };

    render(<JournalScreen />);

    screen.getByTestId('support-hub-journal-tab');
    expect(screen.queryByTestId('journal-tab-view')).toBeNull();
  });

  it('renders the S5 placeholder for a person-scope Journal', () => {
    mockScopeContext = {
      ...mockScopeContext,
      activeScope: {
        kind: 'person',
        personId: '550e8400-e29b-41d4-a716-446655440101',
        edgeId: '550e8400-e29b-41d4-a716-446655440201',
        displayName: 'Emma',
      },
    };

    render(<JournalScreen />);

    screen.getByTestId('person-scope-journal-placeholder');
    screen.getByText('Emma');
    expect(screen.queryByTestId('journal-tab-view')).toBeNull();
  });
});
