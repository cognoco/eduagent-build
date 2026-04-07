import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HomeCard, Profile } from '@eduagent/schemas';
import { ProfileSwitcher } from '../common';
import { useSubjects } from '../../hooks/use-subjects';
import {
  useHomeCards,
  useTrackHomeCardInteraction,
} from '../../hooks/use-home-cards';
import { getGreeting } from '../../lib/greeting';
import { useThemeColors } from '../../lib/theme';
import { IntentCard } from './IntentCard';

function encodeParam(value: string | undefined): string {
  return value ? encodeURIComponent(value) : '';
}

function appendNameParams(card: HomeCard): string {
  let params = '';
  if (card.subjectName)
    params += `&subjectName=${encodeParam(card.subjectName)}`;
  if (card.topicName) params += `&topicName=${encodeParam(card.topicName)}`;
  return params;
}

function getCardPrimaryRoute(card: HomeCard): string {
  switch (card.id) {
    case 'study':
      return card.topicId
        ? `/(learner)/session?mode=practice&subjectId=${
            card.subjectId
          }&topicId=${card.topicId}${appendNameParams(card)}`
        : `/(learner)/session?mode=freeform${
            card.subjectId ? `&subjectId=${card.subjectId}` : ''
          }${appendNameParams(card)}`;
    case 'homework':
      return '/(learner)/homework/camera';
    case 'review':
    case 'restore_subjects':
      return '/(learner)/library';
    case 'curriculum_complete':
      return '/(learner)/learn-new';
    case 'ask':
      return '/(learner)/session?mode=freeform';
    default:
      return '/(learner)/learn-new';
  }
}

export interface LearnerScreenProps {
  profiles: Profile[];
  activeProfile: Profile | null;
  switchProfile: (
    profileId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onBack?: () => void;
}

export function LearnerScreen({
  profiles,
  activeProfile,
  switchProfile,
  onBack,
}: LearnerScreenProps): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { data: subjects } = useSubjects();
  const { data: homeCardsData } = useHomeCards();
  const trackInteraction = useTrackHomeCardInteraction();
  const activeSubjects =
    subjects?.filter((subject) => subject.status === 'active') ?? [];
  const hasLibraryContent = activeSubjects.length > 0;
  const { title, subtitle } = getGreeting(activeProfile?.displayName ?? '');

  const visibleCards = homeCardsData?.cards ?? [];

  const handleCardPrimary = useCallback(
    (card: HomeCard) => {
      trackInteraction.mutate({ cardId: card.id, interactionType: 'tap' });
      router.push(getCardPrimaryRoute(card) as never);
    },
    [trackInteraction, router]
  );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="learner-screen"
    >
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center flex-1 me-3">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="learner-back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
          ) : null}
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">{title}</Text>
            <Text className="text-body text-text-secondary mt-1">
              {subtitle}
            </Text>
          </View>
        </View>
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfile?.id ?? ''}
          onSwitch={switchProfile}
        />
      </View>

      {visibleCards.length > 0 ? (
        <View className="gap-4" testID="coaching-cards">
          {visibleCards.map((card) => (
            <IntentCard
              key={card.id}
              title={card.title}
              subtitle={card.subtitle}
              onPress={() => handleCardPrimary(card)}
              testID={`coaching-card-${card.id}`}
            />
          ))}
        </View>
      ) : (
        <View className="gap-4">
          <IntentCard
            title="Learn something new!"
            onPress={() => router.push('/(learner)/learn-new' as never)}
            testID="intent-learn-new"
          />
          <IntentCard
            title="Help with assignment?"
            subtitle="Take a picture and we'll look at it together"
            onPress={() => router.push('/(learner)/homework/camera' as never)}
            testID="intent-homework"
          />
          {hasLibraryContent ? (
            <IntentCard
              title="Repeat & review"
              onPress={() => router.push('/(learner)/library' as never)}
              testID="intent-review"
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
