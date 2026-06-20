import { useAuth } from '@clerk/clerk-expo';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoutedMockFetch,
  fetchCallsMatching,
  extractJsonBody,
} from '../test-utils/mock-api-routes';

// Routes most-specific first: /subjects/resolve before /subjects.
// Handler for /subjects distinguishes GET (list) from POST (create) by method.
let subjectsListData: Array<{ id: string; name: string }> = [];
let subjectsListIsError = false;
let createSubjectResponse: unknown = null;
let createSubjectShouldError = false;
let createSubjectErrorMessage = '';
// [WI-855] Typed error fields for the create POST. When set, the mock returns
// `status` with a flat `{ code, message }` body so the screen can branch on the
// stable code (errorHasCode) rather than regexing the message. Default status
// 400 with no code preserves the prior generic-error behavior.
let createSubjectErrorCode: string | undefined;
let createSubjectErrorStatus = 400;

// Placeholder — replaced before each test by beforeEach (see describe block).
// createRoutedMockFetch requires an initial entry so the map has the right key order.
const mockFetch = createRoutedMockFetch({
  '/subjects/resolve': {
    status: 'direct_match',
    resolvedName: '',
    suggestions: [],
    displayMessage: '',
  },
  '/sessions/first-curriculum': {
    session: {
      id: 'session-first',
      subjectId: 'subject-1',
      topicId: 'topic-first',
    },
  },
  '/subjects': { subjects: [] },
});

jest.mock('react-i18next', () => require('../test-utils/mock-i18n').i18nMock);

jest.mock(
  '../lib/api-client' /* gc1-allow: transport-boundary — routed mock fetch replaces network layer */,
  () =>
    require('../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock(
  '../lib/profile',
  /* gc1-allow: context-boundary — useProfile reads ProfileContext which has no Provider
   * in this test tree; ProfileProvider requires useProfiles (network) + SecureStore
   * state machine that cannot be driven without a full integration wrapper. The rest
   * of the module (isGuardianProfile, PROFILE_SCOPED_KEYS, etc.) runs real via
   * requireActual. */
  () => ({
    ...jest.requireActual('../lib/profile'),
    useProfile: () => ({
      activeProfile: {
        id: 'test-profile-id',
        accountId: 'test-account-id',
        displayName: 'Test Learner',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      },
      profiles: [],
      switchProfile: async () => ({ success: true }),
      isLoading: false,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
    }),
  }),
);

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};

let mockCanGoBackValue = true;
const mockCanGoBack = jest.fn(() => mockCanGoBackValue);
let activeQueryClient: QueryClient | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: mockPush,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
  // [BUG-375] Redirect stub so auth-gate tests can assert the redirect path.
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>redirect:{href}</Text>;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock(
  '../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      muted: '#94a3b8',
      primary: '#2563eb',
    }),
  }),
);

jest.mock(
  '../lib/format-api-error' /* gc1-allow: native-boundary — format-api-error calls i18next which requires expo-localization/async-storage init unavailable in jest */,
  () => ({
    formatApiError: (error: unknown) =>
      error instanceof Error ? error.message : 'Something went wrong',
    extractApiErrorCode: (error: unknown) => {
      if (!error || typeof error !== 'object') return undefined;
      const e = error as {
        apiCode?: string;
        errorCode?: string;
        code?: string;
      };
      return e.apiCode ?? e.errorCode ?? e.code;
    },
  }),
);

// useKeyboardScroll uses only React hooks (useRef, useCallback, useEffect) —
// runs real in jest; no mock needed.

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  activeQueryClient = queryClient;
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

async function enterSubjectName(name: string): Promise<void> {
  fireEvent.changeText(screen.getByTestId('create-subject-name'), name);
  await waitFor(() => {
    expect(screen.getByTestId('create-subject-name').props.value).toBe(name);
  });
}

async function enterClarification(text: string): Promise<void> {
  fireEvent.changeText(screen.getByTestId('subject-clarify-input'), text);
  await waitFor(() => {
    expect(screen.getByTestId('subject-clarify-input').props.value).toBe(text);
  });
}

// Helper: configure a single resolve response for one call.
function setResolveResponse(response: unknown) {
  mockFetch.setRoute('/subjects/resolve', response);
}

// Helper: configure sequential resolve responses (for tests that call resolve multiple times).
function setSequentialResolveResponses(responses: unknown[]) {
  let callIndex = 0;
  mockFetch.setRoute('/subjects/resolve', () => {
    const res = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return res;
  });
}

const CreateSubjectScreen = require('./create-subject').default;

