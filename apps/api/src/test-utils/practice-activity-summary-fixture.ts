import type { ReportPracticeSummary } from '@eduagent/schemas';

export const emptyPracticeActivitySummary: ReportPracticeSummary = {
  quizzesCompleted: 0,
  reviewsCompleted: 0,
  totals: {
    activitiesCompleted: 0,
    reviewsCompleted: 0,
    pointsEarned: 0,
    celebrations: 0,
    distinctActivityTypes: 0,
  },
  scores: {
    scoredActivities: 0,
    score: 0,
    total: 0,
    accuracy: null,
  },
  byType: [],
  bySubject: [],
};
