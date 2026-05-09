import { fireEvent, render, screen } from '@testing-library/react-native';
import type { LibrarySearchResult } from '@eduagent/schemas';
import type { ComponentProps } from 'react';

import {
  LibrarySearchResults,
  type EnrichedSubjectResult,
} from './LibrarySearchResults';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const SUBJECT_ID = 'a0000000-0000-4000-a000-000000000010';
const BOOK_ID = 'a0000000-0000-4000-a000-000000000020';
const TOPIC_ID = 'a0000000-0000-4000-a000-000000000030';
const NOTE_ID = 'a0000000-0000-4000-a000-000000000040';
const SESSION_ID = 'a0000000-0000-4000-a000-000000000050';

const DATA: LibrarySearchResult = {
  subjects: [{ id: SUBJECT_ID, name: 'Biology' }],
  books: [
    {
      id: BOOK_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Biology',
      title: 'Cell Biology',
    },
  ],
  topics: [
    {
      id: TOPIC_ID,
      bookId: BOOK_ID,
      bookTitle: 'Cell Biology',
      subjectId: SUBJECT_ID,
      subjectName: 'Biology',
      name: 'Mitosis',
    },
  ],
  notes: [
    {
      id: NOTE_ID,
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      topicName: 'Mitosis',
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Biology',
      contentSnippet: 'powerhouse of the cell',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  sessions: [
    {
      sessionId: SESSION_ID,
      topicId: TOPIC_ID,
      topicTitle: 'Mitosis',
      bookId: BOOK_ID,
      subjectId: SUBJECT_ID,
      subjectName: 'Biology',
      snippet: 'explored cells today',
      occurredAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const ENRICHED_SUBJECTS: EnrichedSubjectResult[] = [
  {
    id: SUBJECT_ID,
    name: 'Biology',
    bookCount: 1,
    topicProgress: '2/5',
    retentionStatus: 'strong',
    reviewDueCount: 0,
    isFinished: false,
    isPaused: false,
  },
];

function renderResults(
  overrides: Partial<ComponentProps<typeof LibrarySearchResults>> = {},
) {
  const props: ComponentProps<typeof LibrarySearchResults> = {
    data: DATA,
    isLoading: false,
    isError: false,
    query: 'cell',
    enrichedSubjects: ENRICHED_SUBJECTS,
    onSubjectPress: jest.fn(),
    onBookPress: jest.fn(),
    onTopicPress: jest.fn(),
    onNotePress: jest.fn(),
    onSessionPress: jest.fn(),
    onClear: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  render(<LibrarySearchResults {...props} />);
  return props;
}

describe('LibrarySearchResults', () => {
  it('renders all five result sections', () => {
    renderResults();

    screen.getByTestId('search-section-subjects');
    screen.getByText('Subjects');
    screen.getByTestId('search-section-books');
    screen.getByText('Books');
    screen.getByTestId('search-section-topics');
    screen.getByText('Topics');
    screen.getByTestId('search-section-notes');
    screen.getByText('Notes');
    screen.getByTestId('search-section-sessions');
    screen.getByText('Sessions');
  });

  it('renders typed rows with distinguishable parent context', () => {
    renderResults();

    screen.getByTestId(`search-subject-row-${SUBJECT_ID}`);
    screen.getByText('Cell Biology');
    screen.getByText('Cell Biology - Biology');
    screen.getByText('powerhouse of the cell');
    expect(screen.getAllByText('Mitosis - Biology - Jan 1, 2026')).toHaveLength(
      2,
    );
    screen.getByText('explored cells today');
  });

  it('calls the correct handler for each result type', () => {
    const props = renderResults();

    fireEvent.press(screen.getByTestId(`search-subject-row-${SUBJECT_ID}`));
    expect(props.onSubjectPress).toHaveBeenCalledWith(SUBJECT_ID);

    fireEvent.press(screen.getByTestId(`book-row-${BOOK_ID}`));
    expect(props.onBookPress).toHaveBeenCalledWith(SUBJECT_ID, BOOK_ID);

    fireEvent.press(screen.getByTestId(`topic-row-${TOPIC_ID}`));
    expect(props.onTopicPress).toHaveBeenCalledWith(TOPIC_ID);

    fireEvent.press(screen.getByTestId(`note-row-${NOTE_ID}`));
    expect(props.onNotePress).toHaveBeenCalledWith(TOPIC_ID);

    fireEvent.press(screen.getByTestId(`session-row-${SESSION_ID}`));
    expect(props.onSessionPress).toHaveBeenCalledWith(
      SESSION_ID,
      SUBJECT_ID,
      TOPIC_ID,
    );
  });

  it('renders freeform for sessions without a topic title', () => {
    renderResults({
      enrichedSubjects: [],
      data: {
        ...DATA,
        subjects: [],
        books: [],
        topics: [],
        notes: [],
        sessions: [
          {
            ...DATA.sessions[0]!,
            topicId: null,
            topicTitle: null,
            bookId: null,
          },
        ],
      },
    });

    screen.getByText('Freeform - Biology - Jan 1, 2026');
  });

  it('renders the empty state', () => {
    renderResults({
      data: { subjects: [], books: [], topics: [], notes: [], sessions: [] },
      enrichedSubjects: [],
      query: 'zzzz',
    });

    screen.getByTestId('search-results-empty');
    screen.getByTestId('library-search-empty');
    screen.getByText('No results for "zzzz"');
  });

  it('clears search from the empty state', () => {
    const onClear = jest.fn();
    renderResults({
      data: { subjects: [], books: [], topics: [], notes: [], sessions: [] },
      enrichedSubjects: [],
      onClear,
    });

    fireEvent.press(screen.getByTestId('library-search-clear-results'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders the error state and retries', () => {
    const onRetry = jest.fn();
    renderResults({ isError: true, onRetry });

    screen.getByTestId('search-results-error');
    fireEvent.press(screen.getByTestId('search-results-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
