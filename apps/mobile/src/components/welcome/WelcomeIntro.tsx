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
  readonly icon: keyof typeof Ionicons.glyphMap;
}

const CARD_ICONS = [
  'book-outline',
  'albums-outline',
  'sparkles-outline',
  'people-outline',
] as const satisfies ReadonlyArray<keyof typeof Ionicons.glyphMap>;

const TOTAL_CARDS = CARD_ICONS.length;
const LAST_INDEX: CardIndex = (TOTAL_CARDS - 1) as CardIndex;

export interface WelcomeIntroProps {
  onComplete: () => void;
  onCardAdvanced?: (cardIndex: number) => void;
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
        icon: CARD_ICONS[0],
      },
      {
        index: 1,
        headline: t('welcomeIntro.card2.headline'),
        supporting: t('welcomeIntro.card2.supporting'),
        icon: CARD_ICONS[1],
      },
      {
        index: 2,
        headline: t('welcomeIntro.card3.headline'),
        supporting: t('welcomeIntro.card3.supporting'),
        icon: CARD_ICONS[2],
      },
      {
        index: 3,
        headline: t('welcomeIntro.card4.headline'),
        supporting: t('welcomeIntro.card4.supporting'),
        icon: CARD_ICONS[3],
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
              <View
                className="rounded-full p-6 mb-8"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Ionicons name={item.icon} size={64} color={colors.accent} />
              </View>
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
