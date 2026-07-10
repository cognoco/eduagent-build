import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';

import { SubjectsBrowse } from './SubjectsBrowse';
import type { SubjectIndexItem } from '../../hooks/use-subjects-index';
import {
  createHookWrapper,
  createQueryWrapper,
  createTestProfile,
} from '../../test-utils/app-hook-test-utils';
import { setActiveProfileId } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Per-file i18n mock (external-library mock — not a GC1 violation)
// Keys mapped to predictable test strings; unmapped keys return the raw key.
// ---------------------------------------------------------------------------

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'subjectsBrowse.title': 'Subjects',
        'subjectsBrowse.subtitle': 'Everything in one place',
        'subjectsBrowse.showEverything': 'Show me everything',
        'subjectsBrowse.searchPlaceholder': 'Search subjects',
        'subjectsBrowse.emptyTitle': 'No subjects yet',
        'subjectsBrowse.emptyMessage': 'Create a subject to get started.',
        'subjectsBrowse.createSubject': 'Create subject',
        'subjectsBrowse.subjectProgress': `${opts?.mastered} mastered · ${opts?.learning} learning · ${opts?.total} topics`,
        'subjectsBrowse.reviewsDue': `${opts?.count} due`,
        'subjectsBrowse.bookCount': `${opts?.count} books`,
        'subjectsBrowse.openSubject': 'Open subject',
        'subjectsBrowse.openSubjectNamed': `Open ${opts?.subject}`,
        'subjectsBrowse.sectionActive': 'Active',
        'subjectsBrowse.sectionPaused': 'Paused',
        'subjectsBrowse.sectionArchived': 'Archived',
        'subjectsBrowse.searching': 'Searching...',
        'common.loading': 'Loading',
      };
      return map[key] ?? key;
    },
  }),
  // SubjectsBrowse now imports useLibrarySearch → api-client → i18n/index.ts,
  // which has a module-level IIFE that calls i18next.use(initReactI18next).
  // Without this export the call receives undefined and throws an unhandled
  // rejection that Jest blames on the first test. i18next is already
  // initialised by test-setup.ts, so this is a harmless no-op registration.
  initReactI18next: {
    type: '3rdParty',
    init: (): void => {
      return;
    },
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function item(over: Partial<SubjectIndexItem>): SubjectIndexItem {
  return {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    subjectName: 'Spanish',
    status: 'active',
    urgencyBoostUntil: null,
    mastered: 2,
    learning: 3,
    total: 6,
    dueReviews: 1,
    books: [],
    ...over,
  };
}

const SPANISH = item({
  subjectId: '550e8400-e29b-41d4-a716-446655440000',
  subjectName: 'Spanish',
});
const ALGEBRA = item({
  subjectId: '660e8400-e29b-41d4-a716-446655440001',
  subjectName: 'Algebra',
  mastered: 1,
  learning: 1,
  total: 5,
  dueReviews: 0,
});
const ITEMS: SubjectIndexItem[] = [SPANISH, ALGEBRA];

// ---------------------------------------------------------------------------
// Existing subject-list tests
// All render calls include a QueryClient wrapper — SubjectsBrowse now calls
// useLibrarySearch which uses useQuery internally (disabled when no profile).
// ---------------------------------------------------------------------------

describe('SubjectsBrowse', () => {
  // Shared QueryClient wrapper for tests that don't need profile context.
  // The search hook is disabled (no activeProfile in context default) so no
  // fetch fires — we only need a QueryClient in the tree.
  const { wrapper } = createQueryWrapper();

  it('renders the full subject list before search and opens a subject row', () => {
    const onOpenSubject = jest.fn();
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={onOpenSubject}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    screen.getByText('Show me everything');
    screen.getByText('Spanish');
    screen.getByText('Algebra');
    screen.getByText('2 mastered · 3 learning · 6 topics');
    screen.getByText('1 due');

    fireEvent.press(
      screen.getByTestId(`subjects-browse-row-${SPANISH.subjectId}`),
    );

    expect(onOpenSubject).toHaveBeenCalledWith(SPANISH.subjectId);
  });

  // [WI-1172] Ownership-split gap: the positive path (chip renders when
  // dueReviews > 0) was already covered above; this pins the negative path
  // (subject.dueReviews > 0 ? ... : null in SubjectsBrowse.tsx) so a subject
  // with no due reviews never shows a stale/zero reviews-due chip.
  it('omits the reviews-due chip when a subject has no due reviews', () => {
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    const algebraRow = screen.getByTestId(
      `subjects-browse-row-${ALGEBRA.subjectId}`,
    );
    within(algebraRow).getByText('1 mastered · 1 learning · 5 topics');
    expect(within(algebraRow).queryByText(/due/)).toBeNull();
  });

  it('filters by search and clearing search restores the full list', () => {
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(screen.getByTestId('subjects-browse-search'), 'alg');

    screen.getByText('Algebra');
    expect(screen.queryByText('Spanish')).toBeNull();

    fireEvent.changeText(screen.getByTestId('subjects-browse-search'), '');

    screen.getByText('Spanish');
    screen.getByText('Algebra');
  });

  it('shows an add-subject affordance on the populated path and calls onCreateSubject', () => {
    const onCreateSubject = jest.fn();
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={onCreateSubject}
      />,
      { wrapper },
    );

    // Populated list still renders the rows...
    screen.getByText('Spanish');
    // ...AND the add-subject button is present (regression: WI-1119).
    fireEvent.press(screen.getByTestId('subjects-browse-create'));

    expect(onCreateSubject).toHaveBeenCalledTimes(1);
  });

  it('shows a create-subject affordance for an empty list', () => {
    const onCreateSubject = jest.fn();
    render(
      <SubjectsBrowse
        subjects={[]}
        onOpenSubject={jest.fn()}
        onCreateSubject={onCreateSubject}
      />,
      { wrapper },
    );

    screen.getByText('No subjects yet');
    screen.getByTestId('subjects-browse-empty-book-animation', {
      includeHiddenElements: true,
    });
    fireEvent.press(screen.getByTestId('subjects-browse-create'));

    expect(onCreateSubject).toHaveBeenCalledTimes(1);
  });

  it('groups subjects into Active / Paused / Archived sections and omits empty groups', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'a-1',
            subjectName: 'Active One',
            status: 'active',
          }),
          item({
            subjectId: 'p-1',
            subjectName: 'Paused One',
            status: 'paused',
          }),
          item({
            subjectId: 'r-1',
            subjectName: 'Archived One',
            status: 'archived',
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    screen.getByTestId('subjects-browse-section-active');
    screen.getByTestId('subjects-browse-section-paused');
    screen.getByTestId('subjects-browse-section-archived');
    screen.getByText('Active One');
    screen.getByText('Paused One');
    screen.getByText('Archived One');
  });

  it('omits a status section when it has no subjects', () => {
    render(
      <SubjectsBrowse
        subjects={[item({ subjectId: 'a-1', status: 'active' })]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    screen.getByTestId('subjects-browse-section-active');
    expect(screen.queryByTestId('subjects-browse-section-paused')).toBeNull();
    expect(screen.queryByTestId('subjects-browse-section-archived')).toBeNull();
  });

  it('sorts non-expired urgency-boost subjects above non-urgent peers within a group', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'calm',
            subjectName: 'Calm',
            urgencyBoostUntil: null,
          }),
          item({
            subjectId: 'urgent',
            subjectName: 'Urgent',
            urgencyBoostUntil: '2999-01-01T00:00:00.000Z',
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    const rows = screen
      .getAllByTestId(/^subjects-browse-row-/)
      .map((node) => node.props.testID);
    expect(rows.indexOf('subjects-browse-row-urgent')).toBeLessThan(
      rows.indexOf('subjects-browse-row-calm'),
    );
  });

  it('does not reorder for an expired urgency boost', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'first',
            subjectName: 'First',
            urgencyBoostUntil: null,
          }),
          item({
            subjectId: 'expired',
            subjectName: 'Expired',
            urgencyBoostUntil: '2000-01-01T00:00:00.000Z',
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    const rows = screen
      .getAllByTestId(/^subjects-browse-row-/)
      .map((node) => node.props.testID);
    // Expired boost is treated as non-urgent → incoming order preserved.
    expect(rows.indexOf('subjects-browse-row-first')).toBeLessThan(
      rows.indexOf('subjects-browse-row-expired'),
    );
  });

  it('shows the book count for a subject row', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'with-books',
            books: [
              { id: 'b1' },
              { id: 'b2' },
              { id: 'b3' },
            ] as unknown as SubjectIndexItem['books'],
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    screen.getByText('3 books');
  });

  it('renders a shimmer skeleton (not the list) while loading', () => {
    render(
      <SubjectsBrowse
        subjects={[]}
        isLoading
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    screen.getByTestId('subjects-browse-skeleton');
    // The search box and the empty/create state are not shown during loading.
    expect(screen.queryByTestId('subjects-browse-search')).toBeNull();
    expect(screen.queryByTestId('subjects-browse-create')).toBeNull();
  });

  it('gives each subject row a distinct, subject-specific accessibility label', () => {
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    // Each row must announce the subject name so screen readers can distinguish them.
    screen.getByLabelText('Open Spanish');
    screen.getByLabelText('Open Algebra');
  });
});

