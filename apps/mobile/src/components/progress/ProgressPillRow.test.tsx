import { render, fireEvent } from '@testing-library/react-native';
import type { Profile } from '@eduagent/schemas';
import { ProgressPillRow } from './ProgressPillRow';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

const child1: Pick<Profile, 'id' | 'displayName'> = {
  id: 'child-1',
  displayName: 'Alice',
};
const child2: Pick<Profile, 'id' | 'displayName'> = {
  id: 'child-2',
  displayName: 'Bob',
};

const baseProps = {
  childrenProfiles: [child1, child2] as unknown as ReadonlyArray<Profile>,
  selectedProfileId: 'child-1',
  ownProfileId: 'parent-1',
  onSelect: jest.fn(),
};

describe('ProgressPillRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a pill for each child plus the own-profile pill', () => {
    const { getByText } = render(<ProgressPillRow {...baseProps} />);
    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();
    expect(getByText('Mine')).toBeTruthy();
  });

  it('fires onSelect with the correct profileId when a child pill is pressed', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ProgressPillRow {...baseProps} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('progress-pill-child-2'));
    expect(onSelect).toHaveBeenCalledWith('child-2');
  });

  it('fires onSelect with ownProfileId when the own pill is pressed', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <ProgressPillRow {...baseProps} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('progress-pill-parent-1'));
    expect(onSelect).toHaveBeenCalledWith('parent-1');
  });

  it('marks the selected pill with accessibilityState.selected', () => {
    const { getByTestId } = render(<ProgressPillRow {...baseProps} />);
    expect(
      getByTestId('progress-pill-child-1').props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      getByTestId('progress-pill-child-2').props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it('returns null when ownProfileId is undefined', () => {
    const { toJSON } = render(
      <ProgressPillRow {...baseProps} ownProfileId={undefined} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('returns null when childrenProfiles is empty', () => {
    const { toJSON } = render(
      <ProgressPillRow {...baseProps} childrenProfiles={[]} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders the container with the correct testID', () => {
    const { getByTestId } = render(<ProgressPillRow {...baseProps} />);
    expect(getByTestId('progress-parent-pill-row')).toBeTruthy();
  });
});
