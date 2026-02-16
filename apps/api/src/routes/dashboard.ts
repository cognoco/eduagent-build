import { Hono } from 'hono';
import type { AuthEnv } from '../middleware/auth';

export const dashboardRoutes = new Hono<AuthEnv>()
  // Get parent dashboard data
  .get('/dashboard', async (c) => {
    // TODO: Aggregate children's learning data for parent via c.get('user').userId
    return c.json({ children: [], demoMode: false });
  })

  // Get detailed child data
  .get('/dashboard/children/:profileId', async (c) => {
    // TODO: Fetch child's subjects, sessions, retention via c.req.param('profileId')
    // TODO: Verify parent has access to this child via c.get('user').userId
    return c.json({ child: null });
  })

  // Get child's subject detail
  .get('/dashboard/children/:profileId/subjects/:subjectId', async (c) => {
    // TODO: Fetch topic-level data via c.req.param('profileId') and c.req.param('subjectId')
    // TODO: Verify parent has access to this child via c.get('user').userId
    return c.json({ topics: [] });
  })

  // Get demo mode fixture data
  .get('/dashboard/demo', async (c) => {
    return c.json({
      demoMode: true,
      children: [
        {
          profileId: 'demo-child-1',
          displayName: 'Alex',
          summary:
            'Alex: Math — 5 problems, 3 guided. Science fading. 4 sessions this week (↑ from 2 last week).',
          sessionsThisWeek: 4,
          sessionsLastWeek: 2,
          totalTimeThisWeek: 180,
          totalTimeLastWeek: 90,
          trend: 'up',
          subjects: [
            { name: 'Mathematics', retentionStatus: 'strong' },
            { name: 'Science', retentionStatus: 'fading' },
          ],
          guidedVsImmediateRatio: 0.6,
        },
        {
          profileId: 'demo-child-2',
          displayName: 'Sam',
          summary:
            'Sam: English — steady progress. 3 sessions this week (→ same as last week).',
          sessionsThisWeek: 3,
          sessionsLastWeek: 3,
          totalTimeThisWeek: 120,
          totalTimeLastWeek: 115,
          trend: 'stable',
          subjects: [{ name: 'English', retentionStatus: 'strong' }],
          guidedVsImmediateRatio: 0.3,
        },
      ],
    });
  });
