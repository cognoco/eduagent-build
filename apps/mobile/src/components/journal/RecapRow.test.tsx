import { fireEvent, render, screen } from '@testing-library/react-native';
import type { RecapListItem } from '@eduagent/schemas';

import { RecapRow } from './RecapRow';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const recap = {
  recapId: 'b0000000-0000-4000-8000-000000000001',
  sessionId: 'b0000000-0000-4000-8000-000000000001',
  childProfileId: 'a0000000-0000-4000-8000-000000000001',
  childDisplayName: 'Ada',
  subjectId: 'c0000000-0000-4000-8000-000000000001',
  subjectName: 'Math',
  topicId: 'd0000000-0000-4000-8000-000000000001',
  topicTitle: 'Fractions',
  sessionType: 'learning',
  startedAt: '2026-06-14T09:00:00.000Z',
  endedAt: '2026-06-14T09:20:00.000Z',
  exchangeCount: 8,
  displayTitle: 'Fractions session',
  displaySummary: 'Worked on comparing fractions.',
  highlight: 'Compared thirds and sixths.',
  narrative: null,
  conversationPrompt: null,
  engagementSignal: null,
  nextTopicTitle: null,
  nextTopicReason: null,
  verifiedProof: null,
} satisfies RecapListItem;

describe('RecapRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the caller-owned return destination instead of silently forcing Journal', () => {
    render(<RecapRow recap={recap} returnTo="learner-home" />);

    fireEvent.press(screen.getByTestId(`journal-recap-row-${recap.recapId}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/session-summary/[sessionId]',
      params: {
        sessionId: recap.sessionId,
        subjectId: recap.subjectId,
        topicId: recap.topicId,
        returnTo: 'learner-home',
      },
    });
  });
});
