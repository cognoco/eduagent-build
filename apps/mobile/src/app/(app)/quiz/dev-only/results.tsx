/**
 * Guarded web-E2E host for the production quiz-results screen.
 *
 * The normal results route depends on in-memory QuizFlow state and cannot be
 * deep-linked deterministically. Playwright exports set EXPO_PUBLIC_E2E=true;
 * every other build redirects this route to Home.
 */

import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type {
  CompleteRoundResponse,
  QuizRoundResponse,
} from '@eduagent/schemas';

import { useQuizFlow } from '../_layout';
import { QuizResultsContent, type QuizResultsNavigation } from '../results';

const IS_E2E_BUILD = process.env.EXPO_PUBLIC_E2E === 'true';
const NAVIGATION_LOG_KEY = 'e2e:quiz-results:navigation-log';

const ROUND: QuizRoundResponse = {
  id: 'e2e-quiz-results-round',
  activityType: 'capitals',
  theme: 'European Capitals',
  total: 1,
  questions: [
    {
      type: 'capitals',
      country: 'Austria',
      options: ['Vienna', 'Graz', 'Salzburg', 'Innsbruck'],
      funFact: 'Vienna has historic coffee houses.',
      isLibraryItem: false,
      freeTextEligible: false,
    },
  ],
};

const COMPLETION_RESULT: CompleteRoundResponse = {
  score: 1,
  total: 1,
  xpEarned: 10,
  celebrationTier: 'perfect',
  droppedResults: 0,
  questionResults: [
    {
      questionIndex: 0,
      correct: true,
      correctAnswer: 'Vienna',
      answerGiven: 'Vienna',
    },
  ],
};

interface NavigationCall {
  href: Href;
  method: 'push' | 'replace';
}

interface NavigationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function SeededQuizResults(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { freeze } = useLocalSearchParams<{ freeze?: string }>();
  const { setActivityType, setCompletionResult, setReturnTo, setRound } =
    useQuizFlow();
  const [ready, setReady] = useState(false);
  const [calls, setCalls] = useState<NavigationCall[]>([]);

  useEffect(() => {
    setActivityType('capitals');
    setReturnTo('practice');
    setRound(ROUND);
    setCompletionResult(COMPLETION_RESULT);
    setReady(true);
  }, [setActivityType, setCompletionResult, setReturnTo, setRound]);

  const navigation = useMemo<QuizResultsNavigation>(() => {
    const record = (call: NavigationCall) => {
      setCalls((current) => [...current, call]);
      const storage = (
        globalThis as typeof globalThis & {
          sessionStorage?: NavigationStorage;
        }
      ).sessionStorage;
      if (storage) {
        const current = JSON.parse(
          storage.getItem(NAVIGATION_LOG_KEY) ?? '[]',
        ) as NavigationCall[];
        storage.setItem(NAVIGATION_LOG_KEY, JSON.stringify([...current, call]));
      }
    };

    return {
      push: (href) => {
        record({ href, method: 'push' });
        if (freeze !== 'true') router.push(href);
      },
      replace: (href) => {
        record({ href, method: 'replace' });
        if (freeze !== 'true') router.replace(href);
      },
    };
  }, [freeze, router]);

  if (!ready) {
    return (
      <View testID="quiz-results-e2e-loading">
        <Text>{t('quiz.launch.loadingAlmost')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <QuizResultsContent router={navigation} />
      <Text testID="quiz-results-e2e-navigation-log">
        {JSON.stringify(calls)}
      </Text>
    </View>
  );
}

export default function QuizResultsE2EHost(): React.ReactElement {
  if (!IS_E2E_BUILD) {
    return <Redirect href="/(app)/home" />;
  }

  return <SeededQuizResults />;
}
