import type { InputMode } from '@eduagent/schemas';
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { QuotaExceededError } from '../../../lib/api-client';
import {
  fetchCallsMatching,
  extractJsonBody,
  type RoutedMockFetch,
} from '../../../test-utils/mock-api-routes';
import {
  renderScreen,
  createTestProfile,
  type RenderScreenResult,
} from '../../../test-utils/screen-render';
import SessionScreen from './index';

// Real session-recovery module; tests spy on readSessionRecoveryMarker as
// needed via jest.spyOn().
import * as sessionRecoveryModule from '../../../lib/session-recovery';

// Real analytics module; the homework-image-attach-dropped tests spy on the
// real `track` export via jest.spyOn (NOT a jest.mock of an internal module —
// GC1/GC6-clean). `track` calls Sentry.addBreadcrumb, which is globally mocked
// in test-setup.ts, so the real implementation runs without side effects.
import * as analyticsModule from '../../../lib/analytics';

const ACTIVE_PROFILE_ID = '10000000-0000-4000-8000-000000000001';
const CHILD_PROFILE_ID = '10000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '10000000-0000-4000-8000-000000000003';
const SUBJECT_ID = '20000000-0000-4000-8000-000000000001';
const SECOND_SUBJECT_ID = '20000000-0000-4000-8000-000000000002';
const TOPIC_ID = '40000000-0000-4000-8000-000000000001';
const SESSION_ID = '60000000-0000-4000-8000-000000000001';
const RESUMED_SESSION_ID = '60000000-0000-4000-8000-000000000002';
const REVIEW_SESSION_ID = '60000000-0000-4000-8000-000000000003';

type MockFeatureFlags = {
  COACH_BAND_ENABLED: boolean;
  MIC_IN_PILL_ENABLED: boolean;
  I18N_ENABLED: boolean;
  PREVIEW_ONBOARDING_ENABLED: boolean;
  PREVIEW_ENTRY_CTA_ENABLED: boolean;
  MODE_NAV_V0_ENABLED: boolean;
  MODE_NAV_V1_ENABLED: boolean;
  MODE_NAV_V2_ENABLED: boolean;
  ADULT_OWNER_GATE_ENABLED: boolean;
};

const getMockFeatureFlags = (): MockFeatureFlags =>
  (
    globalThis as typeof globalThis & {
      __sessionTestFeatureFlags: MockFeatureFlags;
    }
  ).__sessionTestFeatureFlags;

jest.mock(
  '../../../lib/feature-flags' /* gc1-allow: feature flag module boundary — suite mutates FEATURE_FLAGS via global test state */,
  () => {
    const featureFlags: MockFeatureFlags = {
      COACH_BAND_ENABLED: true,
      MIC_IN_PILL_ENABLED: true,
      I18N_ENABLED: true,
      PREVIEW_ONBOARDING_ENABLED: true,
      PREVIEW_ENTRY_CTA_ENABLED: false,
      MODE_NAV_V0_ENABLED: false,
      MODE_NAV_V1_ENABLED: false,
      MODE_NAV_V2_ENABLED: false,
      ADULT_OWNER_GATE_ENABLED: true,
    };
    (
      globalThis as typeof globalThis & {
        __sessionTestFeatureFlags: MockFeatureFlags;
      }
    ).__sessionTestFeatureFlags = featureFlags;

    return {
      ...jest.requireActual('../../../lib/feature-flags'),
      FEATURE_FLAGS: featureFlags,
    };
  },
);

// ---------------------------------------------------------------------------
// Boundary mocks (external / native runtime only)
// ---------------------------------------------------------------------------
//
// CONVERTED in this file (now run for REAL against the routed mock fetch /
// ProfileContext supplied by renderScreen): lib/profile, lib/api-client
// (transport only — real error classes via requireActual), use-settings
// (useCelebrationLevel / useNotifyParentSubscribe), use-api-reachability,
// use-network-status (real hook over a mocked netinfo native module),
// use-celebration, use-milestone-tracker, use-challenge-round (real raw-fetch
// hook; request assertions via fetchCallsMatching).
//
// KEPT as boundaries (cannot run under the harness): hooks/use-sessions —
// `useStreamMessage.stream` streams over XHR via streamSSEViaXHR, which
// BYPASSES useApiClient and cannot be intercepted by the routed mock fetch; the
// synthetic onChunk/onDone payloads (challengeRound / draftedNote / fallback)
// are this test's control surface. components/session — the ChatShell stub is
// the test's primary interaction surface; the real composer drags in native
// voice/keyboard input. Plus the usual native/expo modules below.

