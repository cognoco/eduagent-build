import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
    subjectName: 'Mathematics',
  }),
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const MockSafeAreaView = View;
  MockSafeAreaView.displayName = 'SafeAreaView';
  const MockSafeAreaProvider = ({ children }: { children: React.ReactNode }) =>
    children;
  MockSafeAreaProvider.displayName = 'SafeAreaProvider';
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: MockSafeAreaView,
    SafeAreaProvider: MockSafeAreaProvider,
    SafeAreaInsetsContext: { Consumer: View },
    initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 } },
  };
});

const mockUpdateAnalogyDomain = jest.fn();
let mockAnalogyDomain: string | null = null;
let mockIsLoading = false;
let mockIsPending = false;

jest.mock('../../../hooks/use-settings', () => ({
  useAnalogyDomain: () => ({
    data: mockAnalogyDomain,
    isLoading: mockIsLoading,
  }),
  useUpdateAnalogyDomain: () => ({
    mutate: mockUpdateAnalogyDomain,
    isPending: mockIsPending,
  }),
}));

let mockSubjects: Array<Record<string, unknown>> | undefined = [
  { id: 'subject-1', name: 'Mathematics', pedagogyMode: 'standard' },
];
let mockSubjectsLoading = false;

jest.mock('../../../hooks/use-subjects', () => ({
  useSubjects: () => ({
    data: mockSubjects,
    isLoading: mockSubjectsLoading,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const SubjectSettingsScreen = require('./[subjectId]').default;

describe('SubjectSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalogyDomain = null;
    mockIsLoading = false;
    mockIsPending = false;
    mockSubjects = [
      { id: 'subject-1', name: 'Mathematics', pedagogyMode: 'standard' },
    ];
    mockSubjectsLoading = false;
  });

  it('renders the subject name in the header', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Mathematics')).toBeTruthy();
  });

  it('renders the Analogy Preference section header', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Analogy Preference')).toBeTruthy();
  });

  it('renders the description text', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByText(/Choose a domain for analogies/)).toBeTruthy();
  });

  it('renders the analogy domain picker', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('analogy-domain-picker')).toBeTruthy();
  });

  it('renders all domain options', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('analogy-domain-none')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-cooking')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-sports')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-building')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-music')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-nature')).toBeTruthy();
    expect(screen.getByTestId('analogy-domain-gaming')).toBeTruthy();
  });

  it('shows "No preference" as active when analogyDomain is null', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);
  });

  it('shows selected domain as active', () => {
    mockAnalogyDomain = 'cooking';

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    const activeTexts = screen.getAllByText('Active');
    expect(activeTexts).toHaveLength(1);

    const cookingOption = screen.getByTestId('analogy-domain-cooking');
    const hasActiveInCooking = activeTexts.some((textEl) => {
      let node = textEl.parent;
      while (node) {
        if (node === cookingOption) return true;
        node = node.parent;
      }
      return false;
    });
    expect(hasActiveInCooking).toBe(true);
  });

  it('calls updateAnalogyDomain when a domain is selected', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('analogy-domain-sports'));
    // UX-DE-L9: mutate now includes onError to surface failures
    expect(mockUpdateAnalogyDomain).toHaveBeenCalledWith(
      'sports',
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('calls updateAnalogyDomain with null when "No preference" pressed', () => {
    mockAnalogyDomain = 'cooking';

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('analogy-domain-none'));
    expect(mockUpdateAnalogyDomain).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  it('shows loading state when data is loading', () => {
    mockIsLoading = true;

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('analogy-domain-loading')).toBeTruthy();
  });

  it('returns to the subject shelf when back button is pressed', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('subject-settings-back'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/shelf/[subjectId]',
      params: { subjectId: 'subject-1' },
    });
  });

  // [BUG-939] Analogy Preference is meaningless for language subjects
  // (pedagogyMode 'four_strands') because the four-strands pedagogy teaches
  // vocabulary directly without analogy framing.
  describe('language subject handling [BUG-939]', () => {
    it('hides Analogy Preference for four_strands subjects', () => {
      mockSubjects = [
        { id: 'subject-1', name: 'Italian', pedagogyMode: 'four_strands' },
      ];

      render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

      expect(screen.queryByText('Analogy Preference')).toBeNull();
      expect(screen.queryByTestId('analogy-domain-picker')).toBeNull();
      expect(screen.getByTestId('subject-settings-language-empty')).toBeTruthy();
    });

    it('shows Analogy Preference for non-language subjects', () => {
      mockSubjects = [
        { id: 'subject-1', name: 'Mathematics', pedagogyMode: 'standard' },
      ];

      render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

      expect(screen.getByText('Analogy Preference')).toBeTruthy();
      expect(screen.queryByTestId('subject-settings-language-empty')).toBeNull();
    });

    it('still shows the back button on the language-subject empty state', () => {
      mockSubjects = [
        { id: 'subject-1', name: 'Italian', pedagogyMode: 'four_strands' },
      ];

      render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

      // Empty state must not be a dead-end — back button is reachable.
      expect(screen.getByTestId('subject-settings-back')).toBeTruthy();
    });
  });
});
