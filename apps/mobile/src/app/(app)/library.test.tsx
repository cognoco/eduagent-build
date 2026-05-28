import { createElement, type ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  waitFor,
  type RenderAPI,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ProfileContext,
  type Profile,
  type ProfileContextValue,
} from '../../lib/profile';
import { AppContextProvider } from '../../lib/app-context';
import {
  createTestProfile,
  renderScreen,
  cleanupScreen,
  type RenderScreenResult,
} from '../../test-utils/screen-render';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  type RoutedMockFetch,
} from '../../test-utils/mock-api-routes';

import LibraryScreen from './library';

// ─── Boundary mocks (external/native runtime only) ──────────────────────
//
// Everything else (lib/profile via ProfileContext, the subjects / progress /
// all-books / library-retention / library-search / failed-filing hooks, the
// api-client, ShelfRow / LibrarySearchBar / LibrarySearchResults / ShimmerSkeleton)
// now runs for real against the routed mock fetch supplied by `renderScreen`
// (or the local proxy-aware wrapper). See CONVERT notes in the diff.
//
// NOTE — previously this file mocked eleven internal modules:
//   hooks/use-subjects, use-progress, use-all-books, use-library-search,
//   use-sessions, use-navigation-contract, lib/profile, lib/api-client,
//   components/common (ErrorFallback/animations), components/library/ShelfRow,
//   components/common/ShimmerSkeleton. Those stubs are gone — the real hooks
//   resolve against routed `/v1/...` responses and the real components render.

// Use the shared mock-i18n util so assertions reference the rendered English
// copy from en.json (what users actually see), not bare keys. A bare-key mock
// would only prove t() was called — not that the translation pipeline is
// wired correctly or that {{interpolation}} tokens resolve. See
// apps/mobile/src/test-utils/mock-i18n.ts for the lookup behaviour.
jest.mock(
  'react-i18next' /* gc1-allow: i18n boundary — returns en.json strings */,
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock(
  'expo-router' /* gc1-allow: expo-router requires a native navigation container not available in JSDOM */,
  () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
  }),
);

jest.mock(
  'react-native-safe-area-context' /* gc1-allow: native module that requires device/simulator to resolve insets */,
  () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }),
);

jest.mock(
  '../../lib/platform-alert' /* gc1-allow: wraps Alert.alert which is unavailable in JSDOM */,
  () => ({ platformAlert: jest.fn() }),
);

// SectionList native virtualization shim. The populated-subject path renders a
// SectionList; in JSDOM the real VirtualizedList does not lay out, so we forward
// the VirtualizedList prop surface (sections, initialNumToRender, windowSize)
// onto a plain View and render every item eagerly. This keeps the
// [BUG-NOTION-254] break test honest — it asserts those props exist, which the
// old ScrollView.map() path lacked — while letting items render for the other
// assertions. gc1-allow: react-native is a native boundary; SectionList layout
// cannot run under JSDOM.
jest.mock(
  'react-native' /* gc1-allow: SectionList native virtualization cannot lay out under JSDOM */,
  () => {
    const ReactActual = require('react');
    const RN = jest.requireActual('react-native');
    const SectionList = ({
      ListHeaderComponent,
      renderItem,
      renderSectionHeader,
      sections,
      testID,
      initialNumToRender,
      windowSize,
    }: {
      ListHeaderComponent?: React.ReactNode | React.ComponentType;
      renderItem: (info: {
        item: unknown;
        index: number;
        section: { status: string; data: unknown[] };
      }) => React.ReactNode;
      renderSectionHeader?: (info: {
        section: { status: string; data: unknown[] };
      }) => React.ReactNode;
      sections: Array<{ status: string; data: unknown[] }>;
      testID?: string;
      initialNumToRender?: number;
      windowSize?: number;
    }) =>
      ReactActual.createElement(
        RN.View,
        { testID, initialNumToRender, windowSize, sections },
        typeof ListHeaderComponent === 'function'
          ? ReactActual.createElement(ListHeaderComponent)
          : ListHeaderComponent,
        sections.flatMap((section) => [
          renderSectionHeader
            ? ReactActual.createElement(
                ReactActual.Fragment,
                { key: `${section.status}-header` },
                renderSectionHeader({ section }),
              )
            : null,
          ...section.data.map((item, index) =>
            ReactActual.createElement(
              ReactActual.Fragment,
              { key: `${section.status}-${index}` },
              renderItem({ item, index, section }),
            ),
          ),
        ]),
      );

    return new Proxy(RN, {
      get(target, property, receiver) {
        if (property === 'SectionList') return SectionList;
        return Reflect.get(target, property, receiver);
      },
    });
  },
);

// ─── Fixtures ───────────────────────────────────────────────────────────

const ACTIVE_PROFILE_ID = 'profile-1';

const OWNER: Profile = createTestProfile({
  id: ACTIVE_PROFILE_ID,
  accountId: 'account-1',
  displayName: 'Solo Learner',
  isOwner: true,
  birthYear: 1990,
});

type SubjectFixture = {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'archived';
};

