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

type CardIndex = 0 | 1 | 2 | 3;

interface CardSpec {
  readonly index: CardIndex;
  readonly headline: string;
  readonly supporting: string;
  readonly fallbackIcon: keyof typeof Ionicons.glyphMap;
}

// Fallback accent icons per card — used only inside the scene slot when the
// product scene needs a representative glyph. The primary visual is the
// composed app-like scene rendered by `renderScene` below.
const CARD_FALLBACK_ICONS = [
  'chatbubbles-outline',
  'albums-outline',
  'time-outline',
  'school-outline',
] as const satisfies ReadonlyArray<keyof typeof Ionicons.glyphMap>;

const TOTAL_CARDS = CARD_FALLBACK_ICONS.length;
const LAST_INDEX: CardIndex = (TOTAL_CARDS - 1) as CardIndex;

export interface WelcomeIntroProps {
  onComplete: () => void;
  onCardAdvanced?: (cardIndex: number) => void;
}

// Compact mentor-chat scene: learner message bubble + mentor response bubble.
function Card1Scene({
  colors,
  t,
}: {
  colors: ReturnType<typeof useThemeColors>;
  t: (k: string) => string;
}): React.ReactElement {
  return (
    <View testID="welcome-card-1-scene" className="w-full mb-8">
      <View
        className="self-end rounded-2xl px-4 py-3 mb-2"
        style={{ backgroundColor: colors.accent, maxWidth: '80%' }}
      >
        <Text className="text-body-sm" style={{ color: colors.textInverse }}>
          {t('welcomeIntro.scene.card1.learner')}
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
          {t('welcomeIntro.scene.card1.mentor')}
        </Text>
      </View>
    </View>
  );
}

