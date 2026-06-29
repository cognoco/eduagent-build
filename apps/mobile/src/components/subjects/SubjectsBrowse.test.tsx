import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectsBrowse } from './SubjectsBrowse';
import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'subjectsBrowse.title': 'Subjects',
        'subjectsBrowse.showEverything': 'Show me everything',
        'subjectsBrowse.searchPlaceholder': 'Search subjects',
        'subjectsBrowse.emptyTitle': 'No subjects yet',
        'subjectsBrowse.emptyMessage': 'Create a subject to get started.',
        'subjectsBrowse.createSubject': 'Create subject',
        'subjectsBrowse.subjectProgress': `${opts?.mastered} mastered · ${opts?.learning} learning · ${opts?.total} topics`,
        'subjectsBrowse.reviewsDue': `${opts?.count} due`,
        'subjectsBrowse.openSubject': 'Open subject',
      };
      return map[key] ?? key;
    },
  }),
}));

const ITEMS: SubjectIndexItem[] = [
  {
    subjectId: '550e8400-e29b-41d4-a716-446655440000',
    subjectName: 'Spanish',
    mastered: 2,
    learning: 3,
    total: 6,
    dueReviews: 1,
    books: [],
  },
  {
    subjectId: '660e8400-e29b-41d4-a716-446655440001',
    subjectName: 'Algebra',
    mastered: 1,
    learning: 1,
    total: 5,
    dueReviews: 0,
    books: [],
  },
];

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
      screen.getByTestId(`subjects-browse-row-${ITEMS[0]!.subjectId}`),
    );

    expect(onOpenSubject).toHaveBeenCalledWith(ITEMS[0]!.subjectId);
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
});
