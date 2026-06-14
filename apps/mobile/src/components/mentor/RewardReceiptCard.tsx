import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export type RewardReceipt =
  | { kind: 'practice_points'; amount: number; topicTitle?: string }
  | { kind: 'reflection_bonus'; multiplier: 1.5; totalXp: number }
  | {
      kind: 'quiz_personal_best';
      game: 'capitals' | 'guess_who';
      score: number;
    }
  | { kind: 'mastery_delta'; mastered: number; weeklyDelta?: number };

export interface RewardReceiptCardProps {
  receipt: RewardReceipt;
}

function receiptCopyKey(receipt: RewardReceipt): string {
  switch (receipt.kind) {
    case 'practice_points':
      return receipt.topicTitle
        ? 'mentorHome.rewards.practicePoints'
        : 'mentorHome.rewards.practicePointsNoTopic';
    case 'reflection_bonus':
      return 'mentorHome.rewards.reflectionBonus';
    case 'quiz_personal_best':
      return receipt.game === 'capitals'
        ? 'mentorHome.rewards.quizPersonalBestCapitals'
        : 'mentorHome.rewards.quizPersonalBestGuessWho';
    case 'mastery_delta':
      return receipt.weeklyDelta != null
        ? 'mentorHome.rewards.masteryDelta'
        : 'mentorHome.rewards.masteryDeltaNoWeekly';
  }
}

function receiptValue(receipt: RewardReceipt): string {
  switch (receipt.kind) {
    case 'practice_points':
      return String(receipt.amount);
    case 'reflection_bonus':
      return `${receipt.multiplier}x / ${receipt.totalXp}`;
    case 'quiz_personal_best':
      return String(receipt.score);
    case 'mastery_delta':
      return receipt.weeklyDelta != null
        ? `${receipt.mastered} / ${receipt.weeklyDelta}`
        : String(receipt.mastered);
  }
}

export function RewardReceiptCard({ receipt }: RewardReceiptCardProps) {
  const { t } = useTranslation();

  return (
    <View
      testID="mentor-reward-receipt"
      className="rounded-xl border border-border bg-surface p-3"
    >
      <Text className="text-xs font-semibold text-text-secondary">
        {t('mentorHome.rewards.privateLabel')}
      </Text>
      <Text className="mt-1 text-sm text-text-primary">
        {t(receiptCopyKey(receipt), receipt)}
      </Text>
      <Text
        testID="mentor-reward-value"
        className="mt-2 text-lg font-bold text-primary"
      >
        {receiptValue(receipt)}
      </Text>
    </View>
  );
}
