import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import type { SupporterColdStartCard } from '@eduagent/schemas';

import { QueryStateView } from '../common';
import { useSupporterColdStart } from '../../hooks/use-supporter-coldstart';
import { useScopeContext } from '../../lib/scope-context';
import { useProfile } from '../../lib/profile';
import { platformAlert } from '../../lib/platform-alert';
import { pushAddChildForSupport } from '../../lib/navigation';
import type { TranslateKey } from '../../i18n';

const NUDGE_KEY_BY_STEP: Record<1 | 2 | 3 | 4, TranslateKey> = {
  1: 'supporterColdStart.granted.nudgeStep1',
  2: 'supporterColdStart.granted.nudgeStep2',
  3: 'supporterColdStart.granted.nudgeStep3',
  4: 'supporterColdStart.granted.nudgeStep4',
};

function ManagedCard({
  card,
}: {
  card: Extract<SupporterColdStartCard, { state: 'managed' }>;
}): React.ReactElement {
  const { t } = useTranslation();
  const { switchProfile } = useProfile();

  const handleHandoff = async (): Promise<void> => {
    // [WI-2226 owner-gate] A managed card only renders for a supportee on
    // the supporter's own account (resolveSupporterColdStart), so this
    // switch should always succeed — but switchProfile is async and may
    // resolve {success:false} or throw (network/Clerk failure), so surface
    // failure rather than silently no-op (AGENTS.md "UX Resilience Rules").
    try {
      const result = await switchProfile(card.personId);
      if (!result.success) {
        platformAlert(
          t('tabs.switchProfile.errorTitle'),
          result.error ?? t('tabs.switchProfile.errorMessage'),
        );
      }
    } catch {
      platformAlert(
        t('tabs.switchProfile.errorTitle'),
        t('tabs.switchProfile.errorMessage'),
      );
    }
  };

  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID={`supporter-cold-start-managed-${card.personId}`}
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {card.displayName}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supporterColdStart.managed.message', { name: card.displayName })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('supporterColdStart.managed.cta', {
          name: card.displayName,
        })}
        onPress={() => void handleHandoff()}
        className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-3"
        testID={`supporter-cold-start-handoff-${card.personId}`}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('supporterColdStart.managed.cta', { name: card.displayName })}
        </Text>
      </Pressable>
    </View>
  );
}

function GrantedIdleCard({
  card,
  onKickstart,
}: {
  card: Extract<SupporterColdStartCard, { state: 'granted-idle' }>;
  onKickstart?: (card: SupporterColdStartCard) => void;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      className="rounded-card border border-border bg-surface p-4"
      testID={`supporter-cold-start-granted-${card.personId}`}
    >
      <Text className="text-h3 font-semibold text-text-primary">
        {card.displayName}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supporterColdStart.granted.message', { name: card.displayName })}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('supporterColdStart.granted.hint', { name: card.displayName })}
      </Text>
      {card.staleIdleStep ? (
        <Text className="mt-2 text-body-sm text-text-secondary">
          {t(NUDGE_KEY_BY_STEP[card.staleIdleStep], {
            name: card.displayName,
          })}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('supporterColdStart.granted.cta', {
          name: card.displayName,
        })}
        onPress={() => onKickstart?.(card)}
        className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-3"
        testID={`supporter-cold-start-kickstart-${card.personId}`}
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('supporterColdStart.granted.cta', { name: card.displayName })}
        </Text>
      </Pressable>
    </View>
  );
}

interface SupporterColdStartProps {
  /**
   * WI-1135 scopes only the kickstart CTA's presence and copy; the actual
   * encouragement-composer wiring (T16 / WI-1136) is a separate, deliberately
   * deferred fast-follow. Callers may supply this later without touching
   * this component's render logic.
   */
  onKickstart?: (card: SupporterColdStartCard) => void;
}

export function SupporterColdStart({
  onKickstart,
}: SupporterColdStartProps = {}): React.ReactElement | null {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeScope } = useScopeContext();
  const query = useSupporterColdStart();

  if (activeScope.kind !== 'supporter-hub') {
    return null;
  }

  // A per-child response can legitimately carry zero cards — every managed
  // child already has their own account and real learning state, so none
  // need a cold-start nudge (see supporter-coldstart.ts's `continue` when
  // `hasLearningState` is true). Render nothing rather than a blank card
  // container in that case.
  const hasNothingToShow =
    query.data?.variant === 'per-child' && query.data.cards.length === 0;

  return (
    <QueryStateView
      isLoading={query.isLoading}
      error={query.isError ? true : undefined}
      loadingTitle={t('supporterColdStart.loadingTitle')}
      errorTitle={t('supporterColdStart.errorTitle')}
      errorMessage={t('supporterColdStart.errorMessage')}
      retry={{
        onPress: () => void query.refetch(),
        testID: 'supporter-cold-start-retry',
      }}
      testID="supporter-cold-start-error"
    >
      {query.data && !hasNothingToShow ? (
        <View className="gap-3" testID="supporter-cold-start">
          {query.data.variant === 'variant-zero' ? (
            <View
              className="rounded-card border border-border bg-surface p-4"
              testID="supporter-cold-start-add-child"
            >
              <Text className="text-h3 font-semibold text-text-primary">
                {t('supporterColdStart.addChild.title')}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {t('supporterColdStart.addChild.message')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('supporterColdStart.addChild.cta')}
                onPress={() => pushAddChildForSupport(router)}
                className="mt-3 min-h-[44px] items-center justify-center rounded-button bg-primary px-4 py-3"
                testID="supporter-cold-start-add-child-cta"
              >
                <Text className="text-body font-semibold text-text-inverse">
                  {t('supporterColdStart.addChild.cta')}
                </Text>
              </Pressable>
            </View>
          ) : (
            query.data.cards.map((card) => {
              switch (card.state) {
                case 'managed':
                  return <ManagedCard key={card.personId} card={card} />;
                case 'granted-idle':
                  return (
                    <GrantedIdleCard
                      key={card.personId}
                      card={card}
                      onKickstart={onKickstart}
                    />
                  );
                // WI-1135 AC scopes only managed + granted-idle per-child
                // rendering. `consent-pending` has no producing path yet
                // (see supporter-coldstart.ts) and `none` cannot appear in a
                // per-child list per the schema's superRefine; render nothing
                // rather than inventing unratified copy for either.
                case 'consent-pending':
                case 'none':
                default:
                  return null;
              }
            })
          )}
        </View>
      ) : null}
    </QueryStateView>
  );
}
