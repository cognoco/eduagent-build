import React from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  ScrollView,
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
export type WelcomeIntroStageColors = Partial<
  Pick<
    ThemeColors,
    | 'background'
    | 'surface'
    | 'surfaceElevated'
    | 'textPrimary'
    | 'textSecondary'
    | 'textInverse'
    | 'primary'
    | 'primarySoft'
    | 'secondary'
    | 'accent'
    | 'border'
    | 'muted'
    | 'practiceDarkTeal'
  >
> & {
  shadow?: string;
};

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
  stageColors?: WelcomeIntroStageColors;
  // Called when hardware-back is pressed on the first card. Lets a host
  // (e.g. the pre-auth route) step back to a preceding screen such as the
  // audience chooser. When omitted, back on card 0 is a no-op.
  onBackFromFirstCard?: () => void;
}

// ── Generic scene primitives ──────────────────────────────────────────────
// Each deck composes its scenes from these so the locale surface stays small
// and the visuals share one set of theme-driven styles.

function SceneFrame({
  testID,
  colors,
  brandLabel,
  shadowColor,
  children,
}: {
  testID: string;
  colors: ThemeColors;
  brandLabel: string;
  shadowColor: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View
      testID={`${testID}-frame`}
      className="w-full rounded-3xl border px-5 py-5 mb-6"
      style={{
        minHeight: 230,
        maxWidth: 360,
        alignSelf: 'center',
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.border,
        shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 24,
        elevation: 8,
      }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <Text
          className="text-caption font-bold"
          style={{ color: colors.textInverse }}
        >
          {brandLabel}
        </Text>
        <View className="flex-row items-center">
          <View
            className="rounded-full mr-1"
            style={{ width: 5, height: 5, backgroundColor: colors.primary }}
          />
          <View
            className="rounded-full mr-1"
            style={{ width: 5, height: 5, backgroundColor: colors.accent }}
          />
          <View
            className="rounded-full"
            style={{ width: 5, height: 5, backgroundColor: colors.muted }}
          />
        </View>
      </View>
      <View testID={testID}>{children}</View>
    </View>
  );
}

function ChatScene({
  testID,
  colors,
  brandLabel,
  shadowColor,
  askText,
  replyText,
}: {
  testID: string;
  colors: ThemeColors;
  brandLabel: string;
  shadowColor: string;
  askText: string;
  replyText: string;
}): React.ReactElement {
  return (
    <SceneFrame
      testID={testID}
      colors={colors}
      brandLabel={brandLabel}
      shadowColor={shadowColor}
    >
      <View
        className="self-end rounded-2xl px-4 py-3 mb-3"
        style={{ backgroundColor: colors.accent, maxWidth: '80%' }}
      >
        <Text
          className="text-body-sm font-semibold"
          style={{ color: colors.textInverse }}
        >
          {askText}
        </Text>
      </View>
      <View
        className="self-start rounded-2xl px-4 py-3 flex-row items-start"
        style={{ backgroundColor: colors.surface, maxWidth: '88%' }}
      >
        <Ionicons
          name="sparkles"
          size={14}
          color={colors.primary}
          style={{ marginRight: 6, marginTop: 3 }}
        />
        <Text
          className="text-body-sm flex-1"
          style={{ color: colors.textPrimary }}
        >
          {replyText}
        </Text>
      </View>
    </SceneFrame>
  );
}

function ChipsScene({
  testID,
  colors,
  brandLabel,
  shadowColor,
  chips,
}: {
  testID: string;
  colors: ThemeColors;
  brandLabel: string;
  shadowColor: string;
  chips: ReadonlyArray<string>;
}): React.ReactElement {
  return (
    <SceneFrame
      testID={testID}
      colors={colors}
      brandLabel={brandLabel}
      shadowColor={shadowColor}
    >
      <View className="flex-row flex-wrap justify-center pt-3">
        {chips.map((label, index) => (
          <View
            key={label}
            className="rounded-full px-3 py-2 mr-2 mb-2"
            style={{
              backgroundColor: index === 0 ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: index === 0 ? colors.primary : colors.border,
            }}
          >
            <Text
              className="text-body-sm font-semibold"
              style={{
                color: index === 0 ? colors.background : colors.textPrimary,
              }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
    </SceneFrame>
  );
}

function RowsScene({
  testID,
  colors,
  brandLabel,
  shadowColor,
  rows,
}: {
  testID: string;
  colors: ThemeColors;
  brandLabel: string;
  shadowColor: string;
  rows: ReadonlyArray<{
    key: string;
    label: string;
    body: string;
    icon: keyof typeof Ionicons.glyphMap;
    highlighted?: boolean;
  }>;
}): React.ReactElement {
  return (
    <SceneFrame
      testID={testID}
      colors={colors}
      brandLabel={brandLabel}
      shadowColor={shadowColor}
    >
      {rows.map((r) => {
        const isHighlighted = r.highlighted === true;
        return (
          <View
            key={r.key}
            className="flex-row items-start rounded-2xl px-4 py-3 mb-2"
            style={{
              backgroundColor: isHighlighted
                ? colors.primarySoft
                : colors.surface,
              borderWidth: 1,
              borderColor: isHighlighted ? colors.primary : colors.border,
            }}
          >
            <Ionicons
              name={r.icon}
              size={18}
              color={isHighlighted ? colors.primary : colors.accent}
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
                className="text-body-sm font-semibold mt-0.5"
                style={{ color: colors.textPrimary }}
              >
                {r.body}
              </Text>
            </View>
          </View>
        );
      })}
    </SceneFrame>
  );
}

function SubjectsResumeScene({
  testID,
  colors,
  brandLabel,
  shadowColor,
  subjects,
  resumeLabel,
  resumeBody,
}: {
  testID: string;
  colors: ThemeColors;
  brandLabel: string;
  shadowColor: string;
  subjects: ReadonlyArray<{
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }>;
  resumeLabel: string;
  resumeBody: string;
}): React.ReactElement {
  return (
    <SceneFrame
      testID={testID}
      colors={colors}
      brandLabel={brandLabel}
      shadowColor={shadowColor}
    >
      <View className="flex-row justify-between mb-3">
        {subjects.map((s, index) => (
          <View
            key={s.key}
            className="rounded-2xl items-center justify-center px-3 py-3"
            style={{
              backgroundColor:
                index === 0 ? colors.primarySoft : colors.surface,
              borderWidth: 1,
              borderColor: index === 0 ? colors.primary : colors.border,
              width: '31%',
            }}
          >
            <Ionicons
              name={s.icon}
              size={24}
              color={index === 0 ? colors.primary : colors.accent}
            />
            <Text
              className="text-caption font-semibold mt-2"
              style={{ color: colors.textPrimary }}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>
      <View
        className="flex-row items-start rounded-2xl px-4 py-3"
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
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
    </SceneFrame>
  );
}

// ── Deck builders ─────────────────────────────────────────────────────────
// t() is called with string literals (strict i18n types reject dynamic keys),
// so each deck enumerates its keys explicitly.

function useLearnerCards(
  t: ReturnType<typeof useTranslation>['t'],
  colors: ThemeColors,
  shadowColor: string,
): ReadonlyArray<CardSpec> {
  return React.useMemo(() => {
    // Narrow the t signature locally to avoid TS2589 (excessively deep i18n
    // type instantiation): the expanded welcomeIntro key union overflows the
    // type-checker here. Trade-off: this cast drops compile-time key-existence
    // checking inside the deck, so a typo'd key would render the raw string at
    // runtime. That risk is covered by (a) scripts/check-i18n-staleness.ts in
    // pre-push/CI and (b) the copy-assertion unit tests in WelcomeIntro.test.tsx
    // — NOT by the type system. Keep both guards green.
    const tr = t as unknown as (key: string) => string;
    const brandLabel = tr('welcomeIntro.sceneFrame.brandLabel');
    return [
      {
        index: 0,
        headline: tr('welcomeIntro.learner.card1.headline'),
        supporting: tr('welcomeIntro.learner.card1.supporting'),
        scene: (
          <ChatScene
            testID="welcome-card-1-scene"
            colors={colors}
            brandLabel={brandLabel}
            shadowColor={shadowColor}
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
            brandLabel={brandLabel}
            shadowColor={shadowColor}
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
            brandLabel={brandLabel}
            shadowColor={shadowColor}
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
  }, [t, colors, shadowColor]);
}

function useParentCards(
  t: ReturnType<typeof useTranslation>['t'],
  colors: ThemeColors,
  shadowColor: string,
): ReadonlyArray<CardSpec> {
  return React.useMemo(() => {
    // Same narrowing as useLearnerCards — prevents TS2589.
    const tr = t as unknown as (key: string) => string;
    const brandLabel = tr('welcomeIntro.sceneFrame.brandLabel');
    return [
      {
        index: 0,
        headline: tr('welcomeIntro.parent.card1.headline'),
        supporting: tr('welcomeIntro.parent.card1.supporting'),
        scene: (
          <ChatScene
            testID="welcome-card-1-scene"
            colors={colors}
            brandLabel={brandLabel}
            shadowColor={shadowColor}
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
            brandLabel={brandLabel}
            shadowColor={shadowColor}
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
                highlighted: true,
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
            brandLabel={brandLabel}
            shadowColor={shadowColor}
            chips={[
              tr('welcomeIntro.scene.parent.card3.chips.evenings'),
              tr('welcomeIntro.scene.parent.card3.chips.nagging'),
              tr('welcomeIntro.scene.parent.card3.chips.quality'),
            ]}
          />
        ),
      },
    ] as ReadonlyArray<CardSpec>;
  }, [t, colors, shadowColor]);
}

export function WelcomeIntro({
  audience,
  onComplete,
  onCardAdvanced,
  stageColors,
  onBackFromFirstCard,
}: WelcomeIntroProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const welcomeColors = React.useMemo<ThemeColors>(
    () => ({
      ...colors,
      ...stageColors,
    }),
    [colors, stageColors],
  );
  const sceneShadowColor = stageColors?.shadow ?? colors.muted;
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const learnerCards = useLearnerCards(t, welcomeColors, sceneShadowColor);
  const parentCards = useParentCards(t, welcomeColors, sceneShadowColor);
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
      className="flex-1"
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: welcomeColors.background,
      }}
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
            <ScrollView
              style={{ width: screenWidth }}
              contentContainerStyle={{
                minHeight: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 32,
                paddingVertical: 24,
              }}
              showsVerticalScrollIndicator={false}
              testID={`welcome-card-${item.index + 1}`}
              accessibilityLabel={`${headline}. ${supporting}`}
            >
              {/* Stable scene slot above the headline so card-to-card swipes
                  do not shift headline/body placement. */}
              {item.scene}
              <Text
                className="text-h1 font-bold text-center mb-3"
                style={{ color: welcomeColors.textPrimary, maxWidth: 340 }}
              >
                {headline}
              </Text>
              <Text
                className="text-body-sm text-center"
                style={{ color: welcomeColors.textSecondary, maxWidth: 330 }}
              >
                {supporting}
              </Text>
            </ScrollView>
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
                  c.index === currentIndex
                    ? welcomeColors.accent
                    : welcomeColors.border,
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
              color={welcomeColors.textSecondary}
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
                color={welcomeColors.textSecondary}
              />
            </Pressable>
          )}
          {isLast && <View style={{ width: 28 }} />}
        </View>

        <Pressable
          onPress={handleNext}
          accessibilityRole="button"
          className="rounded-2xl py-4 items-center"
          style={{ backgroundColor: welcomeColors.accent }}
          testID={isLast ? 'welcome-start-button' : 'welcome-next-button'}
        >
          <Text
            className="text-body font-semibold"
            style={{ color: welcomeColors.textInverse }}
          >
            {isLast ? t('welcomeIntro.letsStart') : t('welcomeIntro.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
