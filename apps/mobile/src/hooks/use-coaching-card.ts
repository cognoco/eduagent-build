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
          : '/(learner)/session?mode=freeform',
        secondaryRoute: '/(learner)/session?mode=freeform',
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
        secondaryRoute: '/(learner)/session?mode=freeform',
        isLoading: false,
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
        subtext: 'Your coach is ready when you are.',
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
      subtext: 'Your coach is ready when you are.',
    };

    return {
      headline,
      subtext,
      primaryLabel: "Let's go",
      secondaryLabel: 'I have something else in mind',
      primaryRoute: '/(learner)/session?mode=freeform',
      secondaryRoute: '/(learner)/session?mode=freeform',
      isLoading: false,
    };
  }, [isLoading, suggestion, streak]);
}
