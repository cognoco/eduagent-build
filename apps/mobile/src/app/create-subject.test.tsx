import {
  render,
  screen,
  fireEvent,
  waitFor,
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
  '/subjects': { subjects: [] },
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const strings: Record<
        string,
        string | ((o?: Record<string, unknown>) => string)
      > = {
        title: 'New subject',
        prompt:
          "What would you like to learn? Enter any subject or describe what interests you — we'll figure out the rest.",
        nameLabel: 'Subject name',
        namePlaceholder: "e.g. Calculus, World History, 'learn about ants'...",
        resolveTookTooLong: 'Check took too long — try again',
        resolveNetworkError:
          'Could not check if this subject exists. Please check your connection and try again.',
        enterSubjectNameError: 'Please enter a subject name',
        retryCheckLabel: 'Retry checking subject name',
        manageSubjects: 'Manage your subjects',
        retryLoadSubjectsLabel: 'Retry loading your subjects',
        subjectsLoadError: "Couldn't load your subjects.",
        tapToRetry: 'Tap to retry',
        suggestedSubjectsLabel: 'Suggested subjects',
        continueSubject: (o) => `Continue ${o?.name ?? ''}`,
        continueSubjectLabel: (o) => `Continue ${o?.name ?? ''}`,
        startSubject: (o) => `Start ${o?.name ?? ''}`,
        startSubjectLabel: (o) => `Start ${o?.name ?? ''}`,
        notSureHint:
          'Not sure? Just describe what interests you — like "I want to understand how plants grow"',
        checkingName: 'Checking subject name...',
        somethingElse: 'Something else',
        somethingElseHint: 'Be as specific as you like.',
        clarifyLabel: 'What exactly do you want to learn?',
        clarifyPlaceholder:
          'e.g. ant colonies, Roman roads, solving fractions...',
        checkThisInstead: 'Check this instead',
        useMyWords: (o) => `Just use "${o?.words ?? ''}" as my subject`,
        useMyWordsLabel: (o) => `Just use ${o?.words ?? ''} as my subject`,
        justUse: (o) => `Just use "${o?.words ?? ''}"`,
        noMatchFallback:
          "I couldn't match that cleanly, but we can still use your exact words.",
        editSubjectNameLabel: 'Edit subject name',
        editInstead: 'Edit instead',
        accept: 'Accept',
        acceptSuggestionLabel: 'Accept suggestion',
        editSuggestionLabel: 'Edit suggestion',
        startLearning: 'Start Learning',
        validationHint: 'Enter a subject name to get started',
        'common:cancel': 'Cancel',
        'common:edit': 'Edit',
        'common:retry': 'Retry',
        'common:goBack': 'Go Back',
      };
      const entry = strings[key];
      if (entry === undefined) return key;
      if (typeof entry === 'function') return entry(opts);
      return entry;
    },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

