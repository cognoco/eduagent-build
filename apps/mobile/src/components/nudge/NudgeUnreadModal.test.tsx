import { fireEvent, render, screen } from '@testing-library/react-native';

import { NudgeUnreadModal } from './NudgeUnreadModal';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

// NudgeUnreadModal is purely presentational: it receives nudges and onDismiss
// as props. The caller (NudgeBanner) is responsible for calling
// markAllRead.mutate() inside its onDismiss handler. The test below therefore
// asserts that onDismiss fires on button press — which in production IS the
// markAllRead.mutate() call path. See NudgeBanner.tsx `closeModal`.

const NUDGE_A = {
  id: 'nudge-1',
  fromProfileId: '00000000-0000-0000-0000-000000000001',
  toProfileId: '00000000-0000-0000-0000-000000000002',
  fromDisplayName: 'Dad',
  template: 'you_got_this' as const,
  createdAt: '2024-01-01T10:00:00.000Z',
  readAt: null,
};

const NUDGE_B = {
  id: 'nudge-2',
  fromProfileId: '00000000-0000-0000-0000-000000000003',
  toProfileId: '00000000-0000-0000-0000-000000000002',
  fromDisplayName: 'Mum',
  template: 'proud_of_you' as const,
  createdAt: '2024-01-01T11:00:00.000Z',
  readAt: null,
};

describe('NudgeUnreadModal', () => {
  it('renders the modal title', () => {
    render(<NudgeUnreadModal nudges={[NUDGE_A]} onDismiss={jest.fn()} />);

    // en.json nudge.banner.modalTitle = "New nudges"
    screen.getByText('New nudges');
  });

  it('renders the dismiss button', () => {
    render(<NudgeUnreadModal nudges={[NUDGE_A]} onDismiss={jest.fn()} />);

    screen.getByTestId('nudge-unread-dismiss');
    // en.json common.done = "Done"
    screen.getByText('Done');
  });

  it('renders the fromDisplayName of each nudge', () => {
    render(
      <NudgeUnreadModal nudges={[NUDGE_A, NUDGE_B]} onDismiss={jest.fn()} />,
    );

    screen.getByText('Dad');
    screen.getByText('Mum');
  });

  it('renders the localised template text for each nudge', () => {
    render(
      <NudgeUnreadModal nudges={[NUDGE_A, NUDGE_B]} onDismiss={jest.fn()} />,
    );

    // en.json nudge.templates.you_got_this = "You got this"
    screen.getByText('You got this');
    // en.json nudge.templates.proud_of_you = "Proud of you"
    screen.getByText('Proud of you');
  });

  it('pressing the dismiss button calls onDismiss exactly once — this is the markAllRead.mutate() path', () => {
    // NudgeBanner passes `closeModal` as onDismiss; closeModal calls
    // markAllRead.mutate() then setModalOpen(false). Asserting onDismiss fires
    // here verifies the side-effect path is reachable.
    const onDismiss = jest.fn();
    render(<NudgeUnreadModal nudges={[NUDGE_A]} onDismiss={onDismiss} />);

    fireEvent.press(screen.getByTestId('nudge-unread-dismiss'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders all four template types with correct localised text', () => {
    const allTemplateNudges = [
      { ...NUDGE_A, id: 'n1', template: 'you_got_this' as const },
      { ...NUDGE_A, id: 'n2', template: 'proud_of_you' as const },
      { ...NUDGE_A, id: 'n3', template: 'quick_session' as const },
      { ...NUDGE_A, id: 'n4', template: 'thinking_of_you' as const },
    ];

    render(
      <NudgeUnreadModal nudges={allTemplateNudges} onDismiss={jest.fn()} />,
    );

    screen.getByText('You got this');
    screen.getByText('Proud of you');
    // en.json nudge.templates.quick_session = "Want to do a quick session?"
    screen.getByText('Want to do a quick session?');
    // en.json nudge.templates.thinking_of_you = "Just thinking of you"
    screen.getByText('Just thinking of you');
  });

  it('renders an empty list without crashing when nudges is empty', () => {
    // NudgeBanner guards against showing the modal with zero nudges, but the
    // component itself should not throw when nudges is empty.
    render(<NudgeUnreadModal nudges={[]} onDismiss={jest.fn()} />);

    // Title and button still render
    screen.getByText('New nudges');
    screen.getByTestId('nudge-unread-dismiss');
  });

  it('does not call onDismiss until the button is pressed', () => {
    const onDismiss = jest.fn();
    render(<NudgeUnreadModal nudges={[NUDGE_A]} onDismiss={onDismiss} />);

    // No interaction
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
