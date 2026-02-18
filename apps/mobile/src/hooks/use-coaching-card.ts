import { useMemo } from 'react';
import { useContinueSuggestion } from './use-progress';
import { useStreaks } from './use-streaks';

interface CoachingCardState {
  headline: string;
  subtext: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryRoute: string;
  secondaryRoute: string;
  isLoading: boolean;
}

export function useCoachingCard(): CoachingCardState {
  const { data: suggestion, isLoading: suggestionLoading } =
    useContinueSuggestion();
  const { data: streak, isLoading: streakLoading } = useStreaks();

  const isLoading = suggestionLoading || streakLoading;

  return useMemo(() => {
    if (isLoading) {
      return {
        headline: 'Preparing your session...',
        subtext: '',
        primaryLabel: 'Loading...',
        secondaryLabel: '',
        primaryRoute: '',
        secondaryRoute: '',
        isLoading: true,
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
          : '/session?mode=freeform',
        secondaryRoute: '/session?mode=freeform',
        isLoading: false,
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
        secondaryRoute: '/session?mode=freeform',
        isLoading: false,
      };
    }

    // Default card when no suggestion exists
    return {
      headline: 'Ready to learn?',
      subtext: 'Start a new topic or explore something on your mind.',
      primaryLabel: "Let's go",
      secondaryLabel: 'I have something else in mind',
      primaryRoute: '/session?mode=freeform',
      secondaryRoute: '/session?mode=freeform',
      isLoading: false,
    };
  }, [isLoading, suggestion, streak]);
}
