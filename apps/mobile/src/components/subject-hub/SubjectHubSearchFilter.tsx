import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useThemeColors } from '../../lib/theme';

export interface SubjectHubVoiceRequest {
  kind: 'transcription';
  source: 'subject-hub-search';
  analyzesTone: false;
  analyzesEmotion: false;
}

interface SubjectHubSearchFilterProps {
  query: string;
  onQueryChange: (query: string) => void;
  onVoiceSearch?: (request: SubjectHubVoiceRequest) => void;
}

export function SubjectHubSearchFilter({
  query,
  onQueryChange,
  onVoiceSearch,
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
      <Pressable
        testID="search-mic"
        accessibilityRole="button"
        accessibilityLabel={t('subjectHub.search.micLabel')}
        className="ms-2 h-10 w-10 items-center justify-center rounded-full bg-background"
        onPress={() =>
          onVoiceSearch?.({
            kind: 'transcription',
            source: 'subject-hub-search',
            analyzesTone: false,
            analyzesEmotion: false,
          })
        }
      >
        <Ionicons name="mic-outline" size={20} color={colors.primary} />
      </Pressable>
    </View>
  );
}