// lib/api-client: route the Hono RPC client through a shared mock fetch so real
// hooks (useCelebrationLevel, useChallengeRound's note path, useStreaks,
// useSubjects, classify/resolve, filing, celebrations, …) actually run, while
// keeping the REAL typed error classes (NotFoundError, QuotaExceededError, …)
// so the screen's instanceof / name checks behave like production.
//
// jest.mock() factories are hoisted above module-level code, so we create the
// routed fetch INSIDE the factory and expose it via global for the typed alias
// below (avoids the Temporal Dead Zone a top-level const would hit).
jest.mock(
  '../../../lib/api-client' /* gc1-allow: transport boundary — routed mock fetch drives real hooks; real error classes preserved via requireActual */,
  () => {
    const ACTIVE_PROFILE_ID = '10000000-0000-4000-8000-000000000001';
    const SUBJECT_ID = '20000000-0000-4000-8000-000000000001';
    const CURRICULUM_ID = '30000000-0000-4000-8000-000000000001';
    const TOPIC_ID = '40000000-0000-4000-8000-000000000001';
    const BOOK_ID = '50000000-0000-4000-8000-000000000001';
    const SESSION_ID = '60000000-0000-4000-8000-000000000001';
    const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z';
    const actual = jest.requireActual('../../../lib/api-client');
    const {
      createRoutedMockFetch,
    } = require('../../../test-utils/mock-api-routes');
    const { hc } = require('hono/client');
    // IMPORTANT: Routes are matched by url.includes(pattern) in insertion
    // order. More-specific patterns must come BEFORE general ones.
    const _mockFetch = createRoutedMockFetch({
      // use-api-reachability hits /v1/health directly via global fetch; a 200
      // keeps isApiReachable true.
      '/health': { ok: true },
      '/streaks': { streak: { longestStreak: 1 } },
      '/progress/overview': { totalTopicsCompleted: 0 },
      '/progress/inventory': {
        profileId: ACTIVE_PROFILE_ID,
        snapshotDate: '2026-01-01',
        global: {
          topicsAttempted: 0,
          topicsMastered: 0,
          vocabularyTotal: 0,
          vocabularyMastered: 0,
          totalSessions: 0,
          totalActiveMinutes: 0,
          totalWallClockMinutes: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
        subjects: [],
      },
      // Default: no active session for topic (null = empty 200).
      // Per-test overrides use mockFetch.setRoute('/progress/topic', ...)

      // --- Subject sub-resources (most specific first) ---
      '/subjects/classify': { candidates: [], needsConfirmation: false },
      '/subjects/resolve': {
        status: 'no_match',
        resolvedName: null,
        suggestions: [],
        displayMessage: 'Pick a subject that fits, or create your own.',
      },
      // useCreateNote (challenge-round saveNote path) must precede the
      // general /subjects route because routed mocks use first substring match.
      '/notes': {
        note: {
          id: '70000000-0000-4000-8000-000000000001',
          topicId: '11111111-1111-4111-8111-111111111111',
          sessionId: null,
          content:
            'Linear equations stay balanced when you do the same thing to both sides.',
          createdAt: FIXTURE_TIMESTAMP,
          updatedAt: FIXTURE_TIMESTAMP,
        },
      },
      '/curriculum': {
        curriculum: {
          id: CURRICULUM_ID,
          subjectId: SUBJECT_ID,
          version: 1,
          generatedAt: FIXTURE_TIMESTAMP,
          topics: [
            {
              id: TOPIC_ID,
              title: 'Topic 1',
              description: 'Desc',
              sortOrder: 0,
              relevance: 'core',
              estimatedMinutes: 30,
              bookId: BOOK_ID,
              skipped: false,
            },
          ],
        },
      },
      '/sessions': { session: { id: SESSION_ID } },
      '/homework-state': {
        metadata: { problemCount: 2, currentProblemIndex: 0, problems: [] },
      },
      '/subjects': {
        subjects: [
          {
            id: SUBJECT_ID,
            profileId: ACTIVE_PROFILE_ID,
            name: 'Math',
            status: 'active',
            pedagogyMode: 'socratic',
            createdAt: FIXTURE_TIMESTAMP,
            updatedAt: FIXTURE_TIMESTAMP,
          },
        ],
      },

      // useLearnerProfile reads data.profile (?.accommodationMode); null keeps
      // the query from returning undefined (React Query logs that as an error).
      '/learner-profile': { profile: null },
      // use-settings (real hooks now)
      '/celebration-level': { celebrationLevel: 'full' },
      '/notify-parent-subscribe': { sent: true, rateLimited: false },
      // use-challenge-round (real raw-fetch hook now). The screen consumes the
      // returned challengeRound state to dismiss the offer / drafted-note cards.
      '/challenge-round/accept': {
        challengeRound: {
          state: 'accepted',
          topicId: '11111111-1111-4111-8111-111111111111',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      },
      '/challenge-round/decline': {
        challengeRound: {
          state: 'declined',
          topicId: '11111111-1111-4111-8111-111111111111',
          offerCount: 1,
          declinedDontAskAgain: false,
          evaluations: [],
        },
      },
      '/challenge-round/abort': { challengeRound: undefined },
      // bookmarks/session must precede /bookmarks
      '/bookmarks/session': { bookmarks: [] },
      '/bookmarks': { bookmark: { id: 'bookmark-1' } },
      '/filing': { shelfId: 'shelf-1', bookId: BOOK_ID },
      // direct apiClient calls (use-session-streaming)
      '/celebrations/pending': { pendingCelebrations: [] },
      '/celebrations/seen': { ok: true },
    });
    // Expose for test assertions — accessed via the `mockFetch` alias below.
    (
      global as { __sessionTestMockFetch?: typeof _mockFetch }
    ).__sessionTestMockFetch = _mockFetch;
    return {
      ...actual,
      useApiClient: () => hc('http://localhost', { fetch: _mockFetch }),
    };
  },
);

// Typed alias so tests can call mockFetch.setRoute / fetchCallsMatching etc.
// Safe to read here because jest.mock factories run synchronously before
// any test code (and before this assignment).
const mockFetch = (global as { __sessionTestMockFetch?: RoutedMockFetch })
  .__sessionTestMockFetch!;

// clerk + netinfo are native/external boundaries the real hooks
// (use-challenge-round, useApiClient's useAuth, use-network-status) reach
// through once they run for real. (react-i18next is left to the global init in
// test-setup.ts — no per-file mock, matching the prior behavior of this suite.)
jest.mock(
  '@clerk/expo' /* gc1-allow: external auth provider — getToken is a network/native call */,
  () => ({
    useAuth: () => ({ getToken: jest.fn().mockResolvedValue('test-token') }),
  }),
);

jest.mock(
  '@react-native-community/netinfo' /* gc1-allow: native module — requires device connectivity APIs */,
  () => ({
    fetch: jest.fn().mockResolvedValue({ isInternetReachable: true }),
    addEventListener: jest.fn().mockReturnValue(() => undefined),
  }),
);

// ---------------------------------------------------------------------------
// renderScreen wrapper — provides a real ProfileContext (solo owner) + routed
// fetch (installGlobalFetch so use-api-reachability / use-challenge-round /
// useCreateNote raw-fetch and the streaming health checks resolve) + the same
// QueryClient defaults the old wrapper used.
// ---------------------------------------------------------------------------

const ACTIVE_PROFILE = createTestProfile({
  id: ACTIVE_PROFILE_ID,
  accountId: ACCOUNT_ID,
  displayName: 'Test Learner',
  isOwner: true,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
});

const CHILD_PROFILE = createTestProfile({
  id: CHILD_PROFILE_ID,
  accountId: ACCOUNT_ID,
  displayName: 'Child Learner',
  isOwner: false,
  hasPremiumLlm: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
});

let activeRender: RenderScreenResult | null = null;

function renderSessionScreen(profile = ACTIVE_PROFILE) {
  // installGlobalFetch:false — the routed fetch is wired into lib/api-client's
  // useApiClient above; we still install it globally for raw-fetch callers, so
  // pass the same instance via routedFetch and let the harness install it.
  activeRender = renderScreen(<SessionScreen />, {
    profile,
    routedFetch: mockFetch,
  });
  return activeRender.result;
}

// ---------------------------------------------------------------------------
// Session hook mocks (use-sessions stays mocked because useStreamMessage's
// `stream` runs over XHR via streamSSEViaXHR — it bypasses useApiClient and
// cannot be intercepted through the routed mock fetch. The synthetic
// onChunk/onDone payloads driven through mockStream (challengeRound /
// draftedNote / fallback / quota) are this suite's primary control surface, so
// the whole use-sessions mutation/query set is kept together for consistency.)
// ---------------------------------------------------------------------------

const mockStartSession = jest.fn();
const mockCloseSession = jest.fn();
const mockStream = jest.fn();
const mockClearContinuationDepth = jest.fn();
const mockRecordSystemPrompt = jest.fn();
const mockRecordSessionEvent = jest.fn();
const mockSetSessionInputMode = jest.fn();
const mockFlagSessionContent = jest.fn();
const mockSubmitSummary = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();

type TranscriptMockReturn = {
  data: null | {
    archived: false;
    session: {
      sessionId: string;
      exchangeCount: number;
      inputMode: string;
      milestonesReached: unknown[];
      verificationType?: unknown;
    };
    exchanges: Array<{
      role: string;
      content: string;
      timestamp: string;
      eventId: string;
      isSystemPrompt: boolean;
      escalationRung: number;
    }>;
  };
};
const mockUseSessionTranscript = jest.fn<TranscriptMockReturn, [string?]>(
  () => ({ data: null }),
);
jest.mock(
  '../../../hooks/use-sessions' /* gc1-allow: useStreamMessage streams over XHR (bypasses useApiClient); synthetic onDone payloads are the test control surface */,
  () => ({
    useSession: () => ({ data: null }),
    useStartSession: () => ({
      mutateAsync: mockStartSession,
    }),
    useCloseSession: () => ({
      mutateAsync: mockCloseSession,
    }),
    useStreamMessage: () => ({
      stream: mockStream,
    }),
    useClearContinuationDepth: () => ({
      mutateAsync: mockClearContinuationDepth,
      isPending: false,
    }),
    useSessionTranscript: (sessionId: string) =>
      mockUseSessionTranscript(sessionId),
    useRecordSystemPrompt: () => ({ mutateAsync: mockRecordSystemPrompt }),
    useRecordSessionEvent: () => ({ mutateAsync: mockRecordSessionEvent }),
    useSetSessionInputMode: () => ({ mutateAsync: mockSetSessionInputMode }),
    useFlagSessionContent: () => ({ mutateAsync: mockFlagSessionContent }),
    useSubmitSummary: () => ({
      mutateAsync: mockSubmitSummary,
      isPending: false,
      isError: false,
    }),
    useParkingLot: () => ({ data: [], isLoading: false }),
    useAddParkingLotItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
  }),
);

// use-challenge-round, use-settings, use-network-status, use-api-reachability,
// and use-celebration now run for REAL — see the boundary-mock note at the top
// of this file. Challenge-round request details are asserted via
// fetchCallsMatching.

// use-milestone-tracker: pattern-a targeted override (the canonical
// jest.requireActual spread keeps celebrationForReason / getMilestoneLabel real;
// only useMilestoneTracker is overridden). The override returns a deterministic
// trackExchange result and a hydrate spy. Carries NO gc1-allow — this is the
// sanctioned requireActual-override pattern, not a "can't run" boundary.
// Deferred (out of scope for this harness wave, tracked): full conversion to the
// real tracker. The real trackExchange evaluates every exchange and would fire
// celebration overlays across the entire send-message suite, so converting needs
// separate celebration-isolation work rather than a per-file edit here.
const mockTrackExchangeResult = { triggered: [] as string[], trackerState: {} };
const mockTrackExchange = jest.fn().mockReturnValue(mockTrackExchangeResult);
const mockHydrate = jest.fn();
const mockResetMilestones = jest.fn();
const mockMilestoneTracker = {
  milestonesReached: [] as string[],
  trackerState: {},
  trackExchange: mockTrackExchange,
  hydrate: mockHydrate,
  reset: mockResetMilestones,
};
jest.mock(
  '../../../hooks/use-milestone-tracker' /* gc1-allow: pattern-a conversion; wiring the full milestone step/animation chain in a session screen test would duplicate milestone-tracker.test.ts scope */,
  () => {
    const actual = jest.requireActual('../../../hooks/use-milestone-tracker');
    return {
      ...actual,
      useMilestoneTracker: () => mockMilestoneTracker,
    };
  },
);

// ---------------------------------------------------------------------------
// External / rendering mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-file-system', () => {
  const readAsStringAsync = jest.fn();
  (
    global as { __sessionTestReadAsStringAsync?: typeof readAsStringAsync }
  ).__sessionTestReadAsStringAsync = readAsStringAsync;
  // [WI-284] Provide cacheDirectory + documentDirectory so the
  // useImageBase64 allowlist accepts test fixture URIs that live under
  // these prefixes (see e.g. 'file:///cache/homework-photo.jpg').
  return {
    readAsStringAsync,
    cacheDirectory: 'file:///cache/',
    documentDirectory: 'file:///documents/',
  };
});

// [WI-284] The image-URI allowlist imports from `expo-file-system/legacy`
// (the only entry that exposes `cacheDirectory` / `documentDirectory` as
// plain strings in SDK 54+). Mirror the directory constants so the
// allowlist accepts the test fixture URIs that the session screen
// renders with.
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
}));

const mockReadAsStringAsync = (
  global as { __sessionTestReadAsStringAsync?: jest.Mock }
).__sessionTestReadAsStringAsync!;

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => callback(), [callback]);
  },
}));

jest.mock(
  '../../../components/session' /* gc1-allow: ChatShell stub is the test's primary interaction surface (manual-send-button, mock-input-mode); the real composer pulls in native voice/keyboard input that can't render in JSDOM */,
  () => ({
    ChatShell: ({
      subtitle,
      headerBelow,
      messages,
      inputAccessory,
      composerAccessory,
      belowInput,
      inputMode,
      isStreaming,
      onInputModeChange,
      onSend,
      onBackPress,
      renderMessageActions,
      rightAction,
      footer,
      inputDisabled,
      disabledReason,
      showDisabledBanner,
    }: {
      subtitle?: string;
      headerBelow?: React.ReactNode;
      messages?: Array<{ id: string; content: string }>;
      inputAccessory?: React.ReactNode;
      composerAccessory?: React.ReactNode;
      belowInput?: React.ReactNode;
      inputMode?: InputMode;
      isStreaming?: boolean;
      onInputModeChange?: (mode: InputMode) => void;
      onSend: (text: string) => void;
      onBackPress?: () => void;
      renderMessageActions?: (message: {
        id: string;
        role: string;
        content: string;
        eventId?: string;
        streaming?: boolean;
        isSystemPrompt?: boolean;
      }) => React.ReactNode;
      rightAction?: React.ReactNode;
      footer?: React.ReactNode;
      inputDisabled?: boolean;
      disabledReason?: string;
      showDisabledBanner?: boolean;
    }) => {
      const { View, Text, Pressable } = require('react-native');
      return (
        <View>
          <Text testID="session-subtitle">{subtitle}</Text>
          <Text testID="mock-input-mode">{inputMode ?? 'text'}</Text>
          <Text testID="mock-streaming-state">
            {isStreaming ? 'streaming' : 'idle'}
          </Text>
          {headerBelow}
          {inputDisabled && showDisabledBanner !== false ? (
            <View testID="input-disabled-banner">
              <Text>{disabledReason ?? 'Input is currently unavailable'}</Text>
            </View>
          ) : null}
          {(messages ?? []).map((message) => (
            <View key={message.id} testID={`mock-message-${message.id}`}>
              <Text>{message.content}</Text>
              {renderMessageActions?.(message as never)}
            </View>
          ))}
          {inputAccessory ? (
            <View testID="mock-input-accessory">{inputAccessory}</View>
          ) : null}
          {composerAccessory ? (
            <View testID="mock-composer-accessory">{composerAccessory}</View>
          ) : null}
          {belowInput ? (
            <View testID="mock-below-input">{belowInput}</View>
          ) : null}
          {rightAction}
          {footer}
          <Pressable
            testID="mock-set-voice-mode"
            onPress={() => onInputModeChange?.('voice')}
          >
            <Text>Voice mode</Text>
          </Pressable>
          <Pressable
            testID="mock-set-text-mode"
            onPress={() => onInputModeChange?.('text')}
          >
            <Text>Text mode</Text>
          </Pressable>
          <Pressable
            testID="manual-send-button"
            onPress={() => onSend('Solve 2x + 5 = 17')}
          >
            <Text>Send</Text>
          </Pressable>
          <Pressable
            testID="mentor-follow-up-button"
            onPress={() => onSend('Yes')}
          >
            <Text>Yes</Text>
          </Pressable>
          <Pressable testID="mock-back-button" onPress={() => onBackPress?.()}>
            <Text>Back</Text>
          </Pressable>
        </View>
      );
    },
    animateResponse: jest.fn(),
    getModeConfig: jest.fn().mockReturnValue({
      title: 'Homework',
      subtitle: 'Homework help',
      placeholder: 'Ask for help',
      showTimer: false,
      showQuestionCount: false,
    }),
    getOpeningMessage: jest
      .fn()
      .mockReturnValue('Let us tackle this worksheet.'),
    SessionTimer: () => null,
    MilestoneDots: () => null,
    QuestionCounter: () => null,
    LibraryPrompt: () => null,
    SessionInputModeToggle: () => null,
    GradedInputCard: ({ activity }: { activity: any }) => {
      const { View, Text } = require('react-native');
      return (
        <View testID="graded-input-card">
          <Text>{activity.gradedInput?.text}</Text>
          <Text>
            {activity.gradedInput?.comprehensionQuestions?.[0]?.prompt}
          </Text>
        </View>
      );
    },
    MeaningOutputCard: ({ activity }: { activity: any }) => {
      const { View, Text } = require('react-native');
      return (
        <View testID="meaning-output-card">
          <Text>{activity.meaningOutput?.prompt}</Text>
        </View>
      );
    },
    QuotaExceededCard: ({
      details,
      isOwner,
    }: {
      details: { reason: string };
      isOwner: boolean;
    }) => {
      const { View, Text } = require('react-native');
      return (
        <View testID="quota-exceeded-card">
          <Text>{isOwner ? 'Upgrade plan' : 'Ask your parent'}</Text>
          <Text>
            {details.reason === 'daily'
              ? "today's limit"
              : "this month's limit"}
          </Text>
        </View>
      );
    },
  }),
);

