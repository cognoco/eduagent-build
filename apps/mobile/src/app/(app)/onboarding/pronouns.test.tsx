import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

let mockSearchParams: Record<string, string> = {
  subjectId: 'subject-1',
  subjectName: 'English',
  step: '2',
  totalSteps: '4',
};

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme */,
  () => ({
    useThemeColors: () => ({
      primary: '#6366f1',
      textSecondary: '#6b7280',
    }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps native Alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

let mockActiveProfile: {
  id: string;
  birthYear?: number;
  pronouns?: string | null;
} = {
  id: 'profile-1',
  birthYear: 2005,
  pronouns: null,
};

jest.mock(
  '../../../lib/profile' /* gc1-allow: profile context requires full provider tree */,
  () => ({
    ...jest.requireActual('../../../lib/profile'),
    useProfile: () => ({ activeProfile: mockActiveProfile }),
  }),
);

const mockUpdatePronounsMutate = jest.fn();
let mockUpdatePronounsIsPending = false;

jest.mock(
  '../../../hooks/use-onboarding-dimensions' /* gc1-allow: onboarding hook fetches from API via React Query */,
  () => ({
    useUpdatePronouns: () => ({
      mutate: mockUpdatePronounsMutate,
      isPending: mockUpdatePronounsIsPending,
    }),
  }),
);

const mockStartFirstCurriculumMutate = jest.fn();

jest.mock(
  '../../../hooks/use-sessions' /* gc1-allow: session hook fetches from API via React Query */,
  () => ({
    useStartFirstCurriculumSession: () => ({
      mutate: mockStartFirstCurriculumMutate,
      isPending: false,
    }),
  }),
);

// OnboardingStepIndicator stub
jest.mock(
  '../../../components/onboarding/OnboardingStepIndicator' /* gc1-allow: screen test only needs step indicator presence */,
  () => ({
    OnboardingStepIndicator: () => {
      const { View } = require('react-native');
      return <View testID="step-indicator" />;
    },
  }),
);

jest.mock(
  '../../../lib/onboarding-step-labels' /* gc1-allow: deterministic labels for route-param test */,
  () => ({
    getOnboardingStepLabels: () => ['Step 1', 'Step 2', 'Step 3', 'Step 4'],
  }),
);

// @eduagent/schemas PRONOUNS_PROMPT_MIN_AGE
jest.mock('@eduagent/schemas', () => ({
  ...jest.requireActual('@eduagent/schemas'),
  PRONOUNS_PROMPT_MIN_AGE: 13,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

const PronounsScreen = require('./pronouns').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PronounsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePronounsIsPending = false;
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005, // ~19 years old — above age gate
      pronouns: null,
    };
    mockSearchParams = {
      subjectId: 'subject-1',
      subjectName: 'English',
      step: '2',
      totalSteps: '4',
    };
  });

  it('renders pronoun options and skip/continue buttons', () => {
    const { getByTestId } = render(<PronounsScreen />);
    getByTestId('pronouns-option-she-her');
    getByTestId('pronouns-option-he-him');
    getByTestId('pronouns-option-they-them');
    getByTestId('pronouns-option-other');
    getByTestId('pronouns-continue');
    getByTestId('pronouns-skip');
  });

  it('selects she/her option when pressed', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-option-she-her'));
    // Continue should now be enabled
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeFalsy();
  });

  it('shows custom input when "Other" is selected', () => {
    const { getByTestId, queryByTestId } = render(<PronounsScreen />);
    // Initially no custom input
    expect(queryByTestId('pronouns-custom-input')).toBeNull();
    fireEvent.press(getByTestId('pronouns-option-other'));
    getByTestId('pronouns-custom-input');
  });

  it('continue is disabled when "Other" selected but no custom text', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-option-other'));
    // No text entered — continue should be disabled
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeTruthy();
  });

  it('continue is enabled after typing custom pronouns', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-option-other'));
    fireEvent.changeText(getByTestId('pronouns-custom-input'), 'ze/zir');
    expect(
      getByTestId('pronouns-continue').props.accessibilityState?.disabled,
    ).toBeFalsy();
  });

  it('calls updatePronouns.mutate with selected preset when continue pressed', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-option-she-her'));
    fireEvent.press(getByTestId('pronouns-continue'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: 'she/her' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('calls updatePronouns.mutate with custom text when other + custom text continue pressed', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-option-other'));
    fireEvent.changeText(getByTestId('pronouns-custom-input'), 'ze/zir');
    fireEvent.press(getByTestId('pronouns-continue'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: 'ze/zir' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('calls updatePronouns.mutate with null when skip pressed', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-skip'));
    expect(mockUpdatePronounsMutate).toHaveBeenCalledWith(
      { pronouns: null },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('shows error alert on save failure', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-option-she-her'));
    fireEvent.press(getByTestId('pronouns-continue'));
    // Trigger the onError callback
    const call = mockUpdatePronounsMutate.mock.calls[0];
    call[1].onError();
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it('navigates back to home when back button pressed', () => {
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-back'));
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/home',
    );
  });

  it('redirects to settings return path when returnTo=settings on skip', () => {
    mockSearchParams = { returnTo: 'settings' };
    const { getByTestId } = render(<PronounsScreen />);
    fireEvent.press(getByTestId('pronouns-skip'));
    // Trigger onSuccess
    const call = mockUpdatePronounsMutate.mock.calls[0];
    call[1].onSuccess();
    expect(mockGoBackOrReplace).toHaveBeenCalledWith(
      expect.anything(),
      '/(app)/more',
    );
  });

  it('age-gates below-13 learners (shows empty view, not form)', () => {
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: new Date().getFullYear() - 10, // 10 years old
      pronouns: null,
    };
    const { queryByTestId } = render(<PronounsScreen />);
    // The pronoun options should NOT be rendered for under-13
    expect(queryByTestId('pronouns-option-she-her')).toBeNull();
    expect(queryByTestId('pronouns-continue')).toBeNull();
  });

  it('pre-populates preset choice from existing profile pronouns', () => {
    mockActiveProfile = {
      id: 'profile-1',
      birthYear: 2005,
      pronouns: 'he/him',
    };
    const { getByTestId } = render(<PronounsScreen />);
    // he/him option should have selected state
    const heHim = getByTestId('pronouns-option-he-him');
    expect(heHim.props.accessibilityState?.selected).toBe(true);
  });
});
