import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { VerifiedProofResponse } from '@eduagent/schemas';

import { formatShortDate } from '../../lib/format-datetime';
import type { TranslateKey } from '../../i18n/types';

type VerificationState = NonNullable<
  VerifiedProofResponse['masteryVerificationState']
>;
type RetentionStatus = NonNullable<VerifiedProofResponse['retentionStatus']>;

const STATE_LABEL_KEYS: Record<VerificationState, TranslateKey> = {
  unverified: 'home.parent.verifiedProof.state.unverified',
  fresh: 'home.parent.verifiedProof.state.fresh',
  stale: 'home.parent.verifiedProof.state.stale',
};

const RETENTION_LABEL_KEYS: Record<RetentionStatus, TranslateKey> = {
  strong: 'home.parent.verifiedProof.retention.strong',
  fading: 'home.parent.verifiedProof.retention.fading',
  weak: 'home.parent.verifiedProof.retention.weak',
  forgotten: 'home.parent.verifiedProof.retention.forgotten',
};

export function VerifiedProofBlock({
  topicTitle,
  verifiedAt,
  quote,
  verificationState,
  retentionStatus,
  nextReviewDate,
  showRetentionAffordances = false,
}: {
  topicTitle: string;
  verifiedAt: string;
  quote: string | null;
  verificationState?: VerificationState | null;
  retentionStatus?: RetentionStatus | null;
  nextReviewDate?: string | null;
  showRetentionAffordances?: boolean;
}): React.ReactElement {
  const { t, i18n } = useTranslation();
  const stateLabel = verificationState
    ? t(STATE_LABEL_KEYS[verificationState])
    : null;
  const retentionLabel = retentionStatus
    ? t(RETENTION_LABEL_KEYS[retentionStatus])
    : null;

  return (
    <>
      <Text className="text-caption font-bold uppercase text-text-secondary">
        {t('home.parent.verifiedProof.headline', { topic: topicTitle })}
      </Text>
      <Text className="text-caption text-text-secondary mt-1">
        {t('home.parent.verifiedProof.verifiedOn', {
          date: formatShortDate(verifiedAt, i18n?.language),
        })}
        {stateLabel ? ` · ${stateLabel}` : null}
        {retentionLabel ? ` · ${retentionLabel}` : null}
      </Text>
      {quote ? (
        <Text
          className="text-body-sm text-text-primary mt-2"
          style={{ fontStyle: 'italic' }}
        >
          “{quote}”
        </Text>
      ) : (
        <Text className="text-caption text-text-secondary mt-2">
          {t('home.parent.verifiedProof.quoteUnavailable')}
        </Text>
      )}
      {showRetentionAffordances && retentionStatus === 'strong' ? (
        <Text className="text-caption font-semibold text-primary mt-2">
          {t('recaps.verifiedProof.holdsStrong')}
        </Text>
      ) : null}
      {showRetentionAffordances && nextReviewDate ? (
        <Text className="text-caption text-text-secondary mt-1">
          {t('recaps.verifiedProof.recheckDue', {
            date: formatShortDate(nextReviewDate, i18n?.language),
          })}
        </Text>
      ) : null}
    </>
  );
}
