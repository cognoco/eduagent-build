import React from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

export type WelcomeAudience = 'learner' | 'parent';

type CardIndex = 0 | 1 | 2;

type ThemeColors = ReturnType<typeof useThemeColors>;

interface CardSpec {
  readonly index: CardIndex;
  readonly headline: string;
  readonly supporting: string;
  readonly scene: React.ReactNode;
}

const TOTAL_CARDS = 3;
const LAST_INDEX: CardIndex = (TOTAL_CARDS - 1) as CardIndex;

export interface WelcomeIntroProps {
  audience: WelcomeAudience;
  onComplete: () => void;
  onCardAdvanced?: (cardIndex: number) => void;
  // Called when hardware-back is pressed on the first card. Lets a host
  // (e.g. the pre-auth route) step back to a preceding screen such as the
  // audience chooser. When omitted, back on card 0 is a no-op.
  onBackFromFirstCard?: () => void;
}

// ── Generic scene primitives ──────────────────────────────────────────────
// Each deck composes its scenes from these so the locale surface stays small
// and the visuals share one set of theme-driven styles.

function ChatScene({
  testID,
  colors,
  askText,
  replyText,
}: {
  testID: string;
  colors: ThemeColors;
  askText: string;
  replyText: string;
}): React.ReactElement {
  return (
    <View testID={testID} className="w-full mb-8">
      <View
        className="self-end rounded-2xl px-4 py-3 mb-2"
        style={{ backgroundColor: colors.accent, maxWidth: '80%' }}
      >
        <Text className="text-body-sm" style={{ color: colors.textInverse }}>
          {askText}
        </Text>
      </View>
      <View
        className="self-start rounded-2xl px-4 py-3 flex-row items-start"
        style={{ backgroundColor: colors.surfaceElevated, maxWidth: '85%' }}
      >
        <Ionicons
          name="sparkles"
          size={14}
          color={colors.accent}
          style={{ marginRight: 6, marginTop: 3 }}
        />
        <Text
          className="text-body-sm flex-1"
          style={{ color: colors.textPrimary }}
        >
          {replyText}
        </Text>
      </View>
    </View>
  );
}