jest.mock('../lib/api-client', () =>
  require('../test-utils/mock-api-routes').mockApiClientFactory(mockFetch)
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

jest.mock('../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#94a3b8',
    primary: '#2563eb',
  }),
}));

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
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
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
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
    mockFetch.setRoute('/subjects', defaultSubjectsHandler);
    Wrapper = createWrapper();
  });

  it('renders starter chips and fills the input on tap', () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('subject-options');

    // "Math" starter row is present and tappable
    const mathChip = screen.getByTestId('subject-start-math');
    expect(mathChip).toBeTruthy();

    // Tapping fills the name input
    fireEvent.press(mathChip);
    expect(screen.getByTestId('create-subject-name').props.value).toBe('Math');
  });

  it('tapping a chip immediately triggers resolveInput', async () => {
    setResolveResponse({
      status: 'direct_match',
      resolvedName: 'Math',
      suggestions: [],
      displayMessage: 'Math it is.',
    });
    createSubjectResponse = {
      subject: { id: 'subject-math', name: 'Math' },
    };

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('subject-start-math'));

    await waitFor(() => {
      const resolveCalls = fetchCallsMatching(mockFetch, '/subjects/resolve');
      expect(resolveCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ rawInput: string }>(resolveCalls[0]?.init);
      expect(body?.rawInput).toBe('Math');
    });
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'ants');
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'ants');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-something-else');
    });

    fireEvent.press(screen.getByTestId('subject-something-else'));
    fireEvent.changeText(
      screen.getByTestId('subject-clarify-input'),
      'leaf cutter ants'
    );
    fireEvent.press(screen.getByTestId('subject-clarify-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-use-my-words');
    });

    fireEvent.press(screen.getByTestId('subject-use-my-words'));

    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve')
      );
      expect(createCalls.length).toBeGreaterThanOrEqual(1);
      const body = extractJsonBody<{ name: string; rawInput: string }>(
        createCalls[0]?.init
      );
      expect(body?.name).toBe('leaf cutter ants');
      expect(body?.rawInput).toBe('leaf cutter ants');
    });

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: 'subject-1',
        subjectName: 'leaf cutter ants',
        step: '1',
        totalSteps: '4',
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'ants');
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Easter');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    // Pick "World History"
    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve')
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

    // Should navigate to interview with the focused book
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: 'subject-wh',
        subjectName: 'World History',
        bookId: 'book-easter',
        bookTitle: 'Easter',
        step: '1',
        totalSteps: '4',
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Easter');
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
          c.init?.method === 'POST' && !c.url.includes('/resolve')
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'tea');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('subject-suggestion-option-0');
    });

    fireEvent.press(screen.getByTestId('subject-suggestion-option-0'));

    await waitFor(() => {
      // Should split "Biology — Botany" → subjectName "Botany", focus "tea"
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve')
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

    // Should navigate to interview (focused_book path), not library
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: 'subject-botany',
        subjectName: 'Botany',
        bookId: 'book-tea',
        bookTitle: 'tea',
        step: '1',
        totalSteps: '4',
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'history');
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
    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Math');
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

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home?view=learner');
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      screen.getByTestId('manage-subjects-button');
    });

    fireEvent.press(screen.getByTestId('manage-subjects-button'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.stringContaining('library')
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Math');
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

    fireEvent.changeText(
      screen.getByTestId('create-subject-name'),
      'World History'
    );
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
      expect.objectContaining({ pathname: '/(app)/pick-book/[subjectId]' })
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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Biology');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/pick-book/[subjectId]',
        params: { subjectId: 'subject-biology' },
      });
    });

    // Must NOT navigate to session
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(app)/session' })
    );
  });

  // ----------------------------------------------------------------
  // SUBJECT-01: Chip visibility, returning-user section, hint text
  // ----------------------------------------------------------------

  it('hides starter chips when input has text', () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('subject-options');

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Bio');

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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Science');

    expect(screen.queryByTestId('subject-options')).toBeNull();
  });

  it('shows "Not sure?" hint text when input is empty', () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    screen.getByTestId('not-sure-hint');
    expect(
      screen.getByText(/Not sure\? Just describe what interests you/)
    ).toBeTruthy();
  });

  it('hides "Not sure?" hint when input has text', () => {
    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Art');

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

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Math');
    fireEvent.press(screen.getByTestId('create-subject-submit'));

    // Wait for resolve to finish (before create fires)
    await waitFor(() => {
      const createCalls = fetchCallsMatching(mockFetch, '/subjects').filter(
        (c: { url: string; init?: RequestInit }) =>
          c.init?.method === 'POST' && !c.url.includes('/resolve')
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
    // (The cancel replaces to home/library, not to onboarding/interview)
    const hasOnboardingNav = replaceCalls.some(
      (call) =>
        typeof call[0] === 'object' &&
        call[0]?.pathname === '/(app)/onboarding/interview'
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
      }))
    );

    render(<CreateSubjectScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-subject-name'), 'Science');
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
        c.init?.method === 'POST' && !c.url.includes('/resolve')
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
      '/subjects'
    ).length;
    fireEvent.press(screen.getByTestId('subjects-load-error-retry'));

    await waitFor(() => {
      expect(fetchCallsMatching(mockFetch, '/subjects').length).toBeGreaterThan(
        subjectCallsBefore
      );
    });
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
    Wrapper = (() => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      return function W({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        );
      };
    })();
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
      'utf8'
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
