import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectsBrowse } from './SubjectsBrowse';
import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'subjectsBrowse.title': 'Subjects',
        'subjectsBrowse.subtitle': 'Everything in one place',
        'subjectsBrowse.showEverything': 'Show me everything',
        'subjectsBrowse.searchPlaceholder': 'Search subjects',
        'subjectsBrowse.emptyTitle': 'No subjects yet',
        'subjectsBrowse.emptyMessage': 'Create a subject to get started.',
        'subjectsBrowse.createSubject': 'Create subject',
        'subjectsBrowse.subjectProgress': `${opts?.mastered} mastered · ${opts?.learning} learning · ${opts?.total} topics`,
        'subjectsBrowse.reviewsDue': `${opts?.count} due`,
        'subjectsBrowse.bookCount': `${opts?.count} books`,
        'subjectsBrowse.openSubject': 'Open subject',
        'subjectsBrowse.sectionActive': 'Active',
        'subjectsBrowse.sectionPaused': 'Paused',
        'subjectsBrowse.sectionArchived': 'Archived',
        'common.loading': 'Loading',
      };
      return map[key] ?? key;
    },
  }),
}));

function item(over: Partial<SubjectIndexItem>): SubjectIndexItem {
  return {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    subjectName: 'Spanish',
    status: 'active',
    urgencyBoostUntil: null,
    mastered: 2,
    learning: 3,
    total: 6,
    dueReviews: 1,
    books: [],
    ...over,
  };
}

const SPANISH = item({
  subjectId: '550e8400-e29b-41d4-a716-446655440000',
  subjectName: 'Spanish',
});
const ALGEBRA = item({
  subjectId: '660e8400-e29b-41d4-a716-446655440001',
  subjectName: 'Algebra',
  mastered: 1,
  learning: 1,
  total: 5,
  dueReviews: 0,
});
const ITEMS: SubjectIndexItem[] = [SPANISH, ALGEBRA];

describe('SubjectsBrowse', () => {
  it('renders the full subject list before search and opens a subject row', () => {
    const onOpenSubject = jest.fn();
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={onOpenSubject}
        onCreateSubject={jest.fn()}
      />,
    );

    screen.getByText('Show me everything');
    screen.getByText('Spanish');
    screen.getByText('Algebra');
    screen.getByText('2 mastered · 3 learning · 6 topics');
    screen.getByText('1 due');

    fireEvent.press(
      screen.getByTestId(`subjects-browse-row-${SPANISH.subjectId}`),
    );

    expect(onOpenSubject).toHaveBeenCalledWith(SPANISH.subjectId);
  });

  it('filters by search and clearing search restores the full list', () => {
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByTestId('subjects-browse-search'), 'alg');

    screen.getByText('Algebra');
    expect(screen.queryByText('Spanish')).toBeNull();

    fireEvent.changeText(screen.getByTestId('subjects-browse-search'), '');

    screen.getByText('Spanish');
    screen.getByText('Algebra');
  });

  it('shows an add-subject affordance on the populated path and calls onCreateSubject', () => {
    const onCreateSubject = jest.fn();
    render(
      <SubjectsBrowse
        subjects={ITEMS}
        onOpenSubject={jest.fn()}
        onCreateSubject={onCreateSubject}
      />,
    );

    // Populated list still renders the rows...
    screen.getByText('Spanish');
    // ...AND the add-subject button is present (regression: WI-1119).
    fireEvent.press(screen.getByTestId('subjects-browse-create'));

    expect(onCreateSubject).toHaveBeenCalledTimes(1);
  });

  it('shows a create-subject affordance for an empty list', () => {
    const onCreateSubject = jest.fn();
    render(
      <SubjectsBrowse
        subjects={[]}
        onOpenSubject={jest.fn()}
        onCreateSubject={onCreateSubject}
      />,
    );

    screen.getByText('No subjects yet');
    fireEvent.press(screen.getByTestId('subjects-browse-create'));

    expect(onCreateSubject).toHaveBeenCalledTimes(1);
  });

  it('groups subjects into Active / Paused / Archived sections and omits empty groups', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'a-1',
            subjectName: 'Active One',
            status: 'active',
          }),
          item({
            subjectId: 'p-1',
            subjectName: 'Paused One',
            status: 'paused',
          }),
          item({
            subjectId: 'r-1',
            subjectName: 'Archived One',
            status: 'archived',
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    screen.getByTestId('subjects-browse-section-active');
    screen.getByTestId('subjects-browse-section-paused');
    screen.getByTestId('subjects-browse-section-archived');
    screen.getByText('Active One');
    screen.getByText('Paused One');
    screen.getByText('Archived One');
  });

  it('omits a status section when it has no subjects', () => {
    render(
      <SubjectsBrowse
        subjects={[item({ subjectId: 'a-1', status: 'active' })]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    screen.getByTestId('subjects-browse-section-active');
    expect(screen.queryByTestId('subjects-browse-section-paused')).toBeNull();
    expect(screen.queryByTestId('subjects-browse-section-archived')).toBeNull();
  });

  it('sorts non-expired urgency-boost subjects above non-urgent peers within a group', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'calm',
            subjectName: 'Calm',
            urgencyBoostUntil: null,
          }),
          item({
            subjectId: 'urgent',
            subjectName: 'Urgent',
            urgencyBoostUntil: '2999-01-01T00:00:00.000Z',
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    const rows = screen
      .getAllByTestId(/^subjects-browse-row-/)
      .map((node) => node.props.testID);
    expect(rows.indexOf('subjects-browse-row-urgent')).toBeLessThan(
      rows.indexOf('subjects-browse-row-calm'),
    );
  });

  it('does not reorder for an expired urgency boost', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'first',
            subjectName: 'First',
            urgencyBoostUntil: null,
          }),
          item({
            subjectId: 'expired',
            subjectName: 'Expired',
            urgencyBoostUntil: '2000-01-01T00:00:00.000Z',
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    const rows = screen
      .getAllByTestId(/^subjects-browse-row-/)
      .map((node) => node.props.testID);
    // Expired boost is treated as non-urgent → incoming order preserved.
    expect(rows.indexOf('subjects-browse-row-first')).toBeLessThan(
      rows.indexOf('subjects-browse-row-expired'),
    );
  });

  it('shows the book count for a subject row', () => {
    render(
      <SubjectsBrowse
        subjects={[
          item({
            subjectId: 'with-books',
            books: [
              { id: 'b1' },
              { id: 'b2' },
              { id: 'b3' },
            ] as unknown as SubjectIndexItem['books'],
          }),
        ]}
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    screen.getByText('3 books');
  });

  it('renders a shimmer skeleton (not the list) while loading', () => {
    render(
      <SubjectsBrowse
        subjects={[]}
        isLoading
        onOpenSubject={jest.fn()}
        onCreateSubject={jest.fn()}
      />,
    );

    screen.getByTestId('subjects-browse-skeleton');
    // The search box and the empty/create state are not shown during loading.
    expect(screen.queryByTestId('subjects-browse-search')).toBeNull();
    expect(screen.queryByTestId('subjects-browse-create')).toBeNull();
  });
});