// session-recovery uses the real implementation — it just wraps SecureStore
// (already mocked in-memory below), so the empty-store default returns null
// naturally. Individual tests use jest.spyOn() on readSessionRecoveryMarker
// when they need to inject a marker (see hydrates-milestone-tracker test).

const secureStore: Record<string, string> = {};
jest.mock(
  '../../../lib/secure-storage' /* gc1-allow: wraps Expo SecureStore native module (unavailable in JSDOM); in-memory map stands in for device keychain */,
  () => ({
    getItemAsync: jest.fn((key: string) =>
      Promise.resolve(secureStore[key] ?? null),
    ),
    setItemAsync: jest.fn((key: string, value: string) => {
      secureStore[key] = value;
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      delete secureStore[key];
      return Promise.resolve();
    }),
    // [I-4] sanitizeSecureStoreKey is a pure string function — no mock needed,
    // but the module mock must export it or callers get "not a function".
    sanitizeSecureStoreKey: (raw: string) =>
      raw.replace(/[^a-zA-Z0-9._-]/g, '_'),
  }),
);
const mockReadSessionRecoveryMarker = jest.spyOn(
  sessionRecoveryModule,
  'readSessionRecoveryMarker',
);

// format-api-error uses real implementation. i18n is initialized globally in
// test-setup.ts, and no test asserts on specific error-display copy from this
// formatter — it's only invoked on stream failure paths where the produced
// text is rendered, not inspected.

// lib/profile now runs for real — renderScreen provides the ProfileContext.

