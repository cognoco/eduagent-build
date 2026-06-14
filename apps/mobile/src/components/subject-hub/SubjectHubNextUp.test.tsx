import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectHubNextUp } from './SubjectHubNextUp';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SubjectHubNextUp', () => {
  it('renders a resume continuation with exactly one action', () => {
    const onPress = jest.fn();

    render(
      <SubjectHubNextUp
        canStudy
        nextUp={{
          kind: 'resume',
          topicId: 'topic-1',
          bookId: 'book-1',
          topicTitle: 'Cell division',
        }}
        onPressNextUp={onPress}
      />,
    );

    screen.getByText('subjectHub.nextUp.heading');
    screen.getByText('Cell division');
    screen.getByText('subjectHub.nextUp.resume');
    expect(screen.getAllByTestId('subject-hub-next-up-action')).toHaveLength(1);

    fireEvent.press(screen.getByTestId('subject-hub-next-up-action'));
    expect(onPress).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resume', topicId: 'topic-1' }),
    );
  });

  it('renders caught-up copy with no action for none', () => {
    render(
      <SubjectHubNextUp
        canStudy
        nextUp={{
          kind: 'none',
          topicId: null,
          bookId: null,
          topicTitle: null,
        }}
        onPressNextUp={jest.fn()}
      />,
    );

    screen.getByText('subjectHub.nextUp.allCaughtUp');
    expect(screen.queryByTestId('subject-hub-next-up-action')).toBeNull();
  });

  it('omits the action when the hub is structural-only', () => {
    render(
      <SubjectHubNextUp
        canStudy={false}
        nextUp={{
          kind: 'review-due',
          topicId: 'topic-1',
          bookId: 'book-1',
          topicTitle: 'Forces',
        }}
        onPressNextUp={jest.fn()}
      />,
    );

    screen.getByText('Forces');
    screen.getByText('subjectHub.nextUp.structuralOnly');
    expect(screen.queryByTestId('subject-hub-next-up-action')).toBeNull();
  });
});
