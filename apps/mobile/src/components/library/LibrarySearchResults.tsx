import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type {
  LibrarySearchResult,
  RetentionStatus,
  SubjectStatus,
} from '@eduagent/schemas';

import { useSubjectTint, useThemeColors } from '../../lib/theme';
import { ShelfRow } from './ShelfRow';

export interface EnrichedSubjectResult {
  id: string;
  name: string;
  bookCount: number;
  topicProgress: string;
  retentionStatus: RetentionStatus | null;
  reviewDueCount: number;
  isFinished: boolean;
  isPaused: boolean;
  status?: SubjectStatus;
}

interface LibrarySearchResultsProps {
  data: LibrarySearchResult | undefined;
  isLoading: boolean;
  isError: boolean;
  query: string;
  enrichedSubjects: EnrichedSubjectResult[];
  onSubjectPress: (subjectId: string) => void;
  onBookPress: (subjectId: string, bookId: string) => void;
  onTopicPress: (topicId: string) => void;
  onNotePress: (topicId: string) => void;
  onSessionPress: (
    sessionId: string,
    subjectId: string,
    topicId: string | null,
  ) => void;
  onClear: () => void;
  onRetry: () => void;
}

type BookResult = LibrarySearchResult['books'][number];
type TopicResult = LibrarySearchResult['topics'][number];
type NoteResult = LibrarySearchResult['notes'][number];
type SessionResult = LibrarySearchResult['sessions'][number];

function formatSearchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function SectionHeader({
  label,
  testID,
}: {
  label: string;
  testID: string;
}): React.ReactElement {
  const colors = useThemeColors();
  return (
    <Text
      testID={testID}
      style={{
        color: colors.textSecondary,
        fontSize: 12,
        fontWeight: '700',
        marginTop: 14,
        marginBottom: 4,
        paddingHorizontal: 16,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </Text>
  );
}

function SubjectPill({ name }: { name: string }): React.ReactElement {
  const tint = useSubjectTint(name);
  return (
    <View
      style={{
        minWidth: 36,
        maxWidth: 88,
        borderRadius: 999,
        backgroundColor: tint.soft,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: tint.solid,
          fontSize: 11,
          fontWeight: '700',
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

function ResultRow({
  testID,
  icon,
  title,
  subtitle,
  subjectName,
  onPress,
}: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  subjectName: string;
  onPress: () => void;
}): React.ReactElement {
  const colors = useThemeColors();
  const tint = useSubjectTint(subjectName);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      style={({ pressed }) => ({
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        opacity: pressed ? 0.7 : 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: tint.soft,
          borderRadius: 10,
          height: 36,
          justifyContent: 'center',
          width: 36,
        }}
      >
        <Ionicons name={icon} size={19} color={tint.solid} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <SubjectPill name={subjectName} />
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

function BookRow({
  item,
  onPress,
}: {
  item: BookResult;
  onPress: (subjectId: string, bookId: string) => void;
}): React.ReactElement {
  return (
    <ResultRow
      testID={`book-row-${item.id}`}
      icon="book-outline"
      title={item.title}
      subtitle={item.subjectName}
      subjectName={item.subjectName}
      onPress={() => onPress(item.subjectId, item.id)}
    />
  );
}

function TopicRow({
  item,
  onPress,
}: {
  item: TopicResult;
  onPress: (topicId: string) => void;
}): React.ReactElement {
  return (
    <ResultRow
      testID={`topic-row-${item.id}`}
      icon="list-outline"
      title={item.name}
      subtitle={`${item.bookTitle} - ${item.subjectName}`}
      subjectName={item.subjectName}
      onPress={() => onPress(item.id)}
    />
  );
}

function NoteRow({
  item,
  onPress,
}: {
  item: NoteResult;
  onPress: (topicId: string) => void;
}): React.ReactElement {
  return (
    <ResultRow
      testID={`note-row-${item.id}`}
      icon="document-text-outline"
      title={item.contentSnippet}
      subtitle={`${item.topicName} - ${item.subjectName} - ${formatSearchDate(
        item.createdAt,
      )}`}
      subjectName={item.subjectName}
      onPress={() => onPress(item.topicId)}
    />
  );
}

function SessionRow({
  item,
  onPress,
}: {
  item: SessionResult;
  onPress: (
    sessionId: string,
    subjectId: string,
    topicId: string | null,
  ) => void;
}): React.ReactElement {
  const { t } = useTranslation();
  const topicLabel = item.topicTitle ?? t('library.search.freeform');
  return (
    <ResultRow
      testID={`session-row-${item.sessionId}`}
      icon="chatbubble-ellipses-outline"
      title={item.snippet}
      subtitle={`${topicLabel} - ${item.subjectName} - ${formatSearchDate(
        item.occurredAt,
      )}`}
      subjectName={item.subjectName}
      onPress={() => onPress(item.sessionId, item.subjectId, item.topicId)}
    />
  );
}

function hasResults(
  data: LibrarySearchResult | undefined,
  enrichedSubjects: EnrichedSubjectResult[],
): data is LibrarySearchResult {
  return (
    !!data &&
    (enrichedSubjects.length > 0 ||
      data.books.length > 0 ||
      data.topics.length > 0 ||
      data.notes.length > 0 ||
      data.sessions.length > 0)
  );
}

export function LibrarySearchResults({
  data,
  isLoading: _isLoading,
  isError,
  query,
  enrichedSubjects,
  onSubjectPress,
  onBookPress,
  onTopicPress,
  onNotePress,
  onSessionPress,
  onClear,
  onRetry,
}: LibrarySearchResultsProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (isError) {
    return (
      <View
        style={{ paddingHorizontal: 16, paddingVertical: 12 }}
        testID="search-results-error"
      >
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
          {t('library.search.error')}
        </Text>
        <Pressable
          testID="search-results-retry"
          onPress={onRetry}
          accessibilityRole="button"
          style={{
            alignSelf: 'flex-start',
            backgroundColor: colors.surfaceElevated,
            borderRadius: 8,
            marginTop: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            {t('common.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!hasResults(data, enrichedSubjects)) {
    return (
      <View
        style={{ paddingHorizontal: 16, paddingVertical: 20 }}
        testID="library-search-empty"
      >
        <Text
          testID="search-results-empty"
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          {t('library.search.noResults', { query })}
        </Text>
        <Pressable
          testID="library-search-clear-results"
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('library.search.clear')}
          style={{
            alignSelf: 'center',
            backgroundColor: colors.surfaceElevated,
            borderRadius: 8,
            marginTop: 12,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 14,
              fontWeight: '700',
            }}
          >
            {t('library.search.clear')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View testID="library-search-results">
      {enrichedSubjects.length > 0 ? (
        <>
          <SectionHeader
            testID="search-section-subjects"
            label={t('library.search.sections.subjects')}
          />
          {enrichedSubjects.map((subject) => (
            <ShelfRow
              key={subject.id}
              testID={`search-subject-row-${subject.id}`}
              subjectId={subject.id}
              name={subject.name}
              bookCount={subject.bookCount}
              topicProgress={subject.topicProgress}
              reviewDueCount={subject.reviewDueCount}
              isFinished={subject.isFinished}
              status={
                subject.status ?? (subject.isPaused ? 'paused' : 'active')
              }
              onPress={onSubjectPress}
            />
          ))}
        </>
      ) : null}

      {data.books.length > 0 ? (
        <>
          <SectionHeader
            testID="search-section-books"
            label={t('library.search.sections.books')}
          />
          {data.books.map((book) => (
            <BookRow key={book.id} item={book} onPress={onBookPress} />
          ))}
        </>
      ) : null}

      {data.topics.length > 0 ? (
        <>
          <SectionHeader
            testID="search-section-topics"
            label={t('library.search.sections.topics')}
          />
          {data.topics.map((topic) => (
            <TopicRow key={topic.id} item={topic} onPress={onTopicPress} />
          ))}
        </>
      ) : null}

      {data.notes.length > 0 ? (
        <>
          <SectionHeader
            testID="search-section-notes"
            label={t('library.search.sections.notes')}
          />
          {data.notes.map((note) => (
            <NoteRow key={note.id} item={note} onPress={onNotePress} />
          ))}
        </>
      ) : null}

      {data.sessions.length > 0 ? (
        <>
          <SectionHeader
            testID="search-section-sessions"
            label={t('library.search.sections.sessions')}
          />
          {data.sessions.map((session) => (
            <SessionRow
              key={session.sessionId}
              item={session}
              onPress={onSessionPress}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}