type OverallProgress = {
  subjects: Array<{
    subjectId: string;
    name?: string;
    topicsTotal?: number;
    topicsCompleted?: number;
    topicsVerified?: number;
    urgencyScore?: number;
    retentionStatus?: string;
    lastSessionAt?: string | null;
  }>;
  totalTopicsCompleted?: number;
  totalTopicsVerified?: number;
};

type RetentionPayload = {
  subjects: Array<{
    subjectId: string;
    topics: unknown;
    reviewDueCount: number;
  }>;
};

interface RouteOptions {
  /** Value returned by GET /v1/subjects?includeInactive=true. */
  subjects?: SubjectFixture[] | unknown;
  /** Make the includeInactive subjects request hang (initial loading). */
  subjectsLoading?: boolean;
  /** Make the includeInactive subjects request fail (error path). */
  subjectsError?: boolean;
  /** Value returned by GET /v1/subjects (the active-only fallback). */
  fallbackSubjects?: SubjectFixture[];
  /** Make the active-only fallback request fail. */
  fallbackSubjectsError?: boolean;
  progress?: OverallProgress | undefined;
  progressError?: boolean;
  retention?: RetentionPayload;
  allBooksError?: boolean;
  search?: unknown;
  /** Sessions surfaced by useFailedFreeformLibraryFilingSessions. */
  failedFilingSessions?: Array<{
    sessionId: string;
    subjectId: string;
    topicId: string | null;
    startedAt: string;
  }>;
}

const NEVER = () => new Promise<never>(() => undefined);

