import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

export const streakRoutes = new Hono<AuthEnv>()
  // Get current streak state
  .get('/streaks', async (c) => {
    // TODO: Fetch streak for current profile via c.get('user').userId
    return c.json({
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        gracePeriodStartDate: null,
        isOnGracePeriod: false,
        graceDaysRemaining: 0,
      },
    });
  })

  // Get XP summary
  .get('/xp', async (c) => {
    // TODO: Aggregate XP ledger for user via c.get('user').userId
    return c.json({
      xp: {
        totalXp: 0,
        verifiedXp: 0,
        pendingXp: 0,
        decayedXp: 0,
        topicsCompleted: 0,
        topicsVerified: 0,
      },
    });
  });