// prettier-ignore
jest.mock('../../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ accent: '#0ea5e9', background: '#18181b', border: '#d4d4d8', muted: '#71717a', surface: '#ffffff', textInverse: '#ffffff', textPrimary: '#18181b', textSecondary: '#52525b' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

describe('SessionScreen homework flow', () => {
  async function flushAsyncWork(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    getMockFeatureFlags().MODE_NAV_V2_ENABLED = false;
    mockFetch.mockClear();
    mockUseSessionTranscript.mockReturnValue({ data: null });
    mockReadAsStringAsync.mockResolvedValue('base64-homework-image');
    // Default: no active session (null response body)
    mockFetch.setRoute('/progress/topic', null);
    // Clear SecureStore mock data
    Object.keys(secureStore).forEach((key) => delete secureStore[key]);
    let aiEventCount = 0;
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      setParams: mockSetParams,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
        {
          id: 'problem-2',
          text: 'Factor x^2 + 3x + 2',
          source: 'ocr',
        },
      ]),
    });
    mockStartSession.mockResolvedValue({
      session: { id: SESSION_ID },
    });
    mockStream.mockImplementation(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: {
          exchangeCount: number;
          escalationRung: number;
          aiEventId?: string;
        }) => void | Promise<void>,
      ) => {
        // Real SSE streams always emit at least one token before completion
        onChunk('Got it.');
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: `event-${++aiEventCount}`,
        });
      },
    );
    mockRecordSystemPrompt.mockResolvedValue({ ok: true });
    mockCloseSession.mockResolvedValue({ wallClockSeconds: 120 });
    mockSetSessionInputMode.mockResolvedValue({
      session: { id: SESSION_ID, inputMode: 'voice' },
    });
    mockFlagSessionContent.mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    });
    mockSubmitSummary.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: SESSION_ID,
        content: 'I learned that equations stay balanced on both sides.',
        aiFeedback: null,
        status: 'accepted',
        baseXp: 12,
        reflectionBonusXp: 6,
      },
    });
  });

  afterEach(() => {
    activeRender?.cleanup();
    activeRender = null;
    jest.useRealTimers();
  });

  describe('managed-child mentor birth moment', () => {
    const childMentorBirthKey = `mentorBirthSeen_${CHILD_PROFILE_ID}`;

    function useLearningRouteParams() {
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        mode: 'learning',
        subjectId: SUBJECT_ID,
        subjectName: 'Math',
        topicId: TOPIC_ID,
        topicName: 'Topic 1',
      });
    }

    it('auto-plays when a managed child first starts a learning session', async () => {
      useLearningRouteParams();

      const testScreen = renderSessionScreen(CHILD_PROFILE);
      await flushAsyncWork();

      fireEvent.press(testScreen.getByTestId('manual-send-button'));

      await waitFor(() => {
        expect(mockStartSession).toHaveBeenCalledWith(
          expect.objectContaining({ sessionType: 'learning' }),
        );
      });
      await waitFor(() => {
        testScreen.getByTestId('mentor-birth-overlay');
      });

      testScreen.getByTestId('mentor-birth-animation');
      expect(secureStore[childMentorBirthKey]).toBe('true');
    }, 15000);

    it('does not show or consume the child ceremony for an owner learning session', async () => {
      useLearningRouteParams();

      const testScreen = renderSessionScreen(ACTIVE_PROFILE);
      await flushAsyncWork();

      fireEvent.press(testScreen.getByTestId('manual-send-button'));

      await waitFor(() => {
        expect(mockStartSession).toHaveBeenCalledWith(
          expect.objectContaining({ sessionType: 'learning' }),
        );
      });
      expect(testScreen.queryByTestId('mentor-birth-overlay')).toBeNull();
      expect(secureStore[childMentorBirthKey]).toBeUndefined();
    }, 15000);

    it('is idempotent per child profile across app restarts', async () => {
      secureStore[childMentorBirthKey] = 'true';
      useLearningRouteParams();

      const testScreen = renderSessionScreen(CHILD_PROFILE);
      await flushAsyncWork();

      fireEvent.press(testScreen.getByTestId('manual-send-button'));

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1);
      });
      expect(testScreen.queryByTestId('mentor-birth-overlay')).toBeNull();
      expect(secureStore[childMentorBirthKey]).toBe('true');
    }, 15000);

    it('completes instantly under reduced motion and does not block the session stream', async () => {
      const reanimated = require('react-native-reanimated');
      const originalUseReducedMotion = reanimated.useReducedMotion;
      reanimated.useReducedMotion = () => true;

      try {
        useLearningRouteParams();

        const testScreen = renderSessionScreen(CHILD_PROFILE);
        await flushAsyncWork();

        fireEvent.press(testScreen.getByTestId('manual-send-button'));

        await waitFor(() => {
          expect(mockStream).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
          expect(secureStore[childMentorBirthKey]).toBe('true');
        });
        expect(testScreen.queryByTestId('mentor-birth-overlay')).toBeNull();
      } finally {
        reanimated.useReducedMotion = originalUseReducedMotion;
      }
    }, 15000);

    it('clears the auto-play surface within the three-second cap', async () => {
      useLearningRouteParams();

      const testScreen = renderSessionScreen(CHILD_PROFILE);
      await flushAsyncWork();

      fireEvent.press(testScreen.getByTestId('manual-send-button'));

      await waitFor(() => {
        testScreen.getByTestId('mentor-birth-overlay');
      });

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      expect(testScreen.queryByTestId('mentor-birth-overlay')).toBeNull();
    }, 15000);
  });

  it('starts a fresh session route from the session-expired primary action', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: TOPIC_ID,
      topicName: 'Linear equations',
      sessionId: 'expired-session',
    });
    const { NotFoundError } = require('../../../lib/api-client');
    mockUseSessionTranscript.mockReturnValue({
      data: null,
      error: new NotFoundError('Session not found'),
    } as never);

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('session-expired-new-session'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: SUBJECT_ID,
        subjectName: 'Math',
        topicId: TOPIC_ID,
        topicName: 'Linear equations',
      },
    });
  });

  it('[F-110] engages the session-expired UI for any error the boundary classifies as not-found, not only typed NotFoundError instances', () => {
    // sessionExpired is computed from
    // classifyApiError(transcript.error).category === 'not-found' rather
    // than a per-screen instanceof NotFoundError check. Seed a plain
    // status-404 error (no typed class): the boundary classifies it as
    // 'not-found', so the expired UI must engage. The old instanceof check
    // would have missed this shape entirely.
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: TOPIC_ID,
      topicName: 'Linear equations',
      sessionId: 'expired-session',
    });
    mockUseSessionTranscript.mockReturnValue({
      data: null,
      error: Object.assign(new Error('Session not found'), { status: 404 }),
    } as never);

    const testScreen = renderSessionScreen();

    expect(testScreen.getByTestId('session-expired-new-session')).toBeTruthy();
  });

  it('keeps homework progress in one session when moving to the next problem', async () => {
    const testScreen = renderSessionScreen();

    await act(async () => {
      fireEvent.press(testScreen.getByTestId('manual-send-button'));
    });
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    expect(
      testScreen.getByTestId('homework-problem-progress'),
    ).toHaveTextContent('Problem 1 of 2');

    fireEvent.press(testScreen.getByTestId('next-problem-chip'));

    await flushAsyncWork();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Factor x^2 + 3x + 2',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    expect(
      testScreen.getByTestId('homework-problem-progress'),
    ).toHaveTextContent('Problem 2 of 2');
  }, 15000);

  it('includes the capture source in homework metadata when homework starts from the gallery', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      captureSource: 'gallery',
      ocrText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
      ]),
    });

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            homework: expect.objectContaining({
              source: 'gallery',
              ocrText: 'Solve 2x + 5 = 17',
            }),
          }),
        }),
      );
    });

    // homework-state is now called through the hc() client → mockFetch
    await waitFor(() => {
      const hwCalls = fetchCallsMatching(mockFetch, '/homework-state');
      expect(hwCalls.length).toBeGreaterThan(0);
      const body = extractJsonBody<{ metadata: { source?: string } }>(
        hwCalls[0]?.init,
      );
      expect(body?.metadata).toMatchObject({ source: 'gallery' });
    });
  });

  it('auto-sends a camera homework image through the session stream', async () => {
    jest.useRealTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      imageUri: 'file:///cache/homework-photo.jpg',
      imageMimeType: 'image/jpeg',
      problemText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
      ]),
    });

    renderSessionScreen();

    await waitFor(() => {
      expect(mockReadAsStringAsync).toHaveBeenCalledWith(
        'file:///cache/homework-photo.jpg',
        { encoding: 'base64' },
      );
    });

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({
          imageBase64: 'base64-homework-image',
          imageMimeType: 'image/jpeg',
          idempotencyKey: expect.any(String),
        }),
      );
    });
  });

  // [HOMEWORK-06] Image conversion failure / timeout must NOT silently
  // degrade to text-only. The learner sees a system message explaining the
  // photo was dropped, and the auto-send proceeds with attachImage=false.
  it('surfaces a system message and sends text-only when image conversion fails', async () => {
    // Fake timers + explicit advance past the 500ms auto-send debounce. Under
    // real timers this test relied on the 500ms setTimeout firing inside
    // waitFor's 1000ms budget, which races (and intermittently fails) under
    // full-suite CPU load. Driving the debounce deterministically — mirroring
    // the timeout-branch test below and the [BUG-689] block — removes the flake.
    jest.useFakeTimers();
    mockReadAsStringAsync.mockRejectedValueOnce(new Error('read failed'));
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      imageUri: 'file:///cache/homework-photo.jpg',
      imageMimeType: 'image/jpeg',
      problemText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
      ]),
    });

    const testScreen = renderSessionScreen();

    // Flush the rejected-read microtask so imageAttachmentStatus -> 'failed',
    // then advance past the 500ms auto-send debounce so the fallback effect runs.
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(600);
    });

    // System message tells the learner the photo was dropped.
    await waitFor(() => {
      expect(
        testScreen.getByText(
          /couldn't open your photo, so I'm starting with the text only/i,
        ),
      ).toBeTruthy();
    });

    // Auto-send still proceeds, but WITHOUT the image attachment.
    await waitFor(() => {
      expect(mockStream).toHaveBeenCalled();
    });
    const streamCall = mockStream.mock.calls.find(
      (call: unknown[]) => call[0] === 'Solve 2x + 5 = 17',
    );
    expect(streamCall).toBeDefined();
    const streamOpts = streamCall?.[4] as
      | { imageBase64?: string; imageMimeType?: string }
      | undefined;
    expect(streamOpts?.imageBase64).toBeUndefined();
    expect(streamOpts?.imageMimeType).toBeUndefined();
  });

  // [HOMEWORK-08] On image-read failure the screen MUST emit a structured
  // `homework_image_attach_dropped` analytics event with reason='failed',
  // the capture source, and whether OCR text was present. Silent fallback is
  // banned by AGENTS.md "Fix Development Rules"; this pins the emission and
  // every field so a refactor can't drop the telemetry or a field.
  it('[HOMEWORK-08] emits homework_image_attach_dropped with reason/captureSource/hasOcrText when the image read fails', async () => {
    // Fake timers (the suite default) + explicit advance past the 500ms
    // auto-send debounce, mirroring the failed-case copy test above. Under
    // real timers this raced waitFor's 1000ms budget and failed intermittently
    // under full-suite CPU load.
    const trackSpy = jest.spyOn(analyticsModule, 'track');
    mockReadAsStringAsync.mockRejectedValueOnce(new Error('read failed'));
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      imageUri: 'file:///cache/homework-photo.jpg',
      imageMimeType: 'image/jpeg',
      captureSource: 'camera',
      ocrText: 'Solve 2x + 5 = 17',
      problemText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        { id: 'problem-1', text: 'Solve 2x + 5 = 17', source: 'ocr' },
      ]),
    });

    renderSessionScreen();

    // Flush the rejected-read microtask so imageAttachmentStatus -> 'failed',
    // then advance past the 500ms auto-send debounce so the fallback effect runs.
    await act(async () => {
      await Promise.resolve();
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(trackSpy).toHaveBeenCalledWith('homework_image_attach_dropped', {
        reason: 'failed',
        captureSource: 'camera',
        hasOcrText: true,
      });
    });

    trackSpy.mockRestore();
  });

  // [HOMEWORK-08] The 2.5s image-read timeout is a DISTINCT branch from a read
  // rejection: it surfaces timeout-specific copy ("took too long to load") and
  // emits the analytics event with reason='timeout'. Without this test the
  // timeout path (useImageBase64 IMAGE_READ_TIMEOUT_MS) is uncovered and could
  // silently regress to the failed copy or drop the distinct reason.
  it('[HOMEWORK-08] surfaces timeout-specific copy and emits reason=timeout when the image read exceeds the 2.5s budget', async () => {
    jest.useFakeTimers();
    const trackSpy = jest.spyOn(analyticsModule, 'track');
    // Never resolves — forces useImageBase64 into the 2.5s timeout branch.
    mockReadAsStringAsync.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      imageUri: 'file:///cache/homework-photo.jpg',
      imageMimeType: 'image/jpeg',
      captureSource: 'gallery',
      problemText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        { id: 'problem-1', text: 'Solve 2x + 5 = 17', source: 'ocr' },
      ]),
    });

    const testScreen = renderSessionScreen();

    // Advance past the 2.5s read budget so imageAttachmentStatus -> 'timeout',
    // then past the 500ms auto-send debounce so the fallback effect runs.
    await act(async () => {
      jest.advanceTimersByTime(2_600);
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(
        testScreen.getByText(
          /took too long to load, so I'm starting with the text only/i,
        ),
      ).toBeTruthy();
    });
    expect(trackSpy).toHaveBeenCalledWith('homework_image_attach_dropped', {
      reason: 'timeout',
      captureSource: 'gallery',
      hasOcrText: false,
    });

    trackSpy.mockRestore();
    // The mocked read never resolves; clear any queued fake-timer callbacks
    // before the suite afterEach swaps back to real timers, so no pending
    // debounce bleeds into the next test (e.g. the WI-859 resolution flow).
    jest.clearAllTimers();
  });

  // ---------------------------------------------------------------------
  // [WI-284 / WI-87 review] When the deep-link imageUri falls outside the
  // allowed cache/document sandbox, useImageBase64 refuses to read it
  // (status='failed'). The session screen must NOT pass the rejected
  // URI through to the stream-attachment options OR to anything that
  // would render it inline (ChatShell's <Image source>). Pin both the
  // read-side rejection and the auto-send opts gate so a future refactor
  // can't silently flatten safeImageUri back to the raw imageUri.
  // ---------------------------------------------------------------------

  it('[WI-87] does not stream homework image when imageUri is outside the cache/document sandbox', async () => {
    jest.useRealTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      // Outside the mocked cacheDirectory/documentDirectory roots — the
      // allowlist rejects this exactly like a deep-link `file:///etc/hosts`.
      imageUri: 'file:///etc/hosts',
      imageMimeType: 'image/jpeg',
      problemText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        {
          id: 'problem-1',
          text: 'Solve 2x + 5 = 17',
          source: 'ocr',
        },
      ]),
    });

    renderSessionScreen();

    await waitFor(() => {
      expect(mockStream).toHaveBeenCalled();
    });

    // The allowlist rejected the URI, so readAsStringAsync MUST NOT have
    // been called for the attacker URI. (The whole point of WI-284.)
    expect(mockReadAsStringAsync).not.toHaveBeenCalledWith(
      'file:///etc/hosts',
      expect.anything(),
    );

    // The stream call MUST NOT include the rejected imageUri in any form
    // — neither as base64 in the LLM payload nor as a URI that would
    // later render via ChatShell's <Image source>. mockStream's 5th arg
    // is the opts object; assert imageBase64 is absent (no read) and
    // assert the call's full payload contains nothing pointing at the
    // attacker URI.
    const streamCall = mockStream.mock.calls.find(
      (call) => call?.[0] === 'Solve 2x + 5 = 17',
    );
    expect(streamCall).toBeDefined();
    const opts = streamCall?.[4] as Record<string, unknown> | undefined;
    expect(opts).toBeDefined();
    expect(opts?.imageBase64).toBeUndefined();
    // Whichever shape the attachment options take, none of them may
    // carry the attacker-controlled URI through to the chat-render path.
    expect(JSON.stringify(opts ?? {})).not.toContain('file:///etc/hosts');
  });

  it('hides contextual chips on greeting but shows session tools above the composer', () => {
    const testScreen = renderSessionScreen();

    // Contextual quick chips should NOT appear before any user message
    expect(testScreen.queryByText('I know this')).toBeNull();
    expect(testScreen.queryByText('Explain differently')).toBeNull();
    expect(testScreen.queryByText('Too easy')).toBeNull();
    expect(testScreen.queryByText('Example')).toBeNull();

    // Session tool chips live in the compact composer toolbar so they can
    // share a row with voice playback controls instead of adding another band.
    const composerAccessory = testScreen.getByTestId('mock-composer-accessory');
    within(composerAccessory).getByText('Switch topic');
    expect(within(composerAccessory).queryByText('Park it')).toBeNull();
    const inputAccessory = testScreen.getByTestId('mock-input-accessory');
    expect(within(inputAccessory).queryByText('Switch topic')).toBeNull();
    expect(testScreen.queryByTestId('mock-below-input')).toBeNull();
  });

  it('records quick chips and learner feedback with follow-up prompts', async () => {
    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
      expect(mockStream).toHaveBeenCalledWith(
        'Solve 2x + 5 = 17',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    fireEvent.press(testScreen.getByTestId('quick-chip-too_easy'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'quick_action',
          content: 'too_easy',
          metadata: expect.objectContaining({
            chip: 'too_easy',
          }),
        }),
      );
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        kind: 'quick_chip',
        chip: 'too_easy',
      });
      expect(mockStream).toHaveBeenCalledWith(
        'That feels too easy. Can you make it more challenging?',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });
    testScreen.getByTestId('session-confirmation-toast');

    fireEvent.press(
      testScreen.getByTestId('message-feedback-not-helpful-event-2'),
    );
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_feedback',
          content: 'not_helpful',
          metadata: {
            value: 'not_helpful',
            eventId: 'event-2',
          },
        }),
      );
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        kind: 'message_feedback',
        action: 'not_helpful',
        eventId: 'event-2',
      });
      expect(mockStream).toHaveBeenCalledWith(
        'Can you explain that differently?',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });

    fireEvent.press(
      testScreen.getByTestId('message-feedback-incorrect-event-3'),
    );
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockRecordSessionEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'user_feedback',
          content: 'incorrect',
          metadata: {
            value: 'incorrect',
            eventId: 'event-3',
          },
        }),
      );
      expect(mockFlagSessionContent).toHaveBeenCalledWith({
        eventId: 'event-3',
        reason: 'Learner marked response as incorrect',
      });
      expect(mockRecordSystemPrompt).toHaveBeenCalledWith({
        kind: 'message_feedback',
        action: 'incorrect',
        eventId: 'event-3',
      });
      expect(mockStream).toHaveBeenCalledWith(
        'I think that answer is incorrect. Can you correct it and explain what changed?',
        expect.any(Function),
        expect.any(Function),
        SESSION_ID,
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
    });
  });

  it('renders a challenge offer from the typed done payload and accepts it', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Linear equations',
    });
    // /challenge-round/accept is routed to return state:'accepted' (see the
    // lib/api-client mock above), so the real useChallengeRound.accept() runs.
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('You are ready for a challenge.');
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: 'event-challenge-offer',
          challengeRound: {
            state: 'offered',
            topicId: '11111111-1111-4111-8111-111111111111',
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
          challengeOffer: { pitch: 'Want a harder round?' },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('challenge-offer-card');
      testScreen.getByText('Want a harder round?');
    });

    fireEvent.press(testScreen.getByTestId('challenge-offer-accept'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(
        fetchCallsMatching(mockFetch, '/challenge-round/accept').length,
      ).toBe(1);
      expect(testScreen.queryByTestId('challenge-offer-card')).toBeNull();
    });
  });

  it('renders graded input from the typed language-learning done payload', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Ordering drinks',
    });
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('Read this, then answer in the chat.');
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: 'event-graded-input',
          languageLearning: {
            strand: 'meaning_input',
            activityType: 'graded_input',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: [],
            gradedInput: {
              type: 'graded_input',
              modality: 'reading',
              cefrLevel: 'A1',
              knownWordRatioTarget: 0.85,
              knownWordEstimate: 0.82,
              targetWords: ['agua'],
              text: 'Tengo agua en la mesa.',
              comprehensionQuestions: [
                {
                  id: 'q1',
                  prompt: 'What is on the table?',
                  answerHint: 'agua',
                },
              ],
              audioEnabled: true,
            },
          },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('graded-input-card');
      testScreen.getByText('Tengo agua en la mesa.');
      testScreen.getByText('What is on the table?');
    });
  });

  it('renders a meaning-output task from the typed language-learning done payload [WI-1756]', async () => {
    // Regression guard: languageLearning used to be dropped whenever
    // gradedInput was absent (WI-1756 AC1) — this payload has no gradedInput
    // key at all, only meaningOutput. Runs through the real (unmocked)
    // useSessionStreaming hook, so this also proves the state-path fix
    // end-to-end, not just in hook isolation.
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Spanish',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Ordering drinks',
    });
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('Tell me about your day.');
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: 'event-meaning-output',
          languageLearning: {
            strand: 'meaning_output',
            activityType: 'free_response',
            modality: 'text',
            targetWords: ['agua'],
            targetGrammar: [],
            meaningOutput: {
              type: 'meaning_output',
              taskType: 'personal_answer',
              communicativeGoal:
                'Share a true or imagined personal answer someone could respond to.',
              prompt:
                'Answer personally in one or two short sentences using agua.',
              responseMode: 'short_answer',
              targetWords: ['agua'],
              targetGrammar: [],
              retryExpectation: 'retry_after_feedback',
              correctionExpectation: 'meaning_first_then_form',
            },
          },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('meaning-output-card');
      testScreen.getByText(
        'Answer personally in one or two short sentences using agua.',
      );
    });
  });

  it('declines and permanently dismisses a typed challenge offer', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Linear equations',
    });
    // /challenge-round/decline is routed (see lib/api-client mock) so the real
    // useChallengeRound.decline(dontAskAgain) runs; we assert the dontAskAgain
    // flag via the request body instead of a spy.
    mockStream.mockImplementation(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('You are ready for a challenge.');
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: 'event-challenge-offer',
          challengeRound: {
            state: 'offered',
            topicId: '11111111-1111-4111-8111-111111111111',
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
          challengeOffer: { pitch: 'Want a harder round?' },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();
    await waitFor(() => {
      testScreen.getByTestId('challenge-offer-card');
    });

    fireEvent.press(testScreen.getByTestId('challenge-offer-decline'));
    await flushAsyncWork();
    await waitFor(() => {
      const calls = fetchCallsMatching(mockFetch, '/challenge-round/decline');
      expect(calls).toHaveLength(1);
      expect(
        extractJsonBody<{ dontAskAgain: boolean }>(calls[0]?.init)
          ?.dontAskAgain,
      ).toBe(false);
    });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();
    await waitFor(() => {
      testScreen.getByTestId('challenge-offer-card');
    });

    fireEvent.press(testScreen.getByTestId('challenge-offer-dont-ask'));
    await flushAsyncWork();
    await waitFor(() => {
      const calls = fetchCallsMatching(mockFetch, '/challenge-round/decline');
      expect(calls).toHaveLength(2);
      expect(
        extractJsonBody<{ dontAskAgain: boolean }>(calls[1]?.init)
          ?.dontAskAgain,
      ).toBe(true);
    });
  });

  it('renders the active challenge banner and hides the Too easy chip', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Linear equations',
    });
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('That explanation is solid.');
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: 'event-challenge-active',
          challengeRound: {
            state: 'active',
            topicId: '11111111-1111-4111-8111-111111111111',
            questionIndex: 1,
            totalQuestions: 3,
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('challenge-round-banner');
      testScreen.getByText('Question 2 of 3');
      expect(testScreen.queryByTestId('quick-chip-too_easy')).toBeNull();
      testScreen.getByTestId('quick-chip-know_this');
    });
  });

  it('renders a drafted note from the typed done payload and saves it', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Linear equations',
    });
    // /notes is routed to return the saved note (see lib/api-client mock), so
    // the real useChallengeRound.saveNote → useCreateNote mutation runs; the
    // note content is asserted from the request body.
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('Here is your note draft.');
        await onDone({
          exchangeCount: 3,
          escalationRung: 1,
          aiEventId: 'event-challenge-draft',
          challengeRound: {
            state: 'drafting',
            topicId: '11111111-1111-4111-8111-111111111111',
            questionIndex: 2,
            totalQuestions: 3,
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
          draftedNote: {
            id: 'draft-1',
            body: 'Linear equations stay balanced when you do the same thing to both sides.',
            sourceAnswerEventIds: ['answer-event-1'],
          },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('drafted-note-review');
      testScreen.getByText(
        'Linear equations stay balanced when you do the same thing to both sides.',
      );
    });

    fireEvent.press(testScreen.getByTestId('drafted-note-save'));
    await flushAsyncWork();

    await waitFor(() => {
      const noteCalls = fetchCallsMatching(mockFetch, '/notes');
      expect(noteCalls.length).toBeGreaterThan(0);
      expect(
        extractJsonBody<{ content: string }>(noteCalls[0]?.init)?.content,
      ).toBe(
        'Linear equations stay balanced when you do the same thing to both sides.',
      );
      expect(testScreen.queryByTestId('drafted-note-review')).toBeNull();
    });
  });

  it('skips a drafted note without writing it to /notes', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Linear equations',
    });
    // Skip path: handleSkipDraftedNote clears state + calls the no-op
    // challengeRoundActions.skipNote(); it must NOT POST to /notes.
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('Here is your note draft.');
        await onDone({
          exchangeCount: 3,
          escalationRung: 1,
          aiEventId: 'event-challenge-draft-skip',
          challengeRound: {
            state: 'drafting',
            topicId: '11111111-1111-4111-8111-111111111111',
            questionIndex: 2,
            totalQuestions: 3,
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
          draftedNote: {
            id: 'draft-skip-1',
            body: 'Linear equations stay balanced when you do the same thing to both sides.',
            sourceAnswerEventIds: ['answer-event-1'],
          },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('drafted-note-review');
    });

    fireEvent.press(testScreen.getByTestId('drafted-note-skip'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(testScreen.queryByTestId('drafted-note-review')).toBeNull();
    });
    expect(fetchCallsMatching(mockFetch, '/notes')).toHaveLength(0);
  });

  it('renders the fallback composer when the server emits an ungrounded draft (body=null)', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      topicId: '11111111-1111-4111-8111-111111111111',
      topicName: 'Linear equations',
    });
    // Server-side buildValidatedDraft falls back to body=null + fallbackPrompt
    // when validateNoteDraft rejects the LLM draft (grounding failed). The
    // mobile surface must show the write-your-own composer, not an LLM note.
    mockStream.mockImplementationOnce(
      async (
        _message: string,
        onChunk: (value: string) => void,
        onDone: (result: Record<string, unknown>) => void | Promise<void>,
      ) => {
        onChunk('Write a note in your own words.');
        await onDone({
          exchangeCount: 3,
          escalationRung: 1,
          aiEventId: 'event-challenge-draft-fallback',
          challengeRound: {
            state: 'drafting',
            topicId: '11111111-1111-4111-8111-111111111111',
            questionIndex: 2,
            totalQuestions: 3,
            offerCount: 1,
            declinedDontAskAgain: false,
            evaluations: [],
          },
          draftedNote: {
            id: 'draft-fallback-1',
            body: null,
            sourceAnswerEventIds: [],
            fallbackPrompt:
              'Write a short note in your own words from the parts you can explain clearly.',
          },
        });
      },
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      testScreen.getByTestId('drafted-note-review');
      testScreen.getByTestId('drafted-note-fallback-prompt');
      testScreen.getByText(
        'Write a short note in your own words from the parts you can explain clearly.',
      );
    });
    // body=null starts the review in editing mode (composer), not a read-only
    // preview of an LLM-authored note.
    testScreen.getByTestId('drafted-note-input');
    expect(testScreen.queryByTestId('drafted-note-preview')).toBeNull();
  });

  it('hydrates milestone tracker state from the recovery marker when resuming', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: SESSION_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
    });
    mockReadSessionRecoveryMarker.mockResolvedValueOnce({
      sessionId: SESSION_ID,
      updatedAt: new Date().toISOString(),
      milestoneTracker: {
        milestonesReached: ['polar_star'],
        consecutiveLowRung: 1,
        longMessageCount: 0,
        awaitingPersistence: false,
        previousRung: 2,
      },
    });

    renderSessionScreen();

    await waitFor(() => {
      expect(mockReadSessionRecoveryMarker).toHaveBeenCalled();
      expect(mockHydrate).toHaveBeenCalled();
    });
  });

  it('renders prior chat history when resuming a session with cached transcript', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: SESSION_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Geography',
      topicId: TOPIC_ID,
      topicName: 'Continents',
    });
    mockUseSessionTranscript.mockReturnValue({
      data: {
        archived: false,
        session: {
          sessionId: SESSION_ID,
          exchangeCount: 2,
          inputMode: 'text',
          milestonesReached: [],
          verificationType: undefined,
        },
        exchanges: [
          {
            role: 'user',
            content: 'Tell me about Africa',
            timestamp: '2026-04-25T10:00:00Z',
            eventId: 'evt-1',
            isSystemPrompt: false,
            escalationRung: 1,
          },
          {
            role: 'assistant',
            content: 'Africa is the second-largest continent.',
            timestamp: '2026-04-25T10:00:05Z',
            eventId: 'evt-2',
            isSystemPrompt: false,
            escalationRung: 1,
          },
        ],
      },
    });

    const testScreen = renderSessionScreen();
    await flushAsyncWork();

    await waitFor(() => {
      expect(testScreen.queryByText('Tell me about Africa')).toBeTruthy();
      expect(
        testScreen.queryByText('Africa is the second-largest continent.'),
      ).toBeTruthy();
    });
  });

  it('preserves Mentor opener context while its allocated session ID is backfilled into the focused route', async () => {
    const mentorOpener = 'Why do apples fall toward the ground?';
    const recoveryKey = `session-recovery-marker-${ACTIVE_PROFILE_ID}`;
    let routeParams: {
      mode: string;
      entrySource: string;
      rawInput: string;
      topicId: string;
      topicName: string;
      sessionId?: string;
    } = {
      mode: 'freeform',
      entrySource: 'mentor',
      rawInput: mentorOpener,
      topicId: TOPIC_ID,
      topicName: 'Gravity',
    };
    let releaseOpener!: () => void;
    const openerMayFinish = new Promise<void>((resolve) => {
      releaseOpener = resolve;
    });

    getMockFeatureFlags().MODE_NAV_V2_ENABLED = true;
    (useLocalSearchParams as jest.Mock).mockImplementation(() => routeParams);
    mockFetch.setRoute(
      '/subjects/classify',
      (_url: string, init?: RequestInit) => {
        const body = extractJsonBody<{ text: string }>(init);
        return body?.text === mentorOpener
          ? {
              candidates: [
                {
                  subjectId: SECOND_SUBJECT_ID,
                  subjectName: 'Physics',
                  confidence: 0.98,
                },
              ],
              needsConfirmation: false,
            }
          : {
              candidates: [],
              needsConfirmation: false,
              suggestedSubjectName: null,
            };
      },
    );
    mockStream
      .mockImplementationOnce(async (_message, onChunk, onDone) => {
        onChunk('Gravity pulls them toward Earth.');
        await openerMayFinish;
        await onDone({
          exchangeCount: 1,
          escalationRung: 1,
          aiEventId: 'mentor-opener-reply',
        });
      })
      .mockImplementationOnce(async (_message, onChunk, onDone) => {
        onChunk('Yes — and that same force keeps the Moon in orbit.');
        await onDone({
          exchangeCount: 2,
          escalationRung: 1,
          aiEventId: 'mentor-follow-up-reply',
        });
      });

    const testScreen = renderSessionScreen();

    await waitFor(() => {
      expect({
        streamCalls: mockStream.mock.calls.length,
        classificationCalls: fetchCallsMatching(mockFetch, '/subjects/classify')
          .length,
        setParamsCalls: mockSetParams.mock.calls,
      }).toEqual({
        streamCalls: 1,
        classificationCalls: 1,
        setParamsCalls: [[{ sessionId: SESSION_ID }]],
      });
    });

    routeParams = { ...routeParams, sessionId: SESSION_ID };
    await act(async () => {
      testScreen.rerender(<SessionScreen />);
      await Promise.resolve();
    });
    const streamingStateAfterBackfill = testScreen.getByTestId(
      'mock-streaming-state',
    ).props.children;

    await act(async () => {
      releaseOpener();
      await openerMayFinish;
    });
    await waitFor(() => {
      expect(secureStore[recoveryKey]).toBeDefined();
      expect(testScreen.getByTestId('mock-streaming-state')).toHaveTextContent(
        'idle',
      );
    });

    fireEvent.press(testScreen.getByTestId('mentor-follow-up-button'));
    await waitFor(() => {
      expect(mockStream).toHaveBeenCalledTimes(2);
      expect(JSON.parse(secureStore[recoveryKey] ?? '{}')).toMatchObject({
        sessionId: SESSION_ID,
        topicId: TOPIC_ID,
      });
    });

    const classificationTexts = fetchCallsMatching(
      mockFetch,
      '/subjects/classify',
    ).map(({ init }) => extractJsonBody<{ text: string }>(init)?.text);
    const sessionCreation = fetchCallsMatching(
      mockFetch,
      `/subjects/${SECOND_SUBJECT_ID}/sessions`,
    )[0];
    const recoveryMarker = JSON.parse(secureStore[recoveryKey] ?? '{}') as {
      subjectId?: string;
      topicId?: string;
    };

    expect(
      extractJsonBody<{
        rawInput?: string;
        subjectId?: string;
        topicId?: string;
      }>(sessionCreation?.init),
    ).toMatchObject({
      rawInput: mentorOpener,
      subjectId: SECOND_SUBJECT_ID,
      topicId: TOPIC_ID,
    });
    expect({
      streamingStateAfterBackfill,
      classificationTexts,
      streamedMessages: mockStream.mock.calls.map(([message]) => message),
      streamedSessionIds: mockStream.mock.calls.map((call) => call[3]),
      recoveryContext: {
        subjectId: recoveryMarker.subjectId,
        topicId: recoveryMarker.topicId,
      },
    }).toEqual({
      streamingStateAfterBackfill: 'streaming',
      classificationTexts: [mentorOpener],
      streamedMessages: [mentorOpener, 'Yes'],
      streamedSessionIds: [SESSION_ID, SESSION_ID],
      recoveryContext: {
        subjectId: SECOND_SUBJECT_ID,
        topicId: TOPIC_ID,
      },
    });
  });

  it('auto-resumes the active session for a learning topic when no sessionId is in the route', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Geography',
      topicId: TOPIC_ID,
      topicName: 'Continents',
    });
    // Return active session for this topic via fetch boundary
    mockFetch.setRoute('/progress/topic', { sessionId: RESUMED_SESSION_ID });

    renderSessionScreen();
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockSetParams).toHaveBeenCalledWith({
        sessionId: RESUMED_SESSION_ID,
      });
    });
  });

  it('does not auto-resume over a local turn when the learner sends before lookup settles', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Geography',
      topicId: TOPIC_ID,
      topicName: 'Continents',
    });
    mockFetch.setRoute('/progress/topic', { sessionId: RESUMED_SESSION_ID });

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
      expect(testScreen.queryByText('Solve 2x + 5 = 17')).toBeTruthy();
    });
    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('does not auto-resume when entering a topic in review mode', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'review',
      subjectId: SUBJECT_ID,
      subjectName: 'Geography',
      topicId: TOPIC_ID,
      topicName: 'Continents',
    });
    // Even if the topic has an active session, review mode should NOT resume it.
    mockFetch.setRoute('/progress/topic', {
      sessionId: REVIEW_SESSION_ID,
    });

    renderSessionScreen();
    await flushAsyncWork();

    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('does not call setParams when the topic has no active session', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      subjectId: SUBJECT_ID,
      subjectName: 'Geography',
      topicId: TOPIC_ID,
      topicName: 'Continents',
    });
    // Default route already returns null for /progress/topic

    renderSessionScreen();
    await flushAsyncWork();

    expect(mockSetParams).not.toHaveBeenCalled();
  });

  it('shows the topic header and opens the topic switcher when "Change topic" is tapped', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
      sessionId: SESSION_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Geography',
      topicId: TOPIC_ID,
      topicName: 'Continents',
    });
    mockUseSessionTranscript.mockReturnValue({
      data: {
        archived: false,
        session: {
          sessionId: SESSION_ID,
          exchangeCount: 0,
          inputMode: 'text',
          milestonesReached: [],
        },
        exchanges: [],
      },
    });

    const testScreen = renderSessionScreen();
    await flushAsyncWork();

    const header = testScreen.getByTestId('session-topic-header');
    within(header).getByText(/Continents/);
    within(header).getByText(/Topic:/);

    fireEvent.press(testScreen.getByTestId('session-topic-header-change'));
    await flushAsyncWork();

    testScreen.getByTestId(`switch-topic-${TOPIC_ID}`);
  });

  it('persists input-mode changes once the session exists', async () => {
    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    await waitFor(() => {
      expect(mockStartSession).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(testScreen.getByTestId('mock-set-voice-mode'));

    await waitFor(() => {
      expect(mockSetSessionInputMode).toHaveBeenCalledWith({
        inputMode: 'voice',
      });
    });
  });

  it('prompts for subject resolution before starting a session when classification is ambiguous', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    // Override classify to return ambiguous candidates
    mockFetch.setRoute('/subjects/classify', {
      candidates: [
        { subjectId: SUBJECT_ID, subjectName: 'Math', confidence: 0.62 },
        {
          subjectId: SECOND_SUBJECT_ID,
          subjectName: 'Physics',
          confidence: 0.58,
        },
      ],
      needsConfirmation: true,
    });

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    testScreen.getByTestId('session-subject-resolution');
    expect(testScreen.getAllByText(/math or physics/i).length).toBeGreaterThan(
      0,
    );

    expect(testScreen.queryByTestId('input-disabled-banner')).toBeNull();
    expect(testScreen.queryByText('Switch topic')).toBeNull();
    expect(testScreen.queryByText('Park it')).toBeNull();

    expect(mockStartSession).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(
        testScreen.getByTestId(`subject-resolution-${SECOND_SUBJECT_ID}`),
      );
    });
    await flushAsyncWork();

    // After picking the second subject, use-session-streaming calls
    // apiClient.subjects[':subjectId'].sessions.$post via the hc() client,
    // which routes through mockFetch to that subject's sessions endpoint.
    const startCalls = fetchCallsMatching(
      mockFetch,
      `/subjects/${SECOND_SUBJECT_ID}/sessions`,
    );
    expect(startCalls.length).toBeGreaterThan(0);
    const body = extractJsonBody<{ subjectId: string; inputMode: string }>(
      startCalls[0]?.init,
    );
    expect(body).toMatchObject({
      subjectId: SECOND_SUBJECT_ID,
      inputMode: 'text',
      rawInput: 'Solve 2x + 5 = 17',
    });

    expect(mockStream).toHaveBeenCalledWith(
      'Solve 2x + 5 = 17',
      expect.any(Function),
      expect.any(Function),
      SESSION_ID,
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    await flushAsyncWork();
    testScreen.unmount();
  });

  it('shows "+ New subject" escape hatch when classification fails [BUG-234]', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    // Return a 500 error for classify
    mockFetch.setRoute(
      '/subjects/classify',
      new Response(JSON.stringify({ error: 'Network error' }), { status: 500 }),
    );

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));

    // When classify fails and subjects haven't loaded yet, the screen falls
    // back to the resolve API flow which shows the "Create a new subject"
    // button (subject-resolution-create-new) as the zero-candidates escape hatch.
    await waitFor(() => {
      testScreen.getByTestId('subject-resolution-create-new');
    });

    expect(mockStartSession).not.toHaveBeenCalled();
    testScreen.unmount();
  });

  it('shows "+ New subject" chip alongside candidates when classification is ambiguous [BUG-234]', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    mockFetch.setRoute('/subjects/classify', {
      candidates: [
        { subjectId: SUBJECT_ID, subjectName: 'Math', confidence: 0.5 },
      ],
      needsConfirmation: true,
    });

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    testScreen.getByTestId('session-subject-resolution');
    testScreen.getByTestId('subject-resolution-new');
    testScreen.getByText('+ New subject');
    testScreen.unmount();
  });

  // [WI-859 / QA-04] No enrolled subjects: the classifier returns nothing to
  // pick and the learner has no subjects to fall back to. The screen must reach
  // the resolve-backed create-new escape hatch instead of silently starting a
  // session against a phantom subject. Deterministic — classify + resolve are
  // both stubbed via mockFetch, no live model involved.
  it('[WI-859] shows the create-new escape hatch when the learner has no enrolled subjects', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'learning',
    });
    // Learner has zero enrolled subjects.
    mockFetch.setRoute('/subjects', { subjects: [] });
    // Classifier can't match anything and offers no suggestion.
    mockFetch.setRoute('/subjects/classify', {
      candidates: [],
      needsConfirmation: true,
      suggestedSubjectName: null,
    });
    // Resolve returns rich suggestions so the picker has create options.
    mockFetch.setRoute('/subjects/resolve', {
      status: 'no_match',
      resolvedName: null,
      suggestions: [
        { name: 'Astronomy', description: 'Study of celestial objects' },
      ],
      displayMessage: 'Pick a subject that fits, or create your own.',
    });

    const testScreen = renderSessionScreen();

    fireEvent.press(testScreen.getByTestId('manual-send-button'));
    await flushAsyncWork();

    // The resolve fallback was consulted with the learner's text…
    expect(
      fetchCallsMatching(mockFetch, '/subjects/resolve').length,
    ).toBeGreaterThan(0);
    // …and the resolution surface opens with the resolve-backed suggestion plus
    // the new-subject option, not a silent session start against no subject.
    testScreen.getByTestId('session-subject-resolution');
    testScreen.getByTestId('subject-resolution-resolve-Astronomy');
    testScreen.getByTestId('subject-resolution-new');
    expect(mockStartSession).not.toHaveBeenCalled();
    testScreen.unmount();
  });

  // ─── T23: V2 mentor-homework round-trip (single conversation thread) ───────
  // When a homework photo is captured from the Mentor bar (entrySource=mentor +
  // returnTo=mentor), the learner lands back in the session thread with the
  // captured image as their own image bubble, followed by two deterministic
  // first-response actions — "help me solve this" / "check my answer" — and NO
  // subject-picking preamble. returnTo=mentor returns to the Mentor tab.
  describe('V2 mentor-homework round-trip (T23)', () => {
    const MENTOR_HOMEWORK_PARAMS = {
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      entrySource: 'mentor',
      returnTo: 'mentor',
      imageUri: 'file:///cache/homework-photo.jpg',
      imageMimeType: 'image/jpeg',
      problemText: 'Solve 2x + 5 = 17',
      homeworkProblems: JSON.stringify([
        { id: 'problem-1', text: 'Solve 2x + 5 = 17', source: 'ocr' },
      ]),
    };

    it('renders the captured image as a learner bubble with deterministic help/check buttons as the first in-thread response, with no subject preamble', async () => {
      getMockFeatureFlags().MODE_NAV_V2_ENABLED = true;
      (useLocalSearchParams as jest.Mock).mockReturnValue(
        MENTOR_HOMEWORK_PARAMS,
      );

      const testScreen = renderSessionScreen();

      // Give the screen its initial async cycle + advance past the auto-send
      // debounce window so we can prove the auto-send is DEFERRED (the buttons
      // are the first actionable response, not an LLM/subject turn).
      await act(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(700);
      });

      // The captured image renders as the learner's image bubble in-thread,
      // with both deterministic buttons.
      const accessory = testScreen.getByTestId('mock-input-accessory');
      within(accessory).getByTestId('homework-image-bubble');
      within(accessory).getByTestId('homework-help-me-solve');
      within(accessory).getByTestId('homework-check-my-answer');

      // First actionable response has NO subject-picking preamble and no
      // tutoring turn has started yet — the buttons ARE the first response.
      expect(testScreen.queryByTestId('session-subject-resolution')).toBeNull();
      expect(mockStream).not.toHaveBeenCalled();
      // The standard homework chips are suppressed so the two deterministic
      // buttons are the only first response.
      expect(testScreen.queryByTestId('homework-mode-help-me')).toBeNull();

      testScreen.unmount();
    }, 15000);

    it('starts the tutoring turn with the chosen homework mode after the learner taps "help me solve"', async () => {
      getMockFeatureFlags().MODE_NAV_V2_ENABLED = true;
      (useLocalSearchParams as jest.Mock).mockReturnValue(
        MENTOR_HOMEWORK_PARAMS,
      );

      const testScreen = renderSessionScreen();

      await act(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(700);
      });

      // No turn before the learner picks a deterministic action.
      expect(mockStream).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(testScreen.getByTestId('homework-help-me-solve'));
      });
      // Picking a mode re-enables the (previously deferred) auto-send.
      await act(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(700);
      });
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalledWith(
          'Solve 2x + 5 = 17',
          expect.any(Function),
          expect.any(Function),
          SESSION_ID,
          expect.objectContaining({ homeworkMode: 'help_me' }),
        );
      });

      // Once consumed, the deterministic first-response block is gone.
      expect(testScreen.queryByTestId('homework-help-me-solve')).toBeNull();

      testScreen.unmount();
    }, 15000);

    it('[WI-2234] invalidates only the active profile Now feed before returning to Mentor', async () => {
      getMockFeatureFlags().MODE_NAV_V2_ENABLED = true;
      (useLocalSearchParams as jest.Mock).mockReturnValue(
        MENTOR_HOMEWORK_PARAMS,
      );

      const testScreen = renderSessionScreen();
      const invalidateSpy = jest.spyOn(
        activeRender!.queryClient,
        'invalidateQueries',
      );

      await act(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(700);
      });

      await act(async () => {
        fireEvent.press(testScreen.getByTestId('mock-back-button'));
      });

      expect(mockReplace).toHaveBeenCalledWith('/(app)/mentor');
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['now-feed', ACTIVE_PROFILE_ID],
        exact: true,
      });
      expect(invalidateSpy.mock.invocationCallOrder[0]).toBeLessThan(
        mockReplace.mock.invocationCallOrder[0]!,
      );

      testScreen.unmount();
    }, 15000);

    it('leaves the legacy homework flow unchanged when the V2 frame is off (no deterministic first-response)', async () => {
      getMockFeatureFlags().MODE_NAV_V2_ENABLED = false;
      (useLocalSearchParams as jest.Mock).mockReturnValue({
        ...MENTOR_HOMEWORK_PARAMS,
        entrySource: undefined,
        returnTo: undefined,
      });

      const testScreen = renderSessionScreen();

      await act(async () => {
        await Promise.resolve();
        jest.advanceTimersByTime(700);
      });
      await flushAsyncWork();

      // No V2 deterministic first-response block.
      expect(testScreen.queryByTestId('homework-image-bubble')).toBeNull();
      expect(testScreen.queryByTestId('homework-help-me-solve')).toBeNull();

      // Legacy auto-send still fires the OCR'd problem.
      await waitFor(() => {
        expect(mockStream).toHaveBeenCalledWith(
          'Solve 2x + 5 = 17',
          expect.any(Function),
          expect.any(Function),
          SESSION_ID,
          expect.objectContaining({ idempotencyKey: expect.any(String) }),
        );
      });

      testScreen.unmount();
    }, 15000);
  });

  describe('post-session filing prompt', () => {
    /**
     * Helper: renders a freeform session, sends a message to start it,
     * then triggers end-session via the Alert "End Session" callback.
     */
    async function renderAndCloseFreeformSession(
      routeParams: Record<string, string> = { mode: 'freeform' },
    ) {
      // Use freeform mode (no subjectId) so close follows the freeform path.
      (useLocalSearchParams as jest.Mock).mockReturnValue(routeParams);
      // Classify resolves without confirmation needed
      mockFetch.setRoute('/subjects/classify', {
        candidates: [
          { subjectId: SUBJECT_ID, subjectName: 'Math', confidence: 0.95 },
        ],
        needsConfirmation: false,
        resolvedSubjectId: SUBJECT_ID,
      });

      // Spy on Alert.alert so we can invoke the "End Session" button callback
      const alertSpy = jest.spyOn(Alert, 'alert');

      const testScreen = renderSessionScreen();

      await waitFor(() => {
        expect(
          fetchCallsMatching(mockFetch, '/progress/inventory'),
        ).toHaveLength(1);
      });
      await flushAsyncWork();

      // Send a message to start the session and get exchangeCount > 0
      fireEvent.press(testScreen.getByTestId('manual-send-button'));
      await flushAsyncWork();

      await waitFor(() => {
        expect(mockStream).toHaveBeenCalledTimes(1);
      });

      // The end-session button should now be visible (exchangeCount > 0)
      const endButton = testScreen.getByTestId('end-session-button');
      fireEvent.press(endButton);

      // Alert.alert was called with "End session?" — invoke the "End Session" callback
      // BUG-352 added a 4th options arg { cancelable, onDismiss }
      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'End session?',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ cancelable: true }),
        );
      });

      const endSessionCall = alertSpy.mock.calls.find(
        ([title]) => title === 'End session?',
      );
      const buttons = endSessionCall![2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const doneButton = buttons.find((b) => b.text === 'End Session');
      expect(doneButton).toBeTruthy();

      // Invoke the "End Session" callback
      await act(async () => {
        doneButton?.onPress?.();
      });
      await flushAsyncWork();
      await waitFor(() => {
        expect(mockCloseSession).toHaveBeenCalled();
      });

      // Advance timers to let fetchFastCelebrations polling resolve. Bounded
      // advance (the polling window is 3s of 500ms ticks) rather than
      // runAllTimers() — the now-real useApiReachability installs a
      // self-re-arming 60s interval, so runAllTimers() would loop forever.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3500);
      });
      await flushAsyncWork();

      alertSpy.mockRestore();

      return testScreen;
    }

    it('navigates to summary without filing prompt when a freeform session is closed', async () => {
      const testScreen = await renderAndCloseFreeformSession();

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: `/session-summary/${SESSION_ID}`,
          }),
        );
      });

      // Freeform sessions do not auto-file at exit (W2 #11 is homework-only).
      expect(fetchCallsMatching(mockFetch, '/filing')).toHaveLength(0);
      testScreen.unmount();
    }, 15000);

    it('renders the V2 first-session Mentor wrap-up and saves Your Words through the summary boundary', async () => {
      getMockFeatureFlags().MODE_NAV_V2_ENABLED = true;
      const testScreen = await renderAndCloseFreeformSession({
        mode: 'freeform',
        entrySource: 'mentor',
        returnTo: 'mentor',
      });

      await waitFor(() => {
        testScreen.getByTestId('first-session-wrap-up');
      });

      expect(mockReplace).not.toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: `/session-summary/${SESSION_ID}`,
        }),
      );
      expect(
        testScreen.getByText(/I'll remember what you write here/),
      ).toBeTruthy();

      const reflection =
        'I learned that balancing equations keeps both sides equal.';
      fireEvent.changeText(
        testScreen.getByTestId('first-session-reflection-input'),
        reflection,
      );
      fireEvent.press(testScreen.getByTestId('first-session-wrap-submit'));

      await waitFor(() => {
        expect(mockSubmitSummary).toHaveBeenCalledWith({
          content: reflection,
        });
      });

      // The reward receipt renders on a state update that settles a tick after
      // mockSubmitSummary resolves, so await its appearance rather than reading
      // synchronously (a bare get here flakes under parallel-suite timing).
      await waitFor(() => {
        testScreen.getByTestId('mentor-reward-receipt');
      });
      expect(testScreen.getByTestId('mentor-reward-value').props.children).toBe(
        '1.5x / 18',
      );
      expect(
        testScreen.getAllByText(/You chose the next step/).length,
      ).toBeGreaterThan(0);
      testScreen.unmount();
    }, 15000);

    it('keeps later V2 Mentor sessions on the existing summary path', async () => {
      getMockFeatureFlags().MODE_NAV_V2_ENABLED = true;
      mockFetch.setRoute('/progress/inventory', {
        profileId: ACTIVE_PROFILE_ID,
        snapshotDate: '2026-01-01',
        global: {
          topicsAttempted: 0,
          topicsMastered: 0,
          vocabularyTotal: 0,
          vocabularyMastered: 0,
          totalSessions: 1,
          totalActiveMinutes: 0,
          totalWallClockMinutes: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
        subjects: [],
      });

      const testScreen = await renderAndCloseFreeformSession({
        mode: 'freeform',
        entrySource: 'mentor',
        returnTo: 'mentor',
      });

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: `/session-summary/${SESSION_ID}`,
          }),
        );
      });
      expect(testScreen.queryByTestId('first-session-wrap-up')).toBeNull();
      testScreen.unmount();
    }, 15000);
  });
});