// ---------------------------------------------------------------------------
// Search behavior tests (WI-1133 — cross-entity search: notes + sessions)
// These tests exercise the useLibrarySearch integration and need a profile
// context (so the query is enabled) plus a mocked globalThis.fetch.
// ---------------------------------------------------------------------------

describe('SubjectsBrowse — search behavior', () => {
  const mockFetch = jest.fn();
  const originalFetch = globalThis.fetch;

  const TEST_PROFILE_ID = 'search-test-profile';

  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    globalThis.fetch = mockFetch as typeof fetch;
    setActiveProfileId(TEST_PROFILE_ID);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveProfileId(undefined);
  });

  /** Build a minimal LibrarySearchResult with only notes populated. */
  function noteSearchResult() {
    return {
      subjects: [],
      books: [],
      topics: [],
      notes: [
        {
          id: '80000000-0000-4000-8000-000000000001',
          sessionId: '80000000-0000-4000-8000-000000000002',
          topicId: '80000000-0000-4000-8000-000000000004',
          topicName: 'Pyramids',
          bookId: '80000000-0000-4000-8000-000000000005',
          subjectId: SPANISH.subjectId,
          subjectName: 'Spanish',
          contentSnippet: 'nota sobre pirámides',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sessions: [],
    };
  }

  /** Build a minimal LibrarySearchResult with only sessions populated. */
  function sessionSearchResult() {
    return {
      subjects: [],
      books: [],
      topics: [],
      notes: [],
      sessions: [
        {
          sessionId: '80000000-0000-4000-8000-000000000003',
          topicId: '80000000-0000-4000-8000-000000000004',
          topicTitle: 'Grammar',
          bookId: '80000000-0000-4000-8000-000000000005',
          subjectId: SPANISH.subjectId,
          subjectName: 'Spanish',
          snippet: 'explored verbs today',
          occurredAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    };
  }

  it('shows full subject list when query is empty — no API call fires', async () => {
    // No fetch mock needed: query is empty so useLibrarySearch is disabled.
    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    // Subject list visible (not search results)
    screen.getByText('Show me everything');
    expect(screen.queryByTestId('library-search-results')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows a loading indicator while the search request is in-flight', async () => {
    // Never resolves — keeps loading state active for the duration of the test.
    mockFetch.mockReturnValue(
      new Promise((_resolve) => {
        void _resolve;
      }),
    );

    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(
      screen.getByTestId('subjects-browse-search'),
      'pyramid',
    );

    // After debounce fires (≤300ms) the loading indicator appears.
    await waitFor(
      () => {
        expect(
          screen.getByTestId('subjects-browse-search-loading'),
        ).toBeTruthy();
      },
      { timeout: 1500 },
    );

    // Subject list is hidden while searching.
    expect(screen.queryByText('Show me everything')).toBeNull();
  });

  it('renders note and session results from the API via LibrarySearchResults', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(noteSearchResult()), { status: 200 }),
    );

    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(
      screen.getByTestId('subjects-browse-search'),
      'pyramid',
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('library-search-results')).toBeTruthy();
      },
      { timeout: 1500 },
    );

    // A note row from the search result should be visible.
    expect(
      screen.getByTestId('note-row-80000000-0000-4000-8000-000000000001'),
    ).toBeTruthy();
    // Fetched — at least one call was made.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('renders session results from the API', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(sessionSearchResult()), { status: 200 }),
    );

    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(screen.getByTestId('subjects-browse-search'), 'verbs');

    await waitFor(
      () => {
        expect(screen.getByTestId('library-search-results')).toBeTruthy();
      },
      { timeout: 1500 },
    );

    expect(
      screen.getByTestId('session-row-80000000-0000-4000-8000-000000000003'),
    ).toBeTruthy();
  });

  it('shows an empty-results state when the API returns no matches', async () => {
    const emptyResult = {
      subjects: [],
      books: [],
      topics: [],
      notes: [],
      sessions: [],
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(emptyResult), { status: 200 }),
    );

    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(screen.getByTestId('subjects-browse-search'), 'xyzzy');

    await waitFor(
      () => {
        expect(screen.getByTestId('search-results-empty')).toBeTruthy();
      },
      { timeout: 1500 },
    );
  });

  it('shows an error state when the API call fails', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(
      screen.getByTestId('subjects-browse-search'),
      'error-query',
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('search-results-error')).toBeTruthy();
      },
      { timeout: 1500 },
    );
  });

  it('clears query and restores subject list when clear is pressed', async () => {
    const emptyResult = {
      subjects: [],
      books: [],
      topics: [],
      notes: [],
      sessions: [],
    };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(emptyResult), { status: 200 }),
    );

    const { wrapper } = createHookWrapper({
      activeProfile: createTestProfile({ id: TEST_PROFILE_ID }),
    });

    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.changeText(
      screen.getByTestId('subjects-browse-search'),
      'clear-me',
    );

    // Wait for empty results (clear button renders here)
    await waitFor(
      () => {
        expect(screen.getByTestId('library-search-clear-results')).toBeTruthy();
      },
      { timeout: 1500 },
    );

    fireEvent.press(screen.getByTestId('library-search-clear-results'));

    // After clear, subject list is restored.
    await waitFor(() => {
      expect(screen.getByText('Show me everything')).toBeTruthy();
    });
  });
});
