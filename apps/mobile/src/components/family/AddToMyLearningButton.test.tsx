import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { AddToMyLearningButton } from './AddToMyLearningButton';

const mockCloneFromChild = jest.fn();
const mockDismissToast = jest.fn();
let mockShowLearnThisToo = true;
let mockToast: unknown = null;

jest.mock(
  '../../hooks/use-clone-from-child' /* gc1-allow: component test isolates hook behavior; mutation lifecycle is covered by API/type tests */,
  () => ({
    useCloneFromChild: () => ({
      cloneFromChild: mockCloneFromChild,
      dismissToast: mockDismissToast,
      isCloning: false,
      isCloningFor: () => false,
      toast: mockToast,
      undoLastClone: jest.fn(),
    }),
  }),
);

jest.mock(
  '../../hooks/use-navigation-contract' /* gc1-allow: component test pins contract gate without mounting app providers */,
  () => ({
    useNavigationContract: () => ({
      gates: { showLearnThisToo: mockShowLearnThisToo },
    }),
  }),
);

jest.mock(
  '../../lib/profile' /* gc1-allow: component test only needs active profile id for the AsyncStorage key */,
  () => ({
    ...jest.requireActual('../../lib/profile'),
    useProfile: () => ({
      activeProfile: { id: 'adult-profile-id' },
    }),
  }),
);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

describe('AddToMyLearningButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShowLearnThisToo = true;
    mockToast = null;
  });

  it('hides when the navigation contract gate is closed', () => {
    mockShowLearnThisToo = false;

    render(
      <AddToMyLearningButton
        childProfileId="child-id"
        childDisplayName="Ava"
        subjectName="Science"
        topicId="topic-id"
        topicTitle="Cells"
        triggerPath="/recaps/recap-id"
      />,
    );

    expect(screen.queryByTestId('add-to-my-learning')).toBeNull();
  });

  it('[PARENT-14] renders the affordance and clones with the source context', async () => {
    render(
      <AddToMyLearningButton
        childProfileId="child-id"
        childDisplayName="Ava"
        subjectName="Science"
        topicId="topic-id"
        topicTitle="Cells"
        triggerPath="/recaps/recap-id"
      />,
    );

    screen.getByText('Add to my learning');
    screen.getByText('Private to your learning');

    await waitFor(() => {
      screen.getByTestId('add-to-my-learning-tip');
    });

    fireEvent.press(screen.getByTestId('add-to-my-learning-button'));

    expect(mockDismissToast).toHaveBeenCalledTimes(1);
    expect(mockCloneFromChild).toHaveBeenCalledWith({
      childDisplayName: 'Ava',
      childProfileId: 'child-id',
      subjectName: 'Science',
      topicId: 'topic-id',
      topicTitle: 'Cells',
      triggerPath: '/recaps/recap-id',
    });
  });
});
