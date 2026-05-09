import { useCallback } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFeedbackContext } from '../../../components/feedback/FeedbackProvider';
import {
  SectionHeader,
  SettingsRow,
} from '../../../components/more/settings-rows';
import { platformAlert } from '../../../lib/platform-alert';

export default function HelpScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { openFeedback } = useFeedbackContext();

  const handleHelp = useCallback(async () => {
    try {
      await Linking.openURL(
        'mailto:support@mentomate.app?subject=MentoMate%20Support',
      );
    } catch {
      platformAlert(
        t('more.help.contactSupportTitle'),
        t('more.help.contactSupportMessage'),
      );
    }
  }, [t]);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        testID="more-help-scroll"
      >
        <SectionHeader>{t('more.help.helpAndFeedback')}</SectionHeader>
        <SettingsRow
          label={t('more.other.helpAndSupport')}
          onPress={() => void handleHelp()}
          testID="more-row-help-support"
        />
        <SettingsRow
          label={t('more.other.reportAProblem')}
          onPress={openFeedback}
          testID="more-row-report-problem"
        />
      </ScrollView>
    </View>
  );
}