describe('voice mode persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockClear();
    mockUseSessionTranscript.mockReturnValue({ data: null });
    mockFetch.setRoute('/progress/topic', null);
    Object.keys(secureStore).forEach((key) => delete secureStore[key]);
    (useRouter as jest.Mock).mockReturnValue({
      replace: mockReplace,
      setParams: mockSetParams,
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      mode: 'homework',
      subjectId: SUBJECT_ID,
      subjectName: 'Math',
      homeworkProblems: JSON.stringify([
        { id: 'problem-1', text: 'Solve 2x + 5 = 17', source: 'ocr' },
      ]),
    });
    mockStartSession.mockResolvedValue({ session: { id: SESSION_ID } });
    mockStream.mockImplementation(
      async (
        _msg: string,
        onChunk: (value: string) => void,
        onDone: (r: {
          exchangeCount: number;
          escalationRung: number;
        }) => void | Promise<void>,
      ) => {
        onChunk('Got it.');
        await onDone({ exchangeCount: 1, escalationRung: 1 });
      },
    );
    mockRecordSystemPrompt.mockResolvedValue({ ok: true });
    mockSetSessionInputMode.mockResolvedValue({
      session: { id: SESSION_ID, inputMode: 'voice' },
    });
    mockFlagSessionContent.mockResolvedValue({
      message: 'Content flagged for review. Thank you!',
    });
  });

  afterEach(() => {
    activeRender?.cleanup();
    activeRender = null;
    jest.useRealTimers();
  });

  it('defaults to voice when SecureStore has voice preference', async () => {
    secureStore[`voice-input-mode-${ACTIVE_PROFILE_ID}`] = 'voice';
    const { getByTestId } = renderSessionScreen();
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('voice');
    });
  });

  it('defaults to text when SecureStore has no preference', async () => {
    const { getByTestId } = renderSessionScreen();
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('text');
    });
  });

  it('persists voice preference when mode changes to voice', async () => {
    const { getByTestId } = renderSessionScreen();
    await act(async () => {
      fireEvent.press(getByTestId('mock-set-voice-mode'));
    });
    await waitFor(() => {
      expect(secureStore[`voice-input-mode-${ACTIVE_PROFILE_ID}`]).toBe(
        'voice',
      );
    });
  });

  it('persists text preference when mode changes to text', async () => {
    secureStore[`voice-input-mode-${ACTIVE_PROFILE_ID}`] = 'voice';
    const { getByTestId } = renderSessionScreen();
    // Wait for initial voice mode to load
    await waitFor(() => {
      expect(getByTestId('mock-input-mode').props.children).toBe('voice');
    });
    await act(async () => {
      fireEvent.press(getByTestId('mock-set-text-mode'));
    });
    await waitFor(() => {
      expect(secureStore[`voice-input-mode-${ACTIVE_PROFILE_ID}`]).toBe('text');
    });
  });

  it('shows QuotaExceededCard and disables input when stream returns 402', async () => {
    const details = {
      tier: 'free' as const,
      effectiveAccessTier: 'free' as const,
      quotaModel: 'per-profile' as const,
      profileRole: 'owner' as const,
      reason: 'monthly' as const,
      resetsAt: '2026-05-27T01:00:00.000Z',
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: null,
      usedToday: 0,
      topUpCreditsRemaining: 0,
      upgradeOptions: [],
    };
    mockStream.mockRejectedValueOnce(
      new QuotaExceededError('Quota exceeded', details),
    );

    const testScreen = renderSessionScreen();

    // Flush startup async work
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Trigger a message send using the mock send button
    fireEvent.press(testScreen.getByTestId('manual-send-button'));

    await waitFor(() => {
      testScreen.getByTestId('quota-exceeded-card');
      testScreen.getByTestId('input-disabled-banner');
    });
  });

  it('renders child quota actions and disables input when sessionIsOwner is false', async () => {
    const details = {
      tier: 'plus' as const,
      effectiveAccessTier: 'plus' as const,
      quotaModel: 'per-profile' as const,
      profileRole: 'child' as const,
      reason: 'monthly' as const,
      resetsAt: '2026-05-27T01:00:00.000Z',
      monthlyLimit: 100,
      usedThisMonth: 100,
      dailyLimit: 10,
      usedToday: 1,
      topUpCreditsRemaining: 500,
      upgradeOptions: [],
    };
    mockStream.mockRejectedValueOnce(
      new QuotaExceededError('Quota exceeded', details),
    );

    const testScreen = renderSessionScreen(CHILD_PROFILE);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.press(testScreen.getByTestId('manual-send-button'));

    await waitFor(() => {
      testScreen.getByTestId('quota-exceeded-card');
      testScreen.getByTestId('input-disabled-banner');
      testScreen.getByTestId('quota-notify-parent-btn');
      testScreen.getByTestId('quota-go-home-btn');
    });
    expect(testScreen.queryByText('Upgrade plan')).toBeNull();
  });
});
