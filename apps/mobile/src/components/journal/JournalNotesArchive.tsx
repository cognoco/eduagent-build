import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';

import { ErrorFallback, TimeoutLoader } from '../common';
import { MagicPenAnimation } from '../common/MagicPenAnimation';
import { VoiceRecordButton } from '../session/VoiceRecordButton';
import { useAllNotes } from '../../hooks/use-notes';
import { useBookmarks } from '../../hooks/use-bookmarks';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { EmptyState, useSectionErrorActions } from './journal-shared';

// ---------------------------------------------------------------------------
// JournalNotesArchive (T6/EU-6) — the BROWSABLE cross-subject "everything I've
// saved" surface. One store, two origins (my notes vs saved-from-mentor), one
// cross-subject flat list rendered browse-first; an optional search line (with
// a transcription-only mic per spec §16) narrows the already-visible list.
// ---------------------------------------------------------------------------

type ArchiveItem = {
  id: string;
  authorship: 'mine' | 'mentor';
  content: string;
  subjectName: string | null;
  topicTitle: string | null;
};

export function JournalNotesArchive(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const notes = useAllNotes({ limit: 50 });
  const bookmarks = useBookmarks({ limit: 50 });
  const [filter, setFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState<'all' | 'mine' | 'mentor'>(
    'all',
  );

  // Transcription-only STT — the same on-device speech primitive the session
  // input bar uses. It dictates text into the search filter and nothing more:
  // no tone/emotion analysis (AI Act Art 5(1)(f) compliance invariant, §16).
  const { isListening, transcript, startListening, stopListening } =
    useSpeechRecognition();

  // Fold the recognized transcript into the search filter as it arrives. STT
  // replaces the typed filter wholesale; voice and text are mutually exclusive
  // entry modes, so anything typed by hand before switching to voice is discarded.
  useEffect(() => {
    if (transcript) setFilter(transcript);
  }, [transcript]);

  const noteItems = useMemo(
    () => notes.data?.pages.flatMap((page) => page.notes) ?? [],
    [notes.data],
  );
  const bookmarkItems = useMemo(
    () => bookmarks.data?.pages.flatMap((page) => page.bookmarks) ?? [],
    [bookmarks.data],
  );

  const items: ArchiveItem[] = useMemo(() => {
    const noteRows: ArchiveItem[] = noteItems.map((note) => ({
      id: `note:${note.id}`,
      // A note's origin is 'self' (the learner wrote it) or 'mentor'
      // (saved from a mentor explanation). Bookmarks are always a saved
      // mentor reply.
      authorship: note.origin === 'mentor' ? 'mentor' : 'mine',
      content: note.content,
      subjectName: note.subjectName ?? null,
      topicTitle: note.topicTitle ?? null,
    }));
    const bookmarkRows: ArchiveItem[] = bookmarkItems.map((bookmark) => ({
      id: `bookmark:${bookmark.id}`,
      authorship: 'mentor',
      content: bookmark.content,
      subjectName: bookmark.subjectName ?? null,
      topicTitle: bookmark.topicTitle ?? null,
    }));
    return [...noteRows, ...bookmarkRows];
  }, [noteItems, bookmarkItems]);

  // One-click authorship filter (All / My notes / Bookmarks) narrows the merged
  // archive before the free-text search runs, so a learner can isolate their
  // own notes or saved mentor replies without leaving the single list.
  const authorScopedItems =
    authorFilter === 'all'
      ? items
      : items.filter((item) =>
          authorFilter === 'mentor'
            ? item.authorship === 'mentor'
            : item.authorship === 'mine',
        );

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleItems =
    normalizedFilter.length === 0
      ? authorScopedItems
      : authorScopedItems.filter((item) =>
          [item.content, item.subjectName, item.topicTitle]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(normalizedFilter)),
        );

  const isLoading =
    (notes.isLoading && !notes.data) ||
    (bookmarks.isLoading && !bookmarks.data);
  const isError = notes.isError || bookmarks.isError;
  const errorActions = useSectionErrorActions(
    notes.error ?? bookmarks.error,
    () => {
      void notes.refetch();
      void bookmarks.refetch();
    },
  );

  if (isLoading) {
    return (
      <TimeoutLoader
        isLoading
        testID="journal-notes-loading"
        loadingLabel={t('common.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => {
            void notes.refetch();
            void bookmarks.refetch();
          },
          testID: 'journal-notes-timeout-retry',
        }}
      />
    );
  }

  if (isError && items.length === 0) {
    return (
      <ErrorFallback
        variant="card"
        testID="journal-notes-error"
        title={t('journal.notes.error')}
        primaryAction={
          errorActions.primary
            ? { ...errorActions.primary, testID: 'journal-notes-error-retry' }
            : {
                label: t('common.tryAgain'),
                onPress: () => {
                  void notes.refetch();
                  void bookmarks.refetch();
                },
                testID: 'journal-notes-error-retry',
              }
        }
        secondaryAction={errorActions.secondary}
      />
    );
  }

  return (
    <View testID="journal-notes-section" className="gap-3">
      {/* One-click authorship filter — All / My notes / Bookmarks. */}
      <View className="flex-row gap-2" testID="journal-notes-filter">
        {(['all', 'mine', 'mentor'] as const).map((key) => {
          const selected = authorFilter === key;
          const label =
            key === 'all'
              ? t('journal.notes.filterAll')
              : key === 'mine'
                ? t('journal.notes.filterMine')
                : t('journal.notes.filterMentor');
          return (
            <Pressable
              key={key}
              onPress={() => setAuthorFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              testID={`journal-notes-filter-${key}`}
              className={`min-h-[36px] justify-center rounded-full px-3 py-1.5 ${
                selected ? 'bg-primary' : 'bg-surface-elevated'
              }`}
            >
              <Text
                className={`text-caption font-semibold ${
                  selected ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Optional search/filter line — narrows the already-visible browse list.
          Carries a transcription-only mic (spec §16). */}
      <View
        className="flex-row items-center gap-2"
        testID="journal-notes-search"
      >
        <View className="flex-1 rounded-input border border-border bg-surface px-3">
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder={t('journal.notes.searchPlaceholder')}
            accessibilityLabel={t('journal.notes.searchPlaceholder')}
            className="min-h-[44px] text-body text-text-primary"
            testID="journal-notes-search-input"
          />
        </View>
        {/* VoiceRecordButton hardcodes its own testID; wrap it so the archive
            search line exposes the spec'd `journal-notes-mic` handle. The STT
            primitive is transcription-only (no tone/emotion API) — §16. */}
        <View testID="journal-notes-mic">
          <VoiceRecordButton
            isListening={isListening}
            onPress={() =>
              void (isListening ? stopListening() : startListening())
            }
          />
        </View>
      </View>

      {visibleItems.length === 0 ? (
        <EmptyState
          testID="journal-notes-empty"
          title={
            normalizedFilter.length > 0
              ? t('journal.notes.searchEmpty')
              : t('journal.notes.empty')
          }
          illustration={
            <MagicPenAnimation size={82} testID="journal-notes-empty-pen" />
          }
        />
      ) : (
        visibleItems.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            testID={`journal-note-${item.id}`}
            className="rounded-card border border-border bg-surface p-4"
            onPress={() =>
              router.push({
                pathname: '/(app)/my-notes/[kind]',
                params: {
                  kind: item.authorship === 'mentor' ? 'bookmarks' : 'notes',
                  returnTo: 'journal',
                },
              } as Href)
            }
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="flex-1 text-body-sm text-text-secondary"
                numberOfLines={1}
              >
                {[item.subjectName, item.topicTitle]
                  .filter(Boolean)
                  .join(' / ') || t('myNotes.unknownSubject')}
              </Text>
              <View
                className="rounded-full bg-surface-elevated px-3 py-1"
                testID={`journal-note-authorship-${item.authorship}`}
              >
                <Text className="text-caption font-semibold text-text-primary">
                  {item.authorship === 'mentor'
                    ? t('journal.notes.authorshipMentor')
                    : t('journal.notes.authorshipMine')}
                </Text>
              </View>
            </View>
            <Text
              className="mt-2 text-body text-text-primary"
              numberOfLines={3}
            >
              {item.content}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
