// ---------------------------------------------------------------------------
// Daily Plan Service Tests
// ---------------------------------------------------------------------------

jest.mock('./retention-data', () => ({
  getProfileOverdueCount: jest.fn(),
}));

jest.mock('./progress', () => ({
  getContinueSuggestion: jest.fn(),
}));

jest.mock('./streaks', () => ({
  getStreakData: jest.fn(),
}));

jest.mock('./profile', () => ({
  resolveProfileRole: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import { getDailyPlan } from './daily-plan';
import { getProfileOverdueCount } from './retention-data';
import { getContinueSuggestion } from './progress';
import { getStreakData } from './streaks';
import { resolveProfileRole } from './profile';

function mockDb(): Database {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ timezone: 'Europe/Prague' }]),
          }),
        }),
      }),
    }),
  } as unknown as Database;
}

const BASE_STREAK = {
  currentStreak: 0,
  longestStreak: 0,
  lastActivityDate: null,
  gracePeriodStartDate: null,
  isOnGracePeriod: false,
  graceDaysRemaining: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getStreakData as jest.Mock).mockResolvedValue(BASE_STREAK);
  (getContinueSuggestion as jest.Mock).mockResolvedValue(null);
  (getProfileOverdueCount as jest.Mock).mockResolvedValue({
    overdueCount: 0,
    topTopicIds: [],
  });
  (resolveProfileRole as jest.Mock).mockResolvedValue('self_learner');
});

describe('getDailyPlan', () => {
  it('returns review item when overdue cards exist', async () => {
    (getProfileOverdueCount as jest.Mock).mockResolvedValue({
      overdueCount: 3,
      topTopicIds: ['t1', 't2'],
    });

    const plan = await getDailyPlan(mockDb(), 'profile-1');

    const reviewItem = plan.items.find((i) => i.type === 'review');
    expect(reviewItem).toBeDefined();
    expect(reviewItem?.title).toContain('3');
    expect(reviewItem?.route).toContain('recall-test');
  });

  it('returns continue item when suggestion exists', async () => {
    (getContinueSuggestion as jest.Mock).mockResolvedValue({
      topicId: 'topic-1',
      topicTitle: 'Quadratic Equations',
      subjectId: 'subject-1',
      subjectName: 'Algebra',
    });

    const plan = await getDailyPlan(mockDb(), 'profile-1');

    const continueItem = plan.items.find((i) => i.type === 'continue');
    expect(continueItem).toBeDefined();
    expect(continueItem?.title).toBe('Quadratic Equations');
  });

  it('returns streak item when currentStreak > 0', async () => {
    (getStreakData as jest.Mock).mockResolvedValue({
      ...BASE_STREAK,
      currentStreak: 5,
    });

    const plan = await getDailyPlan(mockDb(), 'profile-1');

    const streakItem = plan.items.find((i) => i.type === 'streak');
    expect(streakItem).toBeDefined();
    expect(streakItem?.title).toContain('5');
  });

  it('returns empty items and "All caught up" greeting context when nothing is due', async () => {
    const plan = await getDailyPlan(mockDb(), 'profile-1');

    expect(plan.items).toHaveLength(0);
    expect(plan.streakDays).toBe(0);
  });

  it('returns formal greeting for guardian role', async () => {
    (resolveProfileRole as jest.Mock).mockResolvedValue('guardian');

    const plan = await getDailyPlan(mockDb(), 'profile-1');

    expect(plan.greeting).toMatch(/^Good (morning|afternoon|evening)$/);
  });

  it('caps items at 4', async () => {
    (getProfileOverdueCount as jest.Mock).mockResolvedValue({
      overdueCount: 5,
      topTopicIds: [],
    });
    (getContinueSuggestion as jest.Mock).mockResolvedValue({
      topicId: 't1',
      topicTitle: 'Topic',
      subjectId: 's1',
      subjectName: 'Subject',
    });
    (getStreakData as jest.Mock).mockResolvedValue({
      ...BASE_STREAK,
      currentStreak: 10,
    });

    const plan = await getDailyPlan(mockDb(), 'profile-1');

    expect(plan.items.length).toBeLessThanOrEqual(4);
  });
});
