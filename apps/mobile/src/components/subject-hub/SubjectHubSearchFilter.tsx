import { TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';
import { VoiceInputControl } from '../common';

interface SubjectHubSearchFilterProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Voice locale resolved from the active profile's conversation language. */
  voiceLocale?: string;
}

// The mic is the shared transcription-only VoiceInputControl (WI-2550, citing
// the WI-2553 ledger): a final transcript REPLACES the query — the
// JournalNotesArchive search precedent — flowing through the same
// onQueryChange path as typing, so filtering behavior is identical. No tone
// or emotion inference (AI Act Art 5(1)(f)); no raw-audio persistence.
export function SubjectHubSearchFilter({
  query,
  onQueryChange,
  voiceLocale,
}: SubjectHubSearchFilterProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="mt-5 flex-row items-center rounded-card border border-border bg-surface px-3">
      <TextInput
        testID="subject-hub-search-input"
        value={query}
        onChangeText={onQueryChange}
        placeholder={t('subjectHub.search.placeholder')}
        placeholderTextColor={colors.textSecondary}
        className="min-h-12 flex-1 text-body text-text-primary"
      />
      <View className="ms-2">
        <VoiceInputControl
          value={query}
          voiceLocale={voiceLocale}
          testID="search-mic"
          onTranscript={onQueryChange}
        />
      </View>
    </View>
  );
}
