import { fireEvent, render, screen } from '@testing-library/react-native';

import { SubjectHubManageSheet } from './SubjectHubManageSheet';

jest.mock('react-i18next' /* external i18n boundary */, () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const baseProps = {
  visible: true,
  subjectName: 'Spanish',
  isSaving: false,
  onClose: jest.fn(),
  onChangeStatus: jest.fn(),
};

describe('SubjectHubManageSheet', () => {
  it('offers pause + archive for an active subject (no resume/restore)', () => {
    const onChangeStatus = jest.fn();
    render(
      <SubjectHubManageSheet
        {...baseProps}
        status="active"
        onChangeStatus={onChangeStatus}
      />,
    );

    screen.getByTestId('subject-hub-pause');
    screen.getByTestId('subject-hub-archive');
    expect(screen.queryByTestId('subject-hub-resume')).toBeNull();
    expect(screen.queryByTestId('subject-hub-restore')).toBeNull();

    fireEvent.press(screen.getByTestId('subject-hub-archive'));
    expect(onChangeStatus).toHaveBeenCalledWith('archived');
  });

  it('offers resume + archive for a paused subject', () => {
    const onChangeStatus = jest.fn();
    render(
      <SubjectHubManageSheet
        {...baseProps}
        status="paused"
        onChangeStatus={onChangeStatus}
      />,
    );

    screen.getByTestId('subject-hub-resume');
    screen.getByTestId('subject-hub-archive');
    expect(screen.queryByTestId('subject-hub-pause')).toBeNull();

    fireEvent.press(screen.getByTestId('subject-hub-resume'));
    expect(onChangeStatus).toHaveBeenCalledWith('active');
  });

  it('offers restore only for an archived subject (archive-first: no delete here)', () => {
    const onChangeStatus = jest.fn();
    render(
      <SubjectHubManageSheet
        {...baseProps}
        status="archived"
        onChangeStatus={onChangeStatus}
      />,
    );

    screen.getByTestId('subject-hub-restore');
    expect(screen.queryByTestId('subject-hub-pause')).toBeNull();
    expect(screen.queryByTestId('subject-hub-archive')).toBeNull();

    fireEvent.press(screen.getByTestId('subject-hub-restore'));
    expect(onChangeStatus).toHaveBeenCalledWith('active');
  });

  it('disables actions while a mutation is in flight', () => {
    render(<SubjectHubManageSheet {...baseProps} status="active" isSaving />);

    // Assert the disabled state directly — RNTL's fireEvent.press ignores the
    // `disabled` prop and would still invoke onChangeStatus, making "was not
    // called" impossible to assert. accessibilityState.disabled is the correct
    // assertion for this boundary.
    expect(
      screen.getByTestId('subject-hub-pause').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId('subject-hub-archive').props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  it('closes from the close affordance', () => {
    const onClose = jest.fn();
    render(
      <SubjectHubManageSheet
        {...baseProps}
        status="active"
        onClose={onClose}
      />,
    );

    fireEvent.press(screen.getByTestId('subject-hub-manage-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
