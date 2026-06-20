import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  useCloneFromChild,
  type CloneToast,
} from '../../hooks/use-clone-from-child';
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { useProfile } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';

type Props = {
  childProfileId: string;
  topicId: string | null | undefined;
  topicTitle: string | null | undefined;
  childDisplayName: string | null | undefined;
  subjectName?: string | null;
  triggerPath: string;
};

const TIP_KEY_PREFIX = 'add_to_my_learning.tip_seen';

function BridgeToast({
  toast,
  isCloning,
}: {
  toast: CloneToast;
  isCloning: boolean;
}): React.ReactElement {
  return (
    <View
      className={
        toast.kind === 'error'
          ? 'mt-3 rounded-card border border-danger/25 bg-danger/10 px-4 py-3'
          : 'mt-3 rounded-card border border-primary/20 bg-primary/10 px-4 py-3'
      }
      accessibilityRole="alert"
      testID="add-to-my-learning-toast"
    >
      <Text className="text-body-sm font-semibold text-text-primary">
        {toast.message}
      </Text>
      {toast.detail ? (
        <Text className="mt-1 text-caption text-text-secondary">
          {toast.detail}
        </Text>
      ) : null}
      {toast.primaryAction || toast.secondaryAction ? (
        <View className="mt-3 flex-row flex-wrap gap-3">
          {toast.primaryAction ? (
            <Pressable
              onPress={toast.primaryAction.onPress}
              disabled={isCloning}
              className={`min-h-[44px] justify-center rounded-button bg-primary px-4 py-2${
                isCloning ? ' opacity-60' : ''
              }`}
              accessibilityRole="button"
              accessibilityLabel={toast.primaryAction.label}
              accessibilityState={{ disabled: isCloning }}
              testID={toast.primaryAction.testID}
            >
              <Text className="text-body-sm font-semibold text-text-inverse">
                {toast.primaryAction.label}
              </Text>
            </Pressable>
          ) : null}
          {toast.secondaryAction ? (
            <Pressable
              onPress={toast.secondaryAction.onPress}
              disabled={isCloning}
              className={`min-h-[44px] justify-center rounded-button bg-surface px-4 py-2${
                isCloning ? ' opacity-60' : ''
              }`}
              accessibilityRole="button"
              accessibilityLabel={toast.secondaryAction.label}
              accessibilityState={{ disabled: isCloning }}
              testID={toast.secondaryAction.testID}
            >
              <Text className="text-body-sm font-semibold text-primary">
                {toast.secondaryAction.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function AddToMyLearningButton({
  childProfileId,
  topicId,
  topicTitle,
  childDisplayName,
  subjectName,
  triggerPath,
}: Props): React.ReactElement | null {
  const navigationContract = useNavigationContract();
  const { activeProfile } = useProfile();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { cloneFromChild, isCloningFor, toast, dismissToast } =
    useCloneFromChild();
  const [tipState, setTipState] = useState<'pending' | 'show' | 'hide'>(
    'pending',
  );
  const canShow =
    navigationContract.gates.showLearnThisToo && !!topicId && !!childProfileId;

  const tipKey = useMemo(
    () =>
      activeProfile?.id
        ? `${TIP_KEY_PREFIX}.${activeProfile.id}`
        : TIP_KEY_PREFIX,
    [activeProfile?.id],
  );

  useEffect(() => {
    if (!canShow) return undefined;
    let cancelled = false;

    async function readTipState(): Promise<void> {
      try {
        const value = await AsyncStorage.getItem(tipKey);
        if (!cancelled) setTipState(value === 'true' ? 'hide' : 'show');
      } catch {
        if (!cancelled) setTipState('show');
      }
    }

    void readTipState();

    return () => {
      cancelled = true;
    };
  }, [canShow, tipKey]);

  const markTipSeen = useCallback(() => {
    setTipState('hide');
    void AsyncStorage.setItem(tipKey, 'true').catch(() => {
      // Non-fatal: the tip may show once more on the next app start.
    });
  }, [tipKey]);

  const handlePress = useCallback(() => {
    if (!topicId) return;
    markTipSeen();
    dismissToast();
    cloneFromChild({
      childProfileId,
      childDisplayName,
      subjectName,
      topicId,
      topicTitle,
      triggerPath,
    });
  }, [
    childDisplayName,
    childProfileId,
    cloneFromChild,
    dismissToast,
    markTipSeen,
    subjectName,
    topicId,
    topicTitle,
    triggerPath,
  ]);

  if (!canShow || !topicId) return null;

  const isCloning = isCloningFor(topicId);

  return (
    <View className="mt-4" testID="add-to-my-learning">
      {tipState === 'show' ? (
        <View
          className="mb-3 rounded-card border border-border bg-surface px-4 py-3"
          testID="add-to-my-learning-tip"
        >
          <Text className="text-body-sm text-text-secondary">
            {t('addToMyLearning.tip')}
          </Text>
          <Pressable
            onPress={markTipSeen}
            className="mt-2 self-start min-h-[44px] justify-center"
            accessibilityRole="button"
            accessibilityLabel={t('addToMyLearning.dismiss')}
            testID="add-to-my-learning-tip-dismiss"
          >
            <Text className="text-body-sm font-semibold text-primary">
              {t('addToMyLearning.dismissTip')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        onPress={handlePress}
        disabled={isCloning}
        className={`min-h-[48px] items-center justify-center rounded-button bg-primary px-4 py-3${
          isCloning ? ' opacity-60' : ''
        }`}
        accessibilityRole="button"
        accessibilityLabel={t('addToMyLearning.buttonLabel')}
        accessibilityState={{ disabled: isCloning }}
        testID="add-to-my-learning-button"
      >
        {isCloning ? (
          <ActivityIndicator
            color={colors.textInverse}
            accessibilityLabel={t('common.loading')}
          />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            {t('addToMyLearning.buttonLabel')}
          </Text>
        )}
      </Pressable>
      <Text className="mt-2 text-center text-caption text-text-secondary">
        {t('addToMyLearning.privacyNote')}
      </Text>

      {toast ? <BridgeToast toast={toast} isCloning={isCloning} /> : null}
    </View>
  );
}
