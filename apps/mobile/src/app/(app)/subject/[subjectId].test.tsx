import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({
    subjectId: 'subject-1',
    subjectName: 'Mathematics',
  }),
  useRouter: () => ({ back: mockBack }),
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
    expect(mockUpdateAnalogyDomain).toHaveBeenCalledWith('sports');
  });

  it('calls updateAnalogyDomain with null when "No preference" pressed', () => {
    mockAnalogyDomain = 'cooking';

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('analogy-domain-none'));
    expect(mockUpdateAnalogyDomain).toHaveBeenCalledWith(null);
  });

  it('shows loading state when data is loading', () => {
    mockIsLoading = true;

    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('analogy-domain-loading')).toBeTruthy();
  });

  it('navigates back when back button is pressed', () => {
    render(<SubjectSettingsScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('subject-settings-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
