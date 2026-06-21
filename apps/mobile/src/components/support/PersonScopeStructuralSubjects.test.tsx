import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';
import type { SupporteeStructuralSubjectsResponse } from '@eduagent/schemas';

import {
  createScreenWrapper,
  createTestProfile,
} from '../../test-utils/screen-render';
import type { RoutedMockFetch } from '../../test-utils/mock-api-routes';
import { PersonScopeStructuralSubjects } from './PersonScopeStructuralSubjects';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

let mockFetch: RoutedMockFetch;

jest.mock(
  '../../lib/api-client' /* gc1-allow: Clerk useAuth() external boundary; component test exercises real query + schema parsing over a routed Hono client */,
  () => {
    const {
      createRoutedMockFetch,
      mockApiClientFactory,
    } = require('../../test-utils/mock-api-routes');
    mockFetch = createRoutedMockFetch();
    return mockApiClientFactory(mockFetch);
  },
);

const PERSON_ID = '550e8400-e29b-41d4-a716-446655440101';
const EDGE_ID = '550e8400-e29b-41d4-a716-446655440201';

function wrapper(data?: SupporteeStructuralSubjectsResponse) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  if (data) {
    queryClient.setQueryData(
      ['supportee-structural-subjects', PERSON_ID, EDGE_ID],
      data,
    );
  }
  return createScreenWrapper({
    activeProfile: createTestProfile(),
    profiles: [createTestProfile()],
    queryClient,
  }).wrapper;
}

describe('PersonScopeStructuralSubjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.setRoute(`/scopes/${PERSON_ID}/subjects`, {
      personId: PERSON_ID,
      edgeId: EDGE_ID,
      subjects: [],
    });
  });

  it('shows an empty state when the linked learner has no structural subjects', async () => {
    render(
      <PersonScopeStructuralSubjects
        scope={{
          kind: 'person',
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          displayName: 'Emma',
        }}
      />,
      {
        wrapper: wrapper({
          personId: PERSON_ID,
          edgeId: EDGE_ID,
          subjects: [],
        }),
      },
    );

    await waitFor(() => {
      screen.getByTestId('person-scope-subjects-empty-state');
    });

    screen.getByText('Emma');
    screen.getByText('Subject, chapter and topic structure only.');
    screen.getByText('No subjects yet');
    screen.getByText(
      'This learner does not have any visible subject structure yet.',
    );
    expect(
      screen.queryByTestId(`person-scope-subject-${PERSON_ID}`),
    ).toBeNull();

    fireEvent.press(screen.getByTestId('person-scope-subjects-empty-refresh'));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
