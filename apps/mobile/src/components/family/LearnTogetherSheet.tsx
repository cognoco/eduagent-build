import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheet } from '../common/BottomSheet';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';
import type { DashboardChild, Profile, RecapListItem } from '@eduagent/schemas';

import { useThemeColors } from '../../lib/theme';
import { childProfileHref } from '../../lib/navigation';
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import {
  buildSingleChildPrompts,
  ConversationStarterCard,
  firstNameOf,
} from '../home/parent-card-prompts';
import { AddToMyLearningButton } from './AddToMyLearningButton';

const MAX_PROPOSALS = 3;
const TRIGGER_PATH = 'parent-home/learn-together';

interface LearnTogetherSheetProps {
  child: Pick<Profile, 'id' | 'displayName'>;
  dashboardChild: DashboardChild | undefined;
  latestRecap: RecapListItem | null;
  hiddenPromptText?: string | null;
  onClose: () => void;
}

/**
 * Bottom sheet that offers two honest ways for a parent to learn alongside a
 * child: clone the child's latest topic into their own library
 * (AddToMyLearningButton — gated by the navigation contract), and a few
 * "try together" conversation proposals (reused from the shared prompt
 * builder). Degrades to an empty-state with a library escape when neither is
 * available — never a dead end (plan Failure Modes).
 */
export function LearnTogetherSheet({
  child,
  dashboardChild,
  latestRecap,
  hiddenPromptText,
  onClose,
}: LearnTogetherSheetProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const navigationContract = useNavigationContract();

  const name = firstNameOf(child.displayName);
  const cloneTopicId = latestRecap?.topicId ?? null;
  // Mirror AddToMyLearningButton's own gate so we don't render a section header
  // above a button that self-hides. The button re-checks the gate internally.
  const canClone =
    navigationContract.gates.showLearnThisToo && cloneTopicId !== null;

  const hiddenPrompt = hiddenPromptText?.trim();
  const proposals = buildSingleChildPrompts(
    child,
    dashboardChild,
    t,
    false,
    MAX_PROPOSALS,
  ).filter((prompt) => !hiddenPrompt || prompt.text.trim() !== hiddenPrompt);
  const hasProposals = proposals.length > 0;
  const isEmpty = !canClone && !hasProposals;

  const handleOpenLibrary = (): void => {
    onClose();
    router.push(childProfileHref(child.id) as Href);
  };

  return (
    <BottomSheet visible onClose={onClose} animationType="fade">
      <View className="bg-surface px-5 pt-5 pb-8" testID="learn-together-sheet">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-1 pr-3">
            <Text className="text-h3 font-bold text-text-primary">
              {t('home.parent.learnTogether.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-1">
              {t('home.parent.learnTogether.subtitle', { name })}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('home.parent.learnTogether.close')}
            className="h-10 w-10 rounded-full bg-surface-elevated items-center justify-center"
            testID="learn-together-sheet-close"
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={{ maxHeight: 420 }}
          showsVerticalScrollIndicator={false}
        >
          {canClone ? (
            <View className="mb-4" testID="learn-together-clone-section">
              <Text className="text-caption font-bold uppercase text-text-secondary mb-2">
                {t('home.parent.learnTogether.learnItYourselfHeader')}
              </Text>
              <AddToMyLearningButton
                childProfileId={child.id}
                childDisplayName={child.displayName}
                topicId={cloneTopicId}
                topicTitle={latestRecap?.topicTitle ?? null}
                subjectName={latestRecap?.subjectName ?? null}
                triggerPath={TRIGGER_PATH}
              />
            </View>
          ) : null}

          {hasProposals ? (
            <View testID="learn-together-proposals-section">
              <Text className="text-caption font-bold uppercase text-text-secondary mb-2">
                {t('home.parent.learnTogether.tryTogetherHeader')}
              </Text>
              <View style={{ gap: 6 }}>
                {proposals.map((prompt) => (
                  <ConversationStarterCard
                    key={`learn-together-${prompt.key}`}
                    prompt={prompt}
                    tint={undefined}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {isEmpty ? (
            <View testID="learn-together-empty">
              <Text className="text-body-sm text-text-secondary mb-4">
                {t('home.parent.learnTogether.emptyBody', { name })}
              </Text>
              <Pressable
                onPress={handleOpenLibrary}
                accessibilityRole="button"
                className="flex-row items-center justify-center min-h-[48px] rounded-card bg-surface-elevated px-4"
                testID="learn-together-open-library"
              >
                <Ionicons
                  name="library-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text className="text-body font-semibold text-primary ms-2">
                  {t('home.parent.learnTogether.openLibrary', { name })}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