function errorResponse(status = 503): Response {
  return new Response(JSON.stringify({ code: 'UPSTREAM', message: 'down' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Build the routes map the real library hooks hit. Endpoints discovered from
 * hook sources:
 *   useSubjects({includeInactive})      → GET /subjects?includeInactive=true → { subjects }
 *   useSubjects({enabled}) (fallback)   → GET /subjects (no query)           → { subjects }
 *   useOverallProgress                  → GET /progress/overview             → OverallProgressResponse
 *   useAllBooks                         → GET /library/books                 → { subjects: [] }
 *   useLibraryRetention                 → GET /library/retention             → { subjects }
 *   useLibrarySearch                    → GET /library/search?q=             → LibrarySearchResult
 *   useUpdateSubject                    → PATCH /subjects/:id                → { subject }
 *   useFailedFreeformLibraryFilingSessions
 *        → GET /progress/sessions?limit=50  → { sessions, nextCursor }
 *          then GET /sessions/:id            → { session } (LearningSession)
 */
function buildRoutes(opts: RouteOptions = {}): RoutedMockFetch {
  const subjectsBody = { subjects: opts.subjects ?? [] };
  const fallbackBody = { subjects: opts.fallbackSubjects ?? [] };
  const progressBody = opts.progress ?? {
    subjects: [],
    totalTopicsCompleted: 0,
    totalTopicsVerified: 0,
  };
  const retentionBody = opts.retention ?? { subjects: [] };

  // Failed-filing detail: each session id resolves to a freeform,
  // filing_failed LearningSession so the real hook surfaces it.
  const failed = opts.failedFilingSessions ?? [];
  const failedById = new Map(failed.map((s) => [s.sessionId, s]));

  const routes: Record<
    string,
    unknown | ((url: string, init?: RequestInit) => unknown | Promise<unknown>)
  > = {
    // PATCH /subjects/:id and GET /subjects share the `/subjects` prefix; the
    // detail route is matched first by inserting it earlier with a more
    // specific predicate handler.
    '/subjects': (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH') {
        // PATCH /subjects/:id — echo back an updated subject.
        const id = url.split('/subjects/')[1]?.split('?')[0] ?? 'sub-x';
        return { subject: { id, name: 'Subject', status: 'archived' } };
      }
      if (url.includes('includeInactive=true')) {
        if (opts.subjectsLoading) return NEVER();
        if (opts.subjectsError) return errorResponse();
        return subjectsBody;
      }
      // Active-only fallback (no query string).
      if (opts.fallbackSubjectsError) return errorResponse();
      return fallbackBody;
    },
    '/progress/sessions': {
      // Shape validated by childSessionsPageResponseSchema in the real hook.
      sessions: failed.map((s) => ({
        sessionId: s.sessionId,
        subjectId: s.subjectId,
        subjectName: 'Subject',
        topicId: s.topicId,
        topicTitle: null,
        sessionType: 'learning',
        startedAt: s.startedAt,
        endedAt: null,
        exchangeCount: 0,
        escalationRung: 1,
        durationSeconds: 0,
        wallClockSeconds: 0,
        displayTitle: 'Session',
        displaySummary: null,
        homeworkSummary: null,
        highlight: null,
        narrative: null,
        conversationPrompt: null,
        engagementSignal: null,
        drills: [],
      })),
      nextCursor: null,
    },
    '/progress/overview': opts.progressError
      ? () => errorResponse()
      : progressBody,
    '/sessions/': (url: string) => {
      const id = url.split('/sessions/')[1]?.split(/[?/]/)[0] ?? '';
      const meta = failedById.get(id);
      return {
        session: {
          id,
          subjectId: meta?.subjectId ?? '22222222-2222-7222-8222-222222222222',
          topicId: meta?.topicId ?? null,
          sessionType: 'learning',
          inputMode: 'text',
          verificationType: null,
          status: 'completed',
          escalationRung: 1,
          exchangeCount: 0,
          startedAt: meta?.startedAt ?? '2026-05-25T10:00:00.000Z',
          lastActivityAt: meta?.startedAt ?? '2026-05-25T10:00:00.000Z',
          endedAt: null,
          durationSeconds: 0,
          wallClockSeconds: 0,
          metadata: { effectiveMode: 'freeform' },
          rawInput: null,
          filedAt: null,
          filingStatus: 'filing_failed',
          filingRetryCount: 0,
        },
      };
    },
    '/library/retention': retentionBody,
    '/library/books': opts.allBooksError
      ? () => errorResponse()
      : { subjects: [] },
    '/library/search': opts.search ?? {
      subjects: [],
      books: [],
      topics: [],
      notes: [],
      sessions: [],
    },
  };

  return createRoutedMockFetch(routes);
}

// ─── Render helpers ─────────────────────────────────────────────────────

function mount(opts: RouteOptions = {}): RenderScreenResult {
  return renderScreen(<LibraryScreen />, {
    profile: OWNER,
    profiles: [OWNER],
    routedFetch: buildRoutes(opts),
  });
}

/**
 * Proxy-aware render. `renderScreen` hard-codes `isExplicitProxyMode: false`;
 * the proxy write-guard suite needs it true, so this composes the same
 * primitives (routed fetch + ProfileContext + AppContextProvider + QueryClient)
 * with the proxy flag exposed, plus a `rerender` that flips it.
 */
function renderProxyLibrary(opts: {
  routeOptions?: RouteOptions;
  isExplicitProxyMode: boolean;
}): { result: RenderAPI; rerender: (proxy: boolean) => void } {
  const routedFetch = buildRoutes(opts.routeOptions);
  (globalThis as unknown as { fetch: typeof fetch }).fetch =
    routedFetch as unknown as typeof fetch;
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  function buildProfileValue(proxy: boolean): ProfileContextValue {
    return {
      profiles: [OWNER],
      activeProfile: OWNER,
      isExplicitProxyMode: proxy,
      switchProfile: async () => ({ success: true }),
      isLoading: false,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
    };
  }

  function Wrapper({
    children,
    proxy,
  }: {
    children: ReactNode;
    proxy: boolean;
  }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ProfileContext.Provider,
        { value: buildProfileValue(proxy) },
        createElement(AppContextProvider, null, children),
      ),
    );
  }

  const result = render(
    <Wrapper proxy={opts.isExplicitProxyMode}>
      <LibraryScreen />
    </Wrapper>,
  );

  return {
    result,
    rerender: (proxy: boolean) =>
      result.rerender(
        <Wrapper proxy={proxy}>
          <LibraryScreen />
        </Wrapper>,
      ),
  };
}

describe('LibraryScreen', () => {
  let active: RenderScreenResult | null = null;
  let restoreFetch: (() => void) | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    if (restoreFetch) restoreFetch();
    restoreFetch = null;
    cleanupScreen();
    jest.clearAllMocks();
  });

  it('shows loading state', async () => {
    active = mount({ subjectsLoading: true });

    await waitFor(() => {
      active!.result.getByTestId('library-loading');
    });
  });

  it('does not enable the active-subject fallback query during initial loading', async () => {
    // The fallback query (useSubjects({ enabled })) is gated on
    // subjectsQuery.isError. While the includeInactive request is still
    // pending (loading), it must stay disabled — so the no-query /subjects
    // GET never fires. Behavioral equivalent of the old call-arg assertion.
    active = mount({ subjectsLoading: true });

    await waitFor(() => {
      active!.result.getByTestId('library-loading');
    });

    const subjectCalls = fetchCallsMatching(active.routedFetch, '/subjects');
    // Exactly the includeInactive request fired; the fallback (no query) did not.
    expect(
      subjectCalls.filter((c) => c.url.includes('includeInactive=true')).length,
    ).toBeGreaterThan(0);
    expect(
      subjectCalls.filter(
        (c) =>
          !c.url.includes('includeInactive=true') &&
          !c.url.match(/\/subjects\/[^?]/),
      ),
    ).toEqual([]);
  });

  it('[BUG-634 / M-2] does not crash when subjectsQuery.data is a non-array (stale shape / error payload)', async () => {
    // Repro: the cached/returned value can be a non-array (schema drift, error
    // payload). Without the Array.isArray guard the allTopics flatMap throws
    // TypeError and the screen white-screens.
    active = mount({ subjects: { unexpected: 'shape' } });

    await waitFor(() => {
      active!.result.getByTestId('library-empty');
    });
  });

  it('[BUG-634 / M-2] does not crash when subjectsQuery.data is null', async () => {
    active = mount({ subjects: null });

    await waitFor(() => {
      active!.result.getByTestId('library-empty');
    });
  });

  // [BUG-818] Repro: server returned a partial-success payload where
  // `topics` was undefined or a non-array value (schema drift, error
  // payload). Without an Array.isArray guard, `data.topics.map` threw and
  // white-screened the Library tab.
  it('[BUG-818] does not crash when retentionQuery.data.topics is undefined', async () => {
    active = mount({
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      retention: {
        subjects: [
          { subjectId: 'sub-1', topics: undefined, reviewDueCount: 0 },
        ],
      },
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
  });

  it('[BUG-818] does not crash when retentionQuery.data.topics is a non-array shape', async () => {
    active = mount({
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      retention: {
        subjects: [
          { subjectId: 'sub-1', topics: 'unexpected', reviewDueCount: 0 },
        ],
      },
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
  });

  it('shows empty state when there are no subjects', async () => {
    active = mount({ subjects: [] });

    // New library v3 design: empty state uses library-empty testID
    await waitFor(() => {
      active!.result.getByTestId('library-empty');
    });
    active.result.getByText('Your library will grow as you learn');
  });

  it('routes empty-state learners to subject creation', async () => {
    active = mount({ subjects: [] });

    await waitFor(() => {
      active!.result.getByTestId('library-empty-go-home');
    });
    fireEvent.press(active.result.getByTestId('library-empty-go-home'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/create-subject',
      params: { returnTo: 'library' },
    });
  });

  it('renders shelf rows for each subject', async () => {
    active = mount({
      subjects: [{ id: 'sub-1', name: 'History', status: 'active' }],
      progress: {
        subjects: [
          {
            subjectId: 'sub-1',
            name: 'History',
            topicsTotal: 12,
            topicsCompleted: 3,
            topicsVerified: 1,
            urgencyScore: 0,
            retentionStatus: 'fading',
            lastSessionAt: null,
          },
        ],
        totalTopicsCompleted: 3,
        totalTopicsVerified: 1,
      },
    });

    // Library v3: subject is a shelf row, not a card
    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
    active.result.getByText('History');
  });

  it('orders active subjects first, then paused, then archived', async () => {
    active = mount({
      subjects: [
        { id: 'sub-archived', name: 'Archived Spanish', status: 'archived' },
        { id: 'sub-paused', name: 'Paused History', status: 'paused' },
        { id: 'sub-active', name: 'Active Math', status: 'active' },
      ],
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-active');
    });

    const orderedRowIds = active.result
      .UNSAFE_getAllByProps({ accessibilityRole: 'button' })
      .filter((row) => String(row.props.testID).startsWith('shelf-row-header-'))
      .map((row) => String(row.props.testID))
      .filter((testID, index, allRows) => allRows.indexOf(testID) === index);
    expect(orderedRowIds).toEqual([
      'shelf-row-header-sub-active',
      'shelf-row-header-sub-paused',
      'shelf-row-header-sub-archived',
    ]);
  });

  it('has no top-level tabs — library opens subject detail as the next level', async () => {
    // Library v3 redesign replaced Shelves/Books/Topics tabs with a subject
    // shelf list. There are no tab controls at the library level.
    active = mount({
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
    const { result } = active;
    expect(result.queryByTestId('library-tab-shelves')).toBeNull();
    expect(result.queryByTestId('library-tab-books')).toBeNull();
    expect(result.queryByTestId('library-tab-topics')).toBeNull();
    // Instead, the subject list is the root navigation.
    result.getByTestId('shelves-list');
    result.getByTestId('shelf-row-header-sub-1');
    expect(result.queryByTestId('shelf-grid-row-active-0')).toBeNull();
    expect(result.queryByTestId('shelf-grid-plank-active-0')).toBeNull();
  });

  it('opens the subject shelf when a subject row is pressed', async () => {
    // Library is subject-first: books and suggestions live on the subject
    // shelf screen instead of expanding inline inside the Library list.
    active = mount({
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
    fireEvent.press(active.result.getByTestId('shelf-row-header-sub-1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'sub-1' },
    });
  });

  describe('failed Library filing attention', () => {
    const POPULATED: SubjectFixture[] = [
      { id: 'sub-1', name: 'Math', status: 'active' },
    ];

    it('renders a small attention row and count when failed freeform Library additions exist', async () => {
      active = mount({
        subjects: POPULATED,
        failedFilingSessions: [
          {
            sessionId: '11111111-1111-7111-8111-111111111111',
            subjectId: '22222222-2222-7222-8222-222222222222',
            topicId: null,
            startedAt: '2026-05-25T10:00:00.000Z',
          },
          {
            sessionId: '33333333-3333-7333-8333-333333333333',
            subjectId: '22222222-2222-7222-8222-222222222222',
            topicId: null,
            startedAt: '2026-05-25T10:05:00.000Z',
          },
        ],
      });

      await waitFor(() => {
        active!.result.getByTestId('library-filing-attention-row');
      });
      active.result.getByText('Topic placement needs attention');
      expect(
        active.result.getByTestId('library-filing-attention-count').props
          .children,
      ).toBe(2);
    });

    it('does not render the attention row when no failed freeform Library additions exist', async () => {
      active = mount({ subjects: POPULATED });

      await waitFor(() => {
        active!.result.getByTestId('shelf-row-header-sub-1');
      });
      expect(
        active.result.queryByTestId('library-filing-attention-row'),
      ).toBeNull();
    });

    it('routes the attention row to the first failed session summary so retry is available', async () => {
      active = mount({
        subjects: POPULATED,
        failedFilingSessions: [
          {
            sessionId: '11111111-1111-7111-8111-111111111111',
            subjectId: '22222222-2222-7222-8222-222222222222',
            topicId: null,
            startedAt: '2026-05-25T10:00:00.000Z',
          },
        ],
      });

      await waitFor(() => {
        active!.result.getByTestId('library-filing-attention-row');
      });
      fireEvent.press(
        active.result.getByTestId('library-filing-attention-row'),
      );

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/session-summary/[sessionId]',
        params: {
          sessionId: '11111111-1111-7111-8111-111111111111',
          subjectId: '22222222-2222-7222-8222-222222222222',
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // BUG-82: allBooksQuery failure is non-fatal — library still renders [BUG-82]
  // -----------------------------------------------------------------------
  it('does not show full-page error when only allBooksQuery fails', async () => {
    active = mount({
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      allBooksError: true,
    });

    // Library renders normally — subjects still visible as shelf rows
    await waitFor(() => {
      active!.result.getByTestId('shelves-list');
    });
    expect(active.result.queryByTestId('library-error')).toBeNull();
  });

  it('does not show full-page error when progress fails after subjects load', async () => {
    active = mount({
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      progressError: true,
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
    expect(active.result.queryByTestId('library-error')).toBeNull();
  });

  it('renders cached active subjects when the include-inactive subject refresh fails', async () => {
    // includeInactive request errors; the active-only fallback resolves and
    // its data is shown instead of a full-page error.
    active = mount({
      subjectsError: true,
      fallbackSubjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    });

    await waitFor(() => {
      active!.result.getByTestId('shelf-row-header-sub-1');
    });
    expect(active.result.queryByTestId('library-error')).toBeNull();
    active.result.getByText('1 subjects');
  });

  describe('Manage Subjects modal — backdrop close [BUG-510]', () => {
    const ONE_SUBJECT: SubjectFixture[] = [
      { id: 'sub-1', name: 'Math', status: 'active' },
    ];

    it('closes when the backdrop (outside the sheet) is tapped [BUG-510]', async () => {
      // Repro: on web the Close button sits behind the bottom tab bar so
      // pointer events never reach it; the modal had no other dismiss path
      // because the backdrop was a plain View with no onPress.
      active = mount({ subjects: ONE_SUBJECT });
      await waitFor(() => {
        active!.result.getByTestId('manage-subjects-button');
      });

      fireEvent.press(active.result.getByTestId('manage-subjects-button'));
      active.result.getByTestId('manage-subjects-backdrop');

      act(() => {
        fireEvent.press(active!.result.getByTestId('manage-subjects-backdrop'));
      });

      // The backdrop press calls setShowManageSubjects(false), which sets
      // visible={false} on the RN Modal. On iOS the Modal keeps children
      // mounted during the close animation so the backdrop element stays in
      // the tree, but the Modal host component reports visible=false.
      // animationType="slide" uniquely identifies the manage-subjects modal.
      expect(
        active.result.UNSAFE_queryByProps({
          visible: false,
          animationType: 'slide',
        }),
      ).not.toBeNull();
    });

    it('exposes an accessible label so assistive tech can dismiss the modal [BUG-510]', async () => {
      active = mount({ subjects: ONE_SUBJECT });
      await waitFor(() => {
        active!.result.getByTestId('manage-subjects-button');
      });

      fireEvent.press(active.result.getByTestId('manage-subjects-button'));

      const backdrop = active.result.getByTestId('manage-subjects-backdrop');
      expect(backdrop.props.accessibilityRole).toBe('button');
      expect(backdrop.props.accessibilityLabel).toBe('Close manage subjects');
    });

    it('sends archived status when the Archive action is pressed', async () => {
      active = mount({ subjects: ONE_SUBJECT });
      await waitFor(() => {
        active!.result.getByTestId('manage-subjects-button');
      });

      fireEvent.press(active.result.getByTestId('manage-subjects-button'));
      await act(async () => {
        fireEvent.press(active!.result.getByTestId('archive-subject-sub-1'));
      });

      // The real useUpdateSubject mutation fires PATCH /subjects/:id with the
      // archived status in the JSON body.
      await waitFor(() => {
        const calls = fetchCallsMatching(
          active!.routedFetch,
          '/subjects/sub-1',
        );
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0]!.init?.method).toBe('PATCH');
        expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
          status: 'archived',
        });
      });
    });

    it('disables other subject actions while one status update is saving', async () => {
      // Hold the PATCH open so the in-flight pending state is observable.
      let finishUpdate!: () => void;
      const routedFetch = buildRoutes({
        subjects: [
          { id: 'sub-1', name: 'Math', status: 'active' },
          { id: 'sub-2', name: 'History', status: 'active' },
        ],
      });
      routedFetch.setRoute('/subjects', (url: string, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'PATCH') {
          return new Promise<unknown>((resolve) => {
            finishUpdate = () =>
              resolve({
                subject: { id: 'sub-1', name: 'Math', status: 'archived' },
              });
          });
        }
        if (url.includes('includeInactive=true')) {
          return {
            subjects: [
              { id: 'sub-1', name: 'Math', status: 'active' },
              { id: 'sub-2', name: 'History', status: 'active' },
            ],
          };
        }
        return { subjects: [] };
      });
      active = renderScreen(<LibraryScreen />, {
        profile: OWNER,
        profiles: [OWNER],
        routedFetch,
      });

      await waitFor(() => {
        active!.result.getByTestId('manage-subjects-button');
      });
      fireEvent.press(active.result.getByTestId('manage-subjects-button'));
      fireEvent.press(active.result.getByTestId('archive-subject-sub-1'));

      await waitFor(() => {
        expect(
          active!.result.getByTestId('archive-subject-sub-2'),
        ).toBeDisabled();
      });
      await act(async () => {
        finishUpdate();
      });
    });
  });

  // -----------------------------------------------------------------------
  // BUG-971: Header topic count must include null-bookId topics
  // -----------------------------------------------------------------------
  // Repro: topicCountsByBookId skips topics where bookId is null (orphan
  // topics, parking-lot entries). totalTopicsAcrossBooks used to derive
  // from topicCountsByBookId, so the header subtitle silently undercounted
  // those topics — visibly drifting from per-shelf topic totals.
  describe('Header topic count [BUG-971]', () => {
    it('counts topics with null bookId in the header subtitle', async () => {
      active = mount({
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
        retention: {
          subjects: [
            {
              subjectId: 'sub-1',
              topics: [
                {
                  topicId: 't-1',
                  bookId: 'book-1',
                  easeFactor: 2.5,
                  repetitions: 0,
                  lastReviewedAt: null,
                  xpStatus: 'pending',
                  failureCount: 0,
                },
                {
                  topicId: 't-2',
                  bookId: null,
                  easeFactor: 2.5,
                  repetitions: 0,
                  lastReviewedAt: null,
                  xpStatus: 'pending',
                  failureCount: 0,
                },
                {
                  topicId: 't-3',
                  bookId: null,
                  easeFactor: 2.5,
                  repetitions: 0,
                  lastReviewedAt: null,
                  xpStatus: 'pending',
                  failureCount: 0,
                },
              ],
              reviewDueCount: 0,
            },
          ],
        },
      });

      // 3 topics total (1 with bookId, 2 with null bookId) must all be counted.
      // Pre-fix this would render "1 subjects · 1 topics" (orphans dropped).
      // Match on the topic-count segment only — the subject-count segment's
      // grammar ("1 subject" vs "1 subjects") may shift if proper i18next
      // pluralization lands later, and that change is unrelated to BUG-971.
      await waitFor(() => {
        active!.result.getByText(/· 3 topics\b/);
      });
    });

    it('omits the topic count segment entirely when there are no topics', async () => {
      active = mount({
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
        retention: { subjects: [] },
      });

      // Header should read just "1 subjects" with no trailing " · N topics".
      await waitFor(() => {
        active!.result.getByText('1 subjects');
      });
    });
  });

  describe('search result navigation', () => {
    const SEARCH_DATA = {
      subjects: [{ id: 'sub-1', name: 'Biology' }],
      books: [
        {
          id: 'book-1',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          title: 'Cell Biology',
        },
      ],
      topics: [
        {
          id: 'top-1',
          bookId: 'book-1',
          bookTitle: 'Cell Biology',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          name: 'Mitosis',
        },
      ],
      notes: [
        {
          id: 'note-1',
          sessionId: 'sess-1',
          topicId: 'top-1',
          topicName: 'Mitosis',
          bookId: 'book-1',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          contentSnippet: 'powerhouse of the cell',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sessions: [
        {
          sessionId: 'sess-1',
          topicId: 'top-1',
          topicTitle: 'Mitosis',
          bookId: 'book-1',
          subjectId: 'sub-1',
          subjectName: 'Biology',
          snippet: 'explored cells today',
          occurredAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    async function renderSearching(): Promise<void> {
      active = mount({
        subjects: [{ id: 'sub-1', name: 'Biology', status: 'active' }],
        progress: {
          subjects: [
            {
              subjectId: 'sub-1',
              topicsTotal: 5,
              topicsCompleted: 2,
              topicsVerified: 2,
            },
          ],
        },
        search: SEARCH_DATA,
      });
      await waitFor(() => {
        active!.result.getByTestId('shelf-row-header-sub-1');
      });
      fireEvent.changeText(
        active.result.getByTestId('library-search-input'),
        'test',
      );
      // Debounce (300ms) + async /library/search resolution.
      await act(async () => {
        jest.advanceTimersByTime(350);
      });
      await waitFor(() => {
        active!.result.getByTestId('search-subject-row-sub-1');
      });
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('subject row tap calls router.push to shelf', async () => {
      await renderSearching();
      fireEvent.press(active!.result.getByTestId('search-subject-row-sub-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        }),
      );
    });

    it('book row tap pushes shelf then book', async () => {
      await renderSearching();
      fireEvent.press(active!.result.getByTestId('book-row-book-1'));
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]',
          params: { subjectId: 'sub-1' },
        }),
      );
      expect(mockPush).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
          params: { subjectId: 'sub-1', bookId: 'book-1' },
        }),
      );
    });

    // [BUG-404] topic and note pushes must include subjectId + bookId so the
    // topic screen can skip the extra useResolveTopicSubject round-trip and the
    // back-button fallback resolves to the correct book screen.
    it('topic row tap pushes to topic screen with subjectId and bookId context', async () => {
      await renderSearching();
      fireEvent.press(active!.result.getByTestId('topic-row-top-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: 'top-1', subjectId: 'sub-1', bookId: 'book-1' },
        }),
      );
    });

    it('note row tap pushes to parent topic with subjectId and bookId context', async () => {
      await renderSearching();
      fireEvent.press(active!.result.getByTestId('note-row-note-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/topic/[topicId]',
          params: { topicId: 'top-1', subjectId: 'sub-1', bookId: 'book-1' },
        }),
      );
    });

    it('session row tap pushes to root session-summary route', async () => {
      await renderSearching();
      fireEvent.press(active!.result.getByTestId('session-row-sess-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/session-summary/[sessionId]',
          params: expect.objectContaining({
            sessionId: 'sess-1',
            subjectId: 'sub-1',
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // PR-4 / surface-ownership: Library retention boundary
  //
  // Library derives retention from /library/retention (useLibraryRetention),
  // NOT from useOverallProgress. These tests verify that:
  //   1. The screen still renders shelf rows while libraryRetentionQuery is
  //      loading (subjects + curriculum already loaded).
  //   2. Shelf rows render correctly when /library/retention returns mixed
  //      statuses (the library-owned path, not the overall-progress path).
  // -------------------------------------------------------------------------
  describe('Library retention boundary [PR-4]', () => {
    it('renders shelf rows while libraryRetentionQuery is loading', async () => {
      // /library/retention never resolves — subjects are loaded, so the shelf
      // rows must still render (no overall-progress loading gate required).
      const routedFetch = buildRoutes({
        subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
      });
      routedFetch.setRoute('/library/retention', () => NEVER());
      active = renderScreen(<LibraryScreen />, {
        profile: OWNER,
        profiles: [OWNER],
        routedFetch,
      });

      await waitFor(() => {
        active!.result.getByTestId('shelf-row-header-sub-1');
      });
    });

    it('renders shelf rows when /library/retention returns subjects with mixed statuses', async () => {
      // Seed the library retention payload with three subjects: strong,
      // fading, forgotten. This tests the library-owned path that
      // useLibraryRetention reads from.
      const FUTURE = new Date(
        Date.now() + 5 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const NEAR = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();

      active = mount({
        subjects: [
          { id: 'sub-strong', name: 'Strong Subject', status: 'active' },
          { id: 'sub-fading', name: 'Fading Subject', status: 'active' },
          { id: 'sub-forgotten', name: 'Forgotten Subject', status: 'active' },
        ],
        retention: {
          subjects: [
            {
              subjectId: 'sub-strong',
              topics: [
                {
                  topicId: 't-s1',
                  easeFactor: 2.5,
                  repetitions: 3,
                  nextReviewAt: FUTURE,
                  lastReviewedAt: '2026-01-01T00:00:00.000Z',
                  xpStatus: 'verified',
                  failureCount: 0,
                },
              ],
              reviewDueCount: 0,
            },
            {
              subjectId: 'sub-fading',
              topics: [
                {
                  topicId: 't-f1',
                  easeFactor: 2.5,
                  repetitions: 2,
                  nextReviewAt: NEAR,
                  lastReviewedAt: '2026-01-01T00:00:00.000Z',
                  xpStatus: 'pending',
                  failureCount: 0,
                },
              ],
              reviewDueCount: 1,
            },
            {
              subjectId: 'sub-forgotten',
              topics: [
                {
                  topicId: 't-g1',
                  easeFactor: 2.5,
                  repetitions: 1,
                  nextReviewAt: null,
                  lastReviewedAt: null,
                  xpStatus: 'decayed',
                  failureCount: 0,
                },
              ],
              reviewDueCount: 1,
            },
          ],
        },
      });

      // All three shelves render — data sourced exclusively from the library
      // retention payload (not from useOverallProgress).
      await waitFor(() => {
        active!.result.getByTestId('shelf-row-header-sub-strong');
      });
      active.result.getByTestId('shelf-row-header-sub-fading');
      active.result.getByTestId('shelf-row-header-sub-forgotten');

      // All three subject names are visible
      active.result.getByText('Strong Subject');
      active.result.getByText('Fading Subject');
      active.result.getByText('Forgotten Subject');
    });
  });

  // [BUG-NOTION-254] Break test: the populated subject list MUST be rendered
  // by a virtualized list (SectionList) rather than ScrollView.map(), so that
  // off-screen ShelfRow instances are recycled. Asserting the underlying
  // VirtualizedList prop set fingerprints the SectionList path; the
  // ScrollView.map() implementation lacks these props entirely.
  describe('virtualization [BUG-NOTION-254]', () => {
    it('renders the subject list via a virtualized SectionList', async () => {
      // 50 subjects — well above any plausible viewport window.
      const subjects = Array.from({ length: 50 }, (_, i) => ({
        id: `sub-${i}`,
        name: `Subject ${i}`,
        status: 'active' as const,
      }));
      active = mount({ subjects });

      await waitFor(() => {
        active!.result.getByTestId('shelves-list');
      });

      // The SectionList host carries `shelves-list` and exposes the
      // VirtualizedList prop surface (initialNumToRender, windowSize, sections).
      // ScrollView.map() — the old code path — has no `sections` prop and no
      // `initialNumToRender` prop. Asserting on these props is the precise
      // fingerprint of the virtualized path.
      const list = active.result.getByTestId('shelves-list');
      expect(list.props.initialNumToRender).toBeDefined();
      expect(list.props.windowSize).toBeDefined();
      expect(Array.isArray(list.props.sections)).toBe(true);
      // All 50 subjects live in the first (and only) section's data array.
      expect(list.props.sections[0]?.data).toHaveLength(50);
    });
  });

  // -------------------------------------------------------------------------
  // WI-273: Proxy mode — write controls disabled, hint shown
  // -------------------------------------------------------------------------
  describe('proxy mode write guard [WI-273]', () => {
    const PROXY_ROUTES: RouteOptions = {
      subjects: [{ id: 'sub-1', name: 'Math', status: 'active' }],
    };

    it('shows the proxy read-only hint when in proxy mode [WI-273]', async () => {
      const { result } = renderProxyLibrary({
        routeOptions: PROXY_ROUTES,
        isExplicitProxyMode: true,
      });
      restoreFetch = () => undefined;
      await waitFor(() => {
        result.getByTestId('library-proxy-hint');
      });
    });

    it('hides the Manage subjects button in proxy mode [WI-273]', async () => {
      const { result } = renderProxyLibrary({
        routeOptions: PROXY_ROUTES,
        isExplicitProxyMode: true,
      });
      restoreFetch = () => undefined;
      await waitFor(() => {
        result.getByTestId('library-proxy-hint');
      });
      expect(result.queryByTestId('manage-subjects-button')).toBeNull();
    });

    it('does not dispatch updateSubject in proxy mode — manage-subjects button absent so modal interaction impossible [WI-273]', async () => {
      // The manage-subjects button is hidden in proxy mode (canWrite=false).
      // Without it, the modal cannot be opened and the status-change handler
      // cannot be invoked from the UI. This confirms the write path is blocked.
      const { result } = renderProxyLibrary({
        routeOptions: PROXY_ROUTES,
        isExplicitProxyMode: true,
      });
      restoreFetch = () => undefined;

      await waitFor(() => {
        result.getByTestId('library-proxy-hint');
      });
      expect(result.queryByTestId('manage-subjects-button')).toBeNull();
    });

    it('positive control — updateSubject IS reachable when not in proxy mode [WI-273]', async () => {
      // Non-proxy so the manage button appears and the mutation is callable.
      // This proves the negative proxy test is non-vacuous: the mutation CAN
      // be triggered when the guard is absent.
      const routedFetch = buildRoutes(PROXY_ROUTES);
      active = renderScreen(<LibraryScreen />, {
        profile: OWNER,
        profiles: [OWNER],
        routedFetch,
      });

      // Manage button must be present in non-proxy mode.
      await waitFor(() => {
        active!.result.getByTestId('manage-subjects-button');
      });

      // Open the modal and press the archive action for the subject.
      fireEvent.press(active.result.getByTestId('manage-subjects-button'));
      await act(async () => {
        fireEvent.press(active!.result.getByTestId('archive-subject-sub-1'));
      });

      await waitFor(() => {
        const calls = fetchCallsMatching(
          active!.routedFetch,
          '/subjects/sub-1',
        );
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0]!.init?.method).toBe('PATCH');
        expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
          status: 'archived',
        });
      });
    });

    it('disables the in-modal status controls if proxy mode activates while the modal is open [WI-273]', async () => {
      // Covers the one transient where the status-change controls render in
      // proxy mode: the modal is opened in non-proxy (the Manage button is
      // visible), then a profile switch flips the session to proxy while the
      // modal stays open. The controls must become disabled so the write is
      // unreachable. Non-vacuous: drop `!canWrite` from the control's
      // `disabled` prop and the toBeDisabled assertions fail.
      const { result, rerender } = renderProxyLibrary({
        routeOptions: PROXY_ROUTES,
        isExplicitProxyMode: false,
      });
      restoreFetch = () => undefined;

      await waitFor(() => {
        result.getByTestId('manage-subjects-button');
      });
      fireEvent.press(result.getByTestId('manage-subjects-button'));
      // Controls are enabled while the modal is open in non-proxy mode.
      expect(result.getByTestId('archive-subject-sub-1')).not.toBeDisabled();

      // Proxy mode activates while the modal is still open (state persists).
      rerender(true);

      expect(result.getByTestId('archive-subject-sub-1')).toBeDisabled();
      expect(result.getByTestId('pause-subject-sub-1')).toBeDisabled();
    });
  });
});
