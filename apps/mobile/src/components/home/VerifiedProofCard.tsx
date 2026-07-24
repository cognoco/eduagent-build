import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVerifiedProof } from '../../hooks/use-dashboard';
import { FAMILY_HOME_RETURN_TO } from '../../lib/navigation';
import { VerifiedProofBlock } from '../family/VerifiedProofBlock';

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
  const router = useRouter();
  const { t } = useTranslation();
  const query = useVerifiedProof(childProfileId);
  const proof = query.data;

  if (query.isError) {
    return (
      <View
        className="rounded-button px-3 py-3 mt-3 bg-background"
        style={{ borderColor: accentColor + '24', borderWidth: 1 }}
        testID={`parent-home-child-verified-proof-unavailable-${childProfileId}`}
      >
        <Text className="text-body-sm text-text-secondary">
          {t('recaps.verifiedProof.lookupUnavailable')}
        </Text>
      </View>
    );
  }

  if (
    !proof?.hasProof ||
    !proof.sessionId ||
    !proof.topicTitle ||
    !proof.verifiedAt
  ) {
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

  return (
    <Pressable
      onPress={handlePress}
      className="rounded-button px-3 py-3 mt-3 bg-background"
      style={{ borderColor: accentColor + '24', borderWidth: 1 }}
      accessibilityRole="button"
      testID={`parent-home-child-verified-proof-${childProfileId}`}
    >
      <VerifiedProofBlock
        topicTitle={proof.topicTitle}
        verifiedAt={proof.verifiedAt}
        quote={proof.quote}
        evidenceAvailability={proof.evidenceAvailability}
        verificationState={proof.masteryVerificationState}
        retentionStatus={proof.retentionStatus}
      />
    </Pressable>
  );
}