// Compact study-space scene: a row of subject tiles and a row of small chips
// (Notes / Bookmarks / Quiz).
function Card2Scene({
  colors,
  t,
}: {
  colors: ReturnType<typeof useThemeColors>;
  t: (k: string) => string;
}): React.ReactElement {
  const subjects: Array<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      key: 'math',
      label: t('welcomeIntro.scene.card2.subjects.math'),
      icon: 'calculator-outline',
    },
    {
      key: 'history',
      label: t('welcomeIntro.scene.card2.subjects.history'),
      icon: 'time-outline',
    },
    {
      key: 'spanish',
      label: t('welcomeIntro.scene.card2.subjects.spanish'),
      icon: 'language-outline',
    },
  ];
  const chips: Array<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      key: 'notes',
      label: t('welcomeIntro.scene.card2.chips.notes'),
      icon: 'document-text-outline',
    },
    {
      key: 'bookmarks',
      label: t('welcomeIntro.scene.card2.chips.bookmarks'),
      icon: 'bookmark-outline',
    },
    {
      key: 'quiz',
      label: t('welcomeIntro.scene.card2.chips.quiz'),
      icon: 'help-circle-outline',
    },
  ];
  return (
    <View testID="welcome-card-2-scene" className="w-full mb-8">
      <View className="flex-row justify-between mb-4">
        {subjects.map((s) => (
          <View
            key={s.key}
            className="rounded-2xl items-center justify-center px-3 py-3"
            style={{
              backgroundColor: colors.surfaceElevated,
              width: '31%',
            }}
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
      <View className="flex-row flex-wrap justify-center">
        {chips.map((c) => (
          <View
            key={c.key}
            className="flex-row items-center rounded-full px-3 py-1 mr-2 mb-2"
            style={{ backgroundColor: colors.surface }}
          >
            <Ionicons
              name={c.icon}
              size={12}
              color={colors.textSecondary}
              style={{ marginRight: 4 }}
            />
            <Text
              className="text-caption"
              style={{ color: colors.textSecondary }}
            >
              {c.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Compact continuity scene: three rows labelled Last time / Next / Pace,
// each with a one-line body.
function Card3Scene({
  colors,
  t,
}: {
  colors: ReturnType<typeof useThemeColors>;
  t: (k: string) => string;
}): React.ReactElement {
  const rows: Array<{
    key: string;
    label: string;
    body: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      key: 'lastTime',
      label: t('welcomeIntro.scene.card3.rows.lastTime'),
      body: t('welcomeIntro.scene.card3.rows.lastTimeBody'),
      icon: 'checkmark-circle-outline',
    },
    {
      key: 'next',
      label: t('welcomeIntro.scene.card3.rows.next'),
      body: t('welcomeIntro.scene.card3.rows.nextBody'),
      icon: 'arrow-forward-circle-outline',
    },
    {
      key: 'pace',
      label: t('welcomeIntro.scene.card3.rows.pace'),
      body: t('welcomeIntro.scene.card3.rows.paceBody'),
      icon: 'speedometer-outline',
    },
  ];
  return (
    <View testID="welcome-card-3-scene" className="w-full mb-8">
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

// Compact method-chip scene: four method labels.
function Card4Scene({
  colors,
  t,
}: {
  colors: ReturnType<typeof useThemeColors>;
  t: (k: string) => string;
}): React.ReactElement {
  const chips: Array<{ key: string; label: string }> = [
    { key: 'explain', label: t('welcomeIntro.scene.card4.chips.explain') },
    { key: 'think', label: t('welcomeIntro.scene.card4.chips.think') },
    { key: 'practice', label: t('welcomeIntro.scene.card4.chips.practice') },
    { key: 'remember', label: t('welcomeIntro.scene.card4.chips.remember') },
  ];
  return (
    <View
      testID="welcome-card-4-scene"
      className="w-full flex-row flex-wrap justify-center mb-8"
    >
      {chips.map((c) => (
        <View
          key={c.key}
          className="rounded-full px-3 py-2 mr-2 mb-2"
          style={{ backgroundColor: colors.surfaceElevated }}
        >
          <Text className="text-body-sm" style={{ color: colors.textPrimary }}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function renderScene(
  index: CardIndex,
  colors: ReturnType<typeof useThemeColors>,
  t: (k: string) => string,
): React.ReactElement {
  switch (index) {
    case 0:
      return <Card1Scene colors={colors} t={t} />;
    case 1:
      return <Card2Scene colors={colors} t={t} />;
    case 2:
      return <Card3Scene colors={colors} t={t} />;
    case 3:
      return <Card4Scene colors={colors} t={t} />;
  }
}

export function WelcomeIntro({
  onComplete,
  onCardAdvanced,
}: WelcomeIntroProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // Resolve translations at component level so t() gets string literals, not
  // dynamic keys (the strict i18n types reject t(dynamicString)).
  const CARDS = React.useMemo<ReadonlyArray<CardSpec>>(
    () => [
      {
        index: 0,
        headline: t('welcomeIntro.card1.headline'),
        supporting: t('welcomeIntro.card1.supporting'),
        fallbackIcon: CARD_FALLBACK_ICONS[0],
      },
      {
        index: 1,
        headline: t('welcomeIntro.card2.headline'),
        supporting: t('welcomeIntro.card2.supporting'),
        fallbackIcon: CARD_FALLBACK_ICONS[1],
      },
      {
        index: 2,
        headline: t('welcomeIntro.card3.headline'),
        supporting: t('welcomeIntro.card3.supporting'),
        fallbackIcon: CARD_FALLBACK_ICONS[2],
      },
      {
        index: 3,
        headline: t('welcomeIntro.card4.headline'),
        supporting: t('welcomeIntro.card4.supporting'),
        fallbackIcon: CARD_FALLBACK_ICONS[3],
      },
    ],
    [t],
  );

  const listRef = React.useRef<FlatList<CardSpec>>(null);
  const [currentIndex, setCurrentIndex] = React.useState<CardIndex>(0);

  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentIndex === 0) return true;
      const target = (currentIndex - 1) as CardIndex;
      setCurrentIndex(target);
      listRef.current?.scrollToIndex({ index: target, animated: true });
      return true;
    });
    return () => sub.remove();
  }, [currentIndex]);

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
              {renderScene(item.index, colors, t as (k: string) => string)}
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
