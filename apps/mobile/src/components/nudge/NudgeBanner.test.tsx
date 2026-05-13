import { fireEvent, render, screen } from '@testing-library/react-native';

import { NudgeBanner } from './NudgeBanner';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const mockMarkAllRead = jest.fn();

jest.mock(
  '../../hooks/use-nudges' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useUnreadNudges: () => mockUnreadNudges(),
    useMarkAllNudgesRead: () => ({ mutate: mockMarkAllRead }),
  }),
);

jest.mock(
  '../../hooks/use-consent' /* gc1-allow: external hook boundary — wraps TanStack query that requires QueryClient */,
  () => ({
    useConsentStatus: () => mockConsentStatus(),
  }),
);

jest.mock(
  '../../lib/profile' /* gc1-allow: profile context requires full ProfileProvider setup */,
  () => ({
    useProfile: () => mockProfile(),
  }),
);

let mockUnreadNudgesData: Array<{
  id: string;
  fromDisplayName: string;
  template: string;
}> = [];
let mockActiveProfileConsentStatus: string | null | undefined = null;
let mockConsentStatusData: { consentStatus: string } | undefined = undefined;

function mockUnreadNudges() {
  return { data: mockUnreadNudgesData };
}

function mockConsentStatus() {
  return { data: mockConsentStatusData };
}

function mockProfile() {
  return {
    activeProfile: {
      consentStatus: mockActiveProfileConsentStatus,
    },
  };
}

const NUDGE_A = {
  id: 'nudge-1',
  fromDisplayName: 'Dad',
  template: 'you_got_this',
};

const NUDGE_B = {
  id: 'nudge-2',
  fromDisplayName: 'Mum',
  template: 'proud_of_you',
};

describe('NudgeBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnreadNudgesData = [];
    mockActiveProfileConsentStatus = null;
    mockConsentStatusData = undefined;
  });

  it('returns null when no unread nudges', () => {
    mockUnreadNudgesData = [];
    render(<NudgeBanner />);

    expect(screen.queryByTestId('nudge-banner')).toBeNull();
  });

  it('returns null when consent is not CONSENTED and consentStatus exists', () => {
    mockUnreadNudgesData = [NUDGE_A];
    mockActiveProfileConsentStatus = 'PENDING';
    mockConsentStatusData = undefined;

    render(<NudgeBanner />);

    expect(screen.queryByTestId('nudge-banner')).toBeNull();
  });

  it('renders banner with first nudge fromDisplayName when unread nudges exist', () => {
    mockUnreadNudgesData = [NUDGE_A];
    mockActiveProfileConsentStatus = null;

    render(<NudgeBanner />);

    screen.getByTestId('nudge-banner');
    screen.getByText('Dad sent you a nudge');
  });

  it('shows badge count when more than 1 unread nudge', () => {
    mockUnreadNudgesData = [NUDGE_A, NUDGE_B];
    mockActiveProfileConsentStatus = null;

    render(<NudgeBanner />);

    screen.getByText('2 new');
  });

  it('does not show badge when exactly 1 unread nudge', () => {
    mockUnreadNudgesData = [NUDGE_A];
    mockActiveProfileConsentStatus = null;

    render(<NudgeBanner />);

    expect(screen.queryByText(/new/)).toBeNull();
  });

  it('pressing banner opens NudgeUnreadModal', () => {
    mockUnreadNudgesData = [NUDGE_A];
    mockActiveProfileConsentStatus = null;

    render(<NudgeBanner />);

    fireEvent.press(screen.getByTestId('nudge-banner'));

    screen.getByTestId('nudge-unread-dismiss');
  });
});
