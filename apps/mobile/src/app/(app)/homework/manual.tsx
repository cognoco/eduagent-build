import { useRef, useState } from 'react';
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

import { useCreateSubject, useSubjects } from '../../../hooks/use-subjects';
import { createHomeworkProblem } from '../../../components/homework/problem-cards';
import { formatApiError } from '../../../lib/format-api-error';
import { platformAlert } from '../../../lib/platform-alert';
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
  const [subjectNameInput, setSubjectNameInput] = useState('');
  const [selectedSubject, setSelectedSubject] =
    useState<SelectedSubject | null>(
      routeSubjectId && routeSubjectName
        ? { id: routeSubjectId, name: routeSubjectName }
        : null,
    );
  const subjects = useSubjects({ enabled: selectedSubject === null });
  const createSubject = useCreateSubject();
  const [subjectResolutionPending, setSubjectResolutionPending] =
    useState(false);
  const subjectResolutionLockedRef = useRef(false);
  const subjectResolutionEpochRef = useRef(0);
  const activeSubjects =
    subjects.data?.filter((subject) => subject.status === 'active') ?? [];
  const subjectsLoadFailed = subjects.isError && !subjects.data;
  const trimmedProblem = problemText.trim();

  function cancel(): void {
    subjectResolutionEpochRef.current += 1;
    subjectResolutionLockedRef.current = true;
    router.replace(homeworkReturnHrefForReturnTo(params.returnTo));
  }

  function changeSubject(): void {
    subjectResolutionEpochRef.current += 1;
    subjectResolutionLockedRef.current = false;
    setSubjectResolutionPending(false);
    setSelectedSubject(null);
  }

  function selectExistingSubject(subject: SelectedSubject): void {
    if (subjectResolutionPending) return;
    subjectResolutionEpochRef.current += 1;
    subjectResolutionLockedRef.current = true;
    setSelectedSubject(subject);
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

  async function resolveTypedSubject(): Promise<void> {
    const typedName = subjectNameInput.trim();
    if (!typedName || subjectResolutionLockedRef.current) return;
    subjectResolutionLockedRef.current = true;
    const resolutionEpoch = subjectResolutionEpochRef.current;

    const existingSubject = activeSubjects.find(
      (subject) =>
        subject.name.trim().toLowerCase() === typedName.toLowerCase(),
    );
    if (existingSubject) {
      setSelectedSubject({
        id: existingSubject.id,
        name: existingSubject.name,
      });
      return;
    }

    setSubjectResolutionPending(true);
    try {
      const result = await createSubject.mutateAsync({
        name: typedName,
        rawInput: typedName,
      });
      if (resolutionEpoch !== subjectResolutionEpochRef.current) return;
      setSubjectResolutionPending(false);
      setSelectedSubject({
        id: result.subject.id,
        name: result.subject.name,
      });
    } catch (error: unknown) {
      if (resolutionEpoch !== subjectResolutionEpochRef.current) return;
      try {
        await subjects.refetch();
      } catch {
        // The original creation error remains the useful message for retry.
      }
      if (resolutionEpoch !== subjectResolutionEpochRef.current) return;
      subjectResolutionLockedRef.current = false;
      setSubjectResolutionPending(false);
      platformAlert(
        t('homework.createSubjectErrorTitle'),
        formatApiError(error),
      );
    }
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
          ) : subjectsLoadFailed ? (
            <Pressable
              testID="subject-picker-load-error-retry"
              onPress={() => void subjects.refetch()}
              className="min-h-[48px] justify-center rounded-button bg-surface px-4 py-3"
              accessibilityLabel={t('subject.retryLoadSubjectsLabel')}
              accessibilityRole="button"
            >
              <Text className="text-body-sm text-danger">
                {t('subject.subjectsLoadError')}{' '}
                <Text className="font-semibold text-primary">
                  {t('subject.tapToRetry')}
                </Text>
              </Text>
            </Pressable>
          ) : activeSubjects.length === 0 ? (
            <View className="py-3" testID="subject-picker-empty">
              <Text className="text-body-sm text-text-secondary">
                {t('homework.noSubjectsYet')}
              </Text>
            </View>
          ) : (
            activeSubjects.map((subject) => (
              <Pressable
                key={subject.id}
                testID={`subject-pick-${subject.id}`}
                onPress={() => selectExistingSubject(subject)}
                disabled={subjectResolutionPending}
                className="mb-2 min-h-[48px] justify-center rounded-button bg-surface-elevated px-4 py-3"
                accessibilityLabel={t('homework.selectSubjectLabel', {
                  name: subject.name,
                })}
                accessibilityRole="button"
                accessibilityState={{ disabled: subjectResolutionPending }}
              >
                <Text className="text-body text-text-primary">
                  {subject.name}
                </Text>
              </Pressable>
            ))
          )}
          {!subjects.isLoading && !subjectsLoadFailed ? (
            <>
              <Text className="mb-2 mt-4 text-body-sm text-text-secondary">
                {t('homework.orTypeSubject')}
              </Text>
              <TextInput
                testID="homework-subject-name-input"
                value={subjectNameInput}
                onChangeText={setSubjectNameInput}
                editable={!subjectResolutionPending}
                placeholder={t('homework.subjectInputPlaceholder')}
                className="min-h-[48px] rounded-button border border-border bg-surface px-4 py-3 text-body text-text-primary"
                accessibilityLabel={t('homework.typeSubjectLabel')}
                autoCapitalize="words"
              />
              <Pressable
                testID="homework-subject-resolve-button"
                onPress={() => void resolveTypedSubject()}
                disabled={!subjectNameInput.trim() || subjectResolutionPending}
                className={`mt-3 min-h-[48px] items-center justify-center rounded-button px-4 py-3 ${
                  subjectNameInput.trim() && !subjectResolutionPending
                    ? 'bg-primary'
                    : 'bg-surface-elevated'
                }`}
                accessibilityLabel={t('homework.continueWithSubjectLabel')}
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    !subjectNameInput.trim() || subjectResolutionPending,
                }}
              >
                <Text
                  className={`text-body font-semibold ${
                    subjectNameInput.trim() && !subjectResolutionPending
                      ? 'text-text-inverse'
                      : 'text-text-secondary'
                  }`}
                >
                  {subjectResolutionPending
                    ? t('homework.creatingSubject')
                    : t('common.continue')}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : (
        <View className="mt-6 flex-row items-center justify-between gap-3">
          <Text
            className="flex-1 text-body-sm text-text-secondary"
            testID="homework-subject-resolution-name"
          >
            {selectedSubject.name}
          </Text>
          <Pressable
            testID="homework-change-subject"
            onPress={changeSubject}
            className="min-h-[48px] justify-center px-2"
            accessibilityLabel={t('subject.changeSubjectLabel')}
            accessibilityRole="button"
          >
            <Text className="text-body-sm font-semibold text-primary">
              {t('subject.changeSubject')}
            </Text>
          </Pressable>
        </View>
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