function ChipsScene({
  testID,
  colors,
  chips,
}: {
  testID: string;
  colors: ThemeColors;
  chips: ReadonlyArray<string>;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="w-full flex-row flex-wrap justify-center mb-8"
    >
      {chips.map((label) => (
        <View
          key={label}
          className="rounded-full px-3 py-2 mr-2 mb-2"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <Text className="text-body-sm" style={{ color: colors.textPrimary }}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RowsScene({
  testID,
  colors,
  rows,
}: {
  testID: string;
  colors: ThemeColors;
  rows: ReadonlyArray<{
    key: string;
    label: string;
    body: string;
    icon: keyof typeof Ionicons.glyphMap;
  }>;
}): React.ReactElement {
  return (
    <View testID={testID} className="w-full mb-8">
      {rows.map((r) => (
        <View
          key={r.key}
          className="flex-row items-start rounded-2xl px-4 py-3 mb-2"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <Ionicons
            name={r.icon}
            size={18}
            color={colors.accent}
            style={{ marginRight: 10, marginTop: 1 }}
          />
          <View className="flex-1">
            <Text
              className="text-caption font-semibold"
              style={{ color: colors.textSecondary }}
            >
              {r.label}
            </Text>
            <Text
              className="text-body-sm mt-0.5"
              style={{ color: colors.textPrimary }}
            >
              {r.body}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function SubjectsResumeScene({
  testID,
  colors,
  subjects,
  resumeLabel,
  resumeBody,
}: {
  testID: string;
  colors: ThemeColors;
  subjects: ReadonlyArray<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }>;
  resumeLabel: string;
  resumeBody: string;
}): React.ReactElement {
  return (
    <View testID={testID} className="w-full mb-8">
      <View className="flex-row justify-between mb-3">
        {subjects.map((s) => (
          <View
            key={s.key}
            className="rounded-2xl items-center justify-center px-3 py-3"
            style={{ backgroundColor: colors.surfaceElevated, width: '31%' }}
          >
            <Ionicons name={s.icon} size={24} color={colors.accent} />
            <Text
              className="text-caption mt-2"
              style={{ color: colors.textPrimary }}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <View
        className="flex-row items-start rounded-2xl px-4 py-3"
        style={{ backgroundColor: colors.surface }}
      >
        <Ionicons
          name="play-back-circle-outline"
          size={18}
          color={colors.accent}
          style={{ marginRight: 10, marginTop: 1 }}
        />
        <View className="flex-1">
          <Text
            className="text-caption font-semibold"
            style={{ color: colors.textSecondary }}
          >
            {resumeLabel}
          </Text>
          <Text
            className="text-body-sm mt-0.5"
            style={{ color: colors.textPrimary }}
          >
            {resumeBody}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Deck builders ─────────────────────────────────────────────────────────
// t() is called with string literals (strict i18n types reject dynamic keys),
// so each deck enumerates its keys explicitly.

function useLearnerCards(
  t: ReturnType<typeof useTranslation>['t'],
  colors: ThemeColors,
): ReadonlyArray<CardSpec> {
  return React.useMemo(() => {
    // Narrow the t signature locally to avoid TS2589 (excessively deep i18n
    // type instantiation) when building the CardSpec array. The keys are all
    // valid — they are validated by the typed t() at the call site above.
    const tr = t as unknown as (key: string) => string;
    return [
      {
        index: 0,
        headline: tr('welcomeIntro.learner.card1.headline'),
        supporting: tr('welcomeIntro.learner.card1.supporting'),
        scene: (
          <ChatScene
            testID="welcome-card-1-scene"
            colors={colors}
            askText={tr('welcomeIntro.scene.learner.card1.learner')}
            replyText={tr('welcomeIntro.scene.learner.card1.mentor')}
          />
        ),
      },
      {
        index: 1,
        headline: tr('welcomeIntro.learner.card2.headline'),
        supporting: tr('welcomeIntro.learner.card2.supporting'),
        scene: (
          <SubjectsResumeScene
            testID="welcome-card-2-scene"
            colors={colors}
            subjects={[
              {
                key: 'math',
                label: tr('welcomeIntro.scene.learner.card2.subjects.math'),
                icon: 'calculator-outline',
              },
              {
                key: 'history',
                label: tr('welcomeIntro.scene.learner.card2.subjects.history'),
                icon: 'time-outline',
              },
              {
                key: 'spanish',
                label: tr('welcomeIntro.scene.learner.card2.subjects.spanish'),
                icon: 'language-outline',
              },
            ]}
            resumeLabel={tr('welcomeIntro.scene.learner.card2.resume.label')}
            resumeBody={tr('welcomeIntro.scene.learner.card2.resume.body')}
          />
        ),
      },
      {
        index: 2,
        headline: tr('welcomeIntro.learner.card3.headline'),
        supporting: tr('welcomeIntro.learner.card3.supporting'),
        scene: (
          <ChipsScene
            testID="welcome-card-3-scene"
            colors={colors}
            chips={[
              tr('welcomeIntro.scene.learner.card3.chips.explain'),
              tr('welcomeIntro.scene.learner.card3.chips.think'),
              tr('welcomeIntro.scene.learner.card3.chips.practice'),
              tr('welcomeIntro.scene.learner.card3.chips.remember'),
            ]}
          />
        ),
      },
    ] as ReadonlyArray<CardSpec>;
  }, [t, colors]);
}

function useParentCards(
  t: ReturnType<typeof useTranslation>['t'],
  colors: ThemeColors,
): ReadonlyArray<CardSpec> {
  return React.useMemo(() => {
    // Same narrowing as useLearnerCards — prevents TS2589.
    const tr = t as unknown as (key: string) => string;
    return [
      {
        index: 0,
        headline: tr('welcomeIntro.parent.card1.headline'),
        supporting: tr('welcomeIntro.parent.card1.supporting'),
        scene: (
          <ChatScene
            testID="welcome-card-1-scene"
            colors={colors}
            askText={tr('welcomeIntro.scene.parent.card1.child')}
            replyText={tr('welcomeIntro.scene.parent.card1.mentor')}
          />
        ),
      },
      {
        index: 1,
        headline: tr('welcomeIntro.parent.card2.headline'),
        supporting: tr('welcomeIntro.parent.card2.supporting'),
        scene: (
          <RowsScene
            testID="welcome-card-2-scene"
            colors={colors}
            rows={[
              {
                key: 'thisWeek',
                label: tr('welcomeIntro.scene.parent.card2.thisWeek.label'),
                body: tr('welcomeIntro.scene.parent.card2.thisWeek.body'),
                icon: 'calendar-outline',
              },
              {
                key: 'strong',
                label: tr('welcomeIntro.scene.parent.card2.strong.label'),
                body: tr('welcomeIntro.scene.parent.card2.strong.body'),
                icon: 'trending-up-outline',
              },
              {
                key: 'review',
                label: tr('welcomeIntro.scene.parent.card2.review.label'),
                body: tr('welcomeIntro.scene.parent.card2.review.body'),
                icon: 'hand-left-outline',
              },
            ]}
          />
        ),
      },
      {
        index: 2,
        headline: tr('welcomeIntro.parent.card3.headline'),
        supporting: tr('welcomeIntro.parent.card3.supporting'),
        scene: (
          <ChipsScene
            testID="welcome-card-3-scene"
            colors={colors}
            chips={[
              tr('welcomeIntro.scene.parent.card3.chips.evenings'),
              tr('welcomeIntro.scene.parent.card3.chips.nagging'),
              tr('welcomeIntro.scene.parent.card3.chips.quality'),
            ]}
          />
        ),
      },
    ] as ReadonlyArray<CardSpec>;
  }, [t, colors]);
}

export function WelcomeIntro({
  audience,
  onComplete,
  onCardAdvanced,
  onBackFromFirstCard,
}: WelcomeIntroProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const learnerCards = useLearnerCards(t, colors);
  const parentCards = useParentCards(t, colors);
  const CARDS = audience === 'parent' ? parentCards : learnerCards;

  const listRef = React.useRef<FlatList<CardSpec>>(null);
  const [currentIndex, setCurrentIndex] = React.useState<CardIndex>(0);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentIndex === 0) {
        onBackFromFirstCard?.();
        return true;
      }
      const target = (currentIndex - 1) as CardIndex;
      setCurrentIndex(target);
      listRef.current?.scrollToIndex({ index: target, animated: true });
      return true;
    });
    return () => sub.remove();
  }, [currentIndex, onBackFromFirstCard]);

  const goToCard = React.useCallback(
    (target: CardIndex) => {
      setCurrentIndex(target);
      listRef.current?.scrollToIndex({ index: target, animated: true });
      onCardAdvanced?.(target + 1);
    },
    [onCardAdvanced],
  );

  const handleNext = React.useCallback(() => {
    if (currentIndex === LAST_INDEX) {
      onComplete();
      return;
    }
    goToCard((currentIndex + 1) as CardIndex);
  }, [currentIndex, goToCard, onComplete]);

  const handlePrev = React.useCallback(() => {
    if (currentIndex === 0) return;
    const target = (currentIndex - 1) as CardIndex;
    setCurrentIndex(target);
    listRef.current?.scrollToIndex({ index: target, animated: true });
  }, [currentIndex]);

  const handleMomentumEnd = React.useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(
        e.nativeEvent.contentOffset.x / Math.max(screenWidth, 1),
      ) as CardIndex;
      const clamped = Math.min(Math.max(next, 0), LAST_INDEX) as CardIndex;
      if (clamped !== currentIndex) {
        setCurrentIndex(clamped);
        onCardAdvanced?.(clamped + 1);
      }
    },
    [currentIndex, onCardAdvanced, screenWidth],
  );

  const isLast = currentIndex === LAST_INDEX;

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="welcome-intro"
    >
      <FlatList
        ref={listRef}
        data={CARDS}
        keyExtractor={(c) => String(c.index)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        renderItem={({ item }) => {
          const { headline, supporting } = item;
          return (
            <View
              style={{ width: screenWidth }}
              className="items-center justify-center px-8"
              testID={`welcome-card-${item.index + 1}`}
              accessibilityLabel={`${headline}. ${supporting}`}
            >
              {/* Stable scene slot above the headline so card-to-card swipes
                  do not shift headline/body placement. */}
              {item.scene}
              <Text
                className="text-display-sm font-bold text-center text-textPrimary mb-4"
                style={{ color: colors.textPrimary }}
              >
                {headline}
              </Text>
              <Text
                className="text-body text-center"
                style={{ color: colors.textSecondary }}
              >
                {supporting}
              </Text>
            </View>
          );
        }}
      />

      <View className="px-8 pb-4">
        <View
          className="flex-row justify-center items-center mb-6"
          accessibilityLabel={t('welcomeIntro.a11y.dots', {
            current: currentIndex + 1,
            total: TOTAL_CARDS,
          })}
          testID="welcome-dots"
        >
          {CARDS.map((c) => (
            <View
              key={c.index}
              className="mx-1 rounded-full"
              style={{
                width: c.index === currentIndex ? 24 : 8,
                height: 8,
                backgroundColor:
                  c.index === currentIndex ? colors.accent : colors.border,
              }}
            />
          ))}
        </View>

        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={handlePrev}
            disabled={currentIndex === 0}
            accessibilityRole="button"
            accessibilityLabel={t('welcomeIntro.a11y.previous')}
            testID="welcome-prev-arrow"
            style={{ opacity: currentIndex === 0 ? 0 : 1 }}
            hitSlop={12}
          >
            <Ionicons
              name="chevron-back"
              size={28}
              color={colors.textSecondary}
            />
          </Pressable>

          {!isLast && (
            <Pressable
              onPress={handleNext}
              accessibilityRole="button"
              accessibilityLabel={t('welcomeIntro.a11y.next')}
              testID="welcome-next-arrow"
              hitSlop={12}
            >
              <Ionicons
                name="chevron-forward"
                size={28}
                color={colors.textSecondary}
              />
            </Pressable>
          )}
          {isLast && <View style={{ width: 28 }} />}
        </View>

        <Pressable
          onPress={handleNext}
          accessibilityRole="button"
          className="rounded-2xl py-4 items-center"
          style={{ backgroundColor: colors.accent }}
          testID={isLast ? 'welcome-start-button' : 'welcome-next-button'}
        >
          <Text
            className="text-body font-semibold"
            style={{ color: colors.textInverse }}
          >
            {isLast ? t('welcomeIntro.letsStart') : t('welcomeIntro.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
