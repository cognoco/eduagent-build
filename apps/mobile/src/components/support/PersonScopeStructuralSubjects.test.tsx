import fs from 'node:fs';
import path from 'node:path';

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
const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440301';
const BOOK_ID = '550e8400-e29b-41d4-a716-446655440401';
const REVIEW_TOPIC_ID = '550e8400-e29b-41d4-a716-446655440501';
const MASTERED_TOPIC_ID = '550e8400-e29b-41d4-a716-446655440502';

const STRUCTURAL_DATA: SupporteeStructuralSubjectsResponse = {
  personId: PERSON_ID,
  edgeId: EDGE_ID,
  subjects: [
    {
      id: SUBJECT_ID,
      name: 'Physics',
      status: 'active',
      books: [
        {
          id: BOOK_ID,
          title: 'Motion',
          description: 'How things move',
          emoji: null,
          sortOrder: 1,
          topics: [
            {
              id: REVIEW_TOPIC_ID,
              title: 'Velocity',
              description: 'Speed with direction',
              chapter: 'Vectors',
              sortOrder: 1,
              estimatedMinutes: 15,
              skipped: false,
              progressState: 'review-due',
              nextReviewAt: '2026-06-29T12:00:00.000Z',
              masteredAt: null,
            },
            {
              id: MASTERED_TOPIC_ID,
              title: 'Acceleration',
              description: 'Changing velocity',
              chapter: 'Vectors',
              sortOrder: 2,
              estimatedMinutes: 20,
              skipped: false,
              progressState: 'mastered',
              nextReviewAt: null,
              masteredAt: '2026-06-28T12:00:00.000Z',
            },
          ],
        },
      ],
    },
  ],
};

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

  it('opens a masked read-only Subject Hub drill-in without private artifacts or proxy actions', async () => {
    mockFetch.setRoute(`/scopes/${PERSON_ID}/subjects`, STRUCTURAL_DATA);

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
        wrapper: wrapper(STRUCTURAL_DATA),
      },
    );

    await waitFor(() => {
      screen.getByTestId(`person-scope-subject-${SUBJECT_ID}`);
    });

    fireEvent.press(screen.getByTestId(`person-scope-subject-${SUBJECT_ID}`));

    screen.getByTestId('person-scope-subject-hub');
    screen.getByText('Physics');
    screen.getByText('1 mastered, 0 learning, 2 topics');
    screen.getByText('1 reviews due');
    screen.getByText('Motion / Vectors');
    expect(screen.getAllByText('Velocity')).toHaveLength(2);
    screen.getByText('Acceleration');
    screen.getByText('Mastered');
    screen.getByText('Study actions are private to the learner in this view.');
    screen.getByText('Subject, chapter and topic structure only.');
    expect(screen.queryByTestId('subject-hub-next-up-action')).toBeNull();
    expect(screen.queryByTestId('subject-hub-notes-input')).toBeNull();
    expect(screen.queryByText('Private note')).toBeNull();
    expect(screen.queryByText('Mentor memory')).toBeNull();
    expect(screen.queryByText('Switching into Emma')).toBeNull();

    fireEvent.press(screen.getByTestId('person-scope-subject-hub-back'));
    screen.getByTestId(`person-scope-subject-${SUBJECT_ID}`);
  });

  it('routes the masked drill-in through the shared SubjectHubSurface primitive', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'PersonScopeStructuralSubjects.tsx'),
      'utf8',
    );

    expect(source).toMatch(/SubjectHubSurface/);
    expect(source).not.toMatch(/<SubjectHub\b/);
  });
});
