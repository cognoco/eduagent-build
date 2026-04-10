import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useChildReportDetail,
  useMarkChildReportViewed,
} from '../../../../../hooks/use-progress';

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View className="bg-background rounded-card p-4 flex-1">
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-h3 font-semibold text-text-primary mt-2">
        {value}
      </Text>
    </View>
  );
}

export default function ChildReportDetailScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId, reportId } = useLocalSearchParams<{
    profileId: string;
    reportId: string;
  }>();
  const { data: report, isLoading } = useChildReportDetail(profileId, reportId);
  const markViewed = useMarkChildReportViewed();

  useEffect(() => {
    if (!profileId || !reportId || !report || report.viewedAt) return;
    void markViewed.mutateAsync({ childProfileId: profileId, reportId });
  }, [markViewed, profileId, report, reportId]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <View className="flex-row items-center mt-4">
          <Pressable
            onPress={() => router.back()}
            className="me-3 py-2 pe-2"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="child-report-back"
          >
            <Text className="text-body font-semibold text-primary">
              {'\u2190'}
            </Text>
          </Pressable>
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {report?.reportData.month ?? 'Monthly report'}
            </Text>
            <Text className="text-body-sm text-text-secondary mt-0.5">
              Progress you can see and share.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              Loading report...
            </Text>
          </View>
        ) : report ? (
          <>
            <View className="bg-coaching-card rounded-card p-5 mt-4">
              <Text className="text-caption text-text-secondary">
                {report.reportData.childName}
              </Text>
              <Text className="text-h1 font-bold text-text-primary mt-2">
                {report.reportData.headlineStat.value}{' '}
                {report.reportData.headlineStat.label.toLowerCase()}
              </Text>
              <Text className="text-body text-text-secondary mt-2">
                {report.reportData.headlineStat.comparison}
              </Text>
            </View>

            <View className="flex-row gap-3 mt-4">
              <MetricCard
                label="Sessions"
                value={String(report.reportData.thisMonth.totalSessions)}
              />
              <MetricCard
                label="Active minutes"
                value={String(report.reportData.thisMonth.totalActiveMinutes)}
              />
            </View>

            <View className="flex-row gap-3 mt-3">
              <MetricCard
                label="Topics mastered"
                value={String(report.reportData.thisMonth.topicsMastered)}
              />
              <MetricCard
                label="Words learned"
                value={String(report.reportData.thisMonth.vocabularyLearned)}
              />
            </View>

            {report.reportData.highlights.length > 0 ? (
              <View className="bg-surface rounded-card p-4 mt-4">
                <Text className="text-h3 font-semibold text-text-primary">
                  Highlights
                </Text>
                <View className="mt-3 gap-2">
                  {report.reportData.highlights.map((highlight) => (
                    <Text
                      key={highlight}
                      className="text-body-sm text-text-secondary"
                    >
                      • {highlight}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {report.reportData.nextSteps.length > 0 ? (
              <View className="bg-surface rounded-card p-4 mt-4">
                <Text className="text-h3 font-semibold text-text-primary">
                  What's next
                </Text>
                <View className="mt-3 gap-2">
                  {report.reportData.nextSteps.map((step) => (
                    <Text
                      key={step}
                      className="text-body-sm text-text-secondary"
                    >
                      • {step}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="bg-surface rounded-card p-4 mt-4">
              <Text className="text-h3 font-semibold text-text-primary">
                Subject breakdown
              </Text>
              <View className="mt-3 gap-3">
                {report.reportData.subjects.map((subject) => (
                  <View
                    key={subject.subjectName}
                    className="bg-background rounded-card p-4"
                  >
                    <Text className="text-body font-semibold text-text-primary">
                      {subject.subjectName}
                    </Text>
                    <Text className="text-body-sm text-text-secondary mt-1">
                      {subject.topicsMastered} topics mastered •{' '}
                      {subject.vocabularyLearned} words learned •{' '}
                      {subject.activeMinutes} active min
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body-sm text-text-secondary">
              This report is no longer available.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
