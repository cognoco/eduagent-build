import { useEffect, useState } from 'react';
import {
  Redirect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSubjects } from '../../../hooks/use-subjects';
import { createHomeworkProblem } from '../../../components/homework/problem-cards';
import {
  buildHomeworkSessionParams,
  homeworkReturnHrefForReturnTo,
  normalizeHomeworkEntrySource,
} from './_view-models/homework-session-params';

type ManualHomeworkRouteParams = {
  entrySource?: string | string[];
  returnTo?: string | string[];
  subjectId?: string | string[];
  subjectName?: string | string[];
};

type SelectedSubject = {
  id: string;
  name: string;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function cameraHref(params: ManualHomeworkRouteParams): Href {
  const entrySource = firstParam(params.entrySource);
  const returnTo = firstParam(params.returnTo);
  const subjectId = firstParam(params.subjectId);
  const subjectName = firstParam(params.subjectName);

  return {
    pathname: '/(app)/homework/camera',
    params: {
      ...(entrySource ? { entrySource } : {}),
      ...(returnTo ? { returnTo } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(subjectName ? { subjectName } : {}),
    },
  } as Href;
}

export default function ManualHomeworkScreen(): React.JSX.Element {
  const params = useLocalSearchParams<ManualHomeworkRouteParams>();

  if (process.env.EXPO_PUBLIC_E2E !== 'true') {
    return <Redirect href={cameraHref(params)} />;
  }

  return <ManualHomeworkEntry params={params} />;
}

function ManualHomeworkEntry({
  params,
}: {
  params: ManualHomeworkRouteParams;
}): React.JSX.Element {
  const router = useRouter();
  const { t } = useTranslation();
  const routeSubjectId = firstParam(params.subjectId);
  const routeSubjectName = firstParam(params.subjectName);
  const [problemText, setProblemText] = useState('');
  const [selectedSubject, setSelectedSubject] =
    useState<SelectedSubject | null>(
      routeSubjectId && routeSubjectName
        ? { id: routeSubjectId, name: routeSubjectName }
        : null,
    );
  const subjects = useSubjects({ enabled: selectedSubject === null });
  const activeSubjects =
    subjects.data?.filter((subject) => subject.status === 'active') ?? [];
  const firstActiveSubject = activeSubjects[0];
  const trimmedProblem = problemText.trim();

  useEffect(() => {
    if (!selectedSubject && firstActiveSubject) {
      setSelectedSubject({
        id: firstActiveSubject.id,
        name: firstActiveSubject.name,
      });
    }
  }, [firstActiveSubject, selectedSubject]);

  function cancel(): void {
    router.replace(homeworkReturnHrefForReturnTo(params.returnTo));
  }

  function startSession(): void {
    if (!selectedSubject || !trimmedProblem) return;

    const problem = createHomeworkProblem(trimmedProblem, {
      source: 'manual',
      originalText: null,
    });
    const { params: sessionParams } = buildHomeworkSessionParams({
      subjectId: selectedSubject.id,
      subjectName: selectedSubject.name,
      problemText: problem.text,
      problems: [problem],
      entrySource: normalizeHomeworkEntrySource(params.entrySource),
      returnTo: firstParam(params.returnTo),
    });

    router.replace({
      pathname: '/(app)/session',
      params: sessionParams,
    } as Href);
  }

  return (
    <ScrollView
      className="flex-1 bg-background px-6"
      contentContainerClassName="py-8"
      testID="manual-homework-scroll"
    >
      <View
        testID="homework-entry-mode-manual"
        style={{ width: 1, height: 1 }}
      />
      {trimmedProblem.length === 0 ? (
        <View
          testID="homework-manual-entry-empty"
          style={{ width: 1, height: 1 }}
        />
      ) : null}
      {selectedSubject ? (
        <View
          testID="homework-subject-resolution-ready"
          style={{ width: 1, height: 1 }}
        />
      ) : null}

      <Pressable
        testID="manual-entry-cancel"
        onPress={cancel}
        className="self-start min-h-[48px] px-2 justify-center"
        accessibilityLabel={t('homework.cancelAndGoBackLabel')}
        accessibilityRole="button"
      >
        <Text className="text-body font-semibold text-primary">
          {t('common.cancel')}
        </Text>
      </Pressable>

      <Text className="mt-4 mb-3 text-body text-text-secondary">
        {t('homework.manualInputPlaceholder')}
      </Text>
      <View className="rounded-card bg-surface p-4" testID="problem-card-0">
        <Text className="mb-3 text-body font-semibold text-text-primary">
          {t('homework.problemNumber', { number: 1 })}
        </Text>
        <TextInput
          testID="result-text-input"
          value={problemText}
          onChangeText={setProblemText}
          multiline
          className="min-h-[120px] rounded-card bg-background p-4 text-body text-text-primary"
          textAlignVertical="top"
          placeholder={t('homework.manualInputPlaceholder')}
          accessibilityLabel={t('homework.problemInputLabel', { number: 1 })}
        />
      </View>

      {!selectedSubject ? (
        <View className="mt-6" testID="subject-picker">
          <Text className="mb-3 text-body font-semibold text-text-primary">
            {t('homework.whichSubject')}
          </Text>
          {subjects.isLoading ? (
            <View
              className="flex-row items-center gap-2 py-3"
              testID="subject-picker-loading"
            >
              <ActivityIndicator accessibilityLabel={t('common.loading')} />
              <Text className="text-body-sm text-text-secondary">
                {t('homework.loadingSubjects')}
              </Text>
            </View>
          ) : null}
          {activeSubjects.map((subject) => (
            <Pressable
              key={subject.id}
              testID={`subject-pick-${subject.id}`}
              onPress={() =>
                setSelectedSubject({ id: subject.id, name: subject.name })
              }
              className="mb-2 min-h-[48px] justify-center rounded-button bg-surface-elevated px-4 py-3"
              accessibilityLabel={t('homework.selectSubjectLabel', {
                name: subject.name,
              })}
              accessibilityRole="button"
            >
              <Text className="text-body text-text-primary">
                {subject.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text className="mt-6 text-body-sm text-text-secondary">
          {selectedSubject.name}
        </Text>
      )}

      <Pressable
        testID="confirm-button"
        onPress={startSession}
        disabled={!selectedSubject || !trimmedProblem}
        className={`mt-6 min-h-[48px] items-center justify-center rounded-button px-4 py-3 ${
          selectedSubject && trimmedProblem
            ? 'bg-primary'
            : 'bg-surface-elevated'
        }`}
        accessibilityLabel={t('homework.startSessionLabel')}
        accessibilityRole="button"
        accessibilityState={{ disabled: !selectedSubject || !trimmedProblem }}
      >
        <Text
          className={`text-body font-semibold ${
            selectedSubject && trimmedProblem
              ? 'text-text-inverse'
              : 'text-text-secondary'
          }`}
        >
          {t('homework.letsGo')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
