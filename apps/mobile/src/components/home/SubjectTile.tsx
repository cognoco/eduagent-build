import { Pressable, View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SubjectBookshelfMotif } from '../common/SubjectBookshelfMotif';

export interface SubjectTileProps {
  subjectId: string;
  name: string;
  hint: string;
  isPreparing?: boolean;
  progress: number;
  topicsCompleted?: number;
  topicsTotal?: number;
  tintSolid: string;
  tintSoft: string;
  onPress?: () => void;
  testID: string;
}

export function SubjectTile({
  name,
  hint,
  isPreparing,
  progress,
  topicsCompleted = 0,
  topicsTotal = 0,
  tintSolid,
  tintSoft,
  onPress,
  testID,
}: SubjectTileProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={
        topicsTotal > 0
          ? `${name}. ${hint}. ${topicsCompleted}/${topicsTotal} topics`
          : `${name}. ${hint}`
      }
      accessibilityRole="button"
      className="w-[142px] rounded-2xl bg-surface border border-border p-3.5 pb-4"
      style={[
        {
          backgroundColor: tintSoft,
          borderColor: `${tintSolid}33`,
          gap: 10,
        },
        isPreparing && { opacity: 0.7 },
      ]}
    >
      <View testID={`${testID}-icon`} className="items-start">
        <SubjectBookshelfMotif
          tint={{ solid: tintSolid, soft: tintSoft }}
          testID={`${testID}-bookshelf`}
        />
      </View>
      <View>
        <Text className="text-[15px] font-bold text-text-primary">{name}</Text>
        <Text
          className="text-[11px] text-text-secondary mt-1"
          numberOfLines={2}
        >
          {hint}
        </Text>
      </View>
      <View className="mt-auto" style={{ gap: 6 }}>
        {topicsTotal > 0 && (
          <Text
            testID={`${testID}-topics`}
            className="text-[10px] font-semibold text-text-secondary"
          >
            {t('home.subjectTile.topicsProgress', {
              completed: topicsCompleted,
              total: topicsTotal,
            })}
          </Text>
        )}
        <View className="h-1 rounded-full bg-surface-elevated overflow-hidden flex-row">
          <View
            testID={`${testID}-progress`}
            className="h-full rounded-full"
            style={{ flex: progress, backgroundColor: tintSolid }}
          />
          <View style={{ flex: 1 - progress }} />
        </View>
      </View>
    </Pressable>
  );
}
