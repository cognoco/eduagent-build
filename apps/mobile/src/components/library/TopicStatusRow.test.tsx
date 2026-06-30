import { fireEvent, render } from '@testing-library/react-native';
import { TopicStatusRow } from './TopicStatusRow';

describe('TopicStatusRow', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    onPress.mockClear();
  });

  it('renders continue-now with session count and calls onPress', () => {
    const { getByTestId, getByText } = render(
      <TopicStatusRow
        state="continue-now"
        title="Linear Equations"
        chapterName="Grand Overview"
        sessionCount={4}
        topicId="topic-continue"
        onPress={onPress}
        testID="row-continue"
      />,
    );

    getByText('4 sessions');
    fireEvent.press(getByTestId('row-continue'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('topic-continue');
  });

  it('renders a started row with chapter and session count', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="started"
        title="Photosynthesis"
        chapterName="Green Factories"
        sessionCount={3}
        topicId="topic-photosynthesis"
        onPress={onPress}
      />,
    );

    getByText('Photosynthesis');
    getByText('Green Factories');
    getByText('3 sessions');
  });

  it('renders an up-next row', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="up-next"
        title="Cell Division"
        chapterName="Biology Basics"
        topicId="topic-cell-division"
        onPress={onPress}
        testID="row-up-next"
      />,
    );

    getByTestId('row-up-next');
  });

  it('renders the hero up-next variant', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="up-next"
        variant="hero"
        title="Cell Division"
        chapterName="Biology Basics"
        topicId="topic-cell-division-hero"
        onPress={onPress}
        testID="row-up-next-hero"
      />,
    );

    getByTestId('row-up-next-hero');
  });

  it('renders a done row with the chapter inline', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="done"
        title="Algebra Basics"
        chapterName="Chapter 1"
        topicId="topic-algebra"
        onPress={onPress}
      />,
    );

    getByText('Algebra Basics');
    getByText('Chapter 1');
  });

  it('uses singular session copy when sessionCount is 1', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="started"
        title="Topic"
        chapterName="Chapter"
        sessionCount={1}
        topicId="topic-singular"
        onPress={onPress}
      />,
    );

    getByText('1 session');
  });
});
