import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '../common/Button';
import { ErrorFallback } from '../common/ErrorFallback';
import { TimeoutLoader } from '../common/TimeoutLoader';
import type {
  HubNextUp,
  SubjectHubData,
} from '../subject-hub/_view-models/subject-hub-state';
import { SubjectHub } from '../subject-hub/SubjectHub';

type SurfaceAudience = 'learner' | 'supporter';
type SurfaceScopeKind = 'me' | 'supporter-hub' | 'person';
type ActionVariant = 'primary' | 'secondary' | 'tertiary';

export interface LearningAction {
  label: string;
  onPress: () => void;
  variant?: ActionVariant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

interface LearningSurfaceFrameProps {
  audience: SurfaceAudience;
  scopeKind: SurfaceScopeKind;
  title?: string;
  subtitle?: string;
  topAction?: LearningAction;
  children: ReactNode;
  testID?: string;
}

export function LearningSurfaceFrame({
  audience,
  scopeKind,
  title,
  subtitle,
  topAction,
  children,
  testID,
}: LearningSurfaceFrameProps): ReactElement {
  return (
    <View
      className="flex-1 bg-background px-5 py-5"
      testID={testID}
      accessibilityLabel={`${audience}:${scopeKind}`}
    >
      {title || subtitle || topAction ? (
        <View className="mb-5 gap-3">
          <View className="gap-1">
            {title ? (
              <Text className="text-h2 font-semibold text-text-primary">
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text className="text-body text-text-secondary">{subtitle}</Text>
            ) : null}
          </View>
          {topAction ? (
            <LearningActionRow
              actions={[topAction]}
              testID={`${testID}-actions`}
            />
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

interface LearningActionRowProps {
  actions: LearningAction[];
  trailingAction?: LearningAction;
  testID?: string;
}

export function LearningActionRow({
  actions,
  trailingAction,
  testID,
}: LearningActionRowProps): ReactElement {
  const visibleActions = actions.slice(0, 3);

  return (
    <View className="gap-3" testID={testID}>
      <View className="flex-row flex-wrap gap-3">
        {visibleActions.map((action) => (
          <View
            key={action.testID ?? action.label}
            className="min-w-[120px] flex-1"
          >
            <Button
              label={action.label}
              onPress={action.onPress}
              variant={action.variant ?? 'primary'}
              disabled={action.disabled}
              loading={action.loading}
              accessibilityLabel={action.accessibilityLabel}
              testID={action.testID}
            />
          </View>
        ))}
      </View>
      {trailingAction ? (
        <Button
          label={trailingAction.label}
          onPress={trailingAction.onPress}
          variant={trailingAction.variant ?? 'tertiary'}
          disabled={trailingAction.disabled}
          loading={trailingAction.loading}
          accessibilityLabel={trailingAction.accessibilityLabel}
          testID={trailingAction.testID}
        />
      ) : null}
    </View>
  );
}

type LearningState = 'empty' | 'loading' | 'error';

type LearningStateMotif =
  | ReactNode
  | ((options: { reducedMotion: boolean }) => ReactNode);

interface LearningStateCardProps {
  state: LearningState;
  title: string;
  message: string;
  motif?: LearningStateMotif;
  reducedMotion?: boolean;
  primaryAction?: LearningAction;
  secondaryAction?: LearningAction;
  testID?: string;
}

function renderMotif(
  motif: LearningStateMotif | undefined,
  reducedMotion: boolean,
): ReactNode {
  if (!motif) return null;
  return typeof motif === 'function' ? motif({ reducedMotion }) : motif;
}

function StaticMotif({ testID }: { testID?: string }): ReactElement {
  return (
    <View
      className="h-12 w-12 rounded-full border border-border bg-surface-elevated"
      testID={testID}
      pointerEvents="none"
    />
  );
}

function LearningStateCardBase({
  state,
  title,
  message,
  motif,
  reducedMotion = false,
  primaryAction,
  secondaryAction,
  testID,
}: LearningStateCardProps): ReactElement {
  if (state === 'loading') {
    return (
      <TimeoutLoader
        isLoading
        testID={testID}
        loadingLabel={title}
        loadingDescription={message}
        primaryAction={{
          label: primaryAction?.label ?? title,
          onPress: primaryAction?.onPress ?? (() => undefined),
          testID: primaryAction?.testID,
        }}
        secondaryAction={
          secondaryAction
            ? {
                label: secondaryAction.label,
                onPress: secondaryAction.onPress,
                testID: secondaryAction.testID,
              }
            : undefined
        }
      />
    );
  }

  if (state === 'error') {
    return (
      <ErrorFallback
        title={title}
        message={message}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        testID={testID}
      />
    );
  }

  return (
    <View
      className="rounded-card border border-border bg-surface p-5"
      testID={testID}
    >
      {motif ? (
        <View className="mb-4 items-start">
          {renderMotif(motif, reducedMotion)}
        </View>
      ) : null}
      <Text className="text-h3 font-semibold text-text-primary">{title}</Text>
      <Text className="mt-2 text-body text-text-secondary">{message}</Text>
      {primaryAction || secondaryAction ? (
        <View className="mt-4">
          <LearningActionRow
            actions={[primaryAction, secondaryAction].filter(
              (action): action is LearningAction => Boolean(action),
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

export const LearningStateCard = Object.assign(LearningStateCardBase, {
  StaticMotif,
});

interface StructuralFact {
  id: string;
  title: string;
  detail?: string | null;
}

type StructuralFactAppeal =
  | {
      label: string;
      onPress: () => void;
      testID?: string;
      state?: 'idle';
    }
  | {
      state: 'pending';
      testID?: string;
    }
  | {
      state: 'resolved';
      report: string;
      testID?: string;
    };

interface StructuralFactCardProps {
  headline: string;
  facts: StructuralFact[];
  structuralOnlyLabel: string;
  appeal?: StructuralFactAppeal;
  testID?: string;
}

export function StructuralFactCard({
  headline,
  facts,
  structuralOnlyLabel,
  appeal,
  testID,
}: StructuralFactCardProps): ReactElement {
  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID={testID}
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {headline}
      </Text>
      <Text className="mt-2 text-body-sm text-text-secondary">
        {structuralOnlyLabel}
      </Text>
      <View className="mt-4 gap-3">
        {facts.map((fact) => (
          <View key={fact.id} testID={`structural-fact-${fact.id}`}>
            <Text className="text-body font-semibold text-text-primary">
              {fact.title}
            </Text>
            {fact.detail ? (
              <Text className="mt-1 text-body-sm text-text-secondary">
                {fact.detail}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {appeal ? (
        <View className="mt-4 border-t border-border pt-4">
          {appeal.state === 'pending' ? (
            <ActivityIndicator testID={appeal.testID} />
          ) : appeal.state === 'resolved' ? (
            <Text
              className="text-body-sm text-text-secondary"
              testID={appeal.testID}
            >
              {appeal.report}
            </Text>
          ) : (
            <Button
              label={appeal.label}
              onPress={appeal.onPress}
              variant="secondary"
              testID={appeal.testID}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

type SubjectHubSurfaceMode = 'learner-study' | 'supporter-readonly';

interface SubjectHubSurfaceProps {
  data: SubjectHubData;
  mode: SubjectHubSurfaceMode;
  onStudyTopic?: (topicId: string) => void;
  onReviewTopic?: (topicId: string) => void;
  onAddNote?: (topicId: string, content: string) => void | Promise<void>;
  testID?: string;
}

export function SubjectHubSurface({
  data,
  mode,
  onStudyTopic,
  onReviewTopic,
  onAddNote,
}: SubjectHubSurfaceProps): ReactElement {
  const canStudy = mode === 'learner-study' && data.canStudy;
  const surfaceData = canStudy ? data : { ...data, canStudy: false };

  const handleNextUpPress = (nextUp: HubNextUp): void => {
    if (!canStudy || !nextUp.topicId) return;
    onStudyTopic?.(nextUp.topicId);
  };

  return (
    <SubjectHub
      data={surfaceData}
      onNextUpPress={canStudy ? handleNextUpPress : undefined}
      onStudyTopic={canStudy ? onStudyTopic : undefined}
      onReviewTopic={canStudy ? onReviewTopic : undefined}
      onAddNote={canStudy ? onAddNote : undefined}
    />
  );
}
