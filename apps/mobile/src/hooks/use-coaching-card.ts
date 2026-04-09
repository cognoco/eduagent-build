import { useMemo } from 'react';
import type { DailyPlanItem } from '@eduagent/schemas';
import { useContinueSuggestion } from './use-progress';
import { useStreaks } from './use-streaks';
import { useDailyPlan } from './use-daily-plan';

interface CoachingCardState {
  headline: string;
  subtext: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryRoute: string;
  secondaryRoute: string;
  isLoading: boolean;
  planItems: DailyPlanItem[];
  /** When true, show celebration animation + "Add a new subject" CTA (Story 10.15). */
  isCurriculumComplete?: boolean;
}

/**
 * @param defaultSubjectId — fallback subject ID for freeform routes.
 *   When provided, freeform "Chat" sessions include a subjectId so the
 *   API can create a session. Pass the user's first active subject ID.
 */
export function useCoachingCard(defaultSubjectId?: string): CoachingCardState {
  const { data: suggestion, isLoading: suggestionLoading } =
    useContinueSuggestion();
  const { data: streak, isLoading: streakLoading } = useStreaks();
  const { data: dailyPlan, isLoading: planLoading } = useDailyPlan();

  const isLoading = suggestionLoading || streakLoading || planLoading;

  return useMemo(() => {
    const freeformRoute = defaultSubjectId
      ? `/(app)/session?mode=freeform&subjectId=${defaultSubjectId}`
      : '/(app)/session?mode=freeform';
    if (isLoading) {
      return {
        headline: 'Preparing your session...',
        subtext: '',
        primaryLabel: 'Loading...',
        secondaryLabel: '',
        primaryRoute: '',
        secondaryRoute: '',
        isLoading: true,
        planItems: [],
      };
    }

    // Streak-based card when returning from a break
    if (streak && streak.isOnGracePeriod) {
      return {
        headline: 'Welcome back!',
        subtext: `${streak.graceDaysRemaining} grace day${
          streak.graceDaysRemaining === 1 ? '' : 's'
        } left on your ${streak.currentStreak}-day streak.`,
        primaryLabel: "Let's go",
        secondaryLabel: 'I have something else in mind',
        primaryRoute: suggestion
          ? `/session?mode=practice&subjectId=${suggestion.subjectId}&topicId=${suggestion.topicId}`
          : freeformRoute,
        secondaryRoute: freeformRoute,
        isLoading: false,
        planItems: dailyPlan?.items ?? [],
      };
    }

    // Suggestion-based card when there's a topic to continue
    if (suggestion) {
      return {
        headline: `Continue: ${suggestion.topicTitle}`,
        subtext: `Pick up where you left off in ${suggestion.subjectName}.`,
        primaryLabel: "Let's go",
        secondaryLabel: 'I have something else in mind',
        primaryRoute: `/session?mode=practice&subjectId=${suggestion.subjectId}&topicId=${suggestion.topicId}`,
        secondaryRoute: freeformRoute,
        isLoading: false,
        planItems: dailyPlan?.items ?? [],
      };
    }

    // Curriculum complete: user has subjects but no next topic to study
    if (defaultSubjectId && !suggestion) {
      return {
        headline: "You've mastered your subjects!",
        subtext: 'Ready for something new?',
        primaryLabel: 'Add a new subject',
        secondaryLabel: 'Keep reviewing',
        primaryRoute: '/create-subject',
        secondaryRoute: '/(app)/library',
        isLoading: false,
        isCurriculumComplete: true,
        planItems: dailyPlan?.items ?? [],
      };
    }

    // Default card when no suggestion exists — progressive coaching voice
    const sessionStreak = streak?.currentStreak ?? 0;
    const coldStartHeadlines: Record<
      number,
      { headline: string; subtext: string }
    > = {
      0: {
        headline:
          "I'm still getting to know you. What are you working on today?",
        subtext: "I'm ready when you are.",
      },
      1: {
        headline: 'What have we got today?',
        subtext: 'Pick up where you left off or try something new.',
      },
      2: {
        headline: "Back again \u2014 what's on the homework list?",
        subtext: "You're building momentum. Keep it going!",
      },
      3: {
        headline: 'What are we tackling?',
        subtext: "Three sessions in \u2014 you're on a roll.",
      },
    };
    const { headline, subtext } = coldStartHeadlines[sessionStreak] ?? {
      headline: 'What are you working on today?',
      subtext: "I'm ready when you are.",
    };

    return {
      headline,
      subtext,
      primaryLabel: "Let's go",
      secondaryLabel: 'I have something else in mind',
      primaryRoute: freeformRoute,
      secondaryRoute: freeformRoute,
      isLoading: false,
      planItems: dailyPlan?.items ?? [],
    };
  }, [isLoading, suggestion, streak, dailyPlan, defaultSubjectId]);
}