// Default handler for /subjects (GET list or POST create).
// Defined as a named function so beforeEach can restore it after per-test overrides.
function defaultSubjectsHandler(url: string, init?: RequestInit): unknown {
  if (init?.method === 'POST') {
    if (createSubjectShouldError) {
      return new Response(
        JSON.stringify({
          message: createSubjectErrorMessage,
          ...(createSubjectErrorCode ? { code: createSubjectErrorCode } : {}),
        }),
        {
          status: createSubjectErrorStatus,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return (
      createSubjectResponse ?? {
        subject: { id: 'subject-default', name: 'Subject' },
      }
    );
  }
  // GET — return list
  if (subjectsListIsError) {
    return new Response('{}', { status: 500 });
  }
  return { subjects: subjectsListData };
}

// Default handler for /subjects/resolve.
const defaultResolveHandler = {
  status: 'direct_match',
  resolvedName: '',
  suggestions: [],
  displayMessage: '',
};

const defaultFirstCurriculumHandler = {
  session: {
    id: 'session-first',
    subjectId: 'subject-1',
    topicId: 'topic-first',
  },
};

describe('CreateSubjectScreen', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    subjectsListData = [];
    subjectsListIsError = false;
    createSubjectResponse = null;
    createSubjectShouldError = false;
    createSubjectErrorMessage = '';
    createSubjectErrorCode = undefined;
    createSubjectErrorStatus = 400;
    mockCanGoBackValue = true;
    // Restore routes to defaults so per-test setRoute overrides don't leak.
    mockFetch.setRoute('/subjects/resolve', defaultResolveHandler);
    mockFetch.setRoute(
      '/sessions/first-curriculum',
      defaultFirstCurriculumHandler,
    );
    mockFetch.setRoute('/subjects', defaultSubjectsHandler);
    Wrapper = createWrapper();
    // [BUG-375] Default to signed-in so existing tests are unaffected by the
    // new auth guard; auth-gate break tests override below.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  afterEach(() => {
    cleanup();
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('renders starter chips and fills the input on tap', () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('subject-options');

    // Concrete starter rows are present and tappable.
    const fractionsChip = screen.getByTestId('subject-start-fractions');
    expect(fractionsChip).toBeTruthy();

    // Tapping fills the name input
    fireEvent.press(fractionsChip);
    expect(screen.getByTestId('create-subject-name').props.value).toBe(
      'Fractions',
    );
  });

  it('tapping a chip immediately triggers resolveInput', async () => {
    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Fractions',
      suggestions: [],
      displayMessage: 'Fractions it is.',
    });
    createSubjectResponse = {
      subject: { id: 'subject-fractions', name: 'Fractions' },
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('subject-start-fractions'));

    await waitFor(() => {
      const resolveCalls = fetchCallsMatching(mockFetch, '/subjects/resolve');
      expect(resolveCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ rawInput: string }>(resolveCalls[0]?.init);
      expect(body?.rawInput).toBe('Fractions');
    });
  });

  it('shows the book page flip animation while checking the subject name', async () => {
    let resolveCheck!: (v: unknown) => void;
    const pendingResolve = new Promise((resolve) => {
      resolveCheck = resolve;
    });

    mockFetch.setRoute('/subjects/resolve', () => pendingResolve);

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('History');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-book-loading', {
        includeHiddenElements: true,
      });
      screen.getByText('Checking subject name...');
      expect(screen.queryByTestId('create-subject-submit')).toBeNull();
    });

    await act(async () => {
      resolveCheck({
        status: 'ambiguous',
        displayMessage: 'A few nearby subjects came up.',
        suggestions: [
          { name: 'Ancient History', description: 'Older civilizations' },
        ],
      });
    });

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });
  });

  it('keeps the book page flip animation while first curriculum is prepared', async () => {
    jest.useFakeTimers();
    try {
      setResolveResponse({
        status: 'direct_match',
        resolvedName: 'Ancient History',
        suggestions: [],
        displayMessage: 'Ancient History works.',
      });
      createSubjectResponse = {
        subject: { id: 'subject-history', name: 'Ancient History' },
      };

      let firstCurriculumCalls = 0;
      mockFetch.setRoute('/sessions/first-curriculum', () => {
        firstCurriculumCalls++;
        if (firstCurriculumCalls === 1) {
          return new Response(
            JSON.stringify({
              code: 'CONFLICT',
              message: 'Curriculum is still being prepared',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return defaultFirstCurriculumHandler;
      });

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      await enterSubjectName('Ancient History');
      fireEvent.press(screen.getByTestId('create-subject-submit'));

      await waitFor(() => {
        screen.getByTestId('subject-book-loading', {
          includeHiddenElements: true,
        });
        screen.getByText('Preparing your first lesson...');
        expect(screen.queryByTestId('create-subject-error')).toBeNull();
      });

      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });

      await waitFor(() => {
        expect(firstCurriculumCalls).toBe(2);
        // First-subject onboarding routes through /ready (recap) before the
        // session; /ready replays the session params on its CTA.
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/ready',
          params: {
            subject: 'Ancient History',
            subjectId: 'subject-history',
            sessionId: 'session-first',
            topicId: 'topic-first',
          },
        });
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('[F-110] surfaces a non-curriculum CONFLICT as an error instead of retrying it as preparing', async () => {
    // Guard-narrowness regression: extractApiErrorCode alone matches ANY
    // 409 CONFLICT. Only the curriculum-preparing conflict (message
    // "Curriculum is still being prepared") may be swallowed and retried;
    // any other CONFLICT must propagate to the error UI.
    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Ancient History',
      suggestions: [],
      displayMessage: 'Ancient History works.',
    });
    createSubjectResponse = {
      subject: { id: 'subject-history', name: 'Ancient History' },
    };

    let firstCurriculumCalls = 0;
    mockFetch.setRoute('/sessions/first-curriculum', () => {
      firstCurriculumCalls++;
      return new Response(
        JSON.stringify({
          code: 'CONFLICT',
          message: 'Session is not eligible for Library filing.',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Ancient History');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('create-subject-error');
    });

    // Not retried: a single call, no preparing-and-wait loop.
    expect(firstCurriculumCalls).toBe(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to the learning session surface when first lesson preparation keeps returning conflicts', async () => {
    jest.useFakeTimers();
    try {
      setResolveResponse({
        status: 'ambiguous',
        displayMessage: '**Easter** can be studied from different angles.',
        suggestions: [
          {
            name: 'World History',
            description: 'History of Easter traditions',
          },
        ],
      });
      createSubjectResponse = {
        subject: { id: 'subject-wh', name: 'World History' },
        structureType: 'focused_book',
        bookId: 'book-easter',
        bookTitle: 'Easter',
        bookCount: 1,
      };

      mockFetch.setRoute(
        '/sessions/first-curriculum',
        () =>
          new Response(
            JSON.stringify({
              code: 'CONFLICT',
              message: 'Curriculum is still being prepared',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
      );

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      await enterSubjectName('Easter');
      fireEvent.press(screen.getByTestId('create-subject-submit'));

      await waitFor(() => {
        screen.getByTestId('subject-suggestion-option-0');
      });

      fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

      await waitFor(() => {
        screen.getByText('Preparing your first lesson...');
      });

      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });
      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });

      await waitFor(() => {
        // First-subject onboarding routes to /ready even on the curriculum
        // fallback path (where sessionId is not yet known). /ready forwards
        // topicName + rawInput to the session on its CTA.
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/ready',
          params: {
            subject: 'World History',
            subjectId: 'subject-wh',
            topicName: 'Easter',
            rawInput: 'Easter',
          },
        });
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reveals the clarify input when Something else is pressed', async () => {
    setResolveResponse({
      status: 'ambiguous',
      displayMessage: 'A few nearby subjects came up.',
      suggestions: [
        { name: 'Ant biology', description: 'Study ants and colonies' },
        { name: 'Entomology', description: 'Study of insects' },
      ],
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-something-else');
    });

    fireEvent.press(screen.getByTestId('subject-something-else'));

    screen.getByTestId('subject-clarify-card');
    screen.getByTestId('subject-clarify-input');
  });

  it('offers and uses "Just use my words" after a second unresolved round', async () => {
    setSequentialResolveResponses([
      {
        status: 'ambiguous',
        displayMessage: 'A few nearby subjects came up.',
        suggestions: [
          { name: 'Ant biology', description: 'Study ants and colonies' },
        ],
      },
      {
        status: 'ambiguous',
        displayMessage: 'Still not quite sure which one you mean.',
        suggestions: [
          { name: 'Insect ecology', description: 'Ecosystems and insects' },
        ],
      },
    ]);
    createSubjectResponse = {
      subject: { id: 'subject-1', name: 'leaf cutter ants' },
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-something-else');
    });

    fireEvent.press(screen.getByTestId('subject-something-else'));
    await enterClarification('leaf cutter ants');
    fireEvent.press(screen.getByTestId('subject-clarify-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-use-my-words');
    });

    fireEvent.press(screen.getByTestId('subject-use-my-words'));

    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ name: string; rawInput: string }>(
        createCalls[0]?.init,
      );
      expect(body?.name).toBe('leaf cutter ants');
      expect(body?.rawInput).toBe('leaf cutter ants');
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/ready',
      params: {
        subject: 'leaf cutter ants',
        subjectId: 'subject-1',
        sessionId: 'session-first',
        topicId: 'topic-first',
      },
    });
  });

  it('suggestion cards meet minimum 44px touch target size', async () => {
    setResolveResponse({
      status: 'ambiguous',
      displayMessage: 'A few nearby subjects came up.',
      suggestions: [
        { name: 'Ant biology', description: 'Study ants and colonies' },
        { name: 'Entomology', description: 'Study of insects' },
      ],
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    // Suggestion cards have min-h-[52px] which exceeds 44px minimum
    const card0 = screen.getByTestId('subject-suggestion-option-0');
    const card1 = screen.getByTestId('subject-suggestion-option-1');
    expect(card0.props.accessibilityRole).toBe('button');
    expect(card1.props.accessibilityRole).toBe('button');
    expect(card0.props.accessibilityLabel).toBe('Choose Ant biology');
    expect(card1.props.accessibilityLabel).toBe('Choose Entomology');

    // Something else button also has proper accessibility
    const somethingElse = screen.getByTestId('subject-something-else');
    expect(somethingElse.props.accessibilityRole).toBe('button');
    expect(somethingElse.props.accessibilityLabel).toBe('Something else');

    // Verify the min-h-[52px] class is applied (52 > 44 minimum)
    // The Pressable elements have className containing min-h-[52px]
    // which ensures they meet accessibility touch target requirements
  });

  it('[BUG-237] picking ambiguous suggestion derives focus from original input', async () => {
    // User types "Easter", LLM returns ambiguous suggestions WITHOUT explicit focus
    setResolveResponse({
      status: 'ambiguous',
      displayMessage: '**Easter** can be studied from different angles.',
      suggestions: [
        { name: 'World History', description: 'History of Easter traditions' },
        { name: 'Religious Studies', description: 'Easter in world religions' },
      ],
    });

    createSubjectResponse = {
      subject: { id: 'subject-wh', name: 'World History' },
      structureType: 'focused_book',
      bookId: 'book-easter',
      bookTitle: 'Easter',
      bookCount: 1,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Easter');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    // Pick "World History"
    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{
        name: string;
        rawInput: string;
        focus: string;
        focusDescription: string;
      }>(createCalls[0]?.init);
      expect(body).toMatchObject({
        name: 'World History',
        rawInput: 'Easter',
        focus: 'Easter',
        focusDescription: 'History of Easter traditions',
      });
    });

    // First-subject onboarding routes through /ready (recap) before the
    // focused-book session; /ready replays the session params on its CTA.
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/ready',
      params: {
        subject: 'World History',
        subjectId: 'subject-wh',
        sessionId: 'session-first',
        topicId: 'topic-first',
      },
    });
  });

  it('[BUG-237] picking ambiguous suggestion with explicit focus uses that focus', async () => {
    // LLM returns suggestions WITH explicit focus fields
    setResolveResponse({
      status: 'ambiguous',
      displayMessage: '**Easter** can be studied from different angles.',
      suggestions: [
        {
          name: 'World History',
          description: 'History of Easter',
          focus: 'Easter Traditions',
        },
        {
          name: 'Religious Studies',
          description: 'Easter theology',
          focus: 'Easter in Christianity',
        },
      ],
    });

    createSubjectResponse = {
      subject: { id: 'subject-wh', name: 'World History' },
      structureType: 'focused_book',
      bookId: 'book-easter-trad',
      bookTitle: 'Easter Traditions',
      bookCount: 1,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Easter');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    // Pick "World History"
    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      // When the suggestion has an explicit focus, use that instead of deriving
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{
        name: string;
        rawInput: string;
        focus: string;
        focusDescription: string;
      }>(createCalls[0]?.init);
      expect(body).toMatchObject({
        name: 'World History',
        rawInput: 'Easter',
        focus: 'Easter Traditions',
        focusDescription: 'History of Easter',
      });
    });
  });

  it('[BUG-SUBJECT-STARTER-FOCUS] starter-chip refinements stay broad instead of creating a premature focused book', async () => {
    setResolveResponse({
      status: 'ambiguous',
      displayMessage:
        'Science is a huge topic. Which part are you curious about?',
      suggestions: [
        {
          name: 'Biology',
          description: 'Living things, ecosystems, and the human body',
          focus: 'Life Sciences',
        },
        {
          name: 'Chemistry',
          description: 'Matter, elements, and reactions',
          focus: 'Chemical Reactions',
        },
      ],
    });

    createSubjectResponse = {
      subject: { id: 'subject-biology', name: 'Biology' },
      structureType: 'broad',
      bookCount: 5,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('subject-start-how plants grow'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{
        name: string;
        rawInput?: string;
        focus?: string;
        focusDescription?: string;
      }>(createCalls[0]?.init);
      expect(body).toEqual({ name: 'Biology' });
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/pick-book/[subjectId]',
      params: { subjectId: 'subject-biology' },
    });
  });

  it('[BUG-SUBJECT-STARTER-FOCUS] confident starter-chip refinements stay broad', async () => {
    setResolveResponse({
      status: 'resolved',
      resolvedName: 'Biology',
      displayMessage: "We'll start with Biology.",
      suggestions: [
        {
          name: 'Biology',
          description: 'Living things, ecosystems, and the human body',
        },
      ],
      focus: 'Life Sciences',
      focusDescription: 'Plants, animals, and ecosystems',
    });

    createSubjectResponse = {
      subject: { id: 'subject-biology', name: 'Biology' },
      structureType: 'broad',
      bookCount: 5,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('subject-start-how plants grow'));

    await waitFor(() => {
      screen.getByTestId('subject-confident-card');
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-accept'));

    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{
        name: string;
        rawInput?: string;
        focus?: string;
        focusDescription?: string;
      }>(createCalls[0]?.init);
      expect(body).toEqual({ name: 'Biology' });
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/pick-book/[subjectId]',
      params: { subjectId: 'subject-biology' },
    });
  });

  it('splits combined LLM names like "Biology — Botany" and derives focus', async () => {
    // LLM returns combined name despite prompt instructions saying not to
    setResolveResponse({
      status: 'ambiguous',
      displayMessage: '**Tea** can be studied from different angles.',
      suggestions: [
        {
          name: 'Biology — Botany',
          description: 'Study of tea plants and cultivation',
        },
        {
          name: 'History',
          description: 'Tea trade routes and cultural impact',
        },
      ],
    });

    createSubjectResponse = {
      subject: { id: 'subject-botany', name: 'Botany' },
      structureType: 'focused_book',
      bookId: 'book-tea',
      bookTitle: 'tea',
      bookCount: 1,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('tea');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      // Should split "Biology — Botany" → subjectName "Botany", focus "tea"
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{
        name: string;
        rawInput: string;
        focus: string;
        focusDescription: string;
      }>(createCalls[0]?.init);
      expect(body).toMatchObject({
        name: 'Botany',
        rawInput: 'tea',
        focus: 'tea',
        focusDescription: 'Study of tea plants and cultivation',
      });
    });

    // First-subject onboarding routes through /ready (recap) before the
    // focused-book session; /ready replays the session params on its CTA.
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/ready',
      params: {
        subject: 'Botany',
        subjectId: 'subject-botany',
        sessionId: 'session-first',
        topicId: 'topic-first',
      },
    });
  });

  it('routes broad subjects to the picker screen', async () => {
    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'History',
      suggestions: [],
      displayMessage: 'History works well.',
    });

    createSubjectResponse = {
      subject: { id: 'subject-history', name: 'History' },
      structureType: 'broad',
      bookCount: 6,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('history');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: 'subject-history' },
      });
    });
  });

  // ----------------------------------------------------------------
  // BUG-3: Cancel and subject-limit buttons must route back to chat
  // when the screen was opened from a session (returnTo=chat).
  // ----------------------------------------------------------------
  it('[BUG-3] Cancel button calls router.back() when returnTo=chat', () => {
    mockSearchParams = { returnTo: 'chat' };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('[BUG-633 / M-1] Cancel falls back to home when returnTo=chat AND no back stack (deep link entry)', () => {
    // Repro: user opens the create-subject modal via deep link / push notification
    // with returnTo=chat. There is no prior stack entry — bare router.back()
    // would silently no-op and the user would be stuck on the modal.
    mockSearchParams = { returnTo: 'chat' };
    mockCanGoBackValue = false;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('[BUG-633 / M-1] subject-limit Manage falls back to home when returnTo=chat AND no back stack', async () => {
    mockSearchParams = { returnTo: 'chat' };
    mockCanGoBackValue = false;

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    createSubjectShouldError = true;
    // [WI-855] The API now signals the limit via a stable 409 typed code, not
    // the English message; the screen branches on errorHasCode, not a regex.
    createSubjectErrorMessage =
      'You have reached the subject limit for your plan';
    createSubjectErrorCode = 'SUBJECT_LIMIT_EXCEEDED';
    createSubjectErrorStatus = 409;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });
    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('manage-subjects-button');
    });
    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('Cancel button returns to library when returnTo=library', () => {
    mockSearchParams = { returnTo: 'library' };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('Cancel button returns to the learner home view when opened from learner home', () => {
    mockSearchParams = { returnTo: 'learner-home' };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('[BUG-3] subject-limit "Manage" button calls router.back() when returnTo=chat', async () => {
    mockSearchParams = { returnTo: 'chat' };

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    createSubjectShouldError = true;
    // [WI-855] The API now signals the limit via a stable 409 typed code, not
    // the English message; the screen branches on errorHasCode, not a regex.
    createSubjectErrorMessage =
      'You have reached the subject limit for your plan';
    createSubjectErrorCode = 'SUBJECT_LIMIT_EXCEEDED';
    createSubjectErrorStatus = 409;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('manage-subjects-button');
    });

    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.stringContaining('library'),
    );
  });

  it('[BUG-3] subject-limit "Manage" button routes to library when no returnTo', async () => {
    mockSearchParams = {};

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    createSubjectShouldError = true;
    // [WI-855] The API now signals the limit via a stable 409 typed code, not
    // the English message; the screen branches on errorHasCode, not a regex.
    createSubjectErrorMessage =
      'You have reached the subject limit for your plan';
    createSubjectErrorCode = 'SUBJECT_LIMIT_EXCEEDED';
    createSubjectErrorStatus = 409;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('manage-subjects-button');
    });

    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });

  it('[WI-855] typed SUBJECT_LIMIT_EXCEEDED shows delete-first guidance + manage button', async () => {
    mockSearchParams = {};

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    createSubjectShouldError = true;
    // Message deliberately does NOT contain "subject limit"/"too many subjects" —
    // the recovery UI must key off the typed code, not message text.
    createSubjectErrorMessage = 'Request could not be completed.';
    createSubjectErrorCode = 'SUBJECT_LIMIT_EXCEEDED';
    createSubjectErrorStatus = 409;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });
    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    // Recovery CTA appears...
    await waitFor(() => {
      screen.getByTestId('manage-subjects-button');
    });
    // ...and the delete-first guidance is appended to the error copy. Regex =
    // substring match (the node also holds the server message before it).
    expect(screen.getByTestId('create-subject-error')).toHaveTextContent(
      /Delete an old subject first to make room\./,
    );
  });

  it('[WI-855] non-limit error containing "subject limit" in its MESSAGE does NOT show recovery UI', async () => {
    mockSearchParams = {};

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math works.',
    });
    createSubjectShouldError = true;
    // The OLD regex (`/subject limit|too many subjects/i` on err.message) would
    // have FALSE-POSITIVED on this generic 400 and shown the manage/delete CTA.
    // With typed-code branching there is no code, so recovery UI must stay hidden.
    createSubjectErrorMessage =
      'The mentor mentioned a subject limit and too many subjects, but this is a generic failure.';
    createSubjectErrorCode = undefined;
    createSubjectErrorStatus = 400;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });
    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    // The generic error still surfaces...
    await waitFor(() => {
      screen.getByTestId('create-subject-error');
    });
    // ...but the subject-limit recovery affordances must NOT appear.
    expect(screen.queryByTestId('manage-subjects-button')).toBeNull();
    expect(screen.getByTestId('create-subject-error')).not.toHaveTextContent(
      'Delete an old subject first to make room.',
    );
  });

  it('[BUG-236] returns to chat session when returnTo=chat after subject creation', async () => {
    mockSearchParams = { returnTo: 'chat', chatTopic: 'Easter' };

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'World History',
      suggestions: [],
      displayMessage: 'World History works well.',
    });

    createSubjectResponse = {
      subject: { id: 'subject-world-history', name: 'World History' },
      structureType: 'broad',
      bookCount: 4,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('World History');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'freeform',
          subjectId: 'subject-world-history',
          subjectName: 'World History',
          topicName: 'Easter',
        },
      });
    });

    // Must NOT navigate to picker or library — that was the bug
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/pick-book/[subjectId]' }),
    );
  });

  it('[BUG-236] routes to picker when no returnTo param (default behavior)', async () => {
    // No returnTo param — normal Library-originated flow
    mockSearchParams = {};

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Biology',
      suggestions: [],
      displayMessage: 'Biology it is.',
    });

    createSubjectResponse = {
      subject: { id: 'subject-biology', name: 'Biology' },
      structureType: 'broad',
      bookCount: 5,
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Biology');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: 'subject-biology' },
      });
    });

    // Must NOT navigate to session
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/session' }),
    );
  });

  // ----------------------------------------------------------------
  // SUBJECT-01: Chip visibility, returning-user section, hint text
  // ----------------------------------------------------------------

  it('hides starter chips when input has text', async () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('subject-options');

    await enterSubjectName('Bio');

    expect(screen.queryByTestId('subject-options')).toBeNull();
  });

  it('shows unified subject rows when the user has existing subjects', async () => {
    subjectsListData = [
      { id: 'sub-1', name: 'Math' },
      { id: 'sub-2', name: 'History' },
    ];

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('subject-options');
      screen.getByText('Continue Math');
      screen.getByText('Continue History');
      expect(screen.queryByText('Or continue with')).toBeNull();
      screen.getByTestId('subject-continue-sub-1');
      screen.getByTestId('subject-continue-sub-2');
    });
  });

  it('shows only starter rows for first-time users', () => {
    subjectsListData = [];

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('subject-options');
    expect(screen.queryByText(/^Continue /)).toBeNull();
  });

  it('tapping a continue row navigates to session with subject', async () => {
    subjectsListData = [{ id: 'sub-1', name: 'Math' }];

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('subject-continue-sub-1');
    });

    fireEvent.press(screen.getByTestId('subject-continue-sub-1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: { mode: 'learning', subjectId: 'sub-1', subjectName: 'Math' },
    });
  });

  it('hides unified subject rows when input has text', async () => {
    subjectsListData = [{ id: 'sub-1', name: 'Math' }];

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('subject-options');
    });

    await enterSubjectName('Science');

    expect(screen.queryByTestId('subject-options')).toBeNull();
  });

  it('shows "Not sure?" hint text when input is empty', () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('not-sure-hint');
    expect(
      screen.getByText(/Not sure\? Just describe what interests you/),
    ).toBeTruthy();
  });

  it('hides "Not sure?" hint when input has text', async () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Art');

    expect(screen.queryByTestId('not-sure-hint')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // BUG-692: Cancel mid-flight must not push after mutation resolves
  // -----------------------------------------------------------------------

  it('[BUG-692] does not navigate after Cancel pressed during createSubject mutation', async () => {
    let resolveCreate!: (v: unknown) => void;
    const pendingCreate = new Promise((r) => {
      resolveCreate = r;
    });

    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math it is.',
    });
    // Make create hang until we resolve it manually.
    mockFetch.setRoute('/subjects', (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return pendingCreate.then(() => ({
          subject: { id: 'subject-math', name: 'Math' },
        }));
      }
      return { subjects: [] };
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    // Wait for resolve to finish (before create fires)
    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve'),
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
    });

    // Cancel while create is still pending
    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    // Now let the create mutation resolve
    resolveCreate({});

    await Promise.resolve();
    await Promise.resolve();

    // Cancel already navigated; the mutation result must NOT add another push/replace
    // Only the cancel-triggered replace should have been called once (not twice)
    const replaceCalls = mockReplace.mock.calls;
    // All replace calls should be from the cancel handler, not from the mutation result
    // (The cancel replaces to home/library, not to the first session)
    const hasOnboardingNav = replaceCalls.some(
      (call) =>
        typeof call[0] === 'object' && call[0]?.pathname === '/(app)/session',
    );
    expect(hasOnboardingNav).toBe(false);
  });

  it('[BUG-692] does not navigate after Cancel pressed during resolveSubject mutation', async () => {
    let resolveResolve!: (v: unknown) => void;
    const pendingResolve = new Promise((r) => {
      resolveResolve = r;
    });

    mockFetch.setRoute('/subjects/resolve', () =>
      pendingResolve.then(() => ({
        status: 'direct_match',
        resolvedName: 'Science',
        suggestions: [],
        displayMessage: 'Science it is.',
      })),
    );

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Science');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    // Cancel while resolve is pending
    fireEvent.press(screen.getByTestId('create-subject-cancel'));

    // Now let the resolve mutation resolve
    resolveResolve({});

    await Promise.resolve();
    await Promise.resolve();

    // createSubject must NOT have been called — cancelled before it ran
    const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
      (c: { url: string; init?: RequestInit }) =>
        c.init?.method === 'POST' && !c.url.includes('/resolve'),
    );
    expect(createCalls.length).toBe(0);
    // No post-cancel navigation from the mutation result
    expect(mockPush).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // existingSubjects error: inline retry message
  // -----------------------------------------------------------------------

  it('shows inline retry message when existingSubjects fails to load', async () => {
    subjectsListIsError = true;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('subjects-load-error-retry');
    });
  });

  it('tapping subjects-load-error-retry calls refetch', async () => {
    subjectsListIsError = true;

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      screen.getByTestId('subjects-load-error-retry');
    });

    const subjectCallsBefore = fetchCallsMatching(
      mockFetch,
      '/subjects',
    ).length;
    fireEvent.press(screen.getByTestId('subjects-load-error-retry'));

    await waitFor(() => {
      expect(fetchCallsMatching(mockFetch, '/subjects').length).toBeGreaterThan(
        subjectCallsBefore,
      );
    });
  });

  // -----------------------------------------------------------------------
  // 5a: Lighter confident-case copy
  // -----------------------------------------------------------------------

  it('[5a] resolved + single suggestion shows confident card with lighter copy', async () => {
    setResolveResponse({
      status: 'resolved',
      resolvedName: 'Italian',
      suggestions: [{ name: 'Italian', description: 'Italian language' }],
      displayMessage: 'Italian works well.',
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('italian');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-confident-card');
    });

    // Lighter "We'll start with" message
    expect(screen.getByTestId('subject-confident-message').props.children).toBe(
      "We'll start with Italian.",
    );

    // Primary button says "Start", secondary says "Change"
    expect(screen.getByText('Start'));
    expect(screen.getByText('Change'));

    // Heavier card must NOT be visible
    expect(screen.queryByTestId('subject-single-suggestion-card')).toBeNull();
  });

  it('[5a] corrected status shows confident card with lighter copy', async () => {
    setResolveResponse({
      status: 'corrected',
      resolvedName: 'Calculus',
      suggestions: [],
      displayMessage: 'Did you mean Calculus?',
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('caluclus');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-confident-card');
    });

    expect(screen.getByTestId('subject-confident-message').props.children).toBe(
      "We'll start with Calculus.",
    );
    expect(screen.getByText('Start'));
    expect(screen.getByText('Change'));

    // Heavier card must NOT be visible
    expect(screen.queryByTestId('subject-single-suggestion-card')).toBeNull();
  });

  it('[5a] tapping Start on confident card calls onAcceptSuggestion and navigates', async () => {
    setResolveResponse({
      status: 'resolved',
      resolvedName: 'Italian',
      suggestions: [{ name: 'Italian', description: 'Italian language' }],
      displayMessage: 'Italian works well.',
    });
    createSubjectResponse = {
      subject: { id: 'subject-italian', name: 'Italian' },
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('italian');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-confident-card');
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-accept'));

    await waitFor(() => {
      // First-subject onboarding routes through /ready (recap) before the
      // session; /ready replays the session params on its CTA.
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/ready',
        params: {
          subject: 'Italian',
          subjectId: 'subject-italian',
          sessionId: 'session-first',
          topicId: 'topic-first',
        },
      });
    });
  });

  it('[5a] tapping Change on confident card returns to edit state', async () => {
    setResolveResponse({
      status: 'resolved',
      resolvedName: 'Italian',
      suggestions: [{ name: 'Italian', description: 'Italian language' }],
      displayMessage: 'Italian works well.',
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('italian');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-confident-card');
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-edit'));

    // Card should be gone; input should be back
    await waitFor(() => {
      expect(screen.queryByTestId('subject-confident-card')).toBeNull();
    });
    expect(screen.getByTestId('create-subject-name').props.value).toBe(
      'Italian',
    );
  });

  it('[5a] resolved + multiple suggestions keeps heavier Accept/Edit card', async () => {
    setResolveResponse({
      status: 'resolved',
      resolvedName: 'Spanish',
      suggestions: [
        { name: 'Spanish', description: 'Spanish language' },
        { name: 'Spanish Literature', description: 'Hispanic literature' },
      ],
      displayMessage: 'Did you mean one of these?',
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('spanish');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-single-suggestion-card');
    });

    // Heavier card with Accept/Edit — not the confident card
    expect(screen.queryByTestId('subject-confident-card')).toBeNull();
    expect(screen.getByTestId('subject-suggestion-accept'));
    expect(screen.getByText('Accept'));
  });

  it('[WI-508] Accept/Edit Pressables have disabled={isBusy} and are unreachable while creating', async () => {
    // Resolve to a confident single match so the confident card shows.
    setResolveResponse({
      status: 'resolved',
      resolvedName: 'Italian',
      suggestions: [{ name: 'Italian', description: 'Italian language' }],
      displayMessage: 'Italian works well.',
    });
    // Stall the create POST so the screen stays in `creating` phase (isBusy=true).
    mockFetch.setRoute('/subjects', (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Promise(() => undefined /* never resolves */);
      }
      return { subjects: subjectsListData };
    });

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('italian');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-confident-card');
    });

    const acceptBtn = screen.getByTestId('subject-suggestion-accept');
    const editBtn = screen.getByTestId('subject-suggestion-edit');

    // Before the accept press, both buttons must be enabled (isBusy=false when
    // suggestion card is shown, so disabled prop evaluates to false).
    expect(acceptBtn.props.disabled).not.toBe(true);
    expect(editBtn.props.disabled).not.toBe(true);

    fireEvent.press(acceptBtn);

    // Pressing accept sets phase to 'creating' (isBusy=true). The suggestion
    // card unmounts because it is gated on `phase === 'suggestion'`.
    // The loading indicator appears. Both action Pressables are unreachable —
    // a rapid second tap cannot fire a duplicate create request.
    await waitFor(() => {
      screen.getByTestId('subject-book-loading', {
        includeHiddenElements: true,
      });
    });

    expect(screen.queryByTestId('subject-confident-card')).toBeNull();
    expect(screen.queryByTestId('subject-suggestion-accept')).toBeNull();
    expect(screen.queryByTestId('subject-suggestion-edit')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [BUG-520] Resolve-phase 30s timeout cleanup must not leak across phase
// changes.
//
// The effect at create-subject.tsx:206 starts a setTimeout when phase enters
// `resolving` and shows `setError(resolveTookTooLong)` when it fires. The
// effect must cancel that timer when phase moves away from `resolving` (e.g.
// to `creating` or `suggestion`). Before the fix, cleanup read the timer
// handle from a ref shared between two teardown paths, so a stale timer
// could fire after the phase had moved on and stomp the screen with an
// error during a perfectly healthy `creating` flow.
//
// Regression: after `resolving` transitions to `creating`, advancing fake
// timers past 30s must NOT show the timeout error. The phase change itself
// proves resolve completed; firing an error after success is the bug.
// ---------------------------------------------------------------------------
describe('CreateSubjectScreen — [BUG-520] resolve timeout cleanup', () => {
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    subjectsListData = [];
    subjectsListIsError = false;
    createSubjectResponse = null;
    createSubjectShouldError = false;
    createSubjectErrorMessage = '';
    createSubjectErrorCode = undefined;
    createSubjectErrorStatus = 400;
    mockCanGoBackValue = true;
    mockFetch.setRoute('/subjects/resolve', defaultResolveHandler);
    mockFetch.setRoute(
      '/sessions/first-curriculum',
      defaultFirstCurriculumHandler,
    );
    mockFetch.setRoute('/subjects', defaultSubjectsHandler);
    Wrapper = createWrapper();
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  afterEach(() => {
    cleanup();
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('does not surface the resolve-timeout error after phase transitions out of resolving', async () => {
    jest.useFakeTimers();
    try {
      // Make /subjects/resolve resolve immediately (direct_match) so the
      // screen flips resolving → creating well within 30s.
      setResolveResponse({
        status: 'direct_match',
        resolvedName: 'Geometry',
        suggestions: [],
        displayMessage: 'Geometry it is.',
      });
      // Stall create + first-curriculum indefinitely so the screen stays in
      // `creating`/`preparing` after the resolve timer was scheduled.
      mockFetch.setRoute(
        '/subjects',
        () => new Promise(() => undefined /* never resolves */),
      );

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      await enterSubjectName('Geometry');
      fireEvent.press(screen.getByTestId('create-subject-submit'));

      // Wait for the screen to advance past `resolving` (loading copy
      // changes once `creating` is entered).
      await waitFor(() => {
        // Either creating spinner or first-lesson preparing copy must show
        // — confirms resolveState.phase !== 'resolving'.
        screen.getByTestId('subject-book-loading', {
          includeHiddenElements: true,
        });
      });

      // Sanity: no error yet.
      expect(screen.queryByTestId('create-subject-error')).toBeNull();

      // Advance well past the 30s resolve-timeout. If cleanup failed to
      // cancel the timer (the BUG-520 bug), this would trigger
      // setError(resolveTookTooLong).
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      // Timer must have been cancelled when phase left `resolving` — no
      // error should appear despite the timer interval elapsing.
      expect(screen.queryByTestId('create-subject-error')).toBeNull();
      expect(
        screen.queryByText('That took too long — please try again'),
      ).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the timeout retry UI and ignores a direct-match resolve that completes after the 30s timeout', async () => {
    jest.useFakeTimers();
    try {
      let resolveLate!: (value: unknown) => void;
      const pendingResolve = new Promise<unknown>((resolve) => {
        resolveLate = resolve;
      });

      mockFetch.setRoute('/subjects/resolve', () => pendingResolve);

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      await enterSubjectName('Geometry');
      fireEvent.press(screen.getByTestId('create-subject-submit'));

      await waitFor(() => {
        screen.getByTestId('subject-book-loading', {
          includeHiddenElements: true,
        });
        screen.getByText('Checking subject name...');
      });

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      expect(screen.getByTestId('resolve-timeout-retry')).toBeTruthy();

      await act(async () => {
        resolveLate({
          status: 'direct_match',
          resolvedName: 'Geometry',
          suggestions: [],
          displayMessage: 'Geometry it is.',
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const navigatedToSessionOrReady = mockReplace.mock.calls.some((call) => {
        const target = call[0];
        return (
          typeof target === 'object' &&
          target !== null &&
          'pathname' in target &&
          (target.pathname === '/(app)/session' || target.pathname === '/ready')
        );
      });

      expect(navigatedToSessionOrReady).toBe(false);
      expect(screen.getByTestId('resolve-timeout-retry')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a timed-out resolve stale after retry starts a new resolve attempt', async () => {
    jest.useFakeTimers();
    try {
      let resolveFirst!: (value: unknown) => void;
      let resolveSecond!: (value: unknown) => void;
      const firstResolve = new Promise<unknown>((resolve) => {
        resolveFirst = resolve;
      });
      const secondResolve = new Promise<unknown>((resolve) => {
        resolveSecond = resolve;
      });
      let resolveCalls = 0;
      const createdSubjectNames: string[] = [];

      mockFetch.setRoute('/subjects/resolve', () => {
        resolveCalls++;
        return resolveCalls === 1 ? firstResolve : secondResolve;
      });
      mockFetch.setRoute('/subjects', (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const body = extractJsonBody(init) as { name?: string };
          const subjectName = body.name ?? 'Subject';
          createdSubjectNames.push(subjectName);
          return {
            subject: {
              id: `subject-${createdSubjectNames.length}`,
              name: subjectName,
            },
          };
        }
        return { subjects: [] };
      });

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      await enterSubjectName('Geometry');
      fireEvent.press(screen.getByTestId('create-subject-submit'));

      await waitFor(() => {
        screen.getByTestId('subject-book-loading', {
          includeHiddenElements: true,
        });
        screen.getByText('Checking subject name...');
      });

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      fireEvent.press(screen.getByTestId('resolve-timeout-retry'));

      await waitFor(() => {
        expect(resolveCalls).toBe(2);
      });

      await act(async () => {
        resolveFirst({
          status: 'direct_match',
          resolvedName: 'Stale Geometry',
          suggestions: [],
          displayMessage: 'Stale Geometry it is.',
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const navigatedWithStaleSubject = mockReplace.mock.calls.some((call) => {
        const target = call[0];
        return (
          typeof target === 'object' &&
          target !== null &&
          'params' in target &&
          target.params !== null &&
          typeof target.params === 'object' &&
          (('subjectName' in target.params &&
            target.params.subjectName === 'Stale Geometry') ||
            ('subject' in target.params &&
              target.params.subject === 'Stale Geometry'))
        );
      });

      expect(navigatedWithStaleSubject).toBe(false);
      expect(createdSubjectNames).not.toContain('Stale Geometry');
      expect(
        screen.getByTestId('subject-book-loading', {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();

      await act(async () => {
        resolveSecond({
          status: 'direct_match',
          resolvedName: 'Fresh Geometry',
          suggestions: [],
          displayMessage: 'Fresh Geometry it is.',
        });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const navigatedWithFreshSubject = mockReplace.mock.calls.some((call) => {
        const target = call[0];
        return (
          typeof target === 'object' &&
          target !== null &&
          'params' in target &&
          target.params !== null &&
          typeof target.params === 'object' &&
          (('subjectName' in target.params &&
            target.params.subjectName === 'Fresh Geometry') ||
            ('subject' in target.params &&
              target.params.subject === 'Fresh Geometry'))
        );
      });

      expect(navigatedWithFreshSubject).toBe(true);
      expect(createdSubjectNames).toEqual(['Fresh Geometry']);
    } finally {
      jest.useRealTimers();
    }
  });
});

// [BUG-829] KeyboardAvoidingView behavior prop must use Platform.select
// rather than a hardcoded "padding" value. On Android, "padding" pushes the
// input off-screen with prediction-bar keyboards; "height" is the documented
// Android-correct value.
describe('CreateSubjectScreen — keyboard avoiding behavior', () => {
  const { KeyboardAvoidingView } = require('react-native');
  let Wrapper: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    subjectsListData = [];
    subjectsListIsError = false;
    createSubjectResponse = null;
    createSubjectShouldError = false;
    createSubjectErrorMessage = '';
    createSubjectErrorCode = undefined;
    createSubjectErrorStatus = 400;
    // Restore routes to defaults so per-test overrides don't leak between suites.
    mockFetch.setRoute('/subjects/resolve', defaultResolveHandler);
    mockFetch.setRoute('/subjects', defaultSubjectsHandler);
    Wrapper = createWrapper();
    // [BUG-375] Default to signed-in so existing tests are unaffected by the
    // new auth guard; auth-gate break tests override below.
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
  });

  afterEach(() => {
    activeQueryClient?.clear();
    activeQueryClient = null;
  });

  it('uses platform-correct KeyboardAvoidingView behavior (ios → padding)', () => {
    // jest-expo defaults Platform.OS to 'ios' in test, so Platform.select
    // returns the ios branch. The bug was a hardcoded "padding" — fix uses
    // Platform.select with both keys so Android resolves to "height".
    render(<CreateSubjectScreen />, { wrapper: Wrapper });
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
  });

  it('does not hardcode behavior — uses Platform.select for both platforms', () => {
    // Static guard against a future regression: ensure the source uses
    // Platform.select with ios+android keys instead of hardcoding "padding".
    // jest-expo locks Platform.OS to 'ios' for the runtime test above; a
    // source-level assertion is the safest cross-platform regression guard.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, 'create-subject.tsx'),
      'utf8',
    );
    // The KeyboardAvoidingView block must contain Platform.select with
    // both ios and android keys.
    const kavBlock = src.match(/<KeyboardAvoidingView[\s\S]+?>/);
    expect(kavBlock).toBeTruthy();
    expect(kavBlock?.[0]).toMatch(/Platform\.select/);
    expect(kavBlock?.[0]).toMatch(/ios:\s*['"]padding['"]/);
    expect(kavBlock?.[0]).toMatch(/android:\s*['"]height['"]/);
  });

  // ---------------------------------------------------------------------------
  // [BUG-375] Auth gate — deep-link entry to root-level screen
  // ---------------------------------------------------------------------------
  describe('auth gate [BUG-375]', () => {
    it('redirects to /sign-in when an unauthenticated user opens a create-subject deep-link', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: false,
      });

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      screen.getByTestId('mock-redirect-/sign-in');
      expect(screen.queryByTestId('create-subject-name')).toBeNull();
      expect(screen.queryByTestId('create-subject-submit')).toBeNull();
    });

    it('shows a spinner (not redirect) while Clerk is still hydrating', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
      });

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-subject-auth-loading');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });

    it('renders the form when the user is signed in', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
      });

      render(<CreateSubjectScreen />, { wrapper: Wrapper });

      screen.getByTestId('create-subject-name');
      expect(screen.queryByTestId('mock-redirect-/sign-in')).toBeNull();
    });
  });
});
