import { render } from '@testing-library/react-native';

import { SessionTopicHeader } from './SessionTopicHeader';

describe('SessionTopicHeader', () => {
  it('renders the topic header and change-topic affordance', () => {
    const { getByTestId } = render(
      <SessionTopicHeader
        topicName="Photosynthesis"
        onChangeTopic={jest.fn()}
      />,
    );
    expect(getByTestId('session-topic-header')).toBeTruthy();
    expect(getByTestId('session-topic-header-change')).toBeTruthy();
  });

  it('[B-714] Change-topic Pressable meets WCAG 44px effective tap target via hitSlop', () => {
    const { getByTestId } = render(
      <SessionTopicHeader
        topicName="Photosynthesis"
        onChangeTopic={jest.fn()}
      />,
    );
    const pressable = getByTestId('session-topic-header-change');
    // Visual size is min-h-[36px]; hitSlop must add at least 4px top+bottom so
    // the effective tap target reaches 44px (WCAG 2.1 minimum). Without
    // hitSlop, mis-tap rates on small phones (Galaxy S10e 5.8") spike.
    expect(pressable.props.className).toContain('min-h-[36px]');
    expect(pressable.props.hitSlop).toEqual({ top: 4, bottom: 4 });
  });
});
