import { Pressable, Text } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { VerifiedProofResponse } from '@eduagent/schemas';
import { useVerifiedProof } from '../../hooks/use-dashboard';
import { formatShortDate } from '../../lib/format-datetime';
import { FAMILY_HOME_RETURN_TO } from '../../lib/navigation';

type MasteryVerificationState = NonNullable<
  VerifiedProofResponse['masteryVerificationState']
>;
type RetentionStatus = NonNullable<VerifiedProofResponse['retentionStatus']>;

const STATE_LABEL_KEYS: Record<MasteryVerificationState, string> = {
  unverified: 'home.parent.verifiedProof.state.unverified',
  fresh: 'home.parent.verifiedProof.state.fresh',
  stale: 'home.parent.verifiedProof.state.stale',
};

const RETENTION_LABEL_KEYS: Record<RetentionStatus, string> = {
  strong: 'home.parent.verifiedProof.retention.strong',
  fading: 'home.parent.verifiedProof.retention.fading',
  weak: 'home.parent.verifiedProof.retention.weak',
  forgotten: 'home.parent.verifiedProof.retention.forgotten',
};

/**
 * [WI-1658] Parent-facing verified-proof receipt: the latest Challenge-Round
 * concept the child has verifiably explained in their own words, co-presented
 * with the current verification/retention state (MMT-ADR-0031 §5 — never an
 * unqualified "verified forever" claim). The quote (when present) is always
 * sourced from a `topic_notes` row explicitly marked as a verified artifact
 * (never raw transcript, never an unmarked learner note) — see
 * `getLatestVerifiedProofForChild` (apps/api/src/services/parent-proof.ts).
 *
 * Renders nothing when there is no verified win yet or while loading — this
 * is a bonus surface, not information the parent is blocked without.
 */
export function VerifiedProofCard({
  childProfileId,
  accentColor,
}: {
  childProfileId: string;
  accentColor: string;
}): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const query = useVerifiedProof(childProfileId);
  const proof = query.data;

  if (!proof?.hasProof || !proof.sessionId || !proof.topicTitle) {
    return null;
  }

  const handlePress = (): void => {
    router.push({
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: {
        profileId: childProfileId,
        sessionId: proof.sessionId as string,
        returnTo: FAMILY_HOME_RETURN_TO,
      },
    } as Href);
  };

  const stateLabel = proof.masteryVerificationState
    ? t(STATE_LABEL_KEYS[proof.masteryVerificationState])
    : null;
  const retentionLabel = proof.retentionStatus
    ? t(RETENTION_LABEL_KEYS[proof.retentionStatus])
    : null;

  return (
    <Pressable
      onPress={handlePress}
      className="rounded-button px-3 py-3 mt-3 bg-background"
      style={{ borderColor: accentColor + '24', borderWidth: 1 }}
      accessibilityRole="button"
      testID={`parent-home-child-verified-proof-${childProfileId}`}
    >
      <Text className="text-caption font-bold uppercase text-text-secondary">
        {t('home.parent.verifiedProof.headline', { topic: proof.topicTitle })}
      </Text>
      <Text className="text-caption text-text-secondary mt-1">
        {t('home.parent.verifiedProof.verifiedOn', {
          date: formatShortDate(proof.verifiedAt, i18n?.language),
        })}
        {stateLabel && retentionLabel
          ? ` · ${stateLabel} · ${retentionLabel}`
          : null}
      </Text>
      {proof.quote ? (
        <Text
          className="text-body-sm text-text-primary mt-2"
          style={{ fontStyle: 'italic' }}
        >
          “{proof.quote}”
        </Text>
      ) : (
        <Text className="text-caption text-text-secondary mt-2">
          {t('home.parent.verifiedProof.quoteUnavailable')}
        </Text>
      )}
    </Pressable>
  );
}
