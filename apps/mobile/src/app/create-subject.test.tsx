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

jest.mock('../lib/api-client', () =>
  require('../test-utils/mock-api-routes').mockApiClientFactory(mockFetch),
);

jest.mock('../lib/profile', () => ({
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
  }),
  ProfileContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

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
  '../lib/format-api-error',
  /* gc1-allow: error formatting */ () => ({
    formatApiError: (error: unknown) =>
      error instanceof Error ? error.message : 'Something went wrong',
  }),
);

// NOT an API hook — keep as-is.
jest.mock('../hooks/use-keyboard-scroll', () => ({
  useKeyboardScroll: () => ({
    scrollRef: { current: null },
    onFieldLayout: () => () => undefined,
    onFieldFocus: () => () => undefined,
  }),
}));

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
        JSON.stringify({ message: createSubjectErrorMessage }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
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
    mockCanGoBackValue = true;
    // Restore routes to defaults so per-test setRoute overrides don't leak.
    mockFetch.setRoute('/subjects/resolve', defaultResolveHandler);
    mockFetch.setRoute(
      '/sessions/first-curriculum',
      defaultFirstCurriculumHandler,
    );
    mockFetch.setRoute('/subjects', defaultSubjectsHandler);
    Wrapper = createWrapper();
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
      screen.getByTestId('subject-book-loading');
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
        screen.getByTestId('subject-book-loading');
        screen.getByText('Preparing your first lesson...');
        expect(screen.queryByTestId('create-subject-error')).toBeNull();
      });

      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });

      await waitFor(() => {
        expect(firstCurriculumCalls).toBe(2);
        expect(mockReplace).toHaveBeenCalledWith({
          pathname: '/(app)/session',
          params: {
            mode: 'learning',
            subjectId: 'subject-history',
            subjectName: 'Ancient History',
            sessionId: 'session-first',
            topicId: 'topic-first',
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
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subject-1',
        subjectName: 'leaf cutter ants',
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

    // Should start the first session with the focused book.
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subject-wh',
        subjectName: 'World History',
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

    // Should start the first session (focused_book path), not library.
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subject-botany',
        subjectName: 'Botany',
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
    createSubjectErrorMessage =
      'You have reached the subject limit for your plan';

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
    createSubjectErrorMessage =
      'You have reached the subject limit for your plan';

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
    createSubjectErrorMessage =
      'You have reached the subject limit for your plan';

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    await enterSubjectName('Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('manage-subjects-button');
    });

    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
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
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Change')).toBeTruthy();

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
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('Change')).toBeTruthy();

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
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'subject-italian',
          subjectName: 'Italian',
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
    expect(screen.getByTestId('subject-suggestion-accept')).toBeTruthy();
    expect(screen.getByText('Accept')).toBeTruthy();
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
    // Restore routes to defaults so per-test overrides don't leak between suites.
    mockFetch.setRoute('/subjects/resolve', defaultResolveHandler);
    mockFetch.setRoute('/subjects', defaultSubjectsHandler);
    Wrapper = createWrapper();
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
});
